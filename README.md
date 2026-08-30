# First Law Energies · website

Public site, static, no framework. Served by GitHub Pages from `main` at
**https://firstlawenergies.com** (`CNAME`); `firstlaw.com.br` redirects there.

## Layout
- `index.html` (PT, canonical) and `en/index.html` (EN), `contato/index.html` / `en/contact/index.html` (the contact form) and `contato/obrigado/index.html` / `en/contact/thanks/index.html` (its thank-you page): **generated**, do not edit by hand.
- `src/template.html`: the home page template; `src/contact.html` and `src/thanks.html`: the form page and its thank-you page (same bar and foot, no map). `src/copy.pt.json` / `src/copy.en.json`: every string (the form's strings under `contact`).
- `tools/build.mjs`: renders the three templates once per language. Run `node tools/build.mjs` after any edit under `src/`.
- `assets/site.css`: brand tokens + page styles. `assets/site.js`: the live map (canvas, particle routing over the real grid graph, scroll-driven).
- `assets/scrollcraft.{js,css}`: the scroll engine (vendored, never edited; theme via tokens in `site.css`).
- `assets/grid.json`: Brazil's HV network (EPE/ANEEL lines, UF boundaries, solar/wind plants) projected and simplified. Rebuild with `tools/prep-grid.mjs` from the app's `lines.geojson`, `boundaries.geojson`, `plants.geojson` (public R2 bucket used by the map app).
- `src/results.data.json`: every figure inside the "Resultados" frames (conjuntos, monthly curtailment series, the 46 mapped NE substations with their headroom, the 20 PE buses, the run counts). **Generated, never edited**: `node tools/prep-results.mjs` reads the product artifacts (`application/backend/map/data/artifacts/{plants.geojson,curtailment_monthly.json}`, `algorithm/meeting-armament/ne-screen-showcase/ne_screen_showcase.json`, `algorithm/results/headroom/2026-08-05_pesada.sweep.json`; override the roots with `APP=` / `ALGO=`). The file records its sources and the showcase status.
- `tools/lib/how.mjs`: the "Como funciona" instrument (three stage SVGs, two links, a phone variant of stage 2), drawn from the copy file's `how.labels` and `how.rows`. `tools/lib/frames.mjs`: the three product frames (Geração, T&D, Data Centers) rendered from `results.data.json` and `results.labels`; the band rule is the app's (`[headroom, next step]`, connect if headroom ≥ step, else reinforce). The frames are deliberately sparse (owner ruling 2026-08-29): a few rows per picture, no counts, no filters, nothing that reads as a partial result; the withheld Bahia buses are not drawn.
- `favicon.svg`, `CNAME`, `.nojekyll`: hosting.

## Working locally
```
node tools/build.mjs                                   # regenerate the six pages
node <scrollcraft skill>/scripts/serve.mjs --root . --port 4500   # or any static server
```
Verification screenshots (`lab/`, gitignored): `node tools/walk.mjs --url http://localhost:4500 --out lab/walk [--width 390 --height 844]` walks the page every half viewport; `npm i` installs `playwright-core` for it.

## Contact form
`/contato/` (PT) and `/en/contact/` (EN) post to FormSubmit (`https://formsubmit.co/<contact.form_action_email>`, no account, no JS): hidden `_subject`, `_honey` honeypot, `_captcha=false`, `_template=table`, `_next` to the thank-you page. The address lives in the copy files as `contact.form_action_email` (one-line change). FormSubmit sends a one-time activation link to that address on the first submission; the mailbox (or alias) must exist in Google Workspace.

## Chapters
Hero → Soluções index → 01/02/03 (one screen each, the canvas camera) → **Como funciona** (a hard cut to a paper ground, `#EEF2F8`, with the teal at its darker stop `#137268`; the canvas stops drawing under it, nothing fades) → **Resultados** (back on the canvas; one sticky product frame on the left that re-skins as the three customer blocks pass on the right; phones stack) → foot (a text link to the form page). The bar's CTA is **Login** (the app's `/auth`); the hero and Resultados CTAs go to the form page. Chapter copy lives under `how` and `results` in the copy files; product names are written `FLEo1` and `SINcopi`.

## Design brief
`../scrollcraft/builds/fle-site/BRIEF.md` holds the interview, feeling curve, grammar and signature move this page is built from.
