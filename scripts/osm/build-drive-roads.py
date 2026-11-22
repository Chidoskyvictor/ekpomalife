"""
The street-level driving world, from OpenStreetMap -> lib/game/drive-roads.json (+ building tiles).

Covers all of Ekpoma (Iruekpen, Ujemen, Ekpoma town, Akhia, Egoro; bbox 6.69-6.79N, 6.05-6.18E) at REAL
scale (1 game metre = 1 real metre), x east, z south, origin 6.7450N 6.0950E. The game reads the JSON
only: nothing calls OpenStreetMap at run time.

Output
  lib/game/drive-roads.json   roads (polylines), graph (nodes at intersections; edges = road stretches
                              between consecutive nodes), junctions, places, street signs, area gantries
  public/drive/buildings/     building footprints in 250 m tiles: index.json + <ix>_<iz>.json,
                              {"buildings":[{"ring":[x,z,x,z,...]}]} in local metres (0.1 m), so the
                              game can stream the tiles around the car
  brand/map-data/drive-review.png (+ -centre.png)  review maps with every place and gantry labelled

Road kinds:  highway = trunk (Benin-Auchi Road; 3 lanes each side + median later)
             road    = primary / secondary / tertiary (+ links)
             street  = residential / unclassified / living_street
             (service, tracks, paths, footways are dropped)

  python scripts/osm/build-drive-roads.py [ekpoma-osm.json]
The input is a saved Overpass dump (`out geom`, ways with `geometry`), by default the one in the
main checkout's brand/map-data. Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, re, sys, heapq
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLACES_TS = os.path.join(ROOT, "backend", "src", "game", "places.ts")
OUT = os.path.join(ROOT, "lib", "game", "drive-roads.json")
TILES_DIR = os.path.join(ROOT, "public", "drive", "buildings")
REVIEW = os.path.join(ROOT, "brand", "map-data", "drive-review.png")
DEFAULT_DUMP = os.path.join(ROOT.split(os.sep + ".claude" + os.sep)[0], "brand", "map-data", "ekpoma-osm.json")

SCALE = 1.0
ORIGIN = (6.7450, 6.0950)
BBOX = (6.69, 6.05, 6.79, 6.18)  # S W N E
TILE = 250

KIND = {
    "trunk": "highway",
    "trunk_link": "road", "primary": "road", "primary_link": "road", "secondary": "road", "secondary_link": "road",
    "tertiary": "road", "tertiary_link": "road",
    "residential": "street", "unclassified": "street", "living_street": "street",
}
RANK = {"highway": 3, "road": 2, "street": 1}

# Stable ids / owner-confirmed names for the two long roads
EXPRESSWAY_NAME = "Benin-Auchi Road"
OLD_ROAD_OSM = "Ihumudum-Ujumen Road"
OLD_ROAD_NAME = "Ihumudumu Road"
# G1 and G2 are neighbours; coming from the school gate (west) you reach G1 first, then G2 (owner).
# OSM labels the western one "G2 Road" and leaves the eastern one unnamed.
RENAME = {"G2 Road": "G1 Road", OLD_ROAD_OSM: OLD_ROAD_NAME}
# Unnamed streets the owner named: (lat, lon) of a point on them -> name
UNNAMED = [((6.7440, 6.1129), "G2 Road")]

# Our places by the owner's descriptions: (road id, cross street on it or None, metres past that
# junction (or share of the road when None), side). Each then snaps to the nearest real footprint.
PLACES = {
    "sazza": ("expressway", "Oriafor Road", 0, "opposite"),  # facing the mouth of Oriafor Road
    "college-of-medicine": ("expressway", "King Jesus Road", 24, "south"),
    "relaxation-centre": ("expressway", "Faith Baptist Road", 30, "south"),
    "town-shop-1": ("expressway", "GT Road", 24, "north"),
    "bukka": ("expressway", "Debow Road", 34, "north"),
    "keke-park": ("expressway", "Poultry Road", 44, "north"),
    "off-campus-hostels": ("poultry-road", None, 0.5, "east"),
    "cattle-market": ("expressway", "Oriafor Road", -190, "north"),
    "shop-low-1": ("oriafor-road", None, 0.5, "east"),
    "innovation-hub": ("ihumudumu-road", "Oriafor Road", 36, "north"),
    "magmus-autos": ("expressway", "Efe Block Road", 44, "south"),
    "wise-gourmet": ("expressway", "Efe Block Road", -36, "north"),
    "shop-mid-1": ("efe-block-road", None, 0.5, "east"),
    "above-the-hills-church": ("ihumudumu-road", "Efe Block Road", 40, "north"),
    "spot-rite": ("expressway", "Saint Nicolas Street", 34, "north"),
    "forbes": ("expressway", "Saint Nicolas Street", -50, "south"),
    "shop-mid-2": ("saint-nicolas-street", None, 0.5, "west"),
    "park": ("ihumudumu-road", "Saint Nicolas Street", 36, "north"),
    "denco": ("expressway", "Edeoghon Street", 34, "south"),
    "playchill-climax": ("expressway", "Edeoghon Street", -40, "north"),
    "shop-low-2": ("edeoghon-street", None, 0.5, "east"),
    "dubious": ("g1-road", None, 0.5, "west"),
    "shop-low-3": ("ihumudumu-road", "G1 Road", 40, "north"),
    "anonymous-zone": ("g2-road", None, 0.5, "east"),
    "market-square": ("expressway", "G2 Road", 60, "south"),
}
# AAU main campus: the gate road leaves the expressway's south side just west of Poultry Road.
GATE_LON = 6.0838
# Campus places, spread over the real campus buildings (nearest the gate first)
CAMPUS = ["admin-block", "ict-exams", "education", "mass-comm", "students-centre", "law-campus", "engineering",
          "physical-science", "social-science", "life-science", "management-science", "clinic", "cordelia-hall",
          "twin-hall", "school-hostels-1", "school-hostels-2", "sports-complex", "shuttle-park"]
# Halls around the College of Medicine
MEDICINE = ["etf-hall", "hall-100", "hall-200", "mls-hall"]
# Area gantries: (text, lat, lon, radius m). The sign stands where a highway/road enters the circle.
AREAS = [("IRUEKPEN", None, None, 380), ("UJEMEN", None, None, 380), ("EKPOMA", None, None, 1500),
         ("AKHIA", None, None, 500), ("EGORO", None, None, 450), ("EGORO-AMEDE", None, None, 450)]


def to_xz(lat, lon):
    return ((lon - ORIGIN[1]) * 110_570 * SCALE, -(lat - ORIGIN[0]) * 110_600 * SCALE)


def inside_bbox(g):
    return BBOX[0] <= g["lat"] <= BBOX[2] and BBOX[1] <= g["lon"] <= BBOX[3]


def simplify(pts, tol):
    """Douglas-Peucker (iterative-safe for our sizes)."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    seg = math.dist(a, b) or 1e-9
    worst, at = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - a[0]) * (b[1] - a[1]) - (pts[i][1] - a[1]) * (b[0] - a[0])) / seg if math.dist(a, b) else math.dist(pts[i], a)
        if d > worst:
            worst, at = d, i
    if worst <= tol:
        return [a, b]
    return simplify(pts[: at + 1], tol)[:-1] + simplify(pts[at:], tol)


