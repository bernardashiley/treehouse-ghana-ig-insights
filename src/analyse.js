const path = require("path");
const {
  ROOT,
  ensureDir,
  readJson,
  asArray,
  num,
  str,
  cleanText,
  dateParts,
  hashtagsFrom,
  mentionsFrom,
  writeCsv,
  writeJson,
  writeText,
  mean,
  median,
  round,
  pct,
  topN,
  metricNum,
  cleanMetric,
  dedupeByShortcode,
  splitOwned,
} = require("./utils");

const { loadRules, loadConfig } = require("./config");

const processedDir = path.join(ROOT, "data", "processed");
const figuresDir = path.join(ROOT, "reports", "figures");
ensureDir(processedDir);
ensureDir(figuresDir);

// Classification rules are loaded from config/pillar_rules.json so the pipeline
// can be retargeted to a new client or industry without editing source code.
const { pillars: pillarRules, intents: commentIntentRules } = loadRules();

function classify(text, rules, fallback) {
  const source = text.toLowerCase();
  const matches = rules.filter(([, words]) => words.some((word) => source.includes(word)));
  return matches.length ? matches.map(([name]) => name) : [fallback];
}

function primaryPillar(text) {
  return classify(text, pillarRules, "general brand/content")[0];
}

// Scraper artefacts (Apify returns -1 for hidden public metrics) are floored to 0
// for the score via metricNum; the per-field missing flags are preserved on the
// row so display tables can show "NA" instead of 0 or -1.
function engagementScore(row) {
  return round(metricNum(row.likes) + metricNum(row.comments) * 5 + metricNum(row.views) * 0.01, 2);
}

function normaliseContent(records, contentType) {
  return asArray(records).map((record) => {
    const tags = hashtagsFrom(record);
    const mentions = mentionsFrom(record);
    const caption = cleanText(record.caption);
    const dates = dateParts(record.timestamp);
    const views = Math.max(num(record.videoViewCount), num(record.videoPlayCount));
    const row = {
      id: str(record.id),
      content_type: contentType,
      instagram_type: str(record.type),
      product_type: str(record.productType),
      url: str(record.url),
      shortcode: str(record.shortCode || record.shortcode),
      timestamp: str(record.timestamp),
      date: dates.date,
      day_of_week: dates.dayOfWeek,
      hour_utc: dates.hour,
      caption,
      caption_length: caption.length,
      hashtag_count: tags.length,
      hashtags: tags.join(" "),
      mention_count: mentions.length,
      mentions: mentions.join(" "),
      likes: metricNum(record.likesCount),
      likes_missing: cleanMetric(record.likesCount).missing,
      comments: metricNum(record.commentsCount),
      views,
      views_missing: cleanMetric(views).missing,
      owner_username: str(record.ownerUsername || record.username),
      pillar: primaryPillar(`${caption} ${tags.join(" ")} ${mentions.join(" ")}`),
    };
    row.engagement_score = engagementScore(row);
    return row;
  });
}

function normaliseComments(records) {
  return asArray(records).map((record) => {
    const text = cleanText(record.text);
    const intents = classify(text, commentIntentRules, "generic/unclear");
    const dates = dateParts(record.timestamp);
    return {
      id: str(record.id),
      post_url: str(record.postUrl || record.inputUrl || record.url),
      comment_url: str(record.commentUrl),
      timestamp: str(record.timestamp),
      date: dates.date,
      day_of_week: dates.dayOfWeek,
      hour_utc: dates.hour,
      text,
      text_length: text.length,
      likes: num(record.likesCount),
      replies_count: num(record.repliesCount),
      primary_intent: intents[0],
      all_intents: intents.join("; "),
    };
  });
}

