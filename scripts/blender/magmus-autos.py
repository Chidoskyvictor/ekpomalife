"""
Magmus Autos showroom, with the street around it -> public/models/magmus-autos.glb.
Headless:  blender -b --factory-startup -P scripts/blender/magmus-autos.py -- <out.glb>

A STAND-IN room: an open tokunbo-style car hall with seven display bays, a sales desk, bunting,
feather flags and tyre stacks. The cars themselves are drawn by the game (components/cars), parked
on the bays listed in lib/game/autos-room.ts, so a hand-built replacement only has to keep the
same floor size (x -10..10, z -7..7 in the game) and leave those bays empty.
Walls stand on +x (right) and -z (back) where the room camera expects them. Blender y = -game z.
"""
import bpy, math, sys

W, D, H = 20.0, 14.0, 4.2

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Autos")
bpy.context.scene.collection.children.link(col)


def mat(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
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


def box(name, center, size, m, rot_z=0.0):
    """center / size in GAME axes (x, y up, z); converted to Blender (x, -z, y)."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    o.location = (center[0], -center[2], center[1])
    o.rotation_euler[2] = rot_z
    o.data.materials.append(m)
    return link(o)


def cyl(name, center, radius, height, m, verts=18):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=height,
                                        location=(center[0], -center[2], center[1]))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


TILE = mat("Tile", (0.78, 0.79, 0.80), 0.25)
TILE_DARK = mat("TileDark", (0.36, 0.38, 0.41), 0.3)
LATERITE = mat("Laterite", (0.62, 0.36, 0.22), 0.95)
WALL = mat("Wall", (0.93, 0.89, 0.78), 0.8)
BLUE = mat("Blue", (0.10, 0.25, 0.72), 0.5)
GREEN = mat("Green", (0.10, 0.42, 0.24), 0.6)
YELLOW = mat("Yellow", (0.95, 0.74, 0.08), 0.5)
RED = mat("Red", (0.80, 0.10, 0.18), 0.5)
WHITE = mat("White", (0.96, 0.96, 0.94), 0.5)
WOOD = mat("Wood", (0.40, 0.24, 0.12), 0.6)
STEEL = mat("Steel", (0.75, 0.77, 0.80), 0.35, 0.8)
RUBBER = mat("Rubber", (0.05, 0.05, 0.06), 0.9)
GLASS = mat("Glass", (0.55, 0.78, 0.88), 0.1, 0.2)
LEAF = mat("Leaf", (0.13, 0.45, 0.20), 0.8)
POT = mat("Pot", (0.55, 0.30, 0.18), 0.8)
LIGHT = mat("Light", (1.0, 0.97, 0.88), 0.4, emit=(1.0, 0.95, 0.8), strength=2.0)

hw, hd = W / 2, D / 2

# Ground outside, then the showroom floor with a dark border
# ================= OUTSIDE: a paved forecourt, a kerb, the ring road and the street around it
# (the same idea as the Innovation Hub / Student Conference courtyards, in our own pieces) =================
ASPHALT = mat("Asphalt", (0.17, 0.18, 0.19), 0.95)
PAVING = mat("Paving", (0.60, 0.58, 0.55), 0.9)
KERB = mat("Kerb", (0.86, 0.86, 0.84), 0.7)
KERB_Y = mat("KerbYellow", (0.92, 0.72, 0.10), 0.6)
LINE = mat("Line", (0.95, 0.95, 0.93), 0.6)
CREAM = mat("Cream", (0.91, 0.85, 0.70), 0.85)
TRIM = mat("Trim", (0.55, 0.50, 0.44), 0.8)
ROOF = mat("Roof", (0.42, 0.20, 0.14), 0.8)
WINDOW = mat("Window", (0.32, 0.45, 0.52), 0.15, 0.3)
GRASS = mat("Grass", (0.30, 0.48, 0.20), 0.95)
TRUNK = mat("Trunk", (0.36, 0.25, 0.16), 0.9)
SIGN_BG = mat("SignBg", (0.07, 0.30, 0.17), 0.6)
CAR_PAINTS = [mat("CarWhite", (0.92, 0.92, 0.90), 0.35, 0.3), mat("CarSilver", (0.70, 0.72, 0.75), 0.3, 0.6),
              mat("CarRed", (0.62, 0.08, 0.10), 0.35, 0.3), mat("CarBlack", (0.06, 0.06, 0.07), 0.3, 0.4),
              mat("CarBlue", (0.12, 0.24, 0.55), 0.35, 0.3)]

# Road: one big asphalt slab under everything; paving + grass verges sit on top of it
box("Asphalt", (0, -0.1, 0), (84, 0.1, 80), ASPHALT)
box("Forecourt", (0, -0.04, 0), (W + 7, 0.06, D + 7), PAVING)
fx, fz = (W + 7) / 2, (D + 7) / 2
for i, (cx, cz, sx, sz) in enumerate(((0, -fz, W + 7.3, 0.3), (0, fz, W + 7.3, 0.3), (-fx, 0, 0.3, D + 7.3), (fx, 0, 0.3, D + 7.3))):
    box("Kerb", (cx, 0.0, cz), (sx, 0.16, sz), KERB)
# black-and-yellow kerb paint on the front, where cars pull in
for i in range(14):
    x = -fx + 0.9 + i * (2 * fx - 1.8) / 13
    box("KerbPaint", (x, 0.085, fz), (0.9, 0.02, 0.32), KERB_Y)

# Lane dashes down the middle of the ring road (back, right, front, left)
RB, RR, RF, RL = -fz - 5.5, fx + 5.5, fz + 5.5, -fx - 5.5
for i in range(22):
    x = -34 + i * 3.2
    box("Dash", (x, -0.045, RB), (1.6, 0.01, 0.16), LINE)
    box("Dash", (x, -0.045, RF), (1.6, 0.01, 0.16), LINE)
for i in range(20):
    z = -31 + i * 3.2
    box("Dash", (RR, -0.045, z), (0.16, 0.01, 1.6), LINE)
    box("Dash", (RL, -0.045, z), (0.16, 0.01, 1.6), LINE)

# Grass verges along the far side of the road, under the blocks
for (cx, cz, sx, sz) in ((0, -31, 84, 18), (33, 0, 18, 44), (-33, 0, 18, 44), (0, 33, 84, 14)):
    box("Verge", (cx, -0.035, cz), (sx, 0.05, sz), GRASS)


def block(tag, x0, z0, x1, z1, floors, face, sign=None):
    """A cream campus-style block with a window band on every floor of the side facing the road."""
    FH = 3.2
    h = floors * FH
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    sx, sz = x1 - x0, z1 - z0
    box(tag + "Body", (cx, h / 2, cz), (sx, h, sz), CREAM)
    box(tag + "Base", (cx, 0.3, cz), (sx + 0.2, 0.6, sz + 0.2), TRIM)
    box(tag + "Roof", (cx, h + 0.18, cz), (sx + 0.6, 0.36, sz + 0.6), ROOF)
    cyl(tag + "Tank", (x0 + sx * 0.3, h + 1.0, z0 + sz * 0.4), 0.75, 1.3, STEEL, 12)
    for f in range(floors):
        y = f * FH + 1.7
        if face == '+z':
            box(tag + "Win", (cx, y, z1 + 0.03), (sx - 1.6, 1.3, 0.06), WINDOW)
            box(tag + "Sill", (cx, y - 0.72, z1 + 0.08), (sx - 1.4, 0.12, 0.16), TRIM)
        elif face == '-x':
            box(tag + "Win", (x0 - 0.03, y, cz), (0.06, 1.3, sz - 1.6), WINDOW)
            box(tag + "Sill", (x0 - 0.08, y - 0.72, cz), (0.16, 0.12, sz - 1.4), TRIM)
        else:  # '+x'
            box(tag + "Win", (x1 + 0.03, y, cz), (0.06, 1.3, sz - 1.6), WINDOW)
            box(tag + "Sill", (x1 + 0.08, y - 0.72, cz), (0.16, 0.12, sz - 1.4), TRIM)
    if sign and face == '+z':
        w = min(sx - 2, len(sign) * 0.7)
        box(tag + "SignBoard", (cx, h + 1.3, z1 - 0.4), (w, 1.4, 0.16), SIGN_BG)
        body = bpy.data.curves.new(tag + "SignText", 'FONT')
        body.body = sign
        body.size = 0.9
        body.align_x = 'CENTER'
        body.align_y = 'CENTER'
        body.extrude = 0.03
        o = bpy.data.objects.new(tag + "SignText", body)
        o.location = (cx, -(z1 - 0.3), h + 1.3)
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.data.materials.append(WHITE)
        link(o)
    elif sign and face == '-x':
        w = min(sz - 2, len(sign) * 0.7)
        box(tag + "SignBoard", (x0 + 0.4, h + 1.3, cz), (0.16, 1.4, w), SIGN_BG)
        body = bpy.data.curves.new(tag + "SignText", 'FONT')
        body.body = sign
        body.size = 0.9
        body.align_x = 'CENTER'
        body.align_y = 'CENTER'
        body.extrude = 0.03
        o = bpy.data.objects.new(tag + "SignText", body)
        o.location = (x0 + 0.3, -cz, h + 1.3)
        o.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
        o.data.materials.append(WHITE)
        link(o)


# Blocks across the road: behind (what the room camera sees most) and to the right
block("Mech", -32.0, -38.0, -6.0, -24.0, 3, '+z', "MECHANIC VILLAGE")
block("Plaza", 0.0, -38.0, 28.0, -25.0, 4, '+z', "AUTO PLAZA")
block("Spare", 25.0, -20.0, 38.0, 14.0, 3, '-x', "SPARE PARTS")


def parked(tag, cx, cz, along, paint):
    """A low-poly car (4.2 x 1.8) parked at the kerb; long axis along 'x' or 'z'."""
    L, Wd = 4.2, 1.8
    sx, sz = (L, Wd) if along == 'x' else (Wd, L)
    box(tag + "Body", (cx, 0.58, cz), (sx, 0.55, sz), paint)
    cs = (2.1, 0.5, Wd - 0.16) if along == 'x' else (Wd - 0.16, 0.5, 2.1)
    box(tag + "Cabin", (cx, 1.1, cz), cs, GLASS)
    for dx in (-1.35, 1.35):
        for side in (-1, 1):
            wx, wz = (cx + dx, cz + side * (Wd / 2 - 0.05)) if along == 'x' else (cx + side * (Wd / 2 - 0.05), cz + dx)
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.33, depth=0.24, location=(wx, -wz, 0.33))
            o = bpy.context.active_object
            o.name = tag + "Wheel"
            o.rotation_euler = (math.pi / 2, 0, 0) if along == 'x' else (0, math.pi / 2, 0)
            o.data.materials.append(RUBBER)
            link(o)


# Parked along the far kerbs, in front of the blocks
for i, (x, z, along, k) in enumerate(((-22, RB - 4.2, 'x', 0), (-14, RB - 4.2, 'x', 2), (6, RB - 4.2, 'x', 1), (14, RB - 4.2, 'x', 3),
                                      (RR + 4.2, -8, 'z', 4), (RR + 4.2, 4, 'z', 0), (RL - 4.2, -6, 'z', 1), (-6, RF + 4.2, 'x', 3))):
    parked(f"Parked{i}", x, z, along, CAR_PAINTS[k])


def tree(tag, x, z, s=1.0):
    cyl(tag + "Trunk", (x, 1.4 * s, z), 0.22 * s, 2.8 * s, TRUNK, 8)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.6 * s, location=(x, -z, 3.4 * s))
    o = bpy.context.active_object
    o.name = tag + "Crown"
    o.scale = (1.0, 1.0, 0.8)
    o.data.materials.append(LEAF)
    link(o)


# Trees on the verges and the forecourt corners
for i, (x, z, sc) in enumerate(((-30, -21, 1.1), (-10, -21.5, 0.9), (22, -21.5, 1.0), (23, 18, 1.0), (-24, 18, 0.9),
                                (-24, -2, 1.0), (24, 22, 0.8), (12, 22, 0.9), (-fx + 1.2, -fz + 1.2, 0.7), (fx - 1.2, fz - 1.2, 0.7))):
    tree(f"Tree{i}", x, z, sc)

box("FloorEdge", (0, 0.0, 0), (W, 0.06, D), TILE_DARK)
box("Floor", (0, 0.02, 0), (W - 0.5, 0.06, D - 0.5), TILE)

# Back wall (-z) and right wall (+x), a blue band and a yellow pinstripe along both
box("BackWall", (0, H / 2, -hd - 0.1), (W + 0.4, H, 0.2), WALL)
box("RightWall", (hw + 0.1, H / 2, 0), (0.2, H, D + 0.4), WALL)
box("BandBack", (0, 3.1, -hd + 0.02), (W, 0.6, 0.05), BLUE)
box("PinBack", (0, 2.72, -hd + 0.02), (W, 0.08, 0.06), YELLOW)
box("BandRight", (hw - 0.02, 3.1, 0), (0.05, 0.6, D), BLUE)
box("PinRight", (hw - 0.02, 2.72, 0), (0.06, 0.08, D), YELLOW)
# Signboard on the back wall, lit strip above it
box("Sign", (0, 3.1, -hd + 0.06), (6.4, 0.9, 0.08), WHITE)
box("SignBar", (0, 3.1, -hd + 0.11), (5.6, 0.14, 0.04), RED)
box("SignLight", (0, 3.75, -hd + 0.2), (6.6, 0.08, 0.2), LIGHT)
# Windows in the right wall
for z in (-4.2, -0.6, 3.0):
    box("Window", (hw - 0.03, 1.6, z), (0.06, 1.5, 2.6), GLASS)
    box("WindowSill", (hw - 0.06, 0.82, z), (0.12, 0.08, 2.8), STEEL)

# Display bays: four at the back facing the front, three out front turned to the door.
# Keep in step with lib/game/autos-room.ts (AUTOS_BAYS).
BACK = [(-7.0, -3.8), (-3.0, -3.8), (1.0, -3.8), (5.0, -3.8)]
FRONT = [(-6.0, 3.6), (-1.0, 3.6), (4.0, 3.6)]
for i, (x, z) in enumerate(BACK):
    box("Bay", (x, 0.1, z), (2.9, 0.12, 5.6), TILE_DARK)
    box("BayStripe", (x, 0.165, z + 2.7), (2.9, 0.02, 0.12), YELLOW)
    box("PriceStand", (x + 1.25, 0.6, z + 2.95), (0.06, 1.0, 0.06), STEEL)
    box("PriceCard", (x + 1.25, 1.15, z + 2.95), (0.5, 0.34, 0.04), WHITE)
for i, (x, z) in enumerate(FRONT):
    box("Bay", (x, 0.1, z), (2.9, 0.12, 5.6), TILE_DARK, rot_z=-0.35)
    box("PriceStand", (x + 1.9, 0.6, z + 2.3), (0.06, 1.0, 0.06), STEEL)
    box("PriceCard", (x + 1.9, 1.15, z + 2.3), (0.5, 0.34, 0.04), WHITE)

# Roof beams and strip lights over the back row (the "shade")
for x in (-9.0, -5.0, -1.0, 3.0, 7.0):
    box("Post", (x, H / 2, -6.4), (0.14, H, 0.14), STEEL)
box("Beam", (-1.0, H - 0.1, -6.4), (16.2, 0.16, 0.16), STEEL)
for x in (-7.0, -3.0, 1.0, 5.0):
    box("Rafter", (x, H - 0.1, -3.8), (0.1, 0.12, 5.4), STEEL)
    box("Tube", (x, H - 0.22, -3.8), (0.12, 0.06, 3.0), LIGHT)

# Sales desk by the right wall, with two visitor chairs and a monitor
box("DeskTop", (8.6, 0.78, 0.2), (1.2, 0.08, 2.6), WOOD)
box("DeskFront", (8.05, 0.4, 0.2), (0.08, 0.76, 2.6), BLUE)
box("DeskSide", (8.6, 0.4, -1.06), (1.2, 0.76, 0.08), WOOD)
box("DeskSide", (8.6, 0.4, 1.46), (1.2, 0.76, 0.08), WOOD)
box("Monitor", (8.8, 1.1, 0.2), (0.06, 0.4, 0.6), RUBBER)
box("MonitorFoot", (8.8, 0.86, 0.2), (0.2, 0.08, 0.2), RUBBER)
box("StaffChair", (9.45, 0.45, 0.2), (0.5, 0.1, 0.5), RUBBER)
box("StaffChairBack", (9.68, 0.8, 0.2), (0.08, 0.7, 0.5), RUBBER)
for z in (-0.5, 0.9):
    box("Chair", (7.3, 0.42, z), (0.5, 0.08, 0.5), RED)
    box("ChairBack", (7.08, 0.75, z), (0.06, 0.6, 0.5), RED)
    for dx in (-0.2, 0.2):
        for dz in (-0.2, 0.2):
            box("ChairLeg", (7.3 + dx, 0.2, z + dz), (0.04, 0.4, 0.04), STEEL)
# Key board behind the desk
box("KeyBoard", (hw - 0.05, 1.7, -2.0), (0.06, 0.8, 1.2), WOOD)
for i in range(7):
    box("Key", (hw - 0.1, 1.9 - (i // 4) * 0.3, -2.45 + (i % 4) * 0.3), (0.03, 0.14, 0.06), YELLOW)

# Tyre stacks, potted palms, a jerrycan-style oil drum
for (x, z) in ((-9.3, -6.3), (-9.3, 0.4), (9.2, 5.9)):
    for k in range(3):
        cyl("Tyre", (x, 0.14 + k * 0.24, z), 0.36, 0.22, RUBBER)
for (x, z) in ((9.2, -6.2), (-9.2, 6.1), (6.6, 6.2)):
    cyl("PlantPot", (x, 0.25, z), 0.3, 0.5, POT, 12)
    for a in range(5):
        ang = a * math.tau / 5
        box("Leaf", (x + math.cos(ang) * 0.35, 1.0, z + math.sin(ang) * 0.35), (0.14, 1.0, 0.5), LEAF, rot_z=-ang)
cyl("Drum", (-9.2, 0.45, 3.2), 0.32, 0.9, BLUE, 14)

# Bunting along the open front and feather flags beside it
PENNANTS = [RED, YELLOW, BLUE, GREEN, WHITE]
for z in (6.6,):
    box("String", (0, 3.55, z), (W, 0.02, 0.02), RUBBER)
    n = 26
    for i in range(n):
        x = -hw + 0.5 + i * (W - 1.0) / (n - 1)
        box("Pennant", (x, 3.36, z), (0.3, 0.36, 0.02), PENNANTS[i % len(PENNANTS)])
for x in (-9.4, -3.6, 1.6, 7.0):
    box("FlagPole", (x, 1.7, 6.75), (0.06, 3.4, 0.06), STEEL)
    box("FlagGreenTop", (x + 0.33, 2.95, 6.75), (0.6, 0.7, 0.03), GREEN)
    box("FlagWhite", (x + 0.33, 2.25, 6.75), (0.6, 0.7, 0.03), WHITE)
    box("FlagGreenLow", (x + 0.33, 1.55, 6.75), (0.6, 0.7, 0.03), GREEN)

for o in list(col.objects):
    if o.type == 'FONT':
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target='MESH')
bpy.ops.object.select_all(action='DESELECT')
for o in col.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = col.objects[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# One mesh per material: a handful of draw calls on phones
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

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False)
print("EXPORTED", out, len(col.objects), "objects")
