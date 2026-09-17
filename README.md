# First Law Energies · website

Public site, static, no framework. Served by GitHub Pages from `main` at
https://firstlawenergies.com (`CNAME`).

## Layout
- `index.html` (PT, canonical), `en/index.html` (EN), `contato/index.html` and `en/contact/index.html` (redirects to the home page) and `404.html`: generated, do not edit by hand.
- `src/template.html`: the home page. `src/contact.html`: the redirect page. `src/404.html`: the not-found page. `src/copy.pt.json` / `src/copy.en.json`: every string. `src/curva-demanda.svg`: the demand chart.
- `tools/build.mjs`: validates the simulator config, pre-renders the panel and writes the pages. Run `node tools/build.mjs` after any edit under `src/`, `assets/simulador.config.json` or `assets/simulador.js`.
- `assets/scrollcraft.css` (design tokens, vendored) and `assets/site.css` (brand tokens, the bar). `assets/home.css`: the home page's own components.
- `assets/simulador.js` (pure calculation, no DOM), `assets/simulador-ui.js` (interface), `assets/simulador.config.json` (parameters, validated by `tools/validar-config.mjs`). `assets/curva.js`: the chart's motion layer. `assets/formulario.js`: the diagnostic form.
- `assets/fonts/`: FLE Zero, a single patched zero glyph over IBM Plex Mono (see `README-fle-zero.txt` and `LICENSE-OFL.txt`). The other faces come from Google Fonts.
- `favicon.svg`, `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml`: hosting.

## Working locally
```
node tools/build.mjs                    # regenerate the pages
node --test "tests/**/*.test.js"        # simulator and config tests (npm test)
node tools/validar-config.mjs           # config only (npm run validate)
```
Serve the repository root with any static server (the scripts assume port 4500). `npm i` installs `playwright-core` for browser checks.

## Form
The diagnostic form sends its fields and the PDF bills to a backend endpoint (the `ENDPOINT` constant at the top of `assets/formulario.js`). No API key or secret lives in this repository. The contact address is in the copy files (`home.foot.email`).
