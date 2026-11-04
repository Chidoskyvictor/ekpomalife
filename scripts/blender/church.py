"""
Above the Hills Church interior (mirrored so the walls face the game camera) -> public/models/church.glb.
Headless:  blender -b --factory-startup -P scripts/blender/church.py -- <out.glb>
The room build below is the user's cutaway church script (scene lights / camera left out: the
game has its own); after it the outside ground is dropped, the room is centred on the origin,
meshes are joined per material and the room is mirrored left-right.
"""
import bpy, random, math, sys

random.seed(5)

# ================= SETTINGS =================
W, D, H = 14.0, 11.0, 4.2      # width (x), depth (y), wall height
PEW_ROWS = 6                   # rows of pews
PEW_GAP = 1.2                  # distance between rows
COLOURFUL_FLOOR = True
COLOURED_PLANK_CHANCE = 0.25
AISLE_W = 2.2                  # centre aisle width
# ============================================

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Church")
bpy.context.scene.collection.children.link(col)


def mat(name, color, rough=0.55, metal=0.0, emit=None, strength=0.0):
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


NATURAL = [(0.60, 0.37, 0.17), (0.68, 0.44, 0.21), (0.50, 0.30, 0.13), (0.74, 0.50, 0.26)]
STAINS = [(0.20, 0.55, 0.55), (0.80, 0.30, 0.28), (0.88, 0.68, 0.20),
          (0.35, 0.58, 0.35), (0.45, 0.38, 0.68)]
wood_mats = [mat(f"WoodN{i}", c, 0.45) for i, c in enumerate(NATURAL)]
stain_mats = [mat(f"WoodC{i}", c, 0.45) for i, c in enumerate(STAINS)]

slab_m    = mat("Slab",    (0.35, 0.33, 0.30), 0.8)
ground_m  = mat("Ground",  (0.62, 0.78, 0.58), 0.95)
wall_m    = mat("Wall",    (0.90, 0.87, 0.80), 0.9)
trim_m    = mat("Trim",    (0.97, 0.95, 0.90), 0.6)
accent_m  = mat("Accent",  (0.50, 0.10, 0.18), 0.7)
pew_m     = mat("Pew",     (0.30, 0.17, 0.09), 0.5)
cush_a    = mat("CushionA", (0.55, 0.12, 0.20), 0.8)
cush_b    = mat("CushionB", (0.15, 0.30, 0.60), 0.8)
carpet_m  = mat("Carpet",  (0.65, 0.08, 0.12), 0.9)
carpet2_m = mat("CarpetAltar", (0.40, 0.12, 0.55), 0.9)
gold_m    = mat("Gold",    (0.85, 0.65, 0.15), 0.3, 0.9, emit=(0.9, 0.7, 0.2), strength=0.4)
plat_m    = mat("Platform", (0.45, 0.28, 0.14), 0.5)
dark_m    = mat("Dark",    (0.08, 0.06, 0.05), 0.5)
screen_m  = mat("Screen",  (0.05, 0.10, 0.20), 0.2, emit=(0.15, 0.45, 0.9), strength=1.5)
metal_m   = mat("Metal",   (0.10, 0.10, 0.11), 0.35, 0.8)

STAINED = [(0.85, 0.15, 0.15), (0.15, 0.40, 0.85), (0.95, 0.75, 0.10),
           (0.15, 0.65, 0.35), (0.60, 0.20, 0.75), (0.95, 0.45, 0.10)]
stained_mats = [mat(f"Stained{i}", c, 0.2, emit=c, strength=2.5)
                for i, c in enumerate(STAINED)]

box("Ground", (-16, -16, -0.55), (W + 32, D + 32, 0.1), ground_m)
box("FloorSlab", (-0.2, -0.2, -0.45), (W + 0.2, D + 0.2, 0.45), slab_m)

plank_w = 0.28
for i in range(int(W / plank_w)):
    if COLOURFUL_FLOOR and random.random() < COLOURED_PLANK_CHANCE:
        m = random.choice(stain_mats)
    else:
        m = random.choice(wood_mats)
    y, k = 0.0, 0
    while y < D - 0.05:
        L = min(random.uniform(1.8, 3.6), D - y)
        box(f"Plank{i:02d}_{k}", (i * plank_w, y, 0), (plank_w - 0.01, L - 0.01, 0.05), m)
        y += L
        k += 1

box("WallLeft", (-0.2, -0.2, 0), (0.2, D + 0.2, H), wall_m)
box("WallBack", (-0.2, D, 0), (W + 0.2, 0.2, H), wall_m)
box("BaseLeft", (0, 0, 0.05), (0.05, D, 0.18), trim_m)
box("BaseBack", (0, D - 0.05, 0.05), (W, 0.05, 0.18), trim_m)
box("StripeLeft", (0, 0, 0.9), (0.03, D, 0.14), accent_m)
box("StripeBack", (0, D - 0.03, 0.9), (W, 0.03, 0.14), accent_m)
box("CapLeft", (-0.2, -0.2, H), (0.25, D + 0.2, 0.1), trim_m)
box("CapBack", (-0.2, D - 0.05, H), (W + 0.2, 0.25, 0.1), trim_m)

