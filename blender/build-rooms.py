"""
Builds the bigger homes from the single room.

  blender -b --python blender/build-rooms.py -- <single-room.glb> <out-dir>

Writes <out-dir>/selfcon.glb, <out-dir>/one-bedroom.glb and <out-dir>/room-shifts.json
(copy the JSON to lib/game/room-shifts.json: it tells the game where each piece moved).

Blender coords here: x = game x, y = -(game z), z = up. The single room's inside is
x/y ±3.4; back (y +3.5) and right (x +3.5) walls are full height, front and left are
low so the camera (front-left) can see in.

  Self-con:    single room + a strip in front (y -3.5 … -6.5) split into bath (left)
               and kitchen (right). Toilet, bucket and barrel move into the bath.
  One bedroom: self-con + a bedroom on the left (x -7.5 … -3.5). The bed and shelf
               move into it and the main room becomes a parlour with a sofa and TV.
Both bigger homes have full walls on three sides (back, left, right) with only the
front left low, a front door in the back wall, and tiled floors in every room (cream
for the self-con, white/grey for the one bedroom). Inside walls are half height so
every room stays visible from above; the game views these two from the front.

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


def tile_floor(name, x0, x1, y0, y1, colors, size=0.5):
    """Square tiles with grout lines, one mesh per colour."""
    grout = box(f'{name}Grout', mat('Grout', srgb('#9a958c')), x0, x1, y0, y1, -0.06, -0.008)
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


def pavers(rects, pad=2.15):
    """Replace the paver ring with one around the new footprint (list of [x0, x1, y0, y1])."""
    delete(o for o in bpy.data.objects if o.name == 'Paver' or o.name.startswith('Paver.'))
    materials = [bpy.data.materials[n] for n in ('Paver', 'Paver.001', 'Paver.002', 'Paver.003', 'Paver.004')]
    rng = random.Random(3)
    X0 = min(r[0] for r in rects) - pad
    X1 = max(r[1] for r in rects) + pad
    Y0 = min(r[2] for r in rects) - pad
    Y1 = max(r[3] for r in rects) + pad
    inside = lambda x, y: any(r[0] - 0.12 < x < r[1] + 0.12 and r[2] - 0.12 < y < r[3] + 0.12 for r in rects)
    groups = {i: [] for i in range(len(materials))}
    w, h = 0.53, 0.24
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

    # Left side is a full wall now (only the front stays low), with a corner post at the back
    delete([obj('SideWall')])
    outer_wall_y('Left', -3.5, -6.5, 3.5, inner=+1)
    move(['EndPostL'], dy=-9.91)  # end of the wall at the front-left corner
    post('CornerPostL', 'CornerPost', -3.41, 3.41)

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
    # Bedroom: x -7.5 … -3.5, y -3.5 … 3.5. The self-con's left wall now only closes the
    # bath; between parlour and bedroom it becomes a half-height inside wall with a door.
    set_box(obj('WallLeft'), y1=-3.41)
    set_box(obj('SkirtLeft'), y1=-3.5)
    set_box(obj('FasciaLeft'), y1=-3.41)
    set_box(obj('RoofLeft'), y1=-3.27)
    delete([obj('CornerPostL')])
    wall_y('InnerWallBed', -3.5, -3.44, 3.41, gaps=[(-2.05, -1.05)])
    box('BackWall', bpy.data.materials['Wall'], -7.59, -3.41, 3.41, 3.59, 0, 3.0)
    set_box(obj('SkirtL'), x0=-7.41)
    set_box(obj('FasciaL'), x0=-7.59)
    set_box(obj('RoofL'), x0=-7.83)
    outer_wall_y('BedLeft', -7.5, -3.5, 3.5, inner=+1)
    box('FrontWall', bpy.data.materials['FrontWall'], -7.59, -3.5, -3.59, -3.41, 0, 0.3)
    post('CornerPostBed', 'CornerPost', -7.41, 3.41)
    post('EndPostBed', 'EndPostL', -7.5, -3.5)


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
with open(os.path.join(OUT, 'room-shifts.json'), 'w') as f:
    json.dump(result, f, indent=1, sort_keys=True)
print('built rooms ->', OUT)
