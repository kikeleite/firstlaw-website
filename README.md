# First Law Energies — website

Public site for First Law Energies. Currently a single-page **under construction**
placeholder — dependency-free static HTML, no build step, no JavaScript.

## Files
- `index.html` — the complete page (deploy this).
- `favicon.svg` — the ΔU=0 delta mark shown in the browser tab.
- `CNAME` — canonical custom domain for GitHub Pages (`firstlawenergies.com`).
- `.nojekyll` — serve files as-is (skip GitHub's Jekyll build).

## Hosting
Served by **GitHub Pages** from the `main` branch (repo root).

- Canonical domain: **https://firstlawenergies.com**
- **firstlaw.com.br** redirects to the canonical domain via a Cloudflare Redirect Rule.

DNS is managed in Cloudflare. To change the page, edit `index.html`, commit, and
push to `main` — GitHub Pages redeploys automatically within a minute or two.
