'use strict';
/**
 * Independent statistical validity audit.
 * Re-runs the most scrutiny-prone claims under stricter assumptions to test
 * whether they survive. Pure Node, no deps. Reads committed processed CSVs.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function parseLine(line){const o=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;}
function readCsv(rel){const f=path.join(ROOT,rel);const lines=fs.readFileSync(f,'utf8').replace(/^﻿/,'').split('\n').filter(l=>l.trim());const h=parseLine(lines[0]);return lines.slice(1).map(l=>{const v=parseLine(l);const r={};h.forEach((k,i)=>r[k.trim()]=(v[i]??'').trim());return r;});}
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
function variance(a){if(a.length<2)return 0;const m=mean(a);return a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1);}
function median(a){const s=[...a].sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function normalCdf(x){const t=1/(1+0.2316419*Math.abs(x));const p=t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));const z=1-(1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*x*x)*p;return x>=0?z:1-z;}
function tP(t,df){if(!Number.isFinite(t)||df<=0)return 1;const z=Math.sqrt(df*Math.log(1+t*t/df));return 2*(1-normalCdf(Math.abs(z)));}
function welch(a,b){const va=variance(a),vb=variance(b),na=a.length,nb=b.length;if(na<2||nb<2)return null;const ma=mean(a),mb=mean(b);const se2=va/na+vb/nb;if(se2===0)return{t:0,df:0,p:1,d:0,ma,mb};const t=(ma-mb)/Math.sqrt(se2);const df=se2**2/((va/na)**2/(na-1)+(vb/nb)**2/(nb-1));const pooled=Math.sqrt((va+vb)/2);return{t,df,p:tP(t,df),d:pooled?(ma-mb)/pooled:0,ma,mb};}
function mwu(a,b){const na=a.length,nb=b.length;if(!na||!nb)return null;let u1=0;for(const x of a)for(const y of b){if(x>y)u1++;else if(x===y)u1+=0.5;}const u=Math.min(u1,na*nb-u1);const mu=na*nb/2,sig=Math.sqrt(na*nb*(na+nb+1)/12);const z=sig?(u-mu)/sig:0;return{u,z,p:2*(1-normalCdf(Math.abs(z)))};}
function dedupe(rows){const seen=new Map();for(const r of rows){const k=r.shortcode||r.id;if(!seen.has(k)||num(r.engagement_score)>num(seen.get(k).engagement_score))seen.set(k,r);}return[...seen.values()];}
const r2=x=>Math.round(x*1000)/1000;

console.log('='.repeat(70));
let __cn='this client';try{__cn=require(path.join(ROOT,'config','client.config.json')).client.name;}catch(e){}
console.log('INDEPENDENT STATISTICAL VALIDITY AUDIT — '+__cn);
console.log('='.repeat(70));

const posts=readCsv('data/processed/posts_clean.csv');
const reels=readCsv('data/processed/reels_clean.csv');
const all=dedupe([...posts,...reels]);
const P=all.filter(r=>r.content_type==='post');
const R=all.filter(r=>r.content_type==='reel');

// ── CHECK 1: Circularity — does the reels advantage survive WITHOUT the views term? ──
console.log('\n[CHECK 1] CIRCULARITY OF THE ENGAGEMENT SCORE');
console.log('-'.repeat(70));
console.log('The headline metric = likes + comments*5 + views/100.');
console.log('views/100 dominates for video; image posts often have 0 views.');
console.log('Test: re-run reels-vs-posts on metrics that REMOVE the mechanical term.\n');

const escore = r => num(r.likes)+num(r.comments)*5+Math.max(num(r.views),0)/100;
const likesOnly = r => Math.max(num(r.likes),0);
const likesComments = r => Math.max(num(r.likes),0)+Math.max(num(r.comments),0)*5;

for(const [label,fn] of [['engagement_score (with views)',escore],['likes only',likesOnly],['likes + comments*5 (no views)',likesComments]]){
  const rp=R.map(fn), pp=P.map(fn);
  const w=welch(rp,pp), m=mwu(rp,pp);
  console.log(`  ${label}`);
  console.log(`    reel mean=${Math.round(mean(rp))}  post mean=${Math.round(mean(pp))}  diff=${Math.round(mean(rp)-mean(pp))}`);
  console.log(`    Welch t=${r2(w.t)} p=${r2(w.p)} d=${r2(w.d)} | MWU z=${r2(m.z)} p=${r2(m.p)}`);
}
console.log('\n  VERDICT: if the advantage vanishes without views, the claim is partly');
console.log('  an artifact of the metric, not an independent empirical finding.');

// ── CHECK 2: Views availability by content type (is the 0-views asymmetry real?) ──
console.log('\n[CHECK 2] VIEWS ASYMMETRY BETWEEN POSTS AND REELS');
console.log('-'.repeat(70));
const pZero=P.filter(r=>num(r.views)===0).length, rZero=R.filter(r=>num(r.views)===0).length;
console.log(`  Posts with 0 views: ${pZero}/${P.length} (${Math.round(100*pZero/P.length)}%)`);
console.log(`  Reels with 0 views: ${rZero}/${R.length} (${Math.round(100*rZero/R.length)}%)`);
console.log('  If most posts have 0 views but reels do not, the views term');
console.log('  systematically favours reels regardless of true engagement.');

// ── CHECK 3: Day-of-week robustness to outliers ──
console.log('\n[CHECK 3] DAY-OF-WEEK EFFECT — ROBUSTNESS TO OUTLIERS');
console.log('-'.repeat(70));
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function kw(groups){const flat=groups.flat(),n=flat.length;if(n<3)return null;const sorted=flat.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);const ranks=new Array(n);let i=0;while(i<n){let j=i;while(j<n-1&&sorted[j+1].v===sorted[j].v)j++;const r=(i+j)/2+1;for(let k=i;k<=j;k++)ranks[sorted[k].i]=r;i=j+1;}let H=0,off=0;for(const g of groups){if(!g.length){off+=g.length;continue;}const gr=g.map((_,gi)=>ranks[off+gi]);off+=g.length;H+=g.length*(mean(gr)-(n+1)/2)**2;}H=12/(n*(n+1))*H;return{H,df:groups.length-1};}
function chiP(chi,df){ // Wilson-Hilferty approx
  if(chi<=0)return 1;const t=Math.pow(chi/df,1/3);const m=1-2/(9*df);const s=Math.sqrt(2/(9*df));return 1-normalCdf((t-m)/s);}
const byDay=DAYS.map(d=>all.filter(r=>r.day_of_week===d).map(escore));
let res=kw(byDay);
console.log(`  Full data:        H=${r2(res.H)} df=${res.df} p~${r2(chiP(res.H,res.df))}`);
// Remove top 5 outliers overall, re-test
const sortedAll=[...all].sort((a,b)=>escore(b)-escore(a));
const top5=new Set(sortedAll.slice(0,5).map(r=>r.shortcode));
const byDayNoOut=DAYS.map(d=>all.filter(r=>r.day_of_week===d&&!top5.has(r.shortcode)).map(escore));
res=kw(byDayNoOut);
console.log(`  Drop top-5 posts: H=${r2(res.H)} df=${res.df} p~${r2(chiP(res.H,res.df))}`);
// Use likes-only (no views) to test if day effect is views-driven
const byDayLikes=DAYS.map(d=>all.filter(r=>r.day_of_week===d).map(likesOnly));
res=kw(byDayLikes);
console.log(`  Likes only:       H=${r2(res.H)} df=${res.df} p~${r2(chiP(res.H,res.df))}`);
console.log('  If significance disappears when outliers/views are removed, the');
console.log('  day effect is fragile and should be reported as such.');

// ── CHECK 4: Sample sizes behind headline pillar claims ──
console.log('\n[CHECK 4] SAMPLE SIZES BEHIND PILLAR RANKINGS');
console.log('-'.repeat(70));
const pil={};for(const r of all){(pil[r.pillar]=pil[r.pillar]||[]).push(escore(r));}
Object.entries(pil).sort((a,b)=>mean(b[1])-mean(a[1])).forEach(([k,v])=>{
  const flag=v.length<10?'  <-- UNDERPOWERED (n<10)':'';
  console.log(`  ${k.padEnd(34)} n=${String(v.length).padStart(3)}  mean=${String(Math.round(mean(v))).padStart(4)}${flag}`);
});

// ── CHECK 5: Reproducibility hash of inputs ──
console.log('\n[CHECK 5] REPRODUCIBILITY');
console.log('-'.repeat(70));
const crypto=require('crypto');
for(const f of ['data/processed/posts_clean.csv','data/processed/reels_clean.csv','data/processed/comments_clean.csv']){
  const h=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex').slice(0,12);
  console.log(`  ${f}  sha256:${h}`);
}
console.log('  Fixed MC seed 20260530 + committed CSVs => bit-identical re-runs.');

// ── CHECK 6: Cross-section consistency (Part I vs Part II) ──
console.log('\n[CHECK 6] CROSS-SECTION CONSISTENCY (regression guard)');
console.log('-'.repeat(70));
const partIPillarN  = readCsv('data/processed/content_pillar_summary.csv').reduce((s, r) => s + num(r.posts_count), 0);
const partIIPillarN = readCsv('data/processed/adv_eda_summary.csv').filter(r => /^pillar:/.test(r.label)).reduce((s, r) => s + num(r.n), 0);
const intentRows    = readCsv('data/processed/comment_intent_summary.csv');
const intentPctSum  = intentRows.reduce((s, r) => s + num(r.percentage), 0);
const noNegLikes    = readCsv('data/processed/posts_clean.csv').every(r => num(r.likes) >= 0);
const ok = (label, cond) => console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}`);
ok(`Part I pillar n (${partIPillarN}) == Part II pillar n (${partIIPillarN})`, partIPillarN === partIIPillarN && partIPillarN > 0);
ok(`Comment-intent percentages sum to ~100% (got ${intentPctSum.toFixed(1)})`, Math.abs(intentPctSum - 100) <= 1.0);
ok('No negative metric values in posts_clean likes (floored)', noNegLikes);

console.log('\n'+'='.repeat(70));
console.log('Audit complete. See interpretation in chat.');
console.log('='.repeat(70));
