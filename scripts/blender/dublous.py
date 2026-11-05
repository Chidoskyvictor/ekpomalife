"""
Dublous supermarket interior (mini-mart; mirrored so the walls face the game camera) -> public/models/dublous.glb.
Headless:  blender -b --factory-startup -P scripts/blender/dublous.py -- <out.glb>
The room build is the user's provisions-shop script with the shelves left EMPTY (nothing is on
sale yet: out of stock). Scene lights / camera are left out (the game has its own); the room is
centred, joined per material and mirrored left-right, like spot-rite.py.
"""
import bpy, random, math, sys

random.seed(8)

W, D, H = 13.0, 10.0, 3.4
TILE_COLOR = (0.80, 0.78, 0.72)
GROUT_COLOR = (0.32, 0.31, 0.29)
TILE_SIZE = 0.6
GROUT_GAP = 0.025

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Shop")
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


def cyl(name, center, radius, depth, m, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=(center[0], center[1], center[2] + depth / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


def cyl_y(name, center, radius, depth, m, verts=28):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=center, rotation=(math.radians(90), 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


floor_m = mat("Tile", TILE_COLOR, 0.25)
slab_m = mat("Slab", GROUT_COLOR, 0.8)
blue_m = mat("Blue", (0.12, 0.32, 0.72), 0.8)
white_m = mat("White", (0.96, 0.96, 0.94), 0.5)
wall_w = mat("WallWhite", (0.94, 0.94, 0.91), 0.9)
yellow_m = mat("Yellow", (0.96, 0.78, 0.12), 0.6)
dark_m = mat("Dark", (0.10, 0.08, 0.07), 0.5)
wood_m = mat("Wood", (0.75, 0.55, 0.32), 0.45)
metal_m = mat("Metal", (0.10, 0.10, 0.11), 0.35, 0.8)
steel_m = mat("Steel", (0.72, 0.74, 0.77), 0.25, 0.9)
red_m = mat("Red", (0.78, 0.14, 0.12), 0.55)
glass_m = mat("Glass", (0.78, 0.90, 0.95), 0.05, alpha=0.25)
tube_m = mat("Tube", (1.0, 1.0, 0.95), 0.2, emit=(1.0, 1.0, 0.95), strength=10)
brown_m = mat("ShelfBrown", (0.36, 0.22, 0.12), 0.6)
black_m = mat("TableBlack", (0.05, 0.05, 0.05), 0.45)
fsign_m = mat("FridgeSign", (0.3, 0.6, 1.0), 0.3, emit=(0.3, 0.6, 1.0), strength=6)

# ---------- slab (grout) + one-colour tile floor (shelves stay empty: out of stock) ----------
box("FloorSlab", (-0.2, -0.2, -0.45), (W + 0.2, D + 0.2, 0.47), slab_m)
nx = int(math.ceil(W / TILE_SIZE))
ny = int(math.ceil(D / TILE_SIZE))
for ix in range(nx):
    x0 = ix * TILE_SIZE
    tw = min(TILE_SIZE, W - x0) - GROUT_GAP
    for iy in range(ny):
        y0 = iy * TILE_SIZE
        tl = min(TILE_SIZE, D - y0) - GROUT_GAP
        if tw > 0.05 and tl > 0.05:
            box(f"Tile{ix:02d}_{iy:02d}", (x0 + GROUT_GAP / 2, y0 + GROUT_GAP / 2, 0.02), (tw, tl, 0.03), floor_m)

# ---------- walls ----------
box("WallLeft", (-0.2, -0.2, 0), (0.2, D + 0.2, H), wall_w)
box("WallBack", (-0.2, D, 0), (W + 0.2, 0.2, H), wall_w)
box("StripeLeftTop", (0, 0, 3.0), (0.04, D, 0.2), brown_m)
box("StripeBackTop", (0, D - 0.04, 3.0), (W, 0.04, 0.2), brown_m)
box("BackBand", (0, D - 0.04, 0.05), (W, 0.04, 0.15), brown_m)
box("BaseLeft", (0, 0, 0.05), (0.05, D, 0.15), dark_m)
box("CapLeft", (-0.2, -0.2, H), (0.25, D + 0.2, 0.1), white_m)
box("CapBack", (-0.2, D - 0.05, H), (W + 0.2, 0.25, 0.1), white_m)


def gondola(idx, gx, y0=0.9, L=5.0, colour=blue_m):
    box(f"G{idx}_Base", (gx, y0, 0), (0.7, L, 0.12), dark_m)
    box(f"G{idx}_Back", (gx + 0.33, y0, 0.12), (0.04, L, 1.7), colour)
    for e, ey in (("A", y0 - 0.04), ("B", y0 + L)):
        box(f"G{idx}_End{e}", (gx, ey, 0), (0.7, 0.04, 1.82), colour)
    box(f"G{idx}_Header", (gx, y0 - 0.04, 1.82), (0.7, L + 0.08, 0.08), brown_m)
    for lv, z in enumerate((0.3, 0.75, 1.2)):
        box(f"G{idx}_Shelf{lv}", (gx, y0, z), (0.7, L, 0.03), brown_m)


for gi, gx in enumerate((3.0, 5.2, 7.4, 9.6)):
    gondola(gi, gx, colour=brown_m)

box("WallUnitBase", (0.04, 0.9, 0), (0.55, 5.6, 0.12), dark_m)
for lv, z in enumerate((0.35, 0.85, 1.35, 1.85)):
    box(f"WallUnitShelf{lv}", (0.04, 0.9, z), (0.5, 5.6, 0.03), brown_m)
box("WallUnitTop", (0.04, 0.9, 2.3), (0.5, 5.6, 0.05), brown_m)


def back_shelves(tag, x0, x1, levels):
    for lv, z in enumerate(levels):
        box(f"{tag}Shelf{lv}", (x0, D - 0.45, z), (x1 - x0, 0.4, 0.03), brown_m)
    box(f"{tag}Top", (x0, D - 0.45, levels[-1] + 0.55), (x1 - x0, 0.4, 0.05), brown_m)


back_shelves("BSL", 3.6, 6.7, (0.4, 0.9, 1.4, 1.9))
back_shelves("BSR", 7.3, 12.5, (0.5, 1.0, 1.5, 2.0, 2.5))


def fridge(idx, x0):
    fw, fd, fh, t = 1.1, 0.85, 2.0, 0.05
    y0 = D - 0.95
    box(f"F{idx}_Left", (x0, y0, 0), (t, fd, fh), white_m)
    box(f"F{idx}_Right", (x0 + fw - t, y0, 0), (t, fd, fh), white_m)
    box(f"F{idx}_Top", (x0, y0, fh - t), (fw, fd, t), white_m)
    box(f"F{idx}_Bottom", (x0, y0, 0), (fw, fd, 0.1), dark_m)
    box(f"F{idx}_Back", (x0, D - 0.1, 0), (fw, t, fh), white_m)
    box(f"F{idx}_Glass", (x0 + 0.05, y0 - 0.02, 0.12), (fw - 0.1, 0.03, 1.7), glass_m)
    box(f"F{idx}_Handle", (x0 + fw - 0.14, y0 - 0.06, 0.8), (0.04, 0.04, 0.5), steel_m)
    box(f"F{idx}_Sign", (x0 + 0.05, y0 - 0.04, 1.9), (fw - 0.1, 0.04, 0.1), fsign_m)
    for lv, z in enumerate((0.3, 0.7, 1.1, 1.5)):
        box(f"F{idx}_Shelf{lv}", (x0 + t, y0 + 0.05, z), (fw - 2 * t, fd - 0.15, 0.02), brown_m)


fridge(0, 0.9)
fridge(1, 2.1)

fx, fy, fw, fd, fh = 0.9, 7.3, 1.6, 0.9, 0.85
box("FrzBottom", (fx, fy, 0.05), (fw, fd, 0.08), white_m)
box("FrzFront", (fx, fy, 0.05), (fw, 0.06, fh), white_m)
box("FrzBack", (fx, fy + fd - 0.06, 0.05), (fw, 0.06, fh), white_m)
box("FrzLeft", (fx, fy, 0.05), (0.06, fd, fh), white_m)
box("FrzRight", (fx + fw - 0.06, fy, 0.05), (0.06, fd, fh), white_m)
box("FrzRim", (fx - 0.02, fy - 0.02, fh + 0.05), (fw + 0.04, fd + 0.04, 0.04), black_m)
box("FrzGlass", (fx + 0.06, fy + 0.06, fh + 0.02), (fw - 0.12, fd - 0.12, 0.03), glass_m)

# ---------- checkout counter ----------
cx0, cw, cy = 7.0, 5.5, D - 2.5
box("CounterBody", (cx0, cy + 0.05, 0.05), (cw, 0.8, 1.0), black_m)
for i in range(11):
    box(f"CStripe{i}", (cx0 + 0.15 + i * 0.5, cy + 0.04, 0.2), (0.3, 0.02, 0.7), black_m)
box("CounterTop", (cx0 - 0.1, cy - 0.05, 1.05), (cw + 0.2, 1.05, 0.06), black_m)
box("TillBase", (11.2, D - 2.15, 1.11), (0.45, 0.42, 0.18), dark_m)
box("TillScreen", (11.25, D - 2.0, 1.29), (0.35, 0.05, 0.25), mat("ScreenGlow", (0.3, 0.7, 1.0), emit=(0.3, 0.7, 1.0), strength=3))
box("CardMachine", (10.6, D - 2.1, 1.11), (0.12, 0.2, 0.05), metal_m)
box("ScaleBase", (9.6, D - 2.15, 1.11), (0.4, 0.32, 0.06), steel_m)
box("ScalePlate", (9.65, D - 2.12, 1.17), (0.3, 0.24, 0.02), steel_m)
box("ScaleDisplay", (9.6, D - 1.95, 1.17), (0.4, 0.04, 0.1), dark_m)
for i in range(4):
    jx = 7.6 + i * 0.32
    cyl(f"Jar{i}", (jx, D - 2.3, 1.11), 0.1, 0.28, glass_m, 14)
    cyl(f"JarLid{i}", (jx, D - 2.3, 1.39), 0.105, 0.03, black_m, 14)
cyl("StoolSeat", (9.7, D - 1.15, 0.62), 0.19, 0.08, brown_m, 20)
cyl("StoolPole", (9.7, D - 1.15, 0.0), 0.035, 0.62, metal_m, 10)
cyl("StoolBase", (9.7, D - 1.15, 0.0), 0.18, 0.03, metal_m, 20)

sx0, sw, sz = 8.1, 3.4, 2.65
for cxp in (sx0 + 0.3, sx0 + sw - 0.3):
    box(f"SignCord{cxp}", (cxp, D - 2.05, sz + 0.6), (0.02, 0.02, H - sz - 0.6), metal_m)
box("SignFrame", (sx0, D - 2.1, sz), (sw, 0.08, 0.6), black_m)
box("SignBoard", (sx0 + 0.06, D - 2.14, sz + 0.06), (sw - 0.12, 0.04, 0.48), brown_m)
box("SignText1", (sx0 + 0.4, D - 2.18, sz + 0.3), (2.0, 0.02, 0.1), brown_m)
box("SignText2", (sx0 + 0.4, D - 2.18, sz + 0.12), (1.4, 0.02, 0.07), black_m)

cyl_y("ClockRim", (5.0, D - 0.06, 2.85), 0.34, 0.05, dark_m)
cyl_y("ClockFace", (5.0, D - 0.1, 2.85), 0.30, 0.04, white_m)
box("ClockHour", (4.985, D - 0.14, 2.85), (0.03, 0.02, 0.18), dark_m)
box("ClockMinute", (5.0, D - 0.14, 2.835), (0.24, 0.02, 0.03), dark_m)

# Empty drink crates (front right)
for ix in range(2):
    for iy in range(3):
        cx, cyy = 11.2 + ix * 0.6, 0.9 + iy * 0.45
        levels = random.randint(2, 4)
        for h in range(levels):
            box(f"Crate{ix}{iy}_{h}", (cx, cyy, h * 0.3), (0.55, 0.4, 0.3), brown_m)


def basket(name, x, y, z, m):
    box(f"{name}_Bottom", (x, y, z), (0.5, 0.35, 0.03), black_m)
    box(f"{name}_F", (x, y, z), (0.5, 0.03, 0.22), black_m)
    box(f"{name}_B", (x, y + 0.32, z), (0.5, 0.03, 0.22), black_m)
    box(f"{name}_L", (x, y, z), (0.03, 0.35, 0.22), black_m)
    box(f"{name}_R", (x + 0.47, y, z), (0.03, 0.35, 0.22), black_m)


basket("Basket0", 11.4, 4.4, 0.0, black_m)
basket("Basket1", 11.4, 4.4, 0.24, black_m)
basket("Basket2", 11.4, 4.9, 0.0, black_m)

for li, lx in enumerate((3.8, 7.2, 10.6)):
    for cyp in (1.8, 5.4):
        box(f"StripCord{li}_{cyp}", (lx - 0.01, cyp, 3.05), (0.02, 0.02, H - 3.05), metal_m)
    box(f"StripLight{li}", (lx - 0.06, 1.2, 3.0), (0.12, 5.0, 0.07), tube_m)

# ---------------- game export (same as spot-rite.py) ----------------
for o in col.objects:
    o.location.x -= W / 2
    o.location.y -= D / 2

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

for o in col.objects:
    if o.type == 'MESH':
        for v in o.data.vertices:
            v.co.x = -v.co.x
        o.data.flip_normals()
        o.data.update()

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False)
print("EXPORTED", out, len(col.objects), "objects")
