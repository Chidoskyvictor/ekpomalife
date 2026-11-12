"""
Magmus Autos: the car showroom, standing in the SAME courtyard as the Innovation Hub (reused from
scripts/blender/innovation-hub.py: its paving, kerbs, ring road, lit cream campus blocks, parked cars and
tree ferns), fitted round the bigger showroom floor. -> public/models/magmus-autos.glb
Headless:  blender -b --factory-startup -P scripts/blender/magmus-autos.py -- <out.glb> <tmp dir>
(then: npx gltf-transform meshopt <out.glb> public/models/magmus-autos.glb)

The cars on display are drawn by the game on the bays in lib/game/autos-room.ts; keep the floor
(game x -10..10, z -7..7) and those bays empty. Walls on game -z and +x where the room camera expects them.
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

# ================= SHOWROOM (Magmus Autos) =================
W, D, H = 20.0, 14.0, 4.2

def amat(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
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




def abox(name, center, size, m, rot_z=0.0):
    """center / size in GAME axes (x, y up, z); converted to Blender (x, -z, y)."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    o.location = (center[0], -center[2], center[1])
    o.rotation_euler[2] = rot_z
    o.data.materials.append(m)
    return link(o)


def acyl(name, center, radius, height, m, verts=18):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=height,
                                        location=(center[0], -center[2], center[1]))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


TILE = amat("Tile", (0.78, 0.79, 0.80), 0.25)
TILE_DARK = amat("TileDark", (0.36, 0.38, 0.41), 0.3)
LATERITE = amat("Laterite", (0.62, 0.36, 0.22), 0.95)
WALL = amat("Wall", (0.93, 0.89, 0.78), 0.8)
BLUE = amat("Blue", (0.10, 0.25, 0.72), 0.5)
GREEN = amat("Green", (0.10, 0.42, 0.24), 0.6)
YELLOW = amat("Yellow", (0.95, 0.74, 0.08), 0.5)
RED = amat("Red", (0.80, 0.10, 0.18), 0.5)
WHITE = amat("White", (0.96, 0.96, 0.94), 0.5)
WOOD = amat("Wood", (0.40, 0.24, 0.12), 0.6)
STEEL = amat("Steel", (0.75, 0.77, 0.80), 0.35, 0.8)
RUBBER = amat("Rubber", (0.05, 0.05, 0.06), 0.9)
GLASS = amat("Glass", (0.55, 0.78, 0.88), 0.1, 0.2)
LEAF = amat("Leaf", (0.13, 0.45, 0.20), 0.8)
POT = amat("Pot", (0.55, 0.30, 0.18), 0.8)
LIGHT = amat("Light", (1.0, 0.97, 0.88), 0.4, emit=(1.0, 0.95, 0.8), strength=2.0)

hw, hd = W / 2, D / 2

# Ground outside, then the showroom floor with a dark border
abox("FloorEdge", (0, 0.0, 0), (W, 0.06, D), TILE_DARK)
abox("Floor", (0, 0.02, 0), (W - 0.5, 0.06, D - 0.5), TILE)

# Back wall (-z) and right wall (+x), a blue band and a yellow pinstripe along both
abox("BackWall", (0, H / 2, -hd - 0.1), (W + 0.4, H, 0.2), WALL)
abox("RightWall", (hw + 0.1, H / 2, 0), (0.2, H, D + 0.4), WALL)
abox("BandBack", (0, 3.1, -hd + 0.02), (W, 0.6, 0.05), BLUE)
abox("PinBack", (0, 2.72, -hd + 0.02), (W, 0.08, 0.06), YELLOW)
abox("BandRight", (hw - 0.02, 3.1, 0), (0.05, 0.6, D), BLUE)
abox("PinRight", (hw - 0.02, 2.72, 0), (0.06, 0.08, D), YELLOW)
# Signboard on the back wall, lit strip above it
abox("Sign", (0, 3.1, -hd + 0.06), (6.4, 0.9, 0.08), WHITE)
abox("SignBar", (0, 3.1, -hd + 0.11), (5.6, 0.14, 0.04), RED)
abox("SignLight", (0, 3.75, -hd + 0.2), (6.6, 0.08, 0.2), LIGHT)
# Windows in the right wall
for z in (-4.2, -0.6, 3.0):
    abox("Window", (hw - 0.03, 1.6, z), (0.06, 1.5, 2.6), GLASS)
    abox("WindowSill", (hw - 0.06, 0.82, z), (0.12, 0.08, 2.8), STEEL)

# Display bays: four at the back facing the front, three out front turned to the door.
# Keep in step with lib/game/autos-room.ts (AUTOS_BAYS).
BACK = [(-7.0, -3.8), (-3.0, -3.8), (1.0, -3.8), (5.0, -3.8)]
FRONT = [(-6.0, 3.6), (-1.0, 3.6), (4.0, 3.6)]
for i, (x, z) in enumerate(BACK):
    abox("Bay", (x, 0.1, z), (2.9, 0.12, 5.6), TILE_DARK)
    abox("BayStripe", (x, 0.165, z + 2.7), (2.9, 0.02, 0.12), YELLOW)
    abox("PriceStand", (x + 1.25, 0.6, z + 2.95), (0.06, 1.0, 0.06), STEEL)
    abox("PriceCard", (x + 1.25, 1.15, z + 2.95), (0.5, 0.34, 0.04), WHITE)
