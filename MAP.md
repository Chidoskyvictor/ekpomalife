# Ekpoma Life map

The map is three matching AAU slabs on water. Players pan, rotate, and zoom it, and tap Admin Block.

## Files

| File | Role |
|---|---|
| `components/world/world-canvas.tsx` | Perspective camera, lights, water background |
| `components/world/world-ground.tsx` | Water plane, rounded campus slabs, and roads |
| `components/world/world-roads.tsx` | Black asphalt + white dashes in slab gaps |
| `components/world/world-landmarks.tsx` | Clickable places (Admin Block only) |
| `components/world/admin-block.tsx` | Admin Block GLB (`public/models/admin-block.glb`) |
| `lib/game/map-theme.ts` | Shared colour palette |
| `lib/game/world-layout.ts` | Slab size, camera bounds |
| `lib/game/content.ts` | Landmark names, positions, sizes, actions |

X is east–west. Z is north–south. Y is up. Positions in `content.ts` are `[x, z]`.

## Camera

Perspective, isometric-inspired. Pitch 35–60° (default 48°) from vertical. Default heading is 0°. Rotate is on. Distance 28–88.

## Palette

| Token | Colour | Use |
|---|---|---|
| `land` | `#9BB682` | Campus slab |
| `water` | `#F4EFE3` | World floor |
| `building` | `#F0EEE5` | Walls |
| `roof` | `#D6C5A0` | Roofs and accents |

Roads sit in the slab gaps. No town. No river.

## Land

Four raised rounded slabs on the water, 1.54 units apart. Height is 0.42. The front school pad is two campus pads wide and two deep. `WorldRoads` fills those gaps with black asphalt and white lane dashes. `public/models/realistic_road.glb` is the compressed road asset kept with the other models.

| Name | Centre (x, z) | Size (w × d × h) |
|---|---|---|
| `campus` | −10, −18 | 36 × 26 × 0.42 |
| `front` | −10, 9.54 | 36 × 26 × 0.42 |
| `left` | −47.54, −4.23 | 36 × 53.54 × 0.42 |
| `school` | −28.77, 50.08 | 73.54 × 52 × 0.42 |

## Landmarks

Only Admin Block is on the map. Other places stay in `content.ts` for game data.

| Id | Name | Position (x, z) |
|---|---|---|
| `aau_campus` | Admin Block | −9, 9.54 |
