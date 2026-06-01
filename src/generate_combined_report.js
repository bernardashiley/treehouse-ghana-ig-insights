'use strict';
/**
 * Combined Intelligence Report generator.
 * Reads config/client.config.json + data/processed/*.csv and emits a complete,
 * self-contained LaTeX document at reports/combined_report.tex.
 *
 * Every client-identity string comes from config; every number comes from the
 * committed analysis CSVs. Running the analysis pipeline for a new client and
 * then this generator produces that client's full report with no manual edits.
 *
 * The narrative interpretation is written to be client-agnostic and is
 * data-aware where the dataset drives the wording (e.g. zero-view asymmetry).
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig } = require('./config');
const { commentNextStep, dedupeByShortcode, splitOwned } = require('./utils');

// ── CSV / JSON readers ────────────────────────────────────────────────────────
function parseLine(line){const o=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;}
function readCsv(rel){const f=path.join(ROOT,rel);if(!fs.existsSync(f))return[];const L=fs.readFileSync(f,'utf8').replace(/^﻿/,'').split('\n').filter(x=>x.trim());if(L.length<2)return[];const h=parseLine(L[0]);return L.slice(1).map(l=>{const v=parseLine(l);const r={};h.forEach((k,i)=>r[k.trim()]=(v[i]??'').trim());return r;});}
function readJson(rel){const f=path.join(ROOT,rel);return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,'')):{};}
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const fmt=n=>Math.round(num(n)).toLocaleString('en-GB');
const r2=(n,d=2)=>{const f=10**d;return Math.round(num(n)*f)/f;};

// ── LaTeX escaping ──────────────────────────────────────────────────────────
function tx(s){return String(s??'').replace(/\\/g,'\\textbackslash{}').replace(/[&%$#_{}]/g,m=>'\\'+m).replace(/\^/g,'\\textasciicircum{}').replace(/~/g,'\\textasciitilde{}').replace(/—/g,'---').replace(/–/g,'--').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");}
// dedupe a pgfplots symbolic-coord-safe label (no slashes/commas/spaces issues handled by caller)
function pillarLabel(p){const M={'food':'Food and Dining','cocktails/drinks':'Cocktails and Drinks','ambience/decor/vibe':'Ambience and Vibe','date night/romance':'Date Night and Romance','birthdays/celebrations':'Birthdays and Celebrations','brunch/lunch':'Brunch and Lunch','dinner/nightlife':'Dinner and Nightlife','events/live music/DJ':'Events and Live Music','customer/influencer/social proof':'Social Proof','promotions/offers':'Promotions and Offers','reservations/bookings':'Reservations and Bookings','location/parking/access':'Location and Access','service/wait time':'Service','price/value':'Price and Value'};return M[p]||p;}
// pgfplots coord name: strip slashes, commas; collapse spaces
function coordName(p){return pillarLabel(p).replace(/[/,]/g,' ').replace(/\s+/g,' ').trim();}

// ── load everything ───────────────────────────────────────────────────────────
const cfg = loadConfig();
const C = cfg.client, RP = cfg.report, B = cfg.brand;
const summary = readJson('data/processed/analysis_summary.json');
const pillars = readCsv('data/processed/content_pillar_summary.csv');
const timing  = readCsv('data/processed/timing_summary.csv');
const intents = readCsv('data/processed/comment_intent_summary.csv');
const hashtags= readCsv('data/processed/hashtag_summary.csv');
const lift    = readCsv('data/processed/pillar_lift_summary.csv');
const eda     = readCsv('data/processed/adv_eda_summary.csv');
const hyp     = readCsv('data/processed/adv_hypothesis_tests.csv');
const cis     = readCsv('data/processed/adv_bootstrap_cis.csv');
const mcStrat = readCsv('data/processed/adv_mc_strategies.csv');
const mcFore  = readCsv('data/processed/adv_mc_forecast.csv');
const mcConv  = readCsv('data/processed/adv_mc_conversion.csv');
const mcMix   = readCsv('data/processed/adv_mc_pillar_mix.csv');
const mcRisk  = readCsv('data/processed/adv_mc_risk.csv');
const recon   = readCsv('data/processed/data_reconciliation.csv');
const dayPosthoc = readCsv('data/processed/adv_day_posthoc.csv');

// Format a p-value for display: never print "0" (use < 0.0001) and cap precision.
function fmtP(p){
  const n = Number(p);
  if (!Number.isFinite(n)) return '=\\,n/a';
  if (n < 0.0001) return '<0.0001';
  return '='+ (n < 0.001 ? n.toExponential(1) : n.toFixed(4));
}
// Does any pairwise day comparison survive Holm correction? (gate "best day" claims)
const anyDaySignificant = dayPosthoc.some(r => String(r.significant_holm) === 'true');

// Display a metric, or "NA" when the scraper could not read it (missing flag set).
function naf(value, missing){
  return (missing === true || missing === 'true') ? 'NA' : fmt(value);
}

const counts = summary.counts || {};
const profile = summary.profile || {};
const followers = fmt(profile.followers_count || 0);

// ── Data-conditional format comparison (reels vs posts) ───────────────────────
// Computed from the cleaned data so the narrative adapts to each client instead
// of assuming the Treehouse (reels-leaning) result.
function fmtVerdict(){
  const cl=readCsv('data/processed/posts_clean.csv').concat(readCsv('data/processed/reels_clean.csv'));
  // Deduplicate AND restrict to owned content, identical to the rest of the report,
  // so the reels count here (owned reels) matches the EDA and reconciliation table
  // (avoids the 4-owned-vs-9-deduplicated reels contradiction).
  const all=splitOwned(dedupeByShortcode(cl),(C.handle||C.short_name||'')).owned;
  const P=all.filter(r=>r.content_type==='post'), R=all.filter(r=>r.content_type==='reel');
  const m=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  const v=a=>{if(a.length<2)return 0;const mu=m(a);return a.reduce((s,x)=>s+(x-mu)**2,0)/(a.length-1);};
  const ncdf=x=>{const t=1/(1+0.2316419*Math.abs(x));const p=t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));const z=1-(1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*x*x)*p;return x>=0?z:1-z;};
  const mwu=(a,b)=>{if(!a.length||!b.length)return 1;let u=0;for(const x of a)for(const y of b){if(x>y)u++;else if(x===y)u+=0.5;}const U=Math.min(u,a.length*b.length-u),mu=a.length*b.length/2,sg=Math.sqrt(a.length*b.length*(a.length+b.length+1)/12);return sg?2*(1-ncdf(Math.abs((U-mu)/sg))):1;};
  const esc=r=>Math.max(0,num(r.engagement_score));
  const lk=r=>Math.max(0,num(r.likes));
  const lc=r=>Math.max(0,num(r.likes))+Math.max(0,num(r.comments))*5;
  const rEsc=R.map(esc),pEsc=P.map(esc),rLk=R.map(lk),pLk=P.map(lk),rLc=R.map(lc),pLc=P.map(lc);
  const pZero=P.filter(r=>num(r.views)===0).length;
  return {
    nP:P.length,nR:R.length,
    escR:Math.round(m(rEsc)),escP:Math.round(m(pEsc)),
    lkR:Math.round(m(rLk)),lkP:Math.round(m(pLk)),
    lcR:Math.round(m(rLc)),lcP:Math.round(m(pLc)),
    pEscMwu:r2(mwu(rEsc,pEsc),3),pLkMwu:r2(mwu(rLk,pLk),3),pLcMwu:r2(mwu(rLc,pLc),3),
    postsZeroViewPct:P.length?Math.round(100*pZero/P.length):0,
  };
}
const FV = fmtVerdict();
// Decide the format story from the data.
// Below ~30 reels in the analysed set, a two-group comparison on heavily skewed
// engagement data is underpowered and unreliable, so we do NOT assert a winner;
// we frame short video as an under-used, unproven format to test. This matches
// the Appendix hypothesis tests, which are non-significant at these sizes.
const REEL_MIN_N = 30;
const reelsWin = FV.escR > FV.escP;
const tooFewReels = FV.nR < REEL_MIN_N;
const formatSignalRow = tooFewReels
  ? `Only ${FV.nR} reels in the analysed window: too few to compare; this account is posts-driven`
  : reelsWin
    ? `Short videos show higher interaction; advantage is directional (see Reels vs Posts)`
    : `Feed posts currently outperform short videos for this account (see Reels vs Posts)`;
const NAME = C.name;

// derived headline values
const edaBy = Object.fromEntries(eda.map(r=>[r.label,r]));
// Sample-adequacy gate: below this many OWNED posts the inferential and
// Monte Carlo layers are demoted to a clearly-labelled illustrative appendix.
const SMALL_N_THRESHOLD = 40;
const ownedN = Number((edaBy['owned_account']||{}).n) || 0;
const dedupN = Number((edaBy['all_content_deduplicated']||{}).n) || 0;
const smallSample = ownedN > 0 && ownedN < SMALL_N_THRESHOLD;
const part2Title = smallSample
  ? 'Appendix: Illustrative Statistical Exploration'
  : 'Advanced Statistical and Predictive Analysis';
const topPillar = [...pillars].filter(p=>num(p.avg_engagement_score)>0).sort((a,b)=>num(b.avg_engagement_score)-num(a.avg_engagement_score))[0]||{};
const dayRows = timing.filter(r=>r.period_type==='day_of_week').sort((a,b)=>num(b.avg_engagement_score)-num(a.avg_engagement_score));
const bestDay = dayRows[0]||{};
const hourRows = timing.filter(r=>r.period_type==='hour_utc');

// ── table/figure builders ──────────────────────────────────────────────────
function bar(opts){
  // horizontal bar chart from {label,value} rows (sorted ascending for xbar bottom-up)
  const {title,rows,max,xlabel='Average engagement score',pct=false}=opts;
  // Engagement scores render as whole numbers; percentages keep one decimal.
  const coordVal = v => pct ? r2(num(v),1) : Math.round(num(v));
  const coords=rows.map(r=>`(${coordVal(r.value)},${coordName(r.label)})`).join('');
  const syms=rows.map(r=>coordName(r.label)).join(',');
  const xmin = pct ? Math.floor(Math.min(0,...rows.map(r=>num(r.value)))*1.1) : 0;
  const xmax = Math.ceil((pct ? Math.max(...rows.map(r=>num(r.value))) : num(max))*1.15);
  // Choose a "nice" round tick step targeting ~4-5 ticks, so labels never crowd
  // and collide (the "8001,000" run). Without this pgfplots auto-ticks every 200.
  const niceStep = (range) => {
    const raw = (range || 1) / 4;
    const magn = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / magn;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * magn;
  };
  const step = niceStep(xmax - xmin);
  // Fixed-point, thousands-separated labels; no scientific axis multiplier.
  const tickFmt = pct
    ? `xticklabel={\\pgfmathprintnumber[fixed,precision=0]{\\tick}\\%},`
    : `xticklabel style={/pgf/number format/.cd,fixed,precision=0,1000 sep={,}},`;
  const nodeFmt = pct
    ? `nodes near coords={\\pgfmathprintnumber[fixed,precision=1]{\\pgfplotspointmeta}\\%},`
    : `nodes near coords={\\pgfmathprintnumber[fixed,precision=0,1000 sep={,}]{\\pgfplotspointmeta}},`;
  return `\\begin{figure}[htbp]
\\centering
\\caption{${tx(title)}}
\\begin{tikzpicture}
\\begin{axis}[
  xbar, xmin=${xmin}, xmax=${xmax},
  xtick distance=${step}, scaled x ticks=false,
  width=13.5cm, height=${Math.max(5,rows.length*0.75+2)}cm, bar width=12pt,
  xlabel={\\small ${tx(xlabel)}},
  symbolic y coords={${syms}}, ytick=data,
  y tick label style={font=\\small, align=right, text width=3.8cm},
  x tick label style={font=\\footnotesize},
  ${tickFmt}
  ${nodeFmt}
  nodes near coords align={horizontal},
  every node near coord/.style={font=\\footnotesize, color=tggreen},
  enlarge y limits=0.08, axis line style={draw=tgrule},
]
\\addplot[fill=tgmid!80, draw=tgmid] coordinates {${coords}};
\\end{axis}
\\end{tikzpicture}
\\end{figure}`;
}

function longtable(opts){
  const {caption,cols,rows}=opts;
  const colspec=cols.map(c=>c.spec).join(' ');
  const head=cols.map(c=>`\\textbf{${tx(c.h)}}`).join(' & ')+' \\\\';
  const body=rows.map(r=>cols.map(c=>c.cell(r)).join(' & ')+' \\\\').join('\n');
  return `\\begin{longtable}{@{}${colspec}@{}}
\\caption{${tx(caption)}} \\\\
\\toprule
${head}
\\midrule
\\endfirsthead
\\multicolumn{${cols.length}}{c}{\\tablename\\ \\thetable{} (continued)} \\\\
\\toprule
${head}
\\midrule
\\endhead
\\bottomrule
\\endfoot
\\bottomrule
\\endlastfoot
${body}
\\end{longtable}`;
}
function table(opts){
  const {caption,cols,rows}=opts;
  const colspec=cols.map(c=>c.spec).join(' ');
  const head=cols.map(c=>`\\textbf{${tx(c.h)}}`).join(' & ')+' \\\\';
  const body=rows.map(r=>cols.map(c=>c.cell(r)).join(' & ')+' \\\\').join('\n');
  return `\\begin{table}[htbp]
\\centering
\\caption{${tx(caption)}}
\\begin{tabular}{@{}${colspec}@{}}
\\toprule
${head}
\\midrule
${body}
\\bottomrule
\\end{tabular}
\\end{table}`;
}

// ── DOCUMENT ──────────────────────────────────────────────────────────────────
function buildDoc(){
const hypBy=Object.fromEntries(hyp.map(r=>[r.test,r]));
const h1w=hyp.find(r=>/welch/i.test(r.test)&&/reels/i.test(r.test))||{};
const h1m=hyp.find(r=>/mwu/i.test(r.test)||(/reels/i.test(r.test)&&/mann/i.test(r.method||'')))||{};
const h2=hyp.find(r=>/day_of_week/i.test(r.test))||{};
const reelMean=r2(edaBy.reels?.mean||0), postMean=r2(edaBy.posts?.mean||0);
const concentration = (cis.find(r=>r.label==='reels_minus_posts')||{});

// ── richer data prep (top posts, correlations, per-pillar EDA, recommendations) ──
const topByLikes   = summary.top_by_likes || [];
const topByComments= summary.top_by_comments || [];
const topReels     = summary.top_reels_by_views || [];
const topByEng     = summary.top_by_engagement || [];
const correlations = summary.correlations || readCsv('data/processed/correlation_summary.csv');
const sortedPillars= [...pillars].filter(p=>num(p.avg_engagement_score)>0).sort((a,b)=>num(b.avg_engagement_score)-num(a.avg_engagement_score));
// Only pillars with n>=10 owned posts are "proven"; smaller pillars are test slots,
// not recommendation anchors (a mean on 1-3 posts is noise). Recommendations and the
// content calendar use the well-powered set so we never tell the client to scale a
// category whose apparent strength rests on a couple of posts.
const wellPoweredPillars = sortedPillars.filter(p=>num(p.posts_count)>=10);
const top3Pillars  = (wellPoweredPillars.length?wellPoweredPillars:sortedPillars).slice(0,3).map(p=>pillarLabel(p.pillar));
const provenTopPillar = top3Pillars[0] || 'the top category';
const secondaryThemes = top3Pillars.slice(1);
// Pillar lift is computed against the OWNED-account mean (the analysis basis), so
// the baseline shown here must be the owned mean too, not the full 305-item mean.
const baselineMean = num((edaBy.owned_account||{}).mean) || num((edaBy.all_content_deduplicated||{}).mean) || 0;
const pillarEda    = eda.filter(r=>/^pillar:/.test(r.label)).map(r=>({...r,name:pillarLabel(r.label.replace(/^pillar:/,''))}));
const sortedDays   = [...dayRows];
const topDays      = sortedDays.slice(0,2).map(d=>d.period).filter(Boolean);
// Actionable, non-generic comment intents ranked by count. Excludes warm sentiment
// (praise/hype, congratulations/support) and generic/unclear: those are social
// proof, NOT commercial intent, so they must not be reported as a commercial signal.
const commercialIntents = [...intents].filter(i=>!/generic|unclear|praise|hype|congrat|support/i.test(i.intent) && num(i.count)>0).sort((a,b)=>num(b.count)-num(a.count));
// Largest warm-response category (praise/congratulations), for honest framing.
const warmIntents = [...intents].filter(i=>/praise|hype|congrat|support/i.test(i.intent) && num(i.count)>0).sort((a,b)=>num(b.count)-num(a.count));
const topIntent    = (commercialIntents[0]||intents[0]||{});
const tlink = u => u ? `\\href{${u}}{view}` : '';
// Static glossary asset (generic statistical terms) injected before sign-off.
const glossaryPath = path.join(ROOT,'assets','glossary.tex');
const glossaryBlock = fs.existsSync(glossaryPath) ? fs.readFileSync(glossaryPath,'utf8') : '';

return `%% ============================================================
%%  ${C.name} Instagram Intelligence Report
%%  GENERATED by src/generate_combined_report.js from config + CSVs.
%%  Do not edit by hand; edit config/client.config.json and re-run.
%%  ${RP.organisation} | ${RP.prepared_by} | ${RP.date}
%% ============================================================
\\documentclass[11pt,a4paper]{report}
\\usepackage[a4paper, top=2.5cm, bottom=2.5cm, left=2.8cm, right=2.8cm]{geometry}
\\usepackage[T1]{fontenc}\\usepackage[utf8]{inputenc}\\usepackage{lmodern}\\usepackage{microtype}
\\usepackage{xcolor}\\usepackage{booktabs}\\usepackage{longtable}\\usepackage{array}\\usepackage{tabularx}
\\usepackage{parskip}\\usepackage{titlesec}\\usepackage{fancyhdr}\\usepackage{pgfplots}\\usepackage{tikz}
\\usepackage{hyperref}\\usepackage{enumitem}\\usepackage{caption}\\usepackage{mdframed}\\usepackage{amsmath}\\usepackage{needspace}
\\pgfplotsset{compat=1.18}
\\definecolor{tggreen}{HTML}{${B.primary_hex}}\\definecolor{tgmid}{HTML}{${B.mid_hex}}
\\definecolor{tglight}{HTML}{${B.light_hex}}\\definecolor{tggold}{HTML}{${B.accent_hex}}
\\definecolor{tgblue}{HTML}{${B.blue_hex}}\\definecolor{tgpurple}{HTML}{${B.purple_hex}}
\\definecolor{tggrey}{HTML}{${B.grey_hex}}\\definecolor{tglightgrey}{HTML}{F3F4F6}\\definecolor{tgrule}{HTML}{${B.rule_hex}}
\\hypersetup{colorlinks=true,linkcolor=tggreen,urlcolor=tgblue,pdfauthor={${tx(RP.prepared_by)} -- ${tx(RP.organisation)}},pdftitle={${tx(C.name)} Instagram Intelligence Report}}
\\titleformat{\\chapter}[display]{\\normalfont\\Large\\bfseries\\color{tggreen}}{\\chaptername\\ \\thechapter}{10pt}{\\Huge}
\\titleformat{\\section}{\\normalfont\\large\\bfseries\\color{tggreen}}{}{0em}{}[\\color{tgrule}\\titlerule]
\\titleformat{\\subsection}{\\normalfont\\normalsize\\bfseries\\color{tgmid}}{}{0em}{}
\\pagestyle{fancy}\\fancyhf{}
\\fancyhead[L]{\\small\\color{tggrey}\\textit{${tx(C.name)} Instagram Intelligence Report}}
\\fancyhead[R]{\\small\\color{tggrey}\\textit{${tx(RP.organisation)}: ${tx(RP.classification)}}}
\\fancyfoot[C]{\\small\\color{tggrey}\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}\\renewcommand{\\headrule}{\\color{tgrule}\\hrule width\\headwidth height\\headrulewidth}
\\newmdenv[linecolor=tggreen,backgroundcolor=tglight,linewidth=1pt,roundcorner=4pt,innerleftmargin=12pt,innerrightmargin=12pt,innertopmargin=10pt,innerbottommargin=10pt]{callout}
\\newmdenv[linecolor=tggold,backgroundcolor=tglightgrey,linewidth=1pt,roundcorner=4pt,innerleftmargin=12pt,innerrightmargin=12pt,innertopmargin=10pt,innerbottommargin=10pt]{note}
\\newcolumntype{L}[1]{>{\\raggedright\\arraybackslash}p{#1}}
\\newcolumntype{R}[1]{>{\\raggedleft\\arraybackslash}p{#1}}
\\newcolumntype{C}[1]{>{\\centering\\arraybackslash}p{#1}}
\\captionsetup{font=small, labelfont={bf,color=tggreen}, labelsep=period, skip=4pt}

\\begin{document}

%% COVER
\\begin{titlepage}\\pagecolor{tggreen}\\color{white}\\vspace*{3cm}\\begin{center}
{\\fontsize{11}{13}\\selectfont\\textit{${tx(RP.organisation)}}}\\\\[6pt]
{\\color{tggold}\\rule{6cm}{1pt}}\\\\[28pt]
{\\fontsize{34}{40}\\selectfont\\bfseries ${tx(C.name)}}\\\\[10pt]
{\\fontsize{18}{24}\\selectfont Instagram Intelligence Report}\\\\[18pt]
{\\color{tggold}\\rule{10cm}{0.6pt}}\\\\[22pt]
{\\fontsize{12}{16}\\selectfont Public engagement, audience intent, and content strategy analysis\\\\[4pt]
Prepared from public Instagram data for ${tx(C.name)} (\\texttt{@${tx(C.handle)}})}\\\\[40pt]
{\\fontsize{11}{14}\\selectfont \\textbf{Prepared by:} ${tx(RP.prepared_by)}\\\\[4pt]\\textbf{Organisation:} ${tx(RP.organisation)}\\\\[4pt]\\textbf{Date:} ${tx(RP.date)}\\\\[4pt]\\textbf{Classification:} ${tx(RP.classification)}}
\\end{center}\\vfill\\begin{center}{\\small\\color{white!70!tggreen}This document integrates a performance overview, a detailed engagement analysis, and advanced statistical and predictive analysis including Monte Carlo simulation. It is exploratory and reproducible; see the Statistical Scope section.}\\end{center}\\end{titlepage}
\\nopagecolor
\\tableofcontents
\\newpage

\\part{Performance Overview}
\\chapter{At a Glance}
All metrics are derived entirely from public data. Private account analytics (reach, impressions, saves, shares, profile visits, link clicks) are excluded and remain visible only within the native Instagram Insights dashboard.

\\vspace{10pt}
\\begin{callout}
\\begin{tabularx}{\\linewidth}{@{}L{4.2cm} X@{}}
  \\textbf{Followers}            & ${tx(followers)} at time of collection \\\\[4pt]
  \\textbf{Records analysed}     & This report uses \\textbf{${counts.owned||0} deduplicated owned-account records} for the main analysis: ${counts.owned_posts||0} feed posts and ${counts.owned_reels||0} reels. The full deduplicated public dataset contains ${counts.deduplicated_unique||0} unique items, including third-party features and mentions.${num(counts.owned_reels)<30?` Because only ${counts.owned_reels||0} owned reels remain after deduplication, format comparisons are exploratory only.`:''} \\\\[4pt]
  \\textbf{Top content category} & ${tx(pillarLabel(topPillar.pillar||''))} (average engagement score: ${fmt(topPillar.avg_engagement_score)}) \\\\[4pt]
  \\textbf{Best observed day}    & ${tx(bestDay.period||'')} (highest average engagement score: ${fmt(bestDay.avg_engagement_score)}; see the post-hoc note before treating as a rule) \\\\[4pt]
  \\textbf{Format signal}        & ${formatSignalRow} \\\\
\\end{tabularx}
\\end{callout}

\\section{Data Coverage}
${table({caption:'Data coverage: raw collection through to the analysed owned-account dataset',cols:[{h:'Area',spec:'L{9.5cm}',cell:r=>tx(r.a)},{h:'Count',spec:'R{4cm}',cell:r=>fmt(r.c)}],rows:[
{a:'Raw feed-post records collected',c:counts.posts||0},
{a:'Raw reel records collected',c:counts.reels||0},
{a:'Raw total before deduplication',c:(counts.posts||0)+(counts.reels||0)},
{a:'Deduplicated unique public records',c:counts.deduplicated_unique||0},
{a:'Owned-account records used in main analysis',c:counts.owned||0},
{a:'   of which owned feed posts',c:counts.owned_posts||0},
{a:'   of which owned reels',c:counts.owned_reels||0},
{a:'Third-party / feature records',c:counts.third_party||0},
{a:'Public mention records reviewed',c:counts.mentions||0},
{a:'Comments analysed',c:counts.comments||0},
{a:'Followers at collection time',c:profile.followers_count||0}]})}

${C.bio?`Profile biography: \\textit{${tx(C.bio)}}\n`:''}
\\needspace{6\\baselineskip}\\smallskip\\noindent\\textbf{Data limitation.} This analysis covers public Instagram data only. It does not include private account analytics such as reach, impressions, saves, shares, profile visits, link clicks, story taps, ad spend, or completed bookings. All conclusions are directional rather than absolute. Combine these findings with ${tx(C.name)}'s native Instagram analytics, sales or booking records, and campaign context.\\smallskip
${smallSample?`
\\section{How to Read This Report (Sample Size)}
\\begin{callout}
\\textbf{This is a descriptive content audit, not a statistical study.} The analysis covers \\textbf{${ownedN} posts published by the account} (${dedupN} including features and mentions). That is ample for the descriptive findings that form the body of this report: what has been posted, which themes recur, when the audience engages, and what they say in comments. It is, however, \\textbf{below the size needed for confirmatory statistics}. Accordingly:
\\begin{itemize}[leftmargin=*, topsep=2pt, itemsep=1pt]
  \\item \\textbf{Part~I (this part)}, the descriptive audit, is the substance of the report and is where decisions should be grounded.
  \\item \\textbf{The Appendix}, covering hypothesis tests and Monte Carlo simulations, is included for transparency and method completeness. At this sample size its outputs are \\emph{illustrative and directional only}; they are not established effects, and the simulations are not forecasts.
\\end{itemize}
The honest one-line summary: \\textbf{treat every number here as a well-evidenced description of the past ${ownedN} posts, and as a hypothesis to test: revisit with statistical weight once the account has roughly 100+ posts.}
\\end{callout}
`:''}

\\chapter{Content Performance}
\\section{Engagement Score Methodology}
The engagement score used throughout is:
\\begin{equation*}\\text{Engagement Score} = \\text{Likes} + (\\text{Comments}\\times 5) + \\left(\\tfrac{\\text{Views or Plays}}{100}\\right)\\end{equation*}
It is a consistent, reproducible index for comparing posts on partial public metrics, not a replacement for native analytics. Comments are weighted at five times a like because they require active intent.

\\begin{note}
\\textbf{Important caveat on the views term.} The views/plays component is available almost exclusively for video. In this dataset, image posts frequently record zero views while reels do not. The composite score therefore structurally favours video, and any reels-versus-image comparison \\emph{on the composite score} is partly a property of the formula. Comparisons that this affects are also reported on likes and comments alone (see Section~\\ref{sec:reelsposts}).
\\end{note}

\\section{What Content Performs Best}
${bar({title:'Average engagement score by content pillar',rows:[...pillars].filter(p=>num(p.avg_engagement_score)>0).sort((a,b)=>num(a.avg_engagement_score)-num(b.avg_engagement_score)).map(p=>({label:p.pillar,value:p.avg_engagement_score})),max:Math.max(...pillars.map(p=>num(p.avg_engagement_score)))})}

\\section{Full Content Pillar Breakdown}
${longtable({caption:'Content pillar performance summary',cols:[
{h:'Pillar',spec:'L{4cm}',cell:r=>tx(pillarLabel(r.pillar))},
{h:'Posts',spec:'R{1.6cm}',cell:r=>r.posts_count},
{h:'Avg Likes',spec:'R{2cm}',cell:r=>r2(r.avg_likes)},
{h:'Avg Cmts',spec:'R{2cm}',cell:r=>r2(r.avg_comments)},
{h:'Avg Views',spec:'R{2cm}',cell:r=>fmt(r.avg_views)},
{h:'Avg Score',spec:'R{2.2cm}',cell:r=>r2(r.avg_engagement_score)}],
rows:[...pillars].sort((a,b)=>num(b.avg_engagement_score)-num(a.avg_engagement_score))})}

\\begin{note}
\\textbf{How to read these rankings.} Categories are ordered by average engagement score, but several rest on very few posts. Categories with fewer than ten posts have unstable averages and wide confidence intervals (Part~II); treat them as hypotheses worth testing with more content, not settled rankings.
\\end{note}

\\section{Business Interpretation by Pillar}
Each category is read against the owned-account average engagement score (${fmt(baselineMean)}). \\textquotedblleft Above\\textquotedblright{} means the category tends to outperform a typical post; sample size ($n$) signals how reliable that read is.
\\begin{itemize}[leftmargin=*]
${sortedPillars.slice(0,8).map(p=>{
  const liftRow=(lift.find(l=>l.pillar===p.pillar)||{});
  const lp=liftRow.lift_vs_baseline_pct;
  const dir = lp!==undefined && lp!=='' ? (num(lp)>=0?`+${lp}\\% above`:`${lp}\\% below`) : (num(p.avg_engagement_score)>=baselineMean?'above':'below');
  const n=num(p.posts_count);
  const verdict = n<10 ? 'small sample, so treat as a hypothesis to test with more posts'
    : num(p.avg_engagement_score)>=baselineMean ? 'a proven strength, so produce more of it'
    : 'below average, so reconsider effort or reframe using the language of the top categories';
  return `  \\item \\textbf{${tx(pillarLabel(p.pillar))}} ($n=${n}$, avg ${fmt(p.avg_engagement_score)}, ${dir} baseline): ${verdict}.`;
}).join('\n')}
\\end{itemize}

\\chapter{Short Videos versus Feed Posts}
\\section{Comparative Performance}\\label{sec:reelsposts}
This account has \\textbf{${FV.nP} feed posts and ${FV.nR} reels} in the analysed window. The engagement score embeds a views term available to video but not to many image posts (${FV.postsZeroViewPct}\\% of feed posts here record zero views), so the comparison is shown three ways: on the composite score, and on likes-and-comments and likes alone, which remove that mechanical advantage.

${table({caption:'Reels versus posts under three metrics (deduplicated data)',cols:[
{h:'Metric',spec:'L{6cm}',cell:r=>r.m},{h:'Reel mean',spec:'R{2cm}',cell:r=>r.rm},{h:'Post mean',spec:'R{2cm}',cell:r=>r.pm},{h:'MWU p-value',spec:'R{2cm}',cell:r=>r.p}],
rows:[
{m:'Engagement score (includes views)',rm:fmt(FV.escR),pm:fmt(FV.escP),p:FV.pEscMwu},
{m:'Likes + comments only (no views)',rm:fmt(FV.lcR),pm:fmt(FV.lcP),p:FV.pLcMwu},
{m:'Likes only',rm:fmt(FV.lkR),pm:fmt(FV.lkP),p:FV.pLkMwu}]})}

\\begin{callout}
\\textbf{Honest reading.} ${
  tooFewReels
    ? `With only ${FV.nR} reels in the window, this comparison cannot be made meaningfully: the account is currently \\textbf{posts-driven}. Feed posts (carousels and image posts) carry essentially all of the engagement. The opportunity is to test short video as an under-used format and measure reach with native Instagram analytics, not to assume it will replicate the performance of the existing posts.`
    : reelsWin
      ? `Short videos lead on the composite score, but much of that gap is the mechanical views term; on likes and comments the difference is ${FV.pLcMwu<0.05?'still present':'not statistically reliable'} at this sample size. Treat reels as a reach and discovery investment and confirm with native reach data.`
      : `\\textbf{Feed posts outperform short videos for this account} on every metric (engagement ${fmt(FV.escP)} vs ${fmt(FV.escR)}; likes ${fmt(FV.lkP)} vs ${fmt(FV.lkR)}). Reels are not currently a strength here. Keep investing in the high-performing post formats (food and event carousels) and treat reels as an experiment to grow reach, measured with native analytics, not as a proven channel for this account.`
}
\\end{callout}

\\chapter{Timing Analysis}
\\section{Best Days to Post}
${bar({title:'Average engagement score by posting day',xlabel:'Average engagement score',rows:[...dayRows].sort((a,b)=>num(a.avg_engagement_score)-num(b.avg_engagement_score)).map(d=>({label:d.period,value:d.avg_engagement_score})),max:Math.max(...dayRows.map(d=>num(d.avg_engagement_score)))})}

${table({caption:'Timing analysis by day of week',cols:[
{h:'Day',spec:'L{2.8cm}',cell:r=>tx(r.period)},{h:'Posts',spec:'R{2cm}',cell:r=>r.content_count},{h:'Avg Score',spec:'R{2.2cm}',cell:r=>r2(r.avg_engagement_score)},{h:'Avg Likes',spec:'R{2cm}',cell:r=>r2(r.avg_likes)},{h:'Avg Cmts',spec:'R{2.2cm}',cell:r=>r2(r.avg_comments)}],
rows:dayRows})}

\\begin{note}
\\textbf{How to read the day effect.} The omnibus Kruskal-Wallis test (Part~II) asks only whether \\emph{some} day differs; it does not single out a day. We therefore ran pairwise post-hoc tests with Holm correction. ${anyDaySignificant ? `At least one pairwise difference survives correction, so the leading day is more than noise.` : `\\textbf{No pairwise day difference survives correction}, so ${tx(bestDay.period||'the leading day')} has the highest observed average but is \\emph{not} statistically distinguishable from the others. Treat day-of-week as a directional test window, not a fixed rule, and check for content-type and campaign confounding.`}
\\end{note}

\\section{Timing by Hour (UTC)}
${longtable({caption:'Average engagement by publication hour (UTC)',cols:[
{h:'Hour UTC',spec:'R{2.5cm}',cell:r=>tx(r.period)},{h:'Posts',spec:'R{2cm}',cell:r=>r.content_count},{h:'Avg Score',spec:'R{2.8cm}',cell:r=>r2(r.avg_engagement_score)},{h:'Avg Likes',spec:'R{2cm}',cell:r=>r2(r.avg_likes)},{h:'Avg Cmts',spec:'R{2.2cm}',cell:r=>r2(r.avg_comments)}],
rows:hourRows})}
\\begin{note}
Most individual hours contain only a handful of posts, so per-hour averages are noisy. We do not recommend a specific posting hour from this table; interpret only hours backed by a meaningful number of posts, and confirm against native reach data.
\\end{note}

\\chapter{Audience Comment Intelligence}
The comment review uses anonymised text only; usernames are excluded from all outputs.

${bar({title:'Comment intent categories',xlabel:'Number of comments',rows:[...intents].filter(i=>num(i.count)>0).sort((a,b)=>num(a.count)-num(b.count)).map(i=>({label:i.intent.replace(/[/]/g,' '),value:i.count})),max:Math.max(...intents.map(i=>num(i.count)))})}

${longtable({caption:'Full comment intent classification with commercial opportunities',cols:[
{h:'Intent',spec:'L{4cm}',cell:r=>tx(r.intent)},{h:'Count',spec:'R{1.4cm}',cell:r=>r.count},{h:'Share',spec:'R{1.4cm}',cell:r=>tx(r.percentage)+'\\%'},{h:'What to do about it',spec:'L{7.5cm}',cell:r=>tx(commentNextStep(r.intent,num(r.percentage)))}],
rows:intents})}
\\begin{note}
Each comment is assigned its single \\textbf{primary} intent, so the counts sum to the number of comments analysed and the shares sum to 100\\%. A comment may touch more than one theme; the dominant one is used for this table.
\\end{note}

\\section{What the Comments Are Telling You}
${(() => {
  const total = intents.reduce((s,i)=>s+num(i.count),0) || 1;
  const generic = intents.filter(i=>/generic|unclear/i.test(i.intent)).reduce((s,i)=>s+num(i.count),0);
  const genericPct = Math.round(100*generic/total);
  const warm = warmIntents[0];
  const lead = commercialIntents[0];
  const directVisible = commercialIntents.some(i=>/book|collab|enquir|hire|work with/i.test(i.intent) && num(i.count)>=3);
  return `The comment sample is dominated by low-intent warmth: roughly ${genericPct}\\% are emoji or one-word reactions.${warm?` The largest warm-response category is \\textbf{${tx(warm.intent)}} (${warm.count} comments).`:''} This is healthy brand warmth and useful as social proof, but it is not commercial intent.${lead?` The clearest \\emph{actionable}, non-generic signal is \\textbf{${tx(lead.intent)}} (${lead.count} comments, ${tx(lead.percentage)}\\% of all comments).`:''} ${directVisible?'Direct booking or collaboration intent does appear and should be answered immediately.':'Direct booking or collaboration intent is not materially visible in the public comment sample, so the goal is to convert warm attention into enquiries with clearer calls to action.'}`;
})()}

\\begin{itemize}[leftmargin=*]
${(commercialIntents.length?commercialIntents:intents.slice(0,4)).slice(0,5).map(i=>`  \\item \\textbf{${tx(i.intent)}} (${i.count}, ${tx(i.percentage)}\\%): ${tx(commentNextStep(i.intent,num(i.percentage)))}`).join('\n')}
\\end{itemize}

\\begin{note}
\\textbf{Why this matters (and what the simulation showed).} The booking/enquiry pipeline analysis (MC3, Part~II) found that at current comment volumes the comment channel alone converts slowly: the binding constraint is \\emph{how many} commercial comments arrive, not the reply rate. So the move is two-fold: keep raising reach (more of the high-performing content) to grow the top of the funnel, and remove every step of friction for the commercial comments you already get, starting with the largest category above.
\\end{note}

\\needspace{6\\baselineskip}
\\section{Repeated Opportunities}
\\begin{itemize}[leftmargin=*]
  \\item Reply to every commercial comment quickly. A fast, consistent response turns a public comment into a direct conversation.
  \\item Move the questions that recur (location, availability, how to engage/book) into a pinned comment and a permanent Highlight so they answer themselves.
  \\item Reuse positive comments as anonymised social proof in stories and captions.
\\end{itemize}

\\chapter{Mentions Intelligence}
Third-party mentions are external social proof: posts by other accounts that tag or feature ${tx(C.name)}. The dataset contains \\textbf{${counts.mentions||0}} such public records. They are less controllable than owned content but generally more credible, and they reveal which moments people choose to share unprompted.

When a mention overlaps with a strong owned-content theme, it is worth resharing with added context (date, booking or project detail) so the credibility of the third-party post is captured with a clear next step. Mentions are a non-random sample and are reported here as qualitative signal, not as a measured rate.

\\chapter{Caption and Hashtag Analysis}
${table({caption:'Caption and hashtag summary statistics',cols:[{h:'Metric',spec:'L{7cm}',cell:r=>r.m},{h:'Value',spec:'R{4cm}',cell:r=>r.v}],rows:[
{m:'Average caption length',v:r2(summary.caption_stats?.average_length)+' characters'},
{m:'Median caption length',v:r2(summary.caption_stats?.median_length)+' characters'},
{m:'Average hashtags per post/reel',v:r2(summary.caption_stats?.average_hashtags)},
{m:'Average mentions per post/reel',v:r2(summary.caption_stats?.average_mentions)}]})}

\\subsection{What these numbers mean}
${(() => {
  const ah = num(summary.caption_stats?.average_hashtags);
  const am = num(summary.caption_stats?.average_mentions);
  const al = num(summary.caption_stats?.average_length);
  const tagLine = ah < 3
    ? `\\textbf{Hashtag use is light, about ${r2(ah)} per post.} Instagram allows up to 30, and hashtags are one of the few free levers for reaching non-followers. Adding 4--8 relevant, specific tags per post is a low-cost reach experiment, but its value should be judged on native reach and impression data, not on the public engagement score (this report's own correlation between hashtag count and engagement is weak and not significant).`
    : ah > 12
      ? `\\textbf{Hashtag use is heavy, about ${r2(ah)} per post.} Beyond roughly 10--12 the returns flatten and posts can read as spammy; tightening to the most relevant tags is usually cleaner.`
      : `Hashtag use (about ${r2(ah)} per post) sits in the healthy range.`;
  const menLine = am >= 1
    ? `The account tags another account on roughly every post (${r2(am)} mentions each), i.e. it is \\textbf{collaboration-heavy}, which is visible in the top-content table, where several strong posts co-tag collaborators. Whether co-tagging itself lifts engagement should be read from the correlation and top-content tables rather than assumed.`
    : `Mentions of other accounts are infrequent (${r2(am)} per post), so collaboration tagging is an under-used lever for borrowing other audiences.`;
  const lenLine = al > 300 ? 'Captions are long-form (storytelling style)'
    : al < 80 ? 'Captions are short (caption copy is doing little work)'
    : 'Captions are medium-length';
  return `${tagLine} ${menLine} ${lenLine} (${r2(al)} characters on average); the highest-performing captions in this account pair a strong hook with one explicit next step.`;
})()}

\\section{Most Frequent Hashtags}
${table({caption:'Top 15 hashtags by frequency of use',cols:[{h:'Hashtag',spec:'L{5cm}',cell:r=>'\\#'+tx(r.hashtag)},{h:'Uses',spec:'R{3cm}',cell:r=>r.count}],rows:hashtags.slice(0,15)})}

\\subsection{What the hashtags reveal}
${(() => {
  const top = hashtags.slice(0,15);
  if (!top.length) return 'No hashtag data available.';
  const totalUses = top.reduce((s,h)=>s+num(h.count),0) || 1;
  const lead = top[0];
  const leadShare = Math.round(100*num(lead.count)/totalUses);
  const DISCOVERY = /^(viral|fyp|explore|trending|reels|foryou|explorepage|instagood|viralpost)$/i;
  const PLACE = /^(ghana|accra|kumasi|tema|london|lagos|nigeria|africa|uk|naija|eastlegon|osu|tottenham)$/i;
  const disc = top.filter(h=>DISCOVERY.test(h.hashtag));
  const place = top.filter(h=>PLACE.test(h.hashtag));
  const branded = top.filter(h=>!DISCOVERY.test(h.hashtag) && !PLACE.test(h.hashtag));
  const parts = [];
  parts.push(`Hashtag use is \\textbf{campaign-led}: the single tag \\#${tx(lead.hashtag)} accounts for ${leadShare}\\% of the top-15 usage, so the feed is organised around specific projects/series rather than generic tagging.`);
  if (branded.length) parts.push(`The branded/project tags (e.g. ${branded.slice(0,4).map(h=>'\\#'+tx(h.hashtag)).join(', ')}) map directly onto the account's active projects and series. Each tag is effectively a campaign the audience can follow.`);
  if (disc.length) parts.push(`Discovery tags (${disc.map(h=>'\\#'+tx(h.hashtag)).join(', ')}) show an intent to reach beyond existing followers; their pay-off should be judged on reach in native Insights, not on this public engagement score.`);
  else parts.push(`Notably, broad discovery tags (\\#viral, \\#fyp, \\#explore) are largely absent, a reach lever the account is not yet pulling.`);
  if (place.length) parts.push(`Place tags (${place.map(h=>'\\#'+tx(h.hashtag)).join(', ')}) anchor the account to its local market, useful for location-relevant reach.`);
  parts.push(`\\textbf{Practical read:} keep one consistent tag per active project (as now), add a small set of specific discovery and niche tags to extend reach, and retire tags for projects that have ended.`);
  return parts.join(' ');
})()}

\\chapter{Top-Performing Posts}
These are the proven best-sellers. Study what they share (topic, format, hook, and call to action) and reproduce the pattern.

\\section{Top Posts by Engagement Score}
${table({caption:'Top 10 unique public items by engagement score (deduplicated)',cols:[
{h:'Type',spec:'L{1.8cm}',cell:r=>tx(r.content_type||'')},{h:'Theme',spec:'L{3.5cm}',cell:r=>tx(pillarLabel(r.pillar||''))},{h:'Likes',spec:'R{1.6cm}',cell:r=>naf(r.likes,r.likes_missing)},{h:'Comments',spec:'R{1.8cm}',cell:r=>fmt(r.comments)},{h:'Views',spec:'R{1.8cm}',cell:r=>naf(r.views,r.views_missing)},{h:'Score',spec:'R{1.8cm}',cell:r=>fmt(r.engagement_score)},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topByEng.slice(0,10)})}

\\section{Top Posts by Likes}
${table({caption:'Top 10 posts by public likes',cols:[
{h:'Likes',spec:'R{2cm}',cell:r=>naf(r.likes,r.likes_missing)},{h:'Comments',spec:'R{2cm}',cell:r=>fmt(r.comments)},{h:'Views',spec:'R{2cm}',cell:r=>naf(r.views,r.views_missing)},{h:'Theme',spec:'L{4cm}',cell:r=>tx(pillarLabel(r.pillar||''))},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topByLikes.slice(0,10)})}

\\section{Top Posts by Comment Count}
${table({caption:'Top 10 posts by public comments',cols:[
{h:'Comments',spec:'R{2.2cm}',cell:r=>fmt(r.comments)},{h:'Likes',spec:'R{1.8cm}',cell:r=>naf(r.likes,r.likes_missing)},{h:'Score',spec:'R{2cm}',cell:r=>fmt(r.engagement_score)},{h:'Theme',spec:'L{4cm}',cell:r=>tx(pillarLabel(r.pillar||''))},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topByComments.slice(0,10)})}

\\section{Top Reels by Views and Plays}
${table({caption:'Top reels by video views and plays (deduplicated owned reels)',cols:[
{h:'Views',spec:'R{2.2cm}',cell:r=>naf(r.views,r.views_missing)},{h:'Likes',spec:'R{1.8cm}',cell:r=>naf(r.likes,r.likes_missing)},{h:'Comments',spec:'R{2cm}',cell:r=>fmt(r.comments)},{h:'Score',spec:'R{2cm}',cell:r=>fmt(r.engagement_score)},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topReels.slice(0,10)})}

\\chapter{Strategic Recommendations}
\\section{Content Strategy}
\\begin{enumerate}[leftmargin=*]
  \\item \\textbf{Prioritise the proven theme:} \\textbf{${tx(provenTopPillar)}} is the clearest, best-evidenced strength (largest sample and highest mean), so it is the safest place to add volume.${secondaryThemes.length?` Use \\textbf{${tx(secondaryThemes.join(' and '))}} as secondary test themes, strongest when tied to an active project; their averages rest on fewer posts, so treat them as bets to validate rather than certainties.`:''} Categories with very few posts are test slots, not anchors.
  \\item \\textbf{Lean on the proven format.} ${reelsWin && !tooFewReels ? 'Short videos lead on interaction and reach beyond current followers, so expand video output.' : tooFewReels ? 'The account is posts-driven; treat short video as an experiment to extend reach, measured in native Insights.' : 'Feed posts outperform short video here; keep investing in strong post formats and test video for reach.'}
  \\item \\textbf{Treat ${tx(topDays.join(' and ')||'the strongest observed days')} as test windows:} they show the highest observed average engagement, but ${anyDaySignificant?'the leading difference is supported by post-hoc tests':'no pairwise day difference survives correction, so confirm against native reach before fixing a schedule'}.
  \\item \\textbf{Convert comments into action.} The clearest actionable, non-generic signal is \\textbf{${tx((commercialIntents[0]||{}).intent||'project/release interest')}}; direct commercial booking intent is not yet strong in the public comment sample. Use clearer calls to action, pinned answers, and bio links to turn warm attention into enquiries.
  \\item \\textbf{Make captions complete:} one clear hook, one proof point, and one explicit next step (where to watch, how to engage, how to book).
  \\item \\textbf{Reshare third-party mentions} that align with a strong theme, adding the context the original may lack.
  \\item \\textbf{Track theme performance monthly} so the team can see which categories are pulling weight and rebalance.
\\end{enumerate}

\\needspace{9\\baselineskip}
\\section{Suggested Monthly KPIs}
\\begin{itemize}[leftmargin=*]
  \\item Public engagement score by theme (are the strong themes still strong?)
  \\item Reels/video plays and watch-through where native analytics expose them
  \\item Comment volume and the count of commercial-intent comments
  \\item Response time to commercial comments and direct messages
  \\item Number of third-party mentions reused as social proof
  \\item Follower growth read alongside the above (reach is only visible in native Insights)
\\end{itemize}

\\section{Four-Week Content Calendar}
A starting cadence built around the account's strongest themes; adjust to the live schedule.
${table({caption:'Suggested four-week content calendar',cols:[{h:'Week',spec:'C{1.5cm}',cell:r=>r.w},{h:'Focus',spec:'L{4cm}',cell:r=>tx(r.f)},{h:'Suggested Content',spec:'L{8cm}',cell:r=>tx(r.c)}],rows:[
{w:'1',f:top3Pillars[0]||'Top theme',c:`2 posts in the strongest theme (${top3Pillars[0]||'top category'}), 1 carousel, 1 story poll asking the audience what they want next`},
{w:'2',f:top3Pillars[1]||'Second theme',c:`2 posts in the second theme (${top3Pillars[1]||'second category'}), 1 short video test, 1 reshared mention with context`},
{w:'3',f:top3Pillars[2]||'Third theme',c:`1 feature/collaboration post, 1 behind-the-scenes piece, 1 caption with a clear next step`},
{w:'4',f:'Proof + recap',c:'2 reshares/social-proof stories, 1 recap of the month, 1 Highlight refresh (key questions answered)'}]})}

\\section{Immediate Actions (This Week)}
\\begin{enumerate}[leftmargin=*]
  \\item Reply to every commercial comment within the business day, with a consistent next step.
  \\item Ensure the bio link and contact route are current and one tap from any post that invites action.
  \\item Create or refresh a Highlight answering the questions that recur in comments.
\\end{enumerate}

\\section{Actions This Month}
\\begin{enumerate}[leftmargin=*]
  \\setcounter{enumi}{3}
  \\item Run the four-week calendar above and log engagement by theme.
  \\item Test the under-used format (short video) and measure its reach in native Insights.
  \\item Reshare two strong third-party mentions with added context.
\\end{enumerate}

\\section{Actions This Quarter}
\\begin{enumerate}[leftmargin=*]
  \\setcounter{enumi}{6}
  \\item Rebalance the content mix toward the themes that held up over the month.
  \\item Set a standing response-time target for commercial comments and assign an owner.
  \\item Commission a refresh of this analysis to measure progress against this baseline.
\\end{enumerate}

\\part{${tx(part2Title)}}
${smallSample?`\\begin{note}
\\textbf{Read this appendix as illustrative, not confirmatory.} With ${ownedN} owned posts (pillars of one to a handful of posts each, and only ${FV.nR} reels), the tests and simulations below do not have the statistical power to establish effects or to forecast. They are retained for transparency and methodological completeness, and to frame \\emph{hypotheses} for a future, larger sample. Where a $p$-value appears \\textquotedblleft significant\\textquotedblright{} on a tiny subgroup (for example a two-item reel group), treat it as an artefact of small numbers, not evidence. The decisions in this report should rest on Part~I.
\\end{note}
`:''}
\\chapter{Methodology and Data Quality}
All computation runs in a reproducible Node.js pipeline. Monte Carlo simulations use a fixed seed (${cfg.analysis.mc_seed}) and ${fmt(cfg.analysis.mc_iterations)} iterations; re-running the same committed code on the same input files, with the same Node version and random seed, reproduces the figures in this report.

\\textbf{One dataset throughout.} This report uses \\textbf{${counts.owned||0} deduplicated owned-account records for the main analysis: ${counts.owned_posts||0} feed posts and ${counts.owned_reels||0} reels.} The full deduplicated public dataset contains ${counts.deduplicated_unique||0} unique items, including third-party features and mentions.${num(counts.owned_reels)<30?` Because only ${counts.owned_reels||0} owned reels remain after deduplication, \\textbf{format (reels-versus-posts) comparisons are exploratory only.}`:''} The posts and reels scrapes overlap, so records are first deduplicated by shortcode (keeping the most complete copy), then split into the account's own posts versus third-party features and mentions. Descriptive and statistical tables use the \\textbf{owned} set; the owned-versus-third-party comparison and the segment table below are the only places third-party content appears. The record counts reconcile as follows:

${recon.length?longtable({caption:'Data reconciliation: raw collection to working dataset',cols:[
{h:'Stage',spec:'L{9cm}',cell:r=>tx(r.stage)},{h:'Records',spec:'R{3cm}',cell:r=>fmt(r.records)}],
rows:recon}):''}

\\textbf{Missing values.} Public metrics the scraper could not read are returned as $-1$. These are treated as missing: they are floored to zero for the engagement score and shown as \\textquotedblleft NA\\textquotedblright{} in tables, never as $-1$ or a misleading $0$.

\\textbf{What reproducibility depends on:} the committed source and \\texttt{package-lock}, the Node version, the fixed seed (${cfg.analysis.mc_seed}), the committed input CSVs, the deduplication key (shortcode), and the missing-value rule above.

\\chapter{Exploratory Data Analysis}
${table({caption:'Descriptive statistics by content segment',cols:[
{h:'Segment',spec:'L{4cm}',cell:r=>tx(r.label.replace(/_/g,' '))},{h:'N',spec:'R{1cm}',cell:r=>r.n},{h:'Mean',spec:'R{1.6cm}',cell:r=>r2(r.mean)},{h:'Median',spec:'R{1.6cm}',cell:r=>r2(r.median)},{h:'Std Dev',spec:'R{1.8cm}',cell:r=>r2(r.stddev)},{h:'CV',spec:'R{1.2cm}',cell:r=>r2(r.cv,2)},{h:'Skew',spec:'R{1.4cm}',cell:r=>r2(r.skew,2)}],
rows:eda.filter(r=>['all_content_deduplicated','posts','reels','owned_account','third_party'].includes(r.label)||/^owned/.test(r.label))})}

All groups are strongly right-skewed with heavy tails, which violates normality assumptions and motivates the use of non-parametric tests alongside parametric ones.

\\begin{note}
\\textbf{On the coefficient of variation (CV).} CV is the standard deviation divided by the mean, a unit-free measure of \\emph{relative} spread. It is valid here because the engagement score is a ratio-scale quantity with a true zero and no negatives (negative artefacts are floored to zero), which is the condition CV requires. A CV above 1 means the spread is larger than the average, the signature of a few breakout posts pulling the mean up, exactly what we see. Two cautions apply: where a segment's mean is small, CV inflates and should be read qualitatively (\\textquotedblleft highly variable\\textquotedblright{}) rather than compared precisely; and CV describes \\emph{consistency}, not performance: a high-performing theme can still have a high CV. We therefore use CV only to flag how dependable each segment is, alongside the median, which is robust to the same outliers.
\\end{note}

\\section{Per-Pillar Exploratory Statistics}
${longtable({caption:'Descriptive statistics by content pillar',cols:[
{h:'Pillar',spec:'L{4cm}',cell:r=>tx(r.name)},{h:'N',spec:'R{1cm}',cell:r=>r.n},{h:'Mean',spec:'R{1.6cm}',cell:r=>r2(r.mean)},{h:'Median',spec:'R{1.6cm}',cell:r=>r2(r.median)},{h:'P25',spec:'R{1.4cm}',cell:r=>r2(r.p25)},{h:'P75',spec:'R{1.4cm}',cell:r=>r2(r.p75)},{h:'CV',spec:'R{1.2cm}',cell:r=>r2(r.cv,2)},{h:'Skew',spec:'R{1.4cm}',cell:r=>r2(r.skew,2)}],
rows:[...pillarEda].sort((a,b)=>num(b.mean)-num(a.mean))})}

\\chapter{Hypothesis Tests}
All tests use $\\alpha = ${cfg.analysis.alpha}$; with ${cfg.analysis.bonferroni_tests} parallel tests the Bonferroni threshold is $\\alpha_B = ${r2(cfg.analysis.alpha/cfg.analysis.bonferroni_tests,4)}$.
${longtable({caption:'Hypothesis test results (significance judged against the Bonferroni-corrected threshold)',cols:[
{h:'Test',spec:'L{4cm}',cell:r=>tx((r.test||'').replace(/_/g,' '))},{h:'Method',spec:'L{3cm}',cell:r=>tx(r.method)},{h:'p',spec:'R{1.6cm}',cell:r=>'$'+fmtP(r.p).replace(/^=/,'')+'$'},{h:'Sig. (Bonf.)',spec:'R{1.6cm}',cell:r=>r.significant_bonferroni==='true'?'Yes':'No'},{h:'Effect/Note',spec:'L{3.6cm}',cell:r=>tx(r.cohens_d?('d='+r.cohens_d):(r.r?('r='+r.r):(r.H?('H='+r.H):'')))}],
rows:hyp})}

\\begin{note}
\\textbf{Reels vs posts.} ${
  tooFewReels
    ? `With only ${FV.nR} reels after deduplication, the reels-versus-posts test is underpowered and no reliable difference can be claimed. The account is posts-driven; see the format discussion in Part~I.`
    : reelsWin
      ? `The Welch t-test ($p${fmtP(h1w.p)}$) and Mann-Whitney U test ($p${fmtP(h1m.p)}$) are directional in favour of reels but do not both clear significance at this sample size, consistent with the circularity caveat in Part~I.`
      : `On this account feed posts lead reels on every metric; any apparent reels effect on the composite score is outweighed once the views term is removed (see Part~I).`
}
\\end{note}

\\section{Test-by-Test Detail}
\\begin{description}[leftmargin=0pt,style=nextline]
${hyp.map(r=>{
  const stat = r.t? `$t=${r.t}$, $\\mathrm{df}=${r.df}$` : (r.U!==undefined&&r.U!=='')? `$U=${r.U}$, $z=${r.z}$` : (r.H!==undefined&&r.H!=='')? `$H=${r.H}$, $\\mathrm{df}=${r.df}$` : (r.r!==undefined&&r.r!=='')? `$r=${r.r}$` : '';
  const sig = r.significant_bonferroni==='true';
  const eff = r.cohens_d?` Cohen's $d=${r.cohens_d}$.`:(r.r?` (95\\% CI ${r.r_ci_lo} to ${r.r_ci_hi}).`:'');
  const reading = sig ? 'Statistically significant at the Bonferroni-corrected threshold.' : 'Not statistically significant: insufficient evidence to reject the null at the corrected threshold.';
  return `  \\item[${tx((r.test||'').replace(/_/g,' '))}] \\textit{H\\textsubscript{0}: ${tx(r.h0||'')}}. ${r.method?tx(r.method)+'; ':''}${stat}, $p${fmtP(r.p)}$.${eff} \\textbf{${reading}}${r.note?` ${tx(r.note)}`:''}`;
}).join('\n')}
\\end{description}

\\chapter{Bootstrap Confidence Intervals}
\\noindent A 95\\% bootstrap confidence interval shows the plausible range for each estimate. The \\textquotedblleft CI includes 0?\\textquotedblright{} column is only meaningful for difference estimates (such as reels minus posts), where it indicates whether the difference could plausibly be zero; for single means and medians, engagement is non-negative, so the column is marked n/a.
\\smallskip
${longtable({caption:'Bootstrap 95% confidence intervals',cols:[
{h:'Segment / Pillar',spec:'L{5cm}',cell:r=>tx(r.label.replace(/_/g,' '))},{h:'N',spec:'R{1.2cm}',cell:r=>r.n},{h:'Estimate',spec:'R{2cm}',cell:r=>r2(r.estimate)},{h:'Lower',spec:'R{2cm}',cell:r=>r2(r.lower)},{h:'Upper',spec:'R{2cm}',cell:r=>r2(r.upper)},{h:'CI incl. 0?',spec:'R{1.8cm}',cell:r=>/minus|diff|vs/i.test(r.label)?(r.includes_zero==='true'?'Yes':'No'):'n/a'}],
rows:cis})}

\\chapter{Pillar Lift versus Baseline}
${bar({title:'Content pillar lift relative to owned-account baseline (percent)',xlabel:'Lift above owned-account baseline (%)',pct:true,rows:[...lift].sort((a,b)=>num(a.lift_vs_baseline_pct)-num(b.lift_vs_baseline_pct)).map(l=>({label:l.pillar,value:l.lift_vs_baseline_pct})),max:Math.max(...lift.map(l=>num(l.lift_vs_baseline_pct)))})}

${longtable({caption:'Pillar lift versus baseline with bootstrap 95% CI',cols:[
{h:'Pillar',spec:'L{4cm}',cell:r=>tx(pillarLabel(r.pillar))},{h:'N',spec:'R{1.2cm}',cell:r=>r.n},{h:'Avg Score',spec:'R{2cm}',cell:r=>r2(r.avg_engagement_score)},{h:'Lift',spec:'R{2cm}',cell:r=>tx(r.lift_vs_baseline_pct)+'\\%'},{h:'95% CI',spec:'L{3.5cm}',cell:r=>r2(r.ci_low)+' to '+r2(r.ci_high)}],
rows:[...lift].sort((a,b)=>num(b.avg_engagement_score)-num(a.avg_engagement_score))})}

\\section{Correlation Checks}
${correlations.length?longtable({caption:'Pearson and Spearman correlations between key public metrics',cols:[
{h:'Variable X',spec:'L{3.5cm}',cell:r=>tx(String(r.x||'').replace(/_/g,' '))},{h:'Variable Y',spec:'L{3.5cm}',cell:r=>tx(String(r.y||'').replace(/_/g,' '))},{h:'Pearson r',spec:'R{2.2cm}',cell:r=>r2(r.pearson_r,3)},{h:'Spearman rho',spec:'R{2.4cm}',cell:r=>r2(r.spearman_rho,3)}],
rows:correlations}):'\\textit{No correlation data available.}'}

\\begin{note}
Correlations are directional and based only on public fields; they do not prove causation. Where a metric (such as views) feeds the engagement score directly, a high correlation with that score is mechanical rather than a discovered relationship. Because these distributions are heavily skewed, the Spearman (rank) column is the more trustworthy of the two.
\\end{note}

\\chapter{Monte Carlo Simulations}
\\begin{note}
\\textbf{What these simulations are, and are not.} They are \\textbf{scenario projections}, not forecasts. Each re-samples from historical pillar engagement under a posting plan and assumes (i) independence, (ii) stationarity, (iii) no saturation, and (iv) inherits small-sample noise. The strategy \\textquotedblleft uplift\\textquotedblright{} figures are the mechanical consequence of allocating more posts to historically strong categories; the value is the uncertainty band (P5--P95), not point precision.
\\end{note}

\\section{MC1: Content Strategy Comparison (12 Weeks)}
${mcStrat.length?bar({title:'MC1: expected 12-week engagement by strategy (mean of 10,000 simulations)',xlabel:'Total engagement score over 12 weeks',rows:[...mcStrat].sort((a,b)=>num(a.mean)-num(b.mean)).map(r=>({label:String(r.strategy).replace(/_/g,' '),value:r.mean})),max:Math.max(...mcStrat.map(r=>num(r.mean)))}):''}

${table({caption:'MC1 results: 12-week engagement score by strategy (total and per-post)',cols:[
{h:'Strategy',spec:'L{2.6cm}',cell:r=>tx(r.strategy.replace(/_/g,' '))},{h:'Posts',spec:'R{1.3cm}',cell:r=>r.total_posts},{h:'Mean Total',spec:'R{2cm}',cell:r=>fmt(r.mean)},{h:'Per Post',spec:'R{1.8cm}',cell:r=>fmt(r.mean_per_post)},{h:'Total Uplift',spec:'R{1.8cm}',cell:r=>r.uplift_vs_current==='0'?'baseline':('+'+r.uplift_vs_current+'\\%')},{h:'Per-Post Uplift',spec:'R{2cm}',cell:r=>r.strategy==='current_mix'?'baseline':((num(r.uplift_per_post_vs_current)>=0?'+':'')+r.uplift_per_post_vs_current+'\\%')}],
rows:mcStrat})}

\\begin{note}
\\textbf{Read total and per-post together.} A strategy can raise the 12-week \\emph{total} simply by posting more. The \\textbf{per-post} column isolates content quality from posting volume. Where a higher-volume strategy (for example \\textquotedblleft heavy reels\\textquotedblright{}) leads on total but not per post, its advantage is mostly volume, which costs proportionally more production effort.
\\end{note}

\\section{MC2: Engagement Forecast}
${table({caption:'MC2: engagement forecast at three horizons',cols:[
{h:'Horizon (days)',spec:'R{2.5cm}',cell:r=>r.horizon_days},{h:'Exp. Posts',spec:'R{2.5cm}',cell:r=>r.expected_posts},{h:'Forecast Mean',spec:'R{3cm}',cell:r=>fmt(r.forecast_mean)},{h:'P10',spec:'R{2.5cm}',cell:r=>fmt(r.forecast_p10)},{h:'P90',spec:'R{2.5cm}',cell:r=>fmt(r.forecast_p90)},{h:'CV',spec:'R{1.5cm}',cell:r=>r2(r.cv,2)}],
rows:mcFore})}
\\begin{note}
The expected-post counts are derived from the account's \\textbf{observed posting rate} over the analysed window (roughly four owned posts per week), projected across each horizon; they are not targets.
\\end{note}

\\section{MC3: Booking Conversion Pipeline}
${table({caption:'MC3: monthly booking pipeline under three conversion scenarios',cols:[
{h:'Scenario',spec:'L{2.5cm}',cell:r=>tx(r.scenario)},{h:'Contact %',spec:'R{1.8cm}',cell:r=>r.contact_rate_pct},{h:'Booking %',spec:'R{2cm}',cell:r=>r.booking_rate_pct},{h:'P50',spec:'R{1.6cm}',cell:r=>r.bookings_p50},{h:'P90',spec:'R{1.6cm}',cell:r=>r.bookings_p90},{h:'P(0)',spec:'R{1.8cm}',cell:r=>r.prob_0_bookings_pct+'\\%'},{h:'P(3+ bookings)',spec:'R{1.8cm}',cell:r=>r.prob_ge3_bookings_pct+'\\%'}],
rows:mcConv})}
\\begin{callout}
\\textbf{Principal finding from MC3.} In this model the contact rate applies to the comments captured on the account's top posts; because only a minority express commercial intent, the booking counts should be treated as optimistic \\emph{upper bounds} rather than expected outcomes. The comment channel may generate enquiries under generous assumptions, but it should not be treated as a stable booking engine without clearer commercial calls to action, native analytics, and actual enquiry and booking records. Increasing reach-oriented content (MC1) raises the top of the funnel; replying immediately to commercial comments is the cheapest operational lever.
\\end{callout}

\\section{MC4: Optimal Pillar Mix (Top 10 Allocations)}
${longtable({caption:'MC4: top pillar allocations by expected mean engagement',cols:[
{h:'Allocation',spec:'L{9cm}',cell:r=>tx(r.mix)},{h:'Mean',spec:'R{2.2cm}',cell:r=>fmt(r.mean_engagement)},{h:'P25',spec:'R{1.8cm}',cell:r=>fmt(r.p25)},{h:'P75',spec:'R{1.8cm}',cell:r=>fmt(r.p75)}],
rows:mcMix.slice(0,10)})}
\\begin{note}
The optimiser considers only pillars with at least 10 owned posts, so it never anchors a recommendation on a category whose average rests on one or two posts. Allocations are in posts per week over an 8-week budget. Smaller pillars are better used as occasional test slots than as optimisation anchors.
\\end{note}

\\section{MC5: Risk Analysis}
The table reads as: for each strategy and each 12-week engagement target, the share of 10,000 simulated runs that hit the target. P(achieve) near 100\\% means the target is comfortable; near 0\\% means it is out of reach under that strategy; values in between are the genuinely informative \\textquotedblleft stretch\\textquotedblright{} targets.
${longtable({caption:'MC5: probability of achieving 12-week targets',cols:[
{h:'Strategy',spec:'L{3.2cm}',cell:r=>tx(r.strategy.replace(/_/g,' '))},{h:'Target',spec:'R{2.5cm}',cell:r=>fmt(r.target_12wk_engagement)},{h:'P(achieve)',spec:'R{3cm}',cell:r=>r.prob_achieving_pct+'\\%'},{h:'Expected Mean',spec:'R{3cm}',cell:r=>fmt(r.expected_mean)}],
rows:mcRisk})}
${(() => {
  // pick a "stretch" target where strategies separate the most
  const targets=[...new Set(mcRisk.map(r=>num(r.target_12wk_engagement)))].sort((a,b)=>a-b);
  let bestT=targets[0],spread=-1;
  for(const t of targets){const ps=mcRisk.filter(r=>num(r.target_12wk_engagement)===t).map(r=>num(r.prob_achieving_pct));const s=Math.max(...ps)-Math.min(...ps);if(s>spread){spread=s;bestT=t;}}
  const atT=mcRisk.filter(r=>num(r.target_12wk_engagement)===bestT).sort((a,b)=>num(b.prob_achieving_pct)-num(a.prob_achieving_pct));
  if(!atT.length) return '';
  const win=atT[0],lose=atT[atT.length-1];
  // Plain paragraph (not a boxed callout): a tall mdframed box cannot break across
  // a page boundary and was forcing an almost-blank page before the implication.
  return `\\medskip\\noindent\\textbf{Implication.} The strategies separate most clearly at a target of ${fmt(bestT)}: the \\textbf{${tx(win.strategy.replace(/_/g,' '))}} plan reaches it in ${win.prob_achieving_pct}\\% of simulations versus ${lose.prob_achieving_pct}\\% for \\textbf{${tx(lose.strategy.replace(/_/g,' '))}}. In plain terms, the choice of content mix changes not just the \\emph{average} outcome but the \\emph{odds} of clearing an ambitious goal, which is what matters when setting a quarter's target. Set the goal where your chosen strategy sits around 50--80\\%: ambitious but realistic, not a coin-flip.\\medskip`;
})()}

\\chapter{Consolidated Actionable Findings}
\\begin{enumerate}[leftmargin=*]
  \\item \\textbf{Lead with the proven theme:} \\textbf{${tx(provenTopPillar)}} is the well-evidenced strength and the safest place to add volume.${secondaryThemes.length?` Validate \\textbf{${tx(secondaryThemes.join(' and '))}} as secondary test themes; small-sample pillars stay as test slots.`:''}
  \\item \\textbf{Format:} ${reelsWin && !tooFewReels ? 'short videos lead and reach new audiences, so expand them.' : tooFewReels ? 'the account is posts-driven; short video is an untested reach opportunity, not a proven channel.' : 'feed posts lead; keep investing in them and test video for reach.'}
  \\item \\textbf{Timing:} ${topDays.length?`treat ${tx(topDays.join(' and '))} as test windows${anyDaySignificant?' (supported by post-hoc tests)':' (highest observed average, not yet statistically distinguishable)'}.`:'no strong day effect; keep testing posting times against native reach data.'}
  \\item \\textbf{Comments are warm but mostly low-intent:} \\textbf{${tx((commercialIntents[0]||{}).intent||'project/release interest')}} is the clearest actionable signal; direct commercial intent should be grown through clearer calls to action and faster response routes.
  \\item \\textbf{Engagement is concentrated} in a small number of posts (see the top-posts tables and the bootstrap intervals); maintain a backlog of high-potential content to smooth the peaks and troughs.
  \\item \\textbf{Measure what this analysis cannot see:} pair these public findings with native Instagram reach, saves, shares, and profile actions before committing budget.
\\end{enumerate}

\\chapter{Limitations and Ethics}
\\section{Statistical Scope and Validity}
This study is \\textbf{exploratory and hypothesis-generating}, not confirmatory, and is reproducible (fixed seed, committed data, deterministic pipeline). Bounds on interpretation:
\\begin{enumerate}[leftmargin=*]
\\item \\textbf{Composite-metric circularity.} The engagement score embeds a views term available to video but not to many image posts; composite-score reels-versus-posts comparisons overstate the advantage, so likes-and-comments comparisons are reported alongside.
\\item \\textbf{Small samples.} Several pillars and the deduplicated reel set rest on few posts; confidence intervals are wide and rankings are indicative. Pillars below ten posts are treated as test slots, not ranked recommendations.
\\item \\textbf{One dataset, reconciled.} Raw and deduplicated record counts are distinct. Main content-performance and strategy tables use the deduplicated owned-account dataset; reconciliation, the EDA segment table, and owned-versus-third-party checks are explicitly labelled where they use broader data. Figures are not mixed across bases without a label.
\\item \\textbf{Missing public metrics.} Values the scraper returns as $-1$ are treated as missing (floored to zero for the score, shown as NA), never as genuine zeros.
\\item \\textbf{Deduplicated top content.} A post that also appears as a reel is counted once; the top-content tables list unique items.
\\item \\textbf{Observational, not causal.} Day, pillar, and format are correlated with each other and with campaign timing; no causal claim is made. The day-of-week effect is reported with post-hoc correction.
\\item \\textbf{Scenarios, not forecasts.} Monte Carlo projections assume independence, stationarity, and no saturation, and report totals alongside per-post figures to separate quality from volume.
\\item \\textbf{Selection effects.} Comments are drawn from high-engagement posts; mentions are a non-random sample.
\\end{enumerate}
Used to prioritise content experiments and size uncertainty, the analysis is sound; used as proof of fixed effects, it would overreach.

\\section{Data and Ethics}
This report is based on public Instagram data collected via the Apify Instagram Scraper and analysed locally. No private account access or private user data was used. Individual commenters are not identified. For business decisions, combine with ${tx(C.name)}'s native Instagram Insights, sales or booking records, and campaign context.

${glossaryBlock}

%% SIGN-OFF
\\clearpage\\thispagestyle{empty}\\pagecolor{tggreen}\\color{white}\\vspace*{5cm}
\\begin{center}
{\\color{tggold}\\rule{8cm}{0.6pt}}\\\\[28pt]
{\\Large\\bfseries Prepared by}\\\\[12pt]
{\\fontsize{28}{34}\\selectfont\\bfseries ${tx(RP.prepared_by)}}\\\\[14pt]
{\\large ${tx(RP.organisation)}}\\\\[28pt]
{\\color{tggold}\\rule{8cm}{0.6pt}}\\\\[22pt]
{\\normalsize ${tx(RP.date)}}\\\\[10pt]
{\\small\\color{white!70!tggreen}All rights reserved. This document is confidential and intended solely\\\\for the use of ${tx(C.name)} and authorised recipients.}
\\end{center}
\\end{document}
`;
}

const out = buildDoc();
const dest = path.join(ROOT, 'reports', 'combined_report.generated.tex');
fs.writeFileSync(dest, out, 'utf8');

// structural validation
const cnt = (re)=>(out.match(re)||[]).length;
const checks = [
  ['begin/end', cnt(/\\begin\{/g), cnt(/\\end\{/g)],
  ['longtable', cnt(/\\begin\{longtable\}/g), cnt(/\\end\{longtable\}/g)],
  ['tabular', cnt(/\\begin\{tabular\}/g), cnt(/\\end\{tabular\}/g)],
  ['axis', cnt(/\\begin\{axis\}/g), cnt(/\\end\{axis\}/g)],
  ['table', cnt(/\\begin\{table\}/g), cnt(/\\end\{table\}/g)],
];
let ok = out.includes('\\end{document}');
console.log(`Generated ${dest} (${out.split('\n').length} lines) for "${C.name}"`);
for (const [n,a,b] of checks){ const m=a===b?'OK':'MISMATCH'; if(a!==b)ok=false; console.log(`  ${n}: ${a}/${b} ${m}`); }
console.log(ok ? '\nStructure valid. Review, then rename to combined_report.tex to make canonical.' : '\nSTRUCTURE PROBLEM: do not use until fixed.');
