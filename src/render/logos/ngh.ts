import { type G, type SpriteDef, TAU, circ, line, rr, txt } from '../draw';
import { images } from './images';

// NGH · NextGenerationHIS: il "radar" del logo è ridisegnato in vettoriale (misurato sull'originale),
// la scritta NGH viene da assets/ngh-text.webp. Nel gioco è un totem eliminacode da ospedale:
// sullo schermo lo spicchio del logo gira come il fascio di un radar e la stampante emette i numeri.

const DARK = '#00636b';
const TEAL = '#008193';
const LIGHT = '#81cbd0';
const ORANGE = '#ee7f01';

// punti che il radar "trova" quando il fascio ci passa sopra (angolo, distanza in unità del logo)
const BLIPS = [
  [0.7, 118],
  [2.1, 92],
  [3.3, 128],
  [4.4, 84],
  [5.5, 122],
];

/**
 * Il simbolo del logo (coordinate dell'originale 544×367, centro 110.5,152): semicerchio azzurro,
 * spicchio scuro, anello e punto arancione. `sweep` ruota lo spicchio, `spin` l'anello.
 */
function radar(g: G, cx: number, cy: number, s: number, sweep: number, spin: number, pulse: number, live: boolean) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.fillStyle = LIGHT;
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, 106.5, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
  g.fill();
  if (live) {
    // scia del fascio: spicchi sottili sempre più trasparenti
    for (let k = 0; k < 6; k++) {
      const a1 = sweep - Math.PI / 2 - k * 0.13;
      g.fillStyle = `rgba(0,99,107,${0.28 - k * 0.045})`;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 146, a1 - 0.13, a1);
      g.closePath();
      g.fill();
    }
    for (const [a, r] of BLIPS) {
      const age = (((sweep - a) % TAU) + TAU) % TAU;
      if (age > 2.2) continue;
      g.fillStyle = `rgba(238,127,1,${1 - age / 2.2})`;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 13 * (1 + (1 - age / 2.2) * 0.4), 0, TAU);
      g.fill();
    }
  }
  g.fillStyle = DARK;
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, 146, sweep - Math.PI / 2, sweep);
  g.closePath();
  g.fill();
  g.strokeStyle = TEAL;
  g.lineWidth = 35;
  g.lineCap = 'butt';
  g.beginPath();
  g.arc(0, 0, 56.5, -0.8 + spin, Math.PI + spin);
  g.stroke();
  g.fillStyle = ORANGE;
  g.beginPath();
  g.arc(0, 0, 38.9 * pulse, 0, TAU);
  g.fill();
  g.restore();
}

/** Il biglietto col numero (anche effetto quando il totem viene usato). */
function ticket(g: G, x: number, y: number, w: number, h: number, num: string, font: number) {
  g.save();
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  // bordo strappato in basso
  const teeth = 6;
  for (let k = teeth; k >= 0; k--) g.lineTo(x + (w * k) / teeth, y + h - (k % 2 ? 0 : 3));
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#1d2333';
  g.stroke();
  g.clip();
  g.fillStyle = TEAL;
  g.fillRect(x, y, w, Math.max(3, h * 0.14));
  txt(g, num, x + w / 2, y + h * 0.55, font, '#1d2333', '900', 'monospace');
  g.restore();
}

