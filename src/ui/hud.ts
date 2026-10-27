import * as THREE from 'three';
import { PASSIVES } from '../config/passives';
import { TUNING } from '../config/tuning';
import type { BiomeDef } from '../config/types';
import type { Game, LockEvent } from '../game/game';
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
  private insert: HTMLDivElement;
  private vimSlot: HTMLElement | null = null;
  private weaponSlots: HTMLElement[] = [];
  private lastLock: LockEvent | null = null; // ultimo evento d'aggiornamento visto (lampo dello slot una volta sola)
  private icons = new Map<string, HTMLCanvasElement>(); // icone dell'atlas per il canvas, a colori e in grigio
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
    // Scorciatoie di Vim: la riga di stato vive dentro gli slot, così li segue in ogni layout
    this.insert = el('div', 'vim-insert');
    this.insert.textContent = '-- INSERT --';
    this.prompt = el('div', 'prompt', this.root);
    this.prompt.hidden = true;
    this.hint = el('div', 'hint', this.root);
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

  update(g: Game) {
    const p = g.player;
    const touch = g.input.touch;
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
    const loc = g.location();
    this.set('where', g.biome.id + c.overtime + loc, () => {
      if (c.overtime) this.where.textContent = 'Straordinario!';
      else {
        // sugli schermi piccoli il nome del progetto si nasconde (CSS): resta il posto
        this.where.replaceChildren();
        el('span', 'project', this.where).textContent = `${g.biome.project} · `;
        this.where.append(loc ?? g.biome.place);
      }
    });
    this.hurt.style.opacity = String(g.hurtFlash * 0.8);

    if (g.boss && g.boss.alive) {
      this.bossbar.hidden = false;
      this.set('bossName', g.boss.def.name, (v) => (this.bossName.textContent = v));
      this.bossFill.style.transform = `scaleX(${Math.max(0, g.boss.hp / g.boss.maxHp)})`;
    } else this.bossbar.hidden = true;

    // col touch al posto di [E] compare il pulsante "Usa"
    this.set('prompt', (touch ? g.prompt?.replace(/^\[E\] /, '') : g.prompt) ?? '', (v) => {
      this.prompt.hidden = !v;
      this.prompt.textContent = v;
    });
    this.set('hint', String(touch), () => {
      this.hint.textContent = touch
        ? 'Pollice sinistro: muoviti · trascina a destra: camera · due dita: zoom'
        : 'Clicca sul gioco per guidare la camera col mouse (oppure trascina) · Esc per la pausa';
    });
    // col touch il suggerimento sta nella stessa fascia di -- INSERT --: in INSERT cede il posto
    this.hint.hidden = g.mode !== 'play' || (touch ? g.runTime > 10 || !!g.prompt || g.insertMode : g.input.locked);

    let slotKey = g.weapons.map((w) => w.def.id + w.level).join() + '|' + g.passives.map((x) => x.id + x.level).join();
    // loadout a budget: su desktop le righe dipendono anche dai totali (premi del JOscar) e da touch/mouse
    if (TUNING.loadout === 'budget') slotKey += `|${touch}|${g.ram.max}|${g.cpu.max}`;
    this.set('slots', slotKey, () => this.renderSlots(g));
    // in NORMAL nessuna scritta, senza Vim mai (insertMode resta false)
    this.set('insert', String(g.insertMode), () => {
      this.insert.classList.toggle('on', g.insertMode);
      this.vimSlot?.classList.toggle('lit', g.insertMode);
    });
    // arma in aggiornamento: spicchio scuro che si ritira; su desktop anche i secondi (il CSS li nasconde col touch)
    g.weapons.forEach((w, i) => {
      const s = this.weaponSlots[i];
      if (!s) return;
      const left = w.locked;
      const frac = Math.min(1, left / TUNING.update.lockTime).toFixed(3);
      this.set(`lock${i}`, left > 0 ? `${frac}|${Math.ceil(left)}` : '', (v) => {
        s.classList.toggle('locked', !!v);
        if (v) {
          s.style.setProperty('--lock', frac);
          s.dataset.secs = v.split('|')[1];
        } else {
          s.style.removeProperty('--lock');
          delete s.dataset.secs;
        }
      });
    });
    // riavvio: lampo verde del bordo dello slot, una volta per evento
    const ev = g.lockEvent;
    if (ev !== this.lastLock) {
      this.lastLock = ev;
      const s = ev?.reboot ? this.weaponSlots[g.weapons.findIndex((w) => w.def.icon === ev.icon)] : undefined;
      if (s) {
        s.classList.remove('reboot');
        void s.offsetWidth; // riparte l'animazione anche se la classe c'era già
        s.classList.add('reboot');
        s.addEventListener('animationend', () => s.classList.remove('reboot'), { once: true });
      }
    }

    this.drawNumbers(g);
    this.drawMinimap(g);
  }

  private renderSlots(g: Game) {
    this.slots.replaceChildren(this.insert);
    const budget = TUNING.loadout === 'budget';
    // loadout a budget su desktop: "Gestione attività", blocchi larghi in proporzione al costo
    const blocks = budget && !g.input.touch;
    this.slots.classList.toggle('budget', blocks);
    // col touch, oltre 8 oggetti (possibile solo col loadout a budget) la riga diventa compatta
    this.slots.classList.toggle('dense', g.weapons.length + g.passives.length > 8);
    this.vimSlot = null;
    // slot nuovi: lo stato di Vim e degli aggiornamenti va riapplicato al prossimo controllo
    for (const k of [...this.cache.keys()]) if (k === 'insert' || k.startsWith('lock')) this.cache.delete(k);
    type Item = { id: string; icon: string; level: number; title: string; cost: number };
    // `max` = slot totali (gli avanzi sono tratteggiati); col budget su desktop `b` dà etichetta, parte libera e "usata/totale"
    const mk = (items: Item[], max: number, b?: { label: string; used: number; max: number }) => {
      const row = el('div', 'row', this.slots);
      if (b) el('b', 'res', row).textContent = b.label;
      const filled: HTMLElement[] = [];
      for (let i = 0; i < max; i++) {
        const it = items[i];
        const s = el('div', it ? 'slot' : 'slot empty', row);
        if (!it) continue;
        filled.push(s);
        if (b) s.style.setProperty('--u', String(it.cost));
        if (it.id === 'vim') this.vimSlot = s;
        s.title = it.title;
        const ic = el('i', '', s);
        ic.setAttribute('style', this.atlas.iconStyle(it.icon, 36));
        const lv = el('em', '', s);
        lv.textContent = String(it.level);
      }
      if (b) {
        if (b.max > b.used) el('div', 'slot empty', row).style.setProperty('--u', String(b.max - b.used));
        el('span', 'use', row).textContent = `${b.used}/${b.max}`;
      }
      return filled;
    };
    const weapons = g.weapons.map((w) => ({ id: w.def.id, icon: w.def.icon, level: w.level, title: w.def.name, cost: w.def.cost }));
    const passives = g.passives.map((p) => ({ id: p.id, icon: PASSIVES[p.id].icon, level: p.level, title: PASSIVES[p.id].name, cost: PASSIVES[p.id].cost }));
    // col budget e touch: solo le icone installate, a dimensione fissa (niente slot vuoti: il numero non è fisso)
    this.weaponSlots = mk(weapons, budget ? weapons.length : TUNING.maxWeapons, blocks ? { label: 'RAM', ...g.ram } : undefined);
    mk(passives, budget ? passives.length : TUNING.maxPassives, blocks ? { label: 'CPU', ...g.cpu } : undefined);
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
      // colpo su un nemico in call: più piccolo, così "fai meno danno" si legge anche senza il colore
      const size = n.small ? (n.crit ? 20 : 14) : n.crit ? 24 : 17;
      ctx.globalAlpha = a;
      ctx.font = `700 ${size}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#10131c';
      ctx.strokeText(n.text, x, y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, x, y);
    }
    ctx.globalAlpha = 1;
    // arma in aggiornamento: la sua icona sopra il giocatore per 1 s al blocco, 0,5 s al riavvio
    const ev = g.lockEvent;
    if (ev) {
      const age = g.runTime - ev.time;
      const life = ev.reboot ? 0.5 : 1;
      if (age >= 0 && age < life) this.drawLockIcon(g, ev, age, life, cw, ch);
    }
  }

  /** Icona dell'arma sopra la testa: grigia (con un pop) al blocco, a colori con la ✓ verde al riavvio. Niente testo. */
  private drawLockIcon(g: Game, ev: LockEvent, age: number, life: number, cw: number, ch: number) {
    const p = g.player;
    this.v.set(p.x, p.y + 2.2, p.z).project(g.camera);
    if (this.v.z > 1) return;
    const touch = g.input.touch;
    const r = touch ? 15 : 17; // cerchio da 30 / 34 px
    const s = touch ? 22 : 24; // icona
    const head = (-this.v.y * 0.5 + 0.5) * ch;
    let x = (this.v.x * 0.5 + 0.5) * cw;
    let y = head - r - 12;
    // mai sotto un banner: sul telefono in orizzontale la fascia dei banner è subito sopra la testa
    // (il primo blocco porta anche il suo banner), allora l'icona va di fianco alla testa, sotto la fascia
    if (this.banners.childElementCount) {
      const c = this.numbers.getBoundingClientRect();
      let top = Infinity;
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (const b of this.banners.children) {
        const rb = b.getBoundingClientRect();
        top = Math.min(top, rb.top - c.top);
        bottom = Math.max(bottom, rb.bottom - c.top);
        left = Math.min(left, rb.left - c.left);
        right = Math.max(right, rb.right - c.left);
      }
      if (y - r < bottom + 4 && y + r > top && x + r > left && x - r < right) {
        x += r + 22;
        y = Math.max(head + 2, bottom + 4 + r);
      }
    }
    const t = Math.min(1, age / 0.2);
    const pop = ev.reboot || this.reduceMotion.matches ? 1 : 0.6 + 0.4 * (1 - (1 - t) ** 3);
    const ctx = this.nctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (life - age) / 0.12); // breve dissolvenza in uscita
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 19, 28, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ev.reboot ? '#5dfd8a' : 'rgba(247, 245, 239, 0.85)';
    ctx.stroke();
    ctx.drawImage(this.iconCanvas(ev.icon, !ev.reboot), -s / 2, -s / 2, s, s);
    if (ev.reboot) {
      // spunta in basso a destra, verde col contorno scuro come i numeri
      const check = () => {
        ctx.beginPath();
        ctx.moveTo(r * 0.3, r * 0.72);
        ctx.lineTo(r * 0.62, r * 1.02);
        ctx.lineTo(r * 1.16, r * 0.4);
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      check();
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#10131c';
      ctx.stroke();
      check();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#5dfd8a';
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Icona dell'atlas su un canvas da 64 px (in grigio se `grey`), creata una volta sola. */
  private iconCanvas(id: string, grey: boolean): HTMLCanvasElement {
    const key = (grey ? 'g:' : 'c:') + id;
    let c = this.icons.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d', { willReadFrequently: grey })!;
    const f = this.atlas.get(id);
    x.drawImage(this.atlas.canvas, f.cx * 128, f.cy * 128, f.cw * 128, f.ch * 128, 0, 0, 64, 64);
    if (grey) {
      const img = x.getImageData(0, 0, 64, 64);
      const a = img.data;
      // grigio un po' schiarito: sul cerchio scuro l'icona spenta deve restare riconoscibile
      for (let i = 0; i < a.length; i += 4) a[i] = a[i + 1] = a[i + 2] = 40 + 0.85 * (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]);
      x.putImageData(img, 0, 0);
    }
    this.icons.set(key, c);
    return c;
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
    // ruota la mappa così che "avanti" (camera) sia in alto; `edge` = distanza dal bordo dei segnali agganciati
    const proj = (x: number, z: number, clamp: boolean, edge = 10): [number, number] | null => {
      const dx = x - p.x;
      const dz = z - p.z;
      let sx = (dx * cos - dz * sin) * k;
      let sy = (dx * sin + dz * cos) * k;
      const d = Math.hypot(sx, sy);
      if (d > R - edge) {
        if (!clamp) return null;
        sx *= (R - edge) / d;
        sy *= (R - edge) / d;
      }
      return [R + sx, R + sy];
    };
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    // pianta della mappa reale, ruotata come la camera
    const mm = g.world.minimap;
    if (mm) {
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(yaw);
      ctx.scale(k, k);
      ctx.translate(-p.x, -p.z);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(mm.canvas, -mm.half, -mm.half, mm.half * 2, mm.half * 2);
      ctx.restore();
    }
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
      if (e.boss || e.elite || e.def.aura) continue;
      const q = proj(e.x, e.z, false);
      if (q) ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6);
    }
    for (const it of g.interactables) {
      if ((it.used && it.kind !== 'portal') || it.place) continue; // i locali hanno già il loro segnaposto
      const important = it.kind === 'altar' || it.kind === 'portal' || it.kind === 'joscar';
      const q = proj(it.x, it.z, important);
      if (!q) continue;
      const color = { chest: '#ffd23f', shrine: '#ff8c5a', altar: '#b48cff', clinic: '#ee7d01', ngh: '#81cbd0', joscar: '#f5c542', portal: '#5dfd8a', lunch: '#5dfd8a' }[it.kind];
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
      } else if (it.kind === 'joscar') {
        // stella dorata della premiazione
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 ? 5 : 12;
          ctx.lineTo(q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r);
        }
        ctx.closePath();
      } else ctx.arc(q[0], q[1], important ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (it.kind === 'ngh') {
        // il punto arancione del logo NGH
        ctx.fillStyle = '#ee7f01';
        ctx.beginPath();
        ctx.arc(q[0], q[1], 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // locali principali della mappa: il loro segnaposto
    for (const pl of g.world.places) {
      if (!pl.icon) continue;
      const q = proj(pl.x, pl.z, false);
      if (!q) continue;
      const f = this.atlas.get(pl.icon);
      ctx.drawImage(this.atlas.canvas, f.cx * 128, f.cy * 128, 128, 128, q[0] - 15, q[1] - 26, 30, 30);
    }
    // Call di Gruppo: fumetto di chat lilla col bordo bianco, agganciato al bordo come gli élite (è un bersaglio da andare a prendere)
    for (const e of g.enemies) {
      if (!e.def.aura) continue;
      const q = proj(e.x, e.z, true, 16);
      if (!q) continue;
      const [x, y] = q;
      const l = x - 12; // fumetto 24×20 con angoli da 6 e la coda in basso a sinistra, in un solo tracciato
      const r = x + 12;
      const t = y - 12;
      const b = y + 8;
      ctx.fillStyle = '#b9bbff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l + 6, t);
      ctx.arcTo(r, t, r, b, 6);
      ctx.arcTo(r, b, l, b, 6);
      ctx.lineTo(x - 1, b);
      ctx.lineTo(x - 9, b + 6);
      ctx.lineTo(x - 6, b);
      ctx.arcTo(l, b, l, t, 6);
      ctx.arcTo(l, t, r, t, 6);
      ctx.closePath();
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
