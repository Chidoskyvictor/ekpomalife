# Third-party notices

## whot (Naija Whot! rules engine)

- Package: [whot](https://www.npmjs.com/package/whot)
- Source: https://github.com/mykeels/whot
- License: MIT
- Copyright (c) 2017 Ikechi Michael

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Kenney Furniture Kit (Buy mode furniture models)

- Source: https://kenney.nl/assets/furniture-kit (version 2.0)
- Files: `public/models/furniture/kenney/` (selected `.glb` models and their preview images)
- License: Creative Commons CC0 1.0 (public domain). Credit is not required; we credit it anyway: "Furniture Kit by Kenney (www.kenney.nl)".

## Home surface textures

Floor, grass and paver textures in `components/room/home-surfaces.tsx` are generated procedurally at runtime; no third-party assets.

## Textured furniture models (Buy mode, `public/models/furniture/pro/`)

Low-poly textured pieces; each was resized, simplified and compressed (glTF-Transform, webp textures, meshopt) and fitted to the game's tile grid. Rebuild with `scripts/models/build-pro.mjs`; the list of pieces and their sources is `scripts/models/pro-specs.json`.

- **Poly Haven models** (https://polyhaven.com), license CC0 1.0 (public domain, no credit required; credited anyway): Arm Chair 01, Mid Century Lounge Chair, Sofa 01, Sofa 02, Sofa 03, Dining Table, Dining Chair 02, Modern Wooden Cabinet, Metal Office Desk, Wooden Bookshelf Worn, Painted Wooden Shelves, Shelf 01, Painted Wooden Cabinet, Modern Coffee Table 01, Side Table 01, Ottoman 01, Painted Wooden Nightstand.
- **ambientCG textures** (https://ambientcg.com), license CC0 1.0: Fabric036 and Wood066 (colour maps) on the beds built in Blender (`scripts/models/blender/build-pro.py`, which also builds the fridges, gas cooker, standing fan and flat TV from plain shapes).

## Catalogue thumbnails (`public/models/furniture/thumbs/`)

Rendered from the models above and the other furniture models by `scripts/thumbs/render-thumbs.mjs` (three.js studio setup). They contain no third-party artwork beyond those models.
