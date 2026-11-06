"""
Cut the furniture each home comes with out of the home GLBs, one GLB per piece, so the shop can sell
copies: public/models/furniture/shop-<name>.glb (centred on x/z, standing on the floor, metres).
Headless:  blender -b --factory-startup -P scripts/blender/starter-pieces.py -- <repo root>
Node lists match lib/game/home-starters.ts.
"""
import bpy, sys, os

root = sys.argv[sys.argv.index("--") + 1]
OUT = os.path.join(root, "public", "models", "furniture")

PIECES = {
    # name: (source home glb, node names; a name also takes its ".001" copies)
    "shop-bed": ("one-bedroom", ["BedBase", "Mattress", "Pillow", "PillowEdge"]),
    "shop-shelf": ("one-bedroom", ["ShelfBoard", "ShelfPost"]),
    "shop-desk": ("one-bedroom", ["TableTop", "TableApron", "TableLeg", "WoodChair"]),
    "shop-cooler": ("one-bedroom", ["CoolerBody", "CoolerLid"]),
    "shop-sofa": ("one-bedroom", ["SofaBase", "SofaBack", "SofaArm", "SofaCushion", "SofaLeg"]),
    "shop-low-table": ("one-bedroom", ["LowTable", "LowTableLeg", "Rug", "RugInner"]),
    "shop-tv": ("one-bedroom", ["Tv", "TvFoot", "TvStand"]),
    "shop-red-chair": ("single-room", ["RedChair"]),
    "shop-drum": ("single-room", ["Barrel", "BarrelRim", "BarrelWater", "Jerrycan", "JerryCap", "JerryHandle"]),
}


def owns(nodes, name):
    for n in nodes:
        if name == n or name.startswith(n + "_") or (name.startswith(n + ".") and name[len(n) + 1:].isdigit()):
            return True
    return False


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


done = []
for piece, (home, nodes) in PIECES.items():
    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, "public", "models", home + ".glb"))
    # Top-level objects that belong to the piece (and everything under them)
    keep = set()
    for o in bpy.context.scene.objects:
        top = o
        while top.parent:
            top = top.parent
        if owns(nodes, o.name) or owns(nodes, top.name):
            keep.add(o)
            for c in o.children_recursive:
                keep.add(c)
    for o in list(bpy.context.scene.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        print("MISSING", piece)
        continue
    # Unparent with transforms kept, then centre on x/z and stand on the floor
    for o in list(bpy.context.scene.objects):
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    # Copies share one mesh in the GLB: give each its own before baking transforms
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    xs, ys, zs = [], [], []
    for o in meshes:
        for v in o.data.vertices:
            xs.append(v.co.x); ys.append(v.co.y); zs.append(v.co.z)
    cx, cy, mz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
    for o in meshes:
        for v in o.data.vertices:
            v.co.x -= cx; v.co.y -= cy; v.co.z -= mz
        o.data.update()
    out = os.path.join(OUT, piece + "-raw.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True)
    done.append(piece)
    print("EXPORTED", piece, len(meshes), "meshes", round(max(xs) - min(xs), 2), "x", round(max(ys) - min(ys), 2), "x", round(max(zs) - min(zs), 2))
print("DONE", done)
