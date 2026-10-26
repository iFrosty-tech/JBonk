"""Genera src/maps/mezzocammino.json: il quartiere reale intorno alla sede JPanik.

    pip install -r scripts/map/requirements.txt
    python scripts/map/build_map.py --fetch   # scarica i dati Overture (serve solo la prima volta)
    python scripts/map/build_map.py           # rigenera la mappa dalla cache

Fonte: Overture Maps (strade, edifici con altezze, aree verdi, acqua, fermate, strisce
pedonali), a sua volta basata su OpenStreetMap (ODbL). I punti di interesse sono scelti a
mano qui sotto, con indirizzo e coordinate verificati.

Sistema di coordinate del gioco: x verso est, z verso sud, 1 metro = SCALE unità.
Tutti i numeri nel JSON sono interi in decimi di unità (0.1).
"""
import json
import math
import os
import random
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import unary_union

from overture import RELEASE, fetch

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src", "maps", "mezzocammino.json"))

# ------------------------------------------------------------------ parametri

OFFICE = (12.42745, 41.79255)  # JPanik, Viale Gianluigi Bonelli 40 (lon, lat)
CENTER_M = (110.0, 225.0)  # centro dell'arena rispetto all'ufficio (metri verso est, nord)
HALF_M = 360.0  # metà lato dell'area giocabile (metri)
MARGIN_M = 75.0  # fascia oltre la recinzione che si vede ma non si raggiunge
SCALE = 0.8  # unità di gioco per metro
TILE_M = 110.0  # i poligoni del terreno sono spezzati in riquadri (triangolazione più leggera)

KX = 111320 * math.cos(math.radians(OFFICE[1]))
KY = 110574.0
HALF = HALF_M * SCALE
RHALF = (HALF_M + MARGIN_M) * SCALE

# Punti di interesse: (id, nome, indirizzo, lon, lat, ruolo, icona)
# ruolo: start = ufficio (si parte qui), lunch = pausa pranzo (cura), coffee = macchinetta del caffè
# (bonus), sign = solo insegna. L'icona è lo sprite del segnaposto sopra il locale.
POIS = [
    ("jpanik", "JPanik", "Viale Gianluigi Bonelli 40", 12.42745, 41.79255, "start", "pin_jpanik"),
    ("konan", "Konan Sushi", "Viale Gianluigi Bonelli 219", 12.425739, 41.794377, "lunch", "pin_sushi"),
    ("albertos", "Alberto's Pizza", "Viale Gianluigi Bonelli 239", 12.4257791, 41.7947308, "lunch", "pin_pizza"),
    ("jungle", "Jungle Pokè", "Largo Attilio Mussino 9", 12.4264321, 41.7947395, "lunch", "pin_poke"),
    ("ami", "Ami Pokè", "Viale Bartolomeo Cavaceppi 18", 12.4319561, 41.7962032, "lunch", "pin_poke"),
    ("barcode", "Barcode", "Via Vico Consorti 220", 12.4323719, 41.7960601, "coffee", "pin_coffee"),
    ("sporting", "Enjoy Sporting Club", "Via Cristoforo Colombo 1800", 12.4294883, 41.79295039, "coffee", "pin_sport"),
    ("barcolombo", "Bar Colombo", "Viale Bartolomeo Cavaceppi 103", 12.43055, 41.79691, "coffee", "pin_coffee"),
    # insegne del quartiere
    ("positano", "Pasticceria Positano", "Viale Gianluigi Bonelli 219", 12.425739, 41.794377, "sign", None),
    ("nomisan", "Nomisan", "Viale Gianluigi Bonelli 237", 12.42564699, 41.79469557, "sign", None),
    ("padthai", "Pad Thai Kung", "Viale Gianluigi Bonelli 233", 12.42567899, 41.79463401, "sign", None),
    ("manifattura", "Manifattura Mare e Miscele", "Largo Attilio Mussino 12", 12.42648239, 41.79446686, "sign", None),
    ("inforno", "Inforno Pizza & Bistrò", "Viale Gianluigi Bonelli 84", 12.4263551, 41.7937082, "sign", None),
    ("edicola", "Edicola Batman", "Viale Gianluigi Bonelli 84", 12.4263551, 41.7937082, "sign", None),
    ("farmacia", "Farmacia Mezzocammino", "Viale Gianluigi Bonelli 84a", 12.42641086, 41.79360322, "sign", None),
    ("ferramenta", "Ferramenta Mezzocammino", "Viale Gianluigi Bonelli 74", 12.4268658, 41.7932468, "sign", None),
    ("ip", "Distributore IP", "Viale Gianluigi Bonelli", 12.425559, 41.795234, "sign", None),
    ("climbing", "Climbing Side", "Via Cristoforo Colombo 1800", 12.429656982422, 41.792448606626, "sign", None),
    ("pandolce", "Pandolce", "Viale Bartolomeo Cavaceppi 41", 12.431397298335, 41.796249093188, "sign", None),
    ("pizzamore", "Pizza & More", "Viale Bartolomeo Cavaceppi 31", 12.431583, 41.795935, "sign", None),
    ("tabacchi", "Tabacchi", "Viale Bartolomeo Cavaceppi 20", 12.4321119, 41.7962221, "sign", None),
    ("gustus", "Gustus Pizza Napoletana", "Largo Achille Albacini 19", 12.4290, 41.79601, "sign", None),
    ("numero10", "Numero 10", "Piazza Enrico Martini 10", 12.43062, 41.79680, "sign", None),
    ("bcc", "BCC di Roma", "Viale Bartolomeo Cavaceppi 97", 12.430306, 41.797009, "sign", None),
    ("cortomaltese", "Parco Corto Maltese", "Viale Gianluigi Bonelli", 12.42469913, 41.79595728, "park", None),
]
# altezze (metri) da correggere a mano: il dato di OSM sulla sede è un portico da 3 m
HEIGHT_FLOOR = {"jpanik": 15.0}