/** Totem eliminacode NGH (cella 128×256). */
function nghTotem(g: G, i: number, n: number, on: boolean) {
  const t = i / n;
  // base e corpo
  rr(g, 30, 236, 72, 14, 5, '#3a4250', true, 3);
  rr(g, 22, 10, 86, 230, 14, '#f4f7f8', true, 3.5);
  g.save();
  g.beginPath();
  g.roundRect(22, 10, 86, 230, 14);
  g.clip();
  g.fillStyle = DARK;
  g.fillRect(22, 10, 9, 230);
  g.fillStyle = LIGHT;
  g.fillRect(31, 10, 3, 230);
  g.fillStyle = 'rgba(0,99,107,0.07)';
  g.fillRect(34, 150, 74, 90);
  g.restore();
  // schermo col radar
  rr(g, 38, 20, 62, 78, 8, '#1d2333', true, 3);
  g.save();
  g.beginPath();
  g.roundRect(42, 24, 54, 70, 4);
  g.clip();
  g.fillStyle = on ? '#f3fbfc' : '#c9cfd6';
  g.fillRect(42, 24, 54, 70);
  for (let y = 26; y < 94; y += 6) line(g, [42, y, 96, y], on ? 'rgba(0,129,147,0.08)' : 'rgba(0,0,0,0.05)', 1);
  if (on) radar(g, 69, 59, 0.18, t * TAU, -t * TAU, 1 + Math.sin(t * TAU * 2) * 0.07, true);
  else {
    g.globalAlpha = 0.35;
    radar(g, 69, 56, 0.16, 0, 0, 1, false);
    g.globalAlpha = 1;
    rr(g, 46, 70, 46, 14, 3, '#1d2333', false);
    txt(g, 'CHIUSO', 69, 77.5, 10, '#f4f7f8', '900');
  }
  g.restore();
  // scritta del marchio
  const im = images.get('ngh');
  if (im) {
    const w = 62;
    const h = (w * im.height) / im.width;
    if (!on) g.globalAlpha = 0.55;
    g.drawImage(im, 69 - w / 2, 104, w, h);
    g.globalAlpha = 1;
  }
  // display "stiamo servendo"
  rr(g, 41, 141, 56, 18, 4, '#11161f', true, 2.5);
  if (on) {
    txt(g, 'A 042', 69, 150.5, 12, '#ffb21a', '900', 'monospace');
    if (i % 4 < 2) circ(g, 92, 145, 1.8, '#ffb21a', false);
  } else txt(g, '- - -', 69, 150.5, 12, '#5d6475', '900', 'monospace');
  // stampante: il biglietto esce piano piano e viene strappato
  rr(g, 46, 168, 46, 7, 3, '#2a303c', true, 2.5);
  if (on) {
    const len = 6 + (i % 8) * 3.2;
    ticket(g, 52, 173, 34, len, len > 14 ? 'A043' : '', 9);
  }
  // pulsante
  if (on) {
    g.fillStyle = `rgba(238,127,1,${0.25 + Math.sin(t * TAU) * 0.15})`;
    g.beginPath();
    g.arc(69, 214, 15, 0, TAU);
    g.fill();
  }
  circ(g, 69, 214, 10, on ? ORANGE : '#9aa5b8', true, 3);
  circ(g, 69, 214, 4, on ? '#ffd0a0' : '#c5ccd8', false);
}

/** Onda del radar: un velo verticale che si accende alla base (ripetuto lungo un cerchio). */
function nghWave(g: G) {
  const grad = g.createLinearGradient(0, 124, 0, 20);
  grad.addColorStop(0, 'rgba(129,203,208,0.95)');
  grad.addColorStop(0.18, 'rgba(0,129,147,0.6)');
  grad.addColorStop(1, 'rgba(0,129,147,0)');
  g.fillStyle = grad;
  g.fillRect(0, 20, 128, 104);
  g.fillStyle = 'rgba(243,251,252,0.95)';
  g.fillRect(0, 118, 128, 6);
  // bordi laterali sfumati: i pannelli vicini si fondono in un anello continuo
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, 128, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.3, 'rgba(0,0,0,1)');
  side.addColorStop(0.7, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'source-over';
}

/** "Bip" del radar su un nemico messo in attesa. */
function nghPing(g: G) {
  g.lineWidth = 7;
  g.strokeStyle = TEAL;
  g.beginPath();
  g.arc(64, 64, 50, 0, TAU);
  g.stroke();
  g.lineWidth = 5;
  g.strokeStyle = LIGHT;
  g.beginPath();
  g.arc(64, 64, 32, 0, TAU);
  g.stroke();
  g.fillStyle = ORANGE;
  g.beginPath();
  g.arc(64, 64, 13, 0, TAU);
  g.fill();
}

export const NGH_SPRITES: SpriteDef[] = [
  { id: 'ngh', cw: 1, ch: 2, frames: 12, draw: (g, _w, _h, i, n) => nghTotem(g, i, n, true) },
  { id: 'ngh_off', cw: 1, ch: 2, draw: (g) => nghTotem(g, 0, 1, false) },
  { id: 'ngh_ticket', cw: 1, ch: 1, draw: (g) => ticket(g, 30, 22, 68, 84, 'A042', 19) },
  { id: 'ngh_wave', cw: 1, ch: 1, sticker: false, draw: nghWave },
  { id: 'ngh_ping', cw: 1, ch: 1, sticker: false, draw: nghPing },
];
