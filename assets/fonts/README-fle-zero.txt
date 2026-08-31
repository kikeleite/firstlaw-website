FLE Zero — derived font, one glyph.

WHAT IT IS
  The digit zero (U+0030) of IBM Plex Mono with the centre dot removed. Nothing
  else: the file contains a single glyph and maps a single codepoint. Outer
  contour, counter and advance width (600/1000 em) are untouched, so it drops
  into a Plex Mono text run without shifting a single column of tabular figures.

WHY
  The dot is drawn into the Plex Mono glyph as a third contour, and the build
  served by Google Fonts exposes no OpenType feature (no `zero`, `ss01`, `salt`)
  that would swap it out. A patched glyph is the only way to remove it in CSS.

HOW IT IS USED
  Declared with `unicode-range: U+0030` and listed AHEAD of "IBM Plex Mono" in
  --sc-font-mono, so the browser takes only the zero from this file and every
  other character still comes from Plex Mono itself.

LICENCE
  IBM Plex is Copyright (c) 2017 IBM Corp., licensed under the SIL Open Font
  License 1.1, with Reserved Font Name "Plex". This file is a Modified Version
  and therefore does NOT carry the reserved name — hence "FLE Zero". It remains
  under the OFL 1.1; the full licence text is in LICENSE-OFL.txt beside this
  file. Source: https://github.com/IBM/plex
