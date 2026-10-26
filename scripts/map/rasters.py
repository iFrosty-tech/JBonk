"""Legge una finestra di un GeoTIFF remoto (Cloud Optimized) con richieste HTTP Range.

Fonti usate da build_map.py, tutte aperte e senza credenziali:
- Meta / WRI High Resolution Canopy Height Maps: altezza delle chiome a ~1 m (CC BY 4.0),
  EPSG:3857, un file per quadkey di livello 9.
- Sentinel-2 L2A (Copernicus, dati liberi) dall'archivio COG su AWS: colori veri e NDVI a 10 m,
  in UTM 33N.
Le finestre lette finiscono in .cache come .npz: le build successive non scaricano niente.
"""
import math
import os

import imagecodecs
import numpy as np
import tifffile

from overture import HttpFile

CHM_URL = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/{qk}.tif"
S2_URL = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/{zone}/{band}/{sq}/{y}/{m}/{scene}/{asset}.tif"
R_EARTH = 6378137.0


def utm(lon, lat, zone=33):
    """lon/lat (WGS84) → UTM nord (metri), serie di Krüger troncata: errore sotto il millimetro qui."""
    a, f = 6378137.0, 1 / 298.257223563
    k0, n = 0.9996, f / (2 - f)
    A = a / (1 + n) * (1 + n * n / 4 + n**4 / 64)
    al = (n / 2 - 2 * n * n / 3 + 5 * n**3 / 16, 13 * n * n / 48 - 3 * n**3 / 5, 61 * n**3 / 240)
    lam = np.radians(np.asarray(lon, float) - (zone * 6 - 183))
    phi = np.radians(np.asarray(lat, float))
    e = 2 * np.sqrt(n) / (1 + n)
    t = np.sinh(np.arctanh(np.sin(phi)) - e * np.arctanh(e * np.sin(phi)))
    xi = np.arctan2(t, np.cos(lam))
    eta = np.arctanh(np.sin(lam) / np.sqrt(1 + t * t))
    x = eta + sum(al[j] * np.cos(2 * (j + 1) * xi) * np.sinh(2 * (j + 1) * eta) for j in range(3))
    y = xi + sum(al[j] * np.sin(2 * (j + 1) * xi) * np.cosh(2 * (j + 1) * eta) for j in range(3))
    return 500000 + k0 * A * x, k0 * A * y


def _quadkey(lon, lat, z):
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return "".join(str((1 if x & (1 << (i - 1)) else 0) + (2 if y & (1 << (i - 1)) else 0)) for i in range(z, 0, -1))


