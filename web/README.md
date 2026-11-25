# cubes-ASK // web instrument

cubes-ASK as a browser instrument: isometric cubes gathering across the frame or around a pointer, in design-system-ASK's four artwork palettes, on its `instrument` pattern, in chrome that follows the system's light or dark setting. JavaScript and Canvas 2D; no p5, no framework, no build step.

The Python sketches ([`isometric_cubes_v1.py`](../isometric_cubes_v1.py), [`isometric_cubes_v2.py`](../isometric_cubes_v2.py)) and the p5.js originals in [`provenance/p5js-original/`](../provenance/p5js-original/) stay as they are. This folder is a separate chapter beside them.

## Open it

Its public address is [cubes.A-S-K.studio](https://cubes.a-s-k.studio/), served from this folder.

Locally, serve this folder. The page reads its colors from `art-palettes.json` with `fetch`, which a page opened from a file cannot do. From this folder:

```bash
python3 -m http.server 8765
```

then open `http://localhost:8765/`. Opened from disk instead, the page says at the top that the colors did not load, and makes no cubes. The browser icons also need a served root: the page names them by root paths, as a deployed site does.

## What is here

| Folder or file | What it holds | Owner |
|---|---|---|
| `index.html` | the page: markup, copy, link-preview metadata, and a notice if a file it needs fails to load | cubes-ASK |
| `app/cubes-engine.js` | the work, the color sampler and the drawing. No DOM | cubes-ASK |
| `app/cubes-app.js` | controls, loop, pointer, undo and settings, and reading the palette data | cubes-ASK |
| `app/cubes.css` | the page's own small addition: the phone full-window row | cubes-ASK |
| `checks/engine-check.cjs` | checks the engine against the palette data: order, refusals, seeds, opacity, the cap and undo | cubes-ASK |
| `art-palettes.json` | the four artwork palettes: their colors and order | design-system-ASK, vendored |
| `instrument.js`, `instrument.css` | frame fitting, full window, fullscreen, PNG saves and the shared control styles. Knows nothing about cubes | design-system-ASK, vendored |
| `_dsa-tokens/`, `_dsa-surface/`, `licenses/` | the design system's foundation, root modules and licenses | design-system-ASK, vendored |
| `favicon.svg`, `favicon-32.png`, `favicon.ico`, `apple-touch-icon.png` | the ASK browser icons, at the site root | design-system-ASK, vendored |
| `og-image.jpg` | the link-preview card, 1200 × 630 | cubes-ASK |
| `vercel.json`, `.vercelignore` | hosting: response headers, and what stays out of the deployment | cubes-ASK |
| `VENDOR.md` | the donor commit and every vendored file's identity | cubes-ASK |

The vendored files are byte-identical copies at one design-system commit. `VENDOR.md` records it and says how to re-sync.

## Hosting

The site is this folder as it is: there is no build step, and `vercel.json` only adds response headers. `.vercelignore` keeps `checks/`, this README and `VENDOR.md` out of the deployment.

The link-preview card, `og-image.jpg`, is cut from the repository's header image, [`isometric_cubes_v2-2025-06-05-155633-00587.jpg`](../isometric_cubes_v2-2025-06-05-155633-00587.jpg): the centered 1280 × 672 band of that 1280 × 720 image, scaled to 1200 × 630. The repository's GitHub social preview is the header image itself.

## Using it

- **mode**: `full field` makes cubes across the whole frame; `around pointer` makes them near the pointer.
- **colors**: `muted purple`, `ASK emphasis`, `rainbow` and `red/pink/cyan`. In the three mixed palettes, **muted purple base** sets how often a new cube takes a base color: 80% to start in `ASK emphasis` and `red/pink/cyan`, 50% in `rainbow`. Each palette keeps its own setting. A change affects new cubes only, so the picture mixes until you clear it.
- **frame**: `free` is the shape on screen; `square`, `4:3` and `widescreen` are fixed. **save PNG** saves the picture at the frame's size: `square` 2160 × 2160, `4:3` 2880 × 2160, `widescreen` 3840 × 2160, and `free` the shape on screen at 2160 on its short side, with the long side capped at 3840. A small window still saves 3840 × 2160 in `widescreen`.
- **full window** and **fullscreen** give the canvas the window or the screen, with one row of actions under it. Where the browser refuses fullscreen, the page falls back to full window. Esc leaves full window. On a phone the row is `play`, `save` (the same `save PNG`), `controls` and `exit`; for the 8 seconds a clear can be undone, `undo` shows beside `save`, and `controls` shows only its indicator to make room.
- **tuning** holds the rate, the pointer spread, the share of each darker purple, the red + orange opacity floor and the edge weight, with **reset values**. Each affects new cubes only, except edge weight, which draws every cube again. The **settings** line lists the values in force and the seed.
- **clear** can be undone for 8 seconds. Clearing twice does not lose the first picture: each undo takes back one clear, newest first.

**Pointer.** A mouse makes cubes while it is over the canvas. A finger or a pen makes them while it is held down on the canvas, and moving it moves the neighborhood. The first finger or pen down owns the placement until it is lifted or cancelled: another finger meanwhile changes nothing, and does not take over when the first is lifted. No pointer action saves a file.

**What never changes the picture:** resizing the window, rotating a phone, changing the frame, entering or leaving full window or fullscreen, switching the system between light and dark, and saving. Each of these draws the same cubes again. A narrower frame hides cubes at its sides and does not delete them.

**Keys.** On the canvas, space pauses or plays. Esc leaves full window. With the system's reduce-motion setting on, the page starts paused.

## A full picture

A picture holds up to 30,000 cubes, about eight minutes at the starting rate. At 30,000 it is full: it pauses, the status line says so, and `play` and space do not start it again. On a phone in full window, where the status line is hidden, `clear` takes the place of `play` while the picture is full. Nothing is removed, so the picture stays exactly as it was made, and a save saves all of it. `clear` starts another picture, and starts it playing if it was the full picture, not you, that paused it. `undo` brings the full picture back, paused.

## The colors

The palettes, their colors and their order come from `art-palettes.json`, design-system-ASK's artwork palette data, vendored unchanged. How often each color is drawn, its opacity, the ground and the edges are this instrument's:

| | |
|---|---|
| Base colors | the five common ones equally, and each of the two rarer purples `#8B79A2` and `#AE87C2` at the `darker purples` share, 5% to start |
| Featured colors | equally, within the share the base leaves |
| Opacity | 96 to 223 of 255 for every color but two: red `#FA3838` and orange `#FF8000` run from the `red + orange opacity` floor, 82% to start, up to 94%. Later translucent cubes can still soften a red or orange one beneath them |
| Ground | the design system's light gradient, 45° from `#D4C6E1` to `#E2D3F0`, in every theme and in every save |
| Edges | `#6A637F`, in every theme |

A picture picks its colors by index from a seeded sequence, so the order in the data is part of the artwork: a change of order changes the picture a seed makes. If the data does not load, or is not the version-1 shape with all four palettes, the page says so at the top and makes no cubes; until the data arrives, the status line reads `loading colors`. It never paints with other colors instead.

## From the Python: what is the same, what changed

Kept: the lattice and its spacing, the five cube sizes, the translucent fill with its outline and three spokes, the opacity range of every color but red and orange, a steady rate (60 cubes a second to start, as the Python's one cube a frame), and the two placements, across the field and around the pointer.

| Python | Here | Why |
|---|---|---|
| Two scripts | one instrument with `full field` and `around pointer` | one work, two ways of placing cubes |
| One muted-purple palette, a flat `#E2D3F0` ground, `#544D5D` edges | four palettes from the design system, its light gradient, `#6A637F` edges | ASK's rulings for the instrument |
| A click saved the canvas | only `save PNG` saves | no accidental saves; touch screens |
| The window's size was the picture's | the `frame` selector, and saves at exact sizes | a saved file no longer depends on the screen |
| `random` without a seed | two seeded streams, one for places and one for colors | a palette change never moves a cube |
| A pointer spread meant to be ± 3 ran at 0 | ± 3 to start, adjustable | the stated intent |
| Six triangles per cube | one hexagon, the same shape and color | no faint seams between translucent triangles |
| No end | full at 30,000 cubes | a picture that can always be drawn again whole |

## Known limits

- **Checked in Chrome on a computer**, outside this repo: in headless Chrome, and in a signed-in desktop Chrome on the deployment before it was public.
- **Checked on ASK's iPhone on 2026-11-22**, on the live site. In Safari: startup in the default palette, placing cubes with a finger in `around pointer` without the page scrolling, the full-window row and the `controls` panel, rotating the phone, `save PNG` to Files, and a full picture followed by `clear` and `undo` in full window. In Chrome on the same iPhone the same steps worked, with one difference in saving: `save PNG` made the file, and it could be shared with AirDrop, but in this check Chrome's "Open in Downloads" did not show it. Saving it from the iPhone's share sheet, through "View More", then "Save to Files" and a folder, worked.
- **Untested:** real browser fullscreen (headless Chrome refuses it, and the iPhone checks above are of full window), Safari on a computer, Firefox, other phones, and tablets.
- **Drawing a full picture again takes about a second** in headless Chrome with software rendering: about 0.9 s at 1932 × 1582 and 1.2 s at 3840 × 2160 for 30,000 cubes. Resizing waits until the size settles when a redraw is slow, and `save PNG` shows its busy state first. A hardware-accelerated browser was not measured, and on the iPhone neither drawing nor saving was timed.
- **The full-window action row is checked in headless Chrome at 320, 360, 390 and 430 px wide.** Below 360 px it keeps one line with tighter spacing. Narrower screens are not checked.
- **No keyboard placement in `around pointer`.** `full field` covers keyboard-only use.
- **Nothing is saved between visits except settings.** The mode, palette, sliders and frame are remembered in the browser's local storage under `cubes-ASK` and `cubes-ASK/frame`. The picture itself is gone on reload.

## Not in this chapter

- Saving and reopening a picture, or a share sheet.
- The iPhone and iPad build.

## URL parameters

None is needed for ordinary use. `seed=<n>`, `cubes=<n>` (make n cubes at once, at most 30,000), `play=0`, `mode=field|pointer`, `palette=muted-purple|ask-emphasis|rainbow|red-pink-cyan`, `frame=free|square|four-three|wide`, `base=<0..100>` (the muted purple base for the chosen palette; muted purple itself ignores it), `dark=<0..20>`, `rate=<1..240>`, `spread=<0..8>`, `edge=<0..3>`, `solid=<70..93>` (the lowest opacity of red and orange, percent), and `store=0` (neither read nor write remembered settings). A value that cannot be read is ignored.
