const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, ensureDir, readJson, writeText, num, round } = require("./utils");

const reportsDir = path.join(ROOT, "reports");
ensureDir(reportsDir);

function mdTable(rows, columns, limit = rows.length) {
  const selected = rows.slice(0, limit);
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = selected.map((row) => `| ${columns.map((column) => cleanCell(column.value(row))).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

function cleanCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 220);
}

function link(url) {
  return url ? `[Instagram post](${url})` : "";
}

function moneyLine(summary) {
  const followers = summary.profile.followers_count ? summary.profile.followers_count.toLocaleString("en-GB") : "not available";
  return `The public profile dataset shows ${followers} followers at collection time and includes ${summary.counts.posts} owned feed posts, ${summary.counts.reels} reels, ${summary.counts.mentions} third-party mentions, and ${summary.counts.comments} comments from selected top posts.`;
}

function bestWindow(summary, pillarName) {
  const byDay = summary.timing.filter((row) => row.period_type === "day_of_week").slice(0, 3).map((row) => row.period).join(", ");
  const byHour = summary.timing.filter((row) => row.period_type === "hour_utc").sort((a, b) => num(b.avg_engagement_score) - num(a.avg_engagement_score)).slice(0, 3).map((row) => `${row.period}:00 UTC`).join(", ");
  return `${pillarName}: prioritise ${byDay || "the strongest observed posting days"} around ${byHour || "the strongest observed hours"} and test consistently for four weeks.`;
}

function stat(summary, name) {
  return (summary.advanced_statistics || []).find((row) => row.analysis === name) || {};
}

function makeMarkdown(summary) {
  const profile = summary.profile;
  const topPillar = summary.pillars[0] || {};
  const topIntent = summary.comment_intents[0] || {};
  const typeRows = summary.type_comparison || [];
  const postType = typeRows.find((row) => row.content_type === "post") || {};
  const reelType = typeRows.find((row) => row.content_type === "reel") || {};
  const reelEffect = stat(summary, "posts_vs_reels_effect");
  const concentration = stat(summary, "engagement_concentration");

  return `# Treehouse Ghana Instagram Intelligence Report

**Public engagement, audience intent, and content strategy analysis**

Prepared from public Instagram engagement data for Treehouse Ghana.

## Executive Summary

${moneyLine(summary)}

This analysis adds a layer that Instagram native analytics does not usually provide in one place: cross-post public benchmarking, rule-based content pillar tagging, comment-intent classification, third-party mention review, and a client-ready view of what public audiences appear to respond to. Instagram native analytics remains essential for private metrics such as impressions, reach, saves, shares, profile visits, sticker taps, and link clicks.

Key findings:

- The strongest observed pillar by average engagement score is **${topPillar.pillar || "not available"}**.
- The most common visible comment intent is **${topIntent.intent || "not available"}** (${topIntent.count || 0} comments, ${topIntent.percentage || 0}% of classified comment signals).
- Owned content shows average engagement scores of ${round(postType.avg_engagement_score)} for posts and ${round(reelType.avg_engagement_score)} for reels, based on public likes, comments, and available view/play counts.
- The comments dataset is small but commercially useful: it highlights questions and signals that can be converted into booking prompts, menu context, and clearer highlights.

## Data Coverage

| Area | Count |
| --- | ---: |
| Owned feed posts analysed | ${summary.counts.posts} |
| Reels analysed | ${summary.counts.reels} |
| Third-party mentions analysed | ${summary.counts.mentions} |
| Comments analysed | ${summary.counts.comments} |
| Followers at collection time | ${profile.followers_count || "Not available"} |
| Instagram category | ${profile.category || "Not available"} |

Profile biography: ${profile.biography || "Not available"}.

Data collection limitation: this is public Instagram data analysis. It does not include private account analytics such as reach, impressions, saves, shares, profile visits, link clicks, sticker taps, ad spend, or conversion events.

## Content Performance

Engagement score is calculated as: likes + (comments x 5) + (views or plays x 0.01). It is not a replacement for native analytics, but it is useful for comparing public posts where only partial public metrics are available.

## Advanced Statistical Layer

Instagram's dashboard is strongest for native account-owner metrics such as reach and impressions. This section adds a reproducible public-data layer that is harder to get from the dashboard: content lift, concentration, outlier detection, correlations, and bootstrap uncertainty estimates.

### Model-Style Findings

${mdTable(summary.advanced_statistics || [], [
  { label: "Analysis", value: (row) => row.analysis },
  { label: "N", value: (row) => row.n },
  { label: "Metric", value: (row) => row.metric },
  { label: "Estimate", value: (row) => row.estimate },
  { label: "CI Low", value: (row) => row.ci_low },
  { label: "CI High", value: (row) => row.ci_high },
  { label: "Interpretation", value: (row) => row.interpretation },
], 20)}

Commercial reading:

- Reels show an estimated engagement-score difference of **${reelEffect.estimate ?? "not available"}** points versus posts in the public dataset. This is directional, not causal, because content format is mixed with creative quality, topic, and timing.
- The top 10 owned posts/reels generate **${concentration.estimate ?? "not available"}%** of total public engagement score. This concentration means a small number of creative patterns are carrying a large share of visible performance.
- Bootstrap confidence intervals are included to avoid overclaiming from small samples, especially at pillar level.

### Correlation Checks

${mdTable(summary.correlations || [], [
  { label: "X", value: (row) => row.x },
  { label: "Y", value: (row) => row.y },
  { label: "Pearson r", value: (row) => row.pearson_r },
  { label: "Spearman rho", value: (row) => row.spearman_rho },
  { label: "Interpretation", value: (row) => row.interpretation },
])}

### Pillar Lift vs Baseline

${mdTable(summary.pillar_lift || [], [
  { label: "Pillar", value: (row) => row.pillar },
  { label: "N", value: (row) => row.n },
  { label: "Avg Engagement", value: (row) => row.avg_engagement_score },
  { label: "Lift vs Baseline", value: (row) => `${row.lift_vs_baseline_pct}%` },
  { label: "Top-20 Hit Rate", value: (row) => `${row.top_20_hit_rate_pct}%` },
  { label: "95% CI", value: (row) => `${row.ci_low} to ${row.ci_high}` },
], 20)}

![Content pillar lift vs baseline](figures/pillar_lift_vs_baseline.svg)

### Public Engagement Outliers

${mdTable(summary.outliers || [], [
  { label: "Type", value: (row) => row.content_type },
  { label: "URL", value: (row) => link(row.url) },
  { label: "Pillar", value: (row) => row.pillar },
  { label: "Engagement", value: (row) => row.engagement_score },
  { label: "Likes", value: (row) => row.likes },
  { label: "Comments", value: (row) => row.comments },
  { label: "Views/Plays", value: (row) => row.views },
], 12)}

Outliers are useful because they show creative patterns that break away from normal performance. They should be reviewed qualitatively before turning them into repeatable templates.

### Top Posts by Likes

${mdTable(summary.top_by_likes, [
  { label: "URL", value: (row) => link(row.url) },
  { label: "Likes", value: (row) => row.likes },
  { label: "Comments", value: (row) => row.comments },
  { label: "Views/Plays", value: (row) => row.views },
  { label: "Pillar", value: (row) => row.pillar },
], 10)}

### Top Posts by Comments

${mdTable(summary.top_by_comments, [
  { label: "URL", value: (row) => link(row.url) },
  { label: "Comments", value: (row) => row.comments },
  { label: "Likes", value: (row) => row.likes },
  { label: "Engagement Score", value: (row) => row.engagement_score },
  { label: "Pillar", value: (row) => row.pillar },
], 10)}

### Top Reels by Views/Plays

${mdTable(summary.top_reels_by_views, [
  { label: "URL", value: (row) => link(row.url) },
  { label: "Views/Plays", value: (row) => row.views },
  { label: "Likes", value: (row) => row.likes },
  { label: "Comments", value: (row) => row.comments },
  { label: "Engagement Score", value: (row) => row.engagement_score },
], 10)}

![Top 10 posts by engagement score](figures/top_10_posts_by_engagement.svg)

## Posts vs Reels

${mdTable(typeRows, [
  { label: "Content Type", value: (row) => row.content_type },
  { label: "Count", value: (row) => row.count },
  { label: "Avg Engagement Score", value: (row) => row.avg_engagement_score },
  { label: "Avg Views/Plays", value: (row) => row.avg_views },
])}

![Posts vs reels comparison](figures/posts_reels_comparison.svg)

Interpretation: reels should be treated as reach and discovery assets, while feed posts and carousels can carry more detailed menu, reservation, and occasion messaging. Where reels have public plays but lower comment depth, captions and pinned comments should make the next action clearer.

## Content Pillars

${mdTable(summary.pillars, [
  { label: "Pillar", value: (row) => row.pillar },
  { label: "Posts", value: (row) => row.posts_count },
  { label: "Avg Likes", value: (row) => row.avg_likes },
  { label: "Avg Comments", value: (row) => row.avg_comments },
  { label: "Avg Views", value: (row) => row.avg_views },
  { label: "Engagement", value: (row) => row.avg_engagement_score },
  { label: "Strong Example", value: (row) => link(row.strongest_example_url) },
], 20)}

![Content pillar performance](figures/content_pillar_performance.svg)

Business interpretation:

${summary.pillars.slice(0, 8).map((row) => `- **${row.pillar}**: ${row.interpretation}`).join("\n")}

## Caption and Hashtag Analysis

| Metric | Value |
| --- | ---: |
| Average caption length | ${summary.caption_stats.average_length} characters |
| Median caption length | ${summary.caption_stats.median_length} characters |
| Average hashtags per post/reel | ${summary.caption_stats.average_hashtags} |
| Average mentions per post/reel | ${summary.caption_stats.average_mentions} |
| Short caption avg engagement | ${summary.caption_stats.short_caption_avg_engagement} |
| Medium caption avg engagement | ${summary.caption_stats.medium_caption_avg_engagement} |
| Long caption avg engagement | ${summary.caption_stats.long_caption_avg_engagement} |

Most frequent hashtags:

${mdTable(summary.hashtags, [
  { label: "Hashtag", value: (row) => `#${row.hashtag}` },
  { label: "Count", value: (row) => row.count },
], 15)}

Best-performing caption patterns are likely to combine one clear occasion cue, one sensory proof point, and one practical next step. For Treehouse Ghana, this means captions should not only describe the vibe; they should tell the reader when to come, what to try, and how to reserve.

## Timing Analysis

${mdTable(summary.timing, [
  { label: "Type", value: (row) => row.period_type },
  { label: "Period", value: (row) => row.period },
  { label: "Posts/Reels", value: (row) => row.content_count },
  { label: "Avg Engagement", value: (row) => row.avg_engagement_score },
  { label: "Avg Likes", value: (row) => row.avg_likes },
  { label: "Avg Comments", value: (row) => row.avg_comments },
], 30)}

![Engagement by posting day](figures/engagement_by_posting_day.svg)

Suggested timing windows:

- ${bestWindow(summary, "Food posts")}
- ${bestWindow(summary, "Ambience posts")}
- ${bestWindow(summary, "Event posts")}
- ${bestWindow(summary, "Booking-intent posts")}

These windows should be treated as test windows because public post timing does not include reach or follower-online data.

## Comment Intelligence

The comment review uses anonymised text only. Usernames are excluded from the processed report outputs because the commercial value is in the repeated questions and intent signals, not individual identities.

${mdTable(summary.comment_intents, [
  { label: "Intent Theme", value: (row) => row.intent },
  { label: "Count", value: (row) => row.count },
  { label: "Percent", value: (row) => `${row.percentage}%` },
  { label: "Anonymised Example", value: (row) => row.anonymised_example },
  { label: "Commercial Opportunity", value: (row) => row.commercial_opportunity },
], 20)}

![Comment intent distribution](figures/comment_intent_distribution.svg)

Repeated opportunities:

- Turn booking-related comments into faster conversion by using pinned comments, WhatsApp prompts, and caption CTAs.
- Move repeated questions about menus, pricing, location, parking, and event timing into highlights.
- Reuse positive food, ambience, and cocktail praise as anonymised social proof in stories and captions.

## Mentions Intelligence

Third-party mentions are external social proof. The mentions dataset contains ${summary.counts.mentions} public records and should be reviewed as a source of customer language, creator-led positioning, and visual proof. When mention captions overlap with strong owned-content pillars, Treehouse can repost them with added booking context.

Compared with owned posts, mentions are usually less controllable but often more credible. The practical use is to identify which customer moments people choose to share without being prompted: food, ambience, celebrations, nightlife, and group experiences.

## Strategic Recommendations

1. Post more of the strongest occasion-led pillars, especially ${summary.pillars.slice(0, 3).map((row) => row.pillar).join(", ") || "the highest-engagement pillars"}.
2. Use reels as discovery assets: short food reveals, ambience walk-throughs, event teasers, and customer-proof clips should each include a booking CTA.
3. Convert comments into reservations by replying with a consistent booking path and pinning the most useful response.
4. Build FAQ highlights for menu, location, parking/access, birthday bookings, event nights, and reservation process.
5. Make captions more commercially complete: occasion cue, product or experience cue, date/time where relevant, and booking instruction.
6. Repost third-party mentions selectively and add context that the original post may not include.
7. Track content pillars monthly so the team knows whether food, ambience, events, or celebrations are driving the strongest public response.

## Four-Week Content Calendar

| Week | Focus | Suggested Content |
| --- | --- | --- |
| Week 1 | Food and menu confidence | 2 food reels, 1 carousel with signature dishes, 1 story poll asking what guests want to try |
| Week 2 | Ambience and date night | 2 ambience reels, 1 date-night post, 1 booking reminder story sequence |
| Week 3 | Events and nightlife | 1 DJ/live music teaser, 1 event recap reel, 1 caption with date/time/reservation details |
| Week 4 | Social proof and celebrations | 2 reposts/UGC stories, 1 birthday or group booking post, 1 FAQ highlight refresh |

## Suggested Monthly KPIs

- Public engagement score by pillar
- Reels plays/views and completion proxies where available in native analytics
- Comment volume and booking-intent comment count
- Reservation CTA clicks or WhatsApp enquiries from Instagram
- Story sticker taps, link clicks, and profile actions from Instagram native analytics
- Number of customer mentions reused as social proof
- Response time to commercial comments and DMs

## Limitations and Ethics

This report is based on public Instagram data collected through Apify and analysed locally. Results depend on what was publicly available at collection time. Instagram does not expose all private analytics through this public data, including impressions, reach, saves, shares, profile visits, link clicks, DM volume, ad targeting, or completed bookings.

The conclusions are directional rather than absolute. No private account access was used, no private user data was used, and individual commenters are not identified in the report. For business decisions, combine this analysis with Treehouse Ghana's native Instagram analytics, reservation data, point-of-sale trends, and campaign context.
`;
}

function texEscape(value) {
  return String(value ?? "").replace(/[\\{}$&#_%]/g, (char) => `\\${char}`).replace(/\^/g, "\\textasciicircum{}").replace(/~/g, "\\textasciitilde{}");
}

function makeLatex(summary) {
  const lines = [];
  lines.push("\\documentclass[11pt]{article}");
  lines.push("\\usepackage[margin=1in]{geometry}");
  lines.push("\\usepackage{longtable}");
  lines.push("\\usepackage{hyperref}");
  lines.push("\\title{Treehouse Ghana Instagram Intelligence Report}");
  lines.push("\\author{Public engagement, audience intent, and content strategy analysis}");
  lines.push("\\date{}");
  lines.push("\\begin{document}");
  lines.push("\\maketitle");
  lines.push("\\section*{Executive Summary}");
  lines.push(texEscape(moneyLine(summary)));
  lines.push(`The analysis covers ${summary.counts.posts} posts, ${summary.counts.reels} reels, ${summary.counts.mentions} mentions, and ${summary.counts.comments} comments.`);
  lines.push("\\section*{Top Content Pillars}");
  lines.push("\\begin{longtable}{p{0.28\\textwidth}rrrrp{0.28\\textwidth}}");
  lines.push("Pillar & Posts & Likes & Comments & Engagement & Interpretation \\\\ \\hline");
  for (const row of summary.pillars.slice(0, 12)) {
    lines.push(`${texEscape(row.pillar)} & ${row.posts_count} & ${row.avg_likes} & ${row.avg_comments} & ${row.avg_engagement_score} & ${texEscape(row.interpretation)} \\\\`);
  }
  lines.push("\\end{longtable}");
  lines.push("\\section*{Comment Intent}");
  lines.push("\\begin{longtable}{p{0.34\\textwidth}rrp{0.34\\textwidth}}");
  lines.push("Intent & Count & Percent & Opportunity \\\\ \\hline");
  for (const row of summary.comment_intents.slice(0, 14)) {
    lines.push(`${texEscape(row.intent)} & ${row.count} & ${row.percentage}\\% & ${texEscape(row.commercial_opportunity)} \\\\`);
  }
  lines.push("\\end{longtable}");
  lines.push("\\section*{Recommendations}");
  lines.push("\\begin{enumerate}");
  lines.push("\\item Post more of the strongest occasion-led pillars.");
  lines.push("\\item Use reels for discovery and add direct booking prompts.");
  lines.push("\\item Turn repeated comments into caption FAQs and highlights.");
  lines.push("\\item Track public engagement score by pillar monthly alongside native analytics.");
  lines.push("\\end{enumerate}");
  lines.push("\\section*{Limitations and Ethics}");
  lines.push("This report is based on public Instagram data analysis. It excludes private Instagram analytics such as impressions, reach, saves, shares, profile visits, link clicks, and DMs. Conclusions are directional, not absolute.");
  lines.push("\\end{document}");
  return `${lines.join("\n")}\n`;
}

function commandExists(command) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const local = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([local, central, end]);
}

function paragraphsFromMarkdown(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.replace(/^#+\s+/gm, "").replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim())
    .filter(Boolean)
    .slice(0, 180);
}

function makeDocx(markdown, outPath) {
  const body = paragraphsFromMarkdown(markdown).map((para) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(para)}</w:t></w:r></w:p>`).join("");
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>` },
  ];
  fs.writeFileSync(outPath, makeZip(files));
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[char]));
}

function pdfEscape(value) {
  return String(value).replace(/[\\()]/g, "\\$&").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function makePdf(markdown, outPath) {
  const paragraphs = paragraphsFromMarkdown(markdown);
  const pages = [];
  let current = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = "";
    for (const word of words) {
      if ((line + " " + word).trim().length > 92) {
        current.push(line);
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
      if (current.length >= 46) {
        pages.push(current);
        current = [];
      }
    }
    if (line) current.push(line);
    current.push("");
    if (current.length >= 46) {
      pages.push(current);
      current = [];
    }
  }
  if (current.length) pages.push(current);

  const objects = [];
  const add = (value) => {
    objects.push(value);
    return objects.length;
  };
  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const pageLines of pages) {
    const content = `BT /F1 10 Tf 54 760 Td 14 TL ${pageLines.map((line) => `(${pdfEscape(line)}) Tj T*`).join(" ")} ET`;
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.writeFileSync(outPath, pdf, "binary");
}

function keepExistingOnLock(outputPath, writer) {
  try {
    writer();
  } catch (error) {
    if ((error.code === "EBUSY" || error.code === "EPERM") && fs.existsSync(outputPath)) {
      console.warn(`[warn] ${path.relative(ROOT, outputPath)} is locked; kept the existing file.`);
      return;
    }
    throw error;
  }
}

function main() {
  const summary = readJson("data/processed/analysis_summary.json", null);
  if (!summary) {
    throw new Error("Missing data/processed/analysis_summary.json. Run npm run analyse first.");
  }

  const markdown = makeMarkdown(summary);
  const latex = makeLatex(summary);
  const mdPath = path.join(reportsDir, "treehouse_ghana_instagram_insights.md");
  const texPath = path.join(reportsDir, "treehouse_ghana_instagram_insights.tex");
  const docxPath = path.join(reportsDir, "treehouse_ghana_instagram_insights.docx");
  const pdfPath = path.join(reportsDir, "treehouse_ghana_instagram_insights.pdf");

  fs.writeFileSync(mdPath, markdown, "utf8");
  fs.writeFileSync(texPath, latex, "utf8");

  const hasPandoc = commandExists("pandoc");
  if (hasPandoc) {
    try {
      execFileSync("pandoc", [mdPath, "-o", docxPath], { stdio: "inherit" });
    } catch {
      keepExistingOnLock(docxPath, () => makeDocx(markdown, docxPath));
    }
    try {
      execFileSync("pandoc", [mdPath, "-o", pdfPath], { stdio: "inherit" });
    } catch {
      keepExistingOnLock(pdfPath, () => makePdf(markdown, pdfPath));
    }
  } else {
    keepExistingOnLock(docxPath, () => makeDocx(markdown, docxPath));
    keepExistingOnLock(pdfPath, () => makePdf(markdown, pdfPath));
  }

  writeText("reports/BUILD_NOTES.md", `# Build Notes

This project was built with the local Node.js pipeline.

- Markdown and LaTeX are generated directly.
- DOCX and PDF were generated with built-in Node-only fallbacks because pandoc/LaTeX were not available in the inspected environment.
- For higher-fidelity PDF typesetting, install pandoc and a LaTeX distribution, then run \`npm run report\`.
`);

  console.log("Generated report outputs:");
  console.log(`- ${path.relative(ROOT, mdPath)}`);
  console.log(`- ${path.relative(ROOT, texPath)}`);
  console.log(`- ${path.relative(ROOT, docxPath)}`);
  console.log(`- ${path.relative(ROOT, pdfPath)}`);
}

main();
