'use strict';
/**
 * Unsupervised content-structure discovery.
 *
 * Lets the data — not pre-set keyword pillars — reveal the account's natural
 * content themes. Pipeline (pure Node, seeded, reproducible):
 *   captions + hashtags + mentions  ->  tokenise + stopword filter
 *   ->  TF-IDF document vectors (L2-normalised)
 *   ->  k-means++ clustering, k chosen by mean silhouette over k=3..8
 *   ->  PCA (power iteration) to 2-D for a scatter plot
 *   ->  per-cluster top terms ("discovered theme"), size, engagement, example
 *
 * This is interpretable unsupervised ML, deliberately chosen over a black-box
 * neural model: at this data scale it is reproducible, inspectable, and honest.
 *
 * Outputs:
 *   data/processed/discovered_clusters.csv      (per-post cluster assignment)
 *   data/processed/cluster_summary.csv          (per-cluster theme + metrics)
 *   reports/figures/clusters_pca.svg            (2-D map coloured by cluster)
 *   data/processed/structure_discovery.json     (full result, for the report)
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');

// ── IO ──────────────────────────────────────────────────────────────────────
function parseLine(line){const o=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;}
function readCsv(rel){const f=path.join(ROOT,rel);if(!fs.existsSync(f))return[];const L=fs.readFileSync(f,'utf8').replace(/^﻿/,'').split('\n').filter(x=>x.trim());const h=parseLine(L[0]);return L.slice(1).map(l=>{const v=parseLine(l);const r={};h.forEach((k,i)=>r[k.trim()]=(v[i]??'').trim());return r;});}
function writeCsv(rel,rows){const f=path.join(ROOT,rel);if(!rows.length){fs.writeFileSync(f,'');return;}const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];const esc=v=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};fs.writeFileSync(f,[cols.join(','),...rows.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\n')+'\n');}
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};

// ── seeded PRNG ───────────────────────────────────────────────────────────────
function makePrng(seed){let s=(seed>>>0)||1;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}

// ── text → tokens ─────────────────────────────────────────────────────────────
const STOP = new Set(('a an the and or but if then else of to in on at for with from by as is are was were be been being this that these those it its it\'s i you he she they we me my your his her their our us him them what which who whom whose when where why how all any both each few more most other some such no nor not only own same so than too very can will just don do does did doing would should could ought im ive id em get got go going get one two new now out up down off over under again here there via amp ft feat http https www com instagram reel p '+
  'today day time year years week weeks month great good love thanks thank you guys also still even much many lot back first last next big').split(/\s+/));

function tokenize(text){
  return String(text||'').toLowerCase()
    .replace(/https?:\/\/\S+/g,' ')
    .replace(/[^a-z0-9#@_\s]/g,' ')        // keep hashtags/mentions, drop punctuation/emoji
    .split(/\s+/)
    .map(t=>t.replace(/^[#@]/,''))          // strip leading # / @ but keep the word
    .filter(t=>t.length>=3 && !STOP.has(t) && !/^\d+$/.test(t));
}

// ── linear algebra helpers ────────────────────────────────────────────────────
function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function l2(v){const n=Math.sqrt(dot(v,v))||1;return v.map(x=>x/n);}

// ── k-means++ ─────────────────────────────────────────────────────────────────
function kmeans(X,k,rng,iters=60){
  const n=X.length,d=X[0].length;
  // k-means++ init
  const centers=[X[Math.floor(rng()*n)].slice()];
  while(centers.length<k){
    const d2=X.map(x=>Math.min(...centers.map(c=>{let s=0;for(let i=0;i<d;i++){const t=x[i]-c[i];s+=t*t;}return s;})));
    const sum=d2.reduce((a,b)=>a+b,0)||1;let r=rng()*sum,idx=0;
    for(let i=0;i<n;i++){r-=d2[i];if(r<=0){idx=i;break;}}
    centers.push(X[idx].slice());
  }
  let assign=new Array(n).fill(0);
  for(let it=0;it<iters;it++){
    let moved=false;
    for(let i=0;i<n;i++){
      let best=0,bd=Infinity;
      for(let c=0;c<k;c++){let s=0;for(let j=0;j<d;j++){const t=X[i][j]-centers[c][j];s+=t*t;}if(s<bd){bd=s;best=c;}}
      if(assign[i]!==best){assign[i]=best;moved=true;}
    }
    const sums=Array.from({length:k},()=>new Float64Array(d));const cnt=new Array(k).fill(0);
    for(let i=0;i<n;i++){cnt[assign[i]]++;const s=sums[assign[i]];for(let j=0;j<d;j++)s[j]+=X[i][j];}
    for(let c=0;c<k;c++){if(cnt[c]===0){centers[c]=X[Math.floor(rng()*n)].slice();continue;}for(let j=0;j<d;j++)centers[c][j]=sums[c][j]/cnt[c];}
    if(!moved&&it>0)break;
  }
  // inertia
  let inertia=0;for(let i=0;i<n;i++){const c=centers[assign[i]];let s=0;for(let j=0;j<d;j++){const t=X[i][j]-c[j];s+=t*t;}inertia+=s;}
  return {assign,centers,inertia};
}

// mean silhouette (cosine-ish via euclidean on L2-normalised vectors)
function silhouette(X,assign,k){
  const n=X.length;if(k<2)return 0;
  const byC=Array.from({length:k},()=>[]);assign.forEach((c,i)=>byC[c].push(i));
  const dist=(a,b)=>{let s=0;for(let j=0;j<a.length;j++){const t=a[j]-b[j];s+=t*t;}return Math.sqrt(s);};
  let total=0,cntS=0;
  // sample up to 200 points for speed
  const idxs=n>200?Array.from({length:200},(_,i)=>Math.floor(i*n/200)):[...Array(n).keys()];
  for(const i of idxs){
    const ci=assign[i];if(byC[ci].length<=1)continue;
    let a=0;for(const j of byC[ci])if(j!==i)a+=dist(X[i],X[j]);a/=(byC[ci].length-1);
    let b=Infinity;
    for(let c=0;c<k;c++){if(c===ci||!byC[c].length)continue;let m=0;for(const j of byC[c])m+=dist(X[i],X[j]);m/=byC[c].length;if(m<b)b=m;}
    total+=(b-a)/Math.max(a,b);cntS++;
  }
  return cntS?total/cntS:0;
}

// ── PCA (top-2 PCs via power iteration on covariance) ──────────────────────────
function pca2(X){
  const n=X.length,d=X[0].length;
  const mean=new Float64Array(d);for(const x of X)for(let j=0;j<d;j++)mean[j]+=x[j];for(let j=0;j<d;j++)mean[j]/=n;
  const Xc=X.map(x=>x.map((v,j)=>v-mean[j]));
  // covariance is d×d — d can be large; instead power-iterate using X^T (X v)
  const rng=makePrng(7);
  function topPC(prev){
    let v=Array.from({length:d},()=>rng()-0.5);v=l2(v);
    for(let it=0;it<100;it++){
      // w = Xc^T Xc v
      const Xv=Xc.map(x=>dot(x,v));
      const w=new Float64Array(d);for(let i=0;i<n;i++){const xi=Xc[i],s=Xv[i];for(let j=0;j<d;j++)w[j]+=xi[j]*s;}
      let wv=Array.from(w);
      // deflate previous component
      if(prev){const p=dot(wv,prev);for(let j=0;j<d;j++)wv[j]-=p*prev[j];}
      const nv=l2(wv);
      let diff=0;for(let j=0;j<d;j++)diff+=Math.abs(nv[j]-v[j]);v=nv;if(diff<1e-6)break;
    }
    return v;
  }
  const pc1=topPC(null),pc2=topPC(pc1);
  return Xc.map(x=>[dot(x,pc1),dot(x,pc2)]);
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
function main(){
  const SEED=20260530;
  const posts=readCsv('data/processed/posts_clean.csv');
  const reels=readCsv('data/processed/reels_clean.csv');
  // dedupe by shortcode, keep higher engagement
  const seen=new Map();
  for(const r of [...posts,...reels]){const k=r.shortcode||r.id;if(!seen.has(k)||num(r.engagement_score)>num(seen.get(k).engagement_score))seen.set(k,r);}
  const docs=[...seen.values()].filter(r=>tokenize(`${r.caption} ${r.hashtags} ${r.mentions}`).length>=3);
  if(docs.length<20){console.error(`Only ${docs.length} usable documents — too few for clustering.`);process.exit(1);}

  // ── TF-IDF ──
  const tokenLists=docs.map(r=>tokenize(`${r.caption} ${r.hashtags} ${r.hashtags} ${r.mentions}`)); // hashtags weighted x2
  const dfMap=new Map();
  tokenLists.forEach(toks=>{for(const t of new Set(toks))dfMap.set(t,(dfMap.get(t)||0)+1);});
  // keep terms appearing in >=3 docs and < 60% of docs (drop ubiquitous)
  const N=docs.length;
  const vocab=[...dfMap.entries()].filter(([t,df])=>df>=3 && df<0.6*N).sort((a,b)=>b[1]-a[1]).slice(0,400).map(([t])=>t);
  const vIdx=new Map(vocab.map((t,i)=>[i,t]));const tIdx=new Map(vocab.map((t,i)=>[t,i]));
  const idf=vocab.map(t=>Math.log(N/(dfMap.get(t))));
  const X=tokenLists.map(toks=>{
    const tf=new Float64Array(vocab.length);
    for(const t of toks){const i=tIdx.get(t);if(i!==undefined)tf[i]+=1;}
    for(let i=0;i<tf.length;i++)tf[i]=(tf[i]?1+Math.log(tf[i]):0)*idf[i];
    return l2(Array.from(tf));
  });

  // ── choose k by silhouette ──
  const rng=makePrng(SEED);
  let best=null;
  const trials=[];
  for(let k=3;k<=8;k++){
    let bk=null;
    for(let restart=0;restart<4;restart++){const km=kmeans(X,k,rng);if(!bk||km.inertia<bk.inertia)bk=km;}
    const sil=silhouette(X,bk.assign,k);
    trials.push({k,silhouette:Math.round(sil*1000)/1000,inertia:Math.round(bk.inertia*100)/100});
    if(!best||sil>best.sil){best={k,sil,...bk};}
  }
  const k=best.k,assign=best.assign;

  // ── per-cluster summary ──
  const esc=r=>Math.max(0,num(r.engagement_score));
  const clusters=[];
  for(let c=0;c<k;c++){
    const members=docs.filter((_,i)=>assign[i]===c);
    const memberIdx=docs.map((_,i)=>i).filter(i=>assign[i]===c);
    // top terms = highest mean TF-IDF within cluster
    const meanVec=new Float64Array(vocab.length);
    for(const i of memberIdx){const x=X[i];for(let j=0;j<x.length;j++)meanVec[j]+=x[j];}
    for(let j=0;j<meanVec.length;j++)meanVec[j]/=(memberIdx.length||1);
    const topTerms=[...meanVec].map((w,j)=>[vIdx.get(j),w]).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([t])=>t);
    const engs=members.map(esc);
    const avgEng=engs.length?Math.round(engs.reduce((a,b)=>a+b,0)/engs.length):0;
    const example=members.slice().sort((a,b)=>esc(b)-esc(a))[0]||{};
    clusters.push({cluster:c+1,size:members.length,share_pct:Math.round(1000*members.length/N)/10,avg_engagement:avgEng,top_terms:topTerms.join(', '),example_url:example.url||''});
  }
  clusters.sort((a,b)=>b.avg_engagement-a.avg_engagement);

  // ── PCA 2-D coords ──
  const coords=pca2(X);

  // ── write outputs ──
  writeCsv('data/processed/cluster_summary.csv',clusters);
  writeCsv('data/processed/discovered_clusters.csv',docs.map((r,i)=>({
    shortcode:r.shortcode,content_type:r.content_type,cluster:assign[i]+1,
    engagement_score:r.engagement_score,pc1:Math.round(coords[i][0]*1000)/1000,pc2:Math.round(coords[i][1]*1000)/1000,
    caption_preview:String(r.caption||'').replace(/\s+/g,' ').slice(0,80)
  })));

  // ── SVG scatter (PCA map coloured by cluster) ──
  const W=760,H=560,M=50;
  const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const sx=v=>M+(v-xmin)/((xmax-xmin)||1)*(W-2*M);
  const sy=v=>H-M-(v-ymin)/((ymax-ymin)||1)*(H-2*M);
  const PAL=['#2D6A4F','#C9A84C','#2E86AB','#7B2D8B','#E07B39','#E05C4B','#1B3A2D','#52B788'];
  let pts='';
  coords.forEach((c,i)=>{pts+=`<circle cx="${Math.round(sx(c[0]))}" cy="${Math.round(sy(c[1]))}" r="4" fill="${PAL[assign[i]%PAL.length]}" fill-opacity="0.75"/>`;});
  let legend='';
  clusters.forEach((cl,i)=>{const cy=70+i*22;legend+=`<rect x="${W-220}" y="${cy-10}" width="12" height="12" fill="${PAL[(cl.cluster-1)%PAL.length]}"/><text x="${W-203}" y="${cy}" font-family="Arial" font-size="11" fill="#1F2937">C${cl.cluster}: ${cl.top_terms.split(', ').slice(0,3).join(' / ')}</text>`;});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>`+
    `<text x="${M}" y="28" font-family="Arial" font-size="18" font-weight="bold" fill="#1B3A2D">Content map: discovered themes (PCA of caption TF-IDF)</text>`+
    `<text x="${M}" y="46" font-family="Arial" font-size="12" fill="#6B7280">Each dot is a post; proximity = similar wording; colour = discovered cluster</text>`+
    pts+legend+`</svg>`;
  fs.writeFileSync(path.join(ROOT,'reports','figures','clusters_pca.svg'),svg);

  const result={seed:SEED,n_docs:N,vocab_size:vocab.length,chosen_k:k,silhouette:Math.round(best.sil*1000)/1000,k_trials:trials,clusters};
  fs.writeFileSync(path.join(ROOT,'data','processed','structure_discovery.json'),JSON.stringify(result,null,2)+'\n');

  // ── console summary ──
  console.log(`Documents clustered: ${N} | vocab: ${vocab.length} terms | seed ${SEED}`);
  console.log(`k chosen by silhouette: k=${k} (silhouette ${result.silhouette})`);
  console.log('k-trials:',trials.map(t=>`k${t.k}=${t.silhouette}`).join('  '));
  console.log('\nDiscovered themes (by avg engagement):');
  for(const cl of clusters) console.log(`  C${cl.cluster}  n=${String(cl.size).padStart(3)} (${String(cl.share_pct).padStart(4)}%)  avgEng=${String(cl.avg_engagement).padStart(5)}  | ${cl.top_terms}`);
}

module.exports = { makePrng, tokenize, dot, l2, kmeans, silhouette, pca2 };
if (require.main === module) main();
