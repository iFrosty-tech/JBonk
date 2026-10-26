import javaPartsUrl from '../assets/java-parts.webp?inline';
import soldoCardUrl from '../assets/soldo-card.webp?inline';
import { type G, type SpriteDef, line, makeCanvas, rr, txt } from './draw';

// Sprite animati ricavati dai loghi di tecnologie e clienti.
// - Claude (mascotte in pixel art), Angular (path SVG originali) e GPI sono ridisegnati in vettoriale.
// - Java e la carta Soldo partono dalle immagini in src/assets: il logo Java è scomposto in parti
//   (vapore, anelli della tazza, manico, piattino) che si muovono ognuna per conto suo;
//   la carta ruota in prospettiva, una colonna di pixel alla volta.
// `frames` è la lunghezza del ciclo: il gioco sceglie il fotogramma in base al tempo.

const TAU = Math.PI * 2;
const images = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`immagine non caricata: ${src.slice(0, 40)}…`));
    im.src = src;
  });
}

/** Va chiamata prima di costruire l'atlas: le immagini sono nel bundle come data URL. */
export async function loadLogoImages() {
  const src: Record<string, string> = { java: javaPartsUrl, soldo: soldoCardUrl };
  await Promise.all(
    Object.entries(src).map(async ([k, url]) => {
      try {
        images.set(k, await loadImage(url));
      } catch (e) {
        console.warn(e); // lo sprite resterà vuoto, il gioco funziona lo stesso
      }
    }),
  );
}

// ---------------------------------------------------------------- Claude Code

const CLAUDE = '#d97757';

interface CrabPose {
  bob?: number; // sollevamento del corpo, in "pixel" della mascotte
  liftA?: number; // zampe 1 e 3 sollevate
  liftB?: number; // zampe 2 e 4 sollevate
  armL?: number; // spostamento verticale delle braccia (negativo = in alto)
  armR?: number;
  squash?: number; // <1 schiacciato, >1 allungato
  eyes?: 'open' | 'blink' | 'squint';
}

/** La mascotte di Claude Code: corpo 9×6 "pixel", due braccia, quattro zampe, piedi a y=122. */
function crab(g: G, o: CrabPose) {
  const p = 10;
  const sq = o.squash ?? 1;
  const bw = 9 * p * (1 + (1 - sq) * 0.6);
  const bh = 6 * p * sq;
  const u = bw / 9; // larghezza di un pixel del corpo
  const ground = 122;
  const bottom = ground - 2 * p - (o.bob ?? 0) * p;
  const top = bottom - bh;
  const left = 64 - bw / 2;
  g.fillStyle = CLAUDE;
  // zampe sotto le colonne 0, 2, 6, 8; coppie diagonali: A = 0 e 6, B = 2 e 8
  [0, 2, 6, 8].forEach((col, k) => {
    const lift = (k % 2 === 0 ? o.liftA : o.liftB) ?? 0;
    const lx = left + col * u + (lift > 0 ? 0.35 * p : 0);
    g.fillRect(lx, bottom - 1, u, ground - lift * p - bottom + 1);
  });
  g.fillRect(left, top, bw, bh);
  const armY = top + bh / 3;
  g.fillRect(left - p, armY + (o.armL ?? 0) * p, p + 1, 2 * p);
  g.fillRect(left + bw - 1, armY + (o.armR ?? 0) * p, p + 1, 2 * p);
  const ey = top + bh / 3;
  for (const col of [1, 7]) {
    const ex = left + col * u;
    g.fillStyle = '#000';
    if (o.eyes === 'blink') g.fillRect(ex, ey + p * 0.4, u, p * 0.25);
    else if (o.eyes === 'squint') {
      // > <  (concentrato)
      const pts = col === 1 ? [ex, ey, ex + u, ey + p / 2, ex, ey + p] : [ex + u, ey, ex, ey + p / 2, ex + u, ey + p];
      line(g, pts, '#000', 3.2);
    } else g.fillRect(ex, ey, u, p);
  }
}

