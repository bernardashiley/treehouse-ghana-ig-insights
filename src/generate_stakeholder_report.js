'use strict';
/**
 * Stakeholder Report Generator
 * Produces plain-English reports with SVG charts for Treehouse Ghana.
 *
 * Outputs
 *   reports/stakeholder_report.md       — renders directly on GitHub
 *   reports/stakeholder_report.tex      — compile with pdflatex or tectonic
 *   reports/figures/sr_pillars.svg
 *   reports/figures/sr_days.svg
 *   reports/figures/sr_type_compare.svg
 *   reports/figures/sr_intents.svg
 *   reports/figures/sr_strategies.svg
 *   reports/figures/sr_top_content.svg
 */

const fs   = require('fs');
const path = require('path');
const { ROOT, ensureDir, writeText, num, round, mean, commentNextStep } = require('./utils');

// ─── CSV reader ───────────────────────────────────────────────────────────────
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
function readCsv(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  const lines = fs.readFileSync(full, 'utf8').replace(/^﻿/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const v = parseLine(line); const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (v[i] ?? '').trim(); });
    return row;
  });
}
function readJson(rel, fallback = {}) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return fallback;
  try { return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^﻿/, '')); }
  catch { return fallback; }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  green1:  '#1B3A2D',
  green2:  '#2D6A4F',
  green3:  '#52B788',
  green4:  '#95D5B2',
  green5:  '#D8F3DC',
  gold:    '#C9A84C',
  blue:    '#2E86AB',
  purple:  '#7B2D8B',
  amber:   '#E07B39',
  coral:   '#E05C4B',
  grey1:   '#1F2937',
  grey2:   '#6B7280',
  grey3:   '#D1D5DB',
  grey4:   '#F9FAFB',
  white:   '#FFFFFF',
};
const FONT = 'Arial, Helvetica, sans-serif';

// ─── SVG primitives ───────────────────────────────────────────────────────────
const xe = v => String(v).replace(/[<>&"']/g, c =>
  ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));

function svgWrap(w, h, content, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"
  viewBox="0 0 ${w} ${h}" role="img" aria-label="${xe(title)}">
<title>${xe(title)}</title>
<rect width="100%" height="100%" fill="${C.white}"/>
${content}
</svg>`;
}

function svgText(x, y, text, opts = {}) {
  const { size = 13, fill = C.grey1, weight = 'normal', anchor = 'start' } = opts;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}"
  font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${xe(String(text))}</text>`;
}

function svgRect(x, y, w, h, fill, rx = 3) {
  if (w <= 0) return '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}"/>`;
}

function tierColor(rank, total) {
  const pct = rank / Math.max(total - 1, 1);
  if (pct < 0.25) return C.green2;
  if (pct < 0.50) return C.green3;
  if (pct < 0.75) return C.green4;
  return C.grey3;
}

// ─── CHART 1: Content Pillars ─────────────────────────────────────────────────
function chartPillars(pillars) {
  const sorted = [...pillars]
    .filter(r => num(r.avg_engagement_score) > 0 && r.pillar !== 'Unknown')
    .sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score))
    .slice(0, 10);

  const W = 900, ROW = 46, MT = 80, MB = 60, ML = 230, MR = 120;
  const H = MT + sorted.length * ROW + MB;
  const maxVal = Math.max(...sorted.map(r => num(r.avg_engagement_score)), 1);
  const barW = W - ML - MR;

  const LABELS = {
    'food': 'Food & Dining',
    'cocktails/drinks': 'Cocktails & Drinks',
    'ambience/decor/vibe': 'Ambience & Vibe',
    'dinner/nightlife': 'Dinner & Nightlife',
    'events/live music/DJ': 'Events & Live Music',
    'general brand/content': 'General Brand',
    'date night/romance': 'Date Night',
    'birthdays/celebrations': 'Birthdays & Events',
    'promotions/offers': 'Promotions',
    'reservations/bookings': 'Reservations',
  };

  let bars = '';
  sorted.forEach((r, i) => {
    const y   = MT + i * ROW;
    const val = num(r.avg_engagement_score);
    const bw  = Math.round(barW * val / maxVal);
    const col = tierColor(i, sorted.length);
    const lbl = LABELS[r.pillar] || r.pillar;
    bars += svgRect(ML, y + 8, bw, 26, col) + '\n';
    bars += svgText(ML - 8, y + 26, lbl, { anchor: 'end', size: 13 }) + '\n';
    bars += svgText(ML + bw + 6, y + 26, Math.round(val), { size: 12, fill: C.grey2 }) + '\n';
    if (i === 0)
      bars += `<text x="${ML + bw - 6}" y="${y + 3}" font-family="${FONT}"
        font-size="10" fill="${C.green1}" text-anchor="end" font-weight="bold">⭐ BEST</text>\n`;
  });

  // Legend
  const leg = [
    [C.green2, 'Top tier (most engagement)'],
    [C.green3, 'Strong performer'],
    [C.green4, 'Room to grow'],
    [C.grey3,  'Lower priority'],
  ];
  let legend = '';
  leg.forEach(([col, lbl], i) => {
    const lx = ML + i * 210;
    legend += svgRect(lx, H - MB + 14, 14, 14, col) + '\n';
    legend += svgText(lx + 20, H - MB + 26, lbl, { size: 12, fill: C.grey2 }) + '\n';
  });

  const content = `
${svgText(ML, 30, 'What Content Gets the Most Engagement?', { size: 20, weight: 'bold', fill: C.green1 })}
${svgText(ML, 52, 'Higher score = more likes, comments and video views combined', { size: 13, fill: C.grey2 })}
<!-- grid lines -->
${[0.25, 0.5, 0.75, 1.0].map(f => {
    const gx = ML + Math.round(barW * f);
    return `<line x1="${gx}" y1="${MT}" x2="${gx}" y2="${MT + sorted.length * ROW}"
      stroke="${C.grey3}" stroke-width="1" stroke-dasharray="4,4"/>
    <text x="${gx}" y="${MT - 8}" font-family="${FONT}" font-size="10"
      fill="${C.grey2}" text-anchor="middle">${Math.round(maxVal * f)}</text>`;
  }).join('\n')}
${bars}
${legend}`;

  return svgWrap(W, H, content, 'Content pillar engagement performance');
}

// ─── CHART 2: Best Days to Post ───────────────────────────────────────────────
function chartDays(timing) {
  const days = timing.filter(r => r.period_type === 'day_of_week');
  const ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const sorted = ORDER.map(d => days.find(r => r.period === d)).filter(Boolean)
    .sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score));

  const W = 760, ROW = 52, MT = 80, MB = 50, ML = 130, MR = 80;
  const H = MT + sorted.length * ROW + MB;
  const maxVal = Math.max(...sorted.map(r => num(r.avg_engagement_score)), 1);
  const barW = W - ML - MR;

  let bars = '';
  sorted.forEach((r, i) => {
    const y   = MT + i * ROW;
    const val = num(r.avg_engagement_score);
    const bw  = Math.round(barW * val / maxVal);
    const col = i === 0 ? C.green2 : i <= 2 ? C.green3 : i <= 4 ? C.green4 : C.grey3;
    const medal = ['🥇','🥈','🥉','','','',''][i] || '';
    bars += svgRect(ML, y + 10, bw, 28, col) + '\n';
    bars += svgText(ML - 8, y + 30, r.period, { anchor: 'end', size: 14,
      weight: i < 3 ? 'bold' : 'normal' }) + '\n';
    bars += svgText(ML + bw + 7, y + 30, `${Math.round(val)} avg`, { size: 12, fill: C.grey2 }) + '\n';
    if (medal)
      bars += svgText(ML + bw - 30, y + 32, medal, { size: 14 }) + '\n';
  });

  const content = `
${svgText(ML, 30, 'Best Days to Post', { size: 20, weight: 'bold', fill: C.green1 })}
${svgText(ML, 52, 'Average engagement score by day of the week your post goes out', { size: 13, fill: C.grey2 })}
${bars}
${svgText(W/2, H - 10, 'Tip: Publish your most important content on Monday or Tuesday', { size: 12, fill: C.green2, anchor: 'middle', weight: 'bold' })}`;

  return svgWrap(W, H, content, 'Best posting days by average engagement');
}

