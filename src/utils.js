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
};
