import { type G, type SpriteDef, TAU, line, rr, txt } from '../draw';

// GPI: il logo ricostruito in vettoriale su un roll-up "Presidio GPI" che cura.

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

export const GPI_SPRITES: SpriteDef[] = [
  { id: 'gpi', cw: 1, ch: 2, frames: 12, draw: (g, _w, _h, i, n) => gpiStation(g, i, n, true) },
  { id: 'gpi_off', cw: 1, ch: 2, draw: (g) => gpiStation(g, 0, 1, false) },
  { id: 'heal_plus', cw: 1, ch: 1, draw: healPlus },
];
