"""
Mama Amina Bukka interior (Naija buka / mama put; mirrored so the walls face the game camera)
-> public/models/bukka.glb.
Headless:  blender -b --factory-startup -P scripts/blender/bukka.py -- <out.glb>
The room build below is the user's buka script (scene lights / camera left out: the game has its
own); after it the outside ground is dropped, the room is centred on the origin, meshes are joined
per material and the room is mirrored left-right.
"""
import bpy, random, math, sys

random.seed(14)

# ================= SETTINGS =================
W, D, H = 13.0, 10.0, 3.4
COLOURFUL_FLOOR = False  # plain brown floor (one wood colour)
STAIN_CHANCE = 0.35
# ============================================

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Buka")
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


def box(name, loc, size, m, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.location = (loc[0] + size[0] / 2, loc[1] + size[1] / 2, loc[2] + size[2] / 2)
    if rot:
        o.rotation_euler = rot
    o.data.materials.append(m)
    return link(o)


def cyl(name, center, radius, depth, m, verts=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=(center[0], center[1], center[2] + depth / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


def cyl_x(name, center, radius, depth, m, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=center, rotation=(0, math.radians(90), 0))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


def sphere(name, center, radius, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=14, ring_count=8,
                                         location=center)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


WOODS = [(0.55, 0.33, 0.15), (0.65, 0.40, 0.19), (0.45, 0.27, 0.12), (0.72, 0.48, 0.24)]
STAINS = [(0.90, 0.72, 0.12), (0.15, 0.55, 0.25), (0.80, 0.18, 0.14), (0.15, 0.40, 0.75)]
wood_mats = [mat(f"WoodN{i}", c, 0.45) for i, c in enumerate(WOODS)]
stain_mats = [mat(f"WoodC{i}", c, 0.45) for i, c in enumerate(STAINS)]

slab_m   = mat("Slab",    (0.35, 0.32, 0.28), 0.8)
ground_m = mat("Ground",  (0.62, 0.78, 0.58), 0.95)
green_m  = mat("WallGreen",  (0.15, 0.55, 0.25), 0.85)
yellow_m = mat("WallYellow", (0.95, 0.78, 0.15), 0.85)
red_m    = mat("Red",     (0.80, 0.15, 0.12), 0.6)
white_m  = mat("White",   (0.96, 0.96, 0.94), 0.5)
trim_m   = mat("Trim",    (0.98, 0.96, 0.90), 0.6)
wood_m   = mat("Wood",    (0.55, 0.35, 0.18), 0.5)
dark_m   = mat("Dark",    (0.10, 0.08, 0.07), 0.5)
metal_m  = mat("Metal",   (0.10, 0.10, 0.11), 0.35, 0.8)
alu_m    = mat("Aluminium", (0.75, 0.76, 0.78), 0.3, 0.9)
board_m  = mat("Board",   (0.35, 0.08, 0.08), 0.8)
chalk_m  = mat("Chalk",   (0.96, 0.92, 0.80), 0.9)
gold_m   = mat("Gold",    (0.95, 0.75, 0.15), 0.5)
glass_m  = mat("Glass",   (0.75, 0.90, 0.95), 0.05, alpha=0.28)
fridge_m = mat("Fridge",  (0.85, 0.12, 0.10), 0.35)
bulb_m   = mat("Bulb",    (1.0, 0.85, 0.5), 0.3, emit=(1.0, 0.8, 0.4), strength=8)
bucket_m = mat("Bucket",  (0.15, 0.40, 0.80), 0.5)
pot_cols = [(0.80, 0.15, 0.12), (0.15, 0.50, 0.25), (0.15, 0.40, 0.75), (0.95, 0.70, 0.10)]
pot_mats = [mat(f"Pot{i}", c, 0.35, 0.2) for i, c in enumerate(pot_cols)]

PLASTIC = [(0.85, 0.15, 0.12), (0.15, 0.40, 0.80), (0.95, 0.75, 0.10),
           (0.15, 0.60, 0.28), (0.96, 0.96, 0.94), (0.95, 0.45, 0.10)]
chair_mats = [mat(f"Chair{i}", c, 0.4) for i, c in enumerate(PLASTIC)]
top_mats = [mat("TopWhite", (0.96, 0.96, 0.94), 0.35),
            mat("TopRed",   (0.80, 0.15, 0.12), 0.35),
            mat("TopYellow", (0.95, 0.75, 0.10), 0.35)]

box("Ground", (-16, -16, -0.55), (W + 32, D + 32, 0.1), ground_m)
box("FloorSlab", (-0.2, -0.2, -0.45), (W + 0.2, D + 0.2, 0.45), slab_m)

plank_w = 0.30
for i in range(int(W / plank_w)):
    if COLOURFUL_FLOOR and random.random() < STAIN_CHANCE:
        m = random.choice(stain_mats)
    else:
        m = wood_mats[0]  # one brown for every plank
    y, k = 0.0, 0
    while y < D - 0.05:
        L = min(random.uniform(1.8, 3.6), D - y)
        box(f"Plank{i:02d}_{k}", (i * plank_w, y, 0), (plank_w - 0.012, L - 0.012, 0.05), m)
        y += L
        k += 1

box("WallLeft", (-0.2, -0.2, 0), (0.2, D + 0.2, H), green_m)
box("WallBack", (-0.2, D, 0), (W + 0.2, 0.2, H), yellow_m)
for nm, loc, size in (("StripeLeft", (0, 0, 0.95), (0.04, D, 0.22)),
                      ("StripeBack", (0, D - 0.04, 0.95), (W, 0.04, 0.22))):
    box(nm, loc, size, red_m)
box("LineLeft", (0, 0, 1.2), (0.05, D, 0.04), trim_m)
box("LineBack", (0, D - 0.05, 1.2), (W, 0.05, 0.04), trim_m)
box("BaseLeft", (0, 0, 0.05), (0.05, D, 0.15), dark_m)
box("BaseBack", (0, D - 0.05, 0.05), (W, 0.05, 0.15), dark_m)
box("CapLeft", (-0.2, -0.2, H), (0.25, D + 0.2, 0.1), trim_m)
box("CapBack", (-0.2, D - 0.05, H), (W + 0.2, 0.25, 0.1), trim_m)

cx0, cw = 3.0, 7.0
cy = D - 1.6
box("CounterBody", (cx0, cy, 0.05), (cw, 0.9, 1.0), red_m)
for i in range(14):
    box(f"CTile{i}", (cx0 + 0.15 + i * 0.5, cy - 0.01, 0.2), (0.3, 0.02, 0.7),
        gold_m if i % 2 == 0 else white_m)
box("CounterTop", (cx0 - 0.1, cy - 0.12, 1.05), (cw + 0.2, 1.1, 0.06), alu_m)

for i, px in enumerate((3.9, 5.3, 6.7, 8.1)):
    cyl(f"Pot{i}", (px, D - 1.15, 1.11), 0.36, 0.4, pot_mats[i], 24)
    cyl(f"PotLid{i}", (px, D - 1.15, 1.51), 0.38, 0.04, alu_m, 24)
    sphere(f"PotKnob{i}", (px, D - 1.15, 1.58), 0.05, dark_m)
    box(f"PotHandleL{i}", (px - 0.46, D - 1.2, 1.35), (0.1, 0.1, 0.04), dark_m)
    box(f"PotHandleR{i}", (px + 0.36, D - 1.2, 1.35), (0.1, 0.1, 0.04), dark_m)
for k in range(6):
    cyl(f"Plate{k}", (9.2, D - 1.0, 1.11 + k * 0.03), 0.22, 0.025,
        white_m if k % 2 == 0 else chair_mats[k % 6], 20)
cyl("Ladle0", (3.2, D - 0.7, 1.11), 0.04, 0.35, metal_m, 8)

box("Shelf", (3.0, D - 0.32, 1.7), (7.0, 0.3, 0.05), wood_m)
x = 3.2
while x < 9.8:
    r = random.random()
    if r < 0.45:
        cyl(f"Bowl_{x:.1f}", (x, D - 0.18, 1.75), 0.14, 0.1, random.choice(chair_mats), 16)
    elif r < 0.8:
        cyl(f"Jar_{x:.1f}", (x, D - 0.18, 1.75), 0.07, 0.22, random.choice(pot_mats), 12)
    else:
        box(f"Crate_{x:.1f}", (x - 0.15, D - 0.3, 1.75), (0.3, 0.26, 0.2), wood_m)
    x += random.uniform(0.45, 0.8)

box("BoardFrame", (3.4, D - 0.08, 2.15), (6.2, 0.06, 1.1), dark_m)
box("Board", (3.5, D - 0.12, 2.22), (6.0, 0.05, 0.96), board_m)
for li in range(5):
    ly = 3.05 - li * 0.17
    box(f"MenuName{li}", (3.8, D - 0.15, ly), (random.uniform(1.6, 3.0), 0.02, 0.05),
        chalk_m)
    box(f"MenuPrice{li}", (8.0, D - 0.15, ly), (random.uniform(0.5, 0.9), 0.02, 0.05),
        gold_m)

fx = 10.3
box("FridgeBody", (fx, D - 0.95, 0.0), (1.0, 0.85, 2.0), fridge_m)
box("FridgeGlass", (fx + 0.07, D - 1.0, 0.15), (0.86, 0.05, 1.7), glass_m)
box("FridgeTopSign", (fx + 0.07, D - 1.0, 1.9), (0.86, 0.04, 0.08), bulb_m)
for rz in range(3):
    box(f"FridgeShelf{rz}", (fx + 0.08, D - 0.9, 0.35 + rz * 0.55), (0.84, 0.6, 0.02), white_m)
    for bx in range(4):
        cyl(f"Bottle{rz}_{bx}", (fx + 0.22 + bx * 0.2, D - 0.6, 0.37 + rz * 0.55),
            0.045, 0.28, mat(f"BottleMat{rz}{bx}", random.choice(PLASTIC), 0.2), 10)

for fi, fy in enumerate((2.4, 6.0)):
    fz = 2.5
    box(f"FanMount{fi}", (0.02, fy - 0.08, fz - 0.4), (0.12, 0.16, 0.5), dark_m)
    cyl_x(f"FanBack{fi}", (0.28, fy, fz), 0.1, 0.1, dark_m, 16)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.34, minor_radius=0.012,
                                     location=(0.42, fy, fz),
                                     rotation=(0, math.radians(90), 0))
    ring = bpy.context.active_object
    ring.name = f"FanGuard{fi}"
    ring.data.materials.append(metal_m)
    link(ring)
    for bi in range(3):
        box(f"FanBlade{fi}_{bi}", (0.38, fy - 0.07, fz - 0.28), (0.02, 0.14, 0.56),
            white_m, rot=(math.radians(bi * 60), 0, 0))
    cyl_x(f"FanHub{fi}", (0.4, fy, fz), 0.05, 0.08, red_m, 12)

box("WashStand", (0.15, 0.7, 0.0), (0.7, 0.7, 0.85), wood_m)
cyl("WashBucket", (0.5, 1.05, 0.85), 0.22, 0.38, bucket_m, 18)
cyl("WashLid", (0.5, 1.05, 1.23), 0.23, 0.03, white_m, 18)
cyl_x("WashTap", (0.82, 1.05, 0.95), 0.025, 0.16, metal_m, 8)
cyl("WashBasin", (1.15, 1.05, 0.0), 0.28, 0.16, white_m, 20)
box("SoapShelf", (0.0, 0.5, 1.4), (0.2, 0.7, 0.04), wood_m)
cyl("Soap", (0.1, 0.8, 1.44), 0.05, 0.1, mat("SoapMat", (0.9, 0.5, 0.7), 0.4), 10)


def sq_table(name, tx, ty, topm):
    box(f"{name}_Top", (tx - 0.45, ty - 0.45, 0.72), (0.9, 0.9, 0.04), topm)
    for dx in (-0.4, 0.36):
        for dy in (-0.4, 0.36):
            box(f"{name}_Leg", (tx + dx, ty + dy, 0), (0.04, 0.04, 0.72), white_m)


def chair(name, cx, cy, face, m):
    box(f"{name}_Seat", (cx - 0.21, cy - 0.21, 0.45), (0.42, 0.42, 0.04), m)
    backs = {'+x': ((cx - 0.23, cy - 0.21, 0.5), (0.04, 0.42, 0.42)),
             '-x': ((cx + 0.19, cy - 0.21, 0.5), (0.04, 0.42, 0.42)),
             '+y': ((cx - 0.21, cy - 0.23, 0.5), (0.42, 0.04, 0.42)),
             '-y': ((cx - 0.21, cy + 0.19, 0.5), (0.42, 0.04, 0.42))}
    loc, size = backs[face]
    box(f"{name}_Back", loc, size, m)
    for dx in (-0.19, 0.15):
        for dy in (-0.19, 0.15):
            box(f"{name}_Leg", (cx + dx, cy + dy, 0), (0.04, 0.04, 0.45), m)


tables = [(3.6, 1.9), (6.4, 1.9), (9.2, 1.9), (3.6, 4.6), (6.4, 4.6), (9.2, 4.6)]
n = 0
for ti, (tx, ty) in enumerate(tables):
    sq_table(f"T{ti}", tx, ty, top_mats[ti % 3])
    chair(f"T{ti}_W", tx - 0.68, ty, '+x', chair_mats[n % 6]); n += 1
    chair(f"T{ti}_E", tx + 0.68, ty, '-x', chair_mats[n % 6]); n += 1
    chair(f"T{ti}_S", tx, ty - 0.68, '+y', chair_mats[n % 6]); n += 1
    chair(f"T{ti}_N", tx, ty + 0.68, '-y', chair_mats[n % 6]); n += 1

lx = 11.3
box("LongTop", (lx - 0.45, 1.0, 0.72), (0.9, 4.6, 0.05), top_mats[2])
for ly in (1.1, 3.1, 5.4):
    for dx in (-0.4, 0.36):
        box(f"LongLeg_{ly}_{dx}", (lx + dx, ly, 0), (0.05, 0.05, 0.72), white_m)
for side, bx in (("W", lx - 0.95), ("E", lx + 0.62)):
    box(f"Bench{side}", (bx, 1.1, 0.42), (0.33, 4.4, 0.05), chair_mats[0 if side == "W" else 3])
    for ly in (1.2, 3.1, 5.2):
        box(f"Bench{side}Leg{ly}", (bx + 0.12, ly, 0), (0.05, 0.3, 0.42), white_m)

for bi, (bx, by) in enumerate([(3.6, 3.2), (6.4, 3.2), (9.2, 3.2), (11.3, 3.4),
                               (5.0, 6.5), (8.0, 6.5)]):
    cyl(f"BulbCord{bi}", (bx, by, 2.6), 0.01, H - 2.6, metal_m, 6)
    sphere(f"Bulb{bi}", (bx, by, 2.5), 0.1, bulb_m)

# ---------------- game export ----------------
# The outside lawn isn't part of the room (the game draws its own backdrop)
bpy.data.objects.remove(bpy.data.objects["Ground"], do_unlink=True)

# Centre the room on the origin (floor x -6.5..6.5, y -5..5)
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