for i, (x, z) in enumerate(FRONT):
    abox("Bay", (x, 0.1, z), (2.9, 0.12, 5.6), TILE_DARK, rot_z=-0.35)
    abox("PriceStand", (x + 1.9, 0.6, z + 2.3), (0.06, 1.0, 0.06), STEEL)
    abox("PriceCard", (x + 1.9, 1.15, z + 2.3), (0.5, 0.34, 0.04), WHITE)

# Roof beams and strip lights over the back row (the "shade")
for x in (-9.0, -5.0, -1.0, 3.0, 7.0):
    abox("Post", (x, H / 2, -6.4), (0.14, H, 0.14), STEEL)
abox("Beam", (-1.0, H - 0.1, -6.4), (16.2, 0.16, 0.16), STEEL)
for x in (-7.0, -3.0, 1.0, 5.0):
    abox("Rafter", (x, H - 0.1, -3.8), (0.1, 0.12, 5.4), STEEL)
    abox("Tube", (x, H - 0.22, -3.8), (0.12, 0.06, 3.0), LIGHT)

# Sales desk by the right wall, with two visitor chairs and a monitor
abox("DeskTop", (8.6, 0.78, 0.2), (1.2, 0.08, 2.6), WOOD)
abox("DeskFront", (8.05, 0.4, 0.2), (0.08, 0.76, 2.6), BLUE)
abox("DeskSide", (8.6, 0.4, -1.06), (1.2, 0.76, 0.08), WOOD)
abox("DeskSide", (8.6, 0.4, 1.46), (1.2, 0.76, 0.08), WOOD)
abox("Monitor", (8.8, 1.1, 0.2), (0.06, 0.4, 0.6), RUBBER)
abox("MonitorFoot", (8.8, 0.86, 0.2), (0.2, 0.08, 0.2), RUBBER)
abox("StaffChair", (9.45, 0.45, 0.2), (0.5, 0.1, 0.5), RUBBER)
abox("StaffChairBack", (9.68, 0.8, 0.2), (0.08, 0.7, 0.5), RUBBER)
for z in (-0.5, 0.9):
    abox("Chair", (7.3, 0.42, z), (0.5, 0.08, 0.5), RED)
    abox("ChairBack", (7.08, 0.75, z), (0.06, 0.6, 0.5), RED)
    for dx in (-0.2, 0.2):
        for dz in (-0.2, 0.2):
            abox("ChairLeg", (7.3 + dx, 0.2, z + dz), (0.04, 0.4, 0.04), STEEL)
