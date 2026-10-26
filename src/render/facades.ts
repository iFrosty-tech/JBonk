import * as THREE from 'three';

// Texture disegnate su canvas per le mappe reali: facciate (una per stile), vetrine del piano
// terra, coppi dei tetti e superfici dei campi sportivi. Ogni facciata è un modulo di 4 campate
// per 4 piani che si ripete; il secondo canvas sono le finestre accese di notte.
// I muri sono bianchi: il colore vero arriva dal colore dei vertici (misurato o scelto in build_map.py).

/** Stile di facciata, nello stesso ordine di STYLE in scripts/map/build_map.py. */
export interface FacadeStyle {
  bay: number; // larghezza di una campata (unità)
  floor: number; // altezza di un piano (unità)
  balconies: boolean;
  /** Colore di parapetti e torrini sul tetto, se diverso dal muro (cortina: travertino). */
  trim?: string;
  paint: (g: CanvasRenderingContext2D, lit: CanvasRenderingContext2D, rnd: () => number) => void;
}

const C = 64; // pixel per campata e per piano

interface WinOpts {
  frame: string;
  glass?: string;
  /** Tapparella abbassata (frazione) o persiane aperte/chiuse. */
  shutter?: 'roll' | 'pers';
  shutterColor?: string;
  sill?: string;
  litP?: number;
}

/** Finestra o portafinestra con telaio, vetro, riflesso e oscuranti. */
function win(g: CanvasRenderingContext2D, lit: CanvasRenderingContext2D, rnd: () => number, x: number, y: number, w: number, h: number, o: WinOpts) {
  g.fillStyle = o.frame;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = o.glass ?? '#3c4a58';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, y, Math.max(3, w * 0.28), h);
  g.fillStyle = o.frame;
  g.fillRect(x + w / 2 - 1, y, 2, h);
  let open = h;
  if (o.shutter === 'roll') {
    // tapparella: abbassata a metà, del tutto o per niente
    const f = rnd() < 0.45 ? 0 : rnd() < 0.5 ? 0.35 + rnd() * 0.3 : 1;
    const sh = Math.round(h * f);
    g.fillStyle = o.shutterColor ?? '#b7babd';
    g.fillRect(x, y, w, sh);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 3; k < sh; k += 3) g.fillRect(x, y + k, w, 1);
    open = h - sh;
  } else if (o.shutter === 'pers') {
    const c = o.shutterColor ?? '#5f7058';
    g.fillStyle = c;
    if (rnd() < 0.6) {
      g.fillRect(x - 2 - w / 2, y - 1, w / 2, h + 2);
      g.fillRect(x + w + 2, y - 1, w / 2, h + 2);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let k = 3; k < h; k += 4) {
        g.fillRect(x - 2 - w / 2, y + k, w / 2, 1.2);
        g.fillRect(x + w + 2, y + k, w / 2, 1.2);
      }
    } else {
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let k = 3; k < h; k += 4) g.fillRect(x, y + k, w, 1.2);
      g.fillRect(x + w / 2 - 0.5, y, 1, h);
      open = 0;
    }
  }
  if (o.sill) {
    g.fillStyle = o.sill;
    g.fillRect(x - 4, y + h + 1, w + 8, 3);
  }
  if (open > 4 && rnd() < (o.litP ?? 0.38)) {
    lit.fillStyle = rnd() < 0.5 ? '#ffcf7a' : '#ffe6b8';
    lit.fillRect(x, y + h - open, w, open);
  }
}

function each(fn: (x: number, y: number, col: number, row: number) => void) {
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) fn(col * C, row * C, col, row);
}

