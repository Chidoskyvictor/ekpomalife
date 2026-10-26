"""
Builds the bigger homes from the single room.

  blender -b --python blender/build-rooms.py -- <single-room.glb> <out-dir>

Writes <out-dir>/selfcon.glb, <out-dir>/one-bedroom.glb, <out-dir>/hostel-room.glb,
<out-dir>/club-sazza.glb and <out-dir>/room-shifts.json
(copy the JSON to lib/game/room-shifts.json: it tells the game where each piece moved).

Blender coords here: x = game x, y = -(game z), z = up. The single room's inside is
x/y ±3.4; back (y +3.5) and right (x +3.5) walls are full height, front and left are
low so the camera (front-left) can see in.

  Self-con:    single room + a strip in front (y -3.5 … -6.5) split into bath (left)
               and kitchen (right). Toilet, bucket and barrel move into the bath.
  One bedroom: self-con + a bedroom on the left (x -7.5 … -3.5). The bed and shelf
               move into it and the main room becomes a parlour with a sofa and TV.
Both bigger homes have full walls at the back and right, with the front and left low
(open, like the single room) so the camera sees in from the front-left, a front door in the back wall, and tiled floors in every room (cream
for the self-con, white/grey for the one bedroom). Inside walls are half height so
every room stays visible from above.

Each home is laid out at the single room's size first, then grown (GROW): walls get
longer, rooms get wider, but furniture keeps its real size and stays against the wall
it was standing on. Each home also gets its own wall colours (WALLS).
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]

PART_H = 1.3  # inside wall height
PART_T = 0.12


def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    bpy.context.view_layer.update()


def obj(name):
    return bpy.data.objects[name]


def objs(*prefixes):
    return [o for o in bpy.data.objects if any(o.name == p or o.name.startswith(p + '.') or o.name.startswith(p + '_') for p in prefixes)]


def move(names, dx=0.0, dy=0.0, dz=0.0):
    for o in objs(*names):
        if o.parent and o.parent.name in names:
            continue  # moves with its parent
        o.location += Vector((dx, dy, dz))


def delete(items):
    for o in list(items):
        bpy.data.objects.remove(o, do_unlink=True)


def mat(name, color=None, base=None, rough=0.8):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    if base:
        m = bpy.data.materials[base].copy()
        m.name = name
    else:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    if color:
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = rough
    return m


def srgb(hex_):
    """'#rrggbb' → linear rgb for Principled."""
    out = []
    for i in (1, 3, 5):
        c = int(hex_[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def box(name, material, x0, x1, y0, y1, z0, z1):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    me.materials.append(material)
    return o


def cyl(name, material, x, y, z0, z1, r, seg=24):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=1)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = (x, y, (z0 + z1) / 2)
    o.scale = (1, 1, z1 - z0)
    me.materials.append(material)
    return o


def set_box(o, x0=None, x1=None, y0=None, y1=None, z0=None, z1=None):
    """Re-size a unit-cube object (the GLB walls are unit cubes scaled) by its world bounds."""
    bpy.context.view_layer.update()  # objects made earlier in this run have stale matrices otherwise
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = [min(v[i] for v in bb) for i in range(3)]
    hi = [max(v[i] for v in bb) for i in range(3)]
    for i, (a, b) in enumerate(((x0, x1), (y0, y1), (z0, z1))):
        if a is not None:
            lo[i] = a
        if b is not None:
            hi[i] = b
    o.location = tuple((lo[i] + hi[i]) / 2 for i in range(3))
    o.scale = tuple(hi[i] - lo[i] for i in range(3))


def wall_x(name, y, x0, x1, gaps=(), height=PART_H, material=None):
    """Wall running along x at y, with door gaps [(a, b), …]."""
    material = material or PARTITION
    cuts = [x0] + [v for g in sorted(gaps) for v in g] + [x1]
    for i in range(0, len(cuts), 2):
        a, b = cuts[i], cuts[i + 1]
        if b - a < 0.01:
            continue
        box(f'{name}', material, a, b, y - PART_T / 2, y + PART_T / 2, 0, height)
        if height < 2:
            box(f'{name}Cap', CAP, a - 0.01, b + 0.01, y - PART_T / 2 - 0.02, y + PART_T / 2 + 0.02, height, height + 0.05)


def wall_y(name, x, y0, y1, gaps=(), height=PART_H, material=None):
    material = material or PARTITION
    cuts = [y0] + [v for g in sorted(gaps) for v in g] + [y1]
    for i in range(0, len(cuts), 2):
        a, b = cuts[i], cuts[i + 1]
        if b - a < 0.01:
            continue
        box(f'{name}', material, x - PART_T / 2, x + PART_T / 2, a, b, 0, height)
        if height < 2:
            box(f'{name}Cap', CAP, x - PART_T / 2 - 0.02, x + PART_T / 2 + 0.02, a - 0.01, b + 0.01, height, height + 0.05)


def delete_named(*prefixes):
    delete(o for o in bpy.data.objects if o.name.startswith(prefixes))


def outer_wall_y(tag, x, y0, y1, inner):
    """Full-height side wall along y at x, with the same skirting, fascia and roof strip as
    the back wall. `inner` is +1 when the room is on the +x side, -1 for -x."""
    box(f'Wall{tag}', bpy.data.materials['Wall'], x - 0.09, x + 0.09, y0 - 0.09, y1 + 0.09, 0, 3.0)
    face = x + 0.09 * inner
    sk = sorted((face, face + 0.04 * inner))
    box(f'Skirt{tag}', bpy.data.materials['SkirtL'], sk[0], sk[1], y0, y1, 0, 0.2)
    fa = sorted((x, x + 0.1 * inner))
    box(f'Fascia{tag}', bpy.data.materials['FasciaL'], fa[0], fa[1], y0 - 0.09, y1 + 0.09, 2.89, 3.01)
    ro = sorted((x - 0.33 * inner, x + 0.23 * inner))
    box(f'Roof{tag}', bpy.data.materials['RoofL'], ro[0], ro[1], y0 - 0.33, y1 + 0.33, 3.01, 3.23)


def post(name, material, x, y):
    box(name, bpy.data.materials[material], x - 0.06, x + 0.06, y - 0.06, y + 0.06, 0, 3.0)


def front_door():
    """Door in the back wall of the main room, by the right corner; the window slides left to make room."""
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or not o.name.startswith(('Frame', 'Slat', 'WinGlass', 'Cord')):
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        if min(v.y for v in bb) > 3.25 and max(v.x for v in bb) < 3.0:
            o.location.x -= 0.6
    delete([obj(n) for n in ('Wall', 'Wall.001', 'Wall.002', 'Wall.003')])
    wall = bpy.data.materials['Wall']
    y0, y1 = 3.41, 3.59
    box('BackWall', wall, -3.59, -1.0, y0, y1, 0, 3.0)
    box('BackWall', wall, -1.0, 1.6, y0, y1, 0, 1.35)
    box('BackWall', wall, -1.0, 1.6, y0, y1, 2.55, 3.0)
    box('BackWall', wall, 1.6, 2.0, y0, y1, 0, 3.0)
    box('BackWall', wall, 2.0, 2.95, y0, y1, 2.2, 3.0)
    box('BackWall', wall, 2.95, 3.59, y0, y1, 0, 3.0)
    set_box(obj('SkirtL'), x1=2.0)
    box('SkirtL', bpy.data.materials['SkirtL'], 2.95, 3.37, 3.37, 3.41, 0, 0.2)

    leaf = mat('Door', srgb('#6b4226'), rough=0.6)
    panel = mat('DoorPanel', srgb('#57341c'), rough=0.6)
    trim = bpy.data.materials['FrameT']
    box('Door', leaf, 2.02, 2.93, 3.45, 3.55, 0, 2.18)
    box('DoorPanel', panel, 2.12, 2.83, 3.43, 3.45, 1.2, 2.02)
    box('DoorPanel', panel, 2.12, 2.83, 3.43, 3.45, 0.18, 1.0)
    box('DoorKnob', mat('DoorKnob', srgb('#d4a72c'), rough=0.3), 2.79, 2.86, 3.38, 3.43, 1.0, 1.07)
    box('DoorCasing', trim, 1.92, 2.02, 3.36, 3.41, 0, 2.28)
    box('DoorCasing', trim, 2.93, 3.03, 3.36, 3.41, 0, 2.28)
    box('DoorCasing', trim, 1.92, 3.03, 3.36, 3.41, 2.18, 2.28)
    box('DoorMat', mat('DoorMat', srgb('#7a5a3a'), rough=1.0), 2.05, 2.9, 2.8, 3.3, 0, 0.012)


def merged(name, parts):
    """Join throwaway boxes into one mesh object (fewer draw calls)."""
    if not parts:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.join()
    parts[0].name = name
    return parts[0]


def tile_floor(name, x0, x1, y0, y1, colors, size=0.5, grout_color='#9a958c'):
    """Square tiles with grout lines, one mesh per colour."""
    grout_mat = mat('Grout', srgb('#9a958c')) if grout_color == '#9a958c' else mat(f'{name}GroutMat', srgb(grout_color))
    grout = box(f'{name}Grout', grout_mat, x0, x1, y0, y1, -0.06, -0.008)
    groups = {i: [] for i in range(len(colors))}
    nx = max(1, round((x1 - x0) / size))
    ny = max(1, round((y1 - y0) / size))
    sx = (x1 - x0) / nx
    sy = (y1 - y0) / ny
    for i in range(nx):
        for j in range(ny):
            k = (i + j) % len(colors)
            groups[k].append(box(name, colors[k], x0 + i * sx + 0.015, x0 + (i + 1) * sx - 0.015,
                                 y0 + j * sy + 0.015, y0 + (j + 1) * sy - 0.015, -0.05, 0.0))
    for k, parts in groups.items():
        merged(f'{name}{k}', parts)
    return grout


def plank_floor(name, x0, x1, y0, y1):
    """Wood planks like the single room's, running along x."""
    materials = [bpy.data.materials[n] for n in ('Plank', 'Plank.001', 'Plank.002', 'Plank.003', 'Plank.004')]
    rng = random.Random(7)
    groups = {i: [] for i in range(len(materials))}
    w, length = 0.26, 1.38
    y = y0
    row = 0
    while y < y1 - 0.01:
        yy = min(y + w, y1)
        x = x0 - (row % 3) * length / 3
        while x < x1 - 0.01:
            a, b = max(x, x0), min(x + length, x1)
            if b - a > 0.05:
                k = rng.randrange(len(materials))
                groups[k].append(box(name, materials[k], a + 0.006, b - 0.006, y + 0.006, yy - 0.006, -0.06, 0.0))
            x += length
        y += w
        row += 1
    for k, parts in groups.items():
        merged(f'{name}{k}', parts)


