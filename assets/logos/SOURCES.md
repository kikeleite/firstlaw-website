# assets/logos · sources and rights

Monochrome SVG marks of the public institutions the site takes data from. Each file is
viewBox-only, one fill (`<g fill="currentColor">`), no styles, ids, scripts or external
references; `tools/lib/how.mjs` inlines them into the "Como funciona" instrument and falls
back to a mono wordmark (the acronym) when a file is missing. Produced in the gitignored lab from
the raw downloads listed below: `lab/logos/normalize.mjs` for vector sources (ibge, copernicus) and
`lab/logos/trace.mjs` for raster sources (ons, aneel, epe: ImageMagick mask → `potrace` npm →
tight viewBox measured in Chrome; coordinates in source pixels). The visual check is
`lab/logos/sheet.html` (built by `lab/logos/sheet.mjs`) / `sheet2.png` (220×60 and 110×30 on
paper `#EEF2F8`, ink `#050912`, each file as `<img>` and inlined).

## Rights note (applies to every file)

These are institutional logos: registered or de-facto trademarks of the institutions, whatever
the copyright status of the artwork. The site uses them nominatively, only to name the sources of
the public data it consumes (ONS, ANEEL, EPE, IBGE, Copernicus/ERA5), with no implied endorsement,
partnership or certification. Copernicus's own guidelines say the mark should normally appear in
its EU-flag lockup and unaltered; IBGE's mark is likewise subject to its institutional rules. The
one-colour, cropped renderings here are a design normalisation for a 110×30 px tile, not an
official variant. **The owner must confirm this nominative use (and, if in doubt, ask each
institution's communications office) before the site goes live with the marks.** Missing
institutions render as text wordmarks, which carry no artwork rights question.

## Files

### ibge.svg · Instituto Brasileiro de Geografia e Estatística
- Source: Wikimedia Commons, `File:IBGE-Brazil.svg`
  https://commons.wikimedia.org/wiki/File:IBGE-Brazil.svg
  (file: https://upload.wikimedia.org/wikipedia/commons/3/3e/IBGE-Brazil.svg; credit on Commons: https://ibge.gov.br/)
- Licence as tagged on Commons: Public domain ("PD" / text-logo rationale, artwork by IBGE). Trademark of IBGE.
- What changed: kept the symbol (four tiles + centre disc) and the "IBGE" letters; dropped the
  descriptor line "Instituto Brasileiro de Geografia e Estatística" and the ® mark (illegible at
  30 px); both blues flattened to one fill; viewBox tightened to `0.19 0.02 833.14 163.2`.
- Raw copy: `lab/logos/raw/ibge_commons.svg`.

### copernicus.svg · Copernicus programme (ERA5 source)
- Source: the official Copernicus site theme asset served by the Copernicus Climate Change Service
  (operated by ECMWF on behalf of the European Commission):
  https://climate.copernicus.eu/themes/custom/copernicus/assets/img/svgs/copernicus_eu_logo.svg
  Branding page (EPS masters, rules): https://climate.copernicus.eu/branding-guidelines
  Also seen: https://www.copernicus.eu/themes/custom/copernicus/logo.svg (same lockup with
  "Programme of the European Union"). Wikimedia Commons has only PNG (`File:Copernicus Logo 240.png`,
  CC BY-SA 3.0, European Commission).
- Rights: the Copernicus logo belongs to the European Union / European Commission; no free licence
  is stated for the site asset. Used nominatively to name the ERA5 data source.
- What changed: dropped the EU-flag block, the strapline "Europe's eyes on Earth" and the sun disc
  (in one colour the disc merges with the "n" into a blob, see `lab/logos/copernicus-sun.svg`);
  every clip-path'd gradient rectangle was replaced by its clip shape as a plain fill; viewBox
  `249 2.7 429.82 148.1` (original coordinates kept).
- Raw copies: `lab/logos/raw/copernicus_official_climate.svg`, `lab/logos/raw/copernicus_official_main.svg`.
- Alternative if the owner prefers the producer over the programme: ECMWF, Wikimedia Commons
  `File:ECMWF logo.svg` (https://commons.wikimedia.org/wiki/File:ECMWF_logo.svg, tagged public
  domain, traced from the EPS on the branding page above); normalised copy at `lab/logos/ecmwf.svg`,
  not shipped.


### ons.svg · Operador Nacional do Sistema Elétrico (raster trace)
- Source: ONS's own open-data portal asset
  https://dados.ons.org.br/images/logodadosabertos.png (PNG, 988×194, white on transparent: the
  "ONS | DADOS ABERTOS" lockup; the ONS mark itself occupies ≈243×112 px of it). The www.ons.org.br
  header file (https://www.ons.org.br/Style%20Library/custom/img/logo.png, 257×59) is clipped at
  both edges (the O and the descriptor are cut), so it was not used. No larger official raster
  exists on ons.org.br (`logoMobile.png` 151×35; Style Library listing returns 502).
- Cross-check: Wikimedia Commons `File:Logo.ons.jpg` (https://commons.wikimedia.org/wiki/File:Logo.ons.jpg,
  JPEG 552×433, uploader-tagged CC BY-SA 4.0 — the artwork is ONS's trademark regardless) traced
  the same way to `lab/logos/ons-commons.svg`: identical shapes; not shipped, the official file wins.
- Rights: trademark of ONS; no licence stated for the site asset; nominative use (see the note above).
- What changed: kept the three cut letters (symbol and wordmark are one thing); dropped the
  descriptor "Operador Nacional do Sistema Elétrico" (illegible at 30 px) and the "DADOS ABERTOS"
  half of the lockup (crop 420×112 at 0,0). Mask = the PNG's alpha channel; ×4 Lanczos upscale;
  potrace threshold 128, turdSize 2, alphaMax 1, optTolerance 0.2, turnPolicy minority. 8 contours,
  viewBox `79.97 0 242.51 112`. This is a raster trace of a 243-px-wide mark, not the vector art.
- Command: `node lab/logos/trace.mjs --in raw/ons_dados_logo.png --out ../../assets/logos/ons.svg --mode alpha --crop 420x112+0+0 --scale 4 --threshold 128`
- Raw copies: `lab/logos/raw/ons_dados_logo.png`, `raw/ons_official_logo.png` (clipped header file),
  `raw/ons_official_logoMobile.png`, `raw/ons_ptwiki.jpg` (Commons JPEG).

### aneel.svg · Agência Nacional de Energia Elétrica (raster trace, 2026 mark)
- Source: ANEEL's own launch artwork for the 2026-02-27 brand update: the thumbnail of the video
  "Atualização da marca da ANEEL" on ANEEL's official YouTube channel (@aneel, author
  "Agência Nacional de Energia Elétrica" per YouTube oEmbed): https://www.youtube.com/watch?v=N6GMbJQeoQQ,
  image https://i.ytimg.com/vi/N6GMbJQeoQQ/maxresdefault.jpg (JPEG 1280×720; the horizontal
  lockup spans ≈607×95 px of it on a near-white ground). It is the largest rendering of the new
  mark reachable from the build machine: the gov.br announcement page
  (https://www.gov.br/aneel/pt-br/assuntos/noticias/2026/aneel-apresenta-a-atualizacao-de-sua-marca-institucional)
  answers "Conteúdo Restrito" (login) to curl and to a fetch proxy; https://www.gov.br/aneel/logo.png
  is the generic gov.br mark (600×600), not ANEEL's; Canal Solar's coverage
  (https://canalsolar.com.br/aneel-lanca-nova-identidade-visual/, `aneel.webp` 768×460) carries the
  same artwork smaller and only served to confirm the mark; Commons `File:Aneel.png` (2560×970) is
  the pre-2026 mark (traced for comparison to `lab/logos/aneel-commons.svg`, not shipped).
- Rights: trademark of ANEEL (federal agency); no licence stated; nominative use. Because the source
  is a video frame rather than a brand file, ask ANEEL's communications office for the official
  vector of the 2026 mark before going live (its public GitLab `centralconteudo` sits behind a
  Cloudflare challenge; the older `Manual de Identidade Visual` PDFs on www2.aneel.gov.br cover the
  previous mark).
- What changed: kept the two-piece symbol and the "ANEEL" wordmark; dropped the descriptor
  "Agência Nacional de Energia Elétrica" (illegible at 30 px; excluded by the crop) and the
  "30 anos" seal; blue and green flattened to one fill. In the 2026 wordmark the A and N are a
  ligature and the A's counter opens downward, so 6 contours is the correct count (checked contour
  by contour against the source). Mask = HSB saturation of the JPEG (coloured artwork vs the
  grey/white ground: a luminance threshold left the green letters hollow, an HSL-saturation mask
  picked up chroma noise); crop 680×110 at 300,395; ×2 upscale; blur 0×1; potrace threshold 90
  (≈35 % saturation, the anti-aliasing midpoint for both colours), turdSize 10. viewBox
  `36.29 7 607 94.5`. Raster trace of a ≈607-px-wide JPEG lockup, not the vector art.
- Command: `node lab/logos/trace.mjs --in raw/aneel_yt_thumb.jpg --out ../../assets/logos/aneel.svg --mode sat --crop 680x110+300+395 --scale 2 --blur 0x1 --turd 10 --threshold 90`
- Raw copies: `lab/logos/raw/aneel_yt_thumb.jpg`, `raw/aneel_canalsolar_new.webp`, `raw/aneel_commons.png`
  (old mark), `raw/aneel_official_logo.png` (the gov.br mark served at /aneel/logo.png).
- Lab alternates: `lab/logos/aneel-yt-s120.svg` (threshold 120, slightly eroded), `lab/logos/aneel-commons.svg` (old mark).

### epe.svg · Empresa de Pesquisa Energética (raster trace)
- Source: official site asset https://www.epe.gov.br/PublishingImages/Logos/logo-epe-branco.png
  (PNG 325×178, white letters and orange arcs on transparent; the largest EPE file on epe.gov.br).
  The header file https://www.epe.gov.br/PublishingImages/Logos/logo-epe-site-20+.png (212×83) is
  the "20+" anniversary variant (EPE turned 20 in 2024) and `logo-epe-site.png` (150×82) is
  smaller; the mark is otherwise the same. No SharePoint listing is exposed (404).
- Rights: trademark of EPE (federal public company); no licence stated; nominative use.
- What changed: kept the "epe" letters and the four orange arcs; the "20+" element is dropped by
  choosing the plain file. Mask = the PNG's alpha channel, so the arcs' gradient fade sets where
  they end: threshold 220 keeps them at about their visible weight (128 made them heavy,
  240 started to break the thin ends; both kept as `lab/logos/epe-branco-t180.svg` / `-t240.svg`
  for comparison). In one colour the white "p" and the orange ribbon it overlaps merge into one
  contour (same effect as the Copernicus sun). ×4 Lanczos upscale; potrace threshold 220, turdSize 2.
  8 contours, viewBox `0.01 0 325.03 178`. Raster trace of a 325-px-wide PNG, not the vector art.
- Command: `node lab/logos/trace.mjs --in raw/epe_official_logo-epe-branco.png --out ../../assets/logos/epe.svg --mode alpha --scale 4 --threshold 220`
- Raw copies: `lab/logos/raw/epe_official_logo-epe-branco.png`, `raw/epe_official_logo.png` (the
  "20+" header file), `raw/epe_official_logo-epe-site.png`, `raw/epe_official_logo-epe-informa.png`.

## Search notes · why ons, aneel and epe are raster traces (no vector found; sections above supersede the fallbacks)

### ons · Operador Nacional do Sistema Elétrico
- Official site serves only a PNG: https://www.ons.org.br/Style%20Library/custom/img/logo.png
  (SharePoint theme; `logoMobile.png` likewise). dados.ons.org.br and sintegre.ons.org.br expose no SVG.
- Wikimedia Commons: no file. `File:ONS logo.svg` there is a Norwegian organisation ("SVG logos of
  organizations of Norway"), `File:Logo-ons.svg` a Dutch TV channel, `File:ONS-2D.svg` ON Semiconductor.
  pt.wikipedia's article uses `Ficheiro:Logo.ons.jpg`.
- Fallback in the build if the file is removed: mono wordmark "ONS". → Traced 2026-08-30, see `ons.svg` above.

### aneel · Agência Nacional de Energia Elétrica
- Wikimedia Commons: `File:Aneel.png` only (CC BY 3.0, credit Gov.br/aneel), PNG.
- Official: https://www.gov.br/aneel/logo.png (PNG). ANEEL announced an update of its
  institutional brand on 2026-02-27
  (https://www.gov.br/aneel/pt-br/assuntos/noticias/2026/aneel-apresenta-a-atualizacao-de-sua-marca-institucional),
  so any file obtained later should be the new mark. ANEEL's public GitLab
  (https://git.aneel.gov.br/publico/centralconteudo) sits behind a Cloudflare challenge and
  could not be listed from the build machine.
- Fallback in the build if the file is removed: mono wordmark "ANEEL". → Traced 2026-08-30 from the 2026 launch artwork, see `aneel.svg` above.

### epe · Empresa de Pesquisa Energética
- Official site serves only PNG: https://www.epe.gov.br/PublishingImages/Logos/logo-epe-site-20+.png
  (SharePoint). Wikimedia Commons: no file; pt.wikipedia's article carries no logo.
- Fallback in the build if the file is removed: mono wordmark "EPE". → Traced 2026-08-30, see `epe.svg` above.
