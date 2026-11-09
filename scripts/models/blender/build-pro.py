"""
Builds the textured furniture that has no free ready-made model (beds, fridge, cooker, fan, TV).
Run headless:

  blender -b -P scripts/models/blender/build-pro.py -- <textureDir> <outDir>

<textureDir> holds ambientCG colour maps (CC0, ambientcg.com): Fabric036_Color.jpg, Wood066_Color.jpg ...
Output: <outDir>/<name>.glb  (metres, +Y up, front = +Z, origin = floor centre).
Materials whose name ends in "_fixed" keep their colour when a finish is applied (see build-pro.mjs).
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
TEX, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hexcol(h):
    h = h.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB -> linear
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1)


_mats = {}


def mat(name, color='#ffffff', tex=None, rough=0.8, metal=0.0, uvscale=None):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexcol(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if tex:
        img = bpy.data.images.load(os.path.join(TEX, tex))
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = img
        m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    _mats[name] = m
    return m


def uv_scale(obj, f):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.active
    if uv:
        for face in bm.faces:
            for l in face.loops:
                l[uv].uv *= f
    bm.to_mesh(obj.data)
    bm.free()


def box(name, size, loc, material, bevel=0.0, seg=3, uv=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=seg, affect='EDGES')
        bm.to_mesh(o.data)
        bm.free()
        bpy.ops.object.shade_smooth()
        # keep hard-ish look on the flat faces
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    if uv:
        uv_scale(o, uv)
    o.data.materials.append(material)
    return o


def cyl(name, r, h, loc, material, rot=(0, 0, 0), seg=24, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    o.data.materials.append(material)
    return o


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_image_format='JPEG', export_jpeg_quality=85,
        export_cameras=False, export_lights=False)
    print('exported', name)


def bed(name, w, l, frame_h=0.28, mattress_h=0.24, head_h=0.9, vono=True):
    """Spring bed: wooden frame + headboard, quilted fabric mattress, duvet and two pillows. Head at +Y (the back)."""
    reset()
    _mats.clear()
    wood = mat('Wood_fixed', '#ffffff', 'Wood066_Color.jpg', 0.6)
    fab = mat('Fabric', '#ffffff', 'Fabric036_Color.jpg', 0.95)
    pil = mat('Pillow', '#f4f1ec', None, 0.95)
    leg = mat('Leg_fixed', '#3b2a22', None, 0.6)
    t = 0.05
    # base frame (side rails + slats box)
    box('Rail', (w, l, frame_h * 0.55), (0, 0, frame_h * 0.55 / 2 + 0.1), wood, bevel=0.012, uv=1.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('Leg', (0.07, 0.07, 0.1), (sx * (w / 2 - 0.06), sy * (l / 2 - 0.06), 0.05), leg, bevel=0.01)
    # headboard (tall) and footboard (low)
    box('Head', (w + 0.06, 0.08, head_h), (0, l / 2 - 0.02, head_h / 2 + 0.06), wood, bevel=0.02, uv=1.5)
    box('Foot', (w + 0.06, 0.06, frame_h + 0.22), (0, -l / 2 + 0.02, (frame_h + 0.22) / 2 + 0.06), wood, bevel=0.02, uv=1.5)
    top = 0.1 + frame_h * 0.55
    # mattress with rounded edges
    box('Mattress', (w - 0.1, l - 0.2, mattress_h), (0, 0.0, top + mattress_h / 2), fab, bevel=0.05, seg=4, uv=2.2)
    # duvet over the lower two thirds
    box('Duvet', (w - 0.06, (l - 0.2) * 0.62, 0.07), (0, -(l - 0.2) * 0.17, top + mattress_h + 0.03), fab, bevel=0.03, seg=3, uv=2.2)
    # pillows
    pw = (w - 0.3) / 2 if w > 1.2 else w - 0.3
    for i, px in enumerate(([-1, 1] if w > 1.2 else [0])):
        box('Pillow', (pw - 0.04, 0.38, 0.13), (px * (pw / 2 + 0.02) if w > 1.2 else 0, l / 2 - 0.34, top + mattress_h + 0.07), pil, bevel=0.05, seg=3)
    export(name)


def fridge(name, w, d, h, doors=1, handle='#c9ccd1'):
    reset()
    _mats.clear()
    body = mat('Body', '#f3f4f6', None, 0.35)
    steel = mat('Handle_fixed', handle, None, 0.25, 1.0)
    dark = mat('Seal_fixed', '#2b2d31', None, 0.6)
    box('Body', (w, d, h - 0.04), (0, 0, (h - 0.04) / 2 + 0.04), body, bevel=0.03, seg=4)
    box('Plinth', (w * 0.9, d * 0.9, 0.04), (0, 0, 0.02), dark)
    front = -d / 2 - 0.003
    if doors == 1:
        # freezer split near the top
        box('Split', (w * 0.98, 0.01, 0.012), (0, front, h * 0.72), dark)
        box('HandleA', (0.025, 0.035, h * 0.12), (w / 2 - 0.07, front - 0.02, h * 0.82), steel, bevel=0.008)
        box('HandleB', (0.025, 0.035, h * 0.28), (w / 2 - 0.07, front - 0.02, h * 0.45), steel, bevel=0.008)
    else:
        box('Split', (0.012, 0.01, h * 0.96), (0, front, h / 2), dark)
        for sx in (-1, 1):
            box('Handle', (0.03, 0.04, h * 0.35), (sx * 0.05, front - 0.02, h * 0.55), steel, bevel=0.008)
    export(name)


def cooker(name, w, d, h):
    reset()
    _mats.clear()
    body = mat('Body', '#e7e9ec', None, 0.35)
    steel = mat('Steel_fixed', '#b8bcc2', None, 0.3, 1.0)
    black = mat('Black_fixed', '#1d1f23', None, 0.5)
    glass = mat('Glass_fixed', '#101418', None, 0.12)
    box('Body', (w, d, h - 0.06), (0, 0, (h - 0.06) / 2), body, bevel=0.02, seg=3)
    box('Hob', (w + 0.01, d + 0.01, 0.03), (0, 0, h - 0.045), steel, bevel=0.01)
    # four burners with pan rests
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * w * 0.24, sy * d * 0.22
            cyl('Burner', w * 0.1, 0.02, (cx, cy, h - 0.02), black, seg=20)
            cyl('Cap', w * 0.055, 0.025, (cx, cy, h - 0.01), steel, seg=20)
    # grate bars
    box('GrateX', (w * 0.92, 0.015, 0.012), (0, 0, h - 0.0), black)
    box('GrateY', (0.015, d * 0.92, 0.012), (0, 0, h - 0.0), black)
    # oven door with glass window, handle and knobs
    fy = -d / 2 - 0.004
    box('Door', (w * 0.92, 0.03, (h - 0.3)), (0, fy, (h - 0.3) / 2 + 0.04), steel, bevel=0.01)
    box('Window', (w * 0.66, 0.012, (h - 0.3) * 0.5), (0, fy - 0.016, (h - 0.3) * 0.5), glass, bevel=0.01)
    cyl('Handle', 0.014, w * 0.8, (0, fy - 0.045, h - 0.27), steel, rot=(0, math.pi / 2, 0), seg=12)
    for i in range(4):
        cyl('Knob', 0.022, 0.03, (-w * 0.33 + i * w * 0.22, fy - 0.012, h - 0.14), black, rot=(math.pi / 2, 0, 0), seg=14)
    export(name)


def fan(name, h=1.4):
    reset()
    _mats.clear()
    metal = mat('Metal_fixed', '#c7cbd1', None, 0.35, 0.9)
    body = mat('Body', '#2f6fb5', None, 0.5)
    black = mat('Black_fixed', '#1a1c20', None, 0.5)
    cyl('Base', 0.24, 0.05, (0, 0, 0.025), black, seg=32)
    cyl('Pole', 0.022, h - 0.35, (0, 0, (h - 0.35) / 2 + 0.05), metal, seg=14)
    cyl('Motor', 0.075, 0.16, (0, 0.04, h - 0.2), body, rot=(math.pi / 2, 0, 0), seg=20)
    # guard: two rings + a few spokes, blades inside
    cy = h - 0.2
    cyl('Ring', 0.22, 0.012, (0, -0.07, cy), metal, rot=(math.pi / 2, 0, 0), seg=40)
    bpy.context.active_object.data.polygons.foreach_set('use_smooth', [True] * len(bpy.context.active_object.data.polygons))
    cyl('RingBack', 0.22, 0.012, (0, 0.12, cy), metal, rot=(math.pi / 2, 0, 0), seg=40)
    for i in range(8):
        a = i * math.pi / 4
        box('Spoke', (0.22, 0.006, 0.006), (math.cos(a) * 0.11, 0.02, cy + math.sin(a) * 0.11), metal)
        bpy.context.active_object.rotation_euler = (0, -a, 0)
    for i in range(4):
        a = i * math.pi / 2 + 0.3
        box('Blade', (0.2, 0.012, 0.075), (math.cos(a) * 0.1, -0.03, cy + math.sin(a) * 0.1), body)
        bpy.context.active_object.rotation_euler = (0, -a, 0)
    cyl('Hub', 0.04, 0.05, (0, -0.05, cy), black, rot=(math.pi / 2, 0, 0), seg=16)
    export(name)


def tv(name, w=1.25, h=0.72):
    """Flat-screen TV on a short stand; wall pieces just show the slab (bottom of the model is the wall mount height)."""
    reset()
    _mats.clear()
    bezel = mat('Bezel', '#1b1d21', None, 0.4)
    screen = mat('Screen_fixed', '#0c1016', None, 0.1)
    steel = mat('Stand_fixed', '#9aa0a8', None, 0.35, 0.8)
    box('Bezel', (w, 0.045, h), (0, 0, h / 2 + 0.06), bezel, bevel=0.012)
    box('Screen', (w - 0.04, 0.006, h - 0.04), (0, -0.024, h / 2 + 0.06), screen)
    box('Neck', (0.1, 0.05, 0.06), (0, 0.03, 0.06), steel, bevel=0.01)
    box('Foot', (w * 0.4, 0.2, 0.02), (0, 0.04, 0.01), steel, bevel=0.006)
    export(name)


bed('bed-vono-double', 1.6, 2.1, frame_h=0.3, mattress_h=0.26, head_h=1.0)
bed('bed-vono-single', 1.0, 2.0, frame_h=0.28, mattress_h=0.22, head_h=0.85)
fridge('fridge-single', 0.62, 0.65, 1.7)
fridge('fridge-tabletop', 0.5, 0.5, 0.85)
fridge('fridge-double', 0.95, 0.7, 1.85, doors=2)
cooker('cooker-gas', 0.6, 0.6, 0.9)
fan('fan-standing', 1.4)
tv('tv-flat', 1.25, 0.72)
