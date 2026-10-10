# Ekpoma Life map

The map is three matching AAU slabs on water. Players pan, rotate, and zoom it, and tap Admin Block.

## Files

| File | Role |
|---|---|
| `components/world/world-canvas.tsx` | Perspective camera, lights, water background |
| `components/world/world-ground.tsx` | Water plane and rounded campus slab |
| `components/world/world-landmarks.tsx` | Clickable places (Admin Block only) |
| `components/world/admin-block.tsx` | Admin Block GLB (`public/models/admin-block.glb`) |
| `lib/game/map-theme.ts` | Shared colour palette |
| `lib/game/world-layout.ts` | Slab size, camera bounds |
| `lib/game/content.ts` | Landmark names, positions, sizes, actions |

X is east–west. Z is north–south. Y is up. Positions in `content.ts` are `[x, z]`.

## Camera

Perspective, isometric-inspired. Pitch 35–60° (default 48°) from vertical. Default heading is 0°. Rotate is on. Distance 32–100.

## Palette

| Token | Colour | Use |
|---|---|---|
| `land` | `#9CB784` | Campus slab |
| `water` | `#6EC8EE` | World floor |
| `building` | `#F0EEE5` | Walls |
| `roof` | `#D6C5A0` | Roofs and accents |

No roads. No town. No river.

## Land

Four raised rounded slabs on the water, 5 units apart. Height is 0.42. The front school pad is two campus pads wide and two deep.

| Name | Centre (x, z) | Size (w × d × h) |
|---|---|---|
| `campus` | −10, −18 | 36 × 26 × 0.42 |
| `front` | −10, 13 | 36 × 26 × 0.42 |
| `left` | −51, −2.5 | 36 × 57 × 0.42 |
| `school` | −30.5, 57 | 77 × 52 × 0.42 |

## Landmarks

Only Admin Block is on the map. Other places stay in `content.ts` for game data.

| Id | Name | Position (x, z) |
|---|---|---|
| `aau_campus` | Admin Block | −10, −18 |