function profileSummary(profile, counts) {
  const p = asArray(profile)[0] || {};
  return [{
    username: str(p.username),
    full_name: str(p.fullName),
    category: str(p.businessCategoryName),
    biography: cleanText(p.biography),
    followers_count: num(p.followersCount),
    follows_count: num(p.followsCount),
    instagram_posts_count: num(p.postsCount),
    scraped_posts: counts.posts,
    scraped_reels: counts.reels,
    scraped_mentions: counts.mentions,
    scraped_comments: counts.comments,
    data_note: "Public Instagram engagement data only; private metrics such as impressions, saves, shares, profile visits, and link clicks are not included.",
  }];
}

function groupSummary(rows, groupKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[groupKey] || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => ({
    [groupKey]: key,
    posts_count: values.length,
    avg_likes: round(mean(values.map((row) => row.likes))),
    avg_comments: round(mean(values.map((row) => row.comments))),
    avg_views: round(mean(values.map((row) => row.views))),
    avg_engagement_score: round(mean(values.map((row) => row.engagement_score))),
    strongest_example_url: topN(values, "engagement_score", 1)[0]?.url || "",
    interpretation: pillarInterpretation(key),
  })).sort((a, b) => b.avg_engagement_score - a.avg_engagement_score);
}

function pillarInterpretation(pillar) {
  const map = {
    "food": "Use appetising food visuals with direct menu and booking prompts.",
    "cocktails/drinks": "Drinks content can support nightlife, after-work, and group-visit occasions.",
    "ambience/decor/vibe": "Vibe-led content sells the venue experience and should be paired with reservation details.",
    "date night/romance": "Position Treehouse as an occasion venue with couple-focused calls to action.",
    "birthdays/celebrations": "Celebration intent can convert into group bookings and packages.",
    "brunch/lunch": "Daytime dining can broaden demand beyond evening occasions.",
    "dinner/nightlife": "Evening content should highlight atmosphere, availability, and weekly rituals.",
    "events/live music/DJ": "Event content needs clear dates, artists, times, and booking instructions.",
    "customer/influencer/social proof": "Third-party proof builds trust; reposts should include venue and booking context.",
    "promotions/offers": "Offers should be tested with clear expiry dates and measurable response prompts.",
    "reservations/bookings": "Booking language should be more visible on high-performing posts.",
    "location/parking/access": "Access questions indicate a need for pinned logistics in captions and highlights.",
    "service/wait time": "Service signals should be monitored and escalated internally.",
    "price/value": "Price questions can be reduced with menu previews and package framing.",
  };
  return map[pillar] || "General brand content; use stronger occasion, menu, or booking cues.";
}

