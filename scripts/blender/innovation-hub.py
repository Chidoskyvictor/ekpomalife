"""
Innovation Hub interior -> public/models/innovation-hub-raw.glb (then meshopt-compressed).
Headless:  blender -b --factory-startup -P scripts/blender/innovation-hub.py -- <out.glb>
The room build below is the user's cutaway office script, unchanged; after it, the outside
ground, lights and camera are dropped (the game has its own), the room is centred on the origin
and meshes are joined per material so ~150 floor planks become a handful of draw calls.
"""
import bpy, random, math, sys

random.seed(21)

# ================= SETTINGS =================
W, D, H = 12.0, 9.0, 3.4        # room width (x), depth (y), wall height
COLOURFUL_FLOOR = True          # False = natural wood tones only
COLOURED_PLANK_CHANCE = 0.30    # share of planks stained in colour
DESK_ROWS, DESK_COLS = 2, 3     # work desks
# ============================================

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Interior")
bpy.context.scene.collection.children.link(col)


def mat(name, color, rough=0.55, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
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


def cyl(name, center, radius, depth, m, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=(center[0], center[1], center[2] + depth / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


NATURAL = [(0.62, 0.38, 0.18), (0.70, 0.45, 0.22), (0.52, 0.31, 0.14), (0.76, 0.52, 0.28)]
STAINS = [(0.20, 0.55, 0.55), (0.85, 0.35, 0.30), (0.90, 0.70, 0.20),
          (0.35, 0.60, 0.35), (0.45, 0.40, 0.70), (0.90, 0.50, 0.65)]
wood_mats = [mat(f"WoodN{i}", c, 0.45) for i, c in enumerate(NATURAL)]
stain_mats = [mat(f"WoodC{i}", c, 0.45) for i, c in enumerate(STAINS)]

slab_m   = mat("Slab",     (0.35, 0.33, 0.30), 0.8)
wall_m   = mat("Wall",     (0.80, 0.80, 0.78), 0.9)
wall2_m  = mat("WallBack", (0.86, 0.86, 0.84), 0.9)
trim_m   = mat("Trim",     (0.95, 0.95, 0.93), 0.6)
accent_m = mat("Accent",   (0.20, 0.55, 0.60), 0.7)
sign_m   = mat("SignBoard", (0.04, 0.04, 0.05), 0.4)
tan_m    = mat("DeskTan",  (0.80, 0.65, 0.45), 0.55)
dark_m   = mat("BarDark",  (0.20, 0.12, 0.08), 0.5)
top_m    = mat("BarTop",   (0.88, 0.86, 0.80), 0.4)
metal_m  = mat("Metal",    (0.10, 0.10, 0.11), 0.35, 0.8)
ground_m = mat("Ground",   (0.62, 0.78, 0.58), 0.95)

DESK_COLOURS = [(0.85, 0.35, 0.30), (0.20, 0.55, 0.60), (0.90, 0.70, 0.20),
                (0.45, 0.40, 0.70), (0.35, 0.60, 0.35), (0.90, 0.50, 0.65)]
CHAIR_COLOURS = [(0.20, 0.35, 0.80), (0.85, 0.35, 0.50), (0.25, 0.65, 0.40),
                 (0.95, 0.60, 0.15), (0.50, 0.30, 0.75), (0.15, 0.60, 0.70)]

box("Ground", (-14, -14, -0.55), (W + 28, D + 28, 0.1), ground_m)
box("FloorSlab", (-0.2, -0.2, -0.45), (W + 0.2, D + 0.2, 0.45), slab_m)

plank_w = 0.26
n = int(W / plank_w)
for i in range(n):
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
box("WallBack", (-0.2, D, 0), (W + 0.2, 0.2, H), wall2_m)
box("BaseLeft", (0, 0, 0.05), (0.04, D, 0.14), trim_m)
box("BaseBack", (0, D - 0.04, 0.05), (W, 0.04, 0.14), trim_m)
box("StripeLeft", (0, 0, 1.15), (0.03, D, 0.12), accent_m)
box("StripeBack", (0, D - 0.03, 1.15), (W, 0.03, 0.12), accent_m)
box("CapLeft", (-0.2, -0.2, H), (0.25, D + 0.2, 0.08), trim_m)
box("CapBack", (-0.2, D - 0.05, H), (W + 0.2, 0.25, 0.08), trim_m)
box("SignBoard", (2.0, D - 0.06, 2.35), (3.2, 0.06, 0.55), sign_m)

rx, ry = 1.2, D - 1.0
box("ReceptionMain", (rx, ry, 0), (3.2, 0.8, 1.0), tan_m)
box("ReceptionTop",  (rx - 0.05, ry - 0.05, 1.0), (3.3, 0.9, 0.06), top_m)
box("ReceptionWing", (rx + 2.4, ry - 1.6, 0), (0.8, 1.6, 1.0), tan_m)
box("ReceptionWingTop", (rx + 2.35, ry - 1.65, 1.0), (0.9, 1.7, 0.06), top_m)

bx, by0 = 0.05, 0.9
box("BarBody", (bx, by0, 0), (0.7, 4.2, 1.0), dark_m)
box("BarTop",  (bx, by0 - 0.05, 1.0), (0.85, 4.3, 0.06), top_m)
box("BarShelf", (0.0, by0 + 0.2, 1.9), (0.3, 3.4, 0.05), dark_m)
stool_m = mat("StoolSeat", (0.08, 0.08, 0.10), 0.5)
for i in range(4):
    sy = by0 + 0.55 + i * 1.0
    cyl(f"StoolSeat{i}", (1.35, sy, 0.62), 0.19, 0.08, stool_m)
    cyl(f"StoolPole{i}", (1.35, sy, 0.0), 0.04, 0.62, metal_m, 12)
    cyl(f"StoolBase{i}", (1.35, sy, 0.0), 0.17, 0.03, metal_m)


def work_desk(idx, x, y, face_back=True):
    dm = mat(f"DeskTop{idx}", DESK_COLOURS[idx % len(DESK_COLOURS)], 0.5)
    cm = mat(f"Chair{idx}", CHAIR_COLOURS[idx % len(CHAIR_COLOURS)], 0.6)
    DW, DD = 1.5, 0.75
    box(f"Desk{idx}_Top", (x, y, 0.72), (DW, DD, 0.05), dm)
    for lx in (0.05, DW - 0.10):
        for ly in (0.05, DD - 0.10):
            box(f"Desk{idx}_Leg", (x + lx, y + ly, 0), (0.05, 0.05, 0.72), metal_m)
    box(f"Desk{idx}_Drawers", (x + DW - 0.5, y + 0.05, 0.2), (0.42, DD - 0.1, 0.52), dm)
    cx, cy = x + DW / 2 - 0.2, y - 0.55
    cyl(f"Chair{idx}_Base", (cx, cy, 0.03), 0.22, 0.03, metal_m, 5)
    cyl(f"Chair{idx}_Pole", (cx, cy, 0.05), 0.03, 0.40, metal_m, 10)
    box(f"Chair{idx}_Seat", (cx - 0.22, cy - 0.22, 0.45), (0.44, 0.44, 0.07), cm)
    box(f"Chair{idx}_Back", (cx - 0.22, cy - 0.27, 0.52), (0.44, 0.06, 0.45), cm)


idx = 0
start_x, start_y = 5.0, 2.2
for r in range(DESK_ROWS):
    for c in range(DESK_COLS):
        work_desk(idx, start_x + c * 2.2, start_y + r * 2.4)
        idx += 1

# ---------------- game export ----------------
# The outside lawn isn't part of the room (the game draws its own backdrop)
bpy.data.objects.remove(bpy.data.objects["Ground"], do_unlink=True)

# Centre the room on the origin (floor x -6..6, y -4.5..4.5)
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
