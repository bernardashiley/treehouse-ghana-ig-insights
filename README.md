# Treehouse Ghana — Instagram Insights

[![Analysis](https://github.com/bernardashiley/treehouse-ghana-ig-insights/actions/workflows/analyse.yml/badge.svg)](https://github.com/bernardashiley/treehouse-ghana-ig-insights/actions/workflows/analyse.yml)

Reproducible public Instagram engagement analysis for **Treehouse Ghana** (`@treehousegh`).

---

## 📊 Read the Reports

| Report | Description | Link |
|---|---|---|
| **Stakeholder Report** | Plain English, charts, recommendations | [`reports/stakeholder_report.md`](reports/stakeholder_report.md) |
| **Advanced Analysis** | Statistical tests, Monte Carlo simulations | [`reports/advanced_analysis_report.md`](reports/advanced_analysis_report.md) |
| **Technical Report** | Full data tables and methodology | [`reports/treehouse_ghana_instagram_insights.md`](reports/treehouse_ghana_instagram_insights.md) |

PDFs are generated automatically by CI and available as **workflow artifacts** — click any [Actions run](../../actions) → **treehouse-ghana-reports-N** to download.

---

## 🔬 What This Project Does

1. **Collects** public Instagram data via the [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper) — posts, reels, mentions and comments.
2. **Cleans and normalises** the data into structured CSV tables.
3. **Analyses** content performance, timing, hashtags, comment intent, and content pillars.
4. **Runs advanced statistics**: Welch t-tests, Mann-Whitney U, Kruskal-Wallis, Pearson correlations, bootstrap confidence intervals, and Monte Carlo simulations.
5. **Generates reports** in Markdown (GitHub-renderable), LaTeX (PDF), and DOCX.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20 or newer
- No other dependencies — everything is pure Node.js

### Run the analysis

```bash
# Clone the repo
git clone https://github.com/bernardashiley/treehouse-ghana-ig-insights.git
cd treehouse-ghana-ig-insights

# Run statistical analysis (reads committed CSVs in data/processed/)
npm run advanced

# Generate stakeholder report with SVG charts
npm run stakeholder

# Generate full technical report
npm run report

# Or run everything
npm run all
```

### Collect fresh data (requires Apify account)

```powershell
# Windows — set up config first (never commit this file)
cp config.ps1.example config.ps1
# Edit config.ps1 and add your APIFY_TOKEN

# Run data collection
.\scripts\run_apify_actor.ps1 .\inputs\posts_full.json treehouse_posts_full 300
.\scripts\run_apify_actor.ps1 .\inputs\reels_full.json treehouse_reels_full 150
.\scripts\run_apify_actor.ps1 .\inputs\mentions.json   treehouse_mentions   150
.\scripts\run_apify_actor.ps1 .\inputs\profile_details.json treehouse_profile_details 1

# Then re-run the analysis pipeline
npm run build
npm run advanced
npm run stakeholder
```

---

## 📁 Repository Structure

```
├── .github/workflows/analyse.yml   ← CI pipeline (runs on every push)
├── src/
│   ├── analyse.js                  ← Data cleaning + pillar tagging
│   ├── advanced_analysis.js        ← Stats tests + Monte Carlo
│   ├── generate_report.js          ← Technical Markdown + LaTeX + DOCX/PDF
│   ├── generate_stakeholder_report.js ← Plain-English report + SVG charts
│   └── utils.js                    ← Shared helpers
├── inputs/                         ← Apify scraper input configs (committed)
├── scripts/                        ← PowerShell data collection scripts
├── data/
│   ├── raw/                        ← ⛔ gitignored (raw Apify outputs)
│   └── processed/                  ← ✅ committed (clean CSVs + JSON)
└── reports/
    ├── figures/                    ← SVG charts (committed, renders on GitHub)
    ├── stakeholder_report.md       ← 📖 Read this first
    ├── stakeholder_report.tex      ← LaTeX source for PDF
    ├── advanced_analysis_report.md ← Statistical detail
    └── treehouse_ghana_instagram_insights.md
```

---

## ⚙️ CI / GitHub Actions

Every push to `main` automatically:
1. Runs `advanced_analysis.js` (reads committed CSVs)
2. Runs `generate_report.js`
3. Runs `generate_stakeholder_report.js`
4. Compiles both `.tex` files to PDF using [Tectonic](https://tectonic-typesetting.github.io/)
5. Uploads all outputs as downloadable artifacts (90-day retention)
6. Commits updated reports back to the repo

No raw data or API tokens are needed for CI — the analysis pipeline runs entirely from the committed processed CSVs.

---

## 🔒 Data Safety

| File type | Committed? | Reason |
|---|---|---|
| `config.ps1` | ❌ No | Contains API token |
| `data/raw/` | ❌ No | Large raw Apify outputs |
| `data/processed/` | ✅ Yes | Clean aggregated CSVs — no PII |
| `reports/` | ✅ Yes | Generated reports and charts |
| `inputs/` | ✅ Yes | Scraper config (no secrets) |

The committed processed data contains aggregated metrics only. No individual user names, profile pictures, or private information are stored in the repository.

---

## 📈 Key Findings (last run)

> These are updated automatically when the CI pipeline runs.

- **27,386 followers** at collection time
- **Short videos attract ~121% more engagement** than static posts on average
- **Cocktails & drinks** is the highest-performing content category (+102% above baseline)
- **Monday** is the best day to post
- **Top 10 posts generate 40.4%** of all public engagement — focus on what works
- Shifting to an optimised content mix could increase 12-week engagement by **+31%**

---

## 🛠 Tech Stack

| Tool | Purpose |
|---|---|
| Node.js 20 | Analysis pipeline — zero npm dependencies |
| Apify Instagram Scraper | Public data collection |
| GitHub Actions | CI/CD — runs analysis on every push |
| Tectonic | LaTeX → PDF compilation in CI |
| SVG | Charts — renders natively on GitHub |

---

*Analysis by Bernard Ashiley. For questions or to commission a fresh data collection, contact via GitHub Issues.*
