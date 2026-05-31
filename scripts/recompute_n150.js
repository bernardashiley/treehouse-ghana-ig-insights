'use strict';
/**
 * Recompute the "Model-Style Regression Results" table on the DEDUPLICATED
 * n=150 dataset, so the combined report is internally consistent (the original
 * table used the pre-dedup n=219 data). Prints values to paste into the report.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function parseLine(line){const o=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;}
function readCsv(rel){const f=path.join(ROOT,rel);const lines=fs.readFileSync(f,'utf8').replace(/^﻿/,'').split('\n').filter(l=>l.trim());const h=parseLine(lines[0]);return lines.slice(1).map(l=>{const v=parseLine(l);const r={};h.forEach((k,i)=>r[k.trim()]=(v[i]??'').trim());return r;});}
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
function variance(a){if(a.length<2)return 0;const m=mean(a);return a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1);}
function dedupe(rows){const seen=new Map();for(const r of rows){const k=r.shortcode||r.id;if(!seen.has(k)||num(r.engagement_score)>num(seen.get(k).engagement_score))seen.set(k,r);}return[...seen.values()];}
function reg(rows,xk){const pairs=rows.map(r=>[num(r[xk]),num(r.engagement_score)]).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y));const n=pairs.length;const xs=pairs.map(p=>p[0]),ys=pairs.map(p=>p[1]);const mx=mean(xs),my=mean(ys);const ssx=xs.reduce((s,x)=>s+(x-mx)**2,0);const slope=ssx?pairs.reduce((s,[x,y])=>s+(x-mx)*(y-my),0)/ssx:0;const intercept=my-slope*mx;const ssTot=ys.reduce((s,y)=>s+(y-my)**2,0);const ssRes=pairs.reduce((s,[x,y])=>s+(y-(intercept+slope*x))**2,0);return{n,slope:Math.round(slope*10000)/10000,r2:ssTot?Math.round((1-ssRes/ssTot)*1000)/1000:0};}
function pooledD(a,b){const ma=mean(a),mb=mean(b);const p=Math.sqrt((variance(a)+variance(b))/2);return p?Math.round((ma-mb)/p*1000)/1000:0;}

const posts=readCsv('data/processed/posts_clean.csv');
const reels=readCsv('data/processed/reels_clean.csv');
const mentions=readCsv('data/processed/mentions_clean.csv');
const comments=readCsv('data/processed/comments_clean.csv');
const all=dedupe([...posts,...reels]);
const esc=r=>Math.max(0,num(r.engagement_score));
const P=all.filter(r=>r.content_type==='post');
const R=all.filter(r=>r.content_type==='reel');

console.log('RECOMPUTED ON DEDUPLICATED n='+all.length+'\n');

// posts vs reels effect
const rE=R.map(esc),pE=P.map(esc);
console.log(`posts_vs_reels_effect : diff=${Math.round((mean(rE)-mean(pE))*100)/100}  Cohen d=${pooledD(rE,pE)}  (n=${all.length})`);

// concentration
const sorted=[...all].map(esc).sort((a,b)=>b-a);
const total=sorted.reduce((s,x)=>s+x,0);
const top10=sorted.slice(0,10).reduce((s,x)=>s+x,0);
console.log(`engagement_concentration: top_10_share=${Math.round(top10/total*1000)/10}%  (n=${all.length})`);

// comments per top post
const uniqUrls=new Set(comments.map(c=>c.post_url)).size;
console.log(`comments_per_top_post : ${Math.round(comments.length/uniqUrls*100)/100}  (n=${comments.length} comments, ${uniqUrls} posts)`);

// external proof ratio
console.log(`external_proof_ratio  : ${Math.round(mentions.length/all.length*100*100)/100} mentions/100 posts  (${mentions.length} mentions)`);

// regressions
for(const [m,lbl] of [['caption_length','caption length'],['hashtag_count','hashtag count'],['mention_count','mention count'],['views','views/plays']]){
  const g=reg(all,m);
  console.log(`regression ${lbl.padEnd(14)}: slope=${g.slope}  R2=${g.r2}  (n=${g.n})`);
}
console.log('\n(Bootstrap CIs for posts/reels already in Part II at n=150: posts 112.24 [74.36,157.32], reels 248.34 [104.59,420.50])');