const CRAB_WALK: CrabPose[] = [
  {},
  { bob: 0.5, liftA: 1, armL: -0.5, armR: 0.3 },
  { bob: 0.15 },
  { bob: 0.5, liftB: 1, armL: 0.3, armR: -0.5 },
];
const CRAB_HIT: CrabPose[] = [
  { squash: 0.86, armL: 0.6, armR: 0.6, eyes: 'squint' }, // carica
  { squash: 1.08, bob: 1.2, liftA: 0.6, liftB: 0.6, armL: -2.4, armR: -2.4, eyes: 'squint' }, // colpo
  { squash: 0.94, armL: -1, armR: -1 }, // atterraggio
];

/** Il simbolo di Claude: raggi irregolari attorno al centro (effetto dei colpi). */
function claudeSpark(g: G) {
  const rays = [1, 0.74, 0.94, 0.68, 0.98, 0.8, 0.9, 0.7, 1, 0.78, 0.88, 0.72];
  g.strokeStyle = CLAUDE;
  g.lineCap = 'round';
  rays.forEach((k, i) => {
    const a = (i / rays.length) * TAU + 0.12;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + c * 30 * k, 64 + s * 30 * k);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(64 + c * 28 * k, 64 + s * 28 * k);
    g.lineTo(64 + c * 56 * k, 64 + s * 56 * k);
    g.stroke();
  });
}

// ---------------------------------------------------------------- Angular

let ngCache: Record<'shield' | 'right' | 'left' | 'a' | 'aShade', Path2D> | null = null;
/** Path del logo ufficiale (viewBox 256×270). */
function ng() {
  return (ngCache ??= {
    shield: new Path2D('M127.606.341L.849 44.95 20.88 211.022l106.86 58.732 107.412-59.528L255.175 44.16 127.606.341z'),
    right: new Path2D('M242.532 53.758L127.31 14.466v241.256l96.561-53.441 18.66-148.523z'),
    left: new Path2D('M15.073 54.466l17.165 148.525 95.07 52.731V14.462L15.074 54.465z'),
    a: new Path2D('M159.027 142.898L127.31 157.73H93.881l-15.714 39.305-29.228.54L127.31 23.227l31.717 119.672zm-3.066-7.467l-28.44-56.303-23.329 55.334h23.117l28.652.97z'),
    aShade: new Path2D('M127.309 23.226l.21 55.902 26.47 55.377h-26.62l-.06 23.189 36.81.035 17.204 39.852 27.967.518-81.981-174.873z'),
  });
}

/** Scudo di Angular che ruota su se stesso: faccia, spessore del bordo, retro con le cinghie. */
function angularShield(g: G, i: number, n: number) {
  const P = ng();
  const th = (i / n) * TAU;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const ce = Math.sign(c || 1) * Math.max(Math.abs(c), 0.03); // di taglio resta una lama sottile
  const k = 104 / 270;
  const top = 18;
  const D = 20; // spessore dello scudo, in unità SVG
  const near = c >= 0 ? 0 : -D * s;
  const far = c >= 0 ? -D * s : 0;
  const at = (off: number) => {
    g.translate(64 + off * k, top);
    g.scale(k * ce, k);
    g.translate(-128, 0);
  };
  const layers = 8;
  for (let j = 0; j < layers; j++) {
    g.save();
    at(far + (near - far) * (j / layers));
    g.fillStyle = j % 2 ? '#86898f' : '#95989e';
    g.fill(P.shield);
    g.restore();
  }
  g.save();
  at(near);
  if (c >= 0) {
    g.fillStyle = '#B3B3B3';
    g.fill(P.shield);
    g.fillStyle = '#A6120D';
    g.fill(P.right);
    g.fillStyle = '#DD1B16';
    g.fill(P.left);
    g.fillStyle = '#F2F2F2';
    g.fill(P.a);
    g.fillStyle = '#B3B3B3';
    g.fill(P.aShade);
    if (c > 0.5) {
      // riflesso che scorre sulla faccia mentre lo scudo gira
      g.save();
      g.clip(P.shield);
      const gx = 128 - s * 260;
      const grad = g.createLinearGradient(gx - 46, 70, gx + 46, 130);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 270);
      g.restore();
    }
  } else {
    g.fillStyle = '#a7aab0';
    g.fill(P.shield);
    g.fillStyle = '#5c0b08';
    g.fill(P.left);
    g.fill(P.right);
    g.fillStyle = '#4a3b2c';
    g.fillRect(44, 92, 168, 20);
    g.fillRect(52, 164, 152, 20);
    g.fillStyle = '#2f251b';
    g.beginPath();
    g.roundRect(110, 76, 36, 124, 14);
    g.fill();
    g.fillStyle = '#d9dce1';
    for (const [x, y] of [[50, 102], [206, 102], [58, 174], [198, 174]]) {
      g.beginPath();
      g.arc(x, y, 7, 0, TAU);
      g.fill();
    }
  }
  // la faccia si scurisce quando è di taglio
  g.fillStyle = `rgba(25,12,12,${(1 - Math.abs(c)) * 0.45})`;
  g.fill(P.shield);
  g.restore();
}