def pavers(rects, pad=2.15, size=(0.53, 0.24), materials=None):
    """Replace the paver ring with one around the new footprint (list of [x0, x1, y0, y1])."""
    delete(o for o in bpy.data.objects if o.name == 'Paver' or o.name.startswith('Paver.'))
    materials = materials or [bpy.data.materials[n] for n in ('Paver', 'Paver.001', 'Paver.002', 'Paver.003', 'Paver.004')]
    rng = random.Random(3)
    X0 = min(r[0] for r in rects) - pad
    X1 = max(r[1] for r in rects) + pad
    Y0 = min(r[2] for r in rects) - pad
    Y1 = max(r[3] for r in rects) + pad
    inside = lambda x, y: any(r[0] - 0.12 < x < r[1] + 0.12 and r[2] - 0.12 < y < r[3] + 0.12 for r in rects)
    groups = {i: [] for i in range(len(materials))}
    w, h = size
    row = 0
    y = Y0
    while y < Y1:
        x = X0 - (w / 2 if row % 2 else 0)
        while x < X1:
            cx, cy = x + w / 2, y + h / 2
            if X0 <= cx <= X1 and not inside(cx, cy):
                k = rng.randrange(len(materials))
                groups[k].append(box('Paver', materials[k], x + 0.012, x + w - 0.012, y + 0.012, y + h - 0.012, -0.17, -0.07))
            x += w
        y += h
        row += 1
    for k, parts in groups.items():
        merged(f'Pavers{k}', parts)
    return (X0 + X1) / 2, (Y0 + Y1) / 2, max(X1 - X0, Y1 - Y0)


LAWN = {}


def grass(cx, cy, span):
    """Centre the lawn discs on the house and make them big enough (the game shrinks them by 0.76)."""
    r = max(12.5, (span * 0.5 * 1.45) / 0.76)
    k = r / 12.5
    for o in objs('Grass', 'GrassInner'):
        loc, scale = LAWN.setdefault(o.name, (o.location.copy(), o.scale.copy()))
        o.location.x = cx + loc.x * k
        o.location.y = cy + loc.y * k
        o.scale.x = scale.x * k
        o.scale.y = scale.y * k


def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False)


# —— Self-con ————————————————————————————————————————————————————————————————

