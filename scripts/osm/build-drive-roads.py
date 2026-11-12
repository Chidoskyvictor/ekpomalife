"""
The street-level driving world's roads, from OpenStreetMap -> lib/game/drive-roads.json.

Ekpoma on the campus side is a ladder: the Benin-Auchi expressway (south) and the old Ihumudumu
road (north) run side by side about 600 m apart, joined by short cross streets. This fetches
those roads once (Overpass), turns them into game metres (x east, z south, SCALE of real size so
drives stay short) and works out the junctions, our places and the signs along them. The game
reads the JSON only: nothing calls OpenStreetMap at run time.

Road kinds:  highway = the expressway only (dual carriageway with a divider, highway.glb)
             road    = the Ihumudumu road (black asphalt, one lane each way)
             street  = the cross streets (narrower black asphalt)

  python scripts/osm/build-drive-roads.py            (re-fetch)
  python scripts/osm/build-drive-roads.py raw.json   (reuse a saved Overpass reply)
Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLACES_TS = os.path.join(ROOT, "backend", "src", "game", "places.ts")
OUT = os.path.join(ROOT, "lib", "game", "drive-roads.json")

SCALE = 0.5
ORIGIN = (6.7450, 6.0950)
BBOX = (6.725, 6.070, 6.770, 6.155)

EXPRESSWAY = 398222811  # A2, Benin-Auchi Road
OLD_ROAD = 385629501  # F115, "Ihumudum-Ujumen Road": the Ihumudumu road, from the town roundabout west
# Longitudes kept of each long road
EXPRESSWAY_LON = (6.0745, 6.1165)
OLD_ROAD_LON = (6.0745, 6.1350)
# Cross streets are found by themselves (every small road that touches both long roads) between these
CROSS_LON = (6.0750, 6.1150)

# G1 and G2 are neighbours; coming from the school gate (west) you reach G1 first, then G2
# (the owner's description). OSM labels the western one "G2 Road" and leaves the eastern one
# unnamed, so the western one is renamed and the eastern one named here.
RENAME = {"G2 Road": "G1 Road"}
# Cross streets OSM has no name for, by the longitude where they meet the Ihumudumu road.
UNNAMED = {6.1129: "G2 Road"}

# Our places along these roads:
#   id -> (road id, cross street it is near, metres along the road past that junction, side)
#   or, with no cross street, (road id, None, share of the way along the road, side)
# side: a compass side of the road, or "opposite" = facing the mouth of that cross street.
# OpenStreetMap has the roads of Ekpoma but none of its buildings, so only the first three come
# from the map or from the owner; the rest are laid out by us along the real roads.
PLACES = {
    # The main gate: OSM has the university's entrance road leaving the expressway's south side
    # just west of Poultry Road (lon 6.0845)
    "aau-gate": ("expressway", "Poultry Road", -42, "south"),
    "sazza": ("expressway", "Oriafor Road", 0, "opposite"),  # the owner: facing the mouth of Oriafor Road
    # The owner: on the expressway, Sazza's side. Put by University Road, the campus's western way in.
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
# Places with no kerb of their own: you drive to the place they are inside and park there.
INSIDE = {
    "aau-gate": ["admin-block", "ict-exams", "education", "mass-comm", "students-centre", "cordelia-hall", "sports-complex", "clinic",
                 "school-hostels-1", "school-hostels-2", "engineering", "law-campus", "twin-hall", "physical-science", "social-science",
                 "life-science", "management-science", "shuttle-park"],
    "college-of-medicine": ["etf-hall", "hall-100", "hall-200", "mls-hall"],
}
# Area names with no OSM node: (text, road id, share of the way along it)
AREA_SIGNS = [("Ihumudumu", "ihumudumu-road", 0.62)]


def fetch():
    q = f"""[out:json][timeout:60];
