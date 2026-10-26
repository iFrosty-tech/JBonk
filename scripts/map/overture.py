"""Scarica da Overture Maps i dati di un rettangolo (lon/lat), senza credenziali.

Overture pubblica le sue release come GeoParquet su S3 (accesso anonimo). Ogni file è
ordinato spazialmente e ogni row group ha le statistiche del bbox: leggiamo il footer di
ogni file con richieste HTTP Range e scarichiamo solo i row group che toccano l'area.
"""
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor

import pyarrow.parquet as pq
import requests
import shapely.wkb

BASE = "https://overturemaps-us-west-2.s3.amazonaws.com"
RELEASE = "release/2026-10-21.0"
LAYERS = [
    "transportation/segment",
    "buildings/building",
    "base/land_use",
    "base/land_cover",
    "base/water",
    "base/infrastructure",
    "places/place",
]
_session = requests.Session()


class HttpFile:
    """File in sola lettura su HTTP: richieste Range con cache a blocchi da 1 MB."""

    BLOCK = 1 << 20

    def __init__(self, url):
        self.url = url
        r = _session.head(url, timeout=60)
        r.raise_for_status()
        self.size = int(r.headers["Content-Length"])
        self.pos = 0
        self.cache = {}
        self.closed = False

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def _block(self, i):
        if i not in self.cache:
            a = i * self.BLOCK
            z = min(self.size, a + self.BLOCK) - 1
            err = None
            for _ in range(4):
                try:
                    r = _session.get(self.url, headers={"Range": f"bytes={a}-{z}"}, timeout=120)
                    r.raise_for_status()
                    self.cache[i] = r.content
                    break
                except requests.RequestException as e:
                    err = e
            else:
                raise IOError(f"{self.url}: {err}")
        return self.cache[i]

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        out = bytearray()
        while n > 0:
            i = self.pos // self.BLOCK
            off = self.pos - i * self.BLOCK
            chunk = self._block(i)[off : off + n]
            out += chunk
            self.pos += len(chunk)
            n -= len(chunk)
        return bytes(out)

    def close(self):
        self.closed = True


def _list_files(prefix):
    keys, token = [], None
    while True:
        url = f"{BASE}/?list-type=2&prefix={prefix}"
        if token:
            url += "&continuation-token=" + requests.utils.quote(token, safe="")
        text = _session.get(url, timeout=60).text
        keys += re.findall(r"<Key>([^<]+\.parquet)</Key>", text)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", text)
        if not m:
            return keys
        token = m.group(1)


def _stat(rg, name):
    for j in range(rg.num_columns):
        c = rg.column(j)
        if c.path_in_schema == name and c.statistics is not None and c.statistics.has_min_max:
            return c.statistics.min, c.statistics.max
    return None


def _scan(key, bbox):
    xmin, ymin, xmax, ymax = bbox
    pf = pq.ParquetFile(HttpFile(f"{BASE}/{key}"))
    rows = []
    for i in range(pf.metadata.num_row_groups):
        rg = pf.metadata.row_group(i)
        s = [_stat(rg, f"bbox.{k}") for k in ("xmin", "xmax", "ymin", "ymax")]
        if not all(s) or s[0][0] > xmax or s[1][1] < xmin or s[2][0] > ymax or s[3][1] < ymin:
            continue
        for r in pf.read_row_group(i).to_pylist():
            b = r["bbox"]
            if b["xmin"] > xmax or b["xmax"] < xmin or b["ymin"] > ymax or b["ymax"] < ymin:
                continue
            r["geometry"] = shapely.wkb.loads(r["geometry"]).__geo_interface__
            rows.append(r)
    return rows


def fetch(out_dir, bbox, layers=LAYERS):
    """Salva in `out_dir` un file JSON per tipo (es. segment.json) con le righe nel bbox."""
    os.makedirs(out_dir, exist_ok=True)
    for layer in layers:
        theme, typ = layer.split("/")
        keys = _list_files(f"{RELEASE}/theme={theme}/type={typ}/")
        rows = []
        with ThreadPoolExecutor(16) as ex:
            for part in ex.map(lambda k: _scan(k, bbox), keys):
                rows += part
        with open(os.path.join(out_dir, f"{typ}.json"), "w") as fh:
            json.dump(rows, fh, default=str)
        print(f"{layer}: {len(rows)} elementi ({len(keys)} file letti)", flush=True)