def build_selfcon():
    global PARTITION, CAP
    PARTITION = mat('Partition', base='Wall')
    CAP = mat('PartitionCap', base='FrameT')

    # Front strip: y -3.5 … -6.5. Old low front wall becomes the inside wall.
    delete([obj('FrontWall')])
    wall_x('InnerWallFront', -3.5, -3.5, 3.5, gaps=[(-2.25, -1.3), (0.9, 2.45)])
    wall_y('InnerWallBath', 0.0, -6.45, -3.56)
    box('FrontWall', bpy.data.materials['FrontWall'], -3.59, 3.59, -6.59, -6.41, 0, 0.3)

    # Left side stays low and open like the front (two open sides, viewed from the front-left)
    set_box(obj('SideWall'), y0=-6.59)

    front_door()

    # Right outer wall carries on to the new front, full height like the rest of it
    box('Wall', bpy.data.materials['Wall.001'], 3.41, 3.59, -6.59, -3.41, 0, 3.0)
    set_box(obj('SkirtR'), y0=-6.5)
    set_box(obj('FasciaR'), y0=-6.59)
    set_box(obj('RoofR'), y0=-6.83)
    move(['EndPostR'], dy=-3.0)

    # Floors
    delete(o for o in bpy.data.objects if o.name == 'Plank' or o.name.startswith('Plank.'))

    # Bath: toilet against the middle wall, bucket + basin by the door, barrel in the corner
    move(['ToiletBase', 'ToiletBowl', 'ToiletRim', 'ToiletSeatHole', 'ToiletTank', 'ToiletTankLid', 'FlushBtn'], dx=-3.40, dy=-4.0)
    move(['Bucket', 'BucketRim', 'BucketWater', 'RedBasin', 'RedBasinIn'], dx=-5.2, dy=-4.8)
    move(['Barrel', 'BarrelRim', 'BarrelWater'], dx=-5.35, dy=-6.85)

    # Kitchen: counter on the right wall, gas cooker with the pot on it, gas bottle, jerrycans
    wood = bpy.data.materials['TableTop']
    top = mat('CounterTop', srgb('#d8d8d4'), rough=0.4)
    box('Counter', wood, 2.78, 3.41, -6.41, -3.66, 0.0, 0.86)
    box('CounterTop', top, 2.74, 3.41, -6.41, -3.62, 0.86, 0.92)
    steel = mat('Cooker', srgb('#3b3f45'), rough=0.35)
    box('Cooker', steel, 2.86, 3.34, -5.45, -4.65, 0.92, 1.0)
    burner = mat('Burner', srgb('#16181b'), rough=0.6)
    for bx, by in ((2.98, -4.85), (3.22, -4.85), (2.98, -5.25), (3.22, -5.25)):
        cyl('Burner', burner, bx, by, 1.0, 1.02, 0.07)
    move(['PotBase', 'PotBody', 'PotLid'], dx=3.9, dy=-7.55, dz=0.13)
    gas = mat('GasBottle', srgb('#2f8f4e'), rough=0.5)
    cyl('GasBottle', gas, 2.42, -6.05, 0.0, 0.5, 0.17)
    cyl('GasBottleTop', burner, 2.42, -6.05, 0.5, 0.58, 0.06)
    plate = mat('Plate', srgb('#f4f4f2'), rough=0.3)
    for i in range(3):
        cyl('Plate', plate, 3.08, -6.05, 0.92 + i * 0.02, 0.935 + i * 0.02, 0.13)
    cup = mat('Cup', srgb('#e2574c'), rough=0.5)
    cyl('Cup', cup, 3.1, -3.95, 0.92, 1.03, 0.045)
    move(['Jerrycan', 'JerryCap', 'JerryHandle'], dx=-2.65, dy=-8.85)


# —— One bedroom (built on top of the self-con) ——————————————————————————————————

def build_one_bedroom():
    # Bedroom: x -7.5 … -3.5, y -3.5 … 3.5. The self-con's low left wall now only edges the
    # bath; between parlour and bedroom it becomes a half-height inside wall with a door.
    # The bedroom's own left and front walls are low too (open sides, like the rest).
    set_box(obj('SideWall'), y1=-3.41)
    wall_y('InnerWallBed', -3.5, -3.44, 3.41, gaps=[(-2.05, -1.05)])
    box('BackWall', bpy.data.materials['Wall'], -7.59, -3.41, 3.41, 3.59, 0, 3.0)
    set_box(obj('SkirtL'), x0=-7.41)
    set_box(obj('FasciaL'), x0=-7.59)
    set_box(obj('RoofL'), x0=-7.83)
    box('SideWall', bpy.data.materials['SideWall'], -7.59, -7.41, -3.59, 3.59, 0, 0.3)
    box('FrontWall', bpy.data.materials['FrontWall'], -7.59, -3.5, -3.59, -3.41, 0, 0.3)
    move(['EndPostL'], dx=-4.0)  # end of the back wall, now at the bedroom's corner


    # Bed, shelf, clothes and lamp go to the bedroom
    move(['BedBase', 'Mattress', 'Pillow', 'PillowEdge'], dx=-4.0, dy=3.9)
    move(['ShelfBoard', 'ShelfPost', 'Cloth1', 'Cloth2', 'Cloth3', 'Cloth4', 'Cloth5'], dx=-1.97)
    for o in objs('LampBracket', 'LampBulb', 'LampCap'):
        if o.location.x < 0:
            o.location.x -= 4.0
    delete(objs('RedChair'))

    # Parlour: sofa facing a TV on the right wall, rug and a low table between
    fabric = mat('Sofa', srgb('#c0602e'), rough=0.9)
    cushion = mat('SofaCushion', srgb('#e08a4e'), rough=0.9)
    leg = mat('SofaLeg', srgb('#3a2a1e'))
    x0, x1, y0, y1 = -1.35, -0.45, -1.75, 0.45
    for lx in (x0 + 0.06, x1 - 0.06):
        for ly in (y0 + 0.06, y1 - 0.06):
            box('SofaLeg', leg, lx - 0.04, lx + 0.04, ly - 0.04, ly + 0.04, 0.0, 0.1)
    box('SofaBase', fabric, x0, x1, y0, y1, 0.1, 0.4)
    box('SofaBack', fabric, x0, x0 + 0.22, y0, y1, 0.4, 0.88)
    box('SofaArm', fabric, x0, x1, y0, y0 + 0.18, 0.4, 0.62)
    box('SofaArm', fabric, x0, x1, y1 - 0.18, y1, 0.4, 0.62)
    for a, b in ((y0 + 0.2, -0.66), (-0.64, y1 - 0.2)):
        box('SofaCushion', cushion, x0 + 0.24, x1 - 0.02, a, b, 0.4, 0.5)
    rug = mat('Rug', srgb('#2c6e8f'), rough=1.0)
    rug_in = mat('RugInner', srgb('#e9b949'), rough=1.0)
    cyl('Rug', rug, 1.0, -0.65, 0.0, 0.012, 1.45, seg=48)
    cyl('RugInner', rug_in, 1.0, -0.65, 0.0, 0.016, 1.1, seg=48)
    wood = bpy.data.materials['TableTop']
    box('LowTable', wood, 0.55, 1.35, -1.05, -0.25, 0.36, 0.42)
    for lx in (0.6, 1.3):
        for ly in (-1.0, -0.3):
            box('LowTableLeg', wood, lx - 0.03, lx + 0.03, ly - 0.03, ly + 0.03, 0.0, 0.36)
    stand = mat('TvStand', srgb('#4a3426'))
    box('TvStand', stand, 2.95, 3.41, -1.55, 0.25, 0.0, 0.5)
    screen = mat('TvScreen', srgb('#0d0f12'), rough=0.2)
    box('Tv', screen, 3.15, 3.25, -1.45, 0.15, 0.55, 1.3)
    box('TvFoot', screen, 3.08, 3.32, -0.75, -0.55, 0.5, 0.55)


