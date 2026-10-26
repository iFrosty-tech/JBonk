"""Vegetazione e colore del suolo dai raster (vedi rasters.py).

- Alberi: cime della mappa delle altezze delle chiome (Meta/WRI, ~1 m), ciascuna con altezza e
  raggio della chioma misurati. La specie si sceglie in build_map.py dal contesto.
- Suolo: colore per ogni cella di 10 m dalla Sentinel-2 (NDVI + colore vero), senza la
  "contaminazione" di asfalto e tetti, che viene ricostruita dalle celle vicine.
"""
import base64
import math

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def blur(a, sigma):
    """Sfocatura gaussiana separabile (bordi ripetuti)."""
    r = max(1, int(3 * sigma))
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma * sigma))
    k /= k.sum()
    a = np.pad(a, [(r, r), (0, 0)] + [(0, 0)] * (a.ndim - 2), mode="edge")
    a = sum(k[i] * a[i : i + a.shape[0] - 2 * r] for i in range(2 * r + 1))
    a = np.pad(a, [(0, 0), (r, r)] + [(0, 0)] * (a.ndim - 2), mode="edge")
    return sum(k[i] * a[:, i : i + a.shape[1] - 2 * r] for i in range(2 * r + 1))


def canopy_peaks(chm, px_m, min_h=2.0):
    """Alberi singoli: massimi locali dell'altezza delle chiome.

    Restituisce (riga, colonna, altezza m, raggio della chioma m). Il raggio è la distanza media,
    su 8 direzioni, a cui la chioma scende sotto metà dell'altezza della cima; due cime più vicine
    di 0,6 raggi sono la stessa chioma (resta la più alta).
    """
    h = chm.astype(np.float32)
    hs = blur(h, 1.0)
    top = sliding_window_view(np.pad(hs, 2), (5, 5)).max(axis=(2, 3))
    cand = np.argwhere((hs >= top) & (hs >= min_h))
    cand = cand[np.argsort(-hs[cand[:, 0], cand[:, 1]], kind="stable")]
    H, W = h.shape
    dirs = [(math.cos(a * math.pi / 4), math.sin(a * math.pi / 4)) for a in range(8)]
    out = []
    for r, c in cand:
        hp = float(hs[r, c])
        tot = 0
        for dx, dy in dirs:
            d = 1
            while d < 10:
                y, x = int(round(r + dy * d)), int(round(c + dx * d))
                if not (0 <= y < H and 0 <= x < W) or h[y, x] < hp * 0.5:
                    break
                d += 1
            tot += d
        rad = max(0.8, (tot / 8 - 0.5) * px_m)
        if any((r - r2) ** 2 + (c - c2) ** 2 < (0.6 * max(rad, rad2) / px_m) ** 2 for r2, c2, _, rad2 in out):
            continue
        out.append((int(r), int(c), hp, rad))
    return out


# NDVI → colore "da gioco" del suolo: terra nuda, stoppie, prato secco, prato, prato irrigato
NDVI_STOPS = [(0.05, (170, 152, 122)), (0.15, (178, 168, 124)), (0.28, (162, 162, 108)), (0.42, (138, 154, 90)), (0.6, (108, 144, 74)), (0.8, (84, 126, 62))]
PAVING = (196, 192, 182)  # piazzali e cortili chiari senza vegetazione (non sono nei dati delle strade)


def ndvi_color(ndvi):
    v = np.clip(ndvi, NDVI_STOPS[0][0], NDVI_STOPS[-1][0])
    xs = [s[0] for s in NDVI_STOPS]
    return np.stack([np.interp(v, xs, [s[1][k] for s in NDVI_STOPS]) for k in range(3)], axis=-1)


def ground_tint(tci, red, nir, rows, cols, paved):
    """Colore del suolo per una griglia di celle.

    `rows`, `cols`: posizione (frazionaria) del centro di ogni cella nei raster Sentinel-2;
    `paved`: frazione di ogni cella coperta da edifici, strade e piazzali (0..1), già allargata
    all'impronta di un pixel. Dove il pixel è "sporco" il colore viene dalle celle vicine.
    """

    def sample(a):
        r0 = np.clip(np.floor(rows - 0.5).astype(int), 0, a.shape[0] - 2)
        c0 = np.clip(np.floor(cols - 0.5).astype(int), 0, a.shape[1] - 2)
        dr = np.clip(rows - 0.5 - r0, 0, 1)
        dc = np.clip(cols - 0.5 - c0, 0, 1)
        if a.ndim == 3:
            dr, dc = dr[..., None], dc[..., None]
        a = a.astype(np.float32)
        return a[r0, c0] * (1 - dr) * (1 - dc) + a[r0, c0 + 1] * (1 - dr) * dc + a[r0 + 1, c0] * dr * (1 - dc) + a[r0 + 1, c0 + 1] * dr * dc

    rgb = np.clip((sample(tci) - 12) * 1.3, 0, 255)
    lum = rgb.mean(axis=-1, keepdims=True)
    r, n = sample(red), sample(nir)
    ndvi = (n - r) / (n + r + 1e-6)
    # il colore vero, smorzato, dà le sfumature; la tavolozza tiene il tutto nello stile del gioco
    col = ndvi_color(ndvi) * 0.75 + (rgb * 0.5 + lum * 0.5) * 0.25
    pav = (np.clip((lum[..., 0] - 150) / 50, 0, 1) * np.clip((0.22 - ndvi) / 0.1, 0, 1))[..., None]
    col = col * (1 - pav) + np.array(PAVING, np.float32) * pav
    w = np.clip(1 - paved, 0, 1) ** 2
    fill = blur(col * w[..., None], 2.0) / np.maximum(blur(w, 2.0), 1e-3)[..., None]
    return np.clip(col * w[..., None] + fill * (1 - w[..., None]), 0, 255).astype(np.uint8)


def encode_rgb(img):
    return base64.b64encode(np.ascontiguousarray(img, dtype=np.uint8).tobytes()).decode("ascii")
