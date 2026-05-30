# Build Notes

This project was built with the local Node.js pipeline.

- Markdown and LaTeX are generated directly.
- DOCX and PDF were generated with built-in Node-only fallbacks because pandoc/LaTeX were not available in the inspected environment.
- For higher-fidelity PDF typesetting, install pandoc and a LaTeX distribution, then run `npm run report`.