# —— School hostel room ————————————————————————————————————————————————————————————
# A dorm on campus: white metal bunk beds along both side walls with small wooden lockers
# between them, walls blue to shoulder height and white above, wood floor, barred window
# with a tube light at the far end and blue pipes along that wall. Built from scratch; only
# the lawn, paver and plank materials come from the single room. Room: x ±3.2, y ±5.

HOSTEL_X, HOSTEL_Y = 3.2, 5.0
DADO = 1.4  # where the blue stops and the white starts


def pipe(name, material, x0, x1, y, z, r):
    o = cyl(name, material, (x0 + x1) / 2, y, z - (x1 - x0) / 2, z + (x1 - x0) / 2, r, seg=16)
    o.location = ((x0 + x1) / 2, y, z)
    o.rotation_euler = (0, math.pi / 2, 0)
    return o


def two_tone(name, x0, x1, y0, y1, z0, z1):
    """Wall piece: blue below the dado line, white above, with a thin dark line between."""
    if z0 < DADO:
        box(name, HOSTEL_BLUE, x0, x1, y0, y1, z0, min(z1, DADO))
    if z1 > DADO:
        box(name, HOSTEL_WHITE, x0, x1, y0, y1, max(z0, DADO), z1)


def bunk(x0, x1, y0, y1, top, bottom):
    """White tube bunk bed, long side along y, pillows at the back (high y) end."""
    metal = mat('BunkMetal', srgb('#eef1f4'), rough=0.35)
    base = mat('BunkBase', srgb('#9aa3ab'), rough=0.6)
    sheet = mat('Mattress', srgb('#dfe6ee'), rough=0.9)
    pillow = mat('Pillow', srgb('#fafafa'), rough=0.9)
    t = 0.022  # tube half-thickness
    for x in (x0 + 0.03, x1 - 0.03):
        for y in (y0 + 0.03, y1 - 0.03):
            cyl('BunkPost', metal, x, y, 0, 1.8, 0.028, seg=12)
    for y in (y0 + 0.03, y1 - 0.03):  # head and foot ends
        for z in (0.36, 0.62, 1.26, 1.52, 1.78):
            box('BunkRail', metal, x0, x1, y - t, y + t, z - t, z + t)
        for k in (1, 2, 3):
            x = x0 + (x1 - x0) * k / 4
            box('BunkBar', metal, x - 0.014, x + 0.014, y - 0.014, y + 0.014, 0.36, 0.62)
            box('BunkBar', metal, x - 0.014, x + 0.014, y - 0.014, y + 0.014, 1.26, 1.52)
    for x in (x0 + 0.03, x1 - 0.03):  # long side rails
        for z in (0.36, 1.26):
            box('BunkRail', metal, x - t, x + t, y0, y1, z - t, z + t)
    box('BunkRail', metal, x1 - 0.03 - t, x1 - 0.03 + t, y0 + 0.5, y1, 1.6 - t, 1.6 + t)  # upper guard
    for z, blanket in ((0.36, bottom), (1.26, top)):
        box('BunkBase', base, x0 + 0.04, x1 - 0.04, y0 + 0.04, y1 - 0.04, z - 0.02, z + 0.01)
        box('Mattress', sheet, x0 + 0.06, x1 - 0.06, y0 + 0.06, y1 - 0.06, z + 0.01, z + 0.15)
        box('Blanket', blanket, x0 + 0.04, x1 - 0.04, y0 + 0.05, y1 - 0.5, z + 0.15, z + 0.18)
        box('Pillow', pillow, x0 + 0.12, x1 - 0.12, y1 - 0.45, y1 - 0.1, z + 0.15, z + 0.27)


def locker(x0, x1, y0, y1):
    wood = mat('Locker', srgb('#9b6a3f'), rough=0.7)
    top = mat('LockerTop', srgb('#b98353'), rough=0.6)
    box('Locker', wood, x0, x1, y0, y1, 0, 0.68)
    box('LockerTop', top, x0 - 0.02, x1 + 0.02, y0 - 0.02, y1 + 0.02, 0.68, 0.72)
    box('LockerKnob', mat('LockerKnob', srgb('#2d2d2d')), x1 - 0.01 if x0 < 0 else x0 - 0.02,
        x1 + 0.02 if x0 < 0 else x0 + 0.01, (y0 + y1) / 2 - 0.03, (y0 + y1) / 2 + 0.03, 0.5, 0.56)


