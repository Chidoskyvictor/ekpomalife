# Rig a static low-poly character GLB: skeleton + proximity skin weights + Idle/Walk actions.
# Usage: blender -b --python rig.py -- <in.glb> <body:male|female> <out.glb> <out.blend>
import bpy, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, body, out_glb, out_blend = args[:4]

J = {
    'male': dict(
        hips=(0, 0.03, 1.00), spine=(0, 0.03, 1.18), chest=(0, 0.03, 1.40), neck=(0, 0.04, 1.62),
        head=(0, 0.03, 1.73), head_top=(0, 0.03, 1.99),
        shoulder=(0.21, 0.07, 1.57), elbow=(0.343, 0.05, 1.29), wrist=(0.48, 0.015, 0.96), hand_tip=(0.52, 0.0, 0.83),
        hip=(0.10, 0.03, 0.97), knee=(0.135, 0.05, 0.51), ankle=(0.18, 0.09, 0.11), toe=(0.18, -0.12, 0.03),
    ),
    'female': dict(
        hips=(0, 0.01, 0.87), spine=(0, 0.01, 1.02), chest=(0, 0.01, 1.22), neck=(0, -0.01, 1.44),
        head=(0, -0.02, 1.53), head_top=(0, -0.03, 1.79),
        shoulder=(0.145, 0.03, 1.43), elbow=(0.263, 0.046, 1.206), wrist=(0.412, 0.027, 0.988), hand_tip=(0.44, 0.01, 0.885),
        hip=(0.085, 0.01, 0.85), knee=(0.087, 0.0, 0.496), ankle=(0.115, 0.01, 0.117), toe=(0.115, -0.17, 0.03),
    ),
}[body]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
scene.render.fps = 30

# Flatten: unparent meshes (keep world transform), apply transforms, drop empties
meshes = [o for o in scene.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in scene.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o)

