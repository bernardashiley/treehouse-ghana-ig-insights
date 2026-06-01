# Treehouse Ghana Instagram Intelligence Report

**Public engagement, audience intent, and content strategy analysis**

Prepared from public Instagram engagement data for Treehouse Ghana.

## Executive Summary

The public profile dataset shows 27,386 followers at collection time and includes 135 owned feed posts, 84 reels, 21 third-party mentions, and 106 comments from selected top posts.

This analysis adds a layer that Instagram native analytics does not usually provide in one place: cross-post public benchmarking, rule-based content pillar tagging, comment-intent classification, third-party mention review, and a client-ready view of what public audiences appear to respond to. Instagram native analytics remains essential for private metrics such as impressions, reach, saves, shares, profile visits, sticker taps, and link clicks.

Key findings:

- The strongest observed pillar by average engagement score is **events/live music/DJ**.
- The most common visible comment intent is **generic/unclear** (86 comments, 81.1% of classified comment signals).
- Owned content shows average engagement scores of 102.72 for posts and 350.05 for reels, based on public likes, comments, and available view/play counts.
- The comments dataset is small but commercially useful: it highlights questions and signals that can be converted into booking prompts, menu context, and clearer highlights.

## Data Coverage

| Area | Count |
| --- | ---: |
| Owned feed posts analysed | 135 |
| Reels analysed | 84 |
| Third-party mentions analysed | 21 |
| Comments analysed | 106 |
| Followers at collection time | 27386 |
| Instagram category | Not available |

Profile biography: Al fresco dining in the heart of Accra! Open daily from noon - 11pm!.

Data collection limitation: this is public Instagram data analysis. It does not include private account analytics such as reach, impressions, saves, shares, profile visits, link clicks, sticker taps, ad spend, or conversion events.

## Content Performance

Engagement score is calculated as: likes + (comments x 5) + (views or plays x 0.01). It is not a replacement for native analytics, but it is useful for comparing public posts where only partial public metrics are available.

## Advanced Statistical Layer

Instagram's dashboard is strongest for native account-owner metrics such as reach and impressions. This section adds a reproducible public-data layer that is harder to get from the dashboard: content lift, concentration, outlier detection, correlations, and bootstrap uncertainty estimates.

### Model-Style Findings

| Analysis | N | Metric | Estimate | CI Low | CI High | Interpretation |
| --- | --- | --- | --- | --- | --- | --- |
| posts_vs_reels_effect | 107 | engagement_score | 247.33 |  |  | Reels average 247.33 engagement-score points versus posts; Cohen's d 0.73. |
| engagement_concentration | 107 | top_10_share | 67.1 |  |  | The top 10 posts/reels account for 67.1% of public engagement score, indicating how concentrated performance is. |
| comments_per_selected_top_post | 106 | comment_volume | 4.24 |  |  | Average comments captured per selected high-performing post URL. |
| external_social_proof_ratio | 21 | mentions_per_100_owned_posts | 19.63 |  |  | Public third-party mentions per 100 owned posts/reels in the collected sample. |
| simple_regression_caption_length | 107 | caption_length | 0.2348 |  |  | Each one-unit increase in caption length is associated with 0.2348 engagement-score points in a simple public-metric model; R-squared 0.006. |
| simple_regression_hashtag_count | 107 | hashtag_count | 14.782 |  |  | Each one-unit increase in hashtag count is associated with 14.782 engagement-score points in a simple public-metric model; R-squared 0.016. |
| simple_regression_mention_count | 107 | mention_count | 87.6868 |  |  | Each one-unit increase in caption mention count is associated with 87.6868 engagement-score points in a simple public-metric model; R-squared 0.016. |
| simple_regression_views | 107 | views | 0.0165 |  |  | Each one-unit increase in views/plays is associated with 0.0165 engagement-score points in a simple public-metric model; R-squared 0.946. |
| bootstrap_mean_post | 100 | engagement_score | 102.72 | 55.52 | 158.23 | Bootstrap 95% confidence interval for average public engagement score for posts. |
| bootstrap_mean_reel | 7 | engagement_score | 350.05 | 126.03 | 655.34 | Bootstrap 95% confidence interval for average public engagement score for reels. |

Commercial reading:

- Reels show an estimated engagement-score difference of **247.33** points versus posts in the public dataset. This is directional, not causal, because content format is mixed with creative quality, topic, and timing.
- The top 10 owned posts/reels generate **67.1%** of total public engagement score. This concentration means a small number of creative patterns are carrying a large share of visible performance.
- Bootstrap confidence intervals are included to avoid overclaiming from small samples, especially at pillar level.