def build_hostel():
    global HOSTEL_BLUE, HOSTEL_WHITE
    keep = ('Grass', 'GrassInner', 'Paver')
    delete(o for o in bpy.data.objects if not o.name.startswith(keep))
    HOSTEL_BLUE = mat('HostelBlue', srgb('#3f8fd8'), rough=0.7)
    HOSTEL_WHITE = mat('HostelWhite', srgb('#eef1f4'), rough=0.8)
    X, Y, T = HOSTEL_X, HOSTEL_Y, 0.09
    trim = mat('HostelTrim', srgb('#4a3f3a'), rough=0.7)

    plank_floor('HostelPlank', -X, X, -Y, Y)

    # Back wall (far end) with the window; side walls full height; front stays low
    wx0, wx1, sill, head = -0.65, 0.65, 1.15, 2.35
    two_tone('HostelWall', -X - T, wx0, Y - T, Y + T, 0, 3.0)
    two_tone('HostelWall', wx1, X + T, Y - T, Y + T, 0, 3.0)
    two_tone('HostelWall', wx0, wx1, Y - T, Y + T, 0, sill)
    two_tone('HostelWall', wx0, wx1, Y - T, Y + T, head, 3.0)
    for x in (-X, X):
        two_tone('HostelWall', x - T, x + T, -Y - T, Y + T, 0, 3.0)
    box('HostelFront', trim, -X - T, X + T, -Y - T, -Y + T, 0, 0.3)
    dado = mat('HostelDado', srgb('#2b6cb0'), rough=0.6)
    box('HostelDado', dado, -X + T, X - T, Y - T - 0.02, Y - T, DADO - 0.03, DADO + 0.03)
    for x, inner in ((-X, 1), (X, -1)):
        a, b = sorted((x + T * inner, x + (T + 0.02) * inner))
        box('HostelDado', dado, a, b, -Y, Y - T, DADO - 0.03, DADO + 0.03)
    # Wall tops
    box('HostelCap', trim, -X - 0.2, X + 0.2, Y - 0.15, Y + 0.2, 3.0, 3.12)
    for x in (-X, X):
        box('HostelCap', trim, x - 0.2, x + 0.2, -Y - 0.2, Y + 0.2, 3.0, 3.12)

    # Window: white frame, pale glass, burglar bars on the inside
    frame = mat('HostelFrame', srgb('#f6f7f8'), rough=0.4)
    glass = mat('HostelGlass', srgb('#b9d3e6'), rough=0.15)
    box('HostelGlass', glass, wx0, wx1, Y - 0.01, Y + 0.01, sill, head)
    for a, b in ((wx0 - 0.06, wx0), (wx1, wx1 + 0.06), (-0.025, 0.025)):
        box('HostelFrame', frame, a, b, Y - T - 0.03, Y - T + 0.02, sill, head)
    for a, b in ((sill - 0.06, sill), (head, head + 0.06)):
        box('HostelFrame', frame, wx0 - 0.06, wx1 + 0.06, Y - T - 0.05, Y - T + 0.02, a, b)
    bars = mat('HostelBars', srgb('#4b4f55'), rough=0.5)
    for i in range(1, 8):
        x = wx0 + (wx1 - wx0) * i / 8
        box('HostelBar', bars, x - 0.012, x + 0.012, Y - T - 0.07, Y - T - 0.045, sill, head)
    for z in (sill + 0.4, sill + 0.8):
        box('HostelBar', bars, wx0, wx1, Y - T - 0.07, Y - T - 0.045, z - 0.012, z + 0.012)

    # Tube light above the window and a red heater bar beside it
    tube = mat('HostelTube', srgb('#fffdf2'), rough=0.2)
    tube.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 0.95, 1)
    tube.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.0
    box('HostelTube', tube, -0.6, 0.6, Y - T - 0.08, Y - T - 0.02, 2.62, 2.68)
    box('HostelHeater', mat('HostelHeater', srgb('#8f2a22'), rough=0.6), -1.2, 1.2, Y - T - 0.06, Y - T, 2.82, 2.92)

    # Blue pipes along the back wall
    pipe_mat = mat('HostelPipe', srgb('#2f7fd0'), rough=0.4)
    for z in (0.32, 0.5):
        pipe('HostelPipe', pipe_mat, -X + T, X - T, Y - T - 0.08, z, 0.06)

    # Bunks along both side walls, lockers between; your bunk is the front-left one
    navy = mat('BlanketNavy', srgb('#22356e'), rough=1.0)
    brown = mat('BlanketBrown', srgb('#6b4a33'), rough=1.0)
    orange = mat('BlanketOrange', srgb('#e89a3c'), rough=1.0)
    grey = mat('BlanketGrey', srgb('#8a8d91'), rough=1.0)
    mine = mat('BlanketMine', srgb('#2e9e6a'), rough=1.0)
    bx0, bx1 = -X + 0.05, -X + 1.0
    bunk(bx0, bx1, 2.8, 4.8, grey, navy)
    locker(-X + 0.1, -X + 0.6, 2.15, 2.7)
    bunk(bx0, bx1, 0.05, 2.05, orange, mine)
    locker(-X + 0.1, -X + 0.6, -0.6, -0.05)
    bunk(X - 1.0, X - 0.05, 2.8, 4.8, navy, brown)
    locker(X - 0.6, X - 0.1, 2.15, 2.7)
    bunk(X - 1.0, X - 0.05, 0.05, 2.05, grey, orange)
    locker(X - 0.6, X - 0.1, -0.6, -0.05)

    # Your corner by the door: bucket + basin, small reading table and a plastic chair
    bucket = mat('Bucket', srgb('#1f5fbf'), rough=0.5)
    cyl('Bucket', bucket, -2.7, -3.6, 0, 0.55, 0.25)
    cyl('BucketWater', mat('BucketWater', srgb('#7cb7e8'), rough=0.1), -2.7, -3.6, 0.55, 0.56, 0.22)
    cyl('RedBasin', mat('RedBasin', srgb('#d63a32'), rough=0.5), -2.75, -4.25, 0, 0.13, 0.3)
    wood = mat('HostelTable', srgb('#a8784d'), rough=0.6)
    box('HostelTable', wood, 2.3, 3.1, -2.6, -1.8, 0.72, 0.76)
    for x in (2.34, 3.06):
        for y in (-2.56, -1.84):
            box('HostelTableLeg', wood, x - 0.025, x + 0.025, y - 0.025, y + 0.025, 0, 0.72)
    box('HostelBook', mat('HostelBook', srgb('#c0392b')), 2.55, 2.85, -2.35, -2.1, 0.76, 0.8)
    plastic = mat('PlasticChair', srgb('#d93b3b'), rough=0.5)
    box('PlasticChair', plastic, 1.75, 2.15, -2.4, -2.0, 0.42, 0.46)  # seat
    box('PlasticChair', plastic, 1.73, 1.77, -2.4, -2.0, 0.46, 0.9)  # back (away from the table)
    for x in (1.77, 2.13):
        for y in (-2.38, -2.02):
            box('PlasticChair', plastic, x - 0.02, x + 0.02, y - 0.02, y + 0.02, 0, 0.42)

    cx, cy, span = pavers([[-X - 0.1, X + 0.1, -Y - 0.1, Y + 0.1]])
    grass(cx, cy, span)
    export(os.path.join(OUT, 'hostel-room.glb'))


