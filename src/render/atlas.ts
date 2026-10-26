import * as THREE from 'three';
import { INK, type G, type SpriteDef, circ, ell, line, makeCanvas, path, poly, rr, txt } from './draw';
import { LOGO_SPRITES, loadLogoImages } from './logos/index';
import { drawJpanikLogo } from './logos/jpanik';

// Tutti gli sprite del gioco sono disegnati via codice su un unico canvas (texture atlas).
// Stile "sagoma di cartone": forma piena + bordo bianco + filo scuro, come le standee da ufficio.
// Sostituire uno sprite = cambiare la sua funzione di disegno (o, più avanti, caricare un PNG).
// Gli sprite con `frames: n` sono animati: ogni fotogramma ha la sua cella (vedi Atlas.anim).
// I loghi di tecnologie, clienti e premi, con le loro animazioni, sono in logos/ (un file per logo).

const CELL = 128;
const WIDTH = 2048;
const COLS = WIDTH / CELL;
const MAX_ROWS = 32; // altezza massima 4096 px: la supportano tutte le GPU con WebGL 2
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export interface Frame {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  aspect: number; // larghezza / altezza
  cx: number;
  cy: number;
  cw: number;
  ch: number;
}

// ---------- primitive di disegno (le altre sono in draw.ts) ----------