ROAD_W = {  # larghezza della carreggiata (metri)
    "motorway": 10.5, "trunk": 10.5, "primary": 9.0, "secondary": 8.0, "tertiary": 7.0,
    "residential": 6.2, "unclassified": 5.6, "living_street": 5.0, "service": 4.0, "unknown": 4.5,
}
PATH_W = {"pedestrian": 4.0, "footway": 2.0, "path": 1.6, "cycleway": 2.2, "steps": 2.2, "track": 2.6, "bridleway": 1.6}
SIDEWALK = {"primary": 2.6, "secondary": 2.6, "tertiary": 2.4, "residential": 2.2, "unclassified": 2.0, "living_street": 1.6}
ROAD_CODE = {c: i for i, c in enumerate(["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service", "unknown", "pedestrian", "footway", "path", "cycleway", "steps", "track", "bridleway"])}
# ordine di disegno del terreno (dal basso)
AREA_KINDS = ["res", "farm", "green", "forest", "pitch", "plaza", "parking", "water", "path", "walk", "road"]


# ------------------------------------------------------------------ utilità

def project(geom):
    """lon/lat → unità di gioco."""

    def f(c):
        e = (c[:, 0] - OFFICE[0]) * KX - CENTER_M[0]
        n = (c[:, 1] - OFFICE[1]) * KY - CENTER_M[1]
        return np.column_stack([e * SCALE, -n * SCALE])

    return shapely.transform(geom, f)


def ll(lon, lat):
    return project(Point(lon, lat))


def load(name):
    with open(os.path.join(CACHE, f"{name}.json")) as fh:
        return json.load(fh)


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    if hasattr(g, "geoms"):
        return [p for x in g.geoms for p in polys(x)]
    return []


def enc_ring(coords):
    pts = list(coords)[:-1] if list(coords)[0] == list(coords)[-1] else list(coords)
    out = []
    for x, z in pts:
        out += [int(round(x * 10)), int(round(z * 10))]
    return out


def enc_poly(p):
    return [enc_ring(p.exterior.coords)] + [enc_ring(r.coords) for r in p.interiors]


def enc_line(coords):
    out = []
    for x, z in coords:
        out += [int(round(x * 10)), int(round(z * 10))]
    return out


def r10(v):
    return int(round(v * 10))