def cum(pts):
    out = [0.0]
    for a, b in zip(pts, pts[1:]):
        out.append(out[-1] + math.dist(a, b))
    return out


def project(pts, p):
    """Nearest point on a polyline: (s, signed offset (+ = right of travel), gap, point)."""
    best = (0.0, 0.0, 1e18, pts[0])
    run = 0.0
    for a, b in zip(pts, pts[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        seg = math.hypot(dx, dz)
        if seg == 0:
            continue
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (seg * seg)))
        qx, qz = a[0] + dx * t, a[1] + dz * t
        gap = math.hypot(p[0] - qx, p[1] - qz)
        if gap < best[2]:
            side = (p[0] - qx) * (-dz) + (p[1] - qz) * dx
            best = (run + seg * t, math.copysign(gap, side) if side else 0.0, gap, (qx, qz))
        run += seg
    return best


def point_at(pts, at, s):
    s = max(0.0, min(at[-1], s))
    i = 1
    while i < len(at) - 1 and at[i] < s:
        i += 1
    a, b = pts[i - 1], pts[i]
    seg = at[i] - at[i - 1] or 1.0
    t = (s - at[i - 1]) / seg
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg)


def side_of(pts, at, s, compass):
    _, _, dx, dz = point_at(pts, at, s)
    right = (-dz, dx)
    want = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}[compass]
    return 1 if right[0] * want[0] + right[1] * want[1] >= 0 else -1


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def key(g):
    return (round(g["lat"], 7), round(g["lon"], 7))


