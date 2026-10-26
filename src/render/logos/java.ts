import { type G, type SpriteDef, TAU, makeCanvas } from '../draw';
import { images } from './images';

// Java: il logo originale scomposto in parti (vapore, anelli della tazza, manico, piattino).

interface Part {
  dx: number; // posizione nel logo (239×324)
  dy: number;
  w: number;
  h: number;
  sx: number; // posizione nel foglio java-parts.webp (tutte le parti hanno sy = 3)
}
// generato da java-parts.webp: ogni parte del logo è separata dalle altre
const JAVA = {
  w: 239,
  h: 324,
  sy: 3,
  steamL: { dx: 76, dy: -0.9, w: 86, h: 178, sx: 3 },
  steamR: { dx: 119.2, dy: 64.8, w: 72, h: 123, sx: 92 },
  handle: { dx: 186.8, dy: 173.2, w: 53, h: 66, sx: 167 },
  ring1: { dx: 25.2, dy: 176, w: 163, h: 31, sx: 223 },
  ring2: { dx: 50.9, dy: 213.3, w: 126, h: 28, sx: 389 },
  ring3: { dx: 60.3, dy: 248.8, w: 111, h: 29, sx: 518 },
  plate1: { dx: -0.9, dy: 271.8, w: 227, h: 37, sx: 632 },
  plate2: { dx: 43.6, dy: 292.1, w: 196, h: 32, sx: 862 },
};
const JAVA_PAD = 14;
let javaWork: HTMLCanvasElement | null = null;

/**
 * Compone un fotogramma del logo Java a piena risoluzione: il vapore ondeggia riga per riga
 * (l'onda sale, la base resta ferma) e gli anelli della tazza rimbalzano uno dopo l'altro.
 */
function javaFrame(i: number, n: number, steamOnly: boolean): HTMLCanvasElement | null {
  const im = images.get('java');
  if (!im) return null;
  const c = (javaWork ??= makeCanvas(JAVA.w + JAVA_PAD * 2, JAVA.h + JAVA_PAD * 2));
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.translate(JAVA_PAD, JAVA_PAD);
  const t = (i / n) * TAU;
  const steam = (p: Part, phase: number, amp: number) => {
    const y0 = Math.round(p.dy); // righe su pixel interi: niente aloni tra una riga e l'altra
    for (let r = 0; r < p.h; r++) {
      const up = 1 - r / p.h;
      const off = Math.sin(phase + r * 0.055) * amp * up ** 1.3;
      g.drawImage(im, p.sx, JAVA.sy + r, p.w, 1, p.dx + off, y0 + r, p.w, 1);
    }
  };
  steam(JAVA.steamL, t, 10);
  steam(JAVA.steamR, t + 2.1, 9);
  if (steamOnly) return c;
  const bounce = (k: number) => Math.sin(t - k * 0.9) * 2.6;
  const part = (p: Part, dy: number, sx = 1) => {
    g.save();
    g.translate(p.dx + p.w / 2, p.dy + p.h / 2 + dy);
    g.scale(sx, 1);
    g.drawImage(im, p.sx, JAVA.sy, p.w, p.h, -p.w / 2, -p.h / 2, p.w, p.h);
    g.restore();
  };
  part(JAVA.plate2, 0);
  part(JAVA.plate1, 0);
  for (const [p, k] of [[JAVA.ring3, 2], [JAVA.ring2, 1], [JAVA.ring1, 0]] as const) part(p, bounce(k), 1 + Math.sin(t - k * 0.9) * 0.03);
  part(JAVA.handle, (bounce(0) + bounce(1)) / 2);
  return c;
}

function javaCup(g: G, i: number, n: number) {
  const c = javaFrame(i, n, false);
  if (!c) return;
  const k = 112 / JAVA.h;
  g.drawImage(c, 64 - (JAVA.w / 2 + JAVA_PAD) * k, 122 - (JAVA.h + JAVA_PAD) * k, c.width * k, c.height * k);
}

function javaSteam(g: G, i: number, n: number) {
  const c = javaFrame(i, n, true);
  if (!c) return;
  // solo il vapore (x 66..201, y -1..188 nel logo), ingrandito a tutta cella
  const k = 112 / 190;
  g.drawImage(c, 64 - (133.5 + JAVA_PAD) * k, 122 - (188 + JAVA_PAD) * k, c.width * k, c.height * k);
}

/** Schizzo di caffè quando una tazza atterra: corona che sale, gocce che ricadono, pozza. */
function coffeeSplash(g: G, i: number, n: number) {
  const t = i / (n - 1);
  const brown = '#6b3e1f';
  const crema = '#c58b4f';
  g.fillStyle = brown;
  g.beginPath();
  g.ellipse(64, 114, 30 + t * 22, 7 + t * 3, 0, 0, TAU);
  g.fill();
  const crown = Math.sin(Math.min(1, t * 1.5) * Math.PI) * 52;
  const spikes = [0.55, 0.85, 1, 0.75, 0.95, 0.8, 0.6];
  spikes.forEach((f, j) => {
    const x = 64 + (j - 3) * 10 * (1 + t * 0.5);
    const h = crown * f;
    if (h < 3) return;
    const lean = (j - 3) * 2.5 * (1 + t);
    g.fillStyle = j % 2 ? brown : '#7d4a26';
    g.beginPath();
    g.moveTo(x - 6, 114);
    g.quadraticCurveTo(x - 3 + lean * 0.5, 114 - h * 0.6, x + lean, 114 - h);
    g.quadraticCurveTo(x + 3 + lean * 0.5, 114 - h * 0.6, x + 6, 114);
    g.closePath();
    g.fill();
    g.fillStyle = crema;
    g.beginPath();
    g.arc(x + lean, 114 - h, 4.5, 0, TAU);
    g.fill();
  });
  // gocce: partono quando la corona è alta, poi ricadono ai lati
  if (t > 0.2) {
    const k = (t - 0.2) / 0.8;
    for (let j = 0; j < 6; j++) {
      const side = j % 2 ? 1 : -1;
      const sp = 0.6 + (j >> 1) * 0.25;
      const x = 64 + side * (14 + k * 46 * sp);
      const y = 114 - 40 * sp - Math.sin(k * Math.PI) * 30 * sp + k * k * 30;
      g.fillStyle = j % 3 ? brown : crema;
      g.beginPath();
      g.arc(x, Math.min(110, y), 5.5 - k * 2, 0, TAU);
      g.fill();
    }
  }
}

export const JAVA_SPRITES: SpriteDef[] = [
  { id: 'java', cw: 1, ch: 1, frames: 8, fine: true, draw: (g, _w, _h, i, n) => javaCup(g, i, n) },
  { id: 'java_steam', cw: 1, ch: 1, frames: 8, draw: (g, _w, _h, i, n) => javaSteam(g, i, n), sticker: false },
  { id: 'java_splash', cw: 1, ch: 1, frames: 5, draw: (g, _w, _h, i, n) => coffeeSplash(g, i, n) },
];