// Single-label: each comment is counted once under its PRIMARY intent, so counts
// sum to the number of comments analysed and percentages sum to 100%. (A comment
// can touch several themes, but for a clean, auditable table we report the single
// dominant intent.)
function commentIntentSummary(comments) {
  const total = comments.length;
  const rows = [];
  const groups = new Map();
  for (const comment of comments) {
    const intent = comment.primary_intent || "generic/unclear";
    if (!groups.has(intent)) groups.set(intent, []);
    groups.get(intent).push(comment);
  }
  for (const [intent, values] of groups.entries()) {
    rows.push({
      intent,
      count: values.length,
      percentage: pct(values.length, total),
      anonymised_example: values.find((row) => row.text.length > 8)?.text.slice(0, 120) || "",
      commercial_opportunity: intentOpportunity(intent),
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

function intentOpportunity(intent) {
  const map = {
    "booking/reservation intent": "Reply quickly with booking link or WhatsApp prompt and save FAQs to highlights.",
    "menu/food curiosity": "Use captions and carousel slides to answer menu questions before users ask.",
    "price/value concern": "Add menu ranges, bundles, or occasion packages where commercially appropriate.",
    "location/access question": "Pin address, parking, map, and arrival guidance in captions and highlights.",
    "event interest": "Create event posts with dates, times, line-up, and reservation CTA.",
    "birthday/celebration intent": "Offer a celebration booking flow and repeat it in captions.",
    "date-night/romantic ambience": "Package ambience-led content around date-night reservations.",
    "positive food praise": "Turn praise into social proof and menu-led reposts.",
    "positive ambience praise": "Use ambience comments as proof for venue positioning.",
    "drinks/cocktails praise": "Build cocktail-led reels and after-work prompts.",
    "service issue/complaint": "Track and resolve operational issues privately; avoid letting concerns sit unanswered.",
  };
  return map[intent] || "Useful brand warmth, but convert with clearer next steps.";
}

function timingSummary(rows) {
  const byDay = groupSummary(rows, "day_of_week").map((row) => ({
    period_type: "day_of_week",
    period: row.day_of_week,
    content_count: row.posts_count,
    avg_engagement_score: row.avg_engagement_score,
    avg_likes: row.avg_likes,
    avg_comments: row.avg_comments,
    avg_views: row.avg_views,
  }));
  const byHour = groupSummary(rows.filter((row) => row.hour_utc !== ""), "hour_utc").map((row) => ({
    period_type: "hour_utc",
    period: row.hour_utc,
    content_count: row.posts_count,
    avg_engagement_score: row.avg_engagement_score,
    avg_likes: row.avg_likes,
    avg_comments: row.avg_comments,
    avg_views: row.avg_views,
  }));
  return [...byDay, ...byHour].sort((a, b) => String(a.period_type).localeCompare(String(b.period_type)) || num(a.period) - num(b.period));
}

function hashtagSummary(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const tag of row.hashtags.split(" ").filter(Boolean)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([hashtag, count]) => ({ hashtag, count })).sort((a, b) => b.count - a.count).slice(0, 30);
}

function variance(values) {
  const valid = values.map(num).filter(Number.isFinite);
  if (valid.length < 2) return 0;
  const avg = mean(valid);
  return valid.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (valid.length - 1);
}

function stddev(values) {
  return Math.sqrt(variance(values));
}

function percentile(values, p) {
  const valid = values.map(num).filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const index = (valid.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return valid[lower];
  return valid[lower] + (valid[upper] - valid[lower]) * (index - lower);
}

function pearson(rows, xKey, yKey) {
  const pairs = rows.map((row) => [num(row[xKey]), num(row[yKey])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return 0;
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const xMean = mean(xs);
  const yMean = mean(ys);
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
  const denom = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0) * pairs.reduce((sum, [, y]) => sum + (y - yMean) ** 2, 0));
  return denom ? numerator / denom : 0;
}

function rankValues(values) {
  return values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value).map((item, rank) => ({ ...item, rank: rank + 1 })).sort((a, b) => a.index - b.index).map((item) => item.rank);
}

function spearman(rows, xKey, yKey) {
  const pairs = rows.map((row) => [num(row[xKey]), num(row[yKey])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return 0;
  const xRanks = rankValues(pairs.map(([x]) => x));
  const yRanks = rankValues(pairs.map(([, y]) => y));
  return pearson(xRanks.map((x, i) => ({ x, y: yRanks[i] })), "x", "y");
}

function deterministicRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function bootstrapMeanCi(values, iterations = 1000) {
  const valid = values.map(num).filter(Number.isFinite);
  if (!valid.length) return { mean: 0, ci_low: 0, ci_high: 0 };
  const rng = deterministicRandom(20260530);
  const means = [];
  for (let i = 0; i < iterations; i += 1) {
    let total = 0;
    for (let j = 0; j < valid.length; j += 1) {
      total += valid[Math.floor(rng() * valid.length)];
    }
    means.push(total / valid.length);
  }
  return {
    mean: round(mean(valid)),
    ci_low: round(percentile(means, 0.025)),
    ci_high: round(percentile(means, 0.975)),
  };
}

function welchEffect(aValues, bValues) {
  const a = aValues.map(num).filter(Number.isFinite);
  const b = bValues.map(num).filter(Number.isFinite);
  if (a.length < 2 || b.length < 2) return { mean_a: mean(a), mean_b: mean(b), difference: 0, cohens_d: 0, t_stat: 0 };
  const meanA = mean(a);
  const meanB = mean(b);
  const pooled = Math.sqrt((variance(a) + variance(b)) / 2);
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return {
    mean_a: round(meanA),
    mean_b: round(meanB),
    difference: round(meanA - meanB),
    cohens_d: pooled ? round((meanA - meanB) / pooled, 3) : 0,
    t_stat: se ? round((meanA - meanB) / se, 3) : 0,
  };
}

function simpleRegression(rows, xKey, yKey) {
  const pairs = rows.map((row) => [num(row[xKey]), num(row[yKey])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return { n: pairs.length, slope: 0, intercept: 0, r_squared: 0 };
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const xMean = mean(xs);
  const yMean = mean(ys);
  const ssX = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  const slope = ssX ? pairs.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0) / ssX : 0;
  const intercept = yMean - slope * xMean;
  const ssTotal = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const ssResidual = pairs.reduce((sum, [x, y]) => sum + (y - (intercept + slope * x)) ** 2, 0);
  return {
    n: pairs.length,
    slope: round(slope, 4),
    intercept: round(intercept, 2),
    r_squared: ssTotal ? round(1 - ssResidual / ssTotal, 3) : 0,
  };
}

function advancedStatistics(ownedContent, comments, mentions) {
  const baseline = mean(ownedContent.map((row) => row.engagement_score));
  const top20Cutoff = percentile(ownedContent.map((row) => row.engagement_score), 0.8);
  const q1 = percentile(ownedContent.map((row) => row.engagement_score), 0.25);
  const q3 = percentile(ownedContent.map((row) => row.engagement_score), 0.75);
  const iqr = q3 - q1;
  const outlierCutoff = q3 + 1.5 * iqr;
  const totalEngagement = ownedContent.reduce((sum, row) => sum + num(row.engagement_score), 0);
  const topTenShare = topN(ownedContent, "engagement_score", 10).reduce((sum, row) => sum + num(row.engagement_score), 0) / (totalEngagement || 1);

  const postScores = ownedContent.filter((row) => row.content_type === "post").map((row) => row.engagement_score);
  const reelScores = ownedContent.filter((row) => row.content_type === "reel").map((row) => row.engagement_score);
  const postsVsReels = welchEffect(reelScores, postScores);

  const rows = [
    {
      analysis: "posts_vs_reels_effect",
      n: ownedContent.length,
      metric: "engagement_score",
      estimate: postsVsReels.difference,
      ci_low: "",
      ci_high: "",
      interpretation: `Reels average ${postsVsReels.difference} engagement-score points versus posts; Cohen's d ${postsVsReels.cohens_d}.`,
    },
    {
      analysis: "engagement_concentration",
      n: ownedContent.length,
      metric: "top_10_share",
      estimate: round(topTenShare * 100, 1),
      ci_low: "",
      ci_high: "",
      interpretation: `The top 10 posts/reels account for ${round(topTenShare * 100, 1)}% of public engagement score, indicating how concentrated performance is.`,
    },
    {
      analysis: "comments_per_selected_top_post",
      n: comments.length,
      metric: "comment_volume",
      estimate: round(comments.length / new Set(comments.map((row) => row.post_url)).size),
      ci_low: "",
      ci_high: "",
      interpretation: "Average comments captured per selected high-performing post URL.",
    },
    {
      analysis: "external_social_proof_ratio",
      n: mentions.length,
      metric: "mentions_per_100_owned_posts",
      estimate: round((mentions.length / (ownedContent.length || 1)) * 100),
      ci_low: "",
      ci_high: "",
      interpretation: "Public third-party mentions per 100 owned posts/reels in the collected sample.",
    },
  ];

  for (const [metric, label] of [["caption_length", "caption length"], ["hashtag_count", "hashtag count"], ["mention_count", "caption mention count"], ["views", "views/plays"]]) {
    const reg = simpleRegression(ownedContent, metric, "engagement_score");
    rows.push({
      analysis: `simple_regression_${metric}`,
      n: reg.n,
      metric,
      estimate: reg.slope,
      ci_low: "",
      ci_high: "",
      interpretation: `Each one-unit increase in ${label} is associated with ${reg.slope} engagement-score points in a simple public-metric model; R-squared ${reg.r_squared}.`,
    });
  }

  for (const contentType of ["post", "reel"]) {
    const values = ownedContent.filter((row) => row.content_type === contentType).map((row) => row.engagement_score);
    const ci = bootstrapMeanCi(values);
    rows.push({
      analysis: `bootstrap_mean_${contentType}`,
      n: values.length,
      metric: "engagement_score",
      estimate: ci.mean,
      ci_low: ci.ci_low,
      ci_high: ci.ci_high,
      interpretation: `Bootstrap 95% confidence interval for average public engagement score for ${contentType}s.`,
    });
  }

  const pillarStats = groupSummary(ownedContent, "pillar").map((row) => {
    const members = ownedContent.filter((item) => item.pillar === row.pillar);
    const ci = bootstrapMeanCi(members.map((item) => item.engagement_score));
    return {
      pillar: row.pillar,
      n: members.length,
      avg_engagement_score: row.avg_engagement_score,
      lift_vs_baseline_pct: baseline ? round(((row.avg_engagement_score - baseline) / baseline) * 100, 1) : 0,
      top_20_hit_rate_pct: pct(members.filter((item) => item.engagement_score >= top20Cutoff).length, members.length),
      ci_low: ci.ci_low,
      ci_high: ci.ci_high,
      strongest_example_url: row.strongest_example_url,
      interpretation: row.interpretation,
    };
  });

  const correlations = [
    ["caption_length", "engagement_score"],
    ["hashtag_count", "engagement_score"],
    ["mention_count", "engagement_score"],
    ["views", "engagement_score"],
    ["likes", "comments"],
  ].map(([x, y]) => ({
    x,
    y,
    n: ownedContent.length,
    pearson_r: round(pearson(ownedContent, x, y), 3),
    spearman_rho: round(spearman(ownedContent, x, y), 3),
    interpretation: "Correlation is directional and based only on public fields; it does not prove causation.",
  }));

  const outliers = ownedContent
    .filter((row) => row.engagement_score >= outlierCutoff)
    .sort((a, b) => b.engagement_score - a.engagement_score)
    .map((row) => ({
      content_type: row.content_type,
      url: row.url,
      pillar: row.pillar,
      engagement_score: row.engagement_score,
      likes: row.likes,
      comments: row.comments,
      views: row.views,
      outlier_cutoff: round(outlierCutoff),
      caption_preview: row.caption.slice(0, 140),
    }));

  return { rows, pillarStats, correlations, outliers };
}

function writeSvgBar(relativePath, title, rows, labelKey, valueKey) {
  const width = 920;
  const rowHeight = 34;
  const margin = { top: 54, right: 32, bottom: 36, left: 260 };
  const height = margin.top + margin.bottom + rows.length * rowHeight;
  const max = Math.max(...rows.map((row) => num(row[valueKey])), 1);
  const bars = rows.map((row, index) => {
    const y = margin.top + index * rowHeight;
    const barWidth = Math.round(((width - margin.left - margin.right) * num(row[valueKey])) / max);
    const label = escapeXml(str(row[labelKey]).slice(0, 42));
    const value = escapeXml(str(row[valueKey]));
    return `<text x="16" y="${y + 21}" font-size="13" fill="#28323c">${label}</text>
<rect x="${margin.left}" y="${y + 7}" width="${barWidth}" height="18" fill="#2f6f73"/>
<text x="${margin.left + barWidth + 8}" y="${y + 21}" font-size="12" fill="#28323c">${value}</text>`;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="16" y="30" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#1f2933">${escapeXml(title)}</text>
<g font-family="Arial, sans-serif">${bars}</g>
</svg>
`;
  writeText(relativePath, svg);
}

function escapeXml(value) {
  return str(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;",
  }[char]));
}

function main() {
  // Raw-data filenames are prefixed with the client slug from config, so the
  // same code processes any client's scrape (e.g. "treehouse_posts_full.json").
  const cfg = loadConfig();
  const slug = cfg.client.slug;
  // (loadConfig imported at top alongside loadRules)
  const handle = String(cfg.client.handle || cfg.client.short_name || "").toLowerCase();
  const raw = (suffix) => `data/raw/${slug}_${suffix}.json`;
  const profile = readJson(raw("profile_details"), {});
  const rawPosts = normaliseContent(readJson(raw("posts_full"), []), "post");
  const rawReels = normaliseContent(readJson(raw("reels_full"), []), "reel");
  const mentions = normaliseContent(readJson(raw("mentions"), []), "mention");
  const comments = normaliseComments(readJson(raw("comments_top_posts"), []));

  // Canonical working dataset: deduplicate the overlapping posts/reels scrapes by
  // shortcode (the same item appears in both), then split owned vs third-party.
  // Every descriptive table below is built on the deduplicated OWNED set so that
  // Part I of the report agrees with the deduplicated Part II analysis.
  const deduped = dedupeByShortcode([...rawPosts, ...rawReels]);
  const { owned, thirdParty, ownerHandle } = splitOwned(deduped, handle);
  const ownedContent = owned;
  const dedupedReels = deduped.filter((row) => row.content_type === "reel");
  const ownedReels = owned.filter((row) => row.content_type === "reel");
  const ownedPosts = owned.filter((row) => row.content_type === "post");

  const reconciliation = [
    { stage: "Raw feed-post records", records: rawPosts.length },
    { stage: "Raw reel records", records: rawReels.length },
    { stage: "Raw total (pre-deduplication)", records: rawPosts.length + rawReels.length },
    { stage: "Deduplicated unique records (full public dataset)", records: deduped.length },
    { stage: "Owned-account records (basis for main analysis)", records: owned.length },
    { stage: "    of which owned feed posts", records: ownedPosts.length },
    { stage: "    of which owned reels", records: ownedReels.length },
    { stage: "Third-party / feature records", records: thirdParty.length },
    { stage: "Reels in full deduplicated dataset (owned + third-party)", records: dedupedReels.length },
  ];

  const profileRows = profileSummary(profile, {
    posts: rawPosts.length,
    reels: rawReels.length,
    mentions: mentions.length,
    comments: comments.length,
  });
  const pillarRows = groupSummary(ownedContent, "pillar");
  const intentRows = commentIntentSummary(comments);
  const timingRows = timingSummary(ownedContent);
  const hashtags = hashtagSummary(ownedContent);
  const advanced = advancedStatistics(ownedContent, comments, mentions);

  writeCsv("data/processed/profile_summary.csv", profileRows);
  // posts_clean / reels_clean keep the RAW normalised records so advanced_analysis.js
  // can deduplicate them identically; all summaries below use the deduplicated owned set.
  writeCsv("data/processed/posts_clean.csv", rawPosts);
  writeCsv("data/processed/reels_clean.csv", rawReels);
  writeCsv("data/processed/mentions_clean.csv", mentions);
  writeCsv("data/processed/comments_clean.csv", comments);
  writeCsv("data/processed/content_pillar_summary.csv", pillarRows);
  writeCsv("data/processed/comment_intent_summary.csv", intentRows);
  writeCsv("data/processed/timing_summary.csv", timingRows);
  writeCsv("data/processed/hashtag_summary.csv", hashtags);
  writeCsv("data/processed/advanced_statistics.csv", advanced.rows);
  writeCsv("data/processed/pillar_lift_summary.csv", advanced.pillarStats);
  writeCsv("data/processed/correlation_summary.csv", advanced.correlations);
  writeCsv("data/processed/outlier_content.csv", advanced.outliers);
  writeCsv("data/processed/data_reconciliation.csv", reconciliation);

  const topEngagement = topN(ownedContent, "engagement_score", 10);
  const dayRows = timingRows.filter((row) => row.period_type === "day_of_week");
  const typeComparison = groupSummary(ownedContent, "content_type").map((row) => ({
    content_type: row.content_type,
    count: row.posts_count,
    avg_engagement_score: row.avg_engagement_score,
    avg_views: row.avg_views,
  }));

  writeSvgBar("reports/figures/top_10_posts_by_engagement.svg", "Top 10 owned posts/reels by engagement score", topEngagement.map((row) => ({ label: `${row.content_type}: ${row.shortcode || row.url}`, score: row.engagement_score })), "label", "score");
  writeSvgBar("reports/figures/content_pillar_performance.svg", "Content pillar performance", pillarRows.slice(0, 10), "pillar", "avg_engagement_score");
  writeSvgBar("reports/figures/comment_intent_distribution.svg", "Comment intent distribution", intentRows.slice(0, 10), "intent", "count");
  writeSvgBar("reports/figures/engagement_by_posting_day.svg", "Average engagement by posting day", dayRows, "period", "avg_engagement_score");
  writeSvgBar("reports/figures/posts_reels_comparison.svg", "Posts vs reels average engagement", typeComparison, "content_type", "avg_engagement_score");
  writeSvgBar("reports/figures/pillar_lift_vs_baseline.svg", "Content pillar lift vs baseline (%)", advanced.pillarStats.slice(0, 10), "pillar", "lift_vs_baseline_pct");

  const summary = {
    generated_at: new Date().toISOString(),
    counts: {
      posts: rawPosts.length,
      reels: rawReels.length,
      mentions: mentions.length,
      comments: comments.length,
      deduplicated_unique: deduped.length,
      owned: owned.length,
      owned_posts: ownedPosts.length,
      owned_reels: ownedReels.length,
      third_party: thirdParty.length,
      deduplicated_reels: dedupedReels.length,
    },
    owner_handle: ownerHandle,
    reconciliation,
    profile: profileRows[0],
    top_by_likes: topN(ownedContent, "likes", 10),
    top_by_comments: topN(ownedContent, "comments", 10),
    top_reels_by_views: topN(ownedReels, "views", 10),
    top_by_engagement: topEngagement,
    pillars: pillarRows,
    comment_intents: intentRows,
    timing: timingRows,
    hashtags,
    caption_stats: {
      average_length: round(mean(ownedContent.map((row) => row.caption_length))),
      median_length: round(median(ownedContent.map((row) => row.caption_length))),
      average_hashtags: round(mean(ownedContent.map((row) => row.hashtag_count))),
      average_mentions: round(mean(ownedContent.map((row) => row.mention_count))),
      short_caption_avg_engagement: round(mean(ownedContent.filter((row) => row.caption_length < 120).map((row) => row.engagement_score))),
      medium_caption_avg_engagement: round(mean(ownedContent.filter((row) => row.caption_length >= 120 && row.caption_length <= 300).map((row) => row.engagement_score))),
      long_caption_avg_engagement: round(mean(ownedContent.filter((row) => row.caption_length > 300).map((row) => row.engagement_score))),
    },
    type_comparison: typeComparison,
    advanced_statistics: advanced.rows,
    pillar_lift: advanced.pillarStats,
    correlations: advanced.correlations,
    outliers: advanced.outliers,
    figures: [
      "reports/figures/top_10_posts_by_engagement.svg",
      "reports/figures/content_pillar_performance.svg",
      "reports/figures/comment_intent_distribution.svg",
      "reports/figures/engagement_by_posting_day.svg",
      "reports/figures/posts_reels_comparison.svg",
      "reports/figures/pillar_lift_vs_baseline.svg",
    ],
  };

  writeJson("data/processed/analysis_summary.json", summary);
  console.log(`Raw: ${rawPosts.length} posts + ${rawReels.length} reels = ${rawPosts.length + rawReels.length}; deduplicated ${deduped.length} unique (owned ${owned.length}, third-party ${thirdParty.length}, reels ${dedupedReels.length}). Comments: ${comments.length}.`);
}

main();
