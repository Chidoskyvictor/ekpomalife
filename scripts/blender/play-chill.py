"""
Play and Chill: small five-a-side turf pitch inside a chain-link cage, teal block walls with white
pillars, and a thatched viewing shed with benches outside the cage (+x side). -> public/models/play-chill.glb
Headless:  blender -b --factory-startup -P scripts/blender/play-chill.py -- <out.glb>

Built straight in GAME coordinates: game (x, y, z) = Blender (x, -y, z) with Blender z up, so the
walls sit at game +x and game -z (Blender +y), where the room camera expects them. Room x -8.5..8.5,
z -6..6. Keep in sync with lib/game/play-chill.ts.
"""
import bpy, math, sys

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for blk in (bpy.data.meshes, bpy.data.materials):
    for b in list(blk):
        blk.remove(b)

col = bpy.data.collections.new("Pitch")
bpy.context.scene.collection.children.link(col)


def mat(name, color, rough=0.7, metal=0.0, alpha=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
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


def box(name, x0, z0, x1, z1, y0, y1, m):
    """Game-space box: x0..x1, z0..z1 on the floor, y0..y1 up."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, z1 - z0, y1 - y0)
    o.location = ((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2)
    o.data.materials.append(m)
    return link(o)


def post(name, x, z, h, r, m, verts=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(x, -z, h / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


def rail(name, x0, z0, x1, z1, y, r, m):
    """Horizontal pipe between two floor points at height y."""
    L = math.hypot(x1 - x0, z1 - z0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=L,
                                        location=((x0 + x1) / 2, -(z0 + z1) / 2, y),
                                        rotation=(0, math.radians(90), -math.atan2(-(z1 - z0), x1 - x0)))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return link(o)


turf_a = mat("TurfLight", (0.30, 0.62, 0.18), 0.9)
turf_b = mat("TurfDark", (0.20, 0.48, 0.13), 0.9)
line_m = mat("Line", (0.95, 0.95, 0.92), 0.6)
floor_m = mat("Concrete", (0.55, 0.36, 0.28), 0.9)  # reddish floor of the shed / walkway
teal_m = mat("WallTeal", (0.13, 0.36, 0.36), 0.85)
white_m = mat("Pillar", (0.88, 0.88, 0.85), 0.8)
pipe_m = mat("Pipe", (0.75, 0.75, 0.73), 0.4, 0.6)
rust_m = mat("RustPipe", (0.35, 0.22, 0.16), 0.6, 0.3)
net_m = mat("Net", (0.10, 0.35, 0.22), 0.8, alpha=0.28)
goal_m = mat("Goal", (0.96, 0.96, 0.96), 0.4)
thatch_m = mat("Thatch", (0.33, 0.22, 0.10), 1.0)
wood_m = mat("BenchWood", (0.42, 0.27, 0.14), 0.7)
ball_w = mat("Ball", (0.97, 0.97, 0.97), 0.5)

# ---------- floor: walkway + shed (reddish concrete) ----------
box("Floor", -8.5, -6.0, 8.5, 6.0, -0.2, 0.0, floor_m)

# ---------- turf pitch (stripes run across x) ----------
PX0, PX1, PZ0, PZ1 = -7.8, 4.2, -5.4, 4.4
n = 8
w = (PX1 - PX0) / n
for i in range(n):
    box(f"Turf{i}", PX0 + i * w, PZ0, PX0 + (i + 1) * w, PZ1, 0.0, 0.02, turf_a if i % 2 == 0 else turf_b)

# lines
LW = 0.07
lx0, lx1, lz0, lz1 = PX0 + 0.4, PX1 - 0.4, PZ0 + 0.4, PZ1 - 0.4
box("LineN", lx0, lz0, lx1, lz0 + LW, 0.02, 0.03, line_m)
box("LineS", lx0, lz1 - LW, lx1, lz1, 0.02, 0.03, line_m)
box("LineW", lx0, lz0, lx0 + LW, lz1, 0.02, 0.03, line_m)
box("LineE", lx1 - LW, lz0, lx1, lz1, 0.02, 0.03, line_m)
mx = (PX0 + PX1) / 2
mz = (PZ0 + PZ1) / 2
box("LineMid", mx - LW / 2, lz0, mx + LW / 2, lz1, 0.02, 0.03, line_m)
# centre circle (thin ring)
bpy.ops.mesh.primitive_torus_add(major_radius=1.5, minor_radius=0.035, major_segments=48, minor_segments=4, location=(mx, -mz, 0.03))
ring = bpy.context.active_object
ring.scale = (1, 1, 0.3)
ring.name = "CentreCircle"
ring.data.materials.append(line_m)
link(ring)
# penalty boxes
for side, x in (("W", lx0), ("E", lx1)):
    d = 1.6 if side == "W" else -1.6
    xa, xb = (x, x + d) if d > 0 else (x + d, x)
    box(f"Box{side}N", xa, mz - 2.0, xb, mz - 2.0 + LW, 0.02, 0.03, line_m)
    box(f"Box{side}S", xa, mz + 2.0 - LW, xb, mz + 2.0, 0.02, 0.03, line_m)
    xe = x + d
    box(f"Box{side}F", xe - LW / 2, mz - 2.0, xe + LW / 2, mz + 2.0, 0.02, 0.03, line_m)

# ---------- goals (white frames with net) ----------
for side, x, inward in (("W", lx0, -1), ("E", lx1, 1)):
    gz0, gz1, gh = mz - 1.2, mz + 1.2, 1.2
    post(f"Goal{side}P1", x, gz0, gh, 0.05, goal_m)
    post(f"Goal{side}P2", x, gz1, gh, 0.05, goal_m)
    rail(f"Goal{side}Bar", x, gz0, x, gz1, gh, 0.05, goal_m)
    back = x + inward * 0.7
    box(f"Goal{side}Net", min(x, back), gz0, max(x, back), gz1, 0.0, gh, net_m)

# ball on the centre spot
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, segments=12, ring_count=8, location=(mx + 0.6, -(mz + 0.4), 0.14))
ball = bpy.context.active_object
ball.name = "Ball"
ball.data.materials.append(ball_w)
link(ball)

# ---------- chain-link cage: poles, top rails, net panels (gates left open) ----------
CX0, CX1, CZ0, CZ1, CH = PX0, PX1 + 0.2, PZ0, PZ1 + 0.2, 3.0
GATE_FRONT = (-1.6, -0.2)   # gap in the front (+z) fence
GATE_SIDE = (0.6, 2.0)      # gap in the +x fence, onto the shed


def fence(tag, x0, z0, x1, z1, gap=None):
    L = math.hypot(x1 - x0, z1 - z0)
    steps = max(1, round(L / 2.0))
    for i in range(steps + 1):
        t = i / steps
        px, pz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        post(f"{tag}Pole{i}", px, pz, CH, 0.05, pipe_m if i % 2 else rust_m)
    rail(f"{tag}Top", x0, z0, x1, z1, CH, 0.04, rust_m)
    rail(f"{tag}Mid", x0, z0, x1, z1, 1.1, 0.035, pipe_m)
    segs = [(x0, z0, x1, z1)]
    if gap:
        if x0 == x1:
            segs = [(x0, z0, x0, gap[0]), (x0, gap[1], x0, z1)]
        else:
            segs = [(x0, z0, gap[0], z0), (gap[1], z0, x1, z0)]
    for j, (a, b, c, d) in enumerate(segs):
        if x0 == x1:
            box(f"{tag}Net{j}", a - 0.01, min(b, d), a + 0.01, max(b, d), 0.0, CH, net_m)
        else:
            box(f"{tag}Net{j}", min(a, c), b - 0.01, max(a, c), b + 0.01, 0.0, CH, net_m)


fence("FenceBack", CX0, CZ0, CX1, CZ0)
fence("FenceFront", CX0, CZ1, CX1, CZ1, GATE_FRONT)
fence("FenceWest", CX0, CZ0, CX0, CZ1)
fence("FenceEast", CX1, CZ0, CX1, CZ1, GATE_SIDE)

# ---------- boundary walls: teal block panels with white pillars (game -z and +x) ----------
WH = 1.8
box("WallBack", -8.5, -6.2, 8.7, -6.0, 0.0, WH, teal_m)
box("WallRight", 8.5, -6.2, 8.7, 6.0, 0.0, WH, teal_m)
for i in range(9):
    x = -8.4 + i * 2.1
    box(f"PillarB{i}", x - 0.14, -6.25, x + 0.14, -5.95, 0.0, WH + 0.15, white_m)
for i in range(6):
    z = -5.9 + i * 2.35
    box(f"PillarR{i}", 8.45, z - 0.14, 8.75, z + 0.14, 0.0, WH + 0.15, white_m)

# ---------- viewing shed (+x side, outside the cage): benches + thatched roof at the back ----------
for i, z in enumerate((-3.6, -0.6, 2.6)):
    box(f"Bench{i}Seat", 5.3, z - 1.1, 5.75, z + 1.1, 0.42, 0.48, wood_m)
    for k, dz in enumerate((-0.95, 0.95)):
        box(f"Bench{i}Leg{k}", 5.45, z + dz - 0.05, 5.6, z + dz + 0.05, 0.0, 0.42, wood_m)
    box(f"Bench{i}Back", 5.75, z - 1.1, 5.82, z + 1.1, 0.48, 0.9, wood_m)
# thatched roof hanging over the back of the shed (kept off the benches so the camera sees them)
for i, z in enumerate((-5.6, -1.9, 1.8, 5.5)):
    post(f"ShedPost{i}", 7.7, z, 2.7, 0.07, wood_m)
box("Thatch", 7.3, -6.0, 8.6, 6.0, 2.7, 3.0, thatch_m)
box("ThatchFringe", 7.2, -6.0, 7.4, 6.0, 2.35, 2.75, thatch_m)

# ---------- join per material, export ----------
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

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_lights=False, export_cameras=False)
print("EXPORTED", out, len(col.objects), "objects")