### Correlation Checks

| X | Y | Pearson r | Spearman rho | Interpretation |
| --- | --- | --- | --- | --- |
| caption_length | engagement_score | 0.077 | 0.343 | Correlation is directional and based only on public fields; it does not prove causation. |
| hashtag_count | engagement_score | 0.127 | 0.273 | Correlation is directional and based only on public fields; it does not prove causation. |
| mention_count | engagement_score | 0.128 | 0.299 | Correlation is directional and based only on public fields; it does not prove causation. |
| views | engagement_score | 0.973 | 0.736 | Correlation is directional and based only on public fields; it does not prove causation. |
| likes | comments | 0.628 | 0.427 | Correlation is directional and based only on public fields; it does not prove causation. |

### Pillar Lift vs Baseline

| Pillar | N | Avg Engagement | Lift vs Baseline | Top-20 Hit Rate | 95% CI |
| --- | --- | --- | --- | --- | --- |
| events/live music/DJ | 4 | 415.83 | 249.7% | 50% | 45.88 to 882.56 |
| cocktails/drinks | 5 | 208.29 | 75.2% | 40% | 11.6 to 565.37 |
| dinner/nightlife | 10 | 154 | 29.5% | 10% | 30.17 to 389.96 |
| promotions/offers | 1 | 143.81 | 21% | 100% | 143.81 to 143.81 |
| birthdays/celebrations | 1 | 133.41 | 12.2% | 100% | 133.41 to 133.41 |
| food | 63 | 113.96 | -4.2% | 19% | 55.62 to 195.38 |
| date night/romance | 5 | 103.22 | -13.2% | 40% | 29.76 to 189.64 |
| ambience/decor/vibe | 3 | 41.33 | -65.2% | 0% | 35 to 53 |
| reservations/bookings | 1 | 35.54 | -70.1% | 0% | 35.54 to 35.54 |
| general brand/content | 14 | 24.64 | -79.3% | 7.1% | 14.93 to 36.27 |

![Content pillar lift vs baseline](figures/pillar_lift_vs_baseline.svg)

### Public Engagement Outliers

