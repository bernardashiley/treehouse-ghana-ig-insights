'use strict';
/**
 * New-client scaffolding wizard.
 *
 *   node src/init.js                 → interactive prompts
 *   node src/init.js "Name" handle   → non-interactive (name + IG handle)
 *
 * Produces:
 *   config/client.config.json   (client identity + analysis settings)
 *   inputs/*.json               (Apify actor inputs targeting the handle)
 *
 * It never overwrites an existing config without confirmation.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'config', 'client.config.json');

function ask(rl, q, def) {
  return new Promise((res) => rl.question(`${q}${def ? ` [${def}]` : ''}: `, (a) => res(a.trim() || def || '')));
}

function writeInputs(handle, slug, scrape) {
  const dir = path.join(ROOT, 'inputs');
  fs.mkdirSync(dir, { recursive: true });
  const url = `https://www.instagram.com/${handle}/`;
  const months = `${scrape.months_back} months`;
  const files = {
    'profile_details.json': { resultsType: 'details', directUrls: [url], resultsLimit: 1 },
    'posts_full.json':      { resultsType: 'posts',    directUrls: [url], resultsLimit: scrape.posts_limit,    onlyPostsNewerThan: months, addParentData: true },
    'reels_full.json':      { resultsType: 'reels',    directUrls: [url], resultsLimit: scrape.reels_limit,    onlyPostsNewerThan: months, addParentData: true },
    'mentions.json':        { resultsType: 'mentions', directUrls: [url], resultsLimit: scrape.mentions_limit, onlyPostsNewerThan: months, addParentData: true },
  };
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body, null, 2) + '\n');
  }
  return Object.keys(files);
}

async function main() {
  const [argName, argHandle] = process.argv.slice(2);
  const interactive = !argName || !argHandle;

  let answers;
  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n  New-client setup — Instagram Intelligence Pipeline\n  ' + '-'.repeat(48));
    answers = {
      name:        await ask(rl, '  Client name', argName || 'New Client'),
      handle:      await ask(rl, '  Instagram handle (no @)', argHandle || ''),
      category:    await ask(rl, '  Business category', 'Restaurant and Venue'),
      location:    await ask(rl, '  Location', ''),
      phone:       await ask(rl, '  Phone', ''),
      whatsapp:    await ask(rl, '  WhatsApp', ''),
      menu_url:    await ask(rl, '  Menu / catalogue URL', ''),
      maps_url:    await ask(rl, '  Google Maps URL', ''),
      prepared_by: await ask(rl, '  Report prepared by', 'Bernard Ashiley'),
      org:         await ask(rl, '  Organisation', 'Odwira and Whitehall'),
    };
    rl.close();
  } else {
    answers = { name: argName, handle: argHandle.replace(/^@/, ''),
      category: 'Restaurant and Venue', location: '', phone: '', whatsapp: '',
      menu_url: '', maps_url: '', prepared_by: 'Bernard Ashiley', org: 'Odwira and Whitehall' };
  }

  const handle = answers.handle.replace(/^@/, '');
  const slug = handle.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Preserve existing analysis/brand blocks if a config already exists.
  let prev = {};
  if (fs.existsSync(CONFIG)) {
    try { prev = JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^﻿/, '')); } catch {}
    const stamp = Date.now();
    fs.copyFileSync(CONFIG, CONFIG.replace('.json', `.backup-${stamp}.json`));
    console.log(`\n  Existing config backed up to client.config.backup-${stamp}.json`);
  }

  const config = {
    _readme: 'Edit this file only — every script reads from here. See README for field descriptions.',
    client: {
      name: answers.name, short_name: slug, handle, data_prefix: slug,
      instagram_url: `https://www.instagram.com/${handle}/`,
      category: answers.category, location: answers.location, bio: '',
      phone: answers.phone, whatsapp: answers.whatsapp,
      menu_url: answers.menu_url, maps_url: answers.maps_url,
      booking_platform: 'WhatsApp or phone',
    },
    report: {
      prepared_by: answers.prepared_by, organisation: answers.org,
      classification: 'Confidential', date: 'auto',
    },
    brand: prev.brand || {
      primary_hex: '1B3A2D', accent_hex: 'C9A84C', mid_hex: '2D6A4F', light_hex: 'D8F3DC',
      blue_hex: '2E86AB', purple_hex: '7B2D8B', grey_hex: '4B5563', rule_hex: 'D1D5DB',
    },
    scrape: prev.scrape || {
      posts_limit: 300, reels_limit: 150, mentions_limit: 150,
      months_back: 18, comments_top_n: 25, comments_per_post: 50,
    },
    analysis: prev.analysis || {
      mc_seed: 20260530, mc_iterations: 10000, bootstrap_iterations: 5000,
      alpha: 0.05, bonferroni_tests: 6,
    },
  };

  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  const inputs = writeInputs(handle, slug, config.scrape);

  console.log(`\n  Created config/client.config.json for "${answers.name}" (@${handle})`);
  console.log(`  Data prefix / slug: ${slug}`);
  console.log(`  Wrote inputs: ${inputs.join(', ')}`);
  console.log('\n  Next steps:');
  console.log('   1. Set APIFY_TOKEN in config.ps1 (never commit this file)');
  console.log(`   2. Scrape (Windows PowerShell):`);
  console.log(`        .\\scripts\\run_apify_actor.ps1 .\\inputs\\profile_details.json ${slug}_profile_details 1`);
  console.log(`        .\\scripts\\run_apify_actor.ps1 .\\inputs\\posts_full.json      ${slug}_posts_full      ${config.scrape.posts_limit}`);
  console.log(`        .\\scripts\\run_apify_actor.ps1 .\\inputs\\reels_full.json      ${slug}_reels_full      ${config.scrape.reels_limit}`);
  console.log(`        .\\scripts\\run_apify_actor.ps1 .\\inputs\\mentions.json        ${slug}_mentions        ${config.scrape.mentions_limit}`);
  console.log(`        node scripts/make_comments_input_from_posts.py`);
  console.log(`        .\\scripts\\run_apify_actor.ps1 .\\inputs\\comments_top_posts.json ${slug}_comments_top_posts ${config.scrape.comments_top_n * 2}`);
  console.log('   3. Edit config/pillar_rules.json if this is a different industry');
  console.log('   4. npm run all      (analyse + advanced + reports)');
  console.log('   5. git add . && git commit && git push   (CI compiles the PDF)\n');
}

main();
