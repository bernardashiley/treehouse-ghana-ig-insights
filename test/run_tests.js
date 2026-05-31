'use strict';
/**
 * Validity & edge-case test harness — pure Node, no dependencies.
 * Run: npm test   (node test/run_tests.js)
 *
 * Covers:
 *   1. Statistical validity — every test/stat checked against known reference values
 *   2. Computational edge cases — degenerate inputs must fail safe, never crash/NaN
 *   3. Reproducibility — seeded PRNG and seeded procedures are deterministic
 *   4. Discovery primitives — tokeniser, vector ops, k-means basics
 *
 * Exit code is non-zero if any test fails (so CI catches regressions).
 */
const A = require('../src/advanced_analysis');
const D = require('../src/discover_structure');
const U = require('../src/utils');

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; fails.push(`${name}${detail ? ' — ' + detail : ''}`); }
}
function approx(name, got, want, tol = 1e-3) {
  const good = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(name, good, `got ${got}, want ${want} (±${tol})`);
}
function noThrow(name, fn) {
  try { const v = fn(); ok(name, true); return v; }
  catch (e) { failed++; fails.push(`${name} — threw: ${e.message}`); return undefined; }
}
function finiteOrNull(name, v) {
  ok(name, v === null || v === undefined || isAllFinite(v), `non-finite in ${JSON.stringify(v)}`);
}
function isAllFinite(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(isAllFinite);
  if (typeof v === 'object') return Object.values(v).every(x => typeof x === 'number' ? Number.isFinite(x) : true);
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n— 1. STATISTICAL VALIDITY (known reference values) —');

// mean / median / variance / stddev
approx('mean([2,4,4,4,5,5,7,9])', U.mean([2,4,4,4,5,5,7,9]), 5, 1e-9);
approx('median([1,2,3,4])', U.median([1,2,3,4]), 2.5, 1e-9);
approx('median([1,2,3,4,5])', U.median([1,2,3,4,5]), 3, 1e-9);
approx('variance sample [2,4,4,4,5,5,7,9]', A.variance([2,4,4,4,5,5,7,9]), 32/7, 1e-6);   // sample var (n-1)
approx('stddev sample', A.stddev([2,4,4,4,5,5,7,9]), Math.sqrt(32/7), 1e-6);

// percentiles (linear interpolation)
approx('pctile p50 [1..5]', A.pctile([1,2,3,4,5], 0.5), 3, 1e-9);
approx('pctile p25 [1..5]', A.pctile([1,2,3,4,5], 0.25), 2, 1e-9);
approx('pctile p0',  A.pctile([1,2,3,4,5], 0), 1, 1e-9);
approx('pctile p100', A.pctile([1,2,3,4,5], 1), 5, 1e-9);

// normal CDF
approx('normalCdf(0)', A.normalCdf(0), 0.5, 2e-3);
approx('normalCdf(1.96)', A.normalCdf(1.96), 0.975, 2e-3);
approx('normalCdf(-1.96)', A.normalCdf(-1.96), 0.025, 2e-3);
approx('normalCdf(2.576)', A.normalCdf(2.576), 0.995, 2e-3);

// t two-tailed p-value (Fisher approx) vs known critical values
approx('tPValue(2.131,15)≈0.05', A.tPValue(2.131, 15), 0.05, 8e-3);   // t_{0.025,15}=2.131
approx('tPValue(2.776,4)≈0.05',  A.tPValue(2.776, 4),  0.05, 1.5e-2); // t_{0.025,4}=2.776
approx('tPValue(0,30)=1', A.tPValue(0, 30), 1, 1e-9);
approx('tPValue large t≈0', A.tPValue(10, 30), 0, 1e-3);

// chi-square right-tail p-value vs known critical values
approx('chiPValue(3.841,1)≈0.05', A.chiPValue(3.841, 1), 0.05, 5e-3);
approx('chiPValue(5.991,2)≈0.05', A.chiPValue(5.991, 2), 0.05, 5e-3);
approx('chiPValue(11.345,3)≈0.01', A.chiPValue(11.345, 3), 0.01, 5e-3);

// Pearson correlation
{
  const r1 = A.pearsonTest([1,2,3,4,5], [2,4,6,8,10]);
  approx('pearson perfect positive r=1', r1.r, 1, 1e-6);
  const r2 = A.pearsonTest([1,2,3,4,5], [10,8,6,4,2]);
  approx('pearson perfect negative r=-1', r2.r, -1, 1e-6);
  // x=[1,2,3,4,5] y=[2,1,4,3,5]: cov=8, varx=vary=10 -> r=8/10=0.8
  const r3 = A.pearsonTest([1,2,3,4,5], [2,1,4,3,5]);
  approx('pearson r=0.8 case', r3.r, 0.8, 1e-6);
}

// Welch t-test
{
  const w1 = A.welchTest([20,21,19,20,22,18], [10,11,9,10,12,8], 'a', 'b');
  ok('welch clearly-different significant', w1 && w1.p < 0.001, w1 && `p=${w1.p}`);
  ok('welch positive diff', w1 && w1.diff > 0);
  const w2 = A.welchTest([5,6,5,6,5,6], [5,6,5,6,5,6], 'a', 'b');
  approx('welch identical groups diff=0', w2.diff, 0, 1e-9);
  ok('welch identical groups p~1', w2.p > 0.9, `p=${w2.p}`);
}

// Mann-Whitney U
{
  const m1 = A.mannWhitneyU([1,2,3], [4,5,6]);
  approx('MWU fully separated U=0', m1.U, 0, 1e-9);
  const m2 = A.mannWhitneyU([1,3,5], [2,4,6]);
  ok('MWU overlapping U>0', m2.U > 0, `U=${m2.U}`);
}

// Kruskal-Wallis
{
  const kEqual = A.kruskalWallis([[1,2,3],[1,2,3],[1,2,3]]);
  ok('KW identical groups H~0', kEqual && kEqual.H < 1e-6, kEqual && `H=${kEqual.H}`);
  const kDiff = A.kruskalWallis([[1,2,3],[10,11,12],[20,21,22]]);
  ok('KW separated groups significant', kDiff && kDiff.p < 0.05, kDiff && `H=${kDiff.H},p=${kDiff.p}`);
}

// skewness / kurtosis
approx('skewness symmetric ~0', A.skewness([1,2,3,4,5,4,3,2,1]), 0, 0.3);
ok('skewness right-skew positive', A.skewness([1,1,1,1,2,3,10]) > 0);

// bootstrap CI brackets the mean and is ordered
{
  const data = [10,12,14,9,11,13,15,8,10,12];
  const ci = A.bootstrapCi(data, U.mean, A.makePrng(42), 2000);
  ok('bootstrap lower<=est<=upper', ci.lower <= ci.estimate && ci.estimate <= ci.upper, JSON.stringify(ci));
  approx('bootstrap estimate = mean', ci.estimate, U.mean(data), 1e-9);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('— 2. COMPUTATIONAL EDGE CASES (must fail safe) —');

approx('variance([]) = 0', A.variance([]), 0, 1e-9);
approx('variance([5]) = 0', A.variance([5]), 0, 1e-9);
approx('stddev([]) = 0', A.stddev([]), 0, 1e-9);
approx('pctile([],0.5) = 0', A.pctile([], 0.5), 0, 1e-9);
approx('mean([]) = 0', U.mean([]), 0, 1e-9);
approx('median([]) = 0', U.median([]), 0, 1e-9);
approx('skewness([5,5,5]) = 0 (sd=0 guard)', A.skewness([5,5,5]), 0, 1e-9);
approx('excessKurtosis([5,5,5]) = 0', A.excessKurtosis([5,5,5]), 0, 1e-9);
ok('welchTest([],[]) = null', A.welchTest([], [], 'a','b') === null);
ok('welchTest([1],[2]) = null (n<2)', A.welchTest([1], [2], 'a','b') === null);
ok('mannWhitneyU([],[]) = null', A.mannWhitneyU([], []) === null);
ok('kruskalWallis(single group) = null', A.kruskalWallis([[1,2,3]]) === null);
ok('pearsonTest n<3 = null', A.pearsonTest([1,2],[1,2]) === null);
{
  const rconst = A.pearsonTest([5,5,5,5], [1,2,3,4]);
  ok('pearson constant-x no div-by-zero (r=0)', rconst && rconst.r === 0, JSON.stringify(rconst));
}
approx('tPValue(NaN,10) = 1', A.tPValue(NaN, 10), 1, 1e-9);
approx('tPValue(2,0) = 1 (df<=0)', A.tPValue(2, 0), 1, 1e-9);
approx('chiPValue(0,1) = 1', A.chiPValue(0, 1), 1, 1e-9);
approx('chiPValue(-1,1) = 1', A.chiPValue(-1, 1), 1, 1e-9);
finiteOrNull('bootstrapCi([5]) finite', A.bootstrapCi([5], U.mean, A.makePrng(1), 100));
finiteOrNull('bootstrapCi([]) finite', A.bootstrapCi([], U.mean, A.makePrng(1), 100));
approx('normalCdf(Infinity) ~1', A.normalCdf(Infinity), 1, 1e-6);
approx('normalCdf(-Infinity) ~0', A.normalCdf(-Infinity), 0, 1e-6);

// safeScores: clamp negatives, drop non-finite
{
  const s = A.safeScores([{engagement_score:'-5'},{engagement_score:'10'},{engagement_score:'abc'},{engagement_score:'0'}]);
  ok('safeScores all non-negative & finite', s.every(x => x >= 0 && Number.isFinite(x)), JSON.stringify(s));
  // num() coerces '-5'->0 (clamped) and non-numeric 'abc'->0, so all 4 are kept as finite >=0
  ok('safeScores coerces junk to 0, keeps all', s.length === 4 && s.includes(10) && s.filter(x=>x===0).length === 3, JSON.stringify(s));
}
// dedupe: keep higher engagement per shortcode
{
  const dd = A.dedupe([
    {shortcode:'X', engagement_score:'10'}, {shortcode:'X', engagement_score:'25'},
    {shortcode:'Y', engagement_score:'5'},
  ]);
  ok('dedupe collapses duplicate shortcodes', dd.length === 2, `len=${dd.length}`);
  ok('dedupe keeps higher-engagement copy', dd.find(r=>r.shortcode==='X').engagement_score === '25');
}
// summarise on degenerate input
finiteOrNull('summarise([]) finite/safe', (function(){ const A2=require('../src/advanced_analysis'); return A2.summarise? A2.summarise([], 'x') : null; })());

// ════════════════════════════════════════════════════════════════════════════
console.log('— 3. REPRODUCIBILITY (seeded determinism) —');
{
  const seq = (s) => { const p = A.makePrng(s); return [p(),p(),p(),p(),p()]; };
  const a = seq(20260530), b = seq(20260530);
  ok('makePrng deterministic for same seed', JSON.stringify(a) === JSON.stringify(b));
  ok('makePrng differs for different seed', JSON.stringify(seq(1)) !== JSON.stringify(seq(2)));
  ok('makePrng in [0,1)', a.every(x => x >= 0 && x < 1), JSON.stringify(a));
  // bootstrap reproducible with same seed
  const data = [3,1,4,1,5,9,2,6];
  const c1 = A.bootstrapCi(data, U.mean, A.makePrng(7), 1000);
  const c2 = A.bootstrapCi(data, U.mean, A.makePrng(7), 1000);
  ok('bootstrapCi reproducible (same seed)', c1.lower === c2.lower && c1.upper === c2.upper, `${JSON.stringify(c1)} vs ${JSON.stringify(c2)}`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('— 4. DISCOVERY PRIMITIVES (tokeniser, vectors, k-means) —');
ok('tokenize empty -> []', D.tokenize('').length === 0);
ok('tokenize drops stopwords/short', D.tokenize('the a of in cat dog').every(t => t.length >= 3) && D.tokenize('the of in').length === 0);
ok('tokenize keeps hashtag/mention words', D.tokenize('#FilmSet @director loved it').includes('filmset'));
ok('tokenize strips emoji/punct', !D.tokenize('great!!! 🔥🔥 shoot').some(t => /[^a-z0-9_]/.test(t)));
{
  const v = D.l2([0,0,0]);
  ok('l2 of zero vector no NaN', v.every(Number.isFinite), JSON.stringify(v));
  approx('dot orthogonal = 0', D.dot([1,0],[0,1]), 0, 1e-9);
  const u = D.l2([3,4]);
  approx('l2 normalises to unit length', Math.hypot(u[0],u[1]), 1, 1e-9);
}
noThrow('kmeans on tiny matrix no crash', () => {
  const X = [[1,0],[0.9,0.1],[0,1],[0.1,0.9],[1,1],[0.95,0.95]];
  const km = D.kmeans(X, 2, A.makePrng(20260530), 50);
  ok('kmeans returns assignment per row', km.assign.length === X.length, `len=${km.assign.length}`);
  ok('kmeans inertia finite >=0', Number.isFinite(km.inertia) && km.inertia >= 0, `inertia=${km.inertia}`);
});
{
  // kmeans determinism with same seed
  const X = [[1,0],[0,1],[1,1],[0,0],[0.5,0.5],[0.2,0.8]];
  const k1 = D.kmeans(X, 2, A.makePrng(20260530), 50).assign.join('');
  const k2 = D.kmeans(X, 2, A.makePrng(20260530), 50).assign.join('');
  ok('kmeans deterministic (same seed)', k1 === k2, `${k1} vs ${k2}`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(56)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); console.log(''); process.exit(1); }
console.log('All checks passed.\n');
