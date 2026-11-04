"""
Spot Rite interior (cosy cafe; mirrored so the walls face the game camera) -> public/models/spot-rite.glb.
Headless:  blender -b --factory-startup -P scripts/blender/spot-rite.py -- <out.glb>
The room build below is the user's cosy cafe script (scene lights / camera left out: the game
has its own); after it the outside ground is dropped, the room is centred on the origin, meshes
are joined per material and the room is mirrored left-right.
"""
import bpy, random, math, sys

random.seed(33)

# ================= SETTINGS =================
W, D, H = 12.0, 10.0, 3.6
COLOURFUL_FLOOR = True
STAIN_CHANCE = 0.20
# ============================================

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Cafe")
bpy.context.scene.collection.children.link(col)


def mat(name, color, rough=0.55, metal=0.0, emit=None, strength=0.0, alpha=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs:
                b.inputs[k].default_value = (*emit, 1)
                break
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = strength
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
    return m


def link(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    return o


def box(name, loc, size, m):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.location = (loc[0] + size[0] / 2, loc[1] + size[1] / 2, loc[2] + size[2] / 2)
    o.data.materials.append(m)
    return link(o)


def cyl(name, center, radius, depth, m, verts=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=(center[0], center[1], center[2] + depth / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


def sphere(name, center, radius, m, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=16, ring_count=10,
                                         location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = (1, 1, squash)
    o.data.materials.append(m)
    return link(o)


WOODS = [(0.45, 0.28, 0.14), (0.55, 0.35, 0.18), (0.38, 0.22, 0.11), (0.62, 0.40, 0.20)]
STAINS = [(0.25, 0.55, 0.55), (0.85, 0.75, 0.55), (0.75, 0.40, 0.30), (0.85, 0.65, 0.20)]
wood_mats = [mat(f"WoodN{i}", c, 0.45) for i, c in enumerate(WOODS)]
stain_mats = [mat(f"WoodC{i}", c, 0.45) for i, c in enumerate(STAINS)]

slab_m   = mat("Slab",    (0.35, 0.32, 0.28), 0.8)
ground_m = mat("Ground",  (0.62, 0.78, 0.58), 0.95)
cream_m  = mat("Cream",   (0.95, 0.90, 0.80), 0.9)
teal_m   = mat("Teal",    (0.10, 0.45, 0.48), 0.7)
trim_m   = mat("Trim",    (0.98, 0.96, 0.90), 0.6)
topwood  = mat("TableWood", (0.75, 0.55, 0.32), 0.45)
darkwood = mat("DarkWood", (0.25, 0.14, 0.07), 0.5)
metal_m  = mat("Metal",   (0.10, 0.10, 0.11), 0.35, 0.8)
steel_m  = mat("Steel",   (0.70, 0.72, 0.75), 0.25, 0.9)
board_m  = mat("Board",   (0.06, 0.16, 0.12), 0.8)
chalk_m  = mat("Chalk",   (0.92, 0.92, 0.85), 0.9)
rug_m    = mat("Rug",     (0.93, 0.86, 0.72), 0.95)
pot_m    = mat("Pot",     (0.65, 0.33, 0.20), 0.8)
soil_m   = mat("Soil",    (0.10, 0.06, 0.04), 0.9)
leaf_m   = [mat("Leaf1", (0.15, 0.50, 0.20), 0.7), mat("Leaf2", (0.25, 0.60, 0.25), 0.7)]
glass_m  = mat("GlassCase", (0.75, 0.90, 0.95), 0.05, alpha=0.30)
lamp_m   = mat("Lamp", (1.0, 0.85, 0.55), 0.4, emit=(1.0, 0.8, 0.45), strength=8)
win_m    = mat("WindowGlow", (0.75, 0.88, 1.0), 0.2, emit=(0.75, 0.88, 1.0), strength=1.4)

CHAIR_COLS = [(0.10, 0.45, 0.48), (0.90, 0.65, 0.15), (0.85, 0.40, 0.32),
              (0.92, 0.85, 0.70), (0.45, 0.62, 0.45)]
chair_mats = [mat(f"Chair{i}", c, 0.6) for i, c in enumerate(CHAIR_COLS)]
CUSH_COLS = [(0.85, 0.40, 0.32), (0.90, 0.65, 0.15), (0.92, 0.85, 0.70),
             (0.30, 0.55, 0.55), (0.60, 0.30, 0.45)]
cush_mats = [mat(f"Cush{i}", c, 0.8) for i, c in enumerate(CUSH_COLS)]
seat_m = mat("BanquetteSeat", (0.12, 0.38, 0.42), 0.75)

box("Ground", (-16, -16, -0.55), (W + 32, D + 32, 0.1), ground_m)
box("FloorSlab", (-0.2, -0.2, -0.45), (W + 0.2, D + 0.2, 0.45), slab_m)

plank_w = 0.28
for i in range(int(W / plank_w)):
    if COLOURFUL_FLOOR and random.random() < STAIN_CHANCE:
        m = random.choice(stain_mats)
    else:
        m = random.choice(wood_mats)
    y, k = 0.0, 0
    while y < D - 0.05:
        L = min(random.uniform(1.8, 3.6), D - y)
        box(f"Plank{i:02d}_{k}", (i * plank_w, y, 0), (plank_w - 0.01, L - 0.01, 0.05), m)
        y += L
        k += 1

box("WallLeft", (-0.2, -0.2, 0), (0.2, D + 0.2, H), cream_m)
box("WallBack", (-0.2, D, 0), (W + 0.2, 0.2, H), cream_m)
box("WainscotLeft", (0, 0, 0.05), (0.05, D, 1.05), teal_m)
box("WainscotBack", (0, D - 0.05, 0.05), (W, 0.05, 1.05), teal_m)
box("RailLeft", (0, 0, 1.1), (0.08, D, 0.06), trim_m)
box("RailBack", (0, D - 0.08, 1.1), (W, 0.08, 0.06), trim_m)
box("CapLeft", (-0.2, -0.2, H), (0.25, D + 0.2, 0.1), trim_m)
box("CapBack", (-0.2, D - 0.05, H), (W + 0.2, 0.25, 0.1), trim_m)

wy0, wy1 = 7.2, 9.4
box("WinGlow", (0.0, wy0 + 0.1, 1.3), (0.04, wy1 - wy0 - 0.2, 1.5), win_m)
box("WinSill", (0, wy0 - 0.05, 1.18), (0.22, wy1 - wy0 + 0.1, 0.07), darkwood)
box("WinTop", (0, wy0 - 0.05, 2.8), (0.12, wy1 - wy0 + 0.1, 0.08), darkwood)
for yy in (wy0 - 0.05, wy1 - 0.03):
    box(f"WinSide{yy}", (0, yy, 1.18), (0.12, 0.08, 1.7), darkwood)
box("WinMullionV", (0, (wy0 + wy1) / 2 - 0.03, 1.3), (0.1, 0.06, 1.5), darkwood)
box("WinMullionH", (0, wy0 + 0.1, 2.0), (0.1, wy1 - wy0 - 0.2, 0.06), darkwood)

cx0, cw = 3.4, 6.2
cy = D - 1.5
box("CounterBody", (cx0, cy, 0.05), (cw, 0.9, 1.0), teal_m)
box("CounterTop", (cx0 - 0.1, cy - 0.12, 1.05), (cw + 0.2, 1.1, 0.06), topwood)
box("CounterKick", (cx0, cy - 0.02, 0.05), (cw, 0.04, 0.12), darkwood)
for i in range(8):
    box(f"CounterStripe{i}", (cx0 + 0.3 + i * 0.75, cy - 0.01, 0.35), (0.35, 0.02, 0.55), trim_m)

box("EspressoBody", (4.0, D - 1.2, 1.11), (0.9, 0.55, 0.45), steel_m)
box("EspressoTop", (3.95, D - 1.25, 1.56), (1.0, 0.65, 0.08), metal_m)
for gx in (4.25, 4.65):
    box(f"Group{gx}", (gx, D - 1.55, 1.2), (0.1, 0.12, 0.12), metal_m)
cyl("Grinder", (5.4, D - 0.95, 1.11), 0.13, 0.4, metal_m, 12)
cyl("GrinderHopper", (5.4, D - 0.95, 1.51), 0.16, 0.2, glass_m, 12)
box("CakeBase", (7.2, D - 1.3, 1.11), (1.3, 0.7, 0.05), trim_m)
box("CakeCase", (7.2, D - 1.3, 1.16), (1.3, 0.7, 0.4), glass_m)
for i in range(4):
    cm = random.choice(cush_mats)
    cyl(f"Cake{i}", (7.45 + i * 0.25 - 0.2, D - 0.95, 1.16), 0.09, 0.18, cm, 12)
for i, mx in enumerate((6.3, 6.5, 8.9)):
    cyl(f"CounterMug{i}", (mx, D - 1.0, 1.11), 0.06, 0.1, random.choice(chair_mats), 12)

for i in range(4):
    sx = 4.2 + i * 1.3
    cyl(f"StoolSeat{i}", (sx, D - 2.3, 0.62), 0.2, 0.08, chair_mats[i % len(chair_mats)])
    cyl(f"StoolPole{i}", (sx, D - 2.3, 0.0), 0.035, 0.62, metal_m, 10)
    cyl(f"StoolBase{i}", (sx, D - 2.3, 0.0), 0.18, 0.03, metal_m)
    box(f"StoolRing{i}", (sx - 0.15, D - 2.3 - 0.15, 0.28), (0.3, 0.3, 0.02), metal_m)

for si, sz in enumerate((1.75, 2.3)):
    box(f"Shelf{si}", (3.3, D - 0.32, sz), (6.4, 0.3, 0.05), darkwood)
    x = 3.6
    while x < 9.4:
        r = random.random()
        if r < 0.4:
            cyl(f"Jar{si}_{x:.1f}", (x, D - 0.18, sz + 0.05), 0.07, 0.2,
                random.choice(cush_mats), 12)
        elif r < 0.75:
            cyl(f"Mug{si}_{x:.1f}", (x, D - 0.18, sz + 0.05), 0.06, 0.1,
                random.choice(chair_mats), 12)
        else:
            cyl(f"MiniPot{si}_{x:.1f}", (x, D - 0.18, sz + 0.05), 0.07, 0.1, pot_m, 12)
            sphere(f"MiniLeaf{si}_{x:.1f}", (x, D - 0.18, sz + 0.2), 0.1, leaf_m[0])
        x += random.uniform(0.4, 0.7)

box("MenuBoardFrame", (4.0, D - 0.08, 2.58), (4.2, 0.06, 0.9), darkwood)
box("MenuBoard", (4.08, D - 0.12, 2.64), (4.04, 0.05, 0.78), board_m)
for li in range(5):
    box(f"MenuLine{li}", (4.35, D - 0.15, 3.28 - li * 0.14),
        (random.uniform(1.4, 3.2), 0.02, 0.04), chalk_m)

by0, by1 = 0.8, 6.6
box("BanquetteBase", (0.05, by0, 0.05), (0.7, by1 - by0, 0.4), seat_m)
box("BanquetteBack", (0.05, by0, 0.45), (0.15, by1 - by0, 0.65), seat_m)
y = by0 + 0.3
i = 0
while y < by1 - 0.4:
    box(f"BCushion{i}", (0.22, y, 0.5), (0.45, 0.5, 0.35), cush_mats[i % len(cush_mats)])
    y += 0.9
    i += 1


def table(name, tx, ty):
    cyl(f"{name}_Top", (tx, ty, 0.72), 0.45, 0.05, topwood, 28)
    cyl(f"{name}_Pole", (tx, ty, 0.03), 0.04, 0.70, metal_m, 10)
    cyl(f"{name}_Base", (tx, ty, 0.0), 0.26, 0.03, metal_m, 20)


def chair(name, cx, cy, face, m):
    box(f"{name}_Seat", (cx - 0.2, cy - 0.2, 0.45), (0.4, 0.4, 0.05), m)
    backs = {'+x': ((cx - 0.22, cy - 0.2, 0.5), (0.04, 0.4, 0.42)),
             '-x': ((cx + 0.18, cy - 0.2, 0.5), (0.04, 0.4, 0.42)),
             '+y': ((cx - 0.2, cy - 0.22, 0.5), (0.4, 0.04, 0.42)),
             '-y': ((cx - 0.2, cy + 0.18, 0.5), (0.4, 0.04, 0.42))}
    loc, size = backs[face]
    box(f"{name}_Back", loc, size, m)
    for dx in (-0.18, 0.14):
        for dy in (-0.18, 0.14):
            box(f"{name}_Leg", (cx + dx, cy + dy, 0), (0.04, 0.04, 0.45), metal_m)


def plant(name, x, y, s=1.0):
    cyl(f"{name}_Pot", (x, y, 0.0), 0.25 * s, 0.4 * s, pot_m, 14)
    cyl(f"{name}_Soil", (x, y, 0.4 * s), 0.22 * s, 0.02, soil_m, 14)
    for k, (dx, dy, dz, r) in enumerate(((0, 0, 0.75, 0.30), (0.12, 0.08, 0.95, 0.24),
                                         (-0.12, -0.06, 1.05, 0.22), (0.05, -0.1, 0.6, 0.26))):
        sphere(f"{name}_Leaf{k}", (x + dx * s, y + dy * s, dz * s), r * s,
               leaf_m[k % 2], 1.2)


rx0, ry0, rw, rd = 4.3, 0.9, 6.0, 5.2
box("RugBorder", (rx0 - 0.1, ry0 - 0.1, 0.05), (rw + 0.2, rd + 0.2, 0.012), teal_m)
box("Rug", (rx0, ry0, 0.062), (rw, rd, 0.012), rug_m)

for ti, ty in enumerate((1.9, 3.7, 5.5)):
    table(f"BT{ti}", 1.9, ty)
    chair(f"BT{ti}_C", 2.75, ty, '-x', chair_mats[ti % len(chair_mats)])

main = [(5.7, 2.0), (8.7, 2.0), (5.7, 4.8), (8.7, 4.8)]
n = 0
for ti, (tx, ty) in enumerate(main):
    table(f"T{ti}", tx, ty)
    chair(f"T{ti}_A", tx - 0.8, ty, '+x', chair_mats[n % 5]); n += 1
    chair(f"T{ti}_B", tx + 0.8, ty, '-x', chair_mats[n % 5]); n += 1
    if ti % 2 == 0:
        chair(f"T{ti}_C", tx, ty - 0.8, '+y', chair_mats[n % 5]); n += 1
    else:
        chair(f"T{ti}_C", tx, ty + 0.8, '-y', chair_mats[n % 5]); n += 1

table("TS", 11.0, 6.2)
chair("TS_A", 11.0, 5.4, '+y', chair_mats[1])
chair("TS_B", 11.0, 7.0, '-y', chair_mats[2])

plant("PlantA", 0.75, 9.2, 1.1)
plant("PlantB", 11.2, 9.0, 1.3)
plant("PlantC", 11.2, 0.7, 1.0)
plant("PlantD", 2.6, 7.2, 0.8)

for pi, (px, py) in enumerate(main + [(1.9, 3.7)]):
    cyl(f"Cord{pi}", (px, py, 2.45), 0.012, H - 2.45, metal_m, 6)
    cyl(f"Shade{pi}", (px, py, 2.25), 0.26, 0.2, lamp_m, 16)

# ---------------- game export ----------------
# The outside lawn isn't part of the room (the game draws its own backdrop)
bpy.data.objects.remove(bpy.data.objects["Ground"], do_unlink=True)

# Centre the room on the origin (floor x -6..6, y -5..5)
for o in col.objects:
    o.location.x -= W / 2
    o.location.y -= D / 2

# Bake transforms, then join everything that shares a material (one draw call per material)
bpy.ops.object.select_all(action='DESELECT')
for o in col.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = col.objects[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

groups = {}
for o in list(col.objects):
    if o.type == 'MESH' and o.data.materials:
        groups.setdefault(o.data.materials[0].name, []).append(o)
for name, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = name

# Mirror left-right so the walls are on +x and −z, where the game's room camera expects them
# (it looks in from the front-left). Flip the faces too so they still face outwards.
for o in col.objects:
    if o.type == 'MESH':
        for v in o.data.vertices:
            v.co.x = -v.co.x
        o.data.flip_normals()
        o.data.update()

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False)
print("EXPORTED", out, len(col.objects), "objects")
