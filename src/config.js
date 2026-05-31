'use strict';
/**
 * Central config loader. Every script reads client + analysis settings from here.
 * To run the pipeline for a new client, edit config/client.config.json and
 * config/pillar_rules.json — no source code changes required.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadJson(rel, required = true) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    if (required) throw new Error(`Missing config file: ${rel}. Run "npm run init" to scaffold a client.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^﻿/, ''));
}

// ── Defaults (used if a key is absent so older configs keep working) ──────────
const DEFAULTS = {
  scrape:   { posts_limit: 300, reels_limit: 150, mentions_limit: 150, months_back: 18, comments_top_n: 25, comments_per_post: 50 },
  analysis: { mc_seed: 20260530, mc_iterations: 10000, bootstrap_iterations: 5000, alpha: 0.05, bonferroni_tests: 6 },
  brand:    { primary_hex: '1B3A2D', accent_hex: 'C9A84C', mid_hex: '2D6A4F', light_hex: 'D8F3DC', blue_hex: '2E86AB', purple_hex: '7B2D8B', grey_hex: '4B5563', rule_hex: 'D1D5DB' },
};

function deepDefault(target, defaults) {
  const out = { ...defaults, ...(target || {}) };
  for (const k of Object.keys(defaults)) {
    if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      out[k] = { ...defaults[k], ...((target && target[k]) || {}) };
    }
  }
  return out;
}

function loadConfig() {
  const client = loadJson('config/client.config.json');
  const cfg = deepDefault(client, DEFAULTS);
  // file-slug prefix for raw data (e.g. "treehouse" -> treehouse_posts_full.json)
  cfg.client.slug = cfg.client.data_prefix || cfg.client.short_name || cfg.client.handle || 'client';
  if (cfg.report && cfg.report.date === 'auto') {
    cfg.report.date = new Date().toISOString().slice(0, 10);
  }
  return cfg;
}

function loadRules() {
  const rules = loadJson('config/pillar_rules.json');
  return {
    pillars:  rules.pillars.map(p => [p.name, p.keywords]),
    intents:  rules.comment_intents.map(p => [p.name, p.keywords]),
  };
}

module.exports = { ROOT, loadConfig, loadRules };
