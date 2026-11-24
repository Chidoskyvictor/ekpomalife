# Transparent cut-outs of our cars and a character for the race flyer.
# blender -b brand/film/race.blend -P brand/graphics/cutouts.py   (race.blend is not saved)
import bpy, math, os
from mathutils import Vector

OUT = 'C:/Users/USER/ekpomalife/brand/graphics/assets/cutouts/'
MODELS = 'C:/Users/USER/ekpomalife/public/models/'
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
sc.frame_set(1)
r = sc.render
r.use_motion_blur = False
r.film_transparent = True
r.resolution_x, r.resolution_y = 1600, 1200
sc.eevee.taa_render_samples = 64
sc.view_settings.exposure = 0.3
for c in ('City', 'Set', 'Gantries'):
    bpy.data.collections[c].hide_render = True
for o in sc.objects:
    if o.name.startswith('smoke'):
        o.hide_render = True
# studio light: soft sky plus a warm key and a cool rim
w = bpy.data.worlds.new('studio')
w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.6, 0.7, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
sc.world = w
sun = bpy.data.objects['sun']
sun.data.energy = 3.0
sun.data.color = (1.0, 0.9, 0.8)
sun.rotation_euler = (math.radians(45), 0, math.radians(-30))
rim_d = bpy.data.lights.new('rim', 'SUN')
rim_d.energy = 2.0
rim_d.color = (0.55, 0.7, 1.0)
rim = bpy.data.objects.new('rim', rim_d)
sc.collection.objects.link(rim)
rim.rotation_euler = (math.radians(60), 0, math.radians(160))
cam = bpy.data.objects['CAM']
cam.animation_data_clear()
cam.data.animation_data_clear()


def tree(o):
    return [o] + list(o.children_recursive)


def bounds(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = -mn
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != 'MESH' or o.hide_render:
            continue
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            v = oe.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, v))
            mx = Vector(map(max, mx, v))
    return mn, mx


def import_glb(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    rig = bpy.data.objects.new(name, None)
    sc.collection.objects.link(rig)
    for o in new:
        if o.parent is None:
            o.parent = rig
    return rig


gt = import_glb(MODELS + 'cars/gt3.glb', 'GT')
man = import_glb(MODELS + 'male.glb', 'MAN')
gt.location = man.location = (500, 500, 0)
ALL = ('LEXUS', 'BENZ', 'TRUCK', 'GT', 'MAN')
PAINT = {}
painted = {}
for rig, col in PAINT.items():
    for o in tree(bpy.data.objects[rig]):
        if o.type != 'MESH' or o.name.startswith('plate'):
            continue
        for i, m in enumerate(o.data.materials):
            if not m or not m.use_nodes or 'plate' in m.name.lower():
                continue
            b = m.node_tree.nodes.get('Principled BSDF')
            if not b:
                continue
            bc = b.inputs['Base Color']
            c = bc.default_value
            # body paint: light, unlit by a texture, not glass
            if bc.is_linked or c[0] < 0.6 or c[1] < 0.6 or c[2] < 0.6 or b.inputs['Alpha'].default_value < 0.99:
                continue
            if b.inputs.get('Transmission Weight') and b.inputs['Transmission Weight'].default_value > 0.1:
                continue
            nm = m.copy()
            nm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1)
            nm.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.6
            nm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.25
            o.data.materials[i] = nm
            painted.setdefault(rig, []).append(m.name)
print('PAINTED', painted)


def shoot(name, fname, front_sign, yaw_off, lens, height_frac, dist_mul):
    for n in ALL:
        for o in tree(bpy.data.objects[n]):
            o.hide_render = n != name
    bpy.context.view_layer.update()
    objs = tree(bpy.data.objects[name])
    mn, mx = bounds(objs)
    c = (mn + mx) / 2
    size = max(mx.x - mn.x, mx.y - mn.y)
    h = mx.z - mn.z
    # view from in front (front_sign picks the model's nose end along y) and a little to the side, low
    a = math.radians(yaw_off)
    d = Vector((math.sin(a), front_sign * math.cos(a), 0))
    target = Vector((c.x, c.y, mn.z + h * 0.45))
    eye = target + d * size * dist_mul + Vector((0, 0, h * height_frac))
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    r.filepath = OUT + fname
    bpy.ops.render.render(write_still=True)


# Cars face +y in the film scene (rig rotated pi); the GT as imported: find its nose by trying both and keeping the brighter-lit front later
shoot('GT', 'gt.png', -1, 22, 24, 0.25, 1.05)
shoot('BENZ', 'benz.png', 1, -35, 28, 0.3, 1.2)
shoot('LEXUS', 'lexus.png', 1, 35, 28, 0.3, 1.2)
print('done')
