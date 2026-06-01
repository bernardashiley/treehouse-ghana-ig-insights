const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(relativePath, fallback = []) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[warn] Missing file: ${relativePath}`);
    return fallback;
  }

  try {
    const raw = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
    if (!raw.trim()) {
      console.warn(`[warn] Empty JSON file: ${relativePath}`);
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[warn] Could not parse ${relativePath}: ${error.message}`);
    return fallback;
  }
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function cleanText(value) {
  return str(value).replace(/\s+/g, " ").trim();
}

function dateParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { date: "", dayOfWeek: "", hour: "" };
  }
  return {
    date: date.toISOString().slice(0, 10),
    dayOfWeek: date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
    hour: date.getUTCHours(),
  };
}

function hashtagsFrom(record) {
  const tags = Array.isArray(record.hashtags) ? record.hashtags : [];
  const captionTags = [...str(record.caption).matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]);
  return [...new Set([...tags, ...captionTags].map((tag) => str(tag).replace(/^#/, "").toLowerCase()).filter(Boolean))];
}

function mentionsFrom(record) {
  const mentions = Array.isArray(record.mentions) ? record.mentions : [];
  const captionMentions = [...str(record.caption).matchAll(/@([\p{L}\p{N}_.]+)/gu)].map((m) => m[1]);
  return [...new Set([...mentions, ...captionMentions].map((mention) => str(mention).replace(/^@/, "").toLowerCase()).filter(Boolean))];
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(relativePath, rows, columns = null) {
  const fullPath = path.join(ROOT, relativePath);
  ensureDir(path.dirname(fullPath));
  const headers = columns || [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(fullPath, `${lines.join("\n")}\n`, "utf8");
}

function writeJson(relativePath, value) {
  const fullPath = path.join(ROOT, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relativePath, value) {
  const fullPath = path.join(ROOT, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, value, "utf8");
}

function mean(values) {
  const valid = values.map(num).filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function median(values) {
  const valid = values.map(num).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function pct(part, total) {
  return total ? round((part / total) * 100, 1) : 0;
}

function topN(rows, key, n = 10) {
  return [...rows].sort((a, b) => num(b[key]) - num(a[key])).slice(0, n);
}

// Data-driven, industry-agnostic "what to do next" for a comment-intent category.
// Keyed on the intent name so it works for any client (restaurant, film, retail...).
// `share` (0-100) lets the wording reflect how big the opportunity is.
function commentNextStep(intent, share = 0) {
  const i = String(intent || '').toLowerCase();
  const big = share >= 5 ? ' This is a sizeable share of your comments, so treat it as a priority.' : '';
  if (/book|reservation|collab|enquir|work with|hire/.test(i))
    return `Highest-value signal: people trying to engage you commercially. Add a one-tap "work with me / book" link in the bio and a saved reply with rates/availability so these never get lost in DMs.${big}`;
  if (/project|release|watch|launch|premiere|drop/.test(i))
    return `Demand for your next release. Put the date and the watch/buy link in every related caption and a pinned "What's out now" Highlight, so interest converts the moment it appears.${big}`;
  if (/cast|talent|audition|feature|join/.test(i))
    return `People want to take part. Publish one clear submission route (link in bio / form) so you capture this interest instead of fielding it ad hoc.${big}`;
  if (/ambien|romanc|romantic|vibe|decor|aesthetic|atmospher|beautiful|gorgeous|date.?night/.test(i))
    return `People are drawn to the look and feel, not a specific question. Lead with this in your visuals, reshare the strongest examples as social proof, and pair the aspiration with one concrete next step (visit / book / watch).${big}`;
  if (/location|event|where|venue|address|ticket|directions|parking|opening|hours|when is/.test(i))
    return `Logistics questions. Pin the address, date or ticket link in captions and a "Find Us / Events" Highlight so the answer is always one tap away.${big}`;
  if (/menu|food|price|cost|value/.test(i))
    return `Product/price curiosity. Answer it proactively with a monthly menu/price carousel and a pinned FAQ, so buyers don't have to ask.${big}`;
  if (/service|complaint|issue|wait/.test(i))
    return `Operational feedback. Route these to a person, respond fast and privately, and track resolution time, because visible unanswered complaints cost trust.`;
  if (/praise|hype|love|congrat|support/.test(i))
    return `Warm sentiment rather than direct intent. Reshare the best as social proof (stories/highlights) and end those captions with one explicit next step to turn affection into action.`;
  return `Mostly low-intent reactions. The opportunity is to convert warmth into action: end captions with a single, specific call to action and measure whether the next-step comments rise.`;
}

// ── Canonical dataset helpers (shared by analyse.js and advanced_analysis.js) ──
// Both engines MUST derive their working dataset the same way so Part I and
// Part II of the report can never disagree on record counts.

// Floor scraper artefacts (Apify returns -1 for some private/hidden metrics) to 0
// for computation. Returns the cleaned number plus a missing flag so display code
// can render "NA" instead of a misleading 0 or -1.
function cleanMetric(value) {
  const n = num(value);
  const missing = !Number.isFinite(Number(value)) || n < 0;
  return { value: missing ? 0 : n, missing };
}

// Floored numeric value only (negatives -> 0). Use for any arithmetic on metrics.
function metricNum(value) {
  return cleanMetric(value).value;
}

// Deduplicate by shortcode: the posts and reels scrapes overlap, so the same item
// can appear twice with different content_type labels. Keep the row with the
// highest engagement_score (most complete scrape). Falls back to id, then a
// unique token, so nothing is silently dropped when a shortcode is absent.
function dedupeByShortcode(rows) {
  const seen = new Map();
  let i = 0;
  for (const r of rows) {
    const key = (r.shortcode && String(r.shortcode)) || (r.id && `id:${r.id}`) || `row:${i++}`;
    const existing = seen.get(key);
    if (!existing || metricNum(r.engagement_score) > metricNum(existing.engagement_score)) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

// Split a deduplicated set into owned vs third-party by owner_username against the
// configured handle (case-insensitive). If the handle is missing or matches no
// rows, fall back to the most frequent owner so the split never collapses to empty.
function splitOwned(rows, handle) {
  let h = String(handle || '').toLowerCase();
  const counts = {};
  for (const r of rows) {
    const u = String(r.owner_username || '').toLowerCase();
    counts[u] = (counts[u] || 0) + 1;
  }
  if (!h || !(h in counts)) {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) h = top[0];
  }
  const owned = rows.filter(r => String(r.owner_username || '').toLowerCase() === h);
  const thirdParty = rows.filter(r => String(r.owner_username || '').toLowerCase() !== h);
  return { owned, thirdParty, ownerHandle: h };
}

module.exports = {
  ROOT,
  ensureDir,
  readJson,
  asArray,
  num,
  str,
  cleanText,
  dateParts,
  hashtagsFrom,
  mentionsFrom,
  writeCsv,
  writeJson,
  writeText,
  mean,
  median,
  round,
  pct,
  topN,
  commentNextStep,
  cleanMetric,
  metricNum,
  dedupeByShortcode,
  splitOwned,
};
