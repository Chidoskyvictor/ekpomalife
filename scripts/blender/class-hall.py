"""
Class hall (every lecture hall / class uses it): a lecture room with a grey terrazzo floor, cream
walls over a painted dado (the hall's own colour, swapped at runtime: materials Wall.001 / Wall),
a white marker board on a low platform, the lecturer's table, chair and lectern, louvre windows and
fluorescent tubes that light up at night (ClassWindowGlow / ClassTube), and separate red-painted wooden chairs
with writing arms. Outside: ring road, cement-grey interlocking pavers, white campus blocks with
two blank sign boards (SignBoard0 faces +z, SignBoard1 faces -x) that the game writes the
neighbouring halls' names on. -> public/models/class-hall.glb
Headless:  blender -b --factory-startup -P scripts/blender/class-hall.py -- <out.glb> <tmp dir>

GAME coordinates: game (x, y, z) = Blender (x, -y, z). Walls at game -z (board) and +x.
Room floor x -7..6, z -6..6. Keep in sync with lib/game/class-hall.ts.
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



def terrazzo(x, y, s):
    # grey terrazzo: speckles of white, black and rust in a mid-grey cement
    r = random.random()
    if r < 0.05:
        return (0.92, 0.91, 0.88)
    if r < 0.08:
        return (0.18, 0.18, 0.19)
    if r < 0.095:
        return (0.55, 0.36, 0.28)
    n = noise(0.04)
    joint = 0.85 if (x % (s // 2) < 1 or y % (s // 2) < 1) else 1.0
    return ((0.58 + n) * joint, (0.58 + n) * joint, (0.56 + n) * joint)


def cement_pavers(x, y, s):
    # interlocking herringbone in plain cement greys
    u = s // 8
    bx, by = x // u, y // u
    k = (bx + by) % 4
    if k < 2:
        sx = (x - (k * u)) % (2 * u)
        edge = sx < 2 or (y % u) < 2
        bid = ((x - k * u) // (2 * u), by)
    else:
        sy = (y - ((k - 2) * u)) % (2 * u)
        edge = sy < 2 or (x % u) < 2
        bid = (bx, (y - (k - 2) * u) // (2 * u))
    if edge:
        return (0.36, 0.36, 0.35)
    h = (bid[0] * 73 + bid[1] * 151) % 7
    shade = 0.60 + (h % 4) * 0.03
    n = noise(0.04)
    return (shade + n, shade + n, shade - 0.01 + n)


def white_facade(x, y, s):
    # one bay of a white block: dark window with a charcoal frame and sill
    n = noise(0.02)
    wx0, wx1, wy0, wy1 = s * 0.2, s * 0.8, s * 0.28, s * 0.82
    if wx0 <= x <= wx1 and wy0 <= y <= wy1:
        if abs(x - s / 2) < 2 or x - wx0 < 3 or wx1 - x < 3 or y - wy0 < 3 or wy1 - y < 3:
            return (0.16, 0.16, 0.17)
        g = 0.20 + (y - wy0) / (wy1 - wy0) * 0.12
        return (g + n, g + 0.03 + n, g + 0.06 + n)
    if wy0 - 5 <= y < wy0 and wx0 - 3 <= x <= wx1 + 3:
        return (0.22, 0.22, 0.23)
    return (0.94 + n, 0.94 + n, 0.93 + n)


def wood_grain(x, y, s):
    n = noise(0.04)
    # straight grain running along the board, a few darker lines
    g = 0.035 * math.sin(x * 0.9 + math.sin(y * 0.04) * 1.5) + (-0.05 if x % 11 == 0 else 0)
    return (0.52 + g + n * 0.5, 0.33 + g * 0.8 + n * 0.5, 0.18 + g * 0.5)


def marker_board(x, y, s):
    # white marker board with faint grey wipe marks
    n = noise(0.012)
    wipe = 0.025 * max(0.0, math.sin(x * 0.04 + y * 0.02)) * max(0.0, math.sin(y * 0.07))
    return (0.95 - wipe + n, 0.96 - wipe + n, 0.97 - wipe + n)


def red_paint(x, y, s):
    # red painted chair wood: the grain still shows a little through the paint
    n = noise(0.03)
    g = 0.03 * math.sin(x * 0.9 + math.sin(y * 0.04) * 1.5)
    return (0.62 + g + n, 0.08 + g * 0.3 + n * 0.3, 0.08 + n * 0.3)


def asphalt(x, y, s):
    n = noise(0.08) + (0.05 if random.random() < 0.03 else 0)
    return (0.20 + n, 0.20 + n, 0.21 + n)


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
terrazzo_m = mat("Terrazzo", img=texture("terrazzo", S, terrazzo), rough=0.3)
pavers_m = mat("CementPavers", img=texture("cementpavers", 128, cement_pavers), rough=0.9)
facade_m = mat("WhiteFacade", img=texture("whitefacade", 64, white_facade), rough=0.85)
asphalt_m = mat("Asphalt", img=texture("asphalt", 64, asphalt), rough=0.95)
wood_m = mat("ChairRed", img=texture("chairred", 64, red_paint), rough=0.45)
chalk_m = mat("MarkerBoard", img=texture("markerboard", 64, marker_board), rough=0.2)
alu_m = mat("BoardAlu", (0.75, 0.76, 0.78), rough=0.3, metal=0.8)
marker_m = mat("Markers", (0.10, 0.25, 0.70), rough=0.4)
plaster_m = mat("ClassPlaster", (0.92, 0.90, 0.84), rough=0.9)
paint_full = mat("Wall.001", (0.30, 0.45, 0.60), rough=0.8)   # window-wall dado (the hall colour)
paint_shade = mat("Wall", (0.26, 0.40, 0.54), rough=0.8)      # board-wall dado (a shade darker)
metal_m = mat("ChairMetal", (0.14, 0.14, 0.15), rough=0.4, metal=0.7)
frame_m = mat("WindowFrame", (0.85, 0.85, 0.82), rough=0.6)
glass_m = mat("ClassWindowGlow", (0.55, 0.68, 0.75), rough=0.15)
tube_m = mat("ClassTube", (0.93, 0.96, 1.0), rough=0.3)
tubebox_m = mat("TubeFitting", (0.82, 0.83, 0.82), rough=0.5, metal=0.3)
timber_m = mat("TeacherWood", (0.36, 0.22, 0.12), rough=0.55)
cork_m = mat("NoticeCork", (0.62, 0.45, 0.28), rough=0.95)
paper_m = mat("NoticePaper", (0.96, 0.95, 0.90), rough=0.8)
trim_m = mat("Charcoal", (0.17, 0.17, 0.18), rough=0.7)
roof_m = mat("Roof", (0.55, 0.55, 0.54), rough=0.9)
line_m = mat("RoadLine", (0.95, 0.93, 0.85), rough=0.7)
kerb_m = mat("Kerb", (0.80, 0.80, 0.78), rough=0.9)
step_m = mat("PlatformEdge", (0.45, 0.45, 0.44), rough=0.6)
fan_m = mat("FanWhite", (0.90, 0.90, 0.88), rough=0.5)
sign0_m = mat("SignBlank0", (0.10, 0.20, 0.38), rough=0.6)
sign1_m = mat("SignBlank1", (0.10, 0.20, 0.38), rough=0.6)

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


# ================= CLASS ROOM =================
HX0, HX1, HZ0, HZ1 = -7.0, 6.0, -6.0, 6.0
WH = 3.4
DADO = 1.2
box("Floor", HX0, HZ0, HX1, HZ1, -0.15, 0.0, terrazzo_m, tile=(2.0, 2.0))
# board wall (-z) and window wall (+x): painted dado, cream plaster above, charcoal skirting
box("BoardDado", HX0 - 0.2, HZ0 - 0.25, HX1 + 0.25, HZ0, 0.0, DADO, paint_shade)
box("BoardWall", HX0 - 0.2, HZ0 - 0.25, HX1 + 0.25, HZ0, DADO, WH, plaster_m)
box("SideDado", HX1, HZ0 - 0.25, HX1 + 0.25, HZ1, 0.0, DADO, paint_full)
box("SidePlasterLow", HX1, HZ0 - 0.25, HX1 + 0.25, HZ1, DADO, 1.3, plaster_m)
box("SidePlasterTop", HX1, HZ0 - 0.25, HX1 + 0.25, HZ1, 2.7, WH, plaster_m)
box("Skirt", HX0 - 0.2, HZ0 - 0.02, HX1 + 0.02, HZ0 + 0.03, 0.0, 0.12, trim_m)
box("Skirt2", HX1 - 0.03, HZ0, HX1 + 0.02, HZ1, 0.0, 0.12, trim_m)
box("SillFront", HX0 - 0.2, HZ1, HX1 + 0.25, HZ1 + 0.2, 0.0, 0.3, plaster_m)
box("SillLeft", HX0 - 0.2, HZ0 - 0.25, HX0, HZ1 + 0.2, 0.0, 0.3, plaster_m)

# louvre windows in the +x wall between 1.3 and 2.7 m: glass that glows at night, slats, frame
WIN = [(-4.4, -2.2), (-0.8, 1.4), (2.8, 5.0)]
piers = [HZ0 - 0.25] + [v for w in WIN for v in w] + [HZ1]
for i in range(0, len(piers), 2):
    box(f"Pier{i}", HX1, piers[i], HX1 + 0.25, piers[i + 1], 1.3, 2.7, plaster_m)
for i, (z0, z1) in enumerate(WIN):
    box(f"Glass{i}", HX1 + 0.08, z0, HX1 + 0.12, z1, 1.3, 2.7, glass_m)
    for k in range(9):
        y = 1.38 + k * 0.15
        box(f"Slat{i}_{k}", HX1 - 0.02, z0 + 0.05, HX1 + 0.04, z1 - 0.05, y, y + 0.05, frame_m)
    box(f"FrameT{i}", HX1 - 0.04, z0 - 0.06, HX1 + 0.06, z1 + 0.06, 2.68, 2.76, frame_m)
    box(f"FrameB{i}", HX1 - 0.06, z0 - 0.06, HX1 + 0.06, z1 + 0.06, 1.24, 1.32, frame_m)

# fluorescent tubes, up high on the board wall and the window wall
for i, x in enumerate((-5.2, -2.0, 1.2, 4.2)):
    box(f"TubeBox{i}", x - 0.65, HZ0, x + 0.65, HZ0 + 0.1, 3.0, 3.12, tubebox_m)
    box(f"Tube{i}", x - 0.6, HZ0 + 0.1, x + 0.6, HZ0 + 0.16, 3.0, 3.06, tube_m)
for i, z in enumerate((-3.3, 0.3, 3.9)):
    box(f"TubeBoxS{i}", HX1 - 0.1, z - 0.65, HX1, z + 0.65, 3.0, 3.12, tubebox_m)
    box(f"TubeS{i}", HX1 - 0.16, z - 0.6, HX1 - 0.1, z + 0.6, 3.0, 3.06, tube_m)

# low platform with the chalkboard behind
PY = 0.22
box("Platform", -5.6, HZ0, 4.6, -4.3, 0.0, PY, terrazzo_m, tile=(2.0, 2.0))
box("PlatformNose", -5.6, -4.33, 4.6, -4.27, 0.0, PY + 0.01, step_m)
box("BoardFrame", -4.2, HZ0, 3.2, HZ0 + 0.06, 1.0, 2.75, alu_m)
box("Board", -4.12, HZ0 + 0.06, 3.12, HZ0 + 0.08, 1.06, 2.69, chalk_m)
box("MarkerTray", -4.1, HZ0 + 0.06, 3.1, HZ0 + 0.18, 0.98, 1.02, alu_m)
for i, x in enumerate((-3.6, -3.4, -3.25)):
    box(f"Marker{i}", x - 0.07, HZ0 + 0.1, x + 0.07, HZ0 + 0.13, 1.02, 1.045, marker_m)
# the lecturer's table, chair and lectern
box("DeskTop", -1.6, -5.4, 0.4, -4.6, PY + 0.74, PY + 0.78, timber_m)
box("DeskFront", -1.6, -4.66, 0.4, -4.6, PY + 0.2, PY + 0.74, timber_m)
for i, (x, z) in enumerate(((-1.55, -5.35), (0.35, -5.35))):
    box(f"DeskLeg{i}", x - 0.03, z - 0.03, x + 0.03, z + 0.03, PY, PY + 0.74, timber_m)
box("TeacherSeat", -0.85, -5.75, -0.35, -5.3, PY + 0.44, PY + 0.5, timber_m)
box("TeacherBack", -0.85, -5.8, -0.35, -5.75, PY + 0.5, PY + 1.0, timber_m)
for i, (x, z) in enumerate(((-0.82, -5.72), (-0.38, -5.72), (-0.82, -5.33), (-0.38, -5.33))):
    box(f"TeacherLeg{i}", x - 0.02, z - 0.02, x + 0.02, z + 0.02, PY, PY + 0.44, metal_m)
box("Lectern", 2.0, -5.0, 2.6, -4.6, PY, PY + 1.05, timber_m)
box("LecternTop", 1.95, -5.05, 2.65, -4.5, PY + 1.05, PY + 1.12, timber_m)
# notice board and a wall fan
box("Notice", 4.0, HZ0, 5.6, HZ0 + 0.05, 1.3, 2.3, cork_m)
for i, (x, y) in enumerate(((4.3, 2.0), (4.8, 1.7), (5.2, 2.05), (4.5, 1.55))):
    box(f"Paper{i}", x - 0.15, HZ0 + 0.05, x + 0.15, HZ0 + 0.06, y - 0.2, y + 0.2, paper_m)
cyl("FanHub", HX1 - 0.18, -1.0, 2.86, 0.12, 0.12, fan_m)
for k in range(3):
    a = k * 2.094
    box(f"FanBlade{k}", HX1 - 0.22, -1.0 + math.cos(a) * 0.05 - 0.06, HX1 - 0.18, -1.0 + math.cos(a) * 0.05 + 0.06,
        2.9 + math.sin(a) * 0.25 - 0.2, 2.9 + math.sin(a) * 0.25 + 0.2, fan_m)


# ---------- wooden lecture chairs with a writing arm (one mesh, instanced; each stands alone) ----------
SEAT_TOP = 0.51


def make_chair():
    parts = []
    parts.append(box("cSeat", -0.22, -0.22, 0.22, 0.2, 0.46, SEAT_TOP, wood_m))
    parts.append(box("cBack", -0.22, 0.2, 0.22, 0.25, 0.62, 0.98, wood_m))
    parts.append(box("cRail", -0.22, 0.2, 0.22, 0.24, 0.52, 0.56, metal_m))
    for sx in (-0.2, 0.2):
        parts.append(box("cLegF", sx - 0.018, -0.2, sx + 0.018, -0.164, 0.0, 0.46, metal_m))
        parts.append(box("cLegB", sx - 0.018, 0.17, sx + 0.018, 0.206, 0.0, 0.98, metal_m))
    # writing arm on the right of a chair facing -z: a post and a flat board out front
    parts.append(box("cArmPost", 0.21, -0.02, 0.25, 0.04, 0.46, 0.7, metal_m))
    parts.append(box("cArm", 0.04, -0.42, 0.34, 0.06, 0.7, 0.73, wood_m))
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    c = bpy.context.active_object
    c.name = "Chair"
    boxuv(c, (0.5, 0.5))
    return c


ROWS = [-2.6, -1.3, 0.0, 1.3, 2.6, 3.9]
COLS = [-6.0, -4.9, -3.8, -2.7, -0.5, 0.6, 1.7, 2.8, 3.9]
proto = make_chair()
chairs = []
for r, z in enumerate(ROWS):
    for c, x in enumerate(COLS):
        o = proto if not chairs else link(proto.copy())
        o.location = (x, -z, 0)
        o.rotation_euler = (0, 0, random.uniform(-0.06, 0.06))  # not perfectly lined up, like a real class
        o.name = f"Chair_{r + 1}_{c + 1}"
        chairs.append(o)

# ================= OUTSIDE: cement pavers, ring road, white blocks with blank signs =================
OX0, OX1, OZ0, OZ1 = -24.0, 26.0, -28.0, 22.0
box("Pavers", HX0 - 3, HZ0 - 3, HX1 + 3, HZ1 + 3, -0.17, -0.02, pavers_m, tile=(2.0, 2.0))
box("Asphalt", OX0, OZ0, OX1, OZ1, -0.2, -0.05, asphalt_m, tile=(4.0, 4.0))
for i, (a, b, c, d) in enumerate(((HX0 - 3.2, HZ0 - 3.2, HX1 + 3.2, HZ0 - 3.0), (HX0 - 3.2, HZ1 + 3.0, HX1 + 3.2, HZ1 + 3.2),
                                  (HX0 - 3.2, HZ0 - 3.2, HX0 - 3.0, HZ1 + 3.2), (HX1 + 3.0, HZ0 - 3.2, HX1 + 3.2, HZ1 + 3.2))):
    box(f"Kerb{i}", a, b, c, d, -0.05, 0.08, kerb_m)
RZ_BACK, RX_RIGHT = HZ0 - 8.0, HX1 + 8.0
for i in range(14):
    x = -20 + i * 3.2
    box(f"DashB{i}", x, RZ_BACK - 0.08, x + 1.6, RZ_BACK + 0.08, -0.05, -0.03, line_m)
for i in range(12):
    z = -20 + i * 3.2
    box(f"DashR{i}", RX_RIGHT - 0.08, z, RX_RIGHT + 0.08, z + 1.6, -0.05, -0.03, line_m)

signs = []


def sign_plane(name, m, cx, cy, cz, w, h, face):
    """A flat board (UV 0..1) the game paints the neighbour's name on."""
    bpy.ops.mesh.primitive_plane_add(size=1)
    p = bpy.context.active_object
    p.name = name
    p.scale = (w, h, 1)
    p.rotation_euler = (math.radians(90), 0, 0 if face == '+z' else math.radians(-90))
    p.location = (cx, -cz, cy)
    p.data.materials.append(m)
    link(p)
    signs.append(p)
    return p