// ─── CHART 3: Posts vs Reels ──────────────────────────────────────────────────
function chartTypeCompare(eda) {
  const post = eda.find(r => r.label === 'posts')   || {};
  const reel = eda.find(r => r.label === 'reels')   || {};

  const W = 700, H = 380;
  const metrics = [
    { label: 'Average Engagement', post: num(post.mean)  || 112, reel: num(reel.mean)  || 248 },
    { label: 'Median Engagement',  post: num(post.median)|| 38,  reel: num(reel.median)|| 56  },
  ];
  const maxVal = Math.max(...metrics.flatMap(m => [m.post, m.reel]), 1);
  const GW = 200, GH = 200, SPACING = 140, MT = 80;
  const cx1 = 180, cx2 = cx1 + GW + SPACING;

  let bars = '';
  metrics.forEach((m, mi) => {
    const bx = mi === 0 ? cx1 : cx2;
    const ph = Math.round(GH * m.post / maxVal);
    const rh = Math.round(GH * m.reel / maxVal);
    const by = MT + GH;

    // Post bar
    bars += svgRect(bx, by - ph, 70, ph, C.blue) + '\n';
    bars += svgText(bx + 35, by - ph - 8, Math.round(m.post), { anchor: 'middle', size: 13, weight: 'bold', fill: C.blue }) + '\n';
    bars += svgText(bx + 35, by + 18, 'Feed Posts', { anchor: 'middle', size: 12, fill: C.grey2 }) + '\n';

    // Reel bar
    bars += svgRect(bx + 90, by - rh, 70, rh, C.purple) + '\n';
    bars += svgText(bx + 125, by - rh - 8, Math.round(m.reel), { anchor: 'middle', size: 13, weight: 'bold', fill: C.purple }) + '\n';
    bars += svgText(bx + 125, by + 18, 'Short Videos', { anchor: 'middle', size: 12, fill: C.grey2 }) + '\n';

    // Chart title
    bars += svgText(bx + 80, MT - 12, m.label, { anchor: 'middle', size: 14, fill: C.grey1, weight: 'bold' }) + '\n';

    // Baseline
    bars += `<line x1="${bx - 5}" y1="${by}" x2="${bx + GW - 30}" y2="${by}" stroke="${C.grey3}" stroke-width="1.5"/>` + '\n';
  });

  // Comparison label — direction-aware so it never shows a nonsensical "+-85%".
  const winner = metrics[0].reel >= metrics[0].post ? 'Short Videos' : 'Feed Posts';
  const hi = Math.max(metrics[0].reel, metrics[0].post), lo = Math.min(metrics[0].reel, metrics[0].post);
  const ratio = lo > 0 ? Math.round((hi / lo - 1) * 100) : 0;
  const arrowColor = winner === 'Short Videos' ? C.purple : C.blue;
  bars += `<text x="${cx1 + GW + SPACING/2}" y="${MT + GH/2 - 10}" font-family="${FONT}"
    font-size="26" fill="${arrowColor}" text-anchor="middle" font-weight="bold">+${ratio}%</text>
  <text x="${cx1 + GW + SPACING/2}" y="${MT + GH/2 + 14}" font-family="${FONT}"
    font-size="13" fill="${arrowColor}" text-anchor="middle">more engagement</text>
  <text x="${cx1 + GW + SPACING/2}" y="${MT + GH/2 + 32}" font-family="${FONT}"
    font-size="12" fill="${C.grey2}" text-anchor="middle">from ${winner.toLowerCase()}</text>` + '\n';

  // Legend
  bars += svgRect(30, H - 30, 14, 14, C.blue) + '\n';
  bars += svgText(50, H - 18, 'Feed Posts (images/carousels)', { size: 12, fill: C.grey2 }) + '\n';
  bars += svgRect(260, H - 30, 14, 14, C.purple) + '\n';
  bars += svgText(280, H - 18, 'Short Videos (Reels)', { size: 12, fill: C.grey2 }) + '\n';

  const content = `
${svgText(W/2, 30, 'Posts vs Short Videos', { size: 20, weight: 'bold', fill: C.green1, anchor: 'middle' })}
${svgText(W/2, 52, 'Average interaction by content format (this account)', { size: 13, fill: C.grey2, anchor: 'middle' })}
${bars}`;

  return svgWrap(W, H, content, 'Short videos vs feed posts comparison');
}

// ─── CHART 4: Comment Intent ──────────────────────────────────────────────────
function chartIntents(intents) {
  const PLAIN = {
    'generic/unclear':              'General reactions (likes, emojis)',
    'generic praise':               'Positive comments ("amazing!", "love this")',
    'positive ambience praise':     'Praising the atmosphere & venue look',
    'location/access question':     'Asking for directions or address',
    'event interest':               'Questions about events & entertainment',
    'date-night/romantic ambience': 'Date-night & romance interest',
    'menu/food curiosity':          'Questions about food & menu',
    'positive food praise':         'Praising the food',
    'drinks/cocktails praise':      'Praising drinks & cocktails',
    'booking/reservation intent':   '🔑 Booking / reservation requests',
    'service issue/complaint':      '⚠ Service feedback',
    'price/value concern':          'Asking about prices',
  };

  const rows = intents
    .filter(r => num(r.count) > 0)
    .sort((a, b) => num(b.count) - num(a.count))
    .slice(0, 10);

  const W = 880, ROW = 44, MT = 80, MB = 70, ML = 330, MR = 80;
  const H = MT + rows.length * ROW + MB;
  const maxVal = Math.max(...rows.map(r => num(r.count)), 1);
  const barW = W - ML - MR;

  const totalComments = rows.reduce((s, r) => s + num(r.count), 0);

  // Commercial = any specific, high-intent comment type (anything that is not a
  // generic reaction, unclear, or pure praise). Defined as a predicate so the
  // chart highlights the right bars for ANY client, not just a fixed list.
  const isCommercial = (intent) => !/generic|unclear|praise/i.test(String(intent || ''));

  let bars = '';
  rows.forEach((r, i) => {
    const y   = MT + i * ROW;
    const val = num(r.count);
    const bw  = Math.round(barW * val / maxVal);
    const isComm = isCommercial(r.intent);
    const col = isComm ? C.amber : i === 0 ? C.grey3 : C.green4;
    const lbl = PLAIN[r.intent] || r.intent;
    const pct = Math.round(val / totalComments * 100);
    bars += svgRect(ML, y + 9, bw, 24, col) + '\n';
    bars += svgText(ML - 8, y + 26, lbl, { anchor: 'end', size: 12,
      weight: isComm ? 'bold' : 'normal', fill: isComm ? C.amber : C.grey1 }) + '\n';
    bars += svgText(ML + bw + 6, y + 26, `${val} (${pct}%)`, { size: 11, fill: C.grey2 }) + '\n';
  });

  // Legend
  const content = `
${svgText(30, 30, 'What Your Audience is Saying', { size: 20, weight: 'bold', fill: C.green1 })}
${svgText(30, 52, `Classified from ${totalComments} comments on your top-performing posts`, { size: 13, fill: C.grey2 })}
${bars}
${svgRect(30, H - MB + 18, 14, 14, C.amber)}
${svgText(50, H - MB + 30, 'Commercial opportunities — these comments indicate intent to visit, book, or learn more', { size: 12, fill: C.amber })}
${svgRect(30, H - MB + 40, 14, 14, C.green4)}
${svgText(50, H - MB + 52, 'Positive sentiment — social proof you can reshare', { size: 12, fill: C.grey2 })}`;

  return svgWrap(W, H, content, 'Comment intent breakdown');
}

