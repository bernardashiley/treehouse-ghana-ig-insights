'use strict';
/**
 * Build the Apify "comments" actor input from the top-performing posts.
 * Config-aware (reads data_prefix + comment limits from client.config.json),
 * pure Node so it runs anywhere the rest of the pipeline does.
 *
 *   node scripts/make_comments_input.js
 *
 * Writes:
 *   data/processed/top_post_urls.txt
 *   inputs/comments_top_posts.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'client.config.json'), 'utf8').replace(/^﻿/, ''));
const C = cfg.client, S = cfg.scrape || {};
const prefix = C.data_prefix || C.short_name || C.handle || 'client';
const topN = S.comments_top_n || 25;
const perPost = S.comments_per_post || 50;

const postsPath = path.join(ROOT, 'data', 'raw', `${prefix}_posts_full.json`);
if (!fs.existsSync(postsPath)) {
  console.error(`Missing posts data: ${postsPath}. Run the posts scrape first.`);
  process.exit(1);
}
let posts = JSON.parse(fs.readFileSync(postsPath, 'utf8').replace(/^﻿/, ''));
if (!Array.isArray(posts)) posts = [posts];

const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const score = p => n(p.commentsCount) * 5 + n(p.likesCount) + Math.max(n(p.videoViewCount), n(p.videoPlayCount)) * 0.01;

function urlOf(p) {
  for (const k of ['url', 'postUrl']) {
    const v = p[k];
    if (typeof v === 'string' && v.includes('instagram.com')) {
      const clean = v.split('?')[0];
      if (clean.includes('/p/') || clean.includes('/reel/')) return clean;
    }
  }
  const sc = p.shortCode || p.shortcode;
  if (sc) {
    const t = String(p.type || p.productType || '').toLowerCase();
    return `https://www.instagram.com/${t.includes('reel') ? 'reel' : 'p'}/${sc}/`;
  }
  return null;
}

const ranked = [...posts].sort((a, b) => score(b) - score(a));
const urls = [];
const seen = new Set();
for (const p of ranked) {
  const u = urlOf(p);
  if (u && !seen.has(u)) { seen.add(u); urls.push(u); }
  if (urls.length >= topN) break;
}
if (!urls.length) { console.error('No usable post/reel URLs found.'); process.exit(1); }

fs.mkdirSync(path.join(ROOT, 'data', 'processed'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'inputs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'processed', 'top_post_urls.txt'), urls.join('\n') + '\n');
fs.writeFileSync(
  path.join(ROOT, 'inputs', 'comments_top_posts.json'),
  JSON.stringify({ resultsType: 'comments', directUrls: urls, resultsLimit: perPost }, null, 2) + '\n'
);

console.log(`Selected ${urls.length} top posts (of ${posts.length}) for comment scraping.`);
console.log(`Wrote inputs/comments_top_posts.json (resultsLimit=${perPost} per post).`);
urls.slice(0, 5).forEach(u => console.log('  ' + u));
