"""
Club surroundings (Sazza and Forbes): the same courtyard look as the Innovation Hub and the Student
Conference hall (kerbs, asphalt ring road, cream campus blocks, tree ferns, parked cars), minus the
interlocking paving: the clubs keep their own paved yard. Windows have an emission map, so a share
of them glow softly at night (room-lights.tsx lights the 'FacadeLit' material). Same frame as
club-sazza.glb / club-forbes.glb. -> public/models/club-surroundings.glb
Headless:  blender -b --factory-startup -P scripts/blender/club-surroundings.py -- <out.glb> <tmp dir>
(then: npx gltf-transform meshopt <out.glb> public/models/club-surroundings.glb)
"""
import bpy, math, sys, os, random

args = sys.argv[sys.argv.index("--") + 1:]
OUT, TMP = args[0], args[1]
os.makedirs(TMP, exist_ok=True)
random.seed(7)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
col = bpy.data.collections.new("Hall")
bpy.context.scene.collection.children.link(col)


def link(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    return o


# ---------- small generated textures (saved as PNG, embedded in the GLB) ----------
def texture(name, size, fn):
    img = bpy.data.images.new(name, size, size, alpha=False)
    px = [0.0] * (size * size * 4)
    for y in range(size):
        for x in range(size):
            r, g, b = fn(x, y, size)
            i = (y * size + x) * 4
            px[i], px[i + 1], px[i + 2], px[i + 3] = r, g, b, 1.0
    img.pixels = px
    path = os.path.join(TMP, name + ".png")
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def noise(a=0.06):
    return (random.random() - 0.5) * a


def wood(x, y, s):
    # parquet planks: 8 planks across, staggered joints, grain streaks
    pw = s // 8
    k = x // pw
    off = (k * 37) % s
    yy = (y + off) % s
    tone = 0.85 + ((k * 53) % 7) / 40
    grain = 0.04 * math.sin((x % pw) * 0.9 + yy * 0.05 + k)
    edge = 0.55 if (x % pw == 0 or yy % (s // 2) == 0) else 1.0
    n = noise(0.05)
    return ((0.55 + grain + n) * tone * edge, (0.34 + grain * 0.7 + n) * tone * edge, (0.18 + n) * tone * edge)


def floor_tile(x, y, s):
    # big square ceramic tiles (2 per texture), thin grout, faint streaks, wood brown
    t = s // 2
    grout = (x % t < 2 or y % t < 2)
    if grout:
        return (0.25, 0.16, 0.09)
    k = (x // t) * 3 + (y // t)
    vein = 0.03 * math.sin(x * 0.11 + y * 0.07 + k * 2.1) + 0.02 * math.sin(x * 0.03 - y * 0.05 + k)
    n = noise(0.025)
    return (0.55 + vein + n, 0.34 + vein * 0.7 + n, 0.18 + n)  # wood brown, like the old parquet


def fabric(x, y, s):
    weave = 0.04 if (x + y) % 2 else -0.02
    n = noise(0.05)
    return (0.45 + weave + n, 0.07 + weave * 0.5 + n * 0.3, 0.10 + weave * 0.5 + n * 0.3)


def carpet(x, y, s):
    n = noise(0.06)
    border = 0.75 if (x < 6 or y < 6 or x > s - 7 or y > s - 7) else 1.0
    return (0.10 * border + n * 0.3, 0.16 * border + n * 0.3, 0.32 * border + n)


def wall(x, y, s):
    # cream plaster above, walnut wainscot below with a gold rail line
    n = noise(0.035)
    if y < s * 0.32:
        seam = 0.7 if x % (s // 4) < 2 else 1.0
        return ((0.40 + n) * seam, (0.25 + n) * seam, (0.14 + n) * seam)
    if y < s * 0.34:
        return (0.78, 0.62, 0.30)
    return (0.92 + n, 0.88 + n, 0.78 + n)


def asphalt(x, y, s):
    n = noise(0.08) + (0.05 if random.random() < 0.03 else 0)
    return (0.20 + n, 0.20 + n, 0.21 + n)


def paving(x, y, s):
    # interlocking pavers in a herringbone: 2:1 bricks, alternating direction, grey with a few red
    u = s // 8
    bx, by = x // u, y // u
    k = (bx + by) % 4
    if k < 2:  # horizontal brick, 2 units wide
        sx = (x - (k * u)) % (2 * u)
        edge = sx < 2 or (y % u) < 2
        bid = ((x - k * u) // (2 * u), by)
    else:  # vertical brick, 2 units tall
        sy = (y - ((k - 2) * u)) % (2 * u)
        edge = sy < 2 or (x % u) < 2
        bid = (bx, (y - (k - 2) * u) // (2 * u))
    if edge:
        return (0.30, 0.29, 0.28)
    h = (bid[0] * 73 + bid[1] * 151) % 11
    n = noise(0.05)
    if h == 0:
        return (0.62 + n, 0.30 + n, 0.22 + n)
    shade = 0.56 + (h % 4) * 0.035
    return (shade + n, shade - 0.01 + n, shade - 0.04 + n)


def facade(x, y, s):
    # one bay of a cream building: a window with a dark frame and a sill
    n = noise(0.03)
    wx0, wx1, wy0, wy1 = s * 0.22, s * 0.78, s * 0.30, s * 0.80
    if wx0 <= x <= wx1 and wy0 <= y <= wy1:
        if abs(x - s / 2) < 2 or x - wx0 < 3 or wx1 - x < 3 or y - wy0 < 3 or wy1 - y < 3:
            return (0.22, 0.20, 0.18)
        sky = 0.35 + (y - wy0) / (wy1 - wy0) * 0.25
        return (0.30 + n, sky * 0.9 + n, sky + 0.1 + n)
    if wy0 - 6 <= y < wy0 and wx0 - 4 <= x <= wx1 + 4:
        return (0.80, 0.78, 0.72)
    return (0.88 + n, 0.82 + n, 0.66 + n)


def mat(name, color=None, img=None, rough=0.7, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*color, 1)
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 1.0
    return m


S = 128
tile_m = mat("HallTile", img=texture("halltile", S, floor_tile), rough=0.25)
fabric_m = mat("ChairFabric", img=texture("fabric", 64, fabric), rough=0.9)
carpet_m = mat("StageCarpet", img=texture("carpet", 64, carpet), rough=0.95)
wall_m = mat("HallWall", img=texture("hallwall", S, wall), rough=0.85)
asphalt_m = mat("Asphalt", img=texture("asphalt", 64, asphalt), rough=0.95)
paving_m = mat("Paving", img=texture("paving", 128, paving), rough=0.9)
facade_m = mat("Facade", img=texture("facade", 64, facade), rough=0.85)
metal_m = mat("ChairMetal", (0.12, 0.12, 0.13), rough=0.35, metal=0.8)
walnut_m = mat("Walnut", (0.30, 0.17, 0.09), rough=0.5)
gold_m = mat("Gold", (0.83, 0.64, 0.25), rough=0.35, metal=0.8)
screen_m = mat("Screen", (0.10, 0.25, 0.55), rough=0.3, emit=(0.08, 0.22, 0.50))
banner_m = mat("Banner", (0.06, 0.32, 0.18), rough=0.8)
white_m = mat("WhiteText", (0.97, 0.97, 0.95), rough=0.5, emit=(0.6, 0.6, 0.58))
roof_m = mat("Roof", (0.60, 0.58, 0.55), rough=0.9)
trim_m = mat("Trim", (0.95, 0.93, 0.88), rough=0.8)
signbg_m = mat("SignBoard", (0.07, 0.23, 0.45), rough=0.6)
line_m = mat("RoadLine", (0.95, 0.93, 0.85), rough=0.7)
kerb_m = mat("Kerb", (0.80, 0.80, 0.78), rough=0.9)
plant_m = mat("Plant", (0.20, 0.52, 0.22), rough=0.8)
pot_m = mat("Pot", (0.85, 0.82, 0.75), rough=0.7)

TILED = {}  # object -> texture tile size in metres (box-projected UVs)


def box(name, x0, z0, x1, z1, y0, y1, m, tile=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, z1 - z0, y1 - y0)
    o.location = ((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2)
    o.data.materials.append(m)
    if tile:
        TILED[o.name] = tile
    return link(o)


def cyl(name, x, z, y0, h, r, m, verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, -z, y0 + h / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


def boxuv(o, tile):
    """World-space box projection so textures keep their size on any box."""
    me = o.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                u, w = v.x, v.y
            elif ax == 0:
                u, w = v.y, v.z
            else:
                u, w = v.x, v.z
            uv[li].uv = (u / tile[0], w / tile[1])


def text(name, body, x, y, z, size, m, face='+z', depth=0.04):
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.active_object
    t.data.body = body
    t.data.size = size
    t.data.extrude = depth
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    t.rotation_euler = (math.radians(90), 0, 0 if face == '+z' else math.radians(-90))
    t.location = (x, -z, y)
    bpy.ops.object.convert(target='MESH')
    t = bpy.context.active_object
    t.name = name
    t.data.materials.clear()
    t.data.materials.append(m)
    return link(t)


tyre_m = mat("Tyre", (0.05, 0.05, 0.06), rough=0.8)
glass_car_m = mat("CarGlass", (0.14, 0.20, 0.26), rough=0.15)
tail_m = mat("TailLight", (0.8, 0.08, 0.06), rough=0.4, emit=(0.5, 0.04, 0.02))
white_top_m = mat("DeskWhite", (0.96, 0.96, 0.94), rough=0.35)
PAINTS = {
    "white": mat("CarWhite", (0.92, 0.92, 0.90), rough=0.3, metal=0.3),
    "red": mat("CarRed", (0.62, 0.10, 0.10), rough=0.3, metal=0.3),
    "blue": mat("CarBlue", (0.12, 0.25, 0.55), rough=0.3, metal=0.3),
    "silver": mat("CarSilver", (0.62, 0.64, 0.66), rough=0.3, metal=0.5),
    "black": mat("CarBlack", (0.07, 0.07, 0.08), rough=0.3, metal=0.4),
}

# ---------- lit facade: the same cream bay, 4 bays x 4 floors per texture, with an emission map so
# a random share of the windows glow softly at night (the game switches them with the clock) ----------
def lit_pattern(cx, cy):
    return ((cx * 7 + cy * 13 + (cx * cy) * 5) % 10) < 6


def facade_atlas(x, y, s):
    b = s // 4
    return facade(x % b, y % b, b)


def facade_glow(x, y, s):
    b = s // 4
    lx, ly = x % b, y % b
    wx0, wx1, wy0, wy1 = b * 0.22, b * 0.78, b * 0.30, b * 0.80
    inside = wx0 + 3 <= lx <= wx1 - 3 and wy0 + 3 <= ly <= wy1 - 3 and abs(lx - b / 2) >= 2
    if inside and lit_pattern(x // b, y // b):
        k = 0.85 + 0.15 * (ly - wy0) / (wy1 - wy0)
        return (1.0 * k, 0.88 * k, 0.62 * k)
    return (0.0, 0.0, 0.0)


def lit_mat(name, color_img, glow_img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.85
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = color_img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    e = nt.nodes.new("ShaderNodeTexImage")
    e.image = glow_img
    nt.links.new(e.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.0
    return m


facade_lit_m = lit_mat("FacadeLit", texture("facade_lit", 256, facade_atlas), texture("facade_glow", 256, facade_glow))



# ================= LAYOUT (club frame: the club's own coordinates, game x / z) =================
# The club's own paved yard (x -9.6..9.4, z -11.9..11.1, top 0.38) stays as it is. Around it: a kerb, an
# asphalt ring road with a dashed line, cream campus blocks with softly lit windows, parked cars, tree ferns.
# The club's grass discs are hidden by the game (components/club/club-surroundings.tsx).
G = 0.22  # top of the asphalt
YX0, YX1, YZ0, YZ1 = -10.2, 10.0, -12.5, 11.7
box("Asphalt", -40.0, -42.0, 40.0, 40.0, -0.3, G, asphalt_m, tile=(4.0, 4.0))
box("YardBase", YX0, YZ0, YX1, YZ1, -0.05, 0.3, kerb_m)
for i, (a, b, c, d) in enumerate(((YX0 - 0.2, YZ0 - 0.2, YX1 + 0.2, YZ0), (YX0 - 0.2, YZ1, YX1 + 0.2, YZ1 + 0.2),
                                  (YX0 - 0.2, YZ0 - 0.2, YX0, YZ1 + 0.2), (YX1, YZ0 - 0.2, YX1 + 0.2, YZ1 + 0.2))):
    box(f"Kerb{i}", a, b, c, d, G, G + 0.2, kerb_m)
RZ_BACK, RZ_FRONT, RX_LEFT, RX_RIGHT = YZ0 - 6.5, YZ1 + 6.5, YX0 - 6.5, YX1 + 6.5
for i in range(22):
    x = -34 + i * 3.2
    box(f"DashB{i}", x, RZ_BACK - 0.08, x + 1.6, RZ_BACK + 0.08, G, G + 0.02, line_m)
    box(f"DashF{i}", x, RZ_FRONT - 0.08, x + 1.6, RZ_FRONT + 0.08, G, G + 0.02, line_m)
for i in range(22):
    z = -34 + i * 3.2
    box(f"DashR{i}", RX_RIGHT - 0.08, z, RX_RIGHT + 0.08, z + 1.6, G, G + 0.02, line_m)
    box(f"DashL{i}", RX_LEFT - 0.08, z, RX_LEFT + 0.08, z + 1.6, G, G + 0.02, line_m)


def building(tag, x0, z0, x1, z1, floors):
    FH = 3.2
    h = floors * FH
    box(f"{tag}Body", x0, z0, x1, z1, G, G + h, facade_lit_m, tile=(12.8, 12.8))
    box(f"{tag}Roof", x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, G + h, G + h + 0.35, roof_m)
    box(f"{tag}Base", x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, G, G + 0.6, trim_m)
    cx, cz = x0 + (x1 - x0) * 0.3, z0 + (z1 - z0) * 0.4
    box(f"{tag}TankStand", cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6, G + h + 0.35, G + h + 1.2, metal_m)
    cyl(f"{tag}Tank", cx, cz, G + h + 1.2, 1.3, 0.75, metal_m)


building("Back1", -28.0, -35.0, -9.0, -24.0, 4)
building("Back2", 3.0, -36.0, 22.0, -24.5, 3)
building("Right1", 21.0, -14.0, 30.0, 9.0, 5)
building("Right2", 21.5, 12.0, 31.0, 28.0, 3)
building("Left1", -32.0, -12.0, -22.0, 8.0, 4)
building("Front1", -22.0, 25.0, -4.0, 34.0, 3)

def car(tag, cx, cz, along, paint, flip=False):
    G0 = G
    """A low-poly sedan 4.2 x 1.8, long axis along 'x' or 'z', parked at (cx, cz)."""
    L, Wd = 2.1, 0.9
    p = PAINTS[paint]
    if along == 'x':
        bx = (cx - L, cz - Wd, cx + L, cz + Wd)
        cab = (cx - 1.1, cz - Wd + 0.08, cx + 0.95, cz + Wd - 0.08)
        roof = (cx - 0.95, cz - Wd + 0.12, cx + 0.8, cz + Wd - 0.12)
        wheels = [(cx + dx, cz + s * (Wd - 0.05)) for dx in (-1.35, 1.35) for s in (-1, 1)]
        lights = [(cx + L, cz - 0.7, cx + L + 0.04, cz - 0.4), (cx + L, cz + 0.4, cx + L + 0.04, cz + 0.7)]
        tails = [(cx - L - 0.04, cz - 0.7, cx - L, cz - 0.4), (cx - L - 0.04, cz + 0.4, cx - L, cz + 0.7)]
        if flip:
            lights, tails = tails, lights
    else:
        bx = (cx - Wd, cz - L, cx + Wd, cz + L)
        cab = (cx - Wd + 0.08, cz - 1.1, cx + Wd - 0.08, cz + 0.95)
        roof = (cx - Wd + 0.12, cz - 0.95, cx + Wd - 0.12, cz + 0.8)
        wheels = [(cx + s * (Wd - 0.05), cz + dz) for dz in (-1.35, 1.35) for s in (-1, 1)]
        lights = [(cx - 0.7, cz + L, cx - 0.4, cz + L + 0.04), (cx + 0.4, cz + L, cx + 0.7, cz + L + 0.04)]
        tails = [(cx - 0.7, cz - L - 0.04, cx - 0.4, cz - L), (cx + 0.4, cz - L - 0.04, cx + 0.7, cz - L)]
        if flip:
            lights, tails = tails, lights
    box(f"{tag}Body", *bx[:2], *bx[2:], 0.3 + G0, 0.85 + G0, p)
    box(f"{tag}Cabin", cab[0], cab[1], cab[2], cab[3], 0.85 + G0, 1.35 + G0, glass_car_m)
    box(f"{tag}Roof", roof[0], roof[1], roof[2], roof[3], 1.35 + G0, 1.42 + G0, p)
    for k, (wx, wz) in enumerate(wheels):
        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.33, depth=0.24, location=(wx, -wz, 0.33 + G0))
        o = bpy.context.active_object
        o.name = f"{tag}Wheel{k}"
        o.rotation_euler = (math.pi / 2, 0, 0) if along == 'x' else (0, math.pi / 2, 0)
        o.data.materials.append(tyre_m)
        link(o)
    for k, l in enumerate(lights):
        box(f"{tag}Head{k}", l[0], l[1], l[2], l[3], 0.55 + G0, 0.7 + G0, white_top_m)
    for k, l in enumerate(tails):
        box(f"{tag}Tail{k}", l[0], l[1], l[2], l[3], 0.55 + G0, 0.7 + G0, tail_m)



car("CarR1", YX1 + 3.0, -8.0, 'z', "white")
car("CarR2", YX1 + 3.0, 0.5, 'z', "blue", True)
car("CarR3", YX1 + 3.0, 7.5, 'z', "silver")
car("CarB1", -6.0, YZ0 - 3.0, 'x', "red")
car("CarB2", 1.5, YZ0 - 3.0, 'x', "black", True)
car("CarB3", 8.5, YZ0 - 3.0, 'x', "white")
car("CarL1", YX0 - 3.0, -2.0, 'z', "silver", True)
car("CarF1", -3.0, YZ1 + 3.0, 'x', "blue")

# Tree ferns (scripts/blender/assets/tree-fern.glb): one mesh, instanced round the courtyard
FERN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "tree-fern.glb")
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=FERN)
parts = [o for o in bpy.data.objects if o not in before]
part_names = [o.name for o in parts]
meshes = [o for o in parts if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
fern = bpy.context.active_object
for n in part_names:
    if n != fern.name and n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
link(fern)
fern.name = "Fern_0"
ferns = []
for i, (x, z, sc) in enumerate(((-14.0, -16.0, 0.6), (13.5, -16.0, 0.55), (14.0, 14.5, 0.6), (-14.0, 14.5, 0.55), (-14.0, 1.0, 0.5), (-4.0, -16.0, 0.52))):
    o = fern if i == 0 else link(fern.copy())
    o.name = f"Fern_{i}"
    o.location = (x, -z, G)
    o.scale = (sc, sc, sc)
    o.rotation_euler = (0, 0, i * 1.3)
    ferns.append(o)

# ---------- bake transforms, box-UV the tiled pieces, join per material (ferns stay instanced) ----------
chair_set = set(ferns)
rest = [o for o in col.objects if o not in chair_set]
bpy.ops.object.select_all(action='DESELECT')
for o in rest:
    o.select_set(True)
bpy.context.view_layer.objects.active = rest[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in rest:
    if o.name in TILED:
        boxuv(o, TILED[o.name])
groups = {}
for o in rest:
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

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False)
print("EXPORTED", OUT, len(col.objects), "objects")
