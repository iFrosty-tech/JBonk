"""Genera src/maps/mezzocammino.json: il quartiere reale intorno alla sede JPanik.

    pip install -r scripts/map/requirements.txt
    python scripts/map/build_map.py --fetch   # scarica i dati Overture (serve solo la prima volta)
    python scripts/map/build_map.py           # rigenera la mappa dalla cache

Fonti:
- Overture Maps (strade, edifici con altezze, aree verdi, acqua, fermate, strisce pedonali,
  locali), a sua volta basata su OpenStreetMap (ODbL);
- Meta/WRI High Resolution Canopy Height Maps (CC BY 4.0): gli alberi veri, uno per uno, con
  altezza e chioma;
- Sentinel-2 (Copernicus): colore del suolo (prati secchi o irrigati, terra) e dei tetti
  (tegole o lastrico), colore dei campi sportivi (terra rossa, padel, erba sintetica).
I punti di interesse sono scelti a mano qui sotto, con indirizzo e coordinate verificati.

Sistema di coordinate del gioco: x verso est, z verso sud, 1 metro = SCALE unità.
Tutti i numeri nel JSON sono interi in decimi di unità (0.1).
"""
import json
import math
import os
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import nearest_points, unary_union

import landscape
from overture import RELEASE, fetch
from rasters import canopy, sentinel2

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
SCENE = "S2C_33TTG_20260613_0_L2A"  # Sentinel-2 del 13 giugno 2026, cielo sereno
CHM_YEAR, NOW_YEAR = 2019.5, 2026.5  # la mappa delle chiome usa immagini 2018-2020: gli alberi giovani crescono
TINT_M = 10.0  # lato delle celle del colore del suolo (come i pixel della Sentinel-2)

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

def to_game(lon, lat):
    """lon/lat (anche array) → unità di gioco (x, z)."""
    e = (np.asarray(lon) - OFFICE[0]) * KX - CENTER_M[0]
    n = (np.asarray(lat) - OFFICE[1]) * KY - CENTER_M[1]
    return e * SCALE, -n * SCALE


def to_lonlat(x, z):
    e = np.asarray(x) / SCALE + CENTER_M[0]
    n = -np.asarray(z) / SCALE + CENTER_M[1]
    return OFFICE[0] + e / KX, OFFICE[1] + n / KY


def project(geom):
    """lon/lat → unità di gioco."""
    return shapely.transform(geom, lambda c: np.column_stack(to_game(c[:, 0], c[:, 1])))


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


def hexint(rgb):
    return (int(rgb[0]) << 16) | (int(rgb[1]) << 8) | int(rgb[2])


def mix(a, b, t):
    return tuple(int(round(a[k] + (b[k] - a[k]) * t)) for k in range(3))


