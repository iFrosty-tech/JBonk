import { BIOMES } from '../config/biomes';
import { CHARACTERS } from '../config/characters';
import { ENEMIES } from '../config/enemies';
import { TUNING } from '../config/tuning';
import { WEAPONS } from '../config/weapons';
import type { ChoiceRequest } from '../game/entities';
import type { RunResult } from '../game/game';
import type { Atlas } from '../render/atlas';

// Schermate in HTML: titolo, scelta carte, pausa, fine partita.

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

function icon(atlas: Atlas, id: string, px: number) {
  const i = h('i');
  i.setAttribute('style', atlas.iconStyle(id, px));
  return i;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export interface TitleChoice {
  character: number;
  biome: number;
}

export class Screens {
  private current: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private ticketSeq = 400 + Math.floor(Math.random() * 400);

  constructor(
    private readonly parent: HTMLElement,
    private readonly atlas: Atlas,
  ) {}

  close() {
    this.current?.remove();
    this.current = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }

  get open() {
    return this.current !== null;
  }

  private show(node: HTMLElement, onKey?: (e: KeyboardEvent) => void) {
    this.close();
    this.current = node;
    this.parent.appendChild(node);
    if (onKey) {
      this.keyHandler = onKey;
      window.addEventListener('keydown', onKey);
    }
  }

  title(initial: TitleChoice, start: (c: TitleChoice) => void) {
    const sel = { ...initial };
    const charBtns: HTMLButtonElement[] = [];
    const biomeBtns: HTMLButtonElement[] = [];
    const refresh = () => {
      charBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel.character)));
      biomeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === sel.biome)));
    };
    const chars = h('div', { class: 'choices' });
    CHARACTERS.forEach((c, i) => {
      const w = WEAPONS[c.startWeapon];
      const b = h(
        'button',
        { class: 'pick', type: 'button', id: `char-${c.id}` },
        h('span', { class: 'art' }, icon(this.atlas, c.sprite, 72)),
        h('b', {}, c.name),
        h('small', {}, c.role),
        h('span', { class: 'chip' }, c.bonusText),
        h('p', {}, `${c.description} Arma iniziale: ${w.name}. Compagno: ${c.companionName}.`),
      );
      b.addEventListener('click', () => {
        sel.character = i;
        refresh();
      });
      charBtns.push(b);
      chars.append(b);
    });
    const biomes = h('div', { class: 'choices' });
    BIOMES.forEach((bm, i) => {
      const sw = h('span', { class: 'swatch art' });
      sw.setAttribute('style', `background:linear-gradient(135deg, ${bm.palette.tileA} 0 50%, ${bm.palette.accent} 50% 100%)`);
      const b = h(
        'button',
        { class: 'pick', type: 'button', id: `biome-${bm.id}` },
        sw,
        h('b', {}, bm.project),
        h('small', {}, `${bm.place} · Cliente: ${bm.client}`),
        h('span', { class: 'chip' }, `Boss: ${ENEMIES[bm.boss].name}`),
        h('p', {}, bm.description),
      );
      b.addEventListener('click', () => {
        sel.biome = i;
        refresh();
      });
      biomeBtns.push(b);
      biomes.append(b);
    });
    const go = h('button', { class: 'btn', type: 'button', id: 'start' }, 'Timbra il cartellino ▸');
    go.addEventListener('click', () => start(sel));
    const keys = h('div', { class: 'keys' });
    keys.innerHTML =
      '<span><kbd>WASD</kbd>muoviti</span><span><kbd>Mouse</kbd>camera</span><span><kbd>Spazio</kbd>salta</span>' +
      '<span><kbd>Shift</kbd>scatto</span><span><kbd>E</kbd>interagisci</span><span><kbd>Esc</kbd>pausa</span><span><kbd>M</kbd>audio</span>';
    const node = h(
      'div',
      { class: 'screen title' },
      h(
        'div',
        { class: 'wrap' },
        h(
          'header',
          { class: 'logo' },
          h('h1', {}, 'JBonk'),
          h('p', {}, `Sopravvivi alla giornata lavorativa: dalle 9:00 alle 18:00 chiudi ticket, sali di livello e batti il boss del progetto. Consegna ${TUNING.stagesToWin} progetti di fila per vincere.`),
        ),
        h('section', { class: 'step' }, h('h2', {}, '1 · Chi timbra oggi'), chars),
        h('section', { class: 'step' }, h('h2', {}, '2 · Primo progetto'), biomes),
        h('div', { class: 'start-row' }, keys, go),
        h('p', { class: 'note' }, 'Proof of concept: grafica generata via codice, nomi di progetti e clienti di fantasia. Serve tastiera e mouse.'),
      ),
    );
    refresh();
    this.show(node, (e) => {
      if (e.code === 'Enter') start(sel);
    });
  }

  choice(req: ChoiceRequest, done: () => void) {
    const tickets = h('div', { class: 'tickets' });
    let picked = false;
    const choose = (i: number) => {
      if (picked) return;
      picked = true;
      req.cards[i].apply();
      this.close();
      done();
    };
    req.cards.forEach((c, i) => {
      const prio = `var(--p${c.rarity})`;
      const t = h(
        'button',
        { class: 'ticket', type: 'button', id: `card-${i}` },
        h('header', {}, h('span', {}, `OB-${this.ticketSeq++} · ${c.tag}`), h('span', { class: 'prio' }, TUNING.rarity.names[c.rarity])),
        h('div', { class: 'body' }, icon(this.atlas, c.icon, 52), h('b', {}, c.name), h('small', {}, c.level), h('ul', {}, ...c.lines.map((l) => h('li', {}, l)))),
        h('kbd', {}, String(i + 1)),
      );
      t.style.setProperty('--prio', prio);
      t.addEventListener('click', () => choose(i));
      tickets.append(t);
    });
    const modal = h('div', { class: 'modal' }, h('h2', {}, req.title), h('p', {}, req.subtitle), tickets);
    if (req.skipLabel) {
      const skip = h('button', { class: 'link', type: 'button' }, req.skipLabel);
      skip.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        req.onSkip?.();
        this.close();
        done();
      });
      modal.append(skip);
    }
    const node = h('div', { class: 'screen dim' }, modal);
    // piccolo ritardo: evita di scegliere per sbaglio tenendo premuto un tasto
    const opened = performance.now();
    this.show(node, (e) => {
      if (performance.now() - opened < 250) return;
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (n >= 0 && n < req.cards.length && /Digit|Numpad/.test(e.code)) choose(n);
    });
  }

  pause(resume: () => void, restart: () => void, menu: () => void) {
    const r = h('button', { class: 'btn', type: 'button', id: 'resume' }, 'Riprendi');
    const rs = h('button', { class: 'btn secondary', type: 'button' }, 'Ricomincia');
    const m = h('button', { class: 'btn secondary', type: 'button' }, 'Menu principale');
    r.addEventListener('click', resume);
    rs.addEventListener('click', restart);
    m.addEventListener('click', menu);
    const node = h(
      'div',
      { class: 'screen dim' },
      h('div', { class: 'panel' }, h('h2', {}, 'Pausa pranzo'), h('p', {}, 'Il timer è fermo. Le mail, purtroppo, no.'), h('div', { class: 'actions' }, r, rs, m)),
    );
    this.show(node, (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') resume();
    });
    r.focus();
  }

  over(res: RunResult, retry: () => void, menu: () => void) {
    const stat = (label: string, value: string) => h('div', {}, h('small', {}, label), h('b', {}, value));
    const rows = res.damage.map((d) => h('tr', {}, h('td', {}, icon(this.atlas, d.icon, 24), d.name), h('td', {}, d.value.toLocaleString('it-IT'))));
    const again = h('button', { class: 'btn', type: 'button', id: 'retry' }, 'Riprova');
    const m = h('button', { class: 'btn secondary', type: 'button' }, 'Menu principale');
    again.addEventListener('click', retry);
    m.addEventListener('click', menu);
    const node = h(
      'div',
      { class: 'screen dim' },
      h(
        'div',
        { class: 'panel' },
        h('h2', { class: res.victory ? 'good' : 'bad' }, res.victory ? 'Progetti consegnati!' : 'Burnout'),
        h('p', {}, res.victory ? `${res.character.name}: ${TUNING.stagesToWin} progetti chiusi, in tempo e (quasi) nel budget.` : `${res.character.name} è crollato durante ${res.biome.project}.`),
        h(
          'div',
          { class: 'stats' },
          stat('Tempo', fmtTime(res.time)),
          stat('Ticket chiusi', res.kills.toLocaleString('it-IT')),
          stat('Livello', String(res.level)),
          stat('Buoni pasto', `€ ${res.gold}`),
          stat('Progetti', `${res.stages}/${TUNING.stagesToWin}`),
        ),
        h('table', { class: 'dmg' }, h('tbody', {}, ...rows)),
        h('div', { class: 'actions' }, again, m),
      ),
    );
    this.show(node, (e) => {
      if (e.code === 'Enter') retry();
    });
  }
}