export const FACADES: FacadeStyle[] = [
  // 0 intonaco chiaro: portafinestre sui balconi, tapparelle grigie, filo dei solai
  {
    bay: 3.3,
    floor: 2.5,
    balconies: true,
    paint(g, lit, rnd) {
      each((x, y, col) => {
        g.fillStyle = '#e2dfd8';
        g.fillRect(x, y + C - 4, C, 4);
        if (col % 2 === 0) win(g, lit, rnd, x + 16, y + 10, 32, C - 12, { frame: '#cfd3d6', shutter: 'roll' });
        else win(g, lit, rnd, x + 20, y + 14, 24, 28, { frame: '#cfd3d6', shutter: 'roll', sill: '#d9d6cf' });
      });
    },
  },
  // 1 cortina di mattoni, cornici e marcapiani in travertino
  {
    bay: 3.2,
    floor: 2.5,
    balconies: true,
    trim: '#ece6da',
    paint(g, lit, rnd) {
      g.fillStyle = '#b06549';
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 6) {
        for (let x = (y / 6) % 2 ? 0 : 7; x < 256; x += 14) {
          g.fillStyle = `rgba(${rnd() < 0.5 ? '60,20,10' : '255,200,170'},${(rnd() * 0.12).toFixed(3)})`;
          g.fillRect(x, y, 13, 5);
          g.fillStyle = '#cdb6a4';
          g.fillRect(x + 13, y, 1, 5);
        }
        g.fillStyle = '#cdb6a4';
        g.fillRect(0, y + 5, 256, 1);
      }
      each((x, y, col) => {
        g.fillStyle = '#ece6da';
        g.fillRect(x, y + C - 6, C, 6);
        const door = col % 2 === 1;
        const wx = x + (door ? 17 : 20);
        const wy = y + (door ? 10 : 14);
        const ww = door ? 30 : 24;
        const wh = door ? C - 16 : 28;
        g.fillStyle = '#ece6da';
        g.fillRect(wx - 5, wy - 5, ww + 10, wh + 8);
        win(g, lit, rnd, wx, wy, ww, wh, { frame: '#f4f1ea', shutter: 'roll', shutterColor: '#a7a39c', sill: '#ece6da' });
      });
    },
  },
  // 2 intonaco colorato con persiane
  {
    bay: 3.2,
    floor: 2.5,
    balconies: true,
    paint(g, lit, rnd) {
      each((x, y, col) => {
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.fillRect(x, y + C - 3, C, 3);
        if (col % 2 === 0) win(g, lit, rnd, x + 22, y + 10, 20, C - 12, { frame: '#f2efe8', shutter: 'pers', shutterColor: '#6a7564' });
        else win(g, lit, rnd, x + 22, y + 14, 20, 28, { frame: '#f2efe8', shutter: 'pers', shutterColor: '#6a7564', sill: '#f2efe8' });
      });
    },
  },
  // 3 villino: finestre piccole con persiane verdi, più muro
  {
    bay: 3.6,
    floor: 2.4,
    balconies: false,
    paint(g, lit, rnd) {
      each((x, y, col, row) => {
        if ((col + row) % 4 === 3) return;
        win(g, lit, rnd, x + 24, y + 16, 16, 28, { frame: '#f4f1ea', shutter: 'pers', shutterColor: '#4f6a45', sill: '#efe9dd', litP: 0.3 });
      });
    },
  },
  // 4 uffici: nastri di vetro e marcapiani chiari
  {
    bay: 2.4,
    floor: 2.9,
    balconies: false,
    paint(g, lit, rnd) {
      each((x, y) => {
        const grad = g.createLinearGradient(0, y, 0, y + 46);
        grad.addColorStop(0, '#5b7894');
        grad.addColorStop(1, '#2c445c');
        g.fillStyle = grad;
        g.fillRect(x, y + 2, C, 44);
        g.fillStyle = '#9aa6b1';
        g.fillRect(x, y + 2, 2, 44);
        g.fillRect(x + 32, y + 2, 2, 44);
        g.fillRect(x, y + 2, C, 2);
        g.fillRect(x, y + 44, C, 2);
        if (rnd() < 0.55) {
          lit.fillStyle = '#b8c8e0';
          lit.fillRect(x + 2, y + 4, 62, 40);
        }
      });
    },
  },
  // 5 scuola: finestroni a griglia
  {
    bay: 3.2,
    floor: 3.0,
    balconies: false,
    paint(g, lit, rnd) {
      each((x, y) => {
        win(g, lit, rnd, x + 9, y + 12, 46, 34, { frame: '#f4f4f0', glass: '#4a5b6b', sill: '#e9e4d8', litP: 0.2 });
        g.fillStyle = '#f4f4f0';
        g.fillRect(x + 9, y + 28, 46, 2);
        g.fillRect(x + 20, y + 12, 2, 34);
        g.fillRect(x + 42, y + 12, 2, 34);
      });
    },
  },
  // 6 capannone, tettoia, magazzino: lamiera grecata e una fila di finestrelle
  {
    bay: 4,
    floor: 3,
    balconies: false,
    paint(g, lit, rnd) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      for (let x = 0; x < 256; x += 6) g.fillRect(x, 0, 2, 256);
      each((x, y, col) => {
        if (col % 2) return;
        win(g, lit, rnd, x + 8, y + 8, 48, 10, { frame: '#d0d2d4', glass: '#56636e', litP: 0.15 });
      });
    },
  },
];

/** Larghezza di una vetrina del piano terra (unità): la texture ne ha 4. */
export const SHOP_BAY = 3.6;

