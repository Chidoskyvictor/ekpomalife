"""
Builds the shared office interior (Admin Block, and any office such as BAMSSA, painted per office).
Based on the isometric "virtual office" scene: a cutaway room with a dark left wall (door, LED
strip) and a glass window wall at the back, wood plank floor.

  blender -b --factory-startup --python blender/build-office.py -- <out-dir>

Writes <out-dir>/office.glb and <out-dir>/office-data.json (copy the JSON to lib/game/office-data.json:
seats you can sit on, and the furniture that blocks walking, both in game coords).

Blender coords: x = game x, y = -(game z), z = up. Room is centred: x -6..6, y -4.5..4.5.
The glass wall is at the back (+y = game -z); the camera looks in from the open front-right.

Recolourable materials: 'Wall.001' = main wall colour, 'Wall' = wall panels (a shade darker).
Left unpainted, the walls keep the original navy (the Admin Block).
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
random.seed(7)

W, D, H = 12.0, 9.0, 3.4
X0, X1, Y0, Y1 = -W / 2, W / 2, -D / 2, D / 2

seats = []      # {id, x, z, row, heading, front, label}
blocks = []     # game [x0, z0, x1, z1]


def lin(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def srgb(hex_):
    h = hex_.lstrip('#')
    return lin([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def mat(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return m


def new_obj(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    return o


def box(name, m, x0, x1, y0, y1, z0, z1, ang=0.0, cx=0.0, cy=0.0):
    """Box from corners; with `ang`, the corners are local to (cx, cy) and turned about it."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    if ang:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Z'), verts=bm.verts)
    if ang or cx or cy:
        bmesh.ops.translate(bm, vec=(cx, cy, 0), verts=bm.verts)
    return new_obj(name, bm, m)


def cyl(name, m, x, y, z0, z1, r, r2=None, seg=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=(x, y, (z0 + z1) / 2), verts=bm.verts)
    return new_obj(name, bm, m)


def ball(name, m, x, y, z, r):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    bmesh.ops.translate(bm, vec=(x, y, z), verts=bm.verts)
    return new_obj(name, bm, m)


def block(x0, x1, y0, y1):
    blocks.append([round(x0, 2), round(-y1, 2), round(x1, 2), round(-y0, 2)])


def seat(label, x, y, ang, front=False):
    seats.append({'id': f's{len(seats) + 1}', 'x': round(x, 3), 'z': round(-y, 3), 'row': 0,
                  'heading': round(ang, 4), 'front': front, 'label': label})


def chair(x, y, ang, m_seat, m_frame, label):
    """Office chair at (x, y), facing `ang` (0 = +y). Seat at 0.45 m, back behind, five-star base."""
    s = 0.24
    box('Seat', m_seat, -s, s, -s, s, 0.40, 0.48, ang, x, y)
    box('Back', m_seat, -s, s, -s - 0.07, -s, 0.50, 1.02, ang, x, y)
    cyl('Post', m_frame, x, y, 0.08, 0.40, 0.035, seg=8)
    for k in range(5):
        a = ang + k * 2 * math.pi / 5
        box('Foot', m_frame, -0.025, 0.025, 0.0, 0.3, 0.02, 0.08, a, x, y)
    seat(label, x, y, ang)


