// netlify/functions/update-classements.js
// Sunset Padel Club — V8 publication GitHub
// Variables Netlify à créer :
// ADMIN_SECRET, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
// Optionnel : DATA_DIR, HISTORY_MODE, HISTORY_TOP_N

const DEFAULT_DATA_DIR = "assets/data/classements";

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Méthode non autorisée" });
    }

    const body = JSON.parse(event.body || "{}");

    if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
      return json(401, { error: "Mot de passe admin incorrect" });
    }

    const cfg = getConfig();
    const results = [];

    for (const sex of ["hommes", "femmes"]) {
      if (!body[sex] || !Array.isArray(body[sex].data)) continue;

      const currentPayload = body[sex];
      const latestPath = `${cfg.dataDir}/classement_${sex}_latest.json`;
      const historyPath = `${cfg.dataDir}/historique_${sex}.json`;

      const previousLatest = await getJsonFile(cfg, latestPath);
      const enriched = enrichWithPrevious(currentPayload, previousLatest);

      const previousHistory = await getJsonFile(cfg, historyPath) || {};
      const updatedHistory = updateHistory(previousHistory, enriched, cfg.historyMode, cfg.historyTopN);

      await putJsonFile(cfg, latestPath, enriched, `Sunset classement ${sex} ${enriched.meta?.mois || ""}`);
      await putJsonFile(cfg, historyPath, updatedHistory, `Sunset historique ${sex} ${enriched.meta?.mois || ""}`);

      results.push({
        sexe: sex,
        latest: latestPath,
        historique: historyPath,
        total: enriched.data.length,
        compares: enriched.meta.total_compare || 0,
        nouveaux: enriched.meta.total_nouveaux || 0
      });
    }

    if (!results.length) {
      return json(400, { error: "Aucun classement reçu" });
    }

    return json(200, { ok: true, results });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || "Erreur serveur" });
  }
};

function getConfig() {
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Variable Netlify manquante : ${key}`);
  }

  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH,
    dataDir: process.env.DATA_DIR || DEFAULT_DATA_DIR,
    historyMode: process.env.HISTORY_MODE || "top",
    historyTopN: Number(process.env.HISTORY_TOP_N || 500)
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function playerId(player) {
  return normalize(player.id || `${player.nom || ""} ${player.prenom || ""}`);
}

function enrichWithPrevious(current, previous) {
  const payload = JSON.parse(JSON.stringify(current));
  const oldMap = new Map();

  if (previous && Array.isArray(previous.data)) {
    for (const p of previous.data) oldMap.set(playerId(p), p);
  }

  let compared = 0;
  let newCount = 0;

  for (const p of payload.data) {
    const old = oldMap.get(playerId(p));
    if (old) {
      compared++;
      p.rang_precedent = Number.isFinite(old.rang) ? old.rang : null;
      p.points_precedent = Number.isFinite(old.points) ? old.points : null;

      if (Number.isFinite(p.rang) && Number.isFinite(old.rang)) {
        p.evolution_auto = old.rang - p.rang;
        p.evolution = p.evolution_auto;
      }

      if (Number.isFinite(p.points) && Number.isFinite(old.points)) {
        p.variation_points = p.points - old.points;
      }

      if ((p.evolution_auto || 0) > 0) p.statut = "progression";
      else if ((p.evolution_auto || 0) < 0) p.statut = "recul";
      else p.statut = "stable";
    } else {
      newCount++;
      p.rang_precedent = null;
      p.points_precedent = null;
      p.variation_points = null;
      p.evolution_auto = null;
      p.statut = "nouveau";
    }
  }

  payload.meta = payload.meta || {};
  payload.meta.total_extrait = payload.data.length;
  payload.meta.total_compare = compared;
  payload.meta.total_nouveaux = newCount;
  payload.meta.comparaison_avec = previous?.meta?.mois || null;
  payload.meta.published_by = "Sunset Netlify Function V8";
  payload.meta.published_at = new Date().toISOString();

  return payload;
}

function updateHistory(history, payload, mode, topN) {
  const month = payload.meta?.mois || new Date().toISOString().slice(0, 7);
  const existingIds = new Set(Object.keys(history || {}));
  const data = [...payload.data].sort((a, b) => (a.rang || 999999999) - (b.rang || 999999999));

  let selected = data;
  if (mode === "none") return history || {};
  if (mode === "top") {
    selected = data.filter((p, index) => index < topN || existingIds.has(playerId(p)));
  }

  const next = history && typeof history === "object" && !Array.isArray(history) ? history : {};

  for (const p of selected) {
    const id = playerId(p);
    if (!id) continue;
    const arr = Array.isArray(next[id]) ? next[id] : [];
    const withoutSameMonth = arr.filter(item => item.mois !== month);
    withoutSameMonth.push({ mois: month, rang: p.rang ?? null, points: p.points ?? null });
    withoutSameMonth.sort((a, b) => String(a.mois).localeCompare(String(b.mois)));
    next[id] = withoutSameMonth.slice(-12);
  }

  return next;
}

async function githubRequest(cfg, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (res.status === 404) return null;

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  return data;
}

async function getFileMeta(cfg, path) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  return await githubRequest(cfg, url, { method: "GET" });
}

async function getJsonFile(cfg, path) {
  const meta = await getFileMeta(cfg, path);
  if (!meta || !meta.content) return null;
  const decoded = Buffer.from(meta.content, "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function putJsonFile(cfg, path, content, message) {
  const previous = await getFileMeta(cfg, path);
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponentPath(path)}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(content, null, 2), "utf8").toString("base64"),
    branch: cfg.branch
  };

  if (previous?.sha) body.sha = previous.sha;

  return await githubRequest(cfg, url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