# —— Club (Sazza; other clubs reuse it with their own colours) ————————————————————————
# Long black hall: full walls at the back (DJ end) and right (VIP side), front and left
# low like the homes. Bar on the left, light-up dance floor in the middle, raised DJ booth
# with a big LED screen at the back, raised VIP lounge on the right with gold posts, red
# rope and red sofas, the "shutting it down" spender screen above VIP, neon strips on the
# walls, a disco ball, and big cement slabs outside. Room: x ±6, y ±8.
# Named meshes the game drives: DanceTile* (animated colours), ClubScreen (DJ visuals),
# SpendScreen (tonight's top spenders), NeonPink/NeonCyan/NeonYellow (glow).

CLUB_X, CLUB_Y, CLUB_H = 6.0, 8.0, 4.0


def neon(name, hex_, strength=4.0):
    m = mat(name, srgb(hex_), rough=0.3)
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Emission Color'].default_value = (*srgb(hex_), 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    return m


def build_club(theme):
    keep = ('Grass', 'GrassInner', 'Paver')
    delete(o for o in bpy.data.objects if not o.name.startswith(keep))
    X, Y, H, T = CLUB_X, CLUB_Y, CLUB_H, 0.09
    wall = mat('ClubWall', srgb('#141418'), rough=0.85)
    trim = mat('ClubTrim', srgb('#26272e'), rough=0.6)
    cap = mat('ClubCap', srgb('#0b0b0e'), rough=0.7)
    pink, cyan = neon('NeonPink', theme['pink']), neon('NeonCyan', theme['cyan'])
    yellow, purple = neon('NeonYellow', theme['yellow']), neon('NeonPurple', theme['purple'])

    tile_floor('ClubFloor', -X, X, -Y, Y, [mat('ClubFloorA', srgb('#202128'), rough=0.35),
                                           mat('ClubFloorB', srgb('#1a1b21'), rough=0.35)], size=1.0, grout_color='#111216')

    # Walls: black, full at the back and right, low at the front and left
    box('ClubWall', wall, -X - T, X + T, Y - T, Y + T, 0, H)
    box('ClubWall', wall, X - T, X + T, -Y - T, Y + T, 0, H)
    box('ClubLowWall', trim, -X - T, -X + T, -Y - T, Y + T, 0, 0.35)
    box('ClubLowWall', trim, -X - T, X + T, -Y - T, -Y + T, 0, 0.35)
    box('ClubCap', cap, -X - 0.2, X + 0.2, Y - 0.15, Y + 0.2, H, H + 0.12)
    box('ClubCap', cap, X - 0.15, X + 0.2, -Y - 0.2, Y + 0.2, H, H + 0.12)
    # Neon strips at head height, and along the tops of the low walls
    box('NeonPink', pink, -X + T, -2.9, Y - T - 0.03, Y - T, 3.0, 3.06)
    box('NeonPink', pink, 2.9, X - T, Y - T - 0.03, Y - T, 3.0, 3.06)
    box('NeonCyan', cyan, X - T - 0.03, X - T, -Y, 0, 3.0, 3.06)
    box('NeonPink', pink, X - T - 0.03, X - T, 0, Y - T, 3.0, 3.06)
    box('NeonCyan', cyan, -X - 0.04, -X + 0.04, -Y, Y, 0.35, 0.39)
    box('NeonPink', pink, -X, X, -Y - 0.04, -Y + 0.04, 0.35, 0.39)

    # Dance floor: 6 × 6 light-up tiles on a low platform
    box('DanceBase', mat('DanceBase', srgb('#9aa0aa'), rough=0.3), -2.85, 2.85, -2.35, 3.35, 0, 0.06)
    colors = [theme['pink'], theme['cyan'], theme['yellow']]
    for i in range(6):
        for j in range(6):
            x0, y0 = -2.7 + i * 0.9, -2.2 + j * 0.9
            box('DanceTile', neon(f'DanceTile{i}{j}', colors[(i + j * 2) % 3], 2.5), x0 + 0.03, x0 + 0.87, y0 + 0.03, y0 + 0.87, 0.06, 0.1)

    # DJ booth at the back: raised stage, desk, decks, speakers, LED screen
    box('DjStage', trim, -2.8, 2.8, 5.6, Y - T, 0, 0.55)
    box('NeonCyan', cyan, -2.8, 2.8, 5.57, 5.6, 0.45, 0.5)
    box('DjDesk', mat('DjDesk', srgb('#1d1d24'), rough=0.5), -1.3, 1.3, 6.3, 6.9, 0.55, 1.55)
    box('NeonPink', pink, -1.2, 1.2, 6.27, 6.3, 1.0, 1.06)
    deck = mat('DjDeck', srgb('#0e0e12'), rough=0.4)
    for x in (-0.75, 0.75):
        cyl('DjDeck', deck, x, 6.6, 1.55, 1.6, 0.2)
    box('DjLaptop', neon('DjLaptop', '#f4f0ff', 2.0), -0.22, 0.22, 6.55, 6.75, 1.55, 1.58)
    box('ClubScreenFrame', cap, -2.75, 2.75, Y - T - 0.08, Y - T, 1.5, 4.0)
    box('ClubScreen', neon('ClubScreen', theme['screen'], 2.2), -2.6, 2.6, Y - T - 0.1, Y - T - 0.08, 1.62, 3.88)
    speaker = mat('Speaker', srgb('#26272c'), rough=0.6)
    cone = mat('SpeakerCone', srgb('#55575e'), rough=0.5)
    for x0, x1 in ((-3.7, -2.9), (2.9, 3.7)):
        box('Speaker', speaker, x0, x1, 6.7, 7.7, 0, 3.0)
        for z in (0.6, 1.5, 2.4):
            box('SpeakerCone', cone, x0 + 0.15, x1 - 0.15, 6.66, 6.7, z - 0.25, z + 0.25)

    # Bar on the left: orange front with a yellow neon line, stools, glowing bottle shelves
    box('BarFront', mat('BarFront', srgb(theme['bar']), rough=0.6), -5.0, -4.0, -5.0, 3.0, 0, 1.1)
    box('BarTop', mat('BarTop', srgb('#2b1d18'), rough=0.3), -5.05, -3.85, -5.05, 3.05, 1.1, 1.18)
    box('NeonYellow', yellow, -3.99, -3.96, -5.0, 3.0, 0.25, 0.3)
    stool_seat = mat('StoolSeat', srgb('#b8325e'), rough=0.5)
    chrome = mat('Chrome', srgb('#c9ccd2'), rough=0.2)
    for y in (-4.2, -2.9, -1.6, -0.3, 1.0, 2.3):
        cyl('StoolBase', chrome, -3.5, y, 0, 0.03, 0.2)
        cyl('StoolPole', chrome, -3.5, y, 0.03, 0.75, 0.035)
        cyl('StoolSeat', stool_seat, -3.5, y, 0.75, 0.82, 0.22)
    # Back-bar kept low (the camera looks in over the left side): a cabinet with two rows of bottles
    box('BackBar', wall, -X + T, -5.5, -5.0, 3.0, 0, 0.9)
    shelf = mat('BarShelf', srgb('#2a2a30'), rough=0.5)
    bottle_mats = [neon(f'Bottle{k}', c, 1.4) for k, c in enumerate(('#7dff9a', '#ffffff', '#ffe066', '#7fd8ff', '#ff9ad5'))]
    rng = random.Random(11)
    for z, x in ((0.9, -5.72), (1.25, -5.78)):
        box('BarShelf', shelf, -5.9, -5.5 if z < 1 else -5.62, -5.0, 3.0, z - 0.03, z)
        y = -4.85
        while y < 2.9:
            cyl('Bottle', bottle_mats[rng.randrange(len(bottle_mats))], x, y, z, z + 0.28, 0.045, seg=10)
            y += 0.3
    box('NeonPurple', purple, -5.9, -5.5, -5.0, 3.0, 0.86, 0.9)

    # VIP lounge on the right: raised, gold posts + red rope, red sofas, tables, ice bucket
    box('VipFloor', mat('VipFloor', srgb('#2a2333'), rough=0.5), 3.3, X - T, -4.5, 4.5, 0, 0.4)
    box('NeonYellow', yellow, 3.27, 3.3, -4.5, 4.5, 0.3, 0.35)
    box('VipStep', trim, 3.6, 4.6, -5.0, -4.5, 0, 0.2)
    gold = mat('Gold', srgb('#c9a227'), rough=0.25)
    rope = mat('VipRope', srgb('#a3122b'), rough=0.7)
    posts = [-3.4 + 1.12 * k for k in range(8)]
    for y in posts:
        cyl('VipPost', gold, 3.45, y, 0.4, 1.35, 0.045, seg=12)
        cyl('VipPostTop', gold, 3.45, y, 1.35, 1.42, 0.07, seg=12)
    for a, b in zip(posts, posts[1:]):
        box('VipRope', rope, 3.43, 3.47, a, b, 1.18, 1.22)
    sofa = mat('VipSofa', srgb('#7a1f35'), rough=0.85)
    glass = mat('VipTable', srgb('#1c1c22'), rough=0.15)
    for y0, y1 in ((-3.8, -1.8), (-1.2, 0.8), (1.4, 3.4)):
        box('VipSofa', sofa, 5.05, X - T, y0, y1, 0.4, 0.8)
        box('VipSofa', sofa, 5.6, X - T, y0, y1, 0.8, 1.45)
        box('VipSofa', sofa, 5.05, X - T, y0, y0 + 0.2, 0.8, 1.05)
        box('VipSofa', sofa, 5.05, X - T, y1 - 0.2, y1, 0.8, 1.05)
        box('VipTable', glass, 4.15, 4.75, (y0 + y1) / 2 - 0.45, (y0 + y1) / 2 + 0.45, 0.4, 0.78)
    cyl('IceBucket', chrome, 4.45, -0.2, 0.78, 1.0, 0.13)
    for dy, m in ((-0.04, bottle_mats[0]), (0.05, bottle_mats[2])):
        cyl('Bottle', m, 4.45 + dy, -0.2 + dy, 0.85, 1.18, 0.045, seg=10)
    # Spender screen above VIP
    box('SpendScreenFrame', cap, X - T - 0.08, X - T, -2.7, 2.7, 1.9, 3.7)
    box('SpendScreen', neon('SpendScreen', '#1b1440', 1.0), X - T - 0.1, X - T - 0.08, -2.55, 2.55, 2.02, 3.58)

    # Disco ball over the dance floor
    me = bpy.data.meshes.new('DiscoBall')
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.35)
    bm.to_mesh(me)
    bm.free()
    ball = bpy.data.objects.new('DiscoBall', me)
    bpy.context.scene.collection.objects.link(ball)
    ball.location = (0, 0.5, 3.4)
    me.materials.append(mat('DiscoBall', srgb('#e8ecf2'), rough=0.05))
    box('DiscoWire', chrome, -0.01, 0.01, 0.49, 0.51, 3.75, H + 0.1)

    cement = [mat(f'ClubSlab{k}', srgb(c), rough=0.9) for k, c in enumerate(('#a2a29d', '#94948f', '#aaaaa5', '#8c8c87'))]
    cx, cy, span = pavers([[-X - 0.1, X + 0.1, -Y - 0.1, Y + 0.1]], pad=3.0, size=(1.0, 1.0), materials=cement)
    grass(cx, cy, span)
    export(os.path.join(OUT, f"club-{theme['id']}.glb"))