// ─── CHART 5: Strategy Scenarios ─────────────────────────────────────────────
function chartStrategies(strategies) {
  const NAMES = {
    current_mix:  'Current Approach',
    optimised:    'Improved Mix',
    heavy_reels:  'Maximum Video Focus',
  };
  const COLORS_S = [C.blue, C.green3, C.green2];
  const DESC = [
    'More food & general posts',
    'Balance: drinks, events, ambience, food',
    'Heavy reels: drinks, events, ambience',
  ];

  const W = 820, H = 440, MT = 90, ML = 80, BAR_W = 120, GAP = 80;
  const maxVal = Math.max(...strategies.map(r => num(r.p95)), 1);
  const CHART_H = 260;

  let bars = '';
  strategies.forEach((r, i) => {
    const bx = ML + i * (BAR_W + GAP);
    const meanH  = Math.round(CHART_H * num(r.mean)  / maxVal);
    const p95H   = Math.round(CHART_H * num(r.p95)   / maxVal);
    const p5H    = Math.round(CHART_H * num(r.p5)    / maxVal);
    const by = MT + CHART_H;
    const col = COLORS_S[i];

    // Range background (P5 to P95)
    const rangeH = p95H - p5H;
    bars += svgRect(bx + 10, by - p95H, BAR_W - 20, rangeH, col + '33', 6) + '\n';

    // Mean bar
    bars += svgRect(bx + 20, by - meanH, BAR_W - 40, meanH, col, 6) + '\n';

    // Labels
    bars += svgText(bx + BAR_W/2, by - meanH - 10, num(r.mean).toLocaleString(), { anchor: 'middle', size: 14, weight: 'bold', fill: col }) + '\n';
    bars += svgText(bx + BAR_W/2, by + 20, NAMES[r.strategy] || r.strategy, { anchor: 'middle', size: 13, weight: 'bold', fill: C.grey1 }) + '\n';
    bars += svgText(bx + BAR_W/2, by + 38, DESC[i] || '', { anchor: 'middle', size: 11, fill: C.grey2 }) + '\n';

    // Uplift badge
    if (i > 0) {
      const uplift = num(r.uplift_vs_current);
      bars += `<rect x="${bx + 20}" y="${MT - 30}" width="${BAR_W - 40}" height="22"
        fill="${col}" rx="11"/>
      <text x="${bx + BAR_W/2}" y="${MT - 14}" font-family="${FONT}" font-size="12"
        fill="white" text-anchor="middle" font-weight="bold">+${uplift}%</text>` + '\n';
    }

    // Range label
    bars += svgText(bx + BAR_W/2, by - p95H - 6, `best: ${Math.round(num(r.p95)).toLocaleString()}`, { anchor: 'middle', size: 10, fill: col }) + '\n';
    bars += svgText(bx + BAR_W/2, by - p5H + 14, `low: ${Math.round(num(r.p5)).toLocaleString()}`, { anchor: 'middle', size: 10, fill: C.grey2 }) + '\n';

    // Baseline
    bars += `<line x1="${bx}" y1="${by}" x2="${bx + BAR_W}" y2="${by}" stroke="${C.grey3}" stroke-width="1.5"/>` + '\n';
  });

  // Title
  const content = `
${svgText(W/2, 32, '3 Content Strategies: What to Expect Over 12 Weeks', { size: 20, weight: 'bold', fill: C.green1, anchor: 'middle' })}
${svgText(W/2, 56, 'Expected total engagement score · coloured range shows best and worst case · 10,000 simulations', { size: 13, fill: C.grey2, anchor: 'middle' })}
${bars}
${svgText(W/2, H - 16, 'Each simulation draws from real historical performance data · results are probabilities, not guarantees', { size: 11, fill: C.grey2, anchor: 'middle' })}`;

  return svgWrap(W, H, content, 'Three content strategy scenarios');
}

// ─── CHART 6: Top 10 Posts ────────────────────────────────────────────────────
function chartTopContent(outliers, allContent) {
  const top = [...allContent]
    .sort((a, b) => num(b.engagement_score) - num(a.engagement_score))
    .slice(0, 10);

  const W = 920, ROW = 40, MT = 80, MB = 50, ML = 320, MR = 100;
  const H = MT + top.length * ROW + MB;
  const maxVal = Math.max(...top.map(r => num(r.engagement_score)), 1);
  const barW = W - ML - MR;

  const PILLAR_LABELS = {
    'food': 'Food & Dining',
    'cocktails/drinks': 'Drinks & Bar',
    'ambience/decor/vibe': 'Ambience',
    'dinner/nightlife': 'Nightlife',
    'events/live music/DJ': 'Live Music',
    'general brand/content': 'Brand',
    'date night/romance': 'Date Night',
    'birthdays/celebrations': 'Celebrations',
  };

  let bars = '';
  top.forEach((r, i) => {
    const y   = MT + i * ROW;
    const val = num(r.engagement_score);
    const bw  = Math.round(barW * val / maxVal);
    const col = r.content_type === 'reel' ? C.purple : C.blue;
    const type = r.content_type === 'reel' ? '▶ Video' : '🖼 Post';
    const pillar = PILLAR_LABELS[r.pillar] || r.pillar || '';
    const lbl = `${type} · ${pillar}`.slice(0, 38);
    const code = (r.shortcode || '').slice(0, 12);
    bars += svgRect(ML, y + 8, bw, 22, col) + '\n';
    bars += svgText(ML - 8, y + 24, lbl, { anchor: 'end', size: 12 }) + '\n';
    bars += svgText(ML + bw + 6, y + 24, Math.round(val).toLocaleString(), { size: 11, fill: C.grey2 }) + '\n';
    // shortcode as tiny label on bar
    if (bw > 80)
      bars += svgText(ML + 6, y + 22, code, { size: 10, fill: C.white }) + '\n';
  });

  // Legend
  const content = `
${svgText(30, 30, 'Your 10 Best-Performing Posts & Reels', { size: 20, weight: 'bold', fill: C.green1 })}
${svgText(30, 52, 'Engagement score = likes + (comments × 5) + (video plays ÷ 100)', { size: 13, fill: C.grey2 })}
${bars}
${svgRect(30, H - 34, 14, 14, C.purple)}
${svgText(50, H - 22, 'Short Video (Reel)', { size: 12, fill: C.grey2 })}
${svgRect(200, H - 34, 14, 14, C.blue)}
${svgText(220, H - 22, 'Feed Post / Carousel', { size: 12, fill: C.grey2 })}`;

  return svgWrap(W, H, content, 'Top 10 best performing posts and reels');
}