function emoji(g: G, ch: string, x: number, y: number, size: number) {
  g.font = `${size}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, x, y);
}
/** Occhi da cartone che guardano a destra; `angry` aggiunge le sopracciglia. */
function eyes(g: G, x: number, y: number, gap: number, r: number, angry = false, white = true) {
  for (const ex of [x, x + gap]) {
    if (white) circ(g, ex, y, r, '#fff', true, 2.5);
    circ(g, ex + r * 0.35, y + r * 0.1, r * 0.5, INK, false);
  }
  if (angry) {
    line(g, [x - r, y - r * 1.5, x + r * 0.8, y - r * 0.7], INK, 4);
    line(g, [x + gap - r * 0.8, y - r * 0.7, x + gap + r, y - r * 1.5], INK, 4);
  }
}
function legs(g: G, x: number, y: number, gap: number, len: number, color = INK) {
  line(g, [x, y, x - 2, y + len], color, 5);
  line(g, [x + gap, y, x + gap + 2, y + len], color, 5);
  line(g, [x - 2, y + len, x + 6, y + len], color, 5);
  line(g, [x + gap + 2, y + len, x + gap + 10, y + len], color, 5);
}

interface PersonOpts {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bun' | 'cap';
  top: string;
  legs: string;
  shoes: string;
  beard?: boolean;
  glasses?: boolean;
  angry?: boolean;
}
type Extra = (g: G, w: number, h: number) => void;

/** Personaggio chibi su base 128x128, piedi a y≈122, rivolto a destra. */
function person(g: G, o: PersonOpts, extraBehind?: Extra, extraFront?: Extra) {
  if (extraBehind) extraBehind(g, 128, 128);
  if (o.hairStyle === 'long') rr(g, 38, 22, 42, 52, 18, o.hair);
  rr(g, 51, 92, 11, 24, 4, o.legs);
  rr(g, 67, 92, 11, 24, 4, o.legs);
  rr(g, 48, 112, 18, 9, 4, o.shoes);
  rr(g, 65, 112, 18, 9, 4, o.shoes);
  rr(g, 40, 58, 48, 40, 13, o.top);
  circ(g, 64, 38, 24, o.skin);
  // capelli
  g.beginPath();
  if (o.hairStyle === 'cap') {
    g.arc(64, 34, 24, Math.PI, Math.PI * 2);
    g.closePath();
    path(g, o.hair);
    rr(g, 76, 28, 22, 7, 3, o.hair);
  } else {
    g.arc(64, 36, 25, Math.PI * 1.02, Math.PI * 1.98);
    g.quadraticCurveTo(70, 24, 48, 30);
    g.closePath();
    path(g, o.hair);
    if (o.hairStyle === 'bun') circ(g, 42, 18, 9, o.hair);
  }
  if (o.beard) {
    g.beginPath();
    g.arc(68, 42, 18, Math.PI * 0.05, Math.PI * 0.9);
    g.closePath();
    path(g, o.hair, true, 2.5);
  }
  eyes(g, 66, 38, 13, 4.4, o.angry, false);
  if (o.glasses) {
    g.lineWidth = 2.5;
    g.strokeStyle = INK;
    g.strokeRect(61, 33, 11, 10);
    g.strokeRect(75, 33, 11, 10);
    line(g, [72, 37, 75, 37], INK, 2.5);
  }
  if (!o.beard) line(g, o.angry ? [72, 52, 82, 50] : [72, 50, 80, 52], INK, 3);
  if (extraFront) extraFront(g, 128, 128);
}

// ---------- definizioni degli sprite ----------

const SKIN = ['#f2c7a5', '#d9a07a', '#a8714f'];

const sprites: SpriteDef[] = [
  // Personaggi giocabili
  {
    id: 'char_dev', cw: 1, ch: 1,
    draw: (g) =>
      person(
        g,
        { skin: SKIN[0], hair: '#3b2a20', hairStyle: 'short', top: '#2bb3a3', legs: '#33415c', shoes: '#f4f4f4' },
        (g) => ell(g, 54, 54, 20, 12, '#22958a'),
        (g) => {
          // cuffie
          g.beginPath();
          g.arc(64, 36, 27, Math.PI * 1.1, Math.PI * 1.9);
          g.lineWidth = 5;
          g.strokeStyle = INK;
          g.stroke();
          rr(g, 36, 34, 9, 14, 4, '#e8554e');
          // laptop
          poly(g, [66, 70, 104, 64, 106, 86, 70, 92], '#c9d1de');
          poly(g, [69, 73, 101, 68, 102, 83, 72, 88], '#173042', false);
          txt(g, '</>', 86, 78, 12, '#5dfdb0', '900', 'monospace');
        },
      ),
  },
  {
    id: 'char_pm', cw: 1, ch: 1,
    draw: (g) =>
      person(
        g,
        { skin: SKIN[1], hair: '#6b3e1f', hairStyle: 'bun', top: '#f4f6fb', legs: '#1f2b4d', shoes: '#3a2418' },
        undefined,
        (g) => {
          poly(g, [62, 60, 68, 60, 69, 84, 65, 90, 61, 84], '#d8343f', true, 2.5);
          // tablet con Gantt
          rr(g, 74, 62, 32, 38, 4, '#2d3550');
          rr(g, 78, 68, 14, 5, 2, '#ffd23f', false);
          rr(g, 84, 77, 16, 5, 2, '#4cc3ff', false);
          rr(g, 80, 86, 20, 5, 2, '#ff7a59', false);
        },
      ),
  },
  {
    id: 'char_sys', cw: 1, ch: 1,
    draw: (g) =>
      person(
        g,
        { skin: SKIN[2], hair: '#1f1a17', hairStyle: 'cap', top: '#262b36', legs: '#5a6b47', shoes: '#222', beard: true },
        undefined,
        (g) => {
          txt(g, '>_', 64, 76, 16, '#5dfdb0', '900', 'monospace');
          // headset
          line(g, [44, 40, 46, 52, 66, 56], INK, 4);
          circ(g, 68, 56, 3.5, '#e8554e', false);
          rr(g, 38, 32, 9, 15, 4, '#4cc3ff');
        },
      ),
  },

  // Compagni (e proiettili)
  {
    id: 'duck', cw: 1, ch: 1,
    draw: (g) => {
      ell(g, 58, 86, 38, 26, '#ffd23f');
      circ(g, 80, 50, 22, '#ffd23f');
      poly(g, [98, 50, 118, 54, 98, 62], '#ff8c1a');
      circ(g, 86, 45, 4, INK, false);
      g.beginPath();
      g.ellipse(50, 84, 16, 10, -0.3, 0, Math.PI);
      g.lineWidth = 3;
      g.strokeStyle = '#d9a400';
      g.stroke();
    },
  },
  {
    id: 'mug', cw: 1, ch: 1,
    draw: (g) => {
      line(g, [52, 30, 58, 22, 52, 14], '#9aa5b8', 4);
      line(g, [70, 30, 76, 22, 70, 14], '#9aa5b8', 4);
      g.beginPath();
      g.arc(92, 76, 15, -Math.PI / 2, Math.PI / 2);
      g.lineWidth = 8;
      g.strokeStyle = INK;
      g.stroke();
      rr(g, 30, 40, 64, 76, 10, '#fdfdfd');
      ell(g, 62, 44, 28, 6, '#6b3e1f', true);
      txt(g, '#1 PM', 62, 84, 17, '#d8343f', '900');
    },
  },
  {
    id: 'router', cw: 1, ch: 1,
    draw: (g) => {
      line(g, [40, 76, 32, 26], INK, 6);
      line(g, [88, 76, 96, 26], INK, 6);
      rr(g, 18, 70, 92, 34, 8, '#2a2f3a');
      for (let i = 0; i < 5; i++) circ(g, 34 + i * 14, 87, 4, i % 2 ? '#39e48a' : '#4cc3ff', false);
      line(g, [96, 104, 102, 118], INK, 5);
      line(g, [32, 104, 26, 118], INK, 5);
    },
  },

  // Nemici
  {
    id: 'en_bug', cw: 1, ch: 1,
    draw: (g) => {
      for (let i = 0; i < 3; i++) {
        const x = 42 + i * 18;
        line(g, [x, 92, x - 8, 112, x - 12, 118], INK, 4);
      }
      line(g, [100, 64, 112, 40], INK, 3);
      line(g, [104, 68, 122, 52], INK, 3);
      ell(g, 60, 82, 40, 26, '#47b04b');
      line(g, [60, 58, 60, 106], '#2b7a2e', 4);
      circ(g, 100, 76, 16, '#2b7a2e');
      eyes(g, 98, 72, 9, 4.2, true);
      txt(g, '404', 44, 82, 15, '#ffe35c', '900');
    },
  },
  {
    id: 'en_email', cw: 1, ch: 1,
    draw: (g) => {
      ell(g, 26, 56, 18, 10, '#fff', true, -0.6);
      rr(g, 20, 40, 88, 62, 6, '#fff8ea');
      line(g, [22, 44, 64, 76, 106, 44], INK, 3.5);
      eyes(g, 54, 60, 18, 6, true);
      g.save();
      g.translate(70, 88);
      g.rotate(-0.18);
      rr(g, -34, -10, 68, 20, 4, 'rgba(0,0,0,0)', false);
      g.lineWidth = 3;
      g.strokeStyle = '#d8343f';
      g.strokeRect(-34, -10, 68, 20);
      txt(g, 'URGENTE', 0, 1, 13, '#d8343f', '900');
      g.restore();
    },
  },
  {
    id: 'en_ticket', cw: 1, ch: 1,
    draw: (g) => {
      legs(g, 52, 104, 20, 14);
      rr(g, 28, 14, 72, 92, 6, '#ffffff');
      rr(g, 28, 14, 72, 22, 6, '#2f6fde');
      txt(g, 'OB-1337', 64, 25, 14, '#fff', '900');
      eyes(g, 50, 54, 22, 7, true);
      for (let i = 0; i < 3; i++) rr(g, 38, 72 + i * 9, 50 - i * 12, 4, 2, '#c5ccd8', false);
      poly(g, [86, 96, 94, 84, 102, 96], '#d8343f', true, 2.5);
    },
  },
  {
    id: 'en_meeting', cw: 1, ch: 1,
    draw: (g) => {
      legs(g, 50, 104, 24, 14);
      rr(g, 22, 18, 84, 88, 8, '#ffffff');
      rr(g, 22, 18, 84, 26, 8, '#e8554e');
      for (let i = 0; i < 4; i++) rr(g, 34 + i * 18, 10, 6, 16, 3, '#c5ccd8');
      txt(g, 'LUNEDÌ', 64, 32, 14, '#fff', '900');
      txt(g, '9:00', 64, 62, 26, INK, '900');
      eyes(g, 50, 86, 26, 6, true);
    },
  },
  {
    id: 'en_merge', cw: 1, ch: 1,
    draw: (g) => {
      legs(g, 50, 104, 24, 14);
      rr(g, 18, 22, 92, 84, 8, '#1e2233');
      txt(g, '<<<<<<<', 64, 38, 15, '#ff6b6b', '900', 'monospace');
      txt(g, '=======', 64, 92, 15, '#9aa5b8', '900', 'monospace');
      eyes(g, 46, 62, 30, 9, true);
    },
  },
  {
    id: 'en_leak', cw: 1, ch: 1,
    draw: (g) => {
      g.beginPath();
      g.moveTo(14, 116);
      g.bezierCurveTo(6, 60, 34, 18, 64, 18);
      g.bezierCurveTo(98, 18, 124, 60, 114, 116);
      g.closePath();
      path(g, '#8e4fd6');
      circ(g, 36, 118, 6, '#8e4fd6');
      circ(g, 90, 120, 5, '#8e4fd6');
      eyes(g, 54, 54, 24, 9, true);
      txt(g, 'RAM 99%', 64, 90, 16, '#fff', '900');
    },
  },
  {
    id: 'en_auditor', cw: 1, ch: 1,
    draw: (g) =>
      person(
        g,
        { skin: SKIN[0], hair: '#8a8f99', hairStyle: 'short', top: '#5d6475', legs: '#3c4250', shoes: '#111', glasses: true, angry: true },
        undefined,
        (g) => {
          poly(g, [62, 60, 67, 60, 68, 80, 64, 86, 60, 80], '#2c6e63', true, 2);
          rr(g, 76, 60, 30, 40, 4, '#c9a26b');
          rr(g, 80, 66, 22, 30, 2, '#fff', false);
          line(g, [84, 72, 98, 88], '#d8343f', 4);
          line(g, [98, 72, 84, 88], '#d8343f', 4);
        },
      ),
  },
  {
    id: 'en_cr', cw: 1, ch: 1,
    draw: (g) => {
      legs(g, 52, 104, 20, 14);
      poly(g, [28, 14, 82, 14, 100, 32, 100, 106, 28, 106], '#fff');
      poly(g, [82, 14, 82, 32, 100, 32], '#dfe4ec', true, 2.5);
      txt(g, 'CR #42', 62, 34, 15, '#d8343f', '900');
      eyes(g, 46, 60, 22, 7, true);
      for (let i = 0; i < 2; i++) rr(g, 38, 80 + i * 10, 50, 4, 2, '#c5ccd8', false);
    },
  },

  // Élite (2x2)
  {
    id: 'en_scope', cw: 2, ch: 2,
    draw: (g) => {
      const arms = [
        [44, 130, 24, 84],
        [64, 96, 44, 40],
        [192, 96, 212, 40],
        [212, 130, 232, 84],
      ];
      for (const a of arms) line(g, a, '#6c34b0', 16);
      for (const a of arms) {
        rr(g, a[2] - 14, a[3] - 14, 28, 28, 3, '#ffe35c', true, 2.5);
        txt(g, '+1', a[2], a[3], 14, INK, '900');
      }
      g.beginPath();
      g.moveTo(30, 246);
      g.bezierCurveTo(20, 120, 70, 50, 128, 50);
      g.bezierCurveTo(186, 50, 236, 120, 226, 246);
      g.closePath();
      path(g, '#8e4fd6', true, 5);
      eyes(g, 90, 110, 30, 12, true);
      eyes(g, 152, 102, 26, 9, true);
      rr(g, 64, 160, 128, 40, 8, '#ffe35c', true, 3);
      txt(g, '+1 feature', 128, 181, 24, INK, '900');
    },
  },
  {
    id: 'en_legacy', cw: 2, ch: 2,
    draw: (g) => {
      legs(g, 96, 214, 60, 30);
      rr(g, 28, 40, 200, 180, 18, '#d9cfb0', true, 5);
      rr(g, 52, 62, 152, 112, 10, '#10301e', true, 4);
      txt(g, 'C:\\>_', 128, 92, 26, '#39e48a', '900', 'monospace');
      eyes(g, 98, 138, 54, 12, true);
      rr(g, 90, 186, 76, 12, 3, '#9a8f72', true, 3);
      line(g, [36, 48, 60, 44, 44, 64], '#ffffff', 2);
      line(g, [210, 46, 226, 70], '#ffffff', 2);
    },
  },
  {
    id: 'en_deadline', cw: 2, ch: 2,
    draw: (g) => {
      legs(g, 100, 210, 54, 34);
      circ(g, 74, 52, 26, '#ffd23f', true, 5);
      circ(g, 182, 52, 26, '#ffd23f', true, 5);
      circ(g, 128, 128, 96, '#e8554e', true, 6);
      circ(g, 128, 128, 74, '#fff8ea', true, 4);
      txt(g, '18:00', 128, 104, 34, INK, '900', 'monospace');
      eyes(g, 98, 148, 58, 13, true);
    },
  },

  // Boss (2x2)
  {
    id: 'boss_cliente', cw: 2, ch: 2,
    draw: (g) => {
      g.save();
      g.scale(2, 2);
      person(
        g,
        { skin: SKIN[0], hair: '#cfd3da', hairStyle: 'short', top: '#1f2b4d', legs: '#1a2440', shoes: '#111', angry: true },
        undefined,
        (g) => {
          poly(g, [60, 58, 68, 58, 64, 64], '#fff', false);
          poly(g, [62, 62, 66, 62, 68, 84, 64, 90, 60, 84], '#ffd23f', true, 2);
          rr(g, 86, 26, 12, 26, 3, '#2a2f3a', true, 2.5);
        },
      );
      g.restore();
      rr(g, 140, 6, 108, 40, 12, '#fff', true, 3.5);
      txt(g, 'URGENTE!', 194, 27, 17, '#d8343f', '900');
    },
  },
  {
    id: 'boss_monolito', cw: 2, ch: 2,
    draw: (g) => {
      for (let i = 0; i < 5; i++) line(g, [60 + i * 34, 220, 40 + i * 44, 252], INK, 8);
      poly(g, [56, 228, 72, 14, 184, 14, 200, 228], '#8a93a3', true, 6);
      poly(g, [72, 14, 184, 14, 176, 34, 80, 34], '#a9b1bf', true, 3);
      txt(g, 'COBOL', 128, 70, 34, '#3c4250', '900', 'monospace');
      txt(g, 'dal 1987', 128, 100, 18, '#3c4250', '800', 'monospace');
      g.shadowColor = '#39e48a';
      g.shadowBlur = 16;
      circ(g, 104, 146, 13, '#39e48a', true, 3);
      circ(g, 152, 146, 13, '#39e48a', true, 3);
      g.shadowBlur = 0;
      line(g, [96, 186, 112, 176, 128, 190, 144, 176, 160, 186], INK, 5);
      line(g, [180, 40, 168, 70, 186, 96], '#5d6475', 3);
    },
  },
  {
    id: 'boss_audit', cw: 2, ch: 2,
    draw: (g) => {
      legs(g, 100, 222, 54, 26);
      line(g, [36, 130, 10, 170], INK, 9);
      line(g, [220, 130, 246, 96], INK, 9);
      rr(g, 236, 60, 10, 46, 3, '#d8343f', true, 3);
      rr(g, 34, 22, 188, 206, 10, '#c9a26b', true, 6);
      rr(g, 94, 10, 68, 26, 6, '#9aa5b8', true, 4);
      rr(g, 50, 44, 156, 170, 4, '#ffffff', true, 3);
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.strokeRect(78, 74, 34, 28);
      g.strokeRect(146, 74, 34, 28);
      line(g, [112, 88, 146, 88], INK, 4);
      eyes(g, 92, 88, 68, 9, true, false);
      for (let i = 0; i < 3; i++) {
        const y = 130 + i * 28;
        g.strokeRect(66, y - 9, 18, 18);
        line(g, [68, y - 7, 82, y + 7], '#d8343f', 4);
        line(g, [82, y - 7, 68, y + 7], '#d8343f', 4);
        rr(g, 94, y - 3, 92 - i * 14, 6, 3, '#c5ccd8', false);
      }
    },
  },

  // Proiettili dei boss
  {
    id: 'proj_cr', cw: 1, ch: 1,
    draw: (g) => {
      poly(g, [30, 20, 82, 20, 98, 36, 98, 108, 30, 108], '#fff');
      txt(g, 'CR', 64, 64, 34, '#d8343f', '900');
    },
  },
  {
    id: 'proj_punch', cw: 1, ch: 1,
    draw: (g) => {
      poly(g, [14, 36, 104, 36, 114, 46, 114, 92, 14, 92], '#f1e3b8');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) if ((r * 7 + c) % 3 !== 1) rr(g, 24 + c * 12, 46 + r * 14, 5, 8, 1, INK, false);
    },
  },
  {
    id: 'proj_x', cw: 1, ch: 1,
    draw: (g) => {
      line(g, [26, 26, 102, 102], '#d8343f', 22);
      line(g, [102, 26, 26, 102], '#d8343f', 22);
    },
  },

  // Armi
  {
    id: 'slide', cw: 1, ch: 1,
    draw: (g) => {
      rr(g, 8, 26, 112, 72, 4, '#ffffff');
      rr(g, 8, 26, 112, 18, 4, '#ff7a59');
      txt(g, 'Q3 ROADMAP', 64, 36, 11, '#fff', '900');
      const bars = [20, 32, 26, 44];
      bars.forEach((h, i) => rr(g, 24 + i * 22, 90 - h, 14, h, 2, i === 3 ? '#39b26a' : '#4c86ff', false));
    },
  },
  {
    id: 'mail', cw: 1, ch: 1,
    draw: (g) => {
      rr(g, 16, 32, 96, 64, 6, '#4c86ff');
      line(g, [18, 36, 64, 70, 110, 36], '#ffffff', 5);
      txt(g, '@', 98, 84, 16, '#fff', '900');
    },
  },
  {
    id: 'flame', cw: 1, ch: 1,
    draw: (g) => {
      g.beginPath();
      g.moveTo(64, 8);
      g.bezierCurveTo(100, 50, 112, 80, 96, 104);
      g.bezierCurveTo(84, 122, 44, 122, 32, 104);
      g.bezierCurveTo(18, 80, 40, 60, 64, 8);
      path(g, '#ff7a1a', false);
      g.beginPath();
      g.moveTo(64, 46);
      g.bezierCurveTo(84, 72, 88, 92, 78, 106);
      g.bezierCurveTo(70, 116, 56, 116, 50, 106);
      g.bezierCurveTo(42, 92, 50, 76, 64, 46);
      path(g, '#ffe35c', false);
    },
    sticker: false,
  },
  {
    id: 'boom', cw: 1, ch: 1,
    draw: (g) => {
      const pts: number[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = i % 2 ? 36 : 60;
        pts.push(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      poly(g, pts, '#ffb020', true, 4);
      txt(g, 'BOOM', 64, 66, 26, '#d8343f', '900');
    },
  },
  {
    id: 'spark', cw: 1, ch: 1,
    draw: (g) => {
      poly(g, [64, 6, 74, 54, 122, 64, 74, 74, 64, 122, 54, 74, 6, 64, 54, 54], '#ffe35c', false);
      circ(g, 64, 64, 14, '#ffffff', false);
    },
    sticker: false,
  },
  {
    id: 'target', cw: 1, ch: 1,
    draw: (g) => {
      g.lineWidth = 8;
      g.strokeStyle = '#ff3b3b';
      g.beginPath();
      g.arc(64, 64, 52, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(64, 64, 26, 0, Math.PI * 2);
      g.stroke();
      line(g, [64, 2, 64, 30], '#ff3b3b', 8);
      line(g, [64, 98, 64, 126], '#ff3b3b', 8);
      line(g, [2, 64, 30, 64], '#ff3b3b', 8);
      line(g, [98, 64, 126, 64], '#ff3b3b', 8);
    },
    sticker: false,
  },
  {
    id: 'rocket', cw: 1, ch: 1,
    draw: (g) => {
      g.save();
      g.translate(64, 64);
      g.rotate(Math.PI / 4);
      poly(g, [-14, 30, -6, 50, 6, 50, 14, 30], '#ff8c1a');
      poly(g, [-16, 10, -30, 34, -14, 30], '#d8343f');
      poly(g, [16, 10, 30, 34, 14, 30], '#d8343f');
      g.beginPath();
      g.moveTo(0, -52);
      g.bezierCurveTo(22, -30, 18, 10, 16, 32);
      g.lineTo(-16, 32);
      g.bezierCurveTo(-18, 10, -22, -30, 0, -52);
      path(g, '#f4f6fb');
      circ(g, 0, -10, 9, '#4cc3ff');
      g.restore();
    },
  },
  {
    id: 'ic_firewall', cw: 1, ch: 1,
    draw: (g) => {
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) rr(g, 12 + c * 26 + (r % 2) * 13 - 6, 64 + r * 18, 24, 16, 2, '#c4553b', true, 2.5);
      g.beginPath();
      g.moveTo(64, 6);
      g.bezierCurveTo(96, 30, 100, 56, 64, 64);
      g.bezierCurveTo(28, 56, 32, 30, 64, 6);
      path(g, '#ff9a1a');
    },
  },
  {
    id: 'ic_stack', cw: 1, ch: 1,
    draw: (g) => {
      line(g, [18, 70, 18, 112, 110, 112, 110, 70], '#9aa5b8', 9);
      const ang = [0, -0.12, -0.25, -0.38];
      ang.forEach((a, i) => {
        g.save();
        g.translate(64 + i * 4, 96 - i * 16);
        g.rotate(a);
        rr(g, -32, -5, 64, 11, 2, '#f48024', true, 2.5);
        g.restore();
      });
    },
  },

  // Icone dei passivi (emoji: zero lavoro, sostituibili più avanti)
  { id: 'ic_coffee', cw: 1, ch: 1, draw: (g) => emoji(g, '☕', 64, 68, 92) },
  { id: 'ic_scrum', cw: 1, ch: 1, draw: (g) => emoji(g, '📋', 64, 68, 92) },
  { id: 'ic_cloud', cw: 1, ch: 1, draw: (g) => emoji(g, '☁️', 64, 68, 92) },
  { id: 'ic_home', cw: 1, ch: 1, draw: (g) => emoji(g, '🏠', 64, 68, 92) },
  { id: 'ic_chair', cw: 1, ch: 1, draw: (g) => emoji(g, '🪑', 64, 68, 92) },
  { id: 'ic_test', cw: 1, ch: 1, draw: (g) => emoji(g, '✅', 64, 68, 92) },
  { id: 'ic_cv', cw: 1, ch: 1, draw: (g) => emoji(g, '📄', 64, 68, 92) },
  { id: 'ic_croissant', cw: 1, ch: 1, draw: (g) => emoji(g, '🥐', 64, 68, 92) },
  { id: 'ic_board', cw: 1, ch: 1, draw: (g) => emoji(g, '📈', 64, 68, 92) },
  { id: 'ic_review', cw: 1, ch: 1, draw: (g) => emoji(g, '🔍', 64, 68, 92) },
  { id: 'ic_multi', cw: 1, ch: 1, draw: (g) => emoji(g, '🗂️', 64, 68, 92) },

  // Raccoglibili
  { id: 'xp1', cw: 1, ch: 1, draw: (g) => gem(g, '#4c86ff') },
  { id: 'xp2', cw: 1, ch: 1, draw: (g) => gem(g, '#39b26a') },
  { id: 'xp3', cw: 1, ch: 1, draw: (g) => gem(g, '#e8554e') },
  {
    id: 'gold', cw: 1, ch: 1,
    draw: (g) => {
      g.save();
      g.translate(64, 64);
      g.rotate(-0.15);
      rr(g, -48, -28, 96, 56, 6, '#ffd23f');
      rr(g, -40, -20, 80, 40, 4, '#ffe98a', true, 2);
      txt(g, '€8', 0, 2, 28, '#2c6e63', '900');
      g.restore();
    },
  },
  { id: 'pizza', cw: 1, ch: 1, draw: (g) => emoji(g, '🍕', 64, 68, 96) },
  {
    id: 'magnet', cw: 1, ch: 1,
    draw: (g) => {
      circ(g, 64, 64, 54, '#4c86ff');
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(64, 92, 16 + i * 16, Math.PI * 1.2, Math.PI * 1.8);
        g.lineWidth = 9;
        g.strokeStyle = '#fff';
        g.lineCap = 'round';
        g.stroke();
      }
      circ(g, 64, 92, 7, '#fff', false);
    },
  },

  // Interattivi
  { id: 'chest', cw: 1, ch: 1, draw: (g) => box(g, false) },
  { id: 'chest_open', cw: 1, ch: 1, draw: (g) => box(g, true) },
  { id: 'shrine', cw: 1, ch: 2, draw: (g) => coffeeMachine(g, true) },
  { id: 'shrine_off', cw: 1, ch: 2, draw: (g) => coffeeMachine(g, false) },
  { id: 'lunch', cw: 1, ch: 2, draw: (g) => lunchTable(g, true) },
  { id: 'lunch_off', cw: 1, ch: 2, draw: (g) => lunchTable(g, false) },

  // Segnaposto dei locali sulle mappe reali (galleggiano sopra l'ingresso)
  { id: 'pin_jpanik', cw: 1, ch: 1, draw: (g) => pin(g, '#fc4c02', () => drawJpanikLogo(g, 64, 50, 0.3)) },
  { id: 'pin_sushi', cw: 1, ch: 1, draw: (g) => pin(g, '#d7263d', () => sushi(g)) },
  { id: 'pin_pizza', cw: 1, ch: 1, draw: (g) => pin(g, '#e8554e', () => slice(g)) },
  { id: 'pin_poke', cw: 1, ch: 1, draw: (g) => pin(g, '#2bb7aa', () => bowl(g)) },
  { id: 'pin_coffee', cw: 1, ch: 1, draw: (g) => pin(g, '#8a4b2a', () => cup(g)) },
  { id: 'pin_sport', cw: 1, ch: 1, draw: (g) => pin(g, '#1c4fa0', () => ball(g)) },
  {
    id: 'altar', cw: 1, ch: 2,
    draw: (g) => {
      rr(g, 14, 40, 100, 210, 4, '#8a5a3b', true, 5);
      rr(g, 26, 52, 76, 198, 2, '#b98559', true, 3);
      circ(g, 90, 160, 6, '#ffd23f');
      rr(g, 6, 6, 116, 40, 6, '#1f2b4d', true, 4);
      txt(g, 'SALA', 64, 18, 15, '#fff', '900');
      txt(g, 'RIUNIONI', 64, 34, 15, '#fff', '900');
      circ(g, 64, 80, 9, '#ff3b3b');
      rr(g, 36, 100, 56, 32, 3, '#fff', true, 2.5);
      txt(g, 'OCCUPATA', 64, 116, 11, '#d8343f', '900');
    },
  },
  {
    id: 'portal', cw: 2, ch: 2,
    draw: (g) => {
      rr(g, 20, 20, 216, 232, 6, '#9aa5b8', true, 6);
      rr(g, 40, 56, 176, 196, 2, '#fff7c2', true, 4);
      g.fillStyle = 'rgba(255,210,63,0.6)';
      g.fillRect(56, 60, 144, 190);
      rr(g, 40, 56, 30, 196, 2, '#c5ccd8', true, 3);
      rr(g, 186, 56, 30, 196, 2, '#c5ccd8', true, 3);
      rr(g, 88, 24, 80, 28, 6, '#1d2333', true, 3);
      txt(g, '▲ +1', 128, 39, 20, '#ffd23f', '900');
    },
  },
  {
    id: 'puff', cw: 1, ch: 1,
    draw: (g) => {
      circ(g, 50, 70, 30, '#e9eef5', false);
      circ(g, 80, 64, 34, '#e9eef5', false);
      circ(g, 64, 44, 26, '#ffffff', false);
    },
    sticker: false,
  },
];

function gem(g: G, color: string) {
  poly(g, [64, 14, 104, 54, 64, 116, 24, 54], color, true, 4);
  poly(g, [64, 14, 84, 54, 64, 116, 44, 54], 'rgba(255,255,255,0.35)', false);
  poly(g, [24, 54, 104, 54, 64, 64], 'rgba(255,255,255,0.25)', false);
}
function box(g: G, open: boolean) {
  poly(g, [16, 52, 82, 52, 82, 118, 16, 118], '#c8925a');
  poly(g, [82, 52, 112, 36, 112, 100, 82, 118], '#a9743f');
  if (open) {
    poly(g, [16, 52, 4, 26, 64, 26, 82, 52], '#dcaa72');
    g.fillStyle = 'rgba(255,230,120,0.9)';
    g.beginPath();
    g.ellipse(56, 40, 30, 10, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    poly(g, [16, 52, 46, 36, 112, 36, 82, 52], '#dcaa72');
    rr(g, 42, 44, 12, 74, 1, '#e8d8a8', false);
  }
  rr(g, 24, 74, 50, 26, 3, '#fff', true, 2.5);
  txt(g, 'ORDINE', 49, 87, 12, INK, '900');
}
function coffeeMachine(g: G, on: boolean) {
  rr(g, 14, 20, 100, 230, 10, on ? '#b2343a' : '#6b6f78', true, 5);
  rr(g, 26, 34, 76, 46, 6, '#1d2333', true, 3);
  txt(g, on ? 'CAFFÈ' : 'ESAURITO', 64, 57, on ? 18 : 13, on ? '#ffd23f' : '#9aa5b8', '900');
  for (let i = 0; i < 3; i++) rr(g, 30 + i * 26, 94, 18, 14, 4, on ? '#ffd23f' : '#9aa5b8', true, 2.5);
  rr(g, 30, 128, 68, 80, 6, '#2a2f3a', true, 3);
  rr(g, 50, 172, 28, 30, 4, '#ffffff', true, 3);
  if (on) {
    line(g, [56, 160, 60, 148], '#c5ccd8', 3);
    line(g, [70, 160, 72, 148], '#c5ccd8', 3);
  }
  rr(g, 22, 220, 84, 14, 3, '#3c4250', true, 2.5);
}

/** Tavolino all'aperto con ombrellone: la pausa pranzo davanti ai ristoranti. */
function lunchTable(g: G, open: boolean) {
  line(g, [64, 60, 64, 200], '#6b6f78', 6);
  if (open) {
    // ombrellone a spicchi bianchi e rossi
    const pts = [6, 78, 64, 26, 122, 78];
    poly(g, pts, '#ffffff', true, 4);
    for (let k = 0; k < 4; k += 2) poly(g, [6 + k * 29, 78, 64, 26, 35 + k * 29, 78], '#d8343f', false);
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(20.5 + k * 29, 78, 14.5, 0, Math.PI);
      path(g, k % 2 ? '#ffffff' : '#d8343f', true, 3);
    }
  } else {
    poly(g, [56, 40, 64, 20, 72, 40, 68, 130, 60, 130], '#d8343f', true, 4);
  }
  // sedie
  rr(g, 6, 168, 14, 58, 3, '#8a5a3b', true, 3);
  rr(g, 108, 168, 14, 58, 3, '#8a5a3b', true, 3);
  rr(g, 6, 196, 30, 8, 2, '#8a5a3b', true, 3);
  rr(g, 92, 196, 30, 8, 2, '#8a5a3b', true, 3);
  // tavolo e piatto
  line(g, [52, 196, 46, 238], INK, 5);
  line(g, [76, 196, 82, 238], INK, 5);
  ell(g, 64, 192, 46, 12, '#f4f1ea');
  if (open) {
    ell(g, 64, 186, 22, 7, '#ffffff');
    poly(g, [50, 184, 78, 180, 66, 190], '#f3b13a', true, 2.5);
    circ(g, 62, 184, 3, '#d8343f', false);
    circ(g, 70, 183, 3, '#d8343f', false);
  } else ell(g, 64, 186, 22, 7, '#e3dfd6');
}

/** Segnaposto a goccia con un'icona dentro il cerchio. */
function pin(g: G, color: string, icon: () => void) {
  g.beginPath();
  g.arc(64, 50, 44, Math.PI * 0.82, Math.PI * 2.18);
  g.lineTo(64, 124);
  g.closePath();
  path(g, color, true, 4);
  circ(g, 64, 50, 34, '#ffffff', false);
  icon();
}
function sushi(g: G) {
  circ(g, 64, 50, 26, '#1f3a2b', true, 3);
  circ(g, 64, 50, 19, '#ffffff', false);
  circ(g, 64, 50, 10, '#ff8a5c', false);
  circ(g, 61, 47, 3, '#ffd0b8', false);
}
function slice(g: G) {
  poly(g, [40, 30, 90, 30, 64, 80], '#f3b13a', true, 3);
  rr(g, 36, 24, 58, 10, 5, '#b8742e', true, 3);
  circ(g, 56, 42, 5, '#d8343f', false);
  circ(g, 72, 44, 5, '#d8343f', false);
  circ(g, 64, 60, 4.5, '#d8343f', false);
}
function bowl(g: G) {
  g.beginPath();
  g.arc(64, 46, 28, 0, Math.PI);
  g.closePath();
  path(g, '#2bb7aa', true, 3);
  circ(g, 52, 42, 7, '#ff8a5c', true, 2);
  circ(g, 66, 39, 7, '#7cc35b', true, 2);
  circ(g, 78, 43, 6, '#ffd23f', true, 2);
}
function cup(g: G) {
  rr(g, 42, 40, 36, 30, 6, '#ffffff', true, 3);
  g.beginPath();
  g.arc(80, 54, 8, -Math.PI / 2, Math.PI / 2);
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.stroke();
  ell(g, 60, 42, 16, 4, '#6b3e1f', false);
  rr(g, 34, 70, 54, 6, 3, '#ffffff', true, 2.5);
  line(g, [54, 34, 58, 22], '#9aa5b8', 3);
  line(g, [66, 34, 70, 22], '#9aa5b8', 3);
}
function ball(g: G) {
  circ(g, 64, 50, 25, '#d6ec3a', true, 3);
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.arc(36, 50, 22, -0.9, 0.9);
  g.stroke();
  g.beginPath();
  g.arc(92, 50, 22, Math.PI - 0.9, Math.PI + 0.9);
  g.stroke();
}

// ---------- costruzione dell'atlas ----------

/** Dilata la sagoma e la colora: crea il bordo "adesivo". */
function silhouette(src: HTMLCanvasElement, color: string, r: number, fine = false) {
  const t = makeCanvas(src.width, src.height);
  const tg = t.getContext('2d')!;
  // con le forme sottili (punte, filetti) servono più copie, altrimenti il bordo si sfrangia
  const rings = fine ? [[r, 32], [r * 0.55, 16]] : [[r, 16]];
  for (const [rad, steps] of rings)
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      tg.drawImage(src, Math.cos(a) * rad, Math.sin(a) * rad);
    }
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = color;
  tg.fillRect(0, 0, t.width, t.height);
  return t;
}

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private frames = new Map<string, Frame>();
  private anims = new Map<string, Frame[]>();
  private dataUrl = '';
  private readonly rows: number;

  /** Carica le immagini dei loghi e poi disegna l'atlas. */
  static async create(): Promise<Atlas> {
    await loadLogoImages();
    return new Atlas();
  }

  private constructor() {
    // ogni fotogramma occupa una cella; impaccamento a scaffali, prima gli sprite alti
    const all = [...sprites, ...LOGO_SPRITES];
    const order = all
      .flatMap((s) => Array.from({ length: s.frames ?? 1 }, (_, i) => ({ s, i, cx: 0, cy: 0 })))
      .sort((a, b) => b.s.ch - a.s.ch || b.s.cw - a.s.cw);
    let cx = 0;
    let cy = 0;
    let rowH = 0;
    for (const o of order) {
      if (cx + o.s.cw > COLS) {
        cx = 0;
        cy += rowH;
        rowH = 0;
      }
      if (cy + o.s.ch > MAX_ROWS) throw new Error(`Atlas pieno: non c'è spazio per ${o.s.id}`);
      o.cx = cx;
      o.cy = cy;
      cx += o.s.cw;
      rowH = Math.max(rowH, o.s.ch);
    }
    // l'altezza cresce con il numero di sprite, a passi di due righe
    this.rows = Math.ceil((cy + rowH) / 2) * 2;
    const H = this.rows * CELL;
    this.canvas = makeCanvas(WIDTH, H);
    const g = this.canvas.getContext('2d')!;
    for (const { s, i, cx, cy } of order) {
      const w = s.cw * CELL;
      const h = s.ch * CELL;
      const tmp = makeCanvas(w, h);
      const tg = tmp.getContext('2d')!;
      // margine per il bordo: il disegno è ristretto verso il centro-basso
      const m = 8;
      tg.translate(m, m);
      tg.scale((w - m * 2) / w, (h - m * 2) / h);
      s.draw(tg, w, h, i, s.frames ?? 1);
      const px = cx * CELL;
      const py = cy * CELL;
      if (s.sticker === false) {
        g.drawImage(tmp, px, py);
      } else {
        g.drawImage(silhouette(tmp, INK, 7, s.fine), px, py);
        g.drawImage(silhouette(tmp, '#ffffff', 5, s.fine), px, py);
        g.drawImage(tmp, px, py);
      }
      const f: Frame = {
        u0: px / WIDTH,
        u1: (px + w) / WIDTH,
        v1: 1 - py / H,
        v0: 1 - (py + h) / H,
        aspect: w / h,
        cx,
        cy,
        cw: s.cw,
        ch: s.ch,
      };
      if (i === 0) this.frames.set(s.id, f);
      let list = this.anims.get(s.id);
      if (!list) this.anims.set(s.id, (list = []));
      list[i] = f;
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.needsUpdate = true;
  }

  /** Primo fotogramma dello sprite (per gli sprite statici è l'unico). */
  get(id: string): Frame {
    const f = this.frames.get(id);
    if (!f) throw new Error(`Sprite mancante: ${id}`);
    return f;
  }

  /** Tutti i fotogrammi dell'animazione, in ordine. */
  anim(id: string): Frame[] {
    const a = this.anims.get(id);
    if (!a) throw new Error(`Sprite mancante: ${id}`);
    return a;
  }

  /** CSS per mostrare uno sprite come icona HTML di lato `px`. */
  iconStyle(id: string, px: number): string {
    if (!this.dataUrl) this.dataUrl = this.canvas.toDataURL('image/png');
    const f = this.get(id);
    const unit = px / Math.max(f.cw, f.ch);
    return [
      `background-image:url(${this.dataUrl})`,
      `background-size:${COLS * unit}px ${this.rows * unit}px`,
      `background-position:-${f.cx * unit}px -${f.cy * unit}px`,
      `width:${f.cw * unit}px`,
      `height:${f.ch * unit}px`,
    ].join(';');
  }
}