// ---------------------------------------------------------------- Java

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

// ---------------------------------------------------------------- GPI

const GPI_ORANGE = '#ee7d01';
const GPI_PURPLE = '#941d81';

/** Logo GPI ricostruito dalle sue forme (coordinate dell'originale 554×554, centro 279,242). */
function gpiLogo(g: G, cx: number, cy: number, scale: number, dotLift = 0, dotSquash = 1) {
  g.save();
  g.translate(cx, cy);
  g.scale(scale, scale);
  g.translate(-279, -242);
  g.lineCap = 'butt';
  g.lineWidth = 31;
  g.strokeStyle = GPI_ORANGE;
  g.beginPath();
  g.arc(151.5, 258.5, 80, 0, Math.PI * 1.75); // g
  g.stroke();
  g.beginPath();
  g.arc(351.5, 258.5, 80, Math.PI, Math.PI * 2.657); // p
  g.stroke();
  g.fillStyle = GPI_ORANGE;
  g.fillRect(463, 171, 31, 177); // i
  g.fillStyle = GPI_PURPLE;
  g.fillRect(141, 227, 104, 31.5); // trattino della g
  g.fillRect(260, 258.5, 31, 125.5); // gamba della p
  g.beginPath();
  g.ellipse(478.5, 124.5 - dotLift + (1 - dotSquash) * 24, 24.5 * (2 - dotSquash), 24.5 * dotSquash, 0, 0, TAU);
  g.fill();
  g.restore();
}

/** Tracciato ECG: linea piatta con il battito (onda P, QRS, onda T) centrato in `at`. */
function ecg(g: G, x0: number, x1: number, y: number, at: number, color: string, glow: boolean) {
  g.beginPath();
  for (let x = x0; x <= x1; x += 1) {
    const d = x - at;
    let v = 0;
    v += Math.exp(-(((d + 11) / 3) ** 2)) * -3; // P
    if (d > -2.5 && d <= 0) v += (d + 2.5) * -6.4; // Q→R
    else if (d > 0 && d <= 3) v += -16 + d * 8; // R→S
    else if (d > 3 && d <= 5) v += 8 - (d - 3) * 4; // ritorno
    v += Math.exp(-(((d - 13) / 4) ** 2)) * -4.5; // T
    if (x === x0) g.moveTo(x, y + v);
    else g.lineTo(x, y + v);
  }
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  g.strokeStyle = color;
  if (glow) {
    g.shadowColor = color;
    g.shadowBlur = 6;
  }
  g.stroke();
  g.shadowBlur = 0;
}

function heart(g: G, x: number, y: number, s: number, fill: string) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 14);
  g.bezierCurveTo(-26, -2, -16, -24, 0, -11);
  g.bezierCurveTo(16, -24, 26, -2, 0, 14);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#1d2333';
  g.stroke();
  // croce bianca
  g.fillStyle = '#fff';
  g.fillRect(-2.6, -9, 5.2, 15);
  g.fillRect(-7.5, -4, 15, 5.2);
  g.restore();
}