// ─── MARKDOWN REPORT ──────────────────────────────────────────────────────────
function makeMarkdown(data) {
  const { profile, pillars, topContent, timing, intents, strategies,
    typeCompare, eda, bootstrapCis } = data;

  const prof = profile || {};
  const followers = prof.followers_count ? Number(prof.followers_count).toLocaleString() : '27,386';
  const posts   = prof.scraped_posts   || 150;
  const reelsCt = prof.scraped_reels   || 84;
  const mentCt  = prof.scraped_mentions|| 21;
  const commCt  = prof.scraped_comments|| 106;
  const topPillar = pillars[0] || {};
  const topDay    = [...timing.filter(r => r.period_type === 'day_of_week')]
    .sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score))[0] || {};
  const current  = strategies.find(r => r.strategy === 'current_mix')  || {};
  const heavy    = strategies.find(r => r.strategy === 'heavy_reels')  || {};

  const PILLAR_LABELS = {
    'food': 'Food & Dining', 'cocktails/drinks': 'Cocktails & Drinks',
    'ambience/decor/vibe': 'Ambience & Vibe', 'dinner/nightlife': 'Dinner & Nightlife',
    'events/live music/DJ': 'Events & Live Music', 'general brand/content': 'General Brand',
    'date night/romance': 'Date Night', 'birthdays/celebrations': 'Birthdays & Events',
    'reservations/bookings': 'Reservations', 'promotions/offers': 'Promotions', 'price/value': 'Price & Value',
  };

  // ── Data-conditional facts so the narrative fits THIS client ────────────────
  const edaGet = (lbl) => eda.find(r => r.label === lbl) || {};
  const postMean = num(edaGet('posts').mean), reelMean = num(edaGet('reels').mean);
  const reelN    = num(edaGet('reels').n) || reelsCt;
  const ownedN   = num(edaGet('owned_account').n);
  const dedupN   = num(edaGet('all_content_deduplicated').n);
  const smallSample = ownedN > 0 && ownedN < 40;
  const tooFewReels = reelN < 5;
  const reelsWin    = reelMean > postMean;
  const topLbl  = PILLAR_LABELS[topPillar.pillar] || topPillar.pillar;
  const top3Lbl = pillars.slice(0, 3).map(r => PILLAR_LABELS[r.pillar] || r.pillar).join(', ');
  const formatRow = tooFewReels
    ? `Only ${reelN} short videos posted — this account is **posts-driven**; feed posts carry the engagement`
    : reelsWin
      ? `Short videos attract more engagement on average — worth expanding`
      : `**Feed posts outperform short videos** for this account`;
  const plainEnglish = tooFewReels
    ? `${prof.full_name ? '' : ''}This account is small but engaged. Its strongest content is **${topLbl.toLowerCase()}**, and almost all engagement comes from **feed posts** (carousels and images) — it has posted very few short videos. The biggest opportunities are to keep producing the ${top3Lbl} content that already works, and to make every post end with a clear next step (book, call, or visit).`
    : `This account has a healthy, active following. Its strongest content is **${topLbl.toLowerCase()}**. The biggest opportunity is posting more ${top3Lbl} content with clear calls to action.`;

  return `# Treehouse Ghana — Instagram Performance Report
*Prepared ${new Date().toISOString().slice(0,10)} · Based on ${Number(posts).toLocaleString()} posts, ${reelsCt} reels, ${mentCt} external mentions and ${commCt} audience comments*

---
${smallSample ? `
> ⚠️ **How to read this report.** This is a **descriptive content audit** of your **${ownedN} posts** (${dedupN} including posts that feature or tag you), not a statistical forecast. It reliably describes what you have posted, what works, and what your audience says — and it points to opportunities worth testing. With this many posts, treat the figures as **well-evidenced descriptions and sensible hypotheses**, not guarantees. The picture gets statistically firm once you pass ~100 posts.

---
` : ''}
## At a Glance

| | |
|---|---|
| 👥 **Followers** | **${followers}** at time of analysis |
| 📊 **Posts analysed** | ${posts} feed posts + ${reelsCt} short videos |
| 🏆 **Best-performing content type** | ${topLbl} (avg score ${round(num(topPillar.avg_engagement_score), 0)}) |
| 📅 **Best day to post** | **${topDay.period}** (avg score ${round(num(topDay.avg_engagement_score), 0)}) |
| 🎬 **Posts vs short videos** | ${formatRow} |

> **What this means in plain English:** ${plainEnglish}

---

## What Content Works Best

The chart below shows how different types of content perform. The longer the bar, the more engagement it attracts.

![Content pillar performance](figures/sr_pillars.svg)

### Key takeaways
${(() => {
  const ranked = [...pillars].filter(p=>num(p.avg_engagement_score)>0).sort((a,b)=>num(b.avg_engagement_score)-num(a.avg_engagement_score));
  const base = num((eda.find(r=>r.label==='all_content_deduplicated')||{}).mean) || num((eda.find(r=>r.label==='owned_account')||{}).mean) || 0;
  return ranked.slice(0,5).map((r,i) => {
    const sc = round(num(r.avg_engagement_score),0), n = num(r.posts_count);
    const vsBase = base ? Math.round((num(r.avg_engagement_score)/base - 1)*100) : 0;
    const read = n < 10 ? `only ${n} posts so far — a promising signal worth testing with more`
      : vsBase >= 0 ? `about ${vsBase}% above your typical post — a proven strength to do more of`
      : `below your average — lower priority unless reframed`;
    return `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]||'▪'} **${PILLAR_LABELS[r.pillar]||r.pillar}** — avg score **${sc}** (${n} posts): ${read}.`;
  }).join('\n');
})()}

---

## Your 10 Best-Performing Posts

![Top 10 posts and reels](figures/sr_top_content.svg)

These posts and videos are your proven best-sellers. Study what made them work:
- What topic was it about?
- Was there a clear call to action ("book now", "come tonight")?
- Did it feature video or just a still image?

---

## Posts vs Short Videos

![Short videos vs feed posts](figures/sr_type_compare.svg)

${tooFewReels
  ? `**Why this matters:** This account is **posts-driven**. You have posted only ${reelN} short videos in the period analysed, and your feed posts (carousels and images of food and events) carry almost all of the engagement. Short videos (Reels) do something posts cannot — Instagram shows them to people who don't yet follow you — so the opportunity is to **test** a few short videos as a way to reach new people, not to assume they will beat your already-strong posts. Keep doing what works, and treat video as an experiment to grow reach, measured in your Instagram Insights.`
  : reelsWin
    ? `**Why this matters:** Short videos (Reels) reach people beyond your existing followers through Instagram's discovery feed, and here they attract more engagement on average than feed posts. Expanding short-video output is a strong opportunity.`
    : `**Why this matters:** For this account, **feed posts currently outperform short videos**. Keep investing in your strong post formats (food and event carousels). Reels are still worth testing because they reach non-followers, but they are not yet a proven strength here — measure them in your Instagram Insights before shifting effort.`}

