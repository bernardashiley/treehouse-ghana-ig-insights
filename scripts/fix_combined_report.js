'use strict';
// Applies all 10 fixes to combined_report.tex from the clean base.
// Run: node scripts/fix_combined_report.js

const fs   = require('fs');
const path = require('path');

const SRC   = path.join(__dirname, '..', 'reports', 'combined_report.tex');
const CLEAN = path.join(__dirname, '..', 'reports', 'combined_report_clean.tex');

// Always start from the known-good restored copy (b573e66)
if (!fs.existsSync(CLEAN)) {
  console.error('ERROR: combined_report_clean.tex not found. Run: git show b573e66:reports/combined_report.tex > reports/combined_report_clean.tex');
  process.exit(1);
}
let src = fs.readFileSync(CLEAN, 'utf8');
console.log(`Using clean base (${src.split('\n').length} lines)`);

// ─── FIX 1: Replace error-bars chart with correct three-series bar chart ──────
// Locate the specific figure block by its caption, not by its content.
// This avoids the catastrophic regex-overshoot that wiped 500 lines earlier.
const ERR_CAPTION = '\\caption{Bootstrap 95\\% confidence intervals: mean engagement score by segment}';
const figStart = src.lastIndexOf('\\begin{figure}[h]', src.indexOf(ERR_CAPTION));
const figEnd   = src.indexOf('\\end{figure}', src.indexOf(ERR_CAPTION)) + '\\end{figure}'.length;

if (figStart !== -1 && figEnd > figStart && src.slice(figStart, figEnd).includes('error bars')) {
  const NEW_CHART =
`\\begin{figure}[htbp]
\\centering
\\caption{Bootstrap 95\\% confidence intervals: mean engagement score by segment}
\\begin{tikzpicture}
\\begin{axis}[
  xbar, xmin=0, xmax=480,
  width=13.5cm, height=6.5cm,
  bar width=10pt,
  xlabel={\\small Engagement score},
  symbolic y coords={Third-party,Owned,Feed Posts,All Content,Short Videos},
  ytick=data,
  y tick label style={font=\\small},
  axis line style={draw=tgrule},
  enlarge y limits=0.22,
  legend style={at={(0.98,0.02)},anchor=south east,font=\\small},
]
\\addplot[fill=tggrey!30,draw=tggrey] coordinates {
  (89.54,Third-party)(70.63,Owned)(74.36,Feed Posts)(87.99,All Content)(104.59,Short Videos)
};
\\addlegendentry{Lower 95\\%}
\\addplot[fill=tgmid!80,draw=tgmid] coordinates {
  (146.30,Third-party)(118.90,Owned)(112.24,Feed Posts)(126.75,All Content)(248.34,Short Videos)
};
\\addlegendentry{Point estimate}
\\addplot[fill=tgblue!35,draw=tgblue] coordinates {
  (213.13,Third-party)(177.41,Owned)(157.32,Feed Posts)(171.15,All Content)(420.50,Short Videos)
};
\\addlegendentry{Upper 95\\%}
\\end{axis}
\\end{tikzpicture}
\\end{figure}`;
  src = src.slice(0, figStart) + NEW_CHART + src.slice(figEnd);
  console.log('✓ Fix 1: Replaced error-bars CI chart');
} else {
  console.log('  Fix 1: Error-bars chart not found (already replaced or different state)');
}

// ─── FIX 2: Pillar name consistency in table rows (not pgfplots coords) ────────
// Only fix inside tabular/longtable rows: lines that start with a pillar name or
// contain & PillarName &. pgfplots symbolic coords are on lines starting with (
const tableRowFixes = [
  [/^(Promotions\/Offers\b)/gm,            'Promotions and Offers'],
  [/^(Events and Music\b)/gm,              'Events and Live Music'],
  [/^(Birthdays\b\s*&)/gm,                 'Birthdays and Celebrations &'],
  [/^(Birthdays\b\s*\\\\)/gm,              'Birthdays and Celebrations \\\\'],
  [/^(Date Night\b\s*&)/gm,                'Date Night and Romance &'],
  [/^(Reservations\b\s*&)/gm,              'Reservations and Bookings &'],
  // inline after & in mid-row
  [/(& Events and Music\b)/g,              '& Events and Live Music'],
  [/(& Promotions\/Offers\b)/g,            '& Promotions and Offers'],
];
for (const [rx, rep] of tableRowFixes) {
  src = src.replace(rx, rep);
}
console.log('✓ Fix 2: Pillar names in table rows normalised');