def hex3(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


# Stili delle facciate (stesso ordine di FACADES in render/facades.ts) e colori dei muri.
# Mezzocammino è un quartiere costruito dal 2005 in poi: palazzine di 4-7 piani a intonaco chiaro
# o colorato, con parti in cortina di mattoni, balconi con parapetto pieno; oltre la Colombo
# villini con giardino e tetto a coppi.
STYLE = {"light": 0, "brick": 1, "color": 2, "villa": 3, "office": 4, "school": 5, "shed": 6}
WALLS = {
    "light": ["#efe9dc", "#e9e2d0", "#f3efe6", "#e4dccb", "#ece2cd", "#dfe0da"],
    "brick": ["#ffffff", "#f7efe9", "#fff4ec", "#efe7e2"],  # i mattoni sono nella texture: qui solo una sfumatura
    "color": ["#e3b779", "#dca07a", "#d8916c", "#e8c690", "#cf8a6a", "#e6d0a0", "#d9a98a"],
    "villa": ["#efdcb6", "#e8c9a0", "#f0e6d2", "#e2b48a", "#f2d9b5", "#e9d3b9"],
    "office": ["#d4dbe2"],
    "school": ["#e8cf98", "#e4c08c", "#d9d0b8"],
    "shed": ["#bdb8ae", "#aca79d", "#c4c0b6"],
}
# Tetti: 0 lastrico solare (parapetto e torrini), 1 a padiglione in coppi, 2 cupola, 3 pensilina, 4 lamiera
ROOF = {"flat": 0, "tiles": 1, "dome": 2, "canopy": 3, "sheet": 4}
# Campi sportivi: 0 tennis in terra rossa, 1 tennis in resina, 2 padel, 3 calcetto in erba sintetica
COURT = {"clay": 0, "hard": 1, "padel": 2, "turf": 3}


# ------------------------------------------------------------------ build

def build():
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
    buildings = []  # [poligono, altezza, tipo, pensilina]
    KIND = {"commercial": 1, "education": 2, "civic": 2, "religious": 3, "outbuilding": 4}
    for b in load("building"):
        if b.get("is_underground"):
            continue
        g = project(shape(b["geometry"]))
        if not g.intersects(clip):
            continue
        canopy_roof = b.get("class") == "roof"  # tettoie e pensiline (es. il distributore): si passa sotto
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
            if canopy_roof:
                h = max(h, 4.8)
            buildings.append([p, min(h, 40.0) * SCALE, KIND.get(b.get("subtype"), 0), canopy_roof])
    bunion = unary_union([b[0] for b in buildings])

    # ---- punti di interesse: insegna sulla facciata più vicina, "porta" davanti
    pois = []
    used_edges = {}
    for pid, name, addr, lon, lat, role, icon in POIS:
        pt = ll(lon, lat)
        best = None
        for i, (p, h, k, cr) in enumerate(buildings):
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
        p, h, k, cr = buildings[i]
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
        # sopra le vetrine del piano terra; sulle pensiline, sulla fascia del tetto
        sh = h - 0.45 if cr else min(h - 0.4, 4.2 * SCALE) if h > 3 else h * 0.8
        door = (q.x + nx * 3.2, q.y + nz * 3.2)
        entry.update(x=r10(q.x), z=r10(q.y), sign=[r10(q.x + nx * 0.12), r10(q.y + nz * 0.12), int(round(ang * 1000)), r10(sh)], door=[r10(door[0]), r10(door[1])], building=i)
        pois.append(entry)

    # ---- ombre a terra (proiezione del prisma lungo la direzione del sole)
    sun = (40.0, 80.0, 25.0)  # stessa posizione della luce in render/city.ts
    sx, sz = -sun[0] / sun[1] * 0.85, -sun[2] / sun[1] * 0.85
    shadow_parts = []
    for p, h, k, cr in buildings:
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

    S = SCALE
    s2, s2_index = sentinel2(CACHE, bbox_lonlat(), SCENE, ["TCI", "B04", "B08"])
    tci = s2["TCI"]

    def s2_color(poly, inset=2.5):
        """Colore medio Sentinel-2 dentro un poligono (lontano dai bordi, dove il pixel è "puro")."""
        inner = poly.buffer(-inset * S)
        if inner.is_empty or inner.area < 4:
            inner = poly
        x0, z0, x1, z1 = inner.bounds
        xs, zs = np.meshgrid(np.arange(x0 + 0.5, x1, 2.0), np.arange(z0 + 0.5, z1, 2.0))
        xs, zs = xs.ravel(), zs.ravel()
        ok = shapely.contains_xy(inner, xs, zs)
        if ok.any():
            xs, zs = xs[ok], zs[ok]
        else:
            c = inner.representative_point()
            xs, zs = np.array([c.x]), np.array([c.y])
        rows, cols = s2_index(*to_lonlat(xs, zs))
        rows = np.clip(rows.astype(int), 0, tci.shape[0] - 1)
        cols = np.clip(cols.astype(int), 0, tci.shape[1] - 1)
        return tci[rows, cols].astype(float).mean(axis=0)

    # ---- alberi: quelli veri, dalla mappa delle chiome
    on_ground = unary_union([merged["road"], merged["pitch"], merged["water"], *pools])
    no_trunk = unary_union([bunion.buffer(0.6 * S), on_ground])
    shapely.prepare(no_trunk)
    colombo = unary_union([g for cls, sub, name, ow, link, g in roads if name == "Via Cristoforo Colombo"])
    woods = unary_union([project(shape(r["geometry"])) for r in load("land_cover") if r.get("subtype") == "forest"]).buffer(0)
    gardens = unary_union([p.buffer(22 * S) for p, h, k, cr in buildings if h <= 10.5 * S and not cr])
    for g in (colombo, woods, gardens):
        shapely.prepare(g)
    chm, _, chm_lonlat, chm_px = canopy(CACHE, bbox_lonlat())
    peaks = landscape.canopy_peaks(chm, chm_px)
    rr = np.array([p[0] for p in peaks])
    cc = np.array([p[1] for p in peaks])
    px, pz = to_game(*chm_lonlat(rr, cc))
    # 0 pino domestico, 1 latifoglia (leccio, platano), 2 cipresso, 3 arbusto (oleandro, pittosforo), 4 olivo
    trees = []
    grow = NOW_YEAR - CHM_YEAR
    for (_, _, h, rad), x, z in zip(peaks, px, pz):
        pt = Point(x, z)
        if not clip.contains(pt):
            continue
        if no_trunk.contains(pt):
            # la chioma sporge sulla strada o sul tetto: il tronco sta sul bordo libero più vicino
            edge = nearest_points(no_trunk.boundary, pt)[0]
            if edge.distance(pt) > 3.5 * S:
                continue
            dx, dz = edge.x - x, edge.y - z
            d = math.hypot(dx, dz) or 1
            x, z = edge.x + dx / d * 0.4, edge.y + dz / d * 0.4
            pt = Point(x, z)
            if no_trunk.contains(pt):
                continue
        if h < 8:  # i giovani crescono: circa mezzo metro l'anno
            g_ = min(3.0, 0.45 * grow)
            rad *= ((h + g_) / h) ** 0.8
            h += g_
        hash_ = (int(x * 7.1) * 73856093 ^ int(z * 3.3) * 19349663) & 0xFFFF
        ratio = rad / h
        if h < 3.6:
            kind = 3
        elif ratio < 0.17 and h >= 6:
            kind = 2
        elif colombo.distance(pt) < 28 * S and h >= 7:
            kind = 0  # i filari di pini della Colombo
        elif woods.contains(pt):
            kind = 0 if h >= 14 and ratio >= 0.32 and hash_ % 4 == 0 else 1  # macchia di lecci e roverelle
        elif h >= 11 and ratio >= 0.27:
            kind = 0
        elif gardens.contains(pt) and h < 7.5 and hash_ % 3 == 0:
            kind = 4
        else:
            kind = 1
        trees.append([r10(x), r10(z), kind, r10(h * S), r10(min(rad, 8.5) * S)])

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

    # ---- facciate e tetti
    # Palazzi a meno di 8 m l'uno dall'altro sono lo stesso complesso (stesso costruttore): stesso
    # stile e stesso colore. Il tetto è "a coppi" se dalla Sentinel-2 è rosso-arancio, altrimenti
    # è un lastrico solare, del grigio misurato.
    n_b = len(buildings)
    parent = list(range(n_b))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    index = shapely.STRtree([b[0] for b in buildings])
    for i, (p, h, k, cr) in enumerate(buildings):
        for j in index.query(p.buffer(8 * S)):
            if j != i and buildings[j][0].distance(p) < 8 * S:
                parent[find(i)] = find(int(j))
    office = next((p["building"] for p in pois if p["role"] == "start" and "building" in p), -1)
    poi_b = {p["building"] for p in pois if "building" in p}
    # vetrine al piano terra: dove ci sono negozi, bar, agenzie (non gli uffici ai piani)
    STREET_LEVEL = {"real_estate_service", "bank_or_credit_union", "financial_service", "laundry_service", "personal_or_beauty_service",
                    "wellness_service", "animal_or_pet_service", "shipping_or_delivery_service", "travel_service", "automotive_service",
                    "gym", "fitness_studio", "pharmacy_and_drug_store"}
    shops = []
    for r in load("place"):
        root = ((r.get("taxonomy") or {}).get("hierarchy") or [None])[0]
        if (r.get("confidence") or 0) >= 0.4 and (root in ("food_and_drink", "shopping") or r.get("basic_category") in STREET_LEVEL):
            shops.append(project(shape(r["geometry"])))
    fuel = [project(shape(r["geometry"])) for r in load("place") if r.get("basic_category") == "gas_station"]
    street = unary_union([merged["road"], merged["walk"], merged["plaza"], merged["parking"], merged["path"]])
    shapely.prepare(street)
    styled = []
    for i, (p, h, k, cr) in enumerate(buildings):
        group = (find(i) * 2654435761) & 0xFFFFFFFF
        own = (i * 40503 + 17) & 0xFFFF
        h_m, area_m = h / S, p.area / (S * S)
        rgb = s2_color(p)
        tiles = rgb[0] > rgb[1] * 1.12 and rgb[0] > rgb[2] * 1.3 and rgb[0] - rgb[2] > 22
        if cr:
            style, roof = "shed", "canopy"
        elif i == office or (k == 1 and h_m <= 8):
            style, roof = "office", "flat"
        elif k == 2:
            style, roof = "school", "tiles" if tiles else "flat"
        elif k == 4 or (h_m <= 4 and area_m < 80):
            style, roof = "shed", "tiles" if tiles else "sheet"
        elif h_m <= 10.5:
            style, roof = "villa", "tiles" if tiles else "flat"
        else:
            style, roof = ["light", "light", "brick", "color", "color"][group % 5], "tiles" if tiles else "flat"
        if not cr and area_m > 150 and 4 * math.pi * p.area / p.length**2 > 0.88:
            roof = "dome"  # pianta circolare: copertura a calotta (es. la struttura rotonda dello sporting)
        walls = WALLS[style]
        wall = walls[(group // 7 + (own if style in ("villa", "shed") else 0)) % len(walls)]
        light = min(1.0, max(0.0, (float(np.mean(rgb)) - 70) / 130))
        roof_col = {
            "tiles": mix((166, 86, 58), (204, 128, 88), light),
            "flat": mix((118, 114, 106), (228, 224, 214), light),
            "dome": (236, 236, 232),
            "canopy": (232, 234, 238),
            "sheet": (150, 156, 160),
        }[roof]
        shop = []
        if not cr and style != "shed" and (i in poi_b or any(p.distance(q) < 6 * S for q in shops)):
            ring = list(p.exterior.coords)
            for j in range(len(ring) - 1):
                (ax, az), (bx, bz) = ring[j][:2], ring[j + 1][:2]
                L = math.hypot(bx - ax, bz - az)
                if L < 3.5 * S:
                    continue
                nx, nz = (bz - az) / L, -(bx - ax) / L
                mx, mz = (ax + bx) / 2, (az + bz) / 2
                if p.contains(Point(mx + nx * 0.5, mz + nz * 0.5)):
                    nx, nz = -nx, -nz
                if street.distance(Point(mx + nx, mz + nz)) < 9 * S and not bunion.contains(Point(mx + nx * 2, mz + nz * 2)):
                    shop.append(j)
        entry = {"h": r10(h), "k": k, "s": STYLE[style], "r": ROOF[roof], "rc": hexint(roof_col), "wc": hexint(hex3(wall))}
        if shop:
            entry["shop"] = shop
        if roof == "tiles":
            # pianta quasi rettangolare: tetto a padiglione sul rettangolo che la contiene
            c = list(p.minimum_rotated_rectangle.exterior.coords)
            e1, e2 = (c[1][0] - c[0][0], c[1][1] - c[0][1]), (c[2][0] - c[1][0], c[2][1] - c[1][1])
            if math.hypot(*e1) < math.hypot(*e2):
                e1, e2 = e2, e1
            L, W = math.hypot(*e1), math.hypot(*e2)
            if p.area / (L * W) > 0.82:
                entry["hip"] = [r10((c[0][0] + c[2][0]) / 2), r10((c[0][1] + c[2][1]) / 2), int(round(math.atan2(e1[1], e1[0]) * 1000)), r10(L), r10(W)]
        if cr and any(p.distance(q) < 12 * S for q in fuel):
            entry["fuel"] = 1
        entry["rings"] = enc_poly(p)
        styled.append(entry)

    # ---- campi sportivi: tipo dal colore (terra rossa, resina blu, erba sintetica) e dalla misura
    courts = []
    for r in load("land_use"):
        if r.get("class") != "pitch" or r["geometry"]["type"] != "Polygon":
            continue
        g = project(shape(r["geometry"]))
        if not g.intersects(clip):
            continue
        c = list(g.minimum_rotated_rectangle.exterior.coords)
        e1, e2 = (c[1][0] - c[0][0], c[1][1] - c[0][1]), (c[2][0] - c[1][0], c[2][1] - c[1][1])
        if math.hypot(*e1) < math.hypot(*e2):
            e1, e2 = e2, e1
        L, W = math.hypot(*e1), math.hypot(*e2)
        cx, cz = (c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2
        rgb = s2_color(g, 1.0)
        if rgb[0] > rgb[1] * 1.12 and rgb[0] > rgb[2] * 1.3:
            kind = "clay"
        elif L / S < 26:
            kind = "padel"
        elif rgb[2] > rgb[0] * 1.02:
            kind = "hard"
        else:
            kind = "turf"
        courts.append([COURT[kind], r10(cx), r10(cz), int(round(math.atan2(e1[1], e1[0]) * 1000)), r10(L), r10(W)])

    # ---- colore del suolo, cella per cella, dalla Sentinel-2
    n_c = int(round(2 * RHALF / (TINT_M * S)))
    cell = 2 * RHALF / n_c
    sub = 4
    fine = (np.arange(n_c * sub) + 0.5) * (cell / sub) - RHALF
    fx, fz = np.meshgrid(fine, fine)
    paved = unary_union([bunion, *(merged[k] for k in ("road", "walk", "plaza", "parking", "pitch", "water", "path"))])
    shapely.prepare(paved)
    pav = shapely.contains_xy(paved, fx.ravel(), fz.ravel()).reshape(fx.shape).astype(np.float32)
    pav = pav.reshape(n_c, sub, n_c, sub).mean(axis=(1, 3))
    pav = np.maximum(pav, landscape.blur(pav, 0.7))  # un pixel di 10 m "vede" anche il bordo accanto
    centers = (np.arange(n_c) + 0.5) * cell - RHALF
    cx_, cz_ = np.meshgrid(centers, centers)
    rows, cols = s2_index(*to_lonlat(cx_, cz_))
    tint = landscape.ground_tint(tci, s2["B04"], s2["B08"], rows, cols, pav)

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
            "source": f"Overture Maps ({RELEASE.split('/')[-1]}), dati © OpenStreetMap contributors (ODbL); chiome: Meta/WRI Canopy Height (CC BY 4.0); suolo e tetti: Copernicus Sentinel-2 ({SCENE.split('_')[2]})",
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
        "buildings": styled,
        "courts": [v for c in courts for v in c],
        "tint": {"n": n_c, "data": landscape.encode_rgb(tint)},
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
    print(f"{OUT}: {os.path.getsize(OUT) // 1024} KB — {len(buildings)} edifici, {len(roads)} strade, {len(trees)} alberi, {len(courts)} campi, {len(lamps)} lampioni, {len(stops)} fermate, {len(crossings)} strisce, {len(pois)} punti di interesse")


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