(way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););
out body; >; out skel qt;"""
    hosts = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
    for host in hosts * 2:
        try:
            req = urllib.request.Request(host, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "game-build-script/1.0"})
            return json.load(urllib.request.urlopen(req, timeout=90))
        except Exception as e:  # try the next mirror
            print("overpass failed", host, e)
    raise SystemExit("No Overpass mirror answered")


def to_xz(lat, lon):
    return ((lon - ORIGIN[1]) * 110_500 * SCALE, -(lat - ORIGIN[0]) * 111_000 * SCALE)


def resample(pts, step):
    out = [pts[0]]
    carry = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if seg == 0:
            continue
        t = step - carry
        while t <= seg:
            out.append((a[0] + (b[0] - a[0]) * t / seg, a[1] + (b[1] - a[1]) * t / seg))
            t += step
        carry = (carry + seg) % step
    if math.dist(out[-1], pts[-1]) > step * 0.4:
        out.append(pts[-1])
    else:
        out[-1] = pts[-1]
    return out


def smooth(pts, rounds=3):
    for _ in range(rounds):
        pts = [pts[0]] + [((a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4) for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
    return pts


def simplify(pts, tol):
    """Douglas-Peucker: drop every point that strays less than `tol` metres from the line through its neighbours."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    seg = math.dist(a, b) or 1.0
    worst, at = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - a[0]) * (b[1] - a[1]) - (pts[i][1] - a[1]) * (b[0] - a[0])) / seg
        if d > worst:
            worst, at = d, i
    if worst <= tol:
        return [a, b]
    return simplify(pts[: at + 1], tol)[:-1] + simplify(pts[at:], tol)


def length(pts):
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def project(pts, p):
    """Nearest point on a polyline: (distance along it, signed offset: + is right of travel, gap, the point)."""
    best = (0.0, 0.0, 1e9, pts[0])
    run = 0.0
    for a, b in zip(pts, pts[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        seg = math.hypot(dx, dz)
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (seg * seg)))
        qx, qz = a[0] + dx * t, a[1] + dz * t
        gap = math.hypot(p[0] - qx, p[1] - qz)
        if gap < best[2]:
            # travelling (dx, dz) with x east, z south: the right-hand side is (-dz, dx)
            side = (p[0] - qx) * (-dz) + (p[1] - qz) * dx
            best = (run + seg * t, math.copysign(gap, side) if side else 0.0, gap, (qx, qz))
        run += seg
    return best