/** Roll-up "Presidio GPI" (cella 128×256): logo, monitor col battito, cuore che pulsa. */
function gpiStation(g: G, i: number, n: number, on: boolean) {
  const t = i / n;
  const beat = on ? [1.16, 1.07, 1.02][i] ?? 1 : 1;
  // base e banner
  rr(g, 26, 240, 76, 10, 4, '#5d6475', true, 3);
  rr(g, 18, 228, 92, 16, 5, '#9aa5b8', true, 3);
  rr(g, 22, 16, 84, 214, 3, '#ffffff', true, 3.5);
  rr(g, 17, 9, 94, 10, 4, '#c5ccd8', true, 3);
  // logo: il puntino della i saltella, tutto il logo "batte" col cuore
  const hop = on ? Math.sin(t * Math.PI) : 0;
  const land = on && i === 0 ? 0.78 : on && i === 1 ? 0.9 : 1;
  gpiLogo(g, 64, 52, 0.168 * (on ? 1 + (beat - 1) * 0.25 : 1), hop * 46, land);
  txt(g, 'The Healthcare', 64, 87, 10, '#3c3c3b', '600');
  txt(g, 'Partner', 64, 99, 10, '#3c3c3b', '600');
  g.fillStyle = GPI_ORANGE;
  g.fillRect(30, 108, 44, 3);
  g.fillStyle = GPI_PURPLE;
  g.fillRect(74, 108, 24, 3);
  // monitor
  rr(g, 28, 118, 72, 46, 6, '#1d2333', true, 3);
  g.save();
  g.beginPath();
  g.rect(32, 121, 64, 40);
  g.clip();
  g.strokeStyle = 'rgba(57,228,138,0.12)';
  g.lineWidth = 1;
  for (let x = 36; x < 96; x += 8) line(g, [x, 121, x, 161], 'rgba(57,228,138,0.12)', 1);
  if (on) {
    const at = 30 + t * 72;
    ecg(g, 32, 96, 145, at, '#39e48a', true);
    g.fillStyle = '#d9ffe9';
    g.beginPath();
    g.arc(Math.min(95, at + 6), 145, 2.4, 0, TAU);
    g.fill();
  } else ecg(g, 32, 96, 145, -100, '#5d6475', false);
  g.restore();
  // cuore
  heart(g, 64, 194, 1.15 * beat, on ? GPI_PURPLE : '#9aa5b8');
  txt(g, on ? 'PRESIDIO' : 'TORNO SUBITO', 64, 219, on ? 11 : 9, on ? GPI_PURPLE : '#7b8496', '900');
}

/** Piccola croce che sale quando il presidio cura. */
function healPlus(g: G) {
  rr(g, 50, 22, 28, 84, 8, GPI_ORANGE, true, 4);
  rr(g, 22, 50, 84, 28, 8, GPI_ORANGE, true, 4);
  g.fillStyle = GPI_ORANGE;
  g.fillRect(52, 52, 24, 24);
}

// ---------------------------------------------------------------- Soldo

let soldoBack: HTMLCanvasElement | null = null;
/** Retro della carta: banda magnetica, pannello firma e logo. */
function cardBack(w: number, h: number) {
  if (soldoBack) return soldoBack;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.beginPath();
  g.roundRect(0, 0, w, h, 11);
  g.fillStyle = '#121214';
  g.fill();
  g.save();
  g.clip();
  const band = g.createLinearGradient(0, 30, 0, 72);
  band.addColorStop(0, '#2b2b30');
  band.addColorStop(1, '#3c3c44');
  g.fillStyle = band;
  g.fillRect(0, 34, w, 40);
  g.restore();
  g.fillStyle = '#ece8df';
  g.fillRect(16, 96, 120, 26);
  g.strokeStyle = '#cfc8b8';
  g.lineWidth = 2;
  for (let x = 16; x < 136; x += 8) line(g, [x, 96, x + 8, 122], '#d8d1c2', 2);
  g.fillStyle = '#fff';
  g.fillRect(142, 96, 40, 26);
  txt(g, '•••', 162, 109, 14, '#1d2333', '900');
  for (let k = 0; k < 3; k++) {
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(16, 148 + k * 12, 110 - k * 26, 5);
  }
  g.shadowColor = '#ff5fa2';
  g.shadowBlur = 16;
  txt(g, 'soldo', 64, h - 36, 34, '#ffffff', '800');
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.arc(w - 52, h - 36, 16, 0, TAU);
  g.arc(w - 32, h - 36, 16, 0, TAU);
  g.fill();
  return (soldoBack = c);
}