| Type | URL | Pillar | Engagement | Likes | Comments | Views/Plays |
| --- | --- | --- | --- | --- | --- | --- |
| post | [Instagram post](https://www.instagram.com/p/DN7_M4B2HMT/) | food | 1827.76 | 951 | 5 | 85176 |
| post | [Instagram post](https://www.instagram.com/p/DOGh0AXjO7k/) | food | 1371.01 | 311 | 1 | 105501 |
| post | [Instagram post](https://www.instagram.com/p/DVyiMbpiIkL/) | dinner/nightlife | 1187.77 | 421 | 3 | 75177 |
| reel | [Instagram post](https://www.instagram.com/p/Ct9Niq7gYWk/) | events/live music/DJ | 1162.34 | 488 | 1 | 66934 |
| post | [Instagram post](https://www.instagram.com/p/DNn3u9_Mt6A/) | cocktails/drinks | 931.62 | 472 | 0 | 45962 |
| post | [Instagram post](https://www.instagram.com/p/DNQSqkYsJ0i/) | food | 429.3 | 209 | 6 | 19030 |
| reel | [Instagram post](https://www.instagram.com/p/DYhwSa6saZL/) | food | 428.31 | 135 | 0 | 29331 |
| reel | [Instagram post](https://www.instagram.com/p/C_dLWQECoCe/) | events/live music/DJ | 403.9 | 236 | 4 | 14790 |
| post | [Instagram post](https://www.instagram.com/p/DF-h8-Ti51M/) | food | 401.75 | 182 | 1 | 21475 |
| post | [Instagram post](https://www.instagram.com/p/DHBelZACkVf/) | food | 390.01 | 240 | 0 | 15001 |
| post | [Instagram post](https://www.instagram.com/p/DHqrTt4iPp4/) | food | 282.3 | 186 | 1 | 9130 |
| reel | [Instagram post](https://www.instagram.com/p/CzWcDSpMoh9/) | date night/romance | 259.18 | 194 | 1 | 6018 |

Outliers are useful because they show creative patterns that break away from normal performance. They should be reviewed qualitatively before turning them into repeatable templates.

### Top Posts by Likes

| URL | Likes | Comments | Views/Plays | Pillar |
| --- | --- | --- | --- | --- |
| [Instagram post](https://www.instagram.com/p/DN7_M4B2HMT/) | 951 | 5 | 85176 | food |
| [Instagram post](https://www.instagram.com/p/Ct9Niq7gYWk/) | 488 | 1 | 66934 | events/live music/DJ |
| [Instagram post](https://www.instagram.com/p/DNn3u9_Mt6A/) | 472 | 0 | 45962 | cocktails/drinks |
| [Instagram post](https://www.instagram.com/p/DVyiMbpiIkL/) | 421 | 3 | 75177 | dinner/nightlife |
| [Instagram post](https://www.instagram.com/p/DOGh0AXjO7k/) | 311 | 1 | 105501 | food |
| [Instagram post](https://www.instagram.com/p/DHBelZACkVf/) | 240 | 0 | 15001 | food |
| [Instagram post](https://www.instagram.com/p/C_dLWQECoCe/) | 236 | 4 | 14790 | events/live music/DJ |
| [Instagram post](https://www.instagram.com/p/DNQSqkYsJ0i/) | 209 | 6 | 19030 | food |
| [Instagram post](https://www.instagram.com/p/CzWcDSpMoh9/) | 194 | 1 | 6018 | date night/romance |
| [Instagram post](https://www.instagram.com/p/DHqrTt4iPp4/) | 186 | 1 | 9130 | food |

### Top Posts by Comments

| URL | Comments | Likes | Engagement Score | Pillar |
| --- | --- | --- | --- | --- |
| [Instagram post](https://www.instagram.com/p/DNQSqkYsJ0i/) | 6 | 209 | 429.3 | food |
| [Instagram post](https://www.instagram.com/p/DN7_M4B2HMT/) | 5 | 951 | 1827.76 | food |
| [Instagram post](https://www.instagram.com/p/C_dLWQECoCe/) | 4 | 236 | 403.9 | events/live music/DJ |
| [Instagram post](https://www.instagram.com/p/DVyiMbpiIkL/) | 3 | 421 | 1187.77 | dinner/nightlife |
| [Instagram post](https://www.instagram.com/p/DV38byyMtZO/) | 2 | 39 | 67.63 | food |
| [Instagram post](https://www.instagram.com/p/DSFMv3ZDLbO/) | 2 | 97 | 107 | food |
| [Instagram post](https://www.instagram.com/p/DWToZ33FZd3/) | 1 | 12 | 25.91 | general brand/content |
| [Instagram post](https://www.instagram.com/p/DTqC6IsDN1D/) | 1 | 21 | 43.21 | events/live music/DJ |
| [Instagram post](https://www.instagram.com/p/DTYjt6CjCak/) | 1 | 45 | 83.24 | general brand/content |
| [Instagram post](https://www.instagram.com/p/DTH5haVDIMh/) | 1 | 72 | 143.81 | promotions/offers |

### Top Reels by Views/Plays

| URL | Views/Plays | Likes | Comments | Engagement Score |
| --- | --- | --- | --- | --- |
| [Instagram post](https://www.instagram.com/p/Ct9Niq7gYWk/) | 66934 | 488 | 1 | 1162.34 |
| [Instagram post](https://www.instagram.com/p/DYhwSa6saZL/) | 29331 | 135 | 0 | 428.31 |
| [Instagram post](https://www.instagram.com/p/C_dLWQECoCe/) | 14790 | 236 | 4 | 403.9 |
| [Instagram post](https://www.instagram.com/p/DLmzl8aC2vP/) | 6704 | 102 | 1 | 174.04 |
| [Instagram post](https://www.instagram.com/p/CzWcDSpMoh9/) | 6018 | 194 | 1 | 259.18 |
| [Instagram post](https://www.instagram.com/p/DWELa8Bk7NB/) | 487 | 4 | 0 | 8.87 |
| [Instagram post](https://www.instagram.com/p/DVtVGkbEotw/) | 269 | 11 | 0 | 13.69 |

![Top 10 posts by engagement score](figures/top_10_posts_by_engagement.svg)

## Posts vs Reels

| Content Type | Count | Avg Engagement Score | Avg Views/Plays |
| --- | --- | --- | --- |
| reel | 7 | 350.05 | 17790.43 |
| post | 100 | 102.72 | 4593.92 |

![Posts vs reels comparison](figures/posts_reels_comparison.svg)

Interpretation: reels should be treated as reach and discovery assets, while feed posts and carousels can carry more detailed menu, reservation, and occasion messaging. Where reels have public plays but lower comment depth, captions and pinned comments should make the next action clearer.

## Content Pillars

| Pillar | Posts | Avg Likes | Avg Comments | Avg Views | Engagement | Strong Example |
| --- | --- | --- | --- | --- | --- | --- |
| events/live music/DJ | 4 | 193.75 | 1.5 | 21458 | 415.83 | [Instagram post](https://www.instagram.com/p/Ct9Niq7gYWk/) |
| cocktails/drinks | 5 | 111.2 | 0 | 9709.2 | 208.29 | [Instagram post](https://www.instagram.com/p/DNn3u9_Mt6A/) |
| dinner/nightlife | 10 | 73 | 0.4 | 7899.8 | 154 | [Instagram post](https://www.instagram.com/p/DVyiMbpiIkL/) |
| promotions/offers | 1 | 72 | 1 | 6681 | 143.81 | [Instagram post](https://www.instagram.com/p/DTH5haVDIMh/) |
| birthdays/celebrations | 1 | 97 | 0 | 3641 | 133.41 | [Instagram post](https://www.instagram.com/p/DJJoEtFCxh_/) |
| food | 63 | 58.73 | 0.4 | 5324.87 | 113.96 | [Instagram post](https://www.instagram.com/p/DN7_M4B2HMT/) |
| date night/romance | 5 | 73 | 0.4 | 2821.8 | 103.22 | [Instagram post](https://www.instagram.com/p/CzWcDSpMoh9/) |
| ambience/decor/vibe | 3 | 39.67 | 0.33 | 0 | 41.33 | [Instagram post](https://www.instagram.com/p/DDXiNpvital/) |
| reservations/bookings | 1 | 19 | 0 | 1654 | 35.54 | [Instagram post](https://www.instagram.com/p/DIjAIJSCNB3/) |
| general brand/content | 14 | 17.5 | 0.14 | 642.64 | 24.64 | [Instagram post](https://www.instagram.com/p/DTYjt6CjCak/) |

![Content pillar performance](figures/content_pillar_performance.svg)

Business interpretation:

- **events/live music/DJ**: Event content needs clear dates, artists, times, and booking instructions.
- **cocktails/drinks**: Drinks content can support nightlife, after-work, and group-visit occasions.
- **dinner/nightlife**: Evening content should highlight atmosphere, availability, and weekly rituals.
- **promotions/offers**: Offers should be tested with clear expiry dates and measurable response prompts.
- **birthdays/celebrations**: Celebration intent can convert into group bookings and packages.
- **food**: Use appetising food visuals with direct menu and booking prompts.
- **date night/romance**: Position Treehouse as an occasion venue with couple-focused calls to action.
- **ambience/decor/vibe**: Vibe-led content sells the venue experience and should be paired with reservation details.

## Caption and Hashtag Analysis

| Metric | Value |
| --- | ---: |
| Average caption length | 142.81 characters |
| Median caption length | 137 characters |
| Average hashtags per post/reel | 3.85 |
| Average mentions per post/reel | 0.19 |
| Short caption avg engagement | 105.51 |
| Medium caption avg engagement | 127.2 |
| Long caption avg engagement | 141.89 |

Most frequent hashtags:

| Hashtag | Count |
| --- | --- |
| #treehouserestaurant | 77 |
| #dinner | 32 |
| #goodfood | 31 |
| #reels | 29 |
| #explore | 19 |
| #lunch | 16 |
| #soulmusic | 12 |
| #food | 12 |
| #foodinsta | 7 |
| #dinnertime | 7 |
| #rnb | 7 |
| #foodie | 7 |
| #livemusic | 7 |
| #soulfriday | 6 |
| #soulfridays | 6 |

Best-performing caption patterns are likely to combine one clear occasion cue, one sensory proof point, and one practical next step. For Treehouse Ghana, this means captions should not only describe the vibe; they should tell the reader when to come, what to try, and how to reserve.

## Timing Analysis

| Type | Period | Posts/Reels | Avg Engagement | Avg Likes | Avg Comments |
| --- | --- | --- | --- | --- | --- |
| day_of_week | Monday | 11 | 192.87 | 100.45 | 0.27 |
| day_of_week | Friday | 23 | 127.08 | 75.78 | 0.26 |
| day_of_week | Thursday | 22 | 120.73 | 59.86 | 0.23 |
| day_of_week | Tuesday | 28 | 119.43 | 52.21 | 0.54 |
| day_of_week | Wednesday | 15 | 81.93 | 50.67 | 0.4 |
| day_of_week | Saturday | 5 | 57.29 | 38.8 | 0.6 |
| day_of_week | Sunday | 3 | 54.15 | 32.33 | 1 |
| hour_utc | 9 | 2 | 92.73 | 47 | 0.5 |
| hour_utc | 11 | 3 | 656.92 | 359.67 | 2.67 |
| hour_utc | 12 | 44 | 49.35 | 31.73 | 0.27 |
| hour_utc | 13 | 11 | 209.89 | 84.18 | 0.55 |
| hour_utc | 14 | 5 | 251.45 | 114.6 | 0.2 |
| hour_utc | 15 | 21 | 130.21 | 69.38 | 0.43 |
| hour_utc | 16 | 10 | 165.02 | 80 | 0 |
| hour_utc | 17 | 5 | 26.6 | 25.6 | 0.2 |
| hour_utc | 18 | 4 | 47.41 | 40.25 | 0.5 |
| hour_utc | 19 | 1 | 38.19 | 19 | 0 |
| hour_utc | 20 | 1 | 83.24 | 45 | 1 |

![Engagement by posting day](figures/engagement_by_posting_day.svg)

Suggested timing windows:

- Food posts: prioritise Monday, Friday, Thursday around 11:00 UTC, 14:00 UTC, 13:00 UTC and test consistently for four weeks.
- Ambience posts: prioritise Monday, Friday, Thursday around 11:00 UTC, 14:00 UTC, 13:00 UTC and test consistently for four weeks.
- Event posts: prioritise Monday, Friday, Thursday around 11:00 UTC, 14:00 UTC, 13:00 UTC and test consistently for four weeks.
- Booking-intent posts: prioritise Monday, Friday, Thursday around 11:00 UTC, 14:00 UTC, 13:00 UTC and test consistently for four weeks.

These windows should be treated as test windows because public post timing does not include reach or follower-online data.

## Comment Intelligence

The comment review uses anonymised text only. Usernames are excluded from the processed report outputs because the commercial value is in the repeated questions and intent signals, not individual identities.

| Intent Theme | Count | Percent | Anonymised Example | Commercial Opportunity |
| --- | --- | --- | --- | --- |
| generic/unclear | 86 | 81.1% | How do i get the pictures | Useful brand warmth, but convert with clearer next steps. |
| positive ambience praise | 4 | 3.8% | Beautiful | Use ambience comments as proof for venue positioning. |
| location/access question | 4 | 3.8% | Location? | Pin address, parking, map, and arrival guidance in captions and highlights. |
| event interest | 3 | 2.8% | @enid_blekk on guitar 🎸 @niiamateycongas_ on percussion @musical_jerry_ on saxophone🎷 ✨✨✨✨✨✨✨ | Create event posts with dates, times, line-up, and reservation CTA. |
| generic praise | 3 | 2.8% | you look and sound amazing ❤️ | Useful brand warmth, but convert with clearer next steps. |
| date-night/romantic ambience | 2 | 1.9% | Love this! 🔥❤️ | Package ambience-led content around date-night reservations. |
| menu/food curiosity | 2 | 1.9% | You are phenomenal too. Your shots are great | Use captions and carousel slides to answer menu questions before users ask. |
| service issue/complaint | 1 | 0.9% | Not long now! Can’t wait!! 🙌 | Track and resolve operational issues privately; avoid letting concerns sit unanswered. |
| booking/reservation intent | 1 | 0.9% | @followers 2025 DETTY DECEMBER IN GHANA _Afrofure🇬🇭🇬🇭🇬🇭27TH DECE,2025-3TH JAN,2026. We can tailor your itinerary t | Reply quickly with booking link or WhatsApp prompt and save FAQs to highlights. |

![Comment intent distribution](figures/comment_intent_distribution.svg)

Repeated opportunities:

- Turn booking-related comments into faster conversion by using pinned comments, WhatsApp prompts, and caption CTAs.
- Move repeated questions about menus, pricing, location, parking, and event timing into highlights.
- Reuse positive food, ambience, and cocktail praise as anonymised social proof in stories and captions.

## Mentions Intelligence

Third-party mentions are external social proof. The mentions dataset contains 21 public records and should be reviewed as a source of customer language, creator-led positioning, and visual proof. When mention captions overlap with strong owned-content pillars, Treehouse can repost them with added booking context.

Compared with owned posts, mentions are usually less controllable but often more credible. The practical use is to identify which customer moments people choose to share without being prompted: food, ambience, celebrations, nightlife, and group experiences.

## Strategic Recommendations

1. Post more of the strongest occasion-led pillars, especially events/live music/DJ, cocktails/drinks, dinner/nightlife.
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