# Key board behind the desk
abox("KeyBoard", (hw - 0.05, 1.7, -2.0), (0.06, 0.8, 1.2), WOOD)
for i in range(7):
    abox("Key", (hw - 0.1, 1.9 - (i // 4) * 0.3, -2.45 + (i % 4) * 0.3), (0.03, 0.14, 0.06), YELLOW)

# Tyre stacks, potted palms, a jerrycan-style oil drum
for (x, z) in ((-9.3, -6.3), (-9.3, 0.4), (9.2, 5.9)):
    for k in range(3):
        acyl("Tyre", (x, 0.14 + k * 0.24, z), 0.36, 0.22, RUBBER)
for (x, z) in ((9.2, -6.2), (-9.2, 6.1), (6.6, 6.2)):
    acyl("PlantPot", (x, 0.25, z), 0.3, 0.5, POT, 12)
    for a in range(5):
        ang = a * math.tau / 5
        abox("Leaf", (x + math.cos(ang) * 0.35, 1.0, z + math.sin(ang) * 0.35), (0.14, 1.0, 0.5), LEAF, rot_z=-ang)
acyl("Drum", (-9.2, 0.45, 3.2), 0.32, 0.9, BLUE, 14)

# Bunting along the open front and feather flags beside it
PENNANTS = [RED, YELLOW, BLUE, GREEN, WHITE]
for z in (6.6,):
    abox("String", (0, 3.55, z), (W, 0.02, 0.02), RUBBER)
    n = 26
    for i in range(n):
        x = -hw + 0.5 + i * (W - 1.0) / (n - 1)
        abox("Pennant", (x, 3.36, z), (0.3, 0.36, 0.02), PENNANTS[i % len(PENNANTS)])
for x in (-9.4, -3.6, 1.6, 7.0):
    abox("FlagPole", (x, 1.7, 6.75), (0.06, 3.4, 0.06), STEEL)
    abox("FlagGreenTop", (x + 0.33, 2.95, 6.75), (0.6, 0.7, 0.03), GREEN)
    abox("FlagWhite", (x + 0.33, 2.25, 6.75), (0.6, 0.7, 0.03), WHITE)
    abox("FlagGreenLow", (x + 0.33, 1.55, 6.75), (0.6, 0.7, 0.03), GREEN)


# The courtyard is laid round the showroom floor
HX0, HX1, HZ0, HZ1 = -10.0, 10.0, -7.0, 7.0

# ================= OUTSIDE: same paving, road, cream blocks and ferns as the Conference courtyard =================
OX0, OX1, OZ0, OZ1 = -32.0, 34.0, -30.0, 30.0
box("Paving", HX0 - 3, HZ0 - 3, HX1 + 3, HZ1 + 3, -0.17, -0.02, paving_m, tile=(2.0, 2.0))
box("Asphalt", OX0, OZ0, OX1, OZ1, -0.2, -0.05, asphalt_m, tile=(4.0, 4.0))
for i, (a, b, c, d) in enumerate(((HX0 - 3.2, HZ0 - 3.2, HX1 + 3.2, HZ0 - 3.0), (HX0 - 3.2, HZ1 + 3.0, HX1 + 3.2, HZ1 + 3.2),
                                  (HX0 - 3.2, HZ0 - 3.2, HX0 - 3.0, HZ1 + 3.2), (HX1 + 3.0, HZ0 - 3.2, HX1 + 3.2, HZ1 + 3.2))):
    box(f"Kerb{i}", a, b, c, d, -0.05, 0.08, kerb_m)
RZ_BACK, RX_RIGHT = HZ0 - 8.0, HX1 + 8.0
for i in range(15):
    x = -22 + i * 3.2
    box(f"DashB{i}", x, RZ_BACK - 0.08, x + 1.6, RZ_BACK + 0.08, -0.05, -0.03, line_m)
for i in range(13):
    z = -22 + i * 3.2
    box(f"DashR{i}", RX_RIGHT - 0.08, z, RX_RIGHT + 0.08, z + 1.6, -0.05, -0.03, line_m)


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


# different blocks from the Conference hall's, same cream facades
building("Science", -20.0, -28.0, -2.0, -18.5, 4, "MECHANIC VILLAGE", '+z')
building("Ict", 21.5, -12.0, 30.0, 10.0, 5, "AUTO PLAZA", '-x')
building("Lecture", 2.0, -28.0, 20.0, -19.0, 3, "SPARE PARTS", '+z')
building("Annex", -28.0, -10.0, -19.0, 8.0, 4)


# ---------- parked cars along the kerbs of the ring road ----------
def car(tag, cx, cz, along, paint, flip=False):
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
    box(f"{tag}Body", *bx[:2], *bx[2:], 0.3, 0.85, p)
    box(f"{tag}Cabin", cab[0], cab[1], cab[2], cab[3], 0.85, 1.35, glass_car_m)
    box(f"{tag}Roof", roof[0], roof[1], roof[2], roof[3], 1.35, 1.42, p)
    for k, (wx, wz) in enumerate(wheels):
        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.33, depth=0.24, location=(wx, -wz, 0.33))
        o = bpy.context.active_object
        o.name = f"{tag}Wheel{k}"
        o.rotation_euler = (math.pi / 2, 0, 0) if along == 'x' else (0, math.pi / 2, 0)
        o.data.materials.append(tyre_m)
        link(o)
    for k, l in enumerate(lights):
        box(f"{tag}Head{k}", l[0], l[1], l[2], l[3], 0.55, 0.7, white_top_m)
    for k, l in enumerate(tails):
        box(f"{tag}Tail{k}", l[0], l[1], l[2], l[3], 0.55, 0.7, tail_m)


# lined up at the kerb, as if the hub's visitors parked there (right side and back are what the camera sees)
car("CarR1", HX1 + 5.0, -2.0, 'z', "white")
car("CarR2", HX1 + 5.0, 3.2, 'z', "blue", True)
car("CarR3", HX1 + 5.0, 8.0, 'z', "silver")
car("CarB1", -7.5, HZ0 - 5.0, 'x', "red")
car("CarB2", -1.5, HZ0 - 5.0, 'x', "black", True)
car("CarB3", 5.5, HZ0 - 5.0, 'x', "white")
car("CarF1", -2.0, HZ1 + 5.0, 'x', "silver")
car("CarL1", HX0 - 4.5, 1.0, 'z', "blue")

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
for i, (x, z, sc) in enumerate(((HX0 - 1.8, HZ0 - 1.8, 0.6), (-2.0, HZ0 - 1.8, 0.52), (HX1 + 1.8, HZ0 - 1.8, 0.6),
                                (HX1 + 1.8, 0.5, 0.55), (HX0 - 1.8, 0.0, 0.58), (HX0 - 1.8, HZ1 + 1.8, 0.5),
                                (HX1 + 1.8, HZ1 + 1.8, 0.55), (3.0, HZ1 + 1.8, 0.5))):
    o = fern if i == 0 else link(fern.copy())
    o.name = f"Fern_{i}"
    o.location = (x, -z, 0)
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
