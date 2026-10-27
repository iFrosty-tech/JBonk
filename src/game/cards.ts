import { BUFFS, PASSIVES, PASSIVE_IDS } from '../config/passives';
import { TUNING } from '../config/tuning';
import { WEAPONS, WEAPON_IDS } from '../config/weapons';
import type { StatFormat, UpgradeDef } from '../config/types';
import type { Card, ChoiceBudget, Resource } from './entities';
import type { Game } from './game';
import { WeaponInstance } from './weapons';

// Generazione delle carte (level-up, forziere, JOscar, macchinetta del caffè).
// La rarità è la "priorità" del ticket: Bassa, Media, Alta, Bloccante.

function rollRarity(luck: number, min = 0): number {
  const w = TUNING.rarity.weights.map((v, i) => (i < min ? 0 : v * (1 + luck * i)));
  const tot = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

export function formatStat(v: number, fmt: StatFormat): string {
  if (fmt === 'pct') return `+${Math.round(v * 100)}%`;
  if (fmt === 'num') return `+${v.toFixed(1)}`;
  return `+${Math.round(v)}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function upgradeAmount(u: UpgradeDef, rarity: number) {
  if (u.int) return u.amount + (rarity >= 3 ? u.amount : 0);
  return u.amount * TUNING.rarity.mult[rarity];
}

function upgradeText(u: UpgradeDef, amt: number) {
  if (u.mode === 'mul') return `${amt > 0 ? '+' : ''}${Math.round(amt * 100)}% ${u.label}`;
  return `+${u.int ? Math.round(amt) : Math.round(amt * 10) / 10} ${u.label}`;
}

function weaponUpgradeCard(g: Game, w: WeaponInstance, rarity: number): Card {
  const u = pick(w.def.upgrades);
  const amt = upgradeAmount(u, rarity);
  return {
    icon: w.def.icon,
    name: w.def.name,
    tag: 'Arma',
    rarity,
    level: `Lv ${w.level} → ${w.level + 1}`,
    lines: [upgradeText(u, amt)],
    updating: w.locked > 0,
    apply: () => {
      w.level++;
      if (u.mode === 'add') w.stats[u.stat] += amt;
      else w.stats[u.stat] *= 1 + amt;
      g.recomputeStats();
    },
  };
}

/** Loadout budget: costo di un oggetto nuovo e quanto della risorsa resterà occupato dopo ("RAM 3 → 6/9"). */
function installCost(g: Game, res: Resource, amount: number): Card['cost'] {
  if (TUNING.loadout !== 'budget') return undefined;
  const b = g[res];
  return { res, amount, after: b.used + amount, max: b.max };
}

function newWeaponCard(g: Game, id: string): Card {
  const def = WEAPONS[id];
  return {
    icon: def.icon,
    name: def.name,
    tag: 'Nuova arma',
    rarity: 0,
    level: 'Nuova',
    lines: [def.description],
    apply: () => g.addWeapon(id),
    cost: installCost(g, 'ram', def.cost),
  };
}

function passiveCard(g: Game, id: string, rarity: number): Card {
  const def = PASSIVES[id];
  const owned = g.passives.find((p) => p.id === id);
  const mult = TUNING.rarity.mult[rarity];
  let amt = def.amount * mult;
  if (def.fmt === 'int') amt = Math.max(1, Math.round(amt));
  // passivo a due modalità: una riga d'effetto per modalità, entrambe scalate dalla rarità
  const lines = def.modes
    ? [def.modes.still, def.modes.moving].map((m) => m.line.replace('{v}', formatStat(m.amount * mult, def.fmt)))
    : [`${formatStat(amt, def.fmt)} ${def.description}`];
  return {
    icon: def.icon,
    name: def.name,
    tag: owned ? 'Passivo' : 'Nuovo passivo',
    rarity,
    level: owned ? `Lv ${owned.level} → ${owned.level + 1}` : 'Nuovo',
    lines,
    apply: () => g.addPassive(id, amt),
    cost: owned ? undefined : installCost(g, 'cpu', def.cost),
  };
}

function fallbackCards(g: Game): Card[] {
  return [
    {
      icon: 'soldo',
      name: 'Rimborso Spese',
      tag: 'Bonus',
      rarity: 0,
      level: '—',
      lines: ['+25 buoni pasto'],
      apply: () => {
        g.gold += 25;
      },
    },
    {
      icon: 'pizza',
      name: 'Pizza di Team',
      tag: 'Bonus',
      rarity: 0,
      level: '—',
      lines: ['Recupera il 40% degli HP'],
      apply: () => g.heal(g.stats.maxHp * 0.4),
    },
  ];
}

/** Tre carte per il level-up (o per un forziere, con rarità minima più alta). */
export function upgradeCards(g: Game, minRarity = 0): Card[] {
  type Option = { weight: number; make: (rarity: number) => Card; key: string };
  const options: Option[] = [];
  for (const w of g.weapons)
    if (w.level < w.def.maxLevel) options.push({ key: 'w' + w.def.id, weight: 1.3, make: (r) => weaponUpgradeCard(g, w, r) });
  // oggetti nuovi solo se c'è posto: slot liberi, o RAM e CPU libere col loadout budget (niente carte che non ci stanno)
  for (const id of WEAPON_IDS)
    if (g.installBlock('ram', id) === null) options.push({ key: 'n' + id, weight: 0.8, make: () => newWeaponCard(g, id) });
  for (const id of PASSIVE_IDS) {
    const owned = g.passives.find((p) => p.id === id);
    if (owned ? owned.level < PASSIVES[id].maxLevel : g.installBlock('cpu', id) === null)
      options.push({ key: 'p' + id, weight: owned ? 1.1 : 0.7, make: (r) => passiveCard(g, id, r) });
  }
  const cards: Card[] = [];
  const pool = [...options];
  while (cards.length < 3 && pool.length) {
    const tot = pool.reduce((a, o) => a + o.weight, 0);
    let r = Math.random() * tot;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    const o = pool.splice(idx, 1)[0];
    cards.push(o.make(rollRarity(g.stats.luck, minRarity)));
  }
  const fb = fallbackCards(g);
  while (cards.length < 3 && fb.length) cards.push(fb.shift()!);
  return cards;
}

// Premi del JOscar che allargano il budget (testi PC-09…14 di writing.md; icone di technical-artist)
const PRIZES: Record<Resource, { icon: string; name: string; line: string; description: string }> = {
  ram: { icon: 'ic_ram', name: 'Banco di RAM', line: '+{n} RAM', description: 'Richiesta hardware approvata. Dopo sei mesi.' },
  cpu: { icon: 'ic_cpu', name: 'Processore Nuovo', line: '+{n} CPU', description: 'Dal magazzino IT, ancora nella plastica.' },
};
const RES_LABEL: Record<Resource, string> = { ram: 'RAM', cpu: 'CPU' };

function budgetPrizeCard(g: Game, res: Resource): Card {
  const p = PRIZES[res];
  const n = TUNING.budget.prize;
  const from = g[res].max;
  return {
    icon: p.icon,
    name: p.name,
    tag: 'Bonus',
    rarity: 2,
    level: `${RES_LABEL[res]} ${from} → ${from + n}`,
    lines: [p.line.replace('{n}', String(n)), p.description],
    apply: () => g.addBudget(res, n, true),
    bonus: { res, from, to: from + n },
  };
}

/**
 * Premi del JOscar: le carte di upgradeCards (rarità almeno Alta). Col loadout budget, finché in partita non si sono presi
 * `prizeMax` premi sul budget, l'ultima delle tre diventa «Banco di RAM» o «Processore Nuovo»: quello della risorsa più
 * scarsa, cioè con meno spazio libero rispetto al massimo (a parità, a caso). Il giocatore sceglie se prenderlo al posto
 * di una carta normale; il limite conta i premi presi, non quelli offerti.
 */
export function joscarCards(g: Game): Card[] {
  const cards = upgradeCards(g, 2);
  if (TUNING.loadout !== 'budget' || g.budgetPrizes >= TUNING.budget.prizeMax) return cards;
  const free = (res: Resource) => (g[res].max - g[res].used) / g[res].max;
  const d = free('ram') - free('cpu');
  const res: Resource = d < 0 ? 'ram' : d > 0 ? 'cpu' : Math.random() < 0.5 ? 'ram' : 'cpu';
  cards[cards.length - 1] = budgetPrizeCard(g, res);
  return cards;
}

/** Barre e riga "insufficiente" della finestra delle carte; undefined con gli slot. */
export function choiceBudget(g: Game): ChoiceBudget | undefined {
  if (TUNING.loadout !== 'budget') return undefined;
  const short: Resource[] = [];
  if (WEAPON_IDS.some((id) => g.installBlock('ram', id) === 'ram')) short.push('ram');
  if (PASSIVE_IDS.some((id) => g.installBlock('cpu', id) === 'cpu')) short.push('cpu');
  return { ram: { ...g.ram }, cpu: { ...g.cpu }, short };
}

/** Macchinetta del caffè: tre bevande, ciascuna un bonus permanente. */
export function shrineCards(g: Game): Card[] {
  const pool = [...BUFFS];
  const out: Card[] = [];
  while (out.length < 3 && pool.length) {
    const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const rarity = rollRarity(g.stats.luck + 0.5);
    let amt = b.amount * TUNING.rarity.mult[rarity];
    if (b.fmt === 'int') amt = Math.max(1, Math.round(amt));
    out.push({
      icon: b.icon,
      name: b.name,
      tag: 'Caffè',
      rarity,
      level: 'Bonus',
      lines: [`${formatStat(amt, b.fmt)} ${b.label}`],
      apply: () => g.addBuff(b.stat, amt),
    });
  }
  return out;
}