CLUB_THEMES = [
    {'id': 'sazza', 'pink': '#ff3fb4', 'cyan': '#29e7ff', 'yellow': '#ffd23a', 'purple': '#a65bff',
     'screen': '#ff9cf0', 'bar': '#b8541f'},
]


# —— Growing a home ————————————————————————————————————————————————————————————————

# Wall lines (at the single room's size) that furniture can stand against
LINES_X = (-7.5, -3.5, 0.0, 3.5)
LINES_Y = (3.5, -3.5, -6.5)
STRUCTURE = ('Wall', 'BackWall', 'SideWall', 'FrontWall', 'InnerWall', 'Skirt', 'Fascia', 'Roof', 'CornerPost', 'EndPost')
GROUND = ('Grass', 'GrassInner', 'Paver', 'Plank')


def snap(v, lines, k, reach=0.6):
    """Where a coordinate goes when the home grows by k: next to a wall it keeps its distance
    from that wall, anywhere else it scales out from the middle."""
    line = min(lines, key=lambda l: abs(l - v))
    return line * k + (v - line) if abs(v - line) <= reach else v * k


def world_box(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [min(v[i] for v in bb) for i in range(3)], [max(v[i] for v in bb) for i in range(3)]


def grow(k):
    """Stretch walls and trims by k; move each piece of furniture (touching parts move together).
    Wall edges that frame a window or door follow that opening instead, so there are no gaps."""
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(GROUND)]
    walls = [o for o in meshes if o.name.startswith(STRUCTURE)]
    things = [o for o in meshes if not o.name.startswith(STRUCTURE)]

    # Group furniture parts that touch (toilet bowl + tank, table + chair, pot on the cooker …)
    boxes = {o.name: world_box(o) for o in things}
    parent = {o.name: o.name for o in things}

    def root(n):
        while parent[n] != n:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    names = list(boxes)
    for i, a in enumerate(names):
        (alo, ahi) = boxes[a]
        for b in names[i + 1:]:
            (blo, bhi) = boxes[b]
            if all(alo[d] <= bhi[d] + 0.1 and blo[d] <= ahi[d] + 0.1 for d in range(3)):
                parent[root(a)] = root(b)
    groups = {}
    for n in names:
        groups.setdefault(root(n), []).append(n)

    clusters = []  # (members, lo, hi, translation)
    for members in groups.values():
        lo = [min(boxes[n][0][d] for n in members) for d in range(3)]
        hi = [max(boxes[n][1][d] for n in members) for d in range(3)]
        t = []
        for d, lines in ((0, LINES_X), (1, LINES_Y)):
            # Outer walls win over the middle line (x 0) when a piece is near both
            near = [(l == 0, abs(v - l), l) for v in (lo[d], hi[d]) for l in lines if abs(v - l) <= 0.4]
            line = min(near)[2] if near else (lo[d] + hi[d]) / 2
            t.append(line * (k - 1))
        clusters.append((members, lo, hi, t))
    openings = [c for c in clusters if any(n.startswith(('WinGlass', 'Door')) for n in c[0])]

    def edge(o_lo, o_hi, axis, v, lines):
        """New position of a wall's end: follow a window/door it frames, else grow with the walls."""
        thin = 1 - axis
        for members, lo, hi, t in openings:
            same_wall = o_lo[thin] <= hi[thin] + 0.05 and lo[thin] <= o_hi[thin] + 0.05
            if same_wall and (abs(v - lo[axis]) <= 0.2 or abs(v - hi[axis]) <= 0.2) and lo[2] < o_hi[2] and o_lo[2] < hi[2] + 0.3:
                return v + t[axis]
        return snap(v, lines, k)

    for o in walls:
        lo, hi = world_box(o)
        out_lo, out_hi = list(lo), list(hi)
        sizes = [hi[0] - lo[0], hi[1] - lo[1]]
        # The thinner side is the wall's thickness; the other side runs along the wall (posts: both thin)
        thin = {0, 1} if max(sizes) < 0.3 else {0 if sizes[0] < sizes[1] else 1}
        for i, lines in ((0, LINES_X), (1, LINES_Y)):
            size = sizes[i]
            if i not in thin:
                out_lo[i], out_hi[i] = edge(lo, hi, i, lo[i], lines), edge(lo, hi, i, hi[i], lines)
            else:
                c = snap((lo[i] + hi[i]) / 2, lines, k)
                out_lo[i], out_hi[i] = c - size / 2, c + size / 2
        set_box(o, out_lo[0], out_hi[0], out_lo[1], out_hi[1])

    shifts = {}
    moved = set()
    for members, lo, hi, t in clusters:
        for n in members:
            o = bpy.data.objects[n]
            target = o.parent or o
            if target.name not in moved:
                moved.add(target.name)
                target.location.x += t[0]
                target.location.y += t[1]
            shifts[n] = [round(t[0], 4), round(-t[1], 4)]  # game coords: x, z = −y
    return shifts