> **Practical tip:** You don't need expensive equipment. A smartphone held still for 15–30 seconds of a dish being plated or an event being set up is enough to test the format.

---

## Best Days and Times to Post

![Best days to post](figures/sr_days.svg)

| Day | Average Engagement | Recommendation |
|---|---|---|
${[...timing.filter(r => r.period_type === 'day_of_week')]
  .sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score))
  .map((r, i) => {
    const rec = i === 0 ? '✅ Best day — post your most important content here'
              : i === 1 ? '✅ Second-best — strong engagement'
              : i <= 3   ? '🟡 Good — solid performance'
              : '⚪ Lower priority';
    return `| **${r.period}** | ${round(num(r.avg_engagement_score),0)} | ${rec} |`;
  }).join('\n')}

---

## What Your Audience Is Saying

The comments on your top posts reveal exactly what people want to know. We analysed **${commCt} comments** and grouped them by topic.

![Comment intent breakdown](figures/sr_intents.svg)

### Commercial opportunities hiding in your comments

Most comments are light praise — lovely, but not where business comes from. The value is in the smaller, specific categories below: people effectively raising their hand. These are your actual comment types, ranked by how often they appear, with the move each one calls for:

| Comment type (and how often) | What to do about it |
|---|---|
${(() => {
  const commercial = [...intents].filter(i=>!/generic|unclear|praise/i.test(i.intent) && num(i.count)>0).sort((a,b)=>num(b.count)-num(a.count));
  const rowsToShow = (commercial.length ? commercial : [...intents].sort((a,b)=>num(b.count)-num(a.count))).slice(0,5);
  return rowsToShow.map(i => `| **${i.intent}** (${i.count}, ${i.percentage}%) | ${commentNextStep(i.intent, num(i.percentage))} |`).join('\n');
})()}

---

## Three Paths Forward${smallSample ? ' (Illustrative)' : ''}

We simulated three content approaches by drawing on your past performance. Each was run 10,000 times to show a likely range.

![Three content strategy scenarios](figures/sr_strategies.svg)

| Approach | Expected 12-Week Total | Compared to Now |
|---|---|---|
| **Current approach** | ~${Number(current.mean||0).toLocaleString()} | Baseline |
| **Improved mix** (lean into your top categories) | ~${Number((strategies.find(r=>r.strategy==='optimised')||{}).mean||0).toLocaleString()} | +${(strategies.find(r=>r.strategy==='optimised')||{}).uplift_vs_current||0}% |
| **Heavier video** (more short-form) | ~${Number(heavy.mean||0).toLocaleString()} | +${heavy.uplift_vs_current||0}% |

> ${smallSample
  ? `**Treat these as illustrative, not promises.** They are built from only ${ownedN} posts, so the percentages mostly reflect the arithmetic of posting more of what has done well, not a guaranteed outcome. Use them for direction — *do more of what works* — not as targets. The "heavier video" path in particular is unproven for you, since you have posted very few videos so far.`
  : `These numbers are estimates based on past performance — your results will vary with creative quality, timing and trends.`}

---

## Recommended Actions

Take these steps in order. Each one builds on the last, and every one is drawn from what your own data shows above.

${(() => {
  const commercial = [...intents].filter(i=>!/generic|unclear|praise/i.test(i.intent) && num(i.count)>0).sort((a,b)=>num(b.count)-num(a.count));
  const topIntent = commercial[0];
  const topPillarName = (PILLAR_LABELS[topPillar.pillar] || topPillar.pillar || 'your strongest content type');
  const bestDay = topDay.period || 'your best-performing day';
  const optName = (strategies.find(r=>r.strategy==='optimised')||{});
  const optUplift = optName.uplift_vs_current || 0;
  return `### This week (quick wins)
1. **Reply to every high-intent comment within 30 minutes during posting hours.**${topIntent ? ` Your most common commercial signal is *${topIntent.intent}* (${topIntent.percentage}% of comments) — those are warm leads, and a fast reply is what converts them.` : ' These are warm leads; a fast reply is what converts them.'}
2. **Make the one next step you most want frictionless in your bio.** Whatever action your top comments are asking for, put a single tap to it (link, form, or saved reply) at the top of your profile so nobody has to hunt for it.
3. **Pin a Highlight that answers your most-asked question.** Build it around the comment type above so the answer is always one tap away instead of being re-typed in DMs.

### This month
4. **Publish more of what already works.** Your strongest category is **${topPillarName}**. Schedule more of it deliberately rather than leaving your best content to chance.
5. **Post on your strongest day.** Engagement peaks around **${bestDay}** — anchor your most important posts there.
6. **Reshare your best social proof.** Take two of your strongest mentions or comments, reshare them, and end the caption with one explicit next step.

### This quarter
7. **Rebalance your calendar toward the "Improved mix" above** (the simulated path worth roughly +${optUplift}% over 12 weeks): more of your top categories, fewer low-engagement generic posts.
8. **Set and assign a comment response-time target** (30 minutes in working hours) so high-intent comments are never missed.
9. **Track one metric monthly** — average engagement score per content type — and ask us to re-run this analysis in 90 days to measure progress against this baseline.`;
})()}

---

## Glossary — plain-English definitions

A few terms appear above. Here is what each one means, in everyday language:

| Term | What it means |
|---|---|
| **Engagement score** | A single number combining likes, comments and video plays, so different posts can be compared fairly. Higher means more people interacted. The exact formula is *likes + (comments × 5) + (video plays ÷ 100)*; comments count for more because they take more effort than a like. |
| **Reel / short video** | Instagram's short vertical video format. Reels are pushed to people who don't follow you yet, so they are the main way to reach new audiences. |
| **Feed post / carousel** | A standard image or multi-image ("carousel") post that appears on your grid. Mostly seen by people who already follow you. |
| **Content category (pillar)** | A theme we grouped your posts into (for example, behind-the-scenes, projects, events) so we can see which themes earn the most engagement. |
| **Comment intent** | What a commenter actually wants — praise, a question, a booking/collaboration request — rather than just the words. High-intent comments are warm leads. |
| **Warm lead** | Someone who has signalled real interest (a question or request) and is far more likely to convert into a customer or collaborator than a passive viewer. |
| **Simulation (Monte Carlo)** | We re-played your likely results thousands of times using your own past performance, to show a *range* of outcomes rather than a single guess. |
| **Likely range** | The band most outcomes fell into across those simulations — a realistic best-to-worst spread, not a promise. |
| **Baseline** | Your current performance, used as the reference point everything else is compared against. |
| **CTA (call to action)** | The one specific next step you ask the audience to take in a caption — "book here", "watch now", "send your reel". |
| **Highlight** | The saved, pinned story circles under your bio. They stay permanently, so they are ideal for answers people ask for repeatedly. |

---

## About This Report

This report is based entirely on **public** Instagram data — posts, reels, comments and mentions visible to anyone. It does not use your private Instagram analytics (reach, impressions, saves, shares, profile visits). For a complete picture, combine these findings with your native Instagram Insights.

