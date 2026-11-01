"""
Builds the shared lecture hall (every AAU hall and class uses it, each with its own colour).

  blender -b --python blender/build-lecture-hall.py -- <out-dir>

Writes <out-dir>/lecture-hall.glb and <out-dir>/lecture-hall-seats.json
(copy the JSON next to the layout in lib/game/hall-seats.json: one entry per chair).

Blender coords: x = game x, y = -(game z), z = up. The lecturer's end is +y (the back,
game z < 0); the camera looks in from the front (−y).

  Ground:  one flat interlocking-cement slab under everything (a tiled paver texture on
           a single plane, so it stays light on phones).
  Hall:    floor, a long back wall and two angled side walls (half a hexagon), all with
           wide window openings so you can see in; the front is open with a low kerb.
  Podium:  raised platform at the back with a lectern and a big board on the back wall.
  Seats:   rows of chairs facing the podium with a centre aisle (merged per material).
  Outside: a few plain campus blocks around the slab so it reads as part of the faculty.

Recolourable materials (the game paints them per hall, like the hostels):
  'Wall.001' = main wall colour, 'Wall' = trim (a shade darker), 'HallSeat' = seat colour.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]

# Hall shape (blender units = metres)
BACK_Y = 7.5        # back wall line (+y)
FRONT_Y = -7.5      # open front (−y)
BACK_HW = 5.2       # half width at the back
FRONT_HW = 8.0      # half width at the front
WALL_H = 3.0
WALL_T = 0.16
SLAB = (-26.0, 26.0, -22.0, 22.0)  # ground slab x0, x1, y0, y1


def srgb(hex_):
    h = hex_.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def mat(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m


def new_obj(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    return o


def box(name, material, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    return new_obj(name, bm, material)


def rbox(name, material, x0, x1, y0, y1, z0, z1, cx, cy, ang):
    """Box built in a chair's local frame, turned by `ang` about Z and moved to (cx, cy)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(cx, cy, 0), verts=bm.verts)
    return new_obj(name, bm, material)


def slab_between(name, material, a, b, thick, z0, z1):
    """A wall slab from point a to point b (x, y), `thick` wide, z0..z1 tall."""
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    angle = math.atan2(by - ay, bx - ax)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(length, thick, z1 - z0), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(angle, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2), verts=bm.verts)
    return new_obj(name, bm, material)


def cyl(name, material, x, y, z0, z1, r, seg=12):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=(x, y, (z0 + z1) / 2), verts=bm.verts)
    return new_obj(name, bm, material)


def merged(name, parts):
    """Join parts (same material) into one object to keep draw calls down."""
    parts = [p for p in parts if p]
    if not parts:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    parts[0].data.name = name
    return parts[0]


def wall_with_openings(tag, a, b, openings, wall_mat, trim_mat):
    """Wall from a to b with window openings: (t0, t1) along the wall, open from 0.95 m to 2.4 m."""
    ax, ay = a
    bx, by = b
    lerp = lambda t: (ax + (bx - ax) * t, ay + (by - ay) * t)
    lower, upper, piers = [], [], []
    # Full-length band under the windows (sill) and over them (lintel)
    lower.append(slab_between(f'{tag}Sill', wall_mat, a, b, WALL_T, 0.0, 0.95))
    upper.append(slab_between(f'{tag}Lintel', wall_mat, a, b, WALL_T, 2.4, WALL_H))
    # Piers between openings
    edges = [0.0] + [t for o in openings for t in o] + [1.0]
    for k in range(0, len(edges), 2):
        t0, t1 = edges[k], edges[k + 1]
        if t1 - t0 > 0.001:
            piers.append(slab_between(f'{tag}Pier', wall_mat, lerp(t0), lerp(t1), WALL_T, 0.95, 2.4))
    # Trim: a cap on top and a sill ledge, in the accent colour
    trims = [
        slab_between(f'{tag}Cap', trim_mat, a, b, WALL_T + 0.08, WALL_H, WALL_H + 0.12),
        slab_between(f'{tag}Ledge', trim_mat, a, b, WALL_T + 0.1, 0.92, 0.98),
    ]
    return lower + upper + piers, trims


