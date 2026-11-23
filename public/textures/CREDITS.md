# Texture credits

## Road concrete (public/textures/road/concrete-*.webp)
- **Concrete 034** by ambientCG (https://ambientcg.com/a/Concrete034), licence **CC0 1.0** (public domain, commercial use fine): https://creativecommons.org/publicdomain/zero/1.0/
- Source: https://ambientcg.com/get?file=Concrete034_1K-JPG.zip (1K JPG set).
- Changes: colour and roughness maps converted to greyscale WebP; normal map (OpenGL) converted to WebP. Tinted, cut per slab and worn in code (components/drive/street-roads.tsx).

## Town walls and zinc roofs (public/textures/town/)
- **Painted Plaster 017** (plaster.jpg) and **Corrugated Steel 005** (zinc.jpg) by ambientCG (https://ambientcg.com/a/PaintedPlaster017, https://ambientcg.com/a/CorrugatedSteel005), licence **CC0 1.0**: https://creativecommons.org/publicdomain/zero/1.0/
- Source: 1K JPG sets from https://ambientcg.com/get?file=<id>_1K-JPG.zip. Changes: colour map only, resized to 512 px, desaturated and brightness-levelled so the building's own paint colour tints it in code (components/drive/street-buildings.tsx).

## Sky (public/sky/sky-day|dusk|night.jpg)
- HDRIs by Poly Haven (https://polyhaven.com), licence **CC0 1.0**: **Kloofendal 48d Partly Cloudy (Pure Sky)** (day), **Qwantani Dusk 2 (Pure Sky)** (dusk), **Satara Night (No Lamps)** (night), by Greg Zaal and collaborators.
- Source: 1K HDR files from https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/. Changes: tone-mapped to 1024x512 JPG; drawn on the sky dome in components/travel/ride-environment.tsx.