def side_of(pts, s, compass):
    """Which side of a road (+1 right of travel, -1 left) faces north / south / east / west at s."""
    run = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if run + seg >= s or b is pts[-1]:
            dx, dz = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
            right = (-dz, dx)
            want = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}[compass]
            return 1 if right[0] * want[0] + right[1] * want[1] >= 0 else -1
        run += seg
    return 1


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    data = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else fetch()
    nodes = {e["id"]: (e["lat"], e["lon"]) for e in data["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in data["elements"] if e["type"] == "way"}

    def line(way, lon_range, step, straighten):
        ll = [nodes[n] for n in way["nodes"]]
        if lon_range:
            ll = [p for p in ll if lon_range[0] <= p[1] <= lon_range[1]]
        # OSM traces wobble; a real road runs straight between its bends
        return smooth(resample(simplify([to_xz(*p) for p in ll], straighten), step), 6)

    roads = [
        {"id": "expressway", "name": "Benin-Auchi Road", "kind": "highway", "pts": line(ways[EXPRESSWAY], EXPRESSWAY_LON, 12, 26)},
        {"id": "ihumudumu-road", "name": "Ihumudumu Road", "kind": "road", "pts": line(ways[OLD_ROAD], OLD_ROAD_LON, 12, 9)},
    ]
    by_id = {r["id"]: r for r in roads}

    # Every small road that touches both long roads is a cross street
    on_a = set(ways[EXPRESSWAY]["nodes"])
    on_f = set(ways[OLD_ROAD]["nodes"])
    junctions = []
    for way in ways.values():
        if way["id"] in (EXPRESSWAY, OLD_ROAD) or way["tags"]["highway"] in ("trunk", "primary"):
            continue
        ns = way["nodes"]
        if not (set(ns) & on_a and set(ns) & on_f):
            continue
        # Keep the stretch between the two long roads, running north (old road) to south (expressway)
        ia = next(i for i, n in enumerate(ns) if n in on_a)
        i_f = next(i for i, n in enumerate(ns) if n in on_f)
        part = ns[min(ia, i_f) : max(ia, i_f) + 1]
        if ia < i_f:
            part = part[::-1]
        lon_f = nodes[part[0]][1]
        if not (CROSS_LON[0] <= lon_f <= CROSS_LON[1]):
            continue
        name = RENAME.get(way["tags"].get("name", ""), way["tags"].get("name")) or next((v for k, v in UNNAMED.items() if abs(k - lon_f) < 0.0006), "")
        rid = slug(name) if name else f"lane-{round(lon_f * 10000)}"
        pts = smooth(resample([to_xz(*nodes[n]) for n in part], 10), 2)
        # Pin both ends onto the long roads' (smoothed) centre lines
        top = project(by_id["ihumudumu-road"]["pts"], pts[0])
        bottom = project(by_id["expressway"]["pts"], pts[-1])
        pts[0], pts[-1] = top[3], bottom[3]
        # OSM draws a side street on to the far carriageway; ours stops at the long road's centre line,
        # so nothing of it is left lying along the long road's lanes
        while len(pts) > 3 and math.dist(pts[-2], pts[-1]) < 14:
            del pts[-2]
        while len(pts) > 3 and math.dist(pts[1], pts[0]) < 8:
            del pts[1]
        roads.append({"id": rid, "name": name, "kind": "street", "pts": pts})
        for long_id, hit, end in (("ihumudumu-road", top, 0), ("expressway", bottom, len(pts) - 1)):
            inner = pts[min(3, len(pts) - 1)] if end == 0 else pts[max(len(pts) - 4, 0)]
            off = project(by_id[long_id]["pts"], inner)[1]
            junctions.append({"name": name, "road": long_id, "s": round(hit[0], 1), "side": 1 if off >= 0 else -1, "street": rid, "end": "start" if end == 0 else "end"})
    by_id = {r["id"]: r for r in roads}
    junctions.sort(key=lambda j: (j["road"], j["s"]))

    labels = dict(re.findall(r"id: '([a-z0-9-]+)',\s*label: '([^']+)'", open(PLACES_TS, encoding="utf-8").read()))
    places = []
    for pid, (rid, near, along, compass) in PLACES.items():
        road = by_id[rid]
        if near:
            j = next(j for j in junctions if j["road"] == rid and j["name"] == near)
            s = j["s"] + along
        else:
            s = length(road["pts"]) * along
        side = -j["side"] if compass == "opposite" else side_of(road["pts"], s, compass)
        places.append({"id": pid, "label": labels.get(pid, pid), "road": rid, "s": round(s, 1), "side": side})
    for host, ids in INSIDE.items():
        at = next(p for p in places if p["id"] == host)
        for pid in ids:
            places.append({**at, "id": pid, "label": labels.get(pid, pid), "inside": host})
    # Two with the same name ("Shop", "School Hostels") would be told apart by nothing: name the road
    names = [p["label"] for p in places]
    for p in places:
        if names.count(p["label"]) > 1 and "inside" not in p:
            p["label"] = f'{p["label"]}, {by_id[p["road"]]["name"] or "side street"}'

    signs = [{"text": j["name"], "road": j["road"], "s": j["s"], "side": j["side"]} for j in junctions if j["name"]]
    for text, rid, share in AREA_SIGNS:
        signs.append({"text": text, "road": rid, "s": round(length(by_id[rid]["pts"]) * share, 1), "side": 1})

    for r in roads:
        r["pts"] = [[round(x, 1), round(z, 1)] for x, z in r["pts"]]
        print(f'{r["id"]:22} {r["kind"]:8} {round(length(r["pts"])):5} m  {r["name"]}')
    print("junctions", len(junctions))
    print("places", [(p["id"], p["road"], p["s"], p["side"]) for p in places])

    out = {"attribution": "© OpenStreetMap contributors", "scale": SCALE, "roads": roads, "junctions": junctions, "places": places, "signs": signs}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