def paint(name, hex_):
    m = bpy.data.materials.get(name)
    if not m:
        return
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    socket = bsdf.inputs['Base Color']
    for link in list(socket.links):
        m.node_tree.links.remove(link)
    socket.default_value = (*srgb(hex_), 1)


def finish(name, k, footprint, floors, walls):
    """Grow the home by k, lay its floors, pavers and lawn, paint the walls, export."""
    shifts = grow(k)
    for tag, (x0, x1, y0, y1), colors, size in floors:
        tile_floor(tag, snap(x0, LINES_X, k), snap(x1, LINES_X, k), snap(y0, LINES_Y, k), snap(y1, LINES_Y, k),
                   [mat(f'{tag}{i}', srgb(c)) for i, c in enumerate(colors)], size=size)
    rects = [[snap(x0, LINES_X, k), snap(x1, LINES_X, k), snap(y0, LINES_Y, k), snap(y1, LINES_Y, k)]
             for x0, x1, y0, y1 in footprint]
    cx, cy, span = pavers(rects)
    grass(cx, cy, span)
    for material, color in walls.items():
        paint(material, color)
    export(os.path.join(OUT, f'{name}.glb'))
    return {'k': k, 'shifts': shifts}


BATH = ('BathTile', (-3.5, 0.0, -6.5, -3.5), ('#c9ced3', '#aab2ba'), 0.5)
KITCHEN = ('KitchenTile', (0.0, 3.5, -6.5, -3.5), ('#f3f3f1', '#d5dadf'), 0.5)
GROW = {'selfcon': 1.4, 'one-bedroom': 1.6}
# 'Wall' + 'Partition': back, left and inside walls · 'Wall.001': the right-hand feature wall
WALLS = {
    'selfcon': {'Wall': '#f3dcc9', 'Partition': '#f3dcc9', 'Wall.001': '#c0603a'},
    'one-bedroom': {'Wall': '#d5e6d6', 'Partition': '#d5e6d6', 'Wall.001': '#1f6b5c'},
}

result = {}
load()
build_selfcon()
result['selfcon'] = finish(
    'selfcon', GROW['selfcon'], [[-3.6, 3.6, -6.6, 3.6]],
    [('RoomTile', (-3.5, 3.5, -3.5, 3.5), ('#ecdfc6', '#e1d1b2'), 0.6), BATH, KITCHEN],
    WALLS['selfcon'],
)
load()
build_selfcon()
build_one_bedroom()
result['one-bedroom'] = finish(
    'one-bedroom', GROW['one-bedroom'], [[-3.6, 3.6, -6.6, 3.6], [-7.6, -3.4, -3.6, 3.6]],
    [('ParlourTile', (-3.5, 3.5, -3.5, 3.5), ('#f2f2ef', '#e2e3e0'), 0.7),
     ('BedTile', (-7.5, -3.5, -3.5, 3.5), ('#dadde1', '#cdd2d8'), 0.6), BATH, KITCHEN],
    WALLS['one-bedroom'],
)
load()
build_hostel()
for theme in CLUB_THEMES:
    load()
    build_club(theme)
with open(os.path.join(OUT, 'room-shifts.json'), 'w') as f:
    json.dump(result, f, indent=1, sort_keys=True)
print('built rooms ->', OUT)
