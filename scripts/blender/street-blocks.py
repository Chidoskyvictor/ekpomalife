"""
Street blocks: the Innovation Hub courtyard's cream campus blocks (same lit facade texture, roofs,
water tanks and sign boards, from scripts/blender/innovation-hub.py), in a row for the street outside
your home. Fronts face +z; the game turns the row to face the road. -> public/models/street-blocks.glb
Headless:  blender -b --factory-startup -P scripts/blender/street-blocks.py -- <out.glb> <tmp dir>
(then: npx gltf-transform meshopt <out.glb> public/models/street-blocks.glb)
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


# ================= extra textures + materials for the hub =================
def porcelain(x, y, s):
    # big white porcelain tiles (2 x 2 per texture), thin light-grey grout, a faint grey veining
    t = s // 2
    if x % t < 2 or y % t < 2:
        return (0.70, 0.70, 0.69)
    k = (x // t) * 3 + (y // t)
    vein = 0.012 * math.sin(x * 0.09 + y * 0.05 + k * 2.3) + 0.01 * math.sin(x * 0.02 - y * 0.06 + k)
    n = noise(0.012)
    v = 0.93 + vein + n
    return (v, v, v - 0.005)


def plaster(x, y, s):
    n = noise(0.02)
    return (0.93 + n, 0.92 + n, 0.89 + n)


def slats(x, y, s):
    # vertical oak slats with dark gaps
    pw = s // 8
    k = x // pw
    if x % pw < 3:
        return (0.12, 0.08, 0.05)
    tone = 0.8 + ((k * 37) % 9) / 45
    g = 0.03 * math.sin(y * 0.2 + k)
    n = noise(0.03)
    return ((0.72 + g + n) * tone, (0.52 + g + n) * tone, (0.31 + n) * tone)


def rug(x, y, s):
    n = noise(0.05)
    edge = 0.8 if (x < 5 or y < 5 or x > s - 6 or y > s - 6) else 1.0
    band = 0.06 if (x % 32 < 16) ^ (y % 32 < 16) else 0.0
    return ((0.20 + band * 0.4 + n * 0.4) * edge, (0.33 + band + n * 0.4) * edge, (0.38 + band + n * 0.4) * edge)


def mesh_fabric(x, y, s):
    n = noise(0.04)
    v = 0.14 + (0.03 if (x + y) % 3 == 0 else 0.0) + n
    return (v, v + 0.005, v + 0.01)


ptile_m = mat("OfficeTile", img=texture("porcelain", 128, porcelain), rough=0.12)
plaster_m = mat("OfficeWall", img=texture("plaster", 64, plaster), rough=0.9)
slat_m = mat("OakSlats", img=texture("slats", 64, slats), rough=0.55)
rug_m = mat("LoungeRug", img=texture("rug", 64, rug), rough=0.95)
mesh_m = mat("MeshChair", img=texture("meshfab", 32, mesh_fabric), rough=0.85)
sofa_m = mat("SofaFabric", (0.10, 0.27, 0.32), rough=0.9)
sofa2_m = mat("SofaAccent", (0.88, 0.55, 0.18), rough=0.9)
charcoal_m = mat("Charcoal", (0.10, 0.12, 0.13), rough=0.6)
teal_m = mat("BrandTeal", (0.05, 0.36, 0.40), rough=0.6)
oak_m = mat("Oak", (0.62, 0.43, 0.24), rough=0.5)
white_top_m = mat("DeskWhite", (0.96, 0.96, 0.94), rough=0.35)
marble_m = mat("Marble", (0.90, 0.90, 0.88), rough=0.2)
glass_m = mat("ClassWindowGlow", (0.62, 0.78, 0.88), rough=0.1)   # lit from inside at night
frame_m = mat("WindowFrame", (0.13, 0.14, 0.15), rough=0.4, metal=0.6)
laptop_m = mat("Laptop", (0.55, 0.57, 0.60), rough=0.3, metal=0.8)
screen_blue_m = mat("WallScreen", (0.05, 0.16, 0.38), rough=0.3, emit=(0.04, 0.12, 0.30))
chrome_m = mat("Chrome", (0.75, 0.76, 0.78), rough=0.2, metal=0.9)
monitor_m = mat("Monitor", (0.02, 0.03, 0.05), rough=0.25, emit=(0.02, 0.05, 0.09))
bulb_m = mat("LampBulb", (1.0, 0.85, 0.6), rough=0.4, emit=(1.0, 0.72, 0.4))
led_m = mat("ClassTube", (0.93, 0.96, 1.0), rough=0.3, emit=(0.8, 0.9, 1.0))
art1_m = mat("ArtOrange", (0.90, 0.45, 0.15), rough=0.7)
art2_m = mat("ArtBlue", (0.15, 0.40, 0.70), rough=0.7)
art3_m = mat("ArtYellow", (0.95, 0.78, 0.20), rough=0.7)
pot2_m = mat("PlanterGrey", (0.30, 0.31, 0.32), rough=0.6)
leaf2_m = mat("LeafDark", (0.12, 0.40, 0.18), rough=0.8)
tyre_m = mat("Tyre", (0.05, 0.05, 0.06), rough=0.8)
glass_car_m = mat("CarGlass", (0.14, 0.20, 0.26), rough=0.15)
tail_m = mat("TailLight", (0.8, 0.08, 0.06), rough=0.4, emit=(0.5, 0.04, 0.02))
PAINTS = {
    "white": mat("CarWhite", (0.92, 0.92, 0.90), rough=0.3, metal=0.3),
    "red": mat("CarRed", (0.62, 0.10, 0.10), rough=0.3, metal=0.3),
    "blue": mat("CarBlue", (0.12, 0.25, 0.55), rough=0.3, metal=0.3),
    "silver": mat("CarSilver", (0.62, 0.64, 0.66), rough=0.3, metal=0.5),
    "black": mat("CarBlack", (0.07, 0.07, 0.08), rough=0.3, metal=0.4),
}


# ================= the hub courtyard's blocks =================
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


def building(tag, x0, z0, x1, z1, floors, sign=None, face='+z'):
    FH = 3.2
    h = floors * FH
    box(f"{tag}Body", x0, z0, x1, z1, 0.0, h, facade_lit_m, tile=(12.8, 12.8))
    box(f"{tag}Roof", x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, h + 0.35, roof_m)
    box(f"{tag}Base", x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, 0.0, 0.6, trim_m)
    cx, cz = x0 + (x1 - x0) * 0.3, z0 + (z1 - z0) * 0.4
    box(f"{tag}TankStand", cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6, h + 0.35, h + 1.2, metal_m)
    cyl(f"{tag}Tank", cx, cz, h + 1.2, 1.3, 0.75, metal_m)
    if sign:
        if face == '+z':
            sx = (x0 + x1) / 2
            w = min(x1 - x0 - 1, len(sign) * 0.95)
            box(f"{tag}SignBoard", sx - w / 2, z1 - 0.5, sx + w / 2, z1 - 0.3, h + 0.9, h + 2.6, signbg_m)
            box(f"{tag}SignTrim", sx - w / 2 - 0.1, z1 - 0.52, sx + w / 2 + 0.1, z1 - 0.28, h + 2.6, h + 2.75, gold_m)
            text(f"{tag}SignText", sign, sx, h + 1.75, z1 - 0.27, 1.05, white_m, '+z', 0.05)
        else:
            sz = (z0 + z1) / 2
            w = min(z1 - z0 - 1, len(sign) * 0.95)
            box(f"{tag}SignBoard", x0 + 0.3, sz - w / 2, x0 + 0.5, sz + w / 2, h + 0.9, h + 2.6, signbg_m)
            box(f"{tag}SignTrim", x0 + 0.28, sz - w / 2 - 0.1, x0 + 0.52, sz + w / 2 + 0.1, h + 2.6, h + 2.75, gold_m)
            text(f"{tag}SignText", sign, x0 + 0.27, h + 1.75, sz, 1.05, white_m, '-x', 0.05)



# A row of blocks along the street (x), fronts at z = 0 facing +z, with small gaps between
ROW = [
    ("BlockA", 9.0, 3, "MAMA T STORES"),
    ("BlockB", 12.0, 4, None),
    ("BlockC", 8.0, 2, "PHONE PLUS"),
    ("BlockD", 11.0, 3, None),
    ("BlockE", 9.5, 4, "JOY PHARMACY"),
    ("BlockF", 10.0, 3, None),
]
total = sum(w for _, w, _, _ in ROW) + 1.2 * (len(ROW) - 1)
x = -total / 2
for tag, w, floors, sign in ROW:
    building(tag, x, -8.0, x + w, 0.0, floors, sign, '+z')
    x += w + 1.2

# ---------- bake, box-UV the tiled pieces, one mesh per material ----------
objs = [o for o in col.objects]
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in objs:
    if o.name in TILED:
        boxuv(o, TILED[o.name])
for o in list(col.objects):
    if o.type == 'FONT':
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target='MESH')
groups = {}
for o in col.objects:
    if o.type == 'MESH' and o.data.materials:
        groups.setdefault(o.data.materials[0].name, []).append(o)
for name, os_ in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in os_:
        o.select_set(True)
    bpy.context.view_layer.objects.active = os_[0]
    if len(os_) > 1:
        bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = name
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False)
print("EXPORTED", OUT)
