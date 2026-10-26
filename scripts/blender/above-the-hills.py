"""
Above the Hills Church — low-poly building, generated headless in Blender.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --python scripts/blender/above-the-hills.py -- public/models/above-the-hills.glb

Footprint (W x D) stays 32 x 18; only the wall height H sets how tall it stands.
"""
import bpy, os, sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
EXPORT_PATH = os.path.abspath(argv[0]) if argv else os.path.join(os.path.expanduser("~"), "Desktop", "building4_lowpoly.glb")
NAME = "Building4_LowPoly"

# ================= SETTINGS =================
W, D = 32.0, 18.0      # width, depth (footprint — unchanged)
H = 7.5                # wall height (was 4.5)
RH = 3.4               # roof height

# Removes only an older copy of THIS model, the rest of your scene is kept
old = bpy.data.objects.get(NAME)
if old:
    bpy.data.objects.remove(old, do_unlink=True)
old_me = bpy.data.meshes.get(NAME)
if old_me:
    bpy.data.meshes.remove(old_me)

# ================= MATERIALS =================
MATS = {}
def mat(name, hexcol, rough=0.8):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    h = hexcol.lstrip('#')
    rgb = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    lin = [c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4 for c in rgb]
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*lin, 1)
        bsdf.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*lin, 1)
    MATS[name] = m
    return m

CREAM   = mat("B4_Wall_Cream",  "#ece6c8")
GREY    = mat("B4_Band_Grey",   "#878b8f")
WHITE   = mat("B4_White",       "#f2f2ee")
ROOF    = mat("B4_Roof_Brown",  "#6b5546", 0.6)
FASCIA  = mat("B4_Fascia",      "#2e2a28")
SKY     = mat("B4_Skylight",    "#2a2d33", 0.3)
GLASS   = mat("B4_Glass",       "#3c4650", 0.1)
DOOR    = mat("B4_Door_Wood",   "#5a3326", 0.6)
DOORDK  = mat("B4_Door_Panel",  "#43251b", 0.6)
CANOPY  = mat("B4_Canopy",      "#3a3c40", 0.5)
BANNER  = mat("B4_Banner",      "#1d1f2e", 0.5)
GOLD    = mat("B4_Banner_Trim", "#b8913a", 0.4)
LAMP    = mat("B4_Lamp",        "#fff6d8", 0.3)
VENT    = mat("B4_Vent",        "#2b2b2b")

# ================= MESH BUILDER =================
V, F, MI, MLIST = [], [], [], []
def midx(m):
    if m not in MLIST:
        MLIST.append(m)
    return MLIST.index(m)

def face(pts, m):
    b = len(V)
    V.extend(pts)
    F.append(tuple(range(b, b + len(pts))))
    MI.append(midx(m))

def box(x0, x1, y0, y1, z0, z1, m):
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)
    z0, z1 = min(z0, z1), max(z0, z1)
    b = len(V)
    V.extend([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
              (x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)])
    i = midx(m)
    for f in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)):
        F.append(tuple(b + k for k in f))
        MI.append(i)

def window(x0, x1, z0, z1):
    box(x0 - 0.15, x1 + 0.15, -0.08, 0.02, z0 - 0.15, z1 + 0.15, WHITE)  # frame
    box(x0, x1, -0.1, -0.08, z0, z1, GLASS)                              # glass
    mx = (x0 + x1) / 2
    box(mx - 0.04, mx + 0.04, -0.13, -0.1, z0, z1, WHITE)                # mullion
    box(x0, x1, -0.13, -0.1, z0 + (z1 - z0) * 0.62, z0 + (z1 - z0) * 0.62 + 0.06, WHITE)

def banner(x0, x1, z0, z1):
    box(x0, x1, -0.14, -0.02, z0, z1, BANNER)
    box(x0, x1, -0.17, -0.14, z1 - 0.12, z1, GOLD)
    box(x0, x1, -0.17, -0.14, z0, z0 + 0.12, GOLD)

# ================= WALLS =================
box(0, W, 0, D, 0, H, CREAM)                                   # main body
box(-0.02, W + 0.02, -0.02, D + 0.02, 0, 1.1, GREY)            # grey lower band
box(-0.04, W + 0.04, -0.04, D + 0.04, 1.1, 1.18, WHITE)        # white line

# front pilasters
for (x0, x1) in [(0, 0.8), (7.2, 8.0), (13.2, 14.0), (18.3, 19.1), (23.2, 24.0), (31.2, 32.0)]:
    box(x0, x1, -0.25, 0, 0, H, CREAM)
    box(x0 - 0.02, x1 + 0.02, -0.27, 0, 0, 1.1, GREY)
    box(x0 - 0.04, x1 + 0.04, -0.29, 0, 1.1, 1.18, WHITE)