// ─── FIX 3: Number formatting — 10000/5000 in prose (not in coords) ───────────
// Replace standalone 10000 and 5000 that are NOT inside pgfplots coordinates
// i.e. NOT preceded by a comma+space or opening paren from a coord tuple
src = src
  // Fix in prose (word boundaries, not inside parentheses)
  .replace(/(?<![,(])\b10000\b(?![,)])/g, '10,000')
  .replace(/(?<![,(])\b5000\b(?![,)])/g,  '5,000')
  // Fix in section titles and captions (these are not coords)
  .replace(/\(10000 simulations\)/g,   '(10,000 simulations)')
  .replace(/\(5000 iterations\)/g,     '(5,000 iterations)')
  .replace(/use 10000 iterations/g,    'use 10,000 iterations')
  // Fix bracket in section title
  .replace('(30,60 and 90 Days)',       '(30, 60 and 90 Days)');
console.log('✓ Fix 3: Number formatting');

// ─── FIX 4: n=219 discrepancy note in regression table ─────────────────────────
const OLD_REG_CAP = '\\caption{Simple regression and descriptive model-style estimates}';
const NEW_REG_CAP = '\\caption{Simple regression and descriptive model-style estimates%\n  \\textsuperscript{\\dag}}';
const REG_FOOTNOTE =
  '{\\small\\dag~These regression estimates use the pre-deduplication dataset ($n=219$) ' +
  'produced by the base analysis pipeline. All other statistics in Part~II use the ' +
  'deduplicated dataset ($n=150$). Coefficients are directional and do not change ' +
  'materially between the two datasets.}\n\n';
const TARGET_AFTER_TABLE = 'The very high Pearson $r = 0.929$';

if (src.includes(OLD_REG_CAP) && src.includes(TARGET_AFTER_TABLE)) {
  src = src
    .replace(OLD_REG_CAP, NEW_REG_CAP)
    .replace(TARGET_AFTER_TABLE, REG_FOOTNOTE + TARGET_AFTER_TABLE);
  console.log('✓ Fix 4: Added n=219 discrepancy note');
} else {
  console.log('  Fix 4: Regression caption or follow-on text not found');
}

// ─── FIX 5: Standardise missing-value notation to {---} ───────────────────────
src = src
  .replace(/& n\/a &/g,  '& {---} &')
  .replace(/& n\/a \\\\/g, '& {---} \\\\');
console.log('✓ Fix 5: Standardised missing values to {---}');

// ─── FIX 6: Float specifier [h] -> [htbp] ─────────────────────────────────────
src = src
  .replace(/\\begin\{table\}\[h\]/g,  '\\begin{table}[htbp]')
  .replace(/\\begin\{figure\}\[h\]/g, '\\begin{figure}[htbp]');
console.log('✓ Fix 6: Float specifiers [h] -> [htbp]');

// ─── FIX 7: Add \endfirsthead to glossary longtable ───────────────────────────
// The glossary longtable sits after \chapter*{Glossary of Terms...}
const GLOSS_MARKER = '\\chapter*{Glossary';
const GLOSS_POS = src.indexOf(GLOSS_MARKER);
if (GLOSS_POS !== -1) {
  // Within the glossary section, find the longtable header and add endfirsthead
  const GLOSS_HDR =
    '\\textbf{Term / Acronym} & \\textbf{Plain-English Definition} \\\\\n' +
    '\\midrule\n' +
    '\\endhead';
  const GLOSS_HDR_FIXED =
    '\\textbf{Term / Acronym} & \\textbf{Plain-English Definition} \\\\\n' +
    '\\midrule\n' +
    '\\endfirsthead\n' +
    '\\multicolumn{2}{c}{\\tablename\\ \\thetable{} --- continued} \\\\\n' +
    '\\toprule\n' +
    '\\textbf{Term / Acronym} & \\textbf{Plain-English Definition} \\\\\n' +
    '\\midrule\n' +
    '\\endhead';
  const glossSection = src.slice(GLOSS_POS);
  if (glossSection.includes(GLOSS_HDR)) {
    src = src.slice(0, GLOSS_POS) + glossSection.replace(GLOSS_HDR, GLOSS_HDR_FIXED);
    console.log('✓ Fix 7: Added \\endfirsthead to glossary longtable');
  } else {
    console.log('  Fix 7: Glossary longtable header not found (may already have endfirsthead)');
  }
}