*Analysis by: data pipeline in this repository. Charts and numbers update automatically when the analysis is re-run. Last generated: ${new Date().toISOString().slice(0,10)}.*
`;
}

// ─── LaTeX REPORT ─────────────────────────────────────────────────────────────
function makeLatex(data) {
  const { profile, pillars, timing, intents, strategies, eda } = data;

  const prof = profile || {};
  const followers = prof.followers_count ? Number(prof.followers_count).toLocaleString() : '27,386';
  const posts = prof.scraped_posts || 150;
  const topPillar = pillars[0] || {};
  const topDay = [...timing.filter(r => r.period_type === 'day_of_week')]
    .sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score))[0] || {};
  const current   = strategies.find(r => r.strategy === 'current_mix')  || {};
  const optimised = strategies.find(r => r.strategy === 'optimised')    || {};
  const heavy     = strategies.find(r => r.strategy === 'heavy_reels')  || {};
  const reelMean  = num(eda.find(r => r.label === 'reels')?.mean  || 0);
  const postMean  = num(eda.find(r => r.label === 'posts')?.mean  || 0);
  const reelN     = num(eda.find(r => r.label === 'reels')?.n) || (prof.scraped_reels || 0);
  const ownedN    = num(eda.find(r => r.label === 'owned_account')?.n) || 0;
  const smallSample = ownedN > 0 && ownedN < 40;
  const tooFewReels = reelN < 5;
  const tx = s => String(s).replace(/[\\{}$&#_%]/g, c => '\\' + c)
    .replace(/\^/g, '\\textasciicircum{}').replace(/~/g, '\\textasciitilde{}')
    .replace(/>/g, '\\textgreater{}').replace(/</g, '\\textless{}');

  const PL = { 'food':'food and dining','cocktails/drinks':'cocktails and drinks','ambience/decor/vibe':'ambience',
    'dinner/nightlife':'dinner and nightlife','events/live music/DJ':'events and live music','general brand/content':'general brand',
    'date night/romance':'date night','birthdays/celebrations':'birthdays and celebrations','reservations/bookings':'reservations',
    'promotions/offers':'promotions','price/value':'price and value' };
  const top3Txt = pillars.slice(0,3).map(r => PL[r.pillar] || tx(r.pillar)).join(', ');
  const top1Txt = PL[(pillars[0]||{}).pillar] || 'food';
  const formatFinding = tooFewReels
    ? `\\textbf{This account is posts-driven.} Only ${reelN} short videos were posted in the period; feed posts (carousels and images) carry essentially all engagement. Short video is an untested opportunity to reach new people, not a proven channel here.`
    : (reelMean > postMean)
      ? `\\textbf{Short videos attract more engagement than feed posts on average} and reach beyond existing followers; expanding video is a clear opportunity.`
      : `\\textbf{Feed posts outperform short videos for this account.} Keep investing in strong post formats; treat video as an experiment to grow reach.`;

  // Data-driven commercial signal + next-step prose (industry-agnostic).
  const commercialIntents = [...intents]
    .filter(i => !/generic|unclear|praise/i.test(i.intent) && num(i.count) > 0)
    .sort((a, b) => num(b.count) - num(a.count));
  const topCommercial = commercialIntents[0] || null;
  const topCommercialTxt = topCommercial
    ? `\\textbf{Your most common high-intent comment is \\textquotedblleft${tx(topCommercial.intent)}\\textquotedblright{}} (${topCommercial.percentage}\\% of comments). Replying quickly turns these warm leads into customers.`
    : `\\textbf{Most comments are warm but low-intent.} The opportunity is to end captions with one explicit next step so that affection turns into action.`;
  const topPillarLatex = top1Txt;
  const bestDayLatex = topDay.period || 'your best-performing day';
  const optUpliftLatex = optimised.uplift_vs_current || 0;

  // "Nice" round tick step (~4 ticks) so axis labels never crowd/collide.
  const niceStep = (range) => {
    const raw = (range || 1) / 4;
    const magn = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / magn;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * magn;
  };
  const pillarMax = Math.max(...pillars.slice(0,8).map(r => num(r.avg_engagement_score)), 1);
  const pillarStep = niceStep(pillarMax);
  const typeMax = Math.max(num(postMean), num(reelMean), 1);
  const typeStep = niceStep(typeMax);

  // TikZ pillar bar chart data
  const pillarData = pillars.slice(0, 8).map(r => {
    const LABELS = {
      'food': 'Food \\& Dining','cocktails/drinks': 'Cocktails \\& Drinks',
      'ambience/decor/vibe': 'Ambience \\& Vibe','dinner/nightlife': 'Dinner \\& Nightlife',
      'events/live music/DJ': 'Events \\& Music','general brand/content': 'General Brand',
      'date night/romance': 'Date Night','birthdays/celebrations': 'Celebrations',
    };
    return `(${Math.round(num(r.avg_engagement_score))},{${LABELS[r.pillar] || tx(r.pillar)}})`;
  }).join('\n    ');

  const dayRows = [...timing.filter(r => r.period_type === 'day_of_week')]
    .sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score))
    .map(r => `${tx(r.period)} & ${round(num(r.avg_engagement_score),0)} \\\\`).join('\n');

  const intentRows = intents.slice(0,8).map(r => {
    const PLAIN = {
      'generic/unclear': 'General reactions','generic praise': 'Positive praise',
      'positive ambience praise': 'Atmosphere praise','location/access question': 'Location questions',
      'event interest': 'Event questions','menu/food curiosity': 'Menu curiosity',
      'booking/reservation intent': '\\textbf{Booking requests}','service issue/complaint': 'Service feedback',
    };
    const lbl = PLAIN[r.intent] || tx(r.intent);
    return `${lbl} & ${r.count} & ${r.percentage}\\% \\\\`;
  }).join('\n');

  const stratRows = strategies.map(r => {
    const names = { current_mix: 'Current approach', optimised: 'Improved mix', heavy_reels: 'Video focus' };
    return `${names[r.strategy]||tx(r.strategy)} & ${Number(r.mean||0).toLocaleString()} & ${r.p5||0}–${r.p95||0} & ${r.uplift_vs_current||0}\\% \\\\`;
  }).join('\n');

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{xcolor}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\usepackage{parskip}
\\usepackage{pgfplots}
\\usepackage{tikz}
\\usepackage{array}
\\usepackage{fancyhdr}
\\usepackage{graphicx}
\\pgfplotsset{compat=1.18}

% Brand colours
\\definecolor{tregreen}{HTML}{1B3A2D}
\\definecolor{tregold}{HTML}{C9A84C}
\\definecolor{trelight}{HTML}{D8F3DC}
\\definecolor{treblue}{HTML}{2E86AB}
\\definecolor{trepurple}{HTML}{7B2D8B}
\\definecolor{tregrey}{HTML}{6B7280}

\\hypersetup{colorlinks=true,linkcolor=tregreen,urlcolor=treblue}

\\pagestyle{fancy}
\\fancyhf{}
\\rhead{\\small\\color{tregrey}Treehouse Ghana — Instagram Report}
\\lhead{\\small\\color{tregrey}\\textbf{Confidential}}
\\cfoot{\\small\\color{tregrey}\\thepage}

\\title{%
  \\vspace{-1.5cm}
  {\\color{tregreen}\\Huge\\bfseries Treehouse Ghana}\\\\[6pt]
  {\\color{tregold}\\large Instagram Performance Report}\\\\[4pt]
  {\\normalsize Prepared ${tx(new Date().toISOString().slice(0,10))}}
}
\\author{}
\\date{}

\\begin{document}
\\maketitle
\\thispagestyle{fancy}

% ─── KEY METRICS BOX ──────────────────────────────────────────────────────────
\\noindent
\\begin{tikzpicture}
\\node[draw=tregreen,fill=trelight,rounded corners=6pt,inner sep=12pt,text width=\\linewidth-26pt]{%
  \\begin{tabular}{@{}llll@{}}
    \\textbf{${tx(followers)}} followers &
    \\textbf{${tx(posts.toString())}} posts analysed &
    \\textbf{${tx(topPillar.pillar ? (topPillar.pillar.replace(/[\\{}$&#_%^~<>]/g,'')) : 'top category')} is \\#1} &
    \\textbf{${tx(topDay.period||'Monday')} best day}\\\\
  \\end{tabular}
};
\\end{tikzpicture}
\\vspace{8pt}

% ─── EXECUTIVE SUMMARY ────────────────────────────────────────────────────────
\\section*{\\color{tregreen}Executive Summary}

Treehouse Ghana has ${tx(followers)} followers.
This report analyses ${tx(posts.toString())} posts and short videos published over the past 18 months.
${smallSample ? `\\textbf{It is a descriptive content audit, not a statistical forecast:} with ${ownedN} owned posts the figures reliably describe what has worked and point to opportunities to test, but are not guarantees. ` : ''}Key findings:

\\begin{enumerate}
  \\item \\textbf{${tx(top1Txt.charAt(0).toUpperCase()+top1Txt.slice(1))} is the strongest content category}, followed by ${tx(top3Txt)}. Do more of what already works.
  \\item ${formatFinding}
  \\item \\textbf{${tx(topDay.period||'')} is the best day to post}, with the highest average engagement.
  \\item ${topCommercialTxt}
  \\item \\textbf{Posts that feature the account in collaborations and mentions draw strong engagement} — reshare them and lean into that social proof.
\\end{enumerate}

% ─── CONTENT PERFORMANCE ──────────────────────────────────────────────────────
\\section*{\\color{tregreen}What Content Performs Best}

The chart below ranks each content type by average engagement score.
A higher score means more likes, comments and video plays combined.

\\vspace{8pt}
\\begin{tikzpicture}
\\begin{axis}[
  xbar,
  width=\\linewidth,
  height=9cm,
  bar width=14pt,
  xlabel={\\small Average engagement score (higher is better)},
  symbolic y coords={${pillars.slice(0,8).map(r=>{
    const m={'food':'Food \\& Dining','cocktails/drinks':'Cocktails \\& Drinks',
      'ambience/decor/vibe':'Ambience \\& Vibe','dinner/nightlife':'Dinner \\& Nightlife',
      'events/live music/DJ':'Events \\& Music','general brand/content':'General Brand',
      'date night/romance':'Date Night','birthdays/celebrations':'Celebrations'};
    return m[r.pillar]||r.pillar;}).reverse().join(',')}},
  ytick=data,
  xmin=0,
  xtick distance=${pillarStep}, scaled x ticks=false,
  xticklabel style={/pgf/number format/.cd,fixed,precision=0,1000 sep={,}},
  nodes near coords={\\pgfmathprintnumber[fixed,precision=0,1000 sep={,}]{\\pgfplotspointmeta}},
  nodes near coords align={horizontal},
  every node near coord/.style={font=\\small,color=tregreen},
  tick label style={font=\\small},
  label style={font=\\small},
  y tick label style={align=right,text width=3.2cm},
  draw=tregreen!20,
  fill=tregreen!60,
  enlarge y limits=0.12,
]
\\addplot[fill=tregreen!70,draw=tregreen] coordinates {
  ${pillars.slice(0,8).map(r=>{
    const m={'food':'Food \\& Dining','cocktails/drinks':'Cocktails \\& Drinks',
      'ambience/decor/vibe':'Ambience \\& Vibe','dinner/nightlife':'Dinner \\& Nightlife',
      'events/live music/DJ':'Events \\& Music','general brand/content':'General Brand',
      'date night/romance':'Date Night','birthdays/celebrations':'Celebrations'};
    return `(${Math.round(num(r.avg_engagement_score))},{${m[r.pillar]||r.pillar}})`;
  }).reverse().join('\n  ')}
};
\\end{axis}
\\end{tikzpicture}

% ─── SHORT VIDEOS ─────────────────────────────────────────────────────────────
\\section*{\\color{tregreen}Short Videos vs Feed Posts}

\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
  ybar,
  width=10cm,
  height=7cm,
  bar width=40pt,
  ylabel={\\small Average engagement score},
  symbolic x coords={Feed Posts, Short Videos (Reels)},
  xtick=data,
  ymin=0,
  ytick distance=${typeStep}, scaled y ticks=false,
  yticklabel style={/pgf/number format/.cd,fixed,precision=0,1000 sep={,}},
  nodes near coords={\\pgfmathprintnumber[fixed,precision=0,1000 sep={,}]{\\pgfplotspointmeta}},
  nodes near coords align={vertical},
  tick label style={font=\\normalsize\\bfseries},
  axis line style={draw=tregreen!30},
]
\\addplot[fill=treblue!70,draw=treblue] coordinates {(Feed Posts,${Math.round(postMean)})};
\\addplot[fill=trepurple!70,draw=trepurple] coordinates {(Short Videos (Reels),${Math.round(reelMean)})};
\\end{axis}
\\end{tikzpicture}
\\end{center}

${formatFinding}
Short videos reach people who do not yet follow the account through Instagram's discovery algorithm, which is why they are worth ${tooFewReels ? 'testing' : 'using'}. ${tooFewReels ? `So far only ${reelN} have been posted, so this is an opportunity to explore, not a proven result.` : ''} Measure their reach in your native Instagram Insights, which this public analysis cannot see.

% ─── BEST DAYS ────────────────────────────────────────────────────────────────
\\section*{\\color{tregreen}Best Days to Post}

\\begin{center}
\\begin{tabular}{lrc}
\\toprule
\\textbf{Day} & \\textbf{Avg Engagement} & \\textbf{Recommendation} \\\\
\\midrule
${dayRows}
\\bottomrule
\\end{tabular}
\\end{center}

% ─── COMMENT INTELLIGENCE ─────────────────────────────────────────────────────
\\section*{\\color{tregreen}What Your Audience is Saying}

We classified \\textbf{${tx(String(data.commCt||106))} comments} from your top-performing posts.
Most are light praise, but the smaller, specific categories below are where business hides — every one is someone effectively raising their hand.

\\begin{center}
\\begin{tabular}{lrr}
\\toprule
\\textbf{Comment type} & \\textbf{Count} & \\textbf{Share} \\\\
\\midrule
${intentRows}
\\bottomrule
\\end{tabular}
\\end{center}

\\textbf{Actionable:} ${topCommercial
  ? `Reply to every \\textquotedblleft${tx(topCommercial.intent)}\\textquotedblright{} comment within 30 minutes during posting hours — that is your highest-intent signal.`
  : `Reply to every high-intent comment within 30 minutes during posting hours.`}
Make the single next step those comments are asking for one tap away from your bio.

% ─── STRATEGY SCENARIOS ───────────────────────────────────────────────────────
\\section*{\\color{tregreen}Three Scenarios for Growth}

The table below shows expected 12-week engagement totals under three approaches.
These are projections based on 10,000 simulations of historical performance.

\\begin{center}
\\begin{tabular}{lrcc}
\\toprule
\\textbf{Approach} & \\textbf{Expected Total} & \\textbf{Likely Range} & \\textbf{vs Today} \\\\
\\midrule
${stratRows}
\\bottomrule
\\end{tabular}
\\end{center}

% ─── RECOMMENDATIONS ──────────────────────────────────────────────────────────
\\section*{\\color{tregreen}Recommended Actions}

\\subsection*{This week}
\\begin{enumerate}
  \\item Reply to every high-intent comment within 30 minutes during posting hours${topCommercial ? ` (your most common is \\textquotedblleft${tx(topCommercial.intent)}\\textquotedblright{})` : ''} — these are warm leads.
  \\item Put the single next step your top comments ask for one tap away in your bio (link, form or saved reply).
  \\item Pin a Highlight that answers your most-asked question, so the answer is always one tap away.
\\end{enumerate}

\\subsection*{This month}
\\begin{enumerate}
  \\setcounter{enumi}{3}
  \\item Publish more of what already works — your strongest category is \\textbf{${tx(topPillarLatex)}}. Schedule it deliberately.
  \\item Anchor your most important posts on your strongest day (\\textbf{${tx(bestDayLatex)}}).
  \\item Reshare two of your strongest mentions or comments as social proof, each ending with one explicit next step.
\\end{enumerate}

\\subsection*{This quarter}
\\begin{enumerate}
  \\setcounter{enumi}{6}
  \\item Rebalance your calendar toward the \\textquotedblleft Improved mix\\textquotedblright{} above (about +${optUpliftLatex}\\% over 12 weeks): more of your top categories, fewer low-engagement generic posts.
  \\item Set and assign a 30-minute comment response-time target during working hours.
  \\item Re-run this analysis in 90 days to measure progress against this baseline.
\\end{enumerate}

\\section*{\\color{tregreen}Glossary — Plain-English Definitions}

\\begin{center}
\\begin{tabular}{>{\\raggedright\\arraybackslash}p{3.6cm}>{\\raggedright\\arraybackslash}p{11cm}}
\\toprule
\\textbf{Term} & \\textbf{What it means} \\\\
\\midrule
Engagement score & A single number combining likes, comments and video plays so posts compare fairly. Higher means more interaction. Formula: likes + (comments $\\times$ 5) + (video plays $\\div$ 100). \\\\
Reel / short video & Instagram's short vertical video, pushed to people who do not yet follow you — the main way to reach new audiences. \\\\
Feed post / carousel & A standard image or multi-image post on your grid, seen mostly by existing followers. \\\\
Content category (pillar) & A theme we grouped your posts into, so we can see which themes earn the most engagement. \\\\
Comment intent & What a commenter actually wants — praise, a question, a booking or collaboration request — not just the words. \\\\
Warm lead & Someone who has signalled real interest and is far likelier to convert than a passive viewer. \\\\
Simulation (Monte Carlo) & Re-playing your likely results thousands of times from your own past performance, to show a range rather than one guess. \\\\
Likely range & The band most outcomes fell into across the simulations — a realistic spread, not a promise. \\\\
Baseline & Your current performance, used as the reference everything else is compared against. \\\\
CTA (call to action) & The one specific next step you ask the audience to take in a caption. \\\\
Highlight & The saved, pinned story circles under your bio; permanent, so ideal for repeated questions. \\\\
\\bottomrule
\\end{tabular}
\\end{center}

\\section*{\\color{tregreen}How to Read This Report}

All figures are based on \\textbf{public} Instagram data only.
Private metrics — reach, impressions, saves, profile visits, link clicks — are not included
and remain visible only in your native Instagram Insights dashboard.
The engagement score used throughout is: \\textit{likes + (comments $\\times$ 5) + (video plays $\\div$ 100)}.
A higher score indicates a post attracted more visible audience interaction.

\\vfill
\\begin{center}
{\\small\\color{tregrey}Generated automatically from the Treehouse Ghana Instagram analysis pipeline.
Charts and figures update whenever the analysis is re-run.}
\\end{center}

\\end{document}
`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main() {
  ensureDir(path.join(ROOT, 'reports', 'figures'));

  // Load data
  const summary    = readJson('data/processed/analysis_summary.json');
  const pillars    = readCsv('data/processed/content_pillar_summary.csv');
  const timing     = readCsv('data/processed/timing_summary.csv');
  const intents    = readCsv('data/processed/comment_intent_summary.csv');
  const eda        = readCsv('data/processed/adv_eda_summary.csv');
  const strategies = readCsv('data/processed/adv_mc_strategies.csv');
  const ciRows     = readCsv('data/processed/adv_bootstrap_cis.csv');
  const outliers   = readCsv('data/processed/outlier_content.csv');
  const allContent = [
    ...readCsv('data/processed/posts_clean.csv'),
    ...readCsv('data/processed/reels_clean.csv'),
  ].filter((r, i, arr) =>     // dedupe by shortcode for chart
    arr.findIndex(x => x.shortcode === r.shortcode && x.shortcode) === i
  );

  const profile  = summary.profile  || {};
  const commCt   = Number(summary.counts?.comments || 106);

  const data = { profile, pillars, timing, intents, eda, strategies,
    ciRows, outliers, allContent, commCt,
    typeCompare: summary.type_comparison || [],
    topContent:  summary.top_by_engagement || [],
    bootstrapCis: ciRows,
  };

  // Generate charts
  const charts = [
    ['sr_pillars.svg',       chartPillars(pillars)],
    ['sr_days.svg',          chartDays(timing)],
    ['sr_type_compare.svg',  chartTypeCompare(eda)],
    ['sr_intents.svg',       chartIntents(intents)],
    ['sr_strategies.svg',    chartStrategies(strategies)],
    ['sr_top_content.svg',   chartTopContent(outliers, allContent)],
  ];
  for (const [name, svg] of charts) {
    writeText(`reports/figures/${name}`, svg);
    console.log(`✓ Chart: ${name}`);
  }

  // Retarget the generated reports to the configured client. The narrative
  // templates are written with Treehouse Ghana as the worked example; this
  // substitutes the configured client identity so the same generator serves
  // any client without editing the templates.
  let clientName = 'Treehouse Ghana';
  try {
    const { loadConfig } = require('./config');
    clientName = loadConfig().client.name || clientName;
  } catch (e) { /* keep default if config absent */ }
  const retarget = (s) => clientName === 'Treehouse Ghana'
    ? s
    : s.split('Treehouse Ghana').join(clientName);

  // Generate reports
  writeText('reports/stakeholder_report.md',  retarget(makeMarkdown(data)));
  console.log('✓ Markdown report: reports/stakeholder_report.md');

  writeText('reports/stakeholder_report.tex', retarget(makeLatex(data)));
  console.log('✓ LaTeX report:    reports/stakeholder_report.tex');
}

main();
