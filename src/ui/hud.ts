import * as THREE from 'three';
import { PASSIVES } from '../config/passives';
import { TUNING } from '../config/tuning';
import type { BiomeDef } from '../config/types';
import type { Game } from '../game/game';
import type { Atlas } from '../render/atlas';

// HUD in HTML sopra il canvas: si aggiorna solo quando i valori cambiano.

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export class Hud {
  readonly root: HTMLDivElement;
  private numbers: HTMLCanvasElement;
  private nctx: CanvasRenderingContext2D;
  private hurt: HTMLDivElement;
  private xpFill: HTMLElement;
  private lv: HTMLElement;
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private gold: HTMLElement;
  private kills: HTMLElement;
  private clock: HTMLDivElement;
  private time: HTMLElement;
  private where: HTMLElement;
  private bossbar: HTMLDivElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private slots: HTMLDivElement;
  private prompt: HTMLDivElement;
  private hint: HTMLDivElement;
  private banners: HTMLDivElement;
  private stageCard: HTMLDivElement | null = null;
  private cache = new Map<string, string>();
  private v = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    private readonly atlas: Atlas,
  ) {
    this.root = el('div', 'hud', parent);
    this.numbers = el('canvas', 'numbers', this.root);
    this.nctx = this.numbers.getContext('2d')!;
    this.hurt = el('div', 'hurt', this.root);

    const xp = el('div', 'xpbar', this.root);
    this.xpFill = el('i', '', xp);

    const left = el('div', 'hud-left', this.root);
    const row = el('div', 'badge-row', left);
    this.lv = el('span', 'lv', row);
    const hp = el('div', 'hpbar', row);
    this.hpFill = el('i', '', hp);
    this.hpText = el('span', '', hp);
    const counters = el('div', 'counters', left);
    this.gold = el('span', 'gold', counters);
    this.kills = el('span', '', counters);

    this.clock = el('div', 'clock', this.root);
    this.time = el('div', 'time', this.clock);
    this.where = el('div', 'where', this.clock);

    this.bossbar = el('div', 'bossbar', this.root);
    this.bossName = el('b', '', this.bossbar);
    const bb = el('div', 'bar', this.bossbar);
    this.bossFill = el('i', '', bb);
    this.bossbar.hidden = true;

    this.mini = el('canvas', 'minimap', this.root);
    this.mini.width = 300;
    this.mini.height = 300;
    this.mctx = this.mini.getContext('2d')!;

    this.slots = el('div', 'slots', this.root);
    this.prompt = el('div', 'prompt', this.root);
    this.prompt.hidden = true;
    this.hint = el('div', 'hint', this.root);
    this.hint.textContent = 'Clicca sul gioco per guidare la camera col mouse (oppure trascina) · Esc per la pausa';
    this.banners = el('div', 'banners', this.root);
  }

  private set(key: string, value: string, apply: (v: string) => void) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  banner(text: string, tone: string) {
    const b = el('div', `banner ${tone}`, this.banners);
    b.textContent = text;
    while (this.banners.children.length > 3) this.banners.firstElementChild!.remove();
    setTimeout(() => b.remove(), tone === 'boss' ? 4500 : 3000);
  }

  stage(biome: BiomeDef, stage: number) {
    this.stageCard?.remove();
    const c = el('div', 'stage-card', this.root);
    const small = el('small', '', c);
    small.textContent = `Progetto ${stage + 1} di ${TUNING.stagesToWin} · Cliente: ${biome.client}`;
    const strong = el('strong', '', c);
    strong.textContent = `${biome.project}`;
    const span = el('span', '', c);
    span.textContent = `${biome.place} — ${biome.description}`;
    this.stageCard = c;
    setTimeout(() => c.remove(), 3800);
    this.cache.delete('slots');
  }

  update(g: Game, locked: boolean) {
    const p = g.player;
    const s = g.stats;
    this.set('xp', (g.xp / g.xpNext).toFixed(3), (v) => (this.xpFill.style.width = `${Math.min(100, +v * 100)}%`));
    this.set('lv', String(g.level), (v) => (this.lv.textContent = `LV ${v}`));
    const hp = Math.max(0, Math.ceil(p.hp));
    this.set('hp', `${hp}/${Math.round(s.maxHp)}`, (v) => {
      this.hpText.textContent = v;
      this.hpFill.style.transform = `scaleX(${Math.max(0, p.hp / s.maxHp)})`;
    });
    this.set('gold', String(g.gold), (v) => (this.gold.textContent = `€ ${v}`));
    this.set('kills', String(g.kills), (v) => (this.kills.textContent = `✔ ${v} ticket chiusi`));
    const c = g.clock();
    this.set('clock', c.text + c.overtime, () => {
      this.time.textContent = c.text;
      this.clock.classList.toggle('overtime', c.overtime);
    });
    this.set('where', g.biome.id + c.overtime, () => {
      this.where.textContent = c.overtime ? 'Straordinario!' : `${g.biome.project} · ${g.biome.place}`;
    });
    this.hurt.style.opacity = String(g.hurtFlash * 0.8);

    if (g.boss && g.boss.alive) {
      this.bossbar.hidden = false;
      this.set('bossName', g.boss.def.name, (v) => (this.bossName.textContent = v));
      this.bossFill.style.transform = `scaleX(${Math.max(0, g.boss.hp / g.boss.maxHp)})`;
    } else this.bossbar.hidden = true;

    this.set('prompt', g.prompt ?? '', (v) => {
      this.prompt.hidden = !v;
      this.prompt.textContent = v;
    });
    this.hint.hidden = locked || g.mode !== 'play';

    const slotKey = g.weapons.map((w) => w.def.id + w.level).join() + '|' + g.passives.map((x) => x.id + x.level).join();
    this.set('slots', slotKey, () => this.renderSlots(g));

    this.drawNumbers(g);
    this.drawMinimap(g);
  }

  private renderSlots(g: Game) {
    this.slots.replaceChildren();
    const mk = (icons: { icon: string; level: number; title: string }[], max: number) => {
      const row = el('div', 'row', this.slots);
      for (let i = 0; i < max; i++) {
        const it = icons[i];
        const s = el('div', it ? 'slot' : 'slot empty', row);
        if (!it) continue;
        s.title = it.title;
        const ic = el('i', '', s);
        ic.setAttribute('style', this.atlas.iconStyle(it.icon, 36));
        const lv = el('em', '', s);
        lv.textContent = String(it.level);
      }
    };
    mk(g.weapons.map((w) => ({ icon: w.def.icon, level: w.level, title: w.def.name })), TUNING.maxWeapons);
    mk(g.passives.map((p) => ({ icon: PASSIVES[p.id].icon, level: p.level, title: PASSIVES[p.id].name })), TUNING.maxPassives);
  }

  private drawNumbers(g: Game) {
    const cv = this.numbers;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr);
    const h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = this.nctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const cw = cv.clientWidth;
    const ch = cv.clientHeight;
    for (const n of g.numbers) {
      this.v.set(n.x, n.y, n.z).project(g.camera);
      if (this.v.z > 1) continue;
      const x = (this.v.x * 0.5 + 0.5) * cw;
      const y = (-this.v.y * 0.5 + 0.5) * ch;
      const a = Math.min(1, n.life * 3);
      const size = n.crit ? 24 : 17;
      ctx.globalAlpha = a;
      ctx.font = `700 ${size}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#10131c';
      ctx.strokeText(n.text, x, y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawMinimap(g: Game) {
    const ctx = this.mctx;
    const S = 300;
    const R = S / 2;
    const range = 70; // unità mondo visibili dal centro al bordo
    const k = R / range;
    const p = g.player;
    const yaw = g.rig.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // ruota la mappa così che "avanti" (camera) sia in alto
    const proj = (x: number, z: number, clamp: boolean): [number, number] | null => {
      const dx = x - p.x;
      const dz = z - p.z;
      let sx = (dx * cos - dz * sin) * k;
      let sy = (dx * sin + dz * cos) * k;
      const d = Math.hypot(sx, sy);
      if (d > R - 10) {
        if (!clamp) return null;
        sx *= (R - 10) / d;
        sy *= (R - 10) / d;
      }
      return [R + sx, R + sy];
    };
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    // bordo dell'arena
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const H = g.world.half;
    const corners = [
      [-H, -H],
      [H, -H],
      [H, H],
      [-H, H],
    ];
    corners.forEach(([x, z], i) => {
      const dx = (x - p.x) * k;
      const dz = (z - p.z) * k;
      const sx = R + dx * cos - dz * sin;
      const sy = R + dx * sin + dz * cos;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(232,85,78,0.9)';
    for (const e of g.enemies) {
      if (e.boss || e.elite) continue;
      const q = proj(e.x, e.z, false);
      if (q) ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6);
    }
    for (const it of g.interactables) {
      if (it.used && it.kind !== 'portal') continue;
      const important = it.kind === 'altar' || it.kind === 'portal';
      const q = proj(it.x, it.z, important);
      if (!q) continue;
      const color = it.kind === 'chest' ? '#ffd23f' : it.kind === 'shrine' ? '#ff8c5a' : it.kind === 'altar' ? '#b48cff' : it.kind === 'clinic' ? '#ee7d01' : '#5dfd8a';
      ctx.fillStyle = color;
      ctx.strokeStyle = '#10131c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (it.kind === 'chest') ctx.rect(q[0] - 7, q[1] - 7, 14, 14);
      else if (it.kind === 'clinic') {
        // croce del presidio GPI
        const [x, y] = q;
        const a = 3.5;
        const b = 9;
        const pts = [-a, -b, a, -b, a, -a, b, -a, b, a, a, a, a, b, -a, b, -a, a, -b, a, -b, -a, -a, -a];
        for (let i = 0; i < pts.length; i += 2) ctx.lineTo(x + pts[i], y + pts[i + 1]);
        ctx.closePath();
      } else ctx.arc(q[0], q[1], important ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const e of g.enemies) {
      if (!e.boss && !e.elite) continue;
      const q = proj(e.x, e.z, true);
      if (!q) continue;
      ctx.fillStyle = e.boss ? '#ff3b3b' : '#ff8c1a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(q[0], q[1], e.boss ? 13 : 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // giocatore
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10131c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(R, R - 14);
    ctx.lineTo(R + 10, R + 10);
    ctx.lineTo(R, R + 4);
    ctx.lineTo(R - 10, R + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