WIN_Y = [2.2, 5.4, 8.6]
for i, yc in enumerate([0.6, 3.8, 7.0, 10.2]):
    box(f"PilasterL{i}", (0, yc - 0.2, 0), (0.22, 0.4, H), trim_m)

for wi, yc in enumerate(WIN_Y):
    box(f"WinFrame{wi}", (0, yc - 0.85, 1.2), (0.06, 1.7, 2.5), dark_m)
    cols, rows = 4, 6
    cw, ch = 1.5 / cols, 2.3 / rows
    for cx in range(cols):
        for rz in range(rows):
            box(f"Pane{wi}_{cx}_{rz}",
                (0.05, yc - 0.75 + cx * cw + 0.01, 1.3 + rz * ch + 0.01),
                (0.03, cw - 0.03, ch - 0.03), random.choice(stained_mats))
    box(f"WinSill{wi}", (0, yc - 0.95, 1.12), (0.18, 1.9, 0.08), trim_m)

ax0 = W / 2 - AISLE_W / 2
box("AisleCarpet", (ax0, 0.2, 0.05), (AISLE_W, 8.4, 0.02), carpet_m)
box("AisleTrimL", (ax0 - 0.08, 0.2, 0.05), (0.08, 8.4, 0.025), gold_m)
box("AisleTrimR", (ax0 + AISLE_W, 0.2, 0.05), (0.08, 8.4, 0.025), gold_m)


def pew(name, x0, y0, length, cushion):
    box(f"{name}_Back", (x0, y0, 0.45), (length, 0.07, 0.55), pew_m)
    box(f"{name}_Seat", (x0, y0 + 0.07, 0.42), (length, 0.50, 0.06), pew_m)
    box(f"{name}_Cushion", (x0 + 0.1, y0 + 0.12, 0.48), (length - 0.2, 0.40, 0.05), cushion)
    for side, ex in (("A", x0 - 0.08), ("B", x0 + length)):
        box(f"{name}_End{side}", (ex, y0, 0), (0.08, 0.65, 0.98), pew_m)


pew_len = ax0 - 0.9 - 0.3
for r in range(PEW_ROWS):
    y0 = 1.3 + r * PEW_GAP
    cush = cush_a if r % 2 == 0 else cush_b
    pew(f"PewL{r}", 1.2, y0, pew_len, cush)
    pew(f"PewR{r}", ax0 + AISLE_W + 0.3, y0, pew_len, cush)

PY = 8.9
box("AltarStep2", (3.2, PY - 0.7, 0), (W - 6.4, 0.7, 0.18), plat_m)
box("AltarPlatform", (2.2, PY, 0), (W - 4.4, D - PY, 0.36), plat_m)
box("AltarCarpetStep", (W / 2 - 1.2, PY - 0.7, 0.18), (2.4, 0.7, 0.02), carpet2_m)
box("AltarCarpet", (W / 2 - 1.5, PY, 0.36), (3.0, D - PY - 0.1, 0.02), carpet2_m)
box("AisleToStep", (ax0, 8.55, 0.05), (AISLE_W, 0.3, 0.02), carpet_m)

cxm = W / 2
box("CrossV", (cxm - 0.12, D - 0.08, 1.7), (0.24, 0.08, 2.2), gold_m)
box("CrossH", (cxm - 0.6, D - 0.08, 2.9), (1.2, 0.08, 0.24), gold_m)

for sx in (2.4, W - 4.4):
    box(f"ScreenFrame{sx}", (sx - 0.08, D - 0.07, 1.62), (2.16, 0.07, 1.36), dark_m)
    box(f"Screen{sx}", (sx, D - 0.1, 1.7), (2.0, 0.05, 1.2), screen_m)

box("PulpitBase", (4.1, 9.7, 0.36), (1.0, 0.7, 1.0), pew_m)
box("PulpitTop", (3.98, 9.6, 1.36), (1.24, 0.9, 0.08), plat_m)
cyl("PulpitMic", (4.6, 9.9, 1.44), 0.015, 0.4, metal_m, 8)

box("TableTop", (W / 2 - 0.9, 9.9, 0.9), (1.8, 0.7, 0.07), trim_m)
for lx in (-0.8, 0.7):
    box(f"TableLeg{lx}", (W / 2 + lx, 10.0, 0.36), (0.1, 0.5, 0.55), pew_m)

for t in range(3):
    box(f"Choir{t}", (8.6, 9.2 + t * 0.6, 0.36), (3.6, 0.6, 0.3 + t * 0.3), plat_m)
    box(f"ChoirTrim{t}", (8.6, 9.2 + t * 0.6, 0.36 + 0.3 + t * 0.3),
        (3.6, 0.6, 0.03), carpet2_m)

for sx in (2.7, W - 2.7):
    cyl(f"CandleStand{sx}", (sx, 9.2, 0.36), 0.05, 0.9, gold_m, 10)
    cyl(f"CandleFlame{sx}", (sx, 9.2, 1.26), 0.05, 0.12,
        mat(f"Flame{sx}", (1, 0.7, 0.2), emit=(1, 0.7, 0.2), strength=8), 8)

# ---------------- game export ----------------
# The outside lawn isn't part of the room (the game draws its own backdrop)
bpy.data.objects.remove(bpy.data.objects["Ground"], do_unlink=True)

# Centre the room on the origin (floor x -7..7, y -5.5..5.5)
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
