# Ekpoma Life map

The map is an orthographic 3D scene of Ekpoma. Players pan and zoom it, tap landmarks, and travel between them.

## Files

| File | Role |
|---|---|
| `components/world/world-canvas.tsx` | Canvas, camera, lights, background colour |
| `components/world/world-ground.tsx` | Ground stack, islands, roads, bridges, rocks, painted labels |
| `components/world/world-landmarks.tsx` | Clickable places and their 3D models |
| `components/world/world-town.tsx` | Houses, trees, and land rocks |
| `components/world/admin-block.tsx` | Admin Block GLB (`public/models/admin-block.glb`) |
| `lib/game/world-layout.ts` | Island, road, zone, and channel rectangles |
| `lib/game/content.ts` | Landmark names, positions, sizes, actions |

X is east–west. Z is north–south. Y is up. Positions in `content.ts` are `[x, z]`.

## Camera

Bird’s-eye isometric, same idea as Lagos Life. Offset from `LAND_CENTER` (`−10, 12`) is `(38, 46, 38)` — high, looking down from a corner. No rotate. Zoom 7.5–40.

## Ground layers

| Layer | Code name | Colour | What it is |
|---|---|---|---|
| Lower ground | `GROUND` / `Lowland` | `#B2BEB5` | Grey world floor (their lagoon is blue; ours is grey). |
| Mainland | `GRASS` | `#9fdc76` | Big green pad. AAU + town sit here. |
| Medicine / front | `DARK_GRASS` | `#6faf4e` | Slightly darker grass. |
| Campus / med grass | `ZONE_GRASS` | `#b4e690` | Lighter patches inside the fences. |
| Roads | `Road` | `#4a5260` | Asphalt with white dashes. |
| Bridges | `BridgeSpan` | `#e7ecf2` | Where a road crosses grey lower ground. |
| Rocks | `RockField` | grey stones | On the lower ground and some empty lots. |

`WATER_LEVEL` (`-0.35`) is the height of the grey floor.

## Islands

Three pads only. Grey lower ground shows around and between them — not a box in every corner.

| Name | Centre (x, z) | Size (w × d) | Notes |
|---|---|---|---|
| `mainland` | −4, 0 | 92 × 78 | Ambrose Alli + town |
| `medicine` | −66, −12 | 30 × 38 | Left of AAU, darker. College of Medicine |
| `front` | 2, 56 | 64 × 26 | Smaller island toward the camera, empty for later buildings |

Fenced precincts:

- `CAMPUS_ZONE` — white fence, blue gate, label **AMBROSE ALLI UNIVERSITY**
- `MED_ZONE` — left of campus, not inside AAU

Road label: **EKPOMA–IRUEKPEN RD**.

## Landmarks

| Id | Name | Position (x, z) |
|---|---|---|
| `aau_campus` | Admin Block | −10, −18 |
| `aau_library` | AAU Library | 2, −14 |
| `mbc` | MBC | −22, −10 |
| `sports_complex` | Sports Complex | −20, −26 |
| `college_of_medicine` | College of Medicine | −66, −12 |
| `campus_shop` | Campus Shop | 8, −6 |
| `keke_park` | Keke Park | 20, 10 |
| `roadside_bukka` | Mama Amina Bukka | −8, 10 |
| `viewing_centre` | Viewing Centre | −22, 10 |
| `ekpoma_market` | Ekpoma Market | 4, 16 |
| `innovation_hub` | Innovation Hub | 22, 18 |
| `church` | Chapel of Grace | 28, 10 |
| `mosque` | Central Mosque | −34, 12 |
| `igbinedion_hostel` | Igbinedion Hostel | −24, 28 |
| `maryvale_hostel` | Maryvale Hostel | 6, 30 |

## How to add a place

1. Put it on `mainland` or the empty `front` island. Add a new `LANDS` pad only if it needs its own grass.
2. Add a `LOCATIONS` entry in `content.ts`.
3. Optionally add a custom model in `world-landmarks.tsx`.