def paver_texture(name, px=256):
    """Interlocking (zig-zag / 'bone') pavers in grey cement tones, drawn into an image."""
    img = bpy.data.images.new(name, px, px, alpha=False)
    tones = [(0.62, 0.61, 0.58), (0.56, 0.55, 0.52), (0.66, 0.65, 0.62), (0.52, 0.51, 0.49)]
    grout = (0.36, 0.35, 0.33)
    pixels = [0.0] * (px * px * 4)
    brick_w, brick_h = px // 4, px // 8
    for y in range(px):
        row = y // brick_h
        for x in range(px):
            offset = (brick_w // 2) if row % 2 else 0
            bx = (x + offset) // brick_w
            in_x = (x + offset) % brick_w
            in_y = y % brick_h
            # 'Interlocking' notch: a step in the middle of every brick edge
            notch = brick_h // 4
            edge = in_x < 2 or in_y < 2 or (abs(in_x - brick_w // 2) < 2 and in_y < notch)
            if edge:
                c = grout
            else:
                c = tones[(bx * 7 + row * 3) % len(tones)]
                shade = 1.0 - 0.06 * ((in_x + in_y) % 3 == 0)
                c = tuple(v * shade for v in c)
            i = (y * px + x) * 4
            pixels[i:i + 4] = (*c, 1.0)
    img.pixels = pixels
    img.pack()
    return img


def textured_ground():
    x0, x1, y0, y1 = SLAB
    m = bpy.data.materials.new('HallPavers')
    m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.92
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = paver_texture('HallPaverTex')
    tex.interpolation = 'Closest'
    m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    me = bpy.data.meshes.new('Ground')
    bm = bmesh.new()
    verts = [bm.verts.new((x0, y0, 0)), bm.verts.new((x1, y0, 0)), bm.verts.new((x1, y1, 0)), bm.verts.new((x0, y1, 0))]
    face = bm.faces.new(verts)
    uv = bm.loops.layers.uv.new('UVMap')
    tile = 2.0  # metres per texture repeat
    for loop in face.loops:
        co = loop.vert.co
        loop[uv].uv = ((co.x - x0) / tile, (co.y - y0) / tile)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('Ground', me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    # A thin kerb so the slab reads as a cast slab, not an endless plane
    kerb = mat('HallKerb', srgb('#8f8d88'), rough=0.9)
    merged('GroundKerb', [
        box('Kerb', kerb, x0 - 0.3, x1 + 0.3, y0 - 0.3, y0, -0.25, 0.04),
        box('Kerb', kerb, x0 - 0.3, x1 + 0.3, y1, y1 + 0.3, -0.25, 0.04),
        box('Kerb', kerb, x0 - 0.3, x0, y0, y1, -0.25, 0.04),
        box('Kerb', kerb, x1, x1 + 0.3, y0, y1, -0.25, 0.04),
    ])


def half_width(y):
    """Inside half width of the hall at depth y (narrower toward the podium)."""
    t = (BACK_Y - y) / (BACK_Y - FRONT_Y)
    return BACK_HW + (FRONT_HW - BACK_HW) * t


def chair(x, y, ang, seat_m, frame_m, parts):
    """Chair at (x, y) turned by `ang` (0 = facing +y, the podium). Seat at 0.45 m, back behind."""
    s = 0.22  # half seat
    b = lambda name, m, *r: rbox(name, m, *r, x, y, ang)
    parts['seat'].append(b('Seat', seat_m, -s, s, -s, s, 0.42, 0.48))
    parts['seat'].append(b('Back', seat_m, -s, s, -s - 0.06, -s, 0.48, 0.92))
    for dx in (-s + 0.03, s - 0.03):
        for dy in (-s + 0.03, s - 0.03):
            parts['frame'].append(b('Leg', frame_m, dx - 0.02, dx + 0.02, dy - 0.02, dy + 0.02, 0.0, 0.42))
    # Writing tablet on the right arm
    parts['frame'].append(b('Tablet', frame_m, s - 0.02, s + 0.2, -0.05, s + 0.12, 0.66, 0.69))


def build():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    textured_ground()

    wall = mat('Wall.001', srgb('#2f7d6b'), rough=0.85)       # main colour (per hall)
    trim = mat('Wall', srgb('#235e51'), rough=0.7)            # trim (per hall, darker)
    seat_m = mat('HallSeat', srgb('#b3202a'), rough=0.6)      # seats: always red, every hall
    frame_m = mat('HallChairFrame', srgb('#2b2d33'), rough=0.4, metal=0.4)
    floor_m = mat('HallFloor', srgb('#d8d2c4'), rough=0.6)
    stage_m = mat('HallStage', srgb('#7a5a3c'), rough=0.6)
    board_m = mat('HallBoard', srgb('#1f3b2c'), rough=0.9)
    board_frame = mat('HallBoardFrame', srgb('#c9c3b6'), rough=0.6)
    lectern_m = mat('HallLectern', srgb('#5b3f27'), rough=0.5)

    # Hall floor (a polygon matching the walls)
    bm = bmesh.new()
    pts = [(-BACK_HW, BACK_Y), (BACK_HW, BACK_Y), (FRONT_HW, FRONT_Y), (-FRONT_HW, FRONT_Y)]
    vs = [bm.verts.new((x, y, 0.02)) for x, y in pts]
    bm.faces.new(vs)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.06)
    new_obj('HallFloor', bm, floor_m)

    # Walls: back + two angled sides (half a hexagon), with window openings; front open with a kerb
    walls, trims = [], []
    w, t = wall_with_openings('Back', (-BACK_HW, BACK_Y), (BACK_HW, BACK_Y), [(0.08, 0.3), (0.7, 0.92)], wall, trim)
    walls += w
    trims += t
    for side in (-1, 1):
        a = (side * BACK_HW, BACK_Y)
        b = (side * FRONT_HW, FRONT_Y)
        w, t = wall_with_openings('Side', a, b, [(0.12, 0.3), (0.42, 0.6), (0.72, 0.9)], wall, trim)
        walls += w
        trims += t
    # Corner columns where the walls meet, in the trim colour
    for x, y in ((-BACK_HW, BACK_Y), (BACK_HW, BACK_Y), (-FRONT_HW, FRONT_Y), (FRONT_HW, FRONT_Y)):
        trims.append(box('Column', trim, x - 0.18, x + 0.18, y - 0.18, y + 0.18, 0, WALL_H + 0.2))
    # Low kerb across the open front
    trims.append(box('FrontKerb', trim, -FRONT_HW, FRONT_HW, FRONT_Y - 0.08, FRONT_Y + 0.08, 0, 0.3))
    merged('HallWalls', walls)
    merged('HallTrim', trims)

    # Podium at the back: raised stage, steps, lectern, board on the back wall
    merged('Podium', [
        box('Stage', stage_m, -3.6, 3.6, 5.2, BACK_Y - WALL_T, 0, 0.4),
        box('Step', stage_m, -1.0, 1.0, 4.75, 5.2, 0, 0.2),
    ])
    merged('Lectern', [
        box('Lectern', lectern_m, -0.45, 0.45, 5.6, 6.05, 0.4, 1.45),
        box('LecternTop', lectern_m, -0.55, 0.55, 5.55, 6.15, 1.45, 1.52),
    ])
    box('BoardFrame', board_frame, -3.1, 3.1, BACK_Y - WALL_T - 0.06, BACK_Y - WALL_T, 1.05, 2.75)
    box('HallBoard', board_m, -2.95, 2.95, BACK_Y - WALL_T - 0.08, BACK_Y - WALL_T - 0.06, 1.15, 2.65)

    # Seats: curved rows (arcs around a point behind the podium), every chair turned to face it.
    # Walkways: a centre aisle and an aisle along each side wall.
    parts = {'seat': [], 'frame': []}
    seats = []
    focus_y = 9.0
    for r in range(9):
        radius = (focus_y - 3.4) + r * 1.15
        arc = 0.8  # distance along the arc from the centre aisle
        while True:
            phi = arc / radius
            x = radius * math.sin(phi)
            y = focus_y - radius * math.cos(phi)
            if y > 4.3 or x > half_width(y) - 0.95:
                break
            for side in (-1, 1):
                cx, ang = side * x, side * phi
                chair(cx, y, ang, seat_m, frame_m, parts)
                # Game coords: x, z = -y. Heading 0 faces game −z (the podium); turned by the same angle
                seats.append({'id': f'r{r + 1}s{len(seats) + 1}', 'x': round(cx, 3), 'z': round(-y, 3),
                              'row': r + 1, 'heading': round(ang, 4)})
            arc += 0.78
    merged('HallSeat', parts['seat'])
    merged('HallChairFrame', parts['frame'])

    # Outside: plain campus blocks around the slab (fixed colours, so the hall's own colour stands out)
    block_m = [mat('CampusBlockA', srgb('#e7e1d4')), mat('CampusBlockB', srgb('#d9cfbd'))]
    roof_m = mat('CampusRoof', srgb('#8f4a2e'), rough=0.85)
    window_m = mat('CampusWindow', srgb('#5c7f93'), rough=0.2)
    blocks = [(-22.0, -14.0, 10.0, 19.0, 6.0), (14.0, 22.0, 10.0, 19.0, 7.5),
              (-23.5, -17.5, -16.0, -4.0, 5.0), (17.5, 23.5, -14.0, -2.0, 5.5)]
    walls_out, roofs, windows = [], [], []
    for k, (x0, x1, y0, y1, h) in enumerate(blocks):
        walls_out.append(box('Block', block_m[k % 2], x0, x1, y0, y1, 0, h))
        roofs.append(box('Roof', roof_m, x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, h, h + 0.35))
        # Window strips on the two faces that look toward the hall
        for level in range(int(h // 1.8)):
            z = 0.9 + level * 1.8
            face_y = y0 if y0 > 0 else y1
            windows.append(box('Win', window_m, x0 + 0.6, x1 - 0.6, face_y - 0.03, face_y + 0.03, z, z + 0.8))
            face_x = x0 if x0 > 0 else x1
            windows.append(box('Win', window_m, face_x - 0.03, face_x + 0.03, y0 + 0.6, y1 - 0.6, z, z + 0.8))
    group_a = [o for o in walls_out if o.data.materials[0].name == 'CampusBlockA']
    group_b = [o for o in walls_out if o.data.materials[0].name == 'CampusBlockB']
    merged('CampusBlockA', group_a)
    merged('CampusBlockB', group_b)
    merged('CampusRoof', roofs)
    merged('CampusWindow', windows)

    path = os.path.join(OUT, 'lecture-hall.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False)
    with open(os.path.join(OUT, 'lecture-hall-seats.json'), 'w') as f:
        json.dump({'seats': seats, 'heading': math.pi}, f, indent=1)
    print('built lecture hall ->', path, len(seats), 'seats')


build()