export interface FacadeTex {
  map: THREE.CanvasTexture;
  lit: THREE.CanvasTexture;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(cv: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Facciata di uno stile: modulo 4×4 e finestre accese. */
export function facadeTexture(style: FacadeStyle, seed: number): FacadeTex {
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const l = canvas(256, 256);
  const lg = l.getContext('2d')!;
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, 256, 256);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  style.paint(g, lg, rnd);
  return { map: tex(c), lit: tex(l) };
}

/** Vetrine del piano terra: fascia per l'insegna, vetrate tra pilastri rivestiti, una porta. */
export function shopTexture(): FacadeTex {
  const c = canvas(256, 64);
  const g = c.getContext('2d')!;
  const l = canvas(256, 64);
  const lg = l.getContext('2d')!;
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#3a3f47';
  g.fillRect(0, 0, 256, 12);
  for (let b = 0; b < 4; b++) {
    const x = b * 64;
    const grad = g.createLinearGradient(0, 14, 0, 64);
    grad.addColorStop(0, '#4d5f70');
    grad.addColorStop(1, '#1f2a34');
    g.fillStyle = grad;
    g.fillRect(x + 6, 14, 52, 50);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.moveTo(x + 10, 64);
    g.lineTo(x + 30, 14);
    g.lineTo(x + 40, 14);
    g.lineTo(x + 20, 64);
    g.fill();
    g.fillStyle = '#2b2f36';
    g.fillRect(x + 6, 14, 52, 2);
    g.fillRect(x + 6, 24, 52, 1.5);
    if (b === 1) {
      // porta a vetri con maniglione
      g.fillRect(x + 31, 24, 1.5, 40);
      g.fillStyle = '#c9ccd0';
      g.fillRect(x + 27, 40, 2, 10);
      g.fillRect(x + 35, 40, 2, 10);
    }
    lg.fillStyle = b % 2 ? '#ffd9a0' : '#fff0d0';
    lg.fillRect(x + 6, 16, 52, 48);
  }
  return { map: tex(c), lit: tex(l) };
}

/** Coppi: file di tegole lungo la falda (u lungo la gronda, v verso il colmo). */
export function tileTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) {
    const grad = g.createLinearGradient(x, 0, x + 8, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 8, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 2);
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,20,10'},0.1)`;
    g.fillRect(Math.floor(rnd() * 8) * 8, Math.floor(rnd() * 4) * 16, 8, 16);
  }
  return tex(c);
}

/** Tipi di campo, nello stesso ordine di COURT in build_map.py. */
export const COURT_TYPES = ['clay', 'hard', 'padel', 'turf'] as const;

/** Superficie di un campo con le righe (u lungo il lato lungo). Le misure sono quelle regolamentari, scalate sul campo. */
export function courtTexture(type: (typeof COURT_TYPES)[number]) {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  g.lineWidth = 3;
  if (type === 'padel') {
    g.fillStyle = '#2f62b8';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffffff';
    g.strokeRect(6, 6, W - 12, H - 12);
    const s = W * (6.95 / 20);
    line(W / 2 - s, 6, W / 2 - s, H - 6);
    line(W / 2 + s, 6, W / 2 + s, H - 6);
    line(W / 2 - s, H / 2, W / 2 + s, H / 2);
    return tex(c, false);
  }
  if (type === 'turf') {
    for (let k = 0; k < 10; k++) {
      g.fillStyle = k % 2 ? '#3f8a45' : '#47964c';
      g.fillRect((k * W) / 10, 0, W / 10, H);
    }
    g.strokeStyle = '#f2f2ee';
    g.strokeRect(10, 10, W - 20, H - 20);
    line(W / 2, 10, W / 2, H - 10);
    g.beginPath();
    g.arc(W / 2, H / 2, 34, 0, Math.PI * 2);
    g.stroke();
    g.strokeRect(10, H / 2 - 60, 60, 120);
    g.strokeRect(W - 70, H / 2 - 60, 60, 120);
    return tex(c, false);
  }
  // tennis: terra rossa con righe bianche, oppure resina blu dentro il verde
  const clay = type === 'clay';
  g.fillStyle = clay ? '#c4673f' : '#3d7a52';
  g.fillRect(0, 0, W, H);
  if (clay) {
    let s = 5;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,220,190' : '90,30,10'},0.07)`;
      g.fillRect(rnd() * W, rnd() * H, 3 + rnd() * 6, 2 + rnd() * 3);
    }
  }
  // 23,77 × 10,97 m dentro ~36 × 18 m
  const L = W * (23.77 / 36);
  const D2 = H * (10.97 / 18);
  const S1 = H * (8.23 / 18);
  const sv = W * (6.4 / 36);
  const x0 = (W - L) / 2;
  const y0 = (H - D2) / 2;
  if (!clay) {
    g.fillStyle = '#2f5f9e';
    g.fillRect(x0 - 12, y0 - 10, L + 24, D2 + 20);
  }
  g.strokeStyle = '#f4f1ea';
  g.strokeRect(x0, y0, L, D2);
  line(x0, (H - S1) / 2, x0 + L, (H - S1) / 2);
  line(x0, (H + S1) / 2, x0 + L, (H + S1) / 2);
  line(W / 2 - sv, (H - S1) / 2, W / 2 - sv, (H + S1) / 2);
  line(W / 2 + sv, (H - S1) / 2, W / 2 + sv, (H + S1) / 2);
  line(W / 2 - sv, H / 2, W / 2 + sv, H / 2);
  line(x0, H / 2, x0 + 8, H / 2);
  line(x0 + L, H / 2, x0 + L - 8, H / 2);
  return tex(c, false);
}

/** Frangivento verde dei campi da tennis e rete dei padel: telo in basso, maglia sopra. */
export function windscreenTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(60,70,62,0.9)';
  g.lineWidth = 1.5;
  for (let k = -64; k <= 128; k += 8) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.moveTo(k + 64, 0);
    g.lineTo(k, 64);
    g.stroke();
  }
  g.fillStyle = 'rgba(38,74,48,0.92)';
  g.fillRect(0, 26, 64, 38);
  g.fillStyle = '#5c6670';
  g.fillRect(0, 0, 64, 2);
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