# string course between the two floors
box(-0.06, W + 0.06, -0.08, D + 0.06, 4.5, 4.62, WHITE)

# ================= HIP ROOF =================
OV = 1.0          # eave overhang
ez = H
E0 = (-OV, -OV, ez); E1 = (W + OV, -OV, ez)
E2 = (W + OV, D + OV, ez); E3 = (-OV, D + OV, ez)
half = (D + 2*OV) / 2
R0 = (-OV + half, D/2, ez + RH); R1 = (W + OV - half, D/2, ez + RH)

face([E0, E1, R1, R0], ROOF)    # front slope
face([E2, E3, R0, R1], ROOF)    # back slope
face([E1, E2, R1], ROOF)        # right hip
face([E3, E0, R0], ROOF)        # left hip
face([E0, E3, E2, E1], FASCIA)  # eave underside

# fascia board around the eaves
box(-OV - 0.05, W + OV + 0.05, -OV - 0.05, -OV + 0.05, ez - 0.3, ez + 0.02, FASCIA)
box(-OV - 0.05, W + OV + 0.05, D + OV - 0.05, D + OV + 0.05, ez - 0.3, ez + 0.02, FASCIA)
box(-OV - 0.05, -OV + 0.05, -OV, D + OV, ez - 0.3, ez + 0.02, FASCIA)
box(W + OV - 0.05, W + OV + 0.05, -OV, D + OV, ez - 0.3, ez + 0.02, FASCIA)

# ridge cap
box(R0[0], R1[0], D/2 - 0.12, D/2 + 0.12, ez + RH - 0.05, ez + RH + 0.08, FASCIA)

# skylight on the front slope
def slope_z(y):
    return ez + (y + OV) * RH / half + 0.03
face([(5.8, 2.0, slope_z(2.0)), (9.2, 2.0, slope_z(2.0)),
      (9.2, 3.5, slope_z(3.5)), (5.8, 3.5, slope_z(3.5))], SKY)

# ================= FRONT DETAILS =================
# ground floor
window(9.8, 11.4, 1.5, 2.7)
window(25.0, 26.4, 1.5, 2.7)

# upper floor (the wall is taller now)
for (x0, x1) in [(2.0, 3.6), (4.4, 6.0), (9.8, 11.4), (20.0, 21.6), (25.0, 26.4), (28.2, 29.8)]:
    window(x0, x1, 5.3, 6.6)

# double door with frame and small canopy
box(15.0, 17.1, -0.06, 0.02, 0, 2.75, WHITE)
box(15.15, 16.95, -0.1, -0.06, 0, 2.6, DOOR)
for px in (15.3, 16.15):
    box(px, px + 0.65, -0.13, -0.1, 0.25, 1.2, DOORDK)
    box(px, px + 0.65, -0.13, -0.1, 1.4, 2.4, DOORDK)
box(16.03, 16.07, -0.14, -0.1, 0, 2.6, DOORDK)
box(14.9, 17.2, -0.9, 0, 3.35, 3.45, CANOPY)          # canopy slab
for px in (15.0, 17.05):
    box(px, px + 0.06, -0.9, 0, 3.0, 3.35, CANOPY)    # brackets

# blank banner panels
banner(1.4, 7.0, 1.0, 4.0)
banner(19.4, 23.0, 0.9, 3.7)

# wall lamps and vent
box(7.45, 7.75, -0.55, -0.25, 4.1, 4.35, LAMP)
box(31.45, 31.75, -0.55, -0.25, 3.5, 3.75, LAMP)
box(28.6, 29.0, -0.06, 0, 3.1, 3.5, VENT)

# ================= BUILD OBJECT =================
CX, CY = W / 2, D / 2    # origin at the bottom-center of the building
V = [(x - CX, y - CY, z) for (x, y, z) in V]

me = bpy.data.meshes.new(NAME)
me.from_pydata(V, [], F)
me.update()
for m in MLIST:
    me.materials.append(m)
for i, p in enumerate(me.polygons):
    p.material_index = MI[i]
    p.use_smooth = False

obj = bpy.data.objects.new(NAME, me)
bpy.context.scene.collection.objects.link(obj)

# ================= EXPORT =================
if bpy.context.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.view_layer.objects:
    try:
        o.select_set(False)
    except Exception:
        pass
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

os.makedirs(os.path.dirname(EXPORT_PATH), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=EXPORT_PATH, export_format='GLB', use_selection=True)
print("Exported to:", EXPORT_PATH)
