import { INK, type G, type SpriteDef, circ, line, rr } from '../draw';

// Call di Gruppo: ispirata al logo di Teams (2025) e ridisegnata via codice, senza l'immagine originale.
// Due figure con sfumature dal celeste al viola (testa grande a sinistra, piccola a destra) e la tessera
// blu-viola con la T bianca; sopra la figura piccola pulsano le onde "in chiamata".
// Qui ci sono anche la cuffietta dei nemici in call e lo sbuffo lilla di quando la call finisce.

const LILAC = '#b9bbff';
const VIOLET = '#6f63e6';
// il logo è disegnato nel suo riquadro (1280×1352) e scalato nella cella da 128
const S = 0.078;
const OX = 4;
const OY = 19;
const LW = 3.5 / S; // filo scuro, in unità del logo

function grad(g: G, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/** Riempie il percorso corrente (anche con una sfumatura) e lo ripassa con il filo scuro. */
function shape(g: G, fill: string | CanvasGradient, lw = LW) {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.stroke();
}

/** Occhi arrabbiati che guardano a destra (in unità del logo), come gli altri nemici. */
function eyes(g: G, x: number, y: number, gap: number, r: number) {
  for (const ex of [x, x + gap]) {
    g.beginPath();
    g.arc(ex, y, r, 0, Math.PI * 2);
    shape(g, '#fff', LW * 0.7);
    g.beginPath();
    g.arc(ex + r * 0.35, y + r * 0.1, r * 0.5, 0, Math.PI * 2);
    g.fillStyle = INK;
    g.fill();
  }
  line(g, [x - r, y - r * 1.5, x + r * 0.8, y - r * 0.7], INK, LW * 1.1);
  line(g, [x + gap - r * 0.8, y - r * 0.7, x + gap + r, y - r * 1.5], INK, LW * 1.1);
}

/** Le due figure e la tessera con la T, misurate sul logo. */
function callLogo(g: G) {
  g.save();
  g.translate(OX, OY);
  g.scale(S, S);
  // figura piccola: corpo dietro, più scuro (indaco → viola)
  g.beginPath();
  g.roundRect(800, 568, 480, 784, 212);
  shape(g, grad(g, 800, 0, 1280, 0, [[0, '#3b2db5'], [1, '#9079ff']]));
  // figura grande: il corpo segue l'angolo arrotondato di quello dietro
  g.beginPath();
  g.moveTo(355, 497);
  g.lineTo(640, 497);
  g.arcTo(853, 497, 853, 710, 213);
  g.lineTo(853, 1140);
  g.arc(1065, 1140, 212, Math.PI, Math.PI / 2, true);
  g.lineTo(500, 1352);
  g.bezierCurveTo(300, 1352, 145, 1200, 145, 1000);
  g.lineTo(145, 707);
  g.arcTo(145, 497, 355, 497, 210);
  g.closePath();
  shape(g, grad(g, 145, 497, 700, 1352, [[0, '#82b9ff'], [0.55, '#7f8dff'], [1, '#5f56ec']]));
  // teste
  g.beginPath();
  g.arc(1030, 320, 178, 0, Math.PI * 2);
  shape(g, grad(g, 880, 160, 1150, 500, [[0, '#8fa3ff'], [1, '#5145d6']]));
  g.beginPath();
  g.arc(497, 213, 213, 0, Math.PI * 2);
  shape(g, grad(g, 320, 30, 650, 430, [[0, '#9ab4ff'], [0.6, '#9a8cff'], [1, '#6a5fe0']]));
  eyes(g, 420, 230, 150, 46);
  eyes(g, 975, 345, 118, 36);
  // tessera con la T
  g.beginPath();
  g.roundRect(0, 675, 569, 569, 115);
  shape(g, grad(g, 0, 675, 569, 1244, [[0, '#7f8cff'], [0.55, '#4338c4'], [1, '#2a1f9e']]));
  g.fillStyle = '#ffffff';
  g.fillRect(161, 797, 247, 60);
  g.fillRect(248, 857, 73, 265);
  g.restore();
}

/**
 * Onde "in chiamata" sopra la figura piccola: in 6 fotogrammi partono dall'interno e si allontanano,
 * poi una pausa. Sono solo accese o spente: la draw call degli sprite scarta i pixel semitrasparenti.
 */
function callWaves(g: G, i: number, n: number) {
  const cx = OX + 1030 * S;
  const cy = OY + 320 * S;
  for (let k = 0; k < 3; k++) {
    if ((i - k + n) % n > 2) continue;
    const r = 21 + k * 8;
    g.beginPath();
    g.arc(cx, cy, r, -1.75, -0.15);
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = LILAC;
    g.stroke();
  }
}

/** Cuffietta dei nemici in call: archetto, padiglioni e microfono, grossa di tratto per leggersi in piccolo. */
function headset(g: G) {
  g.beginPath();
  g.arc(64, 74, 42, Math.PI, Math.PI * 2);
  g.lineCap = 'round';
  g.lineWidth = 20;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = 12;
  g.strokeStyle = LILAC;
  g.stroke();
  line(g, [28, 100, 34, 112, 54, 116], INK, 9);
  line(g, [28, 100, 34, 112, 54, 116], LILAC, 4);
  circ(g, 58, 116, 7, VIOLET);
  rr(g, 10, 62, 28, 44, 10, VIOLET);
  rr(g, 90, 62, 28, 44, 10, VIOLET);
  rr(g, 16, 70, 10, 28, 4, LILAC, false);
  rr(g, 102, 70, 10, 28, 4, LILAC, false);
}

export const TEAMS_SPRITES: SpriteDef[] = [
  {
    id: 'en_call', cw: 1, ch: 1, frames: 6, fine: true,
    draw: (g, _w, _h, i, n) => {
      callLogo(g);
      callWaves(g, i, n);
    },
  },
  { id: 'call_headset', cw: 1, ch: 1, draw: (g) => headset(g) },
  {
    id: 'call_puff', cw: 1, ch: 1,
    draw: (g) => {
      circ(g, 50, 70, 30, '#cfd0ff', false);
      circ(g, 80, 64, 34, LILAC, false);
      circ(g, 64, 44, 26, '#ecebff', false);
    },
    sticker: false,
  },
];
