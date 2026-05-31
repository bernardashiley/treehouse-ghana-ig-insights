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
function pillarLabel(p){const M={'food':'Food and Dining','cocktails/drinks':'Cocktails and Drinks','ambience/decor/vibe':'Ambience and Vibe','date night/romance':'Date Night and Romance','birthdays/celebrations':'Birthdays and Celebrations','brunch/lunch':'Brunch and Lunch','dinner/nightlife':'Dinner and Nightlife','events/live music/DJ':'Events and Live Music','customer/influencer/social proof':'Social Proof','promotions/offers':'Promotions and Offers','reservations/bookings':'Reservations and Bookings','location/parking/access':'Location and Access','service/wait time':'Service','price/value':'Price and Value','general brand/content':'General Brand'};return M[p]||p;}
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

const counts = summary.counts || {};
const profile = summary.profile || {};
const followers = fmt(profile.followers_count || 0);

// ── Data-conditional format comparison (reels vs posts) ───────────────────────
// Computed from the cleaned data so the narrative adapts to each client instead
// of assuming the Treehouse (reels-leaning) result.
function fmtVerdict(){
  const cl=readCsv('data/processed/posts_clean.csv').concat(readCsv('data/processed/reels_clean.csv'));
  const seen=new Map();
  for(const r of cl){const k=r.shortcode||r.id;if(!seen.has(k)||num(r.engagement_score)>num(seen.get(k).engagement_score))seen.set(k,r);}
  const all=[...seen.values()];
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
const reelsWin = FV.escR > FV.escP;
const tooFewReels = FV.nR < 5;
const formatSignalRow = tooFewReels
  ? `Only ${FV.nR} reels in the analysed window --- too few to compare; this account is posts-driven`
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
\\multicolumn{${cols.length}}{c}{\\tablename\\ \\thetable{} --- continued} \\\\
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
const top3Pillars  = sortedPillars.slice(0,3).map(p=>pillarLabel(p.pillar));
const baselineMean = num((edaBy.all_content_deduplicated||{}).mean) || num((edaBy.owned_account||{}).mean) || 0;
const pillarEda    = eda.filter(r=>/^pillar:/.test(r.label)).map(r=>({...r,name:pillarLabel(r.label.replace(/^pillar:/,''))}));
const sortedDays   = [...dayRows];
const topDays      = sortedDays.slice(0,2).map(d=>d.period).filter(Boolean);
// commercial comment intents (exclude generic/unclear/praise) ranked by count
const commercialIntents = [...intents].filter(i=>!/generic|unclear|praise/i.test(i.intent) && num(i.count)>0).sort((a,b)=>num(b.count)-num(a.count));
const topIntent    = (commercialIntents[0]||intents[0]||{});
const tlink = u => u ? `\\href{${u}}{view}` : '';
// Static glossary asset (generic statistical terms) injected before sign-off.
const glossaryPath = path.join(ROOT,'assets','glossary.tex');
const glossaryBlock = fs.existsSync(glossaryPath) ? fs.readFileSync(glossaryPath,'utf8') : '';

return `%% ============================================================
%%  ${C.name} Instagram Intelligence Report
%%  GENERATED by src/generate_combined_report.js from config + CSVs.
%%  Do not edit by hand; edit config/client.config.json and re-run.
%%  ${RP.organisation} — ${RP.prepared_by} — ${RP.date}
%% ============================================================
\\documentclass[11pt,a4paper]{report}
\\usepackage[a4paper, top=2.5cm, bottom=2.5cm, left=2.8cm, right=2.8cm]{geometry}
\\usepackage[T1]{fontenc}\\usepackage[utf8]{inputenc}\\usepackage{lmodern}\\usepackage{microtype}
\\usepackage{xcolor}\\usepackage{booktabs}\\usepackage{longtable}\\usepackage{array}\\usepackage{tabularx}
\\usepackage{parskip}\\usepackage{titlesec}\\usepackage{fancyhdr}\\usepackage{pgfplots}\\usepackage{tikz}
\\usepackage{hyperref}\\usepackage{enumitem}\\usepackage{caption}\\usepackage{mdframed}\\usepackage{amsmath}
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
\\fancyhead[R]{\\small\\color{tggrey}\\textit{${tx(RP.organisation)} --- ${tx(RP.classification)}}}
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
\\end{center}\\vfill\\begin{center}{\\small\\color{white!70!tggreen}This document integrates a performance overview, a detailed engagement analysis, and a full advanced statistical and predictive analysis including Monte Carlo simulation. It is exploratory and fully reproducible; see the Statistical Scope section.}\\end{center}\\end{titlepage}
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
  \\textbf{Posts analysed}       & ${counts.posts||0} owned feed posts and ${counts.reels||0} short videos (reels) \\\\[4pt]
  \\textbf{Top content category} & ${tx(pillarLabel(topPillar.pillar||''))} (average engagement score: ${fmt(topPillar.avg_engagement_score)}) \\\\[4pt]
  \\textbf{Best day to post}     & ${tx(bestDay.period||'')} (average engagement score: ${fmt(bestDay.avg_engagement_score)}) \\\\[4pt]
  \\textbf{Format signal}        & ${formatSignalRow} \\\\
\\end{tabularx}
\\end{callout}

\\section{Data Coverage}
${table({caption:'Summary of data collected for analysis',cols:[{h:'Area',spec:'L{7cm}',cell:r=>r.a},{h:'Count',spec:'R{4cm}',cell:r=>r.c}],rows:[
{a:'Owned feed posts analysed',c:counts.posts||0},{a:'Reels analysed',c:counts.reels||0},{a:'Third-party mentions analysed',c:counts.mentions||0},{a:'Comments analysed',c:counts.comments||0},{a:'Followers at collection time',c:followers}]})}

${C.bio?`Profile biography: \\textit{${tx(C.bio)}}\n`:''}
\\begin{note}
\\textbf{Data limitation.} This analysis covers public Instagram data only. It does not include private account analytics such as reach, impressions, saves, shares, profile visits, link clicks, story taps, ad spend, or completed bookings. All conclusions are directional rather than absolute. Combine these findings with ${tx(C.name)}'s native Instagram analytics, reservation data, and campaign context.
\\end{note}
${smallSample?`
\\section{How to Read This Report (Sample Size)}
\\begin{callout}
\\textbf{This is a descriptive content audit, not a statistical study.} The analysis covers \\textbf{${ownedN} posts published by the account} (${dedupN} including features and mentions). That is ample for the descriptive findings that form the body of this report --- what has been posted, which themes recur, when the audience engages, and what they say in comments. It is, however, \\textbf{below the size needed for confirmatory statistics}. Accordingly:
\\begin{itemize}[leftmargin=*, topsep=2pt, itemsep=1pt]
  \\item \\textbf{Part~I (this part)} --- the descriptive audit --- is the substance of the report and is where decisions should be grounded.
  \\item \\textbf{The Appendix} --- hypothesis tests and Monte Carlo simulations --- is included for transparency and method completeness. At this sample size its outputs are \\emph{illustrative and directional only}; they are not established effects, and the simulations are not forecasts.
\\end{itemize}
The honest one-line summary: \\textbf{treat every number here as a well-evidenced description of the past ${ownedN} posts, and as a hypothesis to test --- revisit with statistical weight once the account has roughly 100+ posts.}
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
Each category is read against the overall average engagement score (${fmt(baselineMean)}). \\textquotedblleft Above\\textquotedblright{} means the category tends to outperform a typical post; sample size ($n$) signals how reliable that read is.
\\begin{itemize}[leftmargin=*]
${sortedPillars.slice(0,8).map(p=>{
  const liftRow=(lift.find(l=>l.pillar===p.pillar)||{});
  const lp=liftRow.lift_vs_baseline_pct;
  const dir = lp!==undefined && lp!=='' ? (num(lp)>=0?`+${lp}\\% above`:`${lp}\\% below`) : (num(p.avg_engagement_score)>=baselineMean?'above':'below');
  const n=num(p.posts_count);
  const verdict = n<10 ? 'small sample --- treat as a hypothesis to test with more posts'
    : num(p.avg_engagement_score)>=baselineMean ? 'a proven strength --- produce more of it'
    : 'below average --- reconsider effort or reframe using the language of the top categories';
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
    ? `With only ${FV.nR} reels in the window, this comparison cannot be made meaningfully --- the account is currently \\textbf{posts-driven}. Feed posts (particularly carousels of food and events) carry essentially all of the engagement. The opportunity is to test short video as an under-used format and measure reach with native Instagram analytics, not to assume it will replicate the performance of the existing posts.`
    : reelsWin
      ? `Short videos lead on the composite score, but much of that gap is the mechanical views term; on likes and comments the difference is ${FV.pLcMwu<0.05?'still present':'not statistically reliable'} at this sample size. Treat reels as a reach and discovery investment and confirm with native reach data.`
      : `\\textbf{Feed posts outperform short videos for this account} on every metric (engagement ${fmt(FV.escP)} vs ${fmt(FV.escR)}; likes ${fmt(FV.lkP)} vs ${fmt(FV.lkR)}). Reels are not currently a strength here. Keep investing in the high-performing post formats (food and event carousels) and treat reels as an experiment to grow reach, measured with native analytics --- not as a proven channel for this account.`
}
\\end{callout}

\\chapter{Timing Analysis}
\\section{Best Days to Post}
${bar({title:'Average engagement score by posting day',xlabel:'Average engagement score',rows:[...dayRows].sort((a,b)=>num(a.avg_engagement_score)-num(b.avg_engagement_score)).map(d=>({label:d.period,value:d.avg_engagement_score})),max:Math.max(...dayRows.map(d=>num(d.avg_engagement_score)))})}

${table({caption:'Timing analysis by day of week',cols:[
{h:'Day',spec:'L{2.8cm}',cell:r=>tx(r.period)},{h:'Posts',spec:'R{2cm}',cell:r=>r.content_count},{h:'Avg Score',spec:'R{2.2cm}',cell:r=>r2(r.avg_engagement_score)},{h:'Avg Likes',spec:'R{2cm}',cell:r=>r2(r.avg_likes)},{h:'Avg Cmts',spec:'R{2.2cm}',cell:r=>r2(r.avg_comments)}],
rows:dayRows})}

\\section{Timing by Hour (UTC)}
${longtable({caption:'Average engagement by publication hour (UTC)',cols:[
{h:'Hour UTC',spec:'R{2.5cm}',cell:r=>tx(r.period)},{h:'Posts',spec:'R{2cm}',cell:r=>r.content_count},{h:'Avg Score',spec:'R{2.8cm}',cell:r=>r2(r.avg_engagement_score)},{h:'Avg Likes',spec:'R{2cm}',cell:r=>r2(r.avg_likes)},{h:'Avg Cmts',spec:'R{2.2cm}',cell:r=>r2(r.avg_comments)}],
rows:hourRows})}

\\chapter{Audience Comment Intelligence}
The comment review uses anonymised text only; usernames are excluded from all outputs.

${bar({title:'Comment intent categories',xlabel:'Number of comments',rows:[...intents].filter(i=>num(i.count)>0).sort((a,b)=>num(a.count)-num(b.count)).map(i=>({label:i.intent.replace(/[/]/g,' '),value:i.count})),max:Math.max(...intents.map(i=>num(i.count)))})}

${longtable({caption:'Full comment intent classification with commercial opportunities',cols:[
{h:'Intent',spec:'L{4cm}',cell:r=>tx(r.intent)},{h:'Count',spec:'R{1.4cm}',cell:r=>r.count},{h:'Share',spec:'R{1.4cm}',cell:r=>tx(r.percentage)+'\\%'},{h:'Commercial Opportunity',spec:'L{7.5cm}',cell:r=>tx(r.commercial_opportunity)}],
rows:intents})}

\\section{Commercial Opportunities in Comments}
The comment types below signal direct intent --- someone who comments is a warm lead. They are ranked by how often they appear.
\\begin{itemize}[leftmargin=*]
${(commercialIntents.length?commercialIntents:intents.slice(0,4)).slice(0,5).map(i=>`  \\item \\textbf{${tx(i.intent)}} (${i.count}, ${tx(i.percentage)}\\%): ${tx(i.commercial_opportunity)}`).join('\n')}
\\end{itemize}

\\section{Repeated Opportunities}
\\begin{itemize}[leftmargin=*]
  \\item Reply to every commercial comment quickly --- a fast, consistent response turns a public comment into a direct conversation.
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

\\section{Most Frequent Hashtags}
${table({caption:'Top 15 hashtags by frequency of use',cols:[{h:'Hashtag',spec:'L{5cm}',cell:r=>'\\#'+tx(r.hashtag)},{h:'Uses',spec:'R{3cm}',cell:r=>r.count}],rows:hashtags.slice(0,15)})}

\\chapter{Top-Performing Posts}
These are the proven best-sellers. Study what they share --- topic, format, hook, and call to action --- and reproduce the pattern.

\\section{Top Posts by Engagement Score}
${table({caption:'Top 10 posts and reels by engagement score',cols:[
{h:'Type',spec:'L{1.8cm}',cell:r=>tx(r.content_type||'')},{h:'Theme',spec:'L{3.5cm}',cell:r=>tx(pillarLabel(r.pillar||''))},{h:'Likes',spec:'R{1.6cm}',cell:r=>fmt(r.likes)},{h:'Comments',spec:'R{1.8cm}',cell:r=>fmt(r.comments)},{h:'Views',spec:'R{1.8cm}',cell:r=>fmt(r.views)},{h:'Score',spec:'R{1.8cm}',cell:r=>fmt(r.engagement_score)},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topByEng.slice(0,10)})}

\\section{Top Posts by Likes}
${table({caption:'Top 10 posts by public likes',cols:[
{h:'Likes',spec:'R{2cm}',cell:r=>fmt(r.likes)},{h:'Comments',spec:'R{2cm}',cell:r=>fmt(r.comments)},{h:'Views',spec:'R{2cm}',cell:r=>fmt(r.views)},{h:'Theme',spec:'L{4cm}',cell:r=>tx(pillarLabel(r.pillar||''))},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topByLikes.slice(0,10)})}

\\section{Top Posts by Comment Count}
${table({caption:'Top 10 posts by public comments',cols:[
{h:'Comments',spec:'R{2.2cm}',cell:r=>fmt(r.comments)},{h:'Likes',spec:'R{1.8cm}',cell:r=>fmt(r.likes)},{h:'Score',spec:'R{2cm}',cell:r=>fmt(r.engagement_score)},{h:'Theme',spec:'L{4cm}',cell:r=>tx(pillarLabel(r.pillar||''))},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topByComments.slice(0,10)})}

\\section{Top Reels by Views and Plays}
${table({caption:'Top 10 reels by video views and plays',cols:[
{h:'Views',spec:'R{2.2cm}',cell:r=>fmt(r.views)},{h:'Likes',spec:'R{1.8cm}',cell:r=>fmt(r.likes)},{h:'Comments',spec:'R{2cm}',cell:r=>fmt(r.comments)},{h:'Score',spec:'R{2cm}',cell:r=>fmt(r.engagement_score)},{h:'Link',spec:'L{1.4cm}',cell:r=>tlink(r.url)}],
rows:topReels.slice(0,10)})}

\\chapter{Strategic Recommendations}
\\section{Content Strategy}
\\begin{enumerate}[leftmargin=*]
  \\item \\textbf{Produce more of the strongest themes:} ${tx(top3Pillars.join(', ')||'the top-performing categories')}. These currently earn the most engagement, so they are the safest place to add volume.
  \\item \\textbf{Lean on the proven format.} ${reelsWin && !tooFewReels ? 'Short videos lead on interaction and reach beyond current followers --- expand video output.' : tooFewReels ? 'The account is posts-driven; treat short video as an experiment to extend reach, measured in native Insights.' : 'Feed posts outperform short video here; keep investing in strong post formats and test video for reach.'}
  \\item \\textbf{Publish on the best days:} ${tx(topDays.join(' and ')||'the strongest observed days')}, which show the highest average engagement.
  \\item \\textbf{Convert comments into action.} The most common commercial signal is \\textbf{${tx(topIntent.intent||'audience questions')}}; reply quickly and pin the answer.
  \\item \\textbf{Make captions complete:} one clear hook, one proof point, and one explicit next step (where to watch, how to engage, how to book).
  \\item \\textbf{Reshare third-party mentions} that align with a strong theme, adding the context the original may lack.
  \\item \\textbf{Track theme performance monthly} so the team can see which categories are pulling weight and rebalance.
\\end{enumerate}

\\section{Four-Week Content Calendar}
A starting cadence built around the account's strongest themes; adjust to the live schedule.
${table({caption:'Suggested four-week content calendar',cols:[{h:'Week',spec:'C{1.5cm}',cell:r=>r.w},{h:'Focus',spec:'L{4cm}',cell:r=>tx(r.f)},{h:'Suggested Content',spec:'L{8cm}',cell:r=>tx(r.c)}],rows:[
{w:'1',f:top3Pillars[0]||'Top theme',c:`2 posts in the strongest theme (${top3Pillars[0]||'top category'}), 1 carousel, 1 story poll asking the audience what they want next`},
{w:'2',f:top3Pillars[1]||'Second theme',c:`2 posts in the second theme (${top3Pillars[1]||'second category'}), 1 short video test, 1 reshared mention with context`},
{w:'3',f:top3Pillars[2]||'Third theme',c:`1 feature/collaboration post, 1 behind-the-scenes piece, 1 caption with a clear next step`},
{w:'4',f:'Proof + recap',c:'2 reshares/social-proof stories, 1 recap of the month, 1 Highlight refresh (key questions answered)'}]})}

\\section{Suggested Monthly KPIs}
\\begin{itemize}[leftmargin=*]
  \\item Public engagement score by theme (are the strong themes still strong?)
  \\item Reels/video plays and watch-through where native analytics expose them
  \\item Comment volume and the count of commercial-intent comments
  \\item Response time to commercial comments and direct messages
  \\item Number of third-party mentions reused as social proof
  \\item Follower growth read alongside the above (reach is only visible in native Insights)
\\end{itemize}

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
All computation runs in a reproducible Node.js pipeline. Monte Carlo simulations use a fixed seed (${cfg.analysis.mc_seed}) and ${fmt(cfg.analysis.mc_iterations)} iterations; an independent analyst re-running the code obtains bit-identical results. After removing duplicate posts that appear in both the posts and reels scrapes, the working dataset comprises \\textbf{${dedupN} unique posts and reels} (${ownedN} published by the account, the remainder features and mentions).

\\chapter{Exploratory Data Analysis}
${table({caption:'Descriptive statistics by content segment',cols:[
{h:'Segment',spec:'L{4cm}',cell:r=>tx(r.label.replace(/_/g,' '))},{h:'N',spec:'R{1cm}',cell:r=>r.n},{h:'Mean',spec:'R{1.6cm}',cell:r=>r2(r.mean)},{h:'Median',spec:'R{1.6cm}',cell:r=>r2(r.median)},{h:'Std Dev',spec:'R{1.8cm}',cell:r=>r2(r.stddev)},{h:'CV',spec:'R{1.2cm}',cell:r=>r2(r.cv,2)},{h:'Skew',spec:'R{1.4cm}',cell:r=>r2(r.skew,2)}],
rows:eda.filter(r=>['all_content_deduplicated','posts','reels','owned_account','third_party'].includes(r.label)||/^owned/.test(r.label))})}

All groups are strongly right-skewed with heavy tails, which violates normality assumptions and motivates the use of non-parametric tests alongside parametric ones.

\\section{Per-Pillar Exploratory Statistics}
${longtable({caption:'Descriptive statistics by content pillar',cols:[
{h:'Pillar',spec:'L{4cm}',cell:r=>tx(r.name)},{h:'N',spec:'R{1cm}',cell:r=>r.n},{h:'Mean',spec:'R{1.6cm}',cell:r=>r2(r.mean)},{h:'Median',spec:'R{1.6cm}',cell:r=>r2(r.median)},{h:'P25',spec:'R{1.4cm}',cell:r=>r2(r.p25)},{h:'P75',spec:'R{1.4cm}',cell:r=>r2(r.p75)},{h:'CV',spec:'R{1.2cm}',cell:r=>r2(r.cv,2)},{h:'Skew',spec:'R{1.4cm}',cell:r=>r2(r.skew,2)}],
rows:[...pillarEda].sort((a,b)=>num(b.mean)-num(a.mean))})}

\\chapter{Hypothesis Tests}
All tests use $\\alpha = ${cfg.analysis.alpha}$; with ${cfg.analysis.bonferroni_tests} parallel tests the Bonferroni threshold is $\\alpha_B = ${r2(cfg.analysis.alpha/cfg.analysis.bonferroni_tests,4)}$.
${longtable({caption:'Hypothesis test results',cols:[
{h:'Test',spec:'L{4.5cm}',cell:r=>tx((r.test||'').replace(/_/g,' '))},{h:'Method',spec:'L{3.2cm}',cell:r=>tx(r.method)},{h:'p',spec:'R{1.4cm}',cell:r=>r.p},{h:'Sig.',spec:'R{1.3cm}',cell:r=>r.significant_alpha05==='true'?'Yes':'No'},{h:'Effect/Note',spec:'L{4cm}',cell:r=>tx(r.cohens_d?('d='+r.cohens_d):(r.r?('r='+r.r):(r.H?('H='+r.H):'')))}],
rows:hyp})}

\\begin{note}
\\textbf{Reels vs posts.} ${
  tooFewReels
    ? `With only ${FV.nR} reels after deduplication, the reels-versus-posts test is underpowered and no reliable difference can be claimed. The account is posts-driven; see the format discussion in Part~I.`
    : reelsWin
      ? `The Welch t-test ($p=${tx(h1w.p||'n/a')}$) and Mann-Whitney U test ($p=${tx(h1m.p||'n/a')}$) are directional in favour of reels but do not both clear significance at this sample size, consistent with the circularity caveat in Part~I.`
      : `On this account feed posts lead reels on every metric; any apparent reels effect on the composite score is outweighed once the views term is removed (see Part~I).`
}
\\end{note}

\\section{Test-by-Test Detail}
\\begin{description}[leftmargin=0pt,style=nextline]
${hyp.map(r=>{
  const stat = r.t? `$t=${r.t}$, $\\mathrm{df}=${r.df}$` : (r.U!==undefined&&r.U!=='')? `$U=${r.U}$, $z=${r.z}$` : (r.H!==undefined&&r.H!=='')? `$H=${r.H}$, $\\mathrm{df}=${r.df}$` : (r.r!==undefined&&r.r!=='')? `$r=${r.r}$` : '';
  const sig = r.significant_alpha05==='true';
  const eff = r.cohens_d?` Cohen's $d=${r.cohens_d}$.`:(r.r?` (95\\% CI ${r.r_ci_lo} to ${r.r_ci_hi}).`:'');
  const reading = sig ? 'Statistically significant at the chosen threshold.' : 'Not statistically significant --- insufficient evidence to reject the null at this sample size.';
  return `  \\item[${tx((r.test||'').replace(/_/g,' '))}] \\textit{H\\textsubscript{0}: ${tx(r.h0||'')}} --- ${r.method?tx(r.method)+'; ':''}${stat}, $p=${r.p}$.${eff} \\textbf{${reading}}${r.note?` ${tx(r.note)}`:''}`;
}).join('\n')}
\\end{description}

\\chapter{Bootstrap Confidence Intervals}
${longtable({caption:'Bootstrap 95\\% confidence intervals',cols:[
{h:'Segment / Pillar',spec:'L{5cm}',cell:r=>tx(r.label.replace(/_/g,' '))},{h:'N',spec:'R{1.2cm}',cell:r=>r.n},{h:'Estimate',spec:'R{2cm}',cell:r=>r2(r.estimate)},{h:'Lower',spec:'R{2cm}',cell:r=>r2(r.lower)},{h:'Upper',spec:'R{2cm}',cell:r=>r2(r.upper)},{h:'Incl. 0',spec:'R{1.5cm}',cell:r=>r.includes_zero==='true'?'Yes':'No'}],
rows:cis})}

\\chapter{Pillar Lift versus Baseline}
${bar({title:'Content pillar lift relative to overall baseline (percent)',xlabel:'Lift above baseline (\\%)',pct:true,rows:[...lift].sort((a,b)=>num(a.lift_vs_baseline_pct)-num(b.lift_vs_baseline_pct)).map(l=>({label:l.pillar,value:l.lift_vs_baseline_pct})),max:Math.max(...lift.map(l=>num(l.lift_vs_baseline_pct)))})}

${longtable({caption:'Pillar lift versus baseline with bootstrap 95\\% CI',cols:[
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

${table({caption:'MC1 results: 12-week engagement score by strategy',cols:[
{h:'Strategy',spec:'L{3cm}',cell:r=>tx(r.strategy.replace(/_/g,' '))},{h:'Posts',spec:'R{1.8cm}',cell:r=>r.total_posts},{h:'Mean',spec:'R{2cm}',cell:r=>fmt(r.mean)},{h:'P5',spec:'R{2cm}',cell:r=>fmt(r.p5)},{h:'P95',spec:'R{2cm}',cell:r=>fmt(r.p95)},{h:'Uplift',spec:'R{2cm}',cell:r=>r.uplift_vs_current==='0'?'---':('+'+r.uplift_vs_current+'\\%')}],
rows:mcStrat})}

\\section{MC2: Engagement Forecast}
${table({caption:'MC2: engagement forecast at three horizons',cols:[
{h:'Horizon (days)',spec:'R{2.5cm}',cell:r=>r.horizon_days},{h:'Exp. Posts',spec:'R{2.5cm}',cell:r=>r.expected_posts},{h:'Forecast Mean',spec:'R{3cm}',cell:r=>fmt(r.forecast_mean)},{h:'P10',spec:'R{2.5cm}',cell:r=>fmt(r.forecast_p10)},{h:'P90',spec:'R{2.5cm}',cell:r=>fmt(r.forecast_p90)},{h:'CV',spec:'R{1.5cm}',cell:r=>r2(r.cv,2)}],
rows:mcFore})}

\\section{MC3: Booking Conversion Pipeline}
${table({caption:'MC3: monthly booking pipeline under three conversion scenarios',cols:[
{h:'Scenario',spec:'L{2.5cm}',cell:r=>tx(r.scenario)},{h:'Contact %',spec:'R{1.8cm}',cell:r=>r.contact_rate_pct},{h:'Booking %',spec:'R{2cm}',cell:r=>r.booking_rate_pct},{h:'P50',spec:'R{1.6cm}',cell:r=>r.bookings_p50},{h:'P90',spec:'R{1.6cm}',cell:r=>r.bookings_p90},{h:'P(0)',spec:'R{1.8cm}',cell:r=>r.prob_0_bookings_pct+'\\%'},{h:'P(3+ bookings)',spec:'R{1.8cm}',cell:r=>r.prob_ge3_bookings_pct+'\\%'}],
rows:mcConv})}
\\begin{callout}
\\textbf{Principal finding from MC3.} At current comment volumes the Instagram comment channel alone cannot reliably drive booking conversions regardless of conversion rate. The binding constraint is comment volume, not the funnel. Increasing reach-oriented content (MC1) raises the top of the funnel; replying immediately to commercial comments is the cheapest operational lever.
\\end{callout}

\\section{MC4: Optimal Pillar Mix (Top 10 Allocations)}
${longtable({caption:'MC4: top pillar allocations by expected mean engagement',cols:[
{h:'Allocation',spec:'L{9cm}',cell:r=>tx(r.mix)},{h:'Mean',spec:'R{2.2cm}',cell:r=>fmt(r.mean_engagement)},{h:'P25',spec:'R{1.8cm}',cell:r=>fmt(r.p25)},{h:'P75',spec:'R{1.8cm}',cell:r=>fmt(r.p75)}],
rows:mcMix.slice(0,10)})}

\\section{MC5: Risk Analysis}
${longtable({caption:'MC5: probability of achieving 12-week targets',cols:[
{h:'Strategy',spec:'L{3.2cm}',cell:r=>tx(r.strategy.replace(/_/g,' '))},{h:'Target',spec:'R{2.5cm}',cell:r=>fmt(r.target_12wk_engagement)},{h:'P(achieve)',spec:'R{3cm}',cell:r=>r.prob_achieving_pct+'\\%'},{h:'Expected Mean',spec:'R{3cm}',cell:r=>fmt(r.expected_mean)}],
rows:mcRisk})}

\\chapter{Consolidated Actionable Findings}
\\begin{enumerate}[leftmargin=*]
  \\item \\textbf{Lean into the strongest themes:} ${tx(top3Pillars.join(', ')||'the top categories')}. They earn the most engagement and are the safest place to add volume.
  \\item \\textbf{Format:} ${reelsWin && !tooFewReels ? 'short videos lead and reach new audiences --- expand them.' : tooFewReels ? 'the account is posts-driven; short video is an untested reach opportunity, not a proven channel.' : 'feed posts lead; keep investing in them and test video for reach.'}
  \\item \\textbf{Timing:} ${topDays.length?`publish priority content on ${tx(topDays.join(' and '))}.`:'no strong day effect; keep testing posting times against native reach data.'}
  \\item \\textbf{Comments are a warm channel:} the most common commercial signal is \\textbf{${tx(topIntent.intent||'audience questions')}}; fast, consistent replies convert it.
  \\item \\textbf{Engagement is concentrated} in a small number of posts (see the top-posts tables and the bootstrap intervals); maintain a backlog of high-potential content to smooth the peaks and troughs.
  \\item \\textbf{Measure what this analysis cannot see:} pair these public findings with native Instagram reach, saves, shares, and profile actions before committing budget.
\\end{enumerate}

\\chapter{Limitations and Ethics}
\\section{Statistical Scope and Validity}
This study is \\textbf{exploratory and hypothesis-generating}, not confirmatory, and is fully reproducible (fixed seed, committed data, deterministic pipeline). Bounds on interpretation:
\\begin{enumerate}[leftmargin=*]
\\item \\textbf{Composite-metric circularity.} The engagement score embeds a views term available to video but not to many image posts; composite-score reels-versus-posts comparisons overstate the advantage, so likes-and-comments comparisons are reported alongside.
\\item \\textbf{Small samples.} Several pillars and the deduplicated reel set rest on few posts; confidence intervals are wide and rankings are indicative.
\\item \\textbf{Observational, not causal.} Day, pillar, and format are correlated with each other and with campaign timing; no causal claim is made.
\\item \\textbf{Scenarios, not forecasts.} Monte Carlo projections assume independence, stationarity, and no saturation.
\\item \\textbf{Selection effects.} Comments are drawn from high-engagement posts; mentions are a non-random sample.
\\end{enumerate}
Used to prioritise content experiments and size uncertainty, the analysis is sound; used as proof of fixed effects, it would overreach.

\\section{Data and Ethics}
This report is based on public Instagram data collected via the Apify Instagram Scraper and analysed locally. No private account access or private user data was used. Individual commenters are not identified. For business decisions, combine with ${tx(C.name)}'s native Instagram Insights, reservation data, and campaign context.

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
console.log(ok ? '\nStructure valid. Review, then rename to combined_report.tex to make canonical.' : '\nSTRUCTURE PROBLEM — do not use until fixed.');