# —— Armature ——
arm_data = bpy.data.armatures.new('Armature')
rig = bpy.data.objects.new('Armature', arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
FORWARD = Vector((0, -1, 0))

def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    b.align_roll(FORWARD if abs((b.tail - b.head).normalized().y) < 0.9 else Vector((0, 0, 1)))
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b

def mirror(p):
    return (-p[0], p[1], p[2])

bone('Hips', J['hips'], J['spine'])
bone('Spine', J['spine'], J['chest'], 'Hips', True)
bone('Chest', J['chest'], J['neck'], 'Spine', True)
bone('Neck', J['neck'], J['head'], 'Chest', True)
bone('Head', J['head'], J['head_top'], 'Neck', True)
for side, f in (('L', lambda p: p), ('R', mirror)):
    bone(f'UpperArm.{side}', f(J['shoulder']), f(J['elbow']), 'Chest')
    bone(f'LowerArm.{side}', f(J['elbow']), f(J['wrist']), f'UpperArm.{side}', True)
    bone(f'Hand.{side}', f(J['wrist']), f(J['hand_tip']), f'LowerArm.{side}', True)
    bone(f'UpperLeg.{side}', f(J['hip']), f(J['knee']), 'Hips')
    bone(f'LowerLeg.{side}', f(J['knee']), f(J['ankle']), f'UpperLeg.{side}', True)
    bone(f'Foot.{side}', f(J['ankle']), f(J['toe']), f'LowerLeg.{side}', True)
segments = {b.name: (b.head.copy(), b.tail.copy()) for b in eb}
bpy.ops.object.mode_set(mode='OBJECT')

# —— Skin weights: nearest bone segments, limbs kept to their own side ——
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length

hip_z = J['hips'][2]
for o in meshes:
    # Tops (whole mesh above the hips) never follow the legs
    top_only = min(v.co.z for v in o.data.vertices) > hip_z - 0.1
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    o.parent = rig
    groups = {name: o.vertex_groups.new(name=name) for name in segments}
    for v in o.data.vertices:
        p = v.co
        cands = []
        for name, (a, b) in segments.items():
            if name.endswith('.L') and p.x < -0.01:
                continue
            if name.endswith('.R') and p.x > 0.01:
                continue
            # Legs only below the hip line, arms only away from the torso
            if 'Leg' in name or 'Foot' in name:
                if top_only or p.z > hip_z + 0.06:
                    continue
            d = seg_dist(p, a, b)
            cands.append((d, name))
        cands.sort()
        top = cands[:3]
        ws = [(1.0 / max(d, 0.004) ** 5, n) for d, n in top]
        total = sum(w for w, _ in ws)
        for w, n in ws:
            if w / total > 0.02:
                groups[n].add([v.index], w / total, 'REPLACE')

# —— Animation helpers ——
rig.animation_data_create()
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = 'XYZ'

def key(frame, rots, hips_z=0.0):
    for b in pb:
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
    for name, (x, y, z) in rots.items():
        pb[name].rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
    pb['Hips'].location = (0, hips_z, 0)  # Hips local Y = world up
    for b in pb:
        b.keyframe_insert('rotation_euler', frame=frame)
        b.keyframe_insert('location', frame=frame)

# Sign conventions (checked in preview renders): LEG > 0 swings the leg forward,
# KNEE > 0 bends the knee backwards, ARM_DOWN lowers the A-pose arms toward the body.
LEG, KNEE, ARM_SWING, ARM_DOWN, ELBOW, SPINE_FWD = 1, -1, 1, -1, -1, 1
HEIGHT_SCALE = J['hips'][2]

# How far the A-pose arms drop toward the body (walk, idle). The man's rest pose is wider-set.
ARMS = {'male': (22, 26), 'female': (18, 20)}[body]

def arms_down(deg):
    return {'UpperArm.L': (0, 0, ARM_DOWN * deg), 'UpperArm.R': (0, 0, -ARM_DOWN * deg)}

def make_action(name, frames, pose_at):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for f in range(0, frames + 1, 2):
        rots, z = pose_at(f / frames)
        key(f, rots, z)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    rig.animation_data.action = None
    return action

def walk(t):
    ph = 2 * math.pi * t
    s, c = math.sin(ph), math.cos(ph)
    rots = arms_down(ARMS[0])
    rots['UpperLeg.L'] = (LEG * 26 * s, 0, 0)
    rots['UpperLeg.R'] = (-LEG * 26 * s, 0, 0)
    rots['LowerLeg.L'] = (KNEE * (6 + 42 * max(0.0, c)), 0, 0)
    rots['LowerLeg.R'] = (KNEE * (6 + 42 * max(0.0, -c)), 0, 0)
    rots['Foot.L'] = (-LEG * 10 * s, 0, 0)
    rots['Foot.R'] = (LEG * 10 * s, 0, 0)
    ul = rots['UpperArm.L']
    ur = rots['UpperArm.R']
    rots['UpperArm.L'] = (-ARM_SWING * 24 * s, ul[1], ul[2])
    rots['UpperArm.R'] = (ARM_SWING * 24 * s, ur[1], ur[2])
    rots['LowerArm.L'] = (ELBOW * (14 + 12 * max(0.0, -s)), 0, 0)
    rots['LowerArm.R'] = (ELBOW * (14 + 12 * max(0.0, s)), 0, 0)
    rots['Spine'] = (0, 6 * s, 0)
    rots['Chest'] = (0, -9 * s, 0)
    return rots, 0.025 * math.cos(2 * ph) - 0.01

def idle(t):
    ph = 2 * math.pi * t
    rots = arms_down(ARMS[1] + 1.5 * math.sin(ph))
    rots['Chest'] = (1.5 * math.sin(ph), 0, 0)
    rots['Head'] = (0, 3 * math.sin(ph), 0)
    rots['LowerArm.L'] = (ELBOW * 8, 0, 0)
    rots['LowerArm.R'] = (ELBOW * 8, 0, 0)
    return rots, 0.0

def sit(t):
    # Thighs level, shins down, hands resting on the knees
    ph = 2 * math.pi * t
    rots = arms_down(ARMS[1] - 6)
    rots['UpperLeg.L'] = (LEG * 88, 0, 4)
    rots['UpperLeg.R'] = (LEG * 88, 0, -4)
    rots['LowerLeg.L'] = (KNEE * 88, 0, 0)
    rots['LowerLeg.R'] = (KNEE * 88, 0, 0)
    ul, ur = rots['UpperArm.L'], rots['UpperArm.R']
    rots['UpperArm.L'] = (28, ul[1], ul[2])
    rots['UpperArm.R'] = (28, ur[1], ur[2])
    rots['LowerArm.L'] = (ELBOW * 40, 0, 0)
    rots['LowerArm.R'] = (ELBOW * 40, 0, 0)
    rots['Chest'] = (1.5 * math.sin(ph), 0, 0)
    rots['Head'] = (0, 4 * math.sin(ph), 0)
    return rots, 0.0

def bath(t):
    # Crouched over the bucket, scrubbing with alternating arms
    ph = 2 * math.pi * t
    s = math.sin(ph)
    rots = arms_down(ARMS[1] - 8)
    rots['UpperLeg.L'] = (LEG * 70, 0, 8)
    rots['UpperLeg.R'] = (LEG * 70, 0, -8)
    rots['LowerLeg.L'] = (KNEE * 105, 0, 0)
    rots['LowerLeg.R'] = (KNEE * 105, 0, 0)
    rots['Foot.L'] = (LEG * 35, 0, 0)
    rots['Foot.R'] = (LEG * 35, 0, 0)
    rots['Spine'] = (SPINE_FWD * 22, 0, 0)
    rots['Chest'] = (SPINE_FWD * 12, 0, 0)
    ul, ur = rots['UpperArm.L'], rots['UpperArm.R']
    rots['UpperArm.L'] = (55 + 20 * s, ul[1], ul[2])
    rots['UpperArm.R'] = (55 - 20 * s, ur[1], ur[2])
    rots['LowerArm.L'] = (ELBOW * (55 + 25 * s), 0, 0)
    rots['LowerArm.R'] = (ELBOW * (55 - 25 * s), 0, 0)
    return rots, -0.32 * HEIGHT_SCALE

def dance(t):
    # Club two-step: bounce on the beat, step side to side, arms pumping, head nodding
    ph = 2 * math.pi * t
    s, beat = math.sin(ph), math.cos(2 * ph)
    rots = arms_down(ARMS[1] - 4)
    rots['UpperLeg.L'] = (LEG * (10 + 8 * max(0.0, s)), 0, 6 + 4 * s)
    rots['UpperLeg.R'] = (LEG * (10 + 8 * max(0.0, -s)), 0, -6 + 4 * s)
    rots['LowerLeg.L'] = (KNEE * (14 + 10 * (1 - beat)), 0, 0)
    rots['LowerLeg.R'] = (KNEE * (14 + 10 * (1 - beat)), 0, 0)
    rots['Spine'] = (SPINE_FWD * 5, 5 * s, 0)
    rots['Chest'] = (SPINE_FWD * 3, -3 * s, 3 * s)
    ul, ur = rots['UpperArm.L'], rots['UpperArm.R']
    rots['UpperArm.L'] = (25 + 18 * s, ul[1], ul[2])
    rots['UpperArm.R'] = (25 - 18 * s, ur[1], ur[2])
    rots['LowerArm.L'] = (ELBOW * (62 + 18 * s), 0, 0)
    rots['LowerArm.R'] = (ELBOW * (62 - 18 * s), 0, 0)
    rots['Head'] = (8 * max(0.0, beat), 6 * s, 0)
    return rots, -0.035 * (1 - beat) * HEIGHT_SCALE


make_action('Sit', 60, sit)
make_action('Dance', 30, dance)
make_action('Bath', 40, bath)
make_action('Idle', 90, idle)
make_action('Walk', 30, walk)
scene.frame_start, scene.frame_end = 0, 30

bpy.ops.wm.save_as_mainfile(filepath=out_blend)
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_skins=True,
    export_yup=True,
    export_apply=False,
)
print('RIGGED', body, len(meshes), 'meshes')