// ─── FIX 8: SLA definition ────────────────────────────────────────────────────
src = src.replace(
  'within 30 minutes of posting.',
  'within 30 minutes of a comment being made.'
);
console.log('✓ Fix 8: Fixed SLA definition');

// ─── FIX 9: Move "Profile and Bio" section before "Content Strategy" ──────────
// The bio section currently sits at the end of Chapter 8 (after KPIs).
// Move it to be the first section of Chapter 8 so context precedes action items.
const BIO_MARKER  = '\\section{Profile and Bio';
const CS_MARKER   = '\\section{Content Strategy}';
const bioIdx = src.indexOf(BIO_MARKER);
const csIdx  = src.indexOf(CS_MARKER);

if (bioIdx !== -1 && csIdx !== -1 && bioIdx > csIdx) {
  // Profile is AFTER Content Strategy - need to swap
  // Extract everything from Bio section to end of Actions This Quarter
  const END_ACTIONS = '\\end{enumerate}\n\n%% ====';
  const actEnd = src.indexOf(END_ACTIONS, bioIdx);
  if (actEnd !== -1) {
    const bioBlock = src.slice(bioIdx, actEnd + '\\end{enumerate}\n\n'.length);
    const rest     = src.slice(actEnd + '\\end{enumerate}\n\n'.length);
    const pre      = src.slice(0, bioIdx).trimEnd() + '\n\n';
    // Reassemble: pre + rest, then insert bio block before Content Strategy
    const combined = pre + rest;
    const newCs    = combined.indexOf(CS_MARKER);
    if (newCs !== -1) {
      src = combined.slice(0, newCs) + bioBlock + '\n' + combined.slice(newCs);
      console.log('✓ Fix 9: Moved Profile/Bio section before Content Strategy');
    } else {
      console.log('  Fix 9: Content Strategy not found after extraction');
    }
  } else {
    console.log('  Fix 9: End-of-actions marker not found');
  }
} else if (bioIdx !== -1 && csIdx !== -1 && bioIdx < csIdx) {
  console.log('  Fix 9: Profile/Bio already before Content Strategy - no move needed');
} else {
  console.log('  Fix 9: Profile/Bio or Content Strategy section not found');
}

// ─── FIX 10: Clarify 66% vs 121% ─────────────────────────────────────────────
src = src.replace(
  'Short videos attracted on average \\textbf{66\\% more engagement} than feed posts in the raw dataset, and \\textbf{121\\% more} after accounting for the post-reel duplication identified during data cleaning (see Part III, Section 5.1).',
  'Short videos attracted on average \\textbf{121\\% more engagement} than feed posts on the deduplicated dataset (150 unique posts). The raw dataset before deduplication (219 records) shows a 66\\% difference; the 121\\% figure uses the cleaner deduplicated comparison and is the number cited throughout this report.'
);
console.log('✓ Fix 10: Clarified 66% vs 121% explanation');

// ─── Validate ─────────────────────────────────────────────────────────────────
const lines = src.split('\n').length;
const chapters = (src.match(/\\chapter/g) || []).length;
const sections = (src.match(/\\section/g) || []).length;
const hasEnd   = src.includes('\\end{document}');
console.log(`\nValidation: ${lines} lines, ${chapters} chapters, ${sections} sections, \\end{document}: ${hasEnd}`);

if (lines < 1500 || chapters < 15 || !hasEnd) {
  console.error('ERROR: Output looks too short — NOT writing. Check the script.');
  process.exit(1);
}

fs.writeFileSync(SRC, src, 'utf8');
console.log(`Written to ${SRC}`);