def build():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    # ---------- materials (same colours as the original scene) ----------
    woods = [mat(f'Wood{i}', c, 0.45) for i, c in enumerate([
        (0.55, 0.30, 0.12), (0.62, 0.36, 0.15), (0.48, 0.26, 0.10), (0.68, 0.40, 0.18)])]
    slab = mat('Slab', (0.05, 0.06, 0.09), 0.7)
    wall = mat('Wall.001', (0.07, 0.09, 0.14), 0.8)      # painted per office
    panel = mat('Wall', (0.10, 0.13, 0.20), 0.6)         # a shade darker when painted
    trim = mat('Trim', (0.03, 0.04, 0.06), 0.5)
    frame = mat('Frame', (0.02, 0.025, 0.035), 0.35, metal=0.6)
    glass = mat('Glass', (0.55, 0.75, 1.0), 0.05, alpha=0.25)
    door = mat('Door', (0.35, 0.18, 0.07), 0.5)
    glow = mat('Strip', (0.2, 0.6, 1.0), emit=(0.2, 0.6, 1.0), strength=6)
    ground = mat('Ground', srgb('#141a28'), 0.9)
    desk_m = mat('Desk', srgb('#e9e4da'), 0.5)
    desk_leg = mat('DeskLeg', srgb('#2a2f3a'), 0.4, metal=0.5)
    screen = mat('Screen', srgb('#0b1730'), 0.3, emit=srgb('#3aa0ff'), strength=2.5)
    screen_g = mat('ScreenGreen', srgb('#08200f'), 0.3, emit=srgb('#33d17a'), strength=2.5)
    chair_m = mat('OfficeChair', srgb('#22262f'), 0.6)
    sofa_m = mat('Sofa', srgb('#3d6f78'), 0.85)
    rugs = [mat('RugBlue', srgb('#2b44c9'), 0.95), mat('RugPurple', srgb('#6a3fc1'), 0.95),
            mat('RugOrange', srgb('#c8641e'), 0.95), mat('RugIndigo', srgb('#3b3f9e'), 0.95)]
    rug_green = mat('RugGreen', srgb('#2f7d3a'), 0.95)
    counter_m = mat('Counter', srgb('#d8d2c6'), 0.4)
    counter_top = mat('CounterTop', srgb('#2c2f36'), 0.3)
    steel = mat('Steel', srgb('#b8bec7'), 0.3, metal=0.7)
    pot = mat('Pot', srgb('#e6e0d4'), 0.6)
    leaf = mat('Leaf', srgb('#2e8b3c'), 0.8)
    leaf2 = mat('LeafDark', srgb('#1f6b2c'), 0.8)
    books = [mat(f'Book{i}', srgb(c), 0.7) for i, c in enumerate(['#c0392b', '#2980b9', '#f1c40f', '#27ae60', '#8e44ad'])]
    table_m = mat('Table', srgb('#6b4a2e'), 0.5)

    # ---------- ground and floor ----------
    box('Ground', ground, -22, 22, -18, 18, -0.40, -0.35)
    box('FloorSlab', slab, X0 - 0.2, X1 + 0.2, Y0 - 0.2, Y1 + 0.2, -0.35, 0.0)
    plank = 0.30
    for i in range(int(W / plank)):
        box('Plank', random.choice(woods), X0 + i * plank, X0 + (i + 1) * plank - 0.012, Y0, Y1, 0.0, 0.06)

    # ---------- left wall: solid, with panel, door, LED strip ----------
    box('WallLeft', wall, X0 - 0.2, X0, Y0 - 0.2, Y1 + 0.2, 0, H)
    box('WallLeftPanel', panel, X0, X0 + 0.06, Y0 + 2.0, Y1 - 0.6, 0.9, 2.5)
    box('Baseboard', trim, X0, X0 + 0.08, Y0, Y1, 0.06, 0.24)
    box('WallLeftCap', trim, X0 - 0.2, X0 + 0.1, Y0 - 0.2, Y1 + 0.2, H, H + 0.1)
    box('LedStrip', glow, X0, X0 + 0.04, Y0 + 0.3, Y1 - 0.3, H - 0.25, H - 0.2)
    box('DoorFrame', trim, X0, X0 + 0.12, Y0 + 0.5, Y0 + 1.8, 0.06, 2.36)
    box('Door', door, X0, X0 + 0.14, Y0 + 0.58, Y0 + 1.72, 0.06, 2.26)
    box('DoorHandle', steel, X0 + 0.14, X0 + 0.18, Y0 + 1.55, Y0 + 1.62, 1.0, 1.06)

    # ---------- back wall: glass window wall ----------
    sill = 0.8
    box('WindowSill', wall, X0 - 0.2, X1, Y1, Y1 + 0.2, 0, sill)
    box('WindowTopBeam', frame, X0 - 0.2, X1, Y1, Y1 + 0.2, H - 0.2, H)
    box('WindowBase', trim, X0, X1, Y1 - 0.02, Y1 + 0.08, 0.06, 0.18)
    panes = 6
    pw = W / panes
    for i in range(panes + 1):
        box('Mullion', frame, X0 + i * pw - 0.05, X0 + i * pw + 0.05, Y1 - 0.02, Y1 + 0.22, sill, H)
    for i in range(panes):
        box('Glass', glass, X0 + i * pw + 0.05, X0 + (i + 1) * pw - 0.05, Y1 + 0.07, Y1 + 0.1, sill, H - 0.2)
    box('Transom', frame, X0, X1, Y1 - 0.02, Y1 + 0.22, sill + 1.6, sill + 1.66)
    for i in range(4):
        x = X0 + 1.2 + i * 3.0
        box('CeilBeam', frame, x, x + 0.15, Y1 - 2.5, Y1, H - 0.15, H)

    # ---------- desk pods on coloured rugs (desk at the back of each, chair facing it) ----------
    pods = [(-2.4, 2.4), (0.9, 2.4), (4.2, 2.4), (4.2, -0.6)]
    for k, (cx, cy) in enumerate(pods):
        box('Rug', rugs[k], cx - 1.25, cx + 1.25, cy - 1.0, cy + 1.05, 0.06, 0.075)
        box('DeskTop', desk_m, cx - 0.8, cx + 0.8, cy + 0.15, cy + 0.85, 0.72, 0.76)
        for lx in (cx - 0.75, cx + 0.71):
            box('DeskLeg', desk_leg, lx, lx + 0.04, cy + 0.2, cy + 0.8, 0.06, 0.72)
        box('MonitorStand', desk_leg, cx - 0.04, cx + 0.04, cy + 0.66, cy + 0.72, 0.76, 0.98)
        box('Monitor', screen if k % 2 == 0 else screen_g, cx - 0.36, cx + 0.36, cy + 0.6, cy + 0.66, 0.92, 1.32)
        box('Keyboard', desk_leg, cx - 0.22, cx + 0.22, cy + 0.25, cy + 0.38, 0.76, 0.78)
        chair(cx, cy - 0.25, 0.0, chair_m, desk_leg, 'At a desk')
        block(cx - 0.8, cx + 0.8, cy + 0.15, cy + 0.85)

    # ---------- lounge: L-sofa on a green round rug, coffee table ----------
    cyl('RugRound', rug_green, -2.6, -2.4, 0.06, 0.075, 1.75, seg=40)
    # Long sofa along the front (back to the camera side), facing +y
    box('SofaBase', sofa_m, -4.3, -0.9, -4.25, -3.45, 0.06, 0.45)
    box('SofaBack', sofa_m, -4.3, -0.9, -4.25, -4.0, 0.45, 0.9)
    box('SofaArm', sofa_m, -1.1, -0.9, -4.25, -3.45, 0.45, 0.65)
    # Short leg along the left, facing +x
    box('SofaBase', sofa_m, -4.3, -3.5, -3.45, -1.5, 0.06, 0.45)
    box('SofaBack', sofa_m, -4.3, -4.05, -3.45, -1.5, 0.45, 0.9)
    box('SofaArm', sofa_m, -4.3, -3.5, -1.7, -1.5, 0.45, 0.65)
    for x in (-3.3, -2.5, -1.7):
        seat('On the sofa', x, -3.85, 0.0, front=True)
    for y in (-2.9, -2.1):
        seat('On the sofa', -3.9, y, -math.pi / 2, front=True)
    block(-4.3, -0.9, -4.25, -3.95)
    block(-4.3, -4.0, -3.95, -1.5)
    box('CoffeeTable', table_m, -3.0, -2.0, -2.75, -2.15, 0.36, 0.42)
    for lx, ly in ((-2.95, -2.7), (-2.1, -2.7), (-2.95, -2.25), (-2.1, -2.25)):
        box('TableLeg', desk_leg, lx, lx + 0.05, ly, ly + 0.05, 0.06, 0.36)
    block(-3.0, -2.0, -2.75, -2.15)

    # ---------- meeting table with four chairs ----------
    tx, ty = 1.4, -2.3
    cyl('MeetingTop', table_m, tx, ty, 0.72, 0.77, 0.8, seg=32)
    cyl('MeetingPost', desk_leg, tx, ty, 0.06, 0.72, 0.08, seg=10)
    cyl('MeetingFoot', desk_leg, tx, ty, 0.06, 0.1, 0.4, seg=16)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cx, cy = tx + math.cos(a) * 1.2, ty + math.sin(a) * 1.2
        chair(cx, cy, math.atan2(-(tx - cx), ty - cy), chair_m, desk_leg, 'At the meeting table')
    block(tx - 0.8, tx + 0.8, ty - 0.8, ty + 0.8)

    # ---------- kitchen counter and fridge on the left wall, near the window ----------
    box('Counter', counter_m, X0, X0 + 0.65, 0.9, 3.5, 0.06, 0.88)
    box('CounterTop', counter_top, X0, X0 + 0.7, 0.88, 3.52, 0.88, 0.93)
    box('Sink', steel, X0 + 0.15, X0 + 0.55, 2.4, 2.9, 0.93, 0.95)
    box('Kettle', steel, X0 + 0.25, X0 + 0.45, 1.3, 1.5, 0.93, 1.15)
    box('Fridge', steel, X0, X0 + 0.75, 3.55, 4.35, 0.06, 2.0)
    box('Cabinet', counter_m, X0, X0 + 0.4, 0.9, 3.5, 1.7, 2.3)
    block(X0, X0 + 0.75, 0.88, 4.35)

    # ---------- bookshelf and wall screen ----------
    box('Shelf', table_m, X0, X0 + 0.4, -2.4, -1.0, 0.06, 2.1)
    for level in range(4):
        z = 0.2 + level * 0.48
        x = -2.35
        while x < -1.08:
            w = random.uniform(0.06, 0.12)
            box('Book', random.choice(books), X0 + 0.42, X0 + 0.46, x, x + w, z, z + random.uniform(0.25, 0.36))
            x += w + 0.01
    block(X0, X0 + 0.5, -2.4, -1.0)
    box('WallScreenFrame', frame, X0, X0 + 0.06, -0.7, 0.75, 1.15, 2.15)
    box('WallScreen', screen_g, X0 + 0.06, X0 + 0.08, -0.62, 0.67, 1.22, 2.08)

    # ---------- plants ----------
    for x, y, s in ((5.45, 3.95, 1.0), (-0.75, 3.95, 0.85), (5.45, -4.0, 1.1), (-4.85, -0.55, 0.8), (2.7, 0.7, 0.75)):
        cyl('Pot', pot, x, y, 0.06, 0.06 + 0.42 * s, 0.24 * s, 0.2 * s, seg=14)
        ball('Leaves', leaf, x, y, 0.06 + 0.8 * s, 0.38 * s)
        ball('Leaves', leaf2, x + 0.12 * s, y - 0.1 * s, 0.06 + 1.1 * s, 0.26 * s)
        block(x - 0.3 * s, x + 0.3 * s, y - 0.3 * s, y + 0.3 * s)

    # ---------- merge everything per material (few draw calls on phones) ----------
    groups = {}
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            groups.setdefault(o.data.materials[0].name, []).append(o)
    for name, parts in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:
            p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        parts[0].name = name
        parts[0].data.name = name

    path = os.path.join(OUT, 'office.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False)
    with open(os.path.join(OUT, 'office-data.json'), 'w') as f:
        json.dump({'seats': seats, 'blocks': blocks}, f, indent=1)
    print('built office ->', path, len(seats), 'seats', len(blocks), 'blocks')


build()