def building(tag, x0, z0, x1, z1, floors, sign=None, face='+z'):
    FH = 3.2
    h = floors * FH
    box(f"{tag}Body", x0, z0, x1, z1, 0.0, h, facade_m, tile=(3.2, FH))
    box(f"{tag}Roof", x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, h + 0.35, roof_m)
    box(f"{tag}Base", x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1, 0.0, 0.7, trim_m)
    for k in range(1, floors):  # charcoal floor bands
        box(f"{tag}Band{k}", x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, k * FH - 0.08, k * FH + 0.08, trim_m)
    cx, cz = x0 + (x1 - x0) * 0.7, z0 + (z1 - z0) * 0.5
    box(f"{tag}TankStand", cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6, h + 0.35, h + 1.2, metal_m)
    cyl(f"{tag}Tank", cx, cz, h + 1.2, 1.3, 0.75, trim_m)
    if sign is None:
        return
    w, hh = 12.0, 1.6
    if face == '+z':
        sx = (x0 + x1) / 2
        box(f"{tag}SignBack", sx - w / 2 - 0.15, z1, sx + w / 2 + 0.15, z1 + 0.08, 6.6 - 0.15, 6.6 + hh + 0.15, trim_m)
        sign_plane(f"SignBoard{sign}", sign0_m if sign == 0 else sign1_m, sx, 6.6 + hh / 2, z1 + 0.1, w, hh, '+z')
    else:
        sz = (z0 + z1) / 2
        box(f"{tag}SignBack", x0 - 0.08, sz - w / 2 - 0.15, x0, sz + w / 2 + 0.15, 6.6 - 0.15, 6.6 + hh + 0.15, trim_m)
        sign_plane(f"SignBoard{sign}", sign0_m if sign == 0 else sign1_m, x0 - 0.1, 6.6 + hh / 2, sz, w, hh, '-x')


building("Back", -18.0, -26.0, 4.0, -15.0, 5, 0, '+z')
building("Right", 16.0, -10.0, 25.0, 14.0, 4, 1, '-x')
building("Corner", 9.0, -26.0, 23.0, -15.0, 6)
building("West", -24.0, -12.0, -16.0, 4.0, 3)

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
for i, (x, z, sc) in enumerate(((-10.5, -8.5, 0.6), (-1.0, -8.6, 0.52), (8.6, -8.5, 0.62), (8.6, 1.0, 0.55), (-10.6, 1.0, 0.58), (-10.6, 8.5, 0.5))):
    o = fern if i == 0 else link(fern.copy())
    o.name = f"Fern_{i}"
    o.location = (x, -z, 0)
    o.scale = (sc, sc, sc)
    o.rotation_euler = (0, 0, i * 1.3)
    ferns.append(o)

# ---------- bake transforms, box-UV the tiled pieces, join per material (chairs, ferns, signs stay apart) ----------
keep = set(chairs) | set(ferns) | set(signs)
rest = [o for o in col.objects if o not in keep]
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