def _merc(lon, lat):
    return R_EARTH * math.radians(lon), R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def _read_window(url, col0, row0, col1, row1):
    """Pixel [row0:row1, col0:col1] della prima pagina (a strisce o a riquadri)."""
    tif = tifffile.TiffFile(HttpFile(url))
    page = tif.pages[0]
    fh = tif.filehandle
    spp = page.samplesperpixel
    out = np.zeros((row1 - row0, col1 - col0) + ((spp,) if spp > 1 else ()), dtype=page.dtype)

    def decode(i, h, w):
        fh.seek(page.dataoffsets[i])
        raw = fh.read(page.databytecounts[i])
        a = np.frombuffer(imagecodecs.zlib_decode(raw) if page.compression == 8 else raw, dtype=page.dtype)
        a = a[: h * w * spp].reshape((h, w, spp) if spp > 1 else (h, w))
        if page.predictor == 2:
            a = np.cumsum(a, axis=1, dtype=page.dtype)
        return a

    if page.is_tiled:
        tw, tl = page.tilewidth, page.tilelength
        across = (page.imagewidth + tw - 1) // tw
        for ty in range(row0 // tl, (row1 - 1) // tl + 1):
            for tx in range(col0 // tw, (col1 - 1) // tw + 1):
                a = decode(ty * across + tx, tl, tw)
                y0, x0 = ty * tl, tx * tw
                ys, xs = max(row0, y0), max(col0, x0)
                ye, xe = min(row1, y0 + tl), min(col1, x0 + tw)
                out[ys - row0 : ye - row0, xs - col0 : xe - col0] = a[ys - y0 : ye - y0, xs - x0 : xe - x0]
    else:
        rps = page.rowsperstrip
        for s in range(row0 // rps, (row1 - 1) // rps + 1):
            a = decode(s, rps, page.imagewidth)
            y0 = s * rps
            ys, ye = max(row0, y0), min(row1, y0 + rps)
            out[ys - row0 : ye - row0] = a[ys - y0 : ye - y0, col0:col1]
    return out


def _geo(url):
    tif = tifffile.TiffFile(HttpFile(url))
    p = tif.pages[0]
    sx, sy, _ = p.tags["ModelPixelScaleTag"].value
    tp = p.tags["ModelTiepointTag"].value
    return tp[3], tp[4], sx, sy


def canopy(cache, bbox):
    """Altezza delle chiome (metri, uint8) nel bbox lon/lat.

    Restituisce i dati, le funzioni lon/lat → (riga, colonna) e ritorno, e il lato di un pixel in metri.
    """
    path = os.path.join(cache, "canopy.npz")
    lon0, lat0, lon1, lat1 = bbox
    if not os.path.exists(path):
        url = CHM_URL.format(qk=_quadkey((lon0 + lon1) / 2, (lat0 + lat1) / 2, 9))
        ox, oy, sx, sy = _geo(url)
        x0, y1 = _merc(lon0, lat0)
        x1, y0 = _merc(lon1, lat1)
        c0, c1 = int((x0 - ox) / sx), int(math.ceil((x1 - ox) / sx))
        r0, r1 = int((oy - y0) / sy), int(math.ceil((oy - y1) / sy))
        data = _read_window(url, c0, r0, c1, r1)
        np.savez_compressed(path, data=data, geo=np.array([ox + c0 * sx, oy - r0 * sy, sx, sy]))
    z = np.load(path)
    data, (ox, oy, sx, sy) = z["data"], z["geo"]

    def index(lon, lat):
        x, y = R_EARTH * np.radians(lon), R_EARTH * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
        return (oy - y) / sy, (x - ox) / sx

    def lonlat(row, col):
        """Centro del pixel (riga, colonna) → lon/lat."""
        x, y = ox + (np.asarray(col) + 0.5) * sx, oy - (np.asarray(row) + 0.5) * sy
        return np.degrees(x / R_EARTH), np.degrees(2 * np.arctan(np.exp(y / R_EARTH)) - np.pi / 2)

    return data, index, lonlat, sx * math.cos(math.radians((lat0 + lat1) / 2))


def sentinel2(cache, bbox, scene, assets):
    """Bande di una scena Sentinel-2 (es. "S2B_33TTG_20260718_0_L2A") nel bbox lon/lat.

    `assets`: nomi dei file della scena (TCI = colori veri a 8 bit, B04 rosso, B08 vicino infrarosso).
    Restituisce {asset: array} più la funzione lon/lat → (riga, colonna), uguale per tutte le bande a 10 m.
    """
    path = os.path.join(cache, f"{scene}.npz")
    if not os.path.exists(path):
        tile, date = scene.split("_")[1], scene.split("_")[2]
        lon0, lat0, lon1, lat1 = bbox
        xs, ys = utm([lon0, lon1, lon0, lon1], [lat0, lat0, lat1, lat1], int(tile[:2]))
        out = {}
        for asset in assets:
            url = S2_URL.format(zone=int(tile[:2]), band=tile[2], sq=tile[3:], y=date[:4], m=int(date[4:6]), scene=scene, asset=asset)
            ox, oy, sx, sy = _geo(url)
            c0, c1 = int((min(xs) - ox) / sx), int(math.ceil((max(xs) - ox) / sx))
            r0, r1 = int((oy - max(ys)) / sy), int(math.ceil((oy - min(ys)) / sy))
            out[asset] = _read_window(url, c0, r0, c1, r1)
            out["geo"] = np.array([ox + c0 * sx, oy - r0 * sy, sx, sy, int(tile[:2])])
        np.savez_compressed(path, **out)
    z = dict(np.load(path))
    ox, oy, sx, sy, zone = z.pop("geo")

    def index(lon, lat):
        x, y = utm(lon, lat, int(zone))
        return (oy - y) / sy, (x - ox) / sx

    return z, index