def oneway(seg):
    for a in seg.get("access_restrictions") or []:
        w = a.get("when") or {}
        if a.get("access_type") == "denied" and w.get("heading") in ("backward", "forward") and not w.get("mode") and not a.get("between"):
            return True
    return False


def has_flag(seg, flag):
    return any(flag in (f.get("values") or []) and not f.get("between") for f in seg.get("road_flags") or [])


# ------------------------------------------------------------------ build

def build():
    rnd = random.Random(127)  # CAP di Mezzocammino: stessa mappa a ogni build
    clip = box(-RHALF, -RHALF, RHALF, RHALF)

    # ---- strade
    roads = []  # (classe, nome, oneway, link, LineString)
    for s in load("segment"):
        if s["subtype"] != "road" or s["geometry"]["type"] != "LineString":
            continue
        g = project(shape(s["geometry"]))
        if not g.intersects(clip):
            continue
        cls = s.get("class") or "unknown"
        if cls not in ROAD_W and cls not in PATH_W:
            continue
        sub = s.get("subclass")
        if sub == "crosswalk":
            continue  # disegnate come strisce pedonali dai punti "crossing"
        name = ((s.get("names") or {}).get("primary") or "").strip()
        roads.append((cls, sub, name, oneway(s), has_flag(s, "is_link"), g))

    def width(cls, sub, link):
        if cls in PATH_W:
            return PATH_W[cls] * SCALE
        w = ROAD_W[cls]
        if sub == "parking_aisle":
            w = 5.0
        elif sub == "driveway":
            w = 3.2
        if link:
            w *= 0.75
        return w * SCALE

    road_buf, walk_buf, path_buf = [], [], []
    for cls, sub, name, ow, link, g in roads:
        w = width(cls, sub, link)
        if cls in PATH_W or sub == "sidewalk":
            path_buf.append(g.buffer(w / 2, quad_segs=4))
            continue
        road_buf.append(g.buffer(w / 2, quad_segs=6))
        if cls in SIDEWALK and not link:
            walk_buf.append(g.buffer(w / 2 + SIDEWALK[cls] * SCALE, quad_segs=6))
    road_area = unary_union(road_buf).intersection(clip)
    walk_area = unary_union(walk_buf).intersection(clip)
    path_area = unary_union(path_buf).intersection(clip)

    # incroci: estremi condivisi da almeno 3 segmenti di carreggiata
    ends = {}
    for cls, sub, name, ow, link, g in roads:
        if cls in PATH_W:
            continue
        for c in (g.coords[0], g.coords[-1]):
            k = (round(c[0], 1), round(c[1], 1))
            ends[k] = ends.get(k, 0) + 1
    junctions = [Point(k) for k, n in ends.items() if n >= 3]
    junction_area = unary_union([p.buffer(6 * SCALE) for p in junctions]) if junctions else Polygon()

    # ---- aree
    areas = {k: [] for k in AREA_KINDS}

    def add_area(kind, g):
        if g.is_valid is False:
            g = g.buffer(0)
        g = g.intersection(clip)
        if not g.is_empty:
            areas[kind].append(g)

    LU = {
        "residential": "res", "developed": "res", "education": "res", "religious": "res", "medical": "res",
        "military": "farm", "agriculture": "farm", "construction": "farm", "horticulture": "green",
        "park": "green", "managed": "green", "pedestrian": "plaza", "cemetery": "green",
    }
    for r in load("land_use"):
        if r["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            continue
        sub, cls = r.get("subtype"), r.get("class")
        if sub == "recreation":
            kind = "pitch" if cls == "pitch" else "green"
        elif sub == "horticulture" and cls == "orchard":
            kind = "forest"
        else:
            kind = LU.get(sub)
        if kind:
            add_area(kind, project(shape(r["geometry"])))
    # la copertura del suolo di Overture (land_cover) è a bassa risoluzione e copre anche le
    # case: il terreno di base è già un prato, bastano le aree di OpenStreetMap (land_use)
    pools = []
    for r in load("water"):
        g = project(shape(r["geometry"]))
        if g.geom_type in ("LineString", "MultiLineString"):
            g = g.buffer(1.5 * SCALE)
        if g.geom_type in ("Polygon", "MultiPolygon"):
            add_area("water", g)
            if r.get("class") == "swimming_pool":
                pools += polys(g.intersection(clip))
    lamps_data, stops_data, crossings_data = [], [], []
    for r in load("infrastructure"):
        cls = r.get("class")
        g = project(shape(r["geometry"]))
        if not g.intersects(clip):
            continue
        if cls == "parking" and g.geom_type in ("Polygon", "MultiPolygon"):
            add_area("parking", g)
        elif cls == "street_lamp":
            lamps_data.append(g)
        elif cls == "bus_stop":
            stops_data.append(g)
        elif cls == "crossing":
            crossings_data.append(g)
    areas["path"] = [path_area]
    areas["walk"] = [walk_area]
    areas["road"] = [road_area]
    merged = {k: unary_union(v) if v else Polygon() for k, v in areas.items()}

    # ---- edifici
    buildings = []  # (poligono, altezza, tipo)
    KIND = {"commercial": 1, "education": 2, "civic": 2, "religious": 3, "outbuilding": 4}
    for b in load("building"):
        if b.get("is_underground"):
            continue
        g = project(shape(b["geometry"]))
        if not g.intersects(clip):
            continue
        for p in polys(g):
            p = p.simplify(0.15, preserve_topology=True)
            if p.area < 6 * SCALE * SCALE:
                continue
            h = b.get("height")
            if not h and b.get("num_floors"):
                h = b["num_floors"] * 3.1
            if not h:
                h = 15.0 if b.get("class") == "apartments" else 3.5 if p.area < 60 * SCALE * SCALE else 9.0
            if h < 2.5:
                h = 3.0
            buildings.append([p, min(h, 40.0) * SCALE, KIND.get(b.get("subtype"), 0)])
    bunion = unary_union([b[0] for b in buildings])

    # ---- punti di interesse: insegna sulla facciata più vicina, "porta" davanti
    pois = []
    used_edges = {}
    for pid, name, addr, lon, lat, role, icon in POIS:
        pt = ll(lon, lat)
        best = None
        for i, (p, h, k) in enumerate(buildings):
            d = p.exterior.distance(pt) if not p.contains(pt) else 0
            if d < 30 * SCALE and (best is None or d < best[0] - 1e-6):
                best = (d, i)
        entry = {"id": pid, "name": name, "addr": addr, "role": role}
        if icon:
            entry["icon"] = icon
        if best is None or role == "park":
            # nessun edificio: insegna su un palo, rivolta verso la strada più vicina
            near = min((g for c, *_, g in roads if c in ROAD_W), key=lambda g: g.distance(pt))
            q = near.interpolate(near.project(pt))
            ang = math.atan2(q.y - pt.y, q.x - pt.x)
            entry.update(x=r10(pt.x), z=r10(pt.y), sign=[r10(pt.x), r10(pt.y), int(round(ang * 1000)), 0], door=[r10(pt.x), r10(pt.y)])
            pois.append(entry)
            continue
        i = best[1]
        p, h, k = buildings[i]
        if pid in HEIGHT_FLOOR:
            buildings[i][1] = h = max(h, HEIGHT_FLOOR[pid] * SCALE)
        ring = list(p.exterior.coords)
        # facciata: il lato più vicino al punto, preferendo quelli che guardano una strada
        best_e = None
        for j in range(len(ring) - 1):
            a, b2 = ring[j], ring[j + 1]
            seg = LineString([a, b2])
            if seg.length < 3 * SCALE:
                continue
            q = seg.interpolate(seg.project(pt))
            nx, nz = b2[1] - a[1], -(b2[0] - a[0])
            ln = math.hypot(nx, nz)
            nx, nz = nx / ln, nz / ln
            if p.contains(Point(q.x + nx * 0.5, q.y + nz * 0.5)):
                nx, nz = -nx, -nz
            door = Point(q.x + nx * 3.2, q.y + nz * 3.2)
            if bunion.contains(door):
                continue
            score = seg.distance(pt) + (0 if merged["road"].distance(door) < 14 * SCALE else 6 * SCALE)
            if best_e is None or score < best_e[0]:
                best_e = (score, j, q, nx, nz, seg)
        _, j, q, nx, nz, seg = best_e
        # due insegne sullo stesso lato: si affiancano
        key = (i, j)
        t = seg.project(q)
        for other in used_edges.get(key, []):
            if abs(other - t) < 7 * SCALE:
                t = other + 7.5 * SCALE if other + 7.5 * SCALE < seg.length - 2 else other - 7.5 * SCALE
        t = min(max(t, 2.5 * SCALE), seg.length - 2.5 * SCALE)
        used_edges.setdefault(key, []).append(t)
        q = seg.interpolate(t)
        ang = math.atan2(nz, nx)
        sh = min(h - 0.4, 4.2 * SCALE) if h > 3 else h * 0.8
        door = (q.x + nx * 3.2, q.y + nz * 3.2)
        entry.update(x=r10(q.x), z=r10(q.y), sign=[r10(q.x + nx * 0.12), r10(q.y + nz * 0.12), int(round(ang * 1000)), r10(sh)], door=[r10(door[0]), r10(door[1])], building=i)
        pois.append(entry)

    # ---- ombre a terra (proiezione del prisma lungo la direzione del sole)
    sun = (40.0, 80.0, 25.0)  # stessa posizione della luce in render/city.ts
    sx, sz = -sun[0] / sun[1] * 0.85, -sun[2] / sun[1] * 0.85
    shadow_parts = []
    for p, h, k in buildings:
        vx, vz = sx * h, sz * h
        ext = list(p.exterior.coords)
        quads = [p]
        for j in range(len(ext) - 1):
            a, b2 = ext[j], ext[j + 1]
            q = Polygon([a, b2, (b2[0] + vx, b2[1] + vz), (a[0] + vx, a[1] + vz)])
            if q.is_valid and q.area > 0.01:
                quads.append(q)
        shadow_parts.append(unary_union(quads))
    shadow = unary_union(shadow_parts).intersection(clip).simplify(0.2)

    # ---- alberi
    blocked = unary_union([
        bunion.buffer(2.2 * SCALE), merged["road"].buffer(0.8 * SCALE), merged["path"].buffer(0.9 * SCALE),
        merged["pitch"], merged["water"].buffer(0.8 * SCALE), merged["parking"], merged["plaza"],
    ])
    trees = []
    grid = {}

    def free(x, z, r):
        gx, gz = int(x // 6), int(z // 6)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for (tx, tz, tr) in grid.get((gx + dx, gz + dz), []):
                    if (tx - x) ** 2 + (tz - z) ** 2 < (tr + r) ** 2:
                        return False
        return True

    def put(x, z, r, kind, s):
        grid.setdefault((int(x // 6), int(z // 6)), []).append((x, z, r))
        trees.append([r10(x), r10(z), kind, int(round(s * 100))])

    def noise(x, z):
        # macchie di alberi e radure: somma di onde a bassa frequenza
        return math.sin(x * 0.045 + 1.3) * math.cos(z * 0.052 - 0.7) + 0.6 * math.sin((x + z) * 0.031 + 2.1)

    def scatter(region, spacing, n_try, kinds, keep):
        region = region.difference(blocked)
        if region.is_empty:
            return
        shapely.prepare(region)
        x0, z0, x1, z1 = region.bounds
        xs = np.array([rnd.uniform(x0, x1) for _ in range(n_try)])
        zs = np.array([rnd.uniform(z0, z1) for _ in range(n_try)])
        inside = shapely.contains_xy(region, xs, zs)
        for x, z, ok in zip(xs, zs, inside):
            if not ok or noise(x, z) < keep:
                continue
            if free(x, z, spacing / 2):
                kind = kinds[rnd.randrange(len(kinds))]
                put(x, z, spacing / 2, kind, rnd.uniform(0.8, 1.25))

    S = SCALE
    scatter(merged["forest"], 6.0 * S, 9000, [0, 0, 1, 1, 3], -0.9)
    scatter(merged["green"], 8.5 * S, 9000, [0, 0, 1, 2, 3], -0.2)
    scatter(merged["res"].difference(merged["green"]), 9.0 * S, 7000, [1, 1, 2, 3], 0.2)
    known = unary_union([g for k, g in merged.items() if not g.is_empty])
    scatter(clip.difference(known), 12.0 * S, 7000, [0, 1, 3, 3], 0.4)
    # alberature stradali: pini e platani sul marciapiede
    for cls, sub, name, ow, link, g in roads:
        if cls not in ("secondary", "tertiary", "residential") or link:
            continue
        w = width(cls, sub, link)
        off = w / 2 + SIDEWALK[cls] * S * 0.55
        kind = 0 if sum(map(ord, name)) % 3 == 0 else 1
        for side in (off, -off):
            try:
                pl = g.offset_curve(side)
            except Exception:
                continue
            if pl.is_empty or pl.geom_type != "LineString":
                continue
            d = 4.0 * S
            while d < pl.length:
                q = pl.interpolate(d)
                d += 11.0 * S
                if junction_area.contains(q) or bunion.buffer(1.6 * S).contains(q) or merged["road"].contains(q) or not clip.contains(q):
                    continue
                if free(q.x, q.y, 2.2 * S):
                    put(q.x, q.y, 2.2 * S, kind, rnd.uniform(0.85, 1.1))

    # ---- lampioni: dal dato quando c'è, altrimenti ogni ~28 m lungo le strade
    lamps = []

    def lamp(x, z, ang):
        lamps.append([r10(x), r10(z), int(round(ang * 1000))])

    for cls, sub, name, ow, link, g in roads:
        if cls not in ("primary", "secondary", "tertiary", "residential", "unclassified") or link:
            continue
        w = width(cls, sub, link)
        off = w / 2 + 0.5 * S
        for k_side, side in enumerate((off, -off)):
            try:
                pl = g.offset_curve(side)
            except Exception:
                continue
            if pl.is_empty or pl.geom_type != "LineString" or pl.length < 10:
                continue
            d = (7 + 14 * k_side) * S
            while d < pl.length:
                q = pl.interpolate(d)
                q2 = pl.interpolate(min(pl.length, d + 1))
                d += 28 * S
                if junction_area.contains(q) or bunion.buffer(1 * S).contains(q) or not clip.contains(q):
                    continue
                c = g.interpolate(g.project(q))
                lamp(q.x, q.y, math.atan2(c.y - q.y, c.x - q.x))
    for pt in lamps_data:
        lamp(pt.x, pt.y, 0)

    car_roads = [(cls, sub, link, g) for cls, sub, name, ow, link, g in roads if cls in ROAD_W]

    def nearest_road(pt, maxd):
        best = None
        for cls, sub, link, g in car_roads:
            d = g.distance(pt)
            if d < maxd and (best is None or d < best[0]):
                best = (d, cls, sub, link, g)
        return best

    def direction(g, pt):
        t = g.project(pt)
        a = g.interpolate(max(0, t - 1))
        b = g.interpolate(min(g.length, t + 1))
        return math.atan2(b.y - a.y, b.x - a.x)

    # ---- strisce pedonali e fermate dell'autobus
    crossings = []
    for pt in crossings_data:
        nr = nearest_road(pt, 4 * S)
        if not nr:
            continue
        d, cls, sub, link, g = nr
        q = g.interpolate(g.project(pt))
        crossings.append([r10(q.x), r10(q.y), int(round(direction(g, q) * 1000)), r10(width(cls, sub, link))])
    stops = []
    for pt in stops_data:
        nr = nearest_road(pt, 25 * S)
        if not nr:
            continue
        d, cls, sub, link, g = nr
        q = g.interpolate(g.project(pt))
        ang = direction(g, q)
        nx, nz = -math.sin(ang), math.cos(ang)
        side = 1 if (pt.x - q.x) * nx + (pt.y - q.y) * nz >= 0 else -1
        off = width(cls, sub, link) / 2 + 1.6 * S
        x, z = q.x + nx * off * side, q.y + nz * off * side
        if bunion.buffer(1.2 * S).contains(Point(x, z)):
            continue
        stops.append([r10(x), r10(z), int(round((ang + (0 if side > 0 else math.pi)) * 1000))])

    # ---- segnaletica orizzontale: tratteggio centrale e linee di bordo
    dashes, edges = [], []
    for cls, sub, name, ow, link, g in roads:
        if cls not in ROAD_W or cls in ("service", "unknown", "living_street") or link:
            continue
        w = width(cls, sub, link)
        if ow and cls in ("motorway", "trunk", "primary", "secondary"):
            for side in (w / 2 - 0.5 * S, -(w / 2 - 0.5 * S)):
                try:
                    pl = g.offset_curve(side)
                except Exception:
                    continue
                if pl.geom_type == "LineString" and pl.length > 4:
                    pl = pl.intersection(clip)
                    for part in [pl] if pl.geom_type == "LineString" else list(getattr(pl, "geoms", [])):
                        if part.length > 4:
                            edges.append(enc_line(part.simplify(0.3).coords))
            continue
        if ow:
            continue
        d = 5 * S
        while d < g.length - 5 * S:
            q = g.interpolate(d)
            if not junction_area.contains(q) and clip.contains(q):
                dashes += [r10(q.x), r10(q.y), int(round(direction(g, q) * 1000))]
            d += 7.5 * S

    # ---- assemblaggio
    names = sorted({n for _, _, n, *_ in roads if n})
    name_idx = {n: i for i, n in enumerate(names)}
    tiles = []
    n_t = int(math.ceil(2 * RHALF / (TILE_M * S)))
    step = 2 * RHALF / n_t
    for ix in range(n_t):
        for iz in range(n_t):
            tiles.append(box(-RHALF + ix * step, -RHALF + iz * step, -RHALF + (ix + 1) * step, -RHALF + (iz + 1) * step))

    def tiled(g):
        out = []
        g = g.buffer(0) if not g.is_valid else g
        for t in tiles:
            part = g.intersection(t)
            for p in polys(part):
                p = p.simplify(0.08)
                if p.area > 0.05:
                    out.append(enc_poly(p))
        return out

    start = next(p for p in pois if p["role"] == "start")
    data = {
        "meta": {
            "name": "Mezzocammino",
            "source": f"Overture Maps ({RELEASE.split('/')[-1]}), dati © OpenStreetMap contributors (ODbL)",
            "office": list(OFFICE),
            "centerM": list(CENTER_M),
            "scale": SCALE,
            "half": r10(HALF),
            "renderHalf": r10(RHALF),
            "sun": list(sun),
        },
        "start": start["door"],
        "names": names,
        "areas": {k: tiled(merged[k]) for k in AREA_KINDS},
        "shadow": tiled(shadow),
        "buildings": [[r10(h), k] + enc_poly(p) for p, h, k in buildings],
        "pools": [enc_poly(p) for p in pools],
        "roads": [[ROAD_CODE[cls], name_idx.get(name, -1), (1 if ow else 0) | (2 if link else 0)] + enc_line(g.intersection(clip).coords if g.intersection(clip).geom_type == "LineString" else g.coords) for cls, sub, name, ow, link, g in roads],
        "dashes": dashes,
        "edges": edges,
        "crossings": [v for c in crossings for v in c],
        "stops": [v for s in stops for v in s],
        "lamps": [v for l in lamps for v in l],
        "trees": [v for t in trees for v in t],
        "pois": pois,
    }
    with open(OUT, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"{OUT}: {os.path.getsize(OUT) // 1024} KB — {len(buildings)} edifici, {len(roads)} strade, {len(trees)} alberi, {len(lamps)} lampioni, {len(stops)} fermate, {len(crossings)} strisce, {len(pois)} punti di interesse")


def bbox_lonlat():
    """Rettangolo lon/lat che copre l'area disegnata, con un po' di margine."""
    r = (HALF_M + MARGIN_M) * 1.15
    e0, e1 = CENTER_M[0] - r, CENTER_M[0] + r
    n0, n1 = CENTER_M[1] - r, CENTER_M[1] + r
    return (OFFICE[0] + e0 / KX, OFFICE[1] + n0 / KY, OFFICE[0] + e1 / KX, OFFICE[1] + n1 / KY)


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch(CACHE, bbox_lonlat())
    build()