def main():
    dump = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DUMP
    els = json.load(open(dump, encoding="utf-8"))["elements"]
    ways = [e for e in els if e["type"] == "way" and e.get("geometry")]
    area_nodes = {e["tags"]["name"].upper(): (e["lat"], e["lon"]) for e in els if e["type"] == "node" and e.get("tags", {}).get("place")}

    # ---- roads: clip to the bbox, then join same-name same-kind ways end to end ----
    pieces = []  # [kind, name, [geom...], osm id]
    for w in ways:
        kind = KIND.get(w["tags"].get("highway"))
        if not kind:
            continue
        name = w["tags"].get("name", "")
        name = RENAME.get(name, name)
        run = []
        for g in w["geometry"]:
            if inside_bbox(g):
                run.append(g)
            else:
                if len(run) >= 2:
                    pieces.append([kind, name, run, w["id"]])
                run = []
        if len(run) >= 2:
            pieces.append([kind, name, run, w["id"]])

    # The expressway is the long trunk; a short unnamed trunk continuing it takes its name
    for p in pieces:
        if p[0] == "highway" and not p[1]:
            p[1] = EXPRESSWAY_NAME

    def ends(p):
        return key(p[2][0]), key(p[2][-1])

    merged = True
    while merged:
        merged = False
        by_end = defaultdict(list)
        for i, p in enumerate(pieces):
            if p is None or not p[1]:
                continue
            for e in ends(p):
                by_end[(p[0], p[1], e)].append(i)
        for (kind, name, e), idx in by_end.items():
            idx = [i for i in idx if pieces[i] is not None]
            if len(idx) != 2 or idx[0] == idx[1]:
                continue
            a, b = pieces[idx[0]], pieces[idx[1]]
            ga, gb = a[2], b[2]
            if key(ga[-1]) != e:
                ga = ga[::-1]
            if key(gb[0]) != e:
                gb = gb[::-1]
            if key(ga[0]) == key(gb[-1]):  # a loop: leave it
                continue
            a[2] = ga + gb[1:]
            pieces[idx[1]] = None
            merged = True
            break
    pieces = [p for p in pieces if p]

    # Owner-named unnamed streets
    for (lat, lon), nm in UNNAMED:
        x0, z0 = to_xz(lat, lon)
        best = min((p for p in pieces if p[0] == "street" and not p[1]),
                   key=lambda p: project([to_xz(g["lat"], g["lon"]) for g in p[2]], (x0, z0))[2])
        best[1] = nm

    # ---- intersections: OSM vertices shared by two or more roads ----
    users = defaultdict(set)
    for i, p in enumerate(pieces):
        for g in p[2]:
            users[key(g)].add(i)
    joint = {k for k, v in users.items() if len(v) >= 2}
    # Also a road crossing itself / a T on its own end (rare): count vertex repeats in one road
    for i, p in enumerate(pieces):
        seen = set()
        for g in p[2]:
            k = key(g)
            if k in seen:
                joint.add(k)
            seen.add(k)

    # Keep only the biggest connected network (everything else cannot be navigated to)
    parent = list(range(len(pieces)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for k in joint:
        us = list(users[k])
        for u in us[1:]:
            parent[find(u)] = find(us[0])
    comp = defaultdict(list)
    for i in range(len(pieces)):
        comp[find(i)].append(i)
    keep = set(max(comp.values(), key=lambda c: sum(len(pieces[i][2]) for i in c)))
    dropped = len(pieces) - len(keep)

    roads = []
    ids = set()
    for i, p in enumerate(pieces):
        if i not in keep:
            continue
        kind, name, geom, oid = p
        if name == EXPRESSWAY_NAME and kind == "highway" and "expressway" not in ids:
            rid = "expressway"
        elif name == OLD_ROAD_NAME and "ihumudumu-road" not in ids:
            rid = "ihumudumu-road"
        elif name:
            rid = slug(name)
            n = 2
            while rid in ids:
                rid = f"{slug(name)}-{n}"
                n += 1
        else:
            rid = f"{kind}-{oid}"
            n = 2
            while rid in ids:
                rid = f"{kind}-{oid}-{n}"
                n += 1
        ids.add(rid)
        # Simplify between joints so every intersection vertex survives exactly
        xz = [to_xz(g["lat"], g["lon"]) for g in geom]
        ks = [key(g) for g in geom]
        cut = [0] + [j for j in range(1, len(geom) - 1) if ks[j] in joint] + [len(geom) - 1]
        pts, pk = [], []
        tol = 2.5 if kind == "highway" else 1.2
        for a, b in zip(cut, cut[1:]):
            part = simplify(xz[a : b + 1], tol)
            if not pts:
                pts.append(part[0])
                pk.append(ks[a])
            for q in part[1:-1]:
                pts.append(q)
                pk.append(None)
            pts.append(part[-1])
            pk.append(ks[b])
        pk[0], pk[-1] = ks[0], ks[-1]
        # Break long straight runs so tiles/arrows follow bends cleanly (highway and road only)
        if kind != "street":
            dense, dk = [pts[0]], [pk[0]]
            for (a, b), kb in zip(zip(pts, pts[1:]), pk[1:]):
                n = int(math.dist(a, b) // 24)
                for t in range(1, n + 1):
                    f = t / (n + 1)
                    dense.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
                    dk.append(None)
                dense.append(b)
                dk.append(kb)
            pts, pk = dense, dk
        roads.append({"id": rid, "name": name, "kind": kind, "pts": pts, "keys": pk})

    for r in roads:
        r["at"] = cum(r["pts"])
    by_id = {r["id"]: r for r in roads}

    # ---- graph nodes ----
    node_of = {}
    nodes = []
    for ri, r in enumerate(roads):
        for j, k in enumerate(r["keys"]):
            if k is None or k not in joint:
                continue
            if k not in node_of:
                node_of[k] = len(nodes)
                x, z = r["pts"][j]
                nodes.append({"x": round(x, 1), "z": round(z, 1), "on": []})
            on = nodes[node_of[k]]["on"]
            s = round(r["at"][j], 1)
            if not any(o[0] == r["id"] and abs(o[1] - s) < 0.5 for o in on):
                on.append([r["id"], s])
    nodes = [n for n in nodes]
    # Edges: consecutive nodes along each road
    along = defaultdict(list)
    for ni, n in enumerate(nodes):
        for rid, s in n["on"]:
            along[rid].append((s, ni))
    edges = []
    for rid, lst in along.items():
        lst.sort()
        for (s0, a), (s1, b) in zip(lst, lst[1:]):
            if a != b and s1 - s0 > 0.1:
                edges.append([a, b, rid, s0, s1])

    # ---- junctions (where a lesser road meets a greater one; T-ends between equals) ----
    junctions = []
    for ni, n in enumerate(nodes):
        for ra, sa in n["on"]:
            A = by_id[ra]
            for rb, sb in n["on"]:
                if rb == ra:
                    continue
                B = by_id[rb]
                end = "start" if sb < 0.5 else "end" if sb > B["at"][-1] - 0.5 else "mid"
                a_end = sa < 0.5 or sa > A["at"][-1] - 0.5
                if RANK[A["kind"]] < RANK[B["kind"]]:
                    continue
                if RANK[A["kind"]] == RANK[B["kind"]] and not (end != "mid" and not a_end):
                    continue
                # Which side of A does B leave on: a point a little way into B
                inner_s = min(B["at"][-1], sb + 12) if end != "end" else max(0, sb - 12)
                ix, iz, _, _ = point_at(B["pts"], B["at"], inner_s)
                off = project(A["pts"], (ix, iz))[1]
                junctions.append({"name": B["name"], "road": ra, "s": round(sa, 1), "side": 1 if off >= 0 else -1, "street": rb, "end": end, "node": ni})
    junctions.sort(key=lambda j: (j["road"], j["s"]))

    # ---- buildings ----
    blds = []
    for w in ways:
        if "building" not in w.get("tags", {}):
            continue
        g = w["geometry"]
        if not all(BBOX[0] - 0.01 <= q["lat"] <= BBOX[2] + 0.01 and BBOX[1] - 0.01 <= q["lon"] <= BBOX[3] + 0.01 for q in g):
            continue
        ring = [to_xz(q["lat"], q["lon"]) for q in g]
        if len(ring) > 1 and ring[0] == ring[-1]:
            ring = ring[:-1]
        if len(ring) < 3:
            continue
        cx = sum(p[0] for p in ring) / len(ring)
        cz = sum(p[1] for p in ring) / len(ring)
        area = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) / 2
        blds.append({"ring": ring, "c": (cx, cz), "area": area})
    # grid of buildings for nearest lookups
    bgrid = defaultdict(list)
    for i, b in enumerate(blds):
        bgrid[(int(b["c"][0] // 50), int(b["c"][1] // 50))].append(i)

    def buildings_near(x, z, r):
        out = []
        for gx in range(int((x - r) // 50), int((x + r) // 50) + 1):
            for gz in range(int((z - r) // 50), int((z + r) // 50) + 1):
                for i in bgrid.get((gx, gz), []):
                    if math.dist(blds[i]["c"], (x, z)) <= r:
                        out.append(i)
        return out

    # segment grid of roads for snapping
    rgrid = defaultdict(set)
    for r in roads:
        for a, b in zip(r["pts"], r["pts"][1:]):
            n = max(1, int(math.dist(a, b) // 20))
            for t in range(n + 1):
                x = a[0] + (b[0] - a[0]) * t / n
                z = a[1] + (b[1] - a[1]) * t / n
                rgrid[(int(x // 60), int(z // 60))].add(r["id"])

    def nearest_road(x, z, kinds=("road", "street", "highway")):
        best = None
        for rad in (1, 2, 4, 8):
            cand = set()
            for gx in range(int(x // 60) - rad, int(x // 60) + rad + 1):
                for gz in range(int(z // 60) - rad, int(z // 60) + rad + 1):
                    cand |= rgrid.get((gx, gz), set())
            for rid in cand:
                r = by_id[rid]
                if r["kind"] not in kinds:
                    continue
                p = project(r["pts"], (x, z))
                if not best or p[2] < best[1][2]:
                    best = (r, p)
            if best:
                return best
        return best

    used_b = set()

    def snap_building(x, z, radius, road=None, side=None):
        """The nearest unused building to (x, z) (on `side` of `road` if given)."""
        cands = sorted(buildings_near(x, z, radius), key=lambda i: math.dist(blds[i]["c"], (x, z)))
        for i in cands:
            if i in used_b:
                continue
            if road is not None:
                p = project(road["pts"], blds[i]["c"])
                if (1 if p[1] >= 0 else -1) != side or p[2] > 90:
                    continue
            used_b.add(i)
            return i
        return None

    labels = dict(re.findall(r"id: '([a-z0-9-]+)',\s*label: '([^']+)'", open(PLACES_TS, encoding="utf-8").read()))
    places = []

    def add_place(pid, road, s, side, b):
        place = {"id": pid, "label": labels.get(pid, pid), "road": road["id"], "s": round(s, 1), "side": side}
        if b is not None:
            place["building"] = [round(blds[b]["c"][0], 1), round(blds[b]["c"][1], 1)]
        places.append(place)

    def junction_s(rid, street_name):
        js = [j for j in junctions if j["road"] == rid and j["name"] == street_name]
        if not js:
            raise SystemExit(f"no junction of {street_name} on {rid}")
        return js[0]

    for pid, (rid, near, off, compass) in PLACES.items():
        road = by_id[rid]
        if near:
            j = junction_s(rid, near)
            s = j["s"] + off
            side = -j["side"] if compass == "opposite" else side_of(road["pts"], road["at"], s, compass)
        else:
            s = road["at"][-1] * off
            side = side_of(road["pts"], road["at"], s, compass)
        cx, cz, dx, dz = point_at(road["pts"], road["at"], s)
        tx, tz = cx - dz * side * 25, cz + dx * side * 25
        b = snap_building(tx, tz, 70, road, side)
        if b is not None:
            p = project(road["pts"], blds[b]["c"])
            s = p[0]
        add_place(pid, road, s, side, b)

    # AAU main gate: the street leaving the expressway's south side nearest GATE_LON
    ex = by_id["expressway"]
    gx_target = to_xz(6.744, GATE_LON)[0]
    gate_j = min((j for j in junctions if j["road"] == "expressway" and by_id[j["street"]]["kind"] != "highway"
                  and side_of(ex["pts"], ex["at"], j["s"], "south") == j["side"]),
                 key=lambda j: abs(point_at(ex["pts"], ex["at"], j["s"])[0] - gx_target))
    gate_road = by_id[gate_j["street"]]
    gnode = nodes[gate_j["node"]]
    gate_s_on_street = next(s for r, s in gnode["on"] if r == gate_road["id"])
    gdir = 1 if gate_s_on_street < gate_road["at"][-1] / 2 else -1
    gin = point_at(gate_road["pts"], gate_road["at"], gate_s_on_street + gdir * 40)
    places.append({"id": "aau-gate", "label": labels.get("aau-gate", "aau-gate"), "road": "expressway", "s": gate_j["s"], "side": gate_j["side"]})
    # Campus buildings: south of the expressway within 1.1 km of the gate, biggest first
    gx, gz = gnode["x"], gnode["z"]
    campus = [i for i in buildings_near(gx, gz + 500, 800)
              if project(ex["pts"], blds[i]["c"])[1] * gate_j["side"] > 30 and blds[i]["area"] > 120]
    campus.sort(key=lambda i: -blds[i]["area"])
    picked = []
    for i in campus:
        if all(math.dist(blds[i]["c"], blds[k]["c"]) > 70 for k in picked):
            picked.append(i)
        if len(picked) == len(CAMPUS):
            break
    picked.sort(key=lambda i: math.dist(blds[i]["c"], (gin[0], gin[1])))
    for pid, b in zip(CAMPUS, picked):
        used_b.add(b)
        road, p = nearest_road(*blds[b]["c"], kinds=("road", "street"))
        add_place(pid, road, p[0], 1 if p[1] >= 0 else -1, b)
    com = next(p for p in places if p["id"] == "college-of-medicine")
    for pid in MEDICINE:
        b = snap_building(*com.get("building", (0, 0)), 260)
        if b is None:
            continue
        road, p = nearest_road(*blds[b]["c"], kinds=("road", "street"))
        add_place(pid, road, p[0], 1 if p[1] >= 0 else -1, b)
    # Two with the same name would be told apart by nothing: name the road
    names = [p["label"] for p in places]
    for p in places:
        if names.count(p["label"]) > 1:
            p["label"] = f'{p["label"]}, {by_id[p["road"]]["name"] or "side street"}'

    # ---- signs: street name plates where a named road meets a highway/road ----
    signs, seen = [], set()
    for j in junctions:
        if j["name"] and by_id[j["road"]]["kind"] != "street" and (j["road"], j["street"]) not in seen:
            seen.add((j["road"], j["street"]))
            signs.append({"text": j["name"], "road": j["road"], "s": j["s"], "side": j["side"]})

    # ---- area gantries ----
    gantries = []
    for text, lat, lon, rad in AREAS:
        if lat is None:
            if text not in area_nodes:
                continue
            lat, lon = area_nodes[text]
        cx, cz = to_xz(lat, lon)
        for r in roads:
            # Egoro is reached by long unclassified streets only: let those carry its gantries
            if r["kind"] == "street" and (text != "EGORO" or r["at"][-1] < 800):
                continue
            L = r["at"][-1]
            prev_in = None
            s = 0.0
            while s <= L:
                x, z, _, _ = point_at(r["pts"], r["at"], s)
                now_in = math.dist((x, z), (cx, cz)) < rad
                if prev_in is not None and now_in != prev_in and 30 < s < L - 30:
                    # entering: travel +s if we went outside -> inside
                    d = 1 if now_in else -1
                    if not any(g["road"] == r["id"] and abs(g["s"] - s) < 120 for g in gantries):
                        gantries.append({"text": text, "road": r["id"], "s": round(s, 1), "dir": d})
                prev_in = now_in
                s += 5
    gantries.append({"text": "AAU MAIN GATE", "road": gate_road["id"], "s": round(gate_s_on_street + gdir * 25, 1), "dir": gdir})

    # ---- write ----
    out_roads = [{"id": r["id"], "name": r["name"], "kind": r["kind"], "pts": [[round(x, 1), round(z, 1)] for x, z in r["pts"]]} for r in roads]
    out = {"attribution": "© OpenStreetMap contributors", "scale": SCALE, "origin": list(ORIGIN), "bbox": list(BBOX),
           "roads": out_roads, "graph": {"nodes": [[n["x"], n["z"]] + [v for o in n["on"] for v in o] for n in nodes], "edges": edges},
           "junctions": [{k: v for k, v in j.items() if k != "node"} for j in junctions],
           "places": places, "signs": signs, "gantries": gantries,
           "buildings": {"tiles": "/drive/buildings/", "size": TILE}}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    os.makedirs(TILES_DIR, exist_ok=True)
    for fn in os.listdir(TILES_DIR):
        os.remove(os.path.join(TILES_DIR, fn))
    tiles = defaultdict(list)
    for b in blds:
        tiles[(math.floor(b["c"][0] / TILE), math.floor(b["c"][1] / TILE))].append({"ring": [round(v, 1) for p in b["ring"] for v in p]})
    for (ix, iz), lst in tiles.items():
        with open(os.path.join(TILES_DIR, f"{ix}_{iz}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump({"tile": [ix, iz], "buildings": lst}, f, separators=(",", ":"))
    with open(os.path.join(TILES_DIR, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"attribution": "© OpenStreetMap contributors", "size": TILE, "tiles": {f"{ix}_{iz}": len(l) for (ix, iz), l in sorted(tiles.items())}}, f, separators=(",", ":"))

    total = defaultdict(float)
    for r in roads:
        total[r["kind"]] += r["at"][-1]
    print("roads", len(roads), "dropped (disconnected)", dropped, {k: round(v / 1000, 1) for k, v in total.items()}, "km")
    print("graph nodes", len(nodes), "edges", len(edges), "junctions", len(junctions), "signs", len(signs))
    print("buildings", len(blds), "tiles", len(tiles), "places", len(places), "gantries", [(g["text"], g["road"]) for g in gantries])
    print("wrote", OUT, os.path.getsize(OUT), "bytes")

    review(roads, blds, places, gantries, by_id, used_b)


def review(roads, blds, places, gantries, by_id, used_b):
    from PIL import Image, ImageDraw, ImageFont
    W, S, E, N = BBOX[1], BBOX[0], BBOX[3], BBOX[2]
    (x0, z0), (x1, z1) = to_xz(N, W), to_xz(S, E)
    try:
        font = ImageFont.truetype("arialbd.ttf", 15)
        big = ImageFont.truetype("arialbd.ttf", 22)
    except OSError:
        font = big = ImageFont.load_default()

    def render(path, view, k):
        vx0, vz0, vx1, vz1 = view
        img = Image.new("RGB", (int((vx1 - vx0) * k), int((vz1 - vz0) * k)), "#0b1424")
        d = ImageDraw.Draw(img)
        P = lambda x, z: ((x - vx0) * k, (z - vz0) * k)
        for i, b in enumerate(blds):
            d.polygon([P(*p) for p in b["ring"]], fill="#e0a030" if i in used_b else "#33425f")
        col = {"street": ("#8f9bb3", 1), "road": ("#7fb0ff", 3), "highway": ("#ffc531", 5)}
        for kind in ("street", "road", "highway"):
            for r in roads:
                if r["kind"] == kind:
                    d.line([P(*p) for p in r["pts"]], fill=col[kind][0], width=max(1, int(col[kind][1] * max(1, k * 1.5))))
        for g in gantries:
            r = by_id[g["road"]]
            x, z, _, _ = point_at(r["pts"], r["at"], g["s"])
            px, pz = P(x, z)
            d.rectangle([px - 6, pz - 6, px + 6, pz + 6], fill="#1c8c3c", outline="white")
            d.text((px + 9, pz - 12), g["text"], fill="#5dff8a", font=big, stroke_width=3, stroke_fill="#0b1424")
        for p in places:
            r = by_id[p["road"]]
            x, z, dx, dz = point_at(r["pts"], r["at"], p["s"])
            bx, bz = p.get("building", (x - dz * p["side"] * 12, z + dx * p["side"] * 12))
            d.line([P(x, z), P(bx, bz)], fill="#ff5a5a", width=2)
            px, pz = P(bx, bz)
            d.ellipse([px - 5, pz - 5, px + 5, pz + 5], fill="#ff5a5a", outline="white")
            d.text((px + 7, pz - 8), p["label"], fill="white", font=font, stroke_width=3, stroke_fill="#0b1424")
        d.text((14, img.height - 26), "© OpenStreetMap contributors · Ekpoma driving map review · red = our places (orange = their building), green = area gantries", fill="#9db2d8", font=font)
        img.save(path)
        print("review map", path, img.size)

    os.makedirs(os.path.dirname(REVIEW), exist_ok=True)
    render(REVIEW, (x0, z0, x1, z1), 0.17)
    # Close-up of the campus side (the old driving strip and AAU)
    render(REVIEW.replace(".png", "-centre.png"), (-2400, -1300, 2600, 1500), 0.6)


if __name__ == "__main__":
    main()