/** Carta Soldo che gira su se stessa in prospettiva, con riflesso quando è di fronte. */
function soldoCard(g: G, i: number, n: number) {
  const im = images.get('soldo');
  if (!im) return;
  const back = cardBack(im.width, im.height);
  const th = (i / n) * TAU;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const H = 108;
  const W = (H * im.width) / im.height;
  const cx = 64;
  const cy = 67;
  const dist = 230; // distanza della "camera": più è bassa, più la prospettiva è forte
  const src = c >= 0 ? im : back;
  const cols = 48;
  const sw = im.width / cols;
  for (let j = 0; j < cols; j++) {
    const xa = (j / cols - 0.5) * W;
    const xb = ((j + 1) / cols - 0.5) * W;
    const fa = dist / (dist + xa * s);
    const fb = dist / (dist + xb * s);
    const sa = cx + xa * c * fa;
    const sb = cx + xb * c * fb;
    const f = (fa + fb) / 2;
    const u = c >= 0 ? j : cols - 1 - j; // il retro si legge dritto
    g.drawImage(src, u * sw, 0, sw, im.height, Math.min(sa, sb) - 0.3, cy - (H * f) / 2, Math.abs(sb - sa) + 0.6, H * f);
  }
  if (Math.abs(c) < 0.2) rr(g, cx - 2, cy - H / 2, 4, H, 2, '#d8dbe2', false);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(10,10,20,${(1 - Math.abs(c)) * 0.4})`;
  g.fillRect(0, 0, 128, 128);
  if (c > 0.3) {
    const gx = cx - s * 70;
    const grad = g.createLinearGradient(gx - 22, cy - 30, gx + 22, cy + 30);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  g.restore();
}

// ---------------------------------------------------------------- elenco

export const LOGO_SPRITES: SpriteDef[] = [
  { id: 'claude', cw: 1, ch: 1, frames: CRAB_WALK.length, draw: (g, _w, _h, i) => crab(g, CRAB_WALK[i]) },
  { id: 'claude_idle', cw: 1, ch: 1, frames: 2, draw: (g, _w, _h, i) => crab(g, { eyes: i ? 'blink' : 'open' }) },
  { id: 'claude_hit', cw: 1, ch: 1, frames: CRAB_HIT.length, draw: (g, _w, _h, i) => crab(g, CRAB_HIT[i]) },
  { id: 'claude_spark', cw: 1, ch: 1, draw: claudeSpark, sticker: false },
  { id: 'angular', cw: 1, ch: 1, frames: 16, draw: (g, _w, _h, i, n) => angularShield(g, i, n) },
  { id: 'java', cw: 1, ch: 1, frames: 8, fine: true, draw: (g, _w, _h, i, n) => javaCup(g, i, n) },
  { id: 'java_steam', cw: 1, ch: 1, frames: 8, draw: (g, _w, _h, i, n) => javaSteam(g, i, n), sticker: false },
  { id: 'java_splash', cw: 1, ch: 1, frames: 5, draw: (g, _w, _h, i, n) => coffeeSplash(g, i, n) },
  { id: 'gpi', cw: 1, ch: 2, frames: 12, draw: (g, _w, _h, i, n) => gpiStation(g, i, n, true) },
  { id: 'gpi_off', cw: 1, ch: 2, draw: (g) => gpiStation(g, 0, 1, false) },
  { id: 'heal_plus', cw: 1, ch: 1, draw: healPlus },
  { id: 'soldo', cw: 1, ch: 1, frames: 16, draw: (g, _w, _h, i, n) => soldoCard(g, i, n) },
];
