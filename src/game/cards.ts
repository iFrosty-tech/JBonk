import { BUFFS, PASSIVES, PASSIVE_IDS } from '../config/passives';
import { TUNING } from '../config/tuning';
import { WEAPONS, WEAPON_IDS } from '../config/weapons';
import type { StatFormat, UpgradeDef } from '../config/types';
import type { Card } from './entities';
import type { Game } from './game';
import { WeaponInstance } from './weapons';

// Generazione delle carte (level-up, forziere, macchinetta del caffè).
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
    apply: () => {
      w.level++;
      if (u.mode === 'add') w.stats[u.stat] += amt;
      else w.stats[u.stat] *= 1 + amt;
      g.recomputeStats();
    },
  };
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
  };
}

function passiveCard(g: Game, id: string, rarity: number): Card {
  const def = PASSIVES[id];
  const owned = g.passives.find((p) => p.id === id);
  let amt = def.amount * TUNING.rarity.mult[rarity];
  if (def.fmt === 'int') amt = Math.max(1, Math.round(amt));
  return {
    icon: def.icon,
    name: def.name,
    tag: owned ? 'Passivo' : 'Nuovo passivo',
    rarity,
    level: owned ? `Lv ${owned.level} → ${owned.level + 1}` : 'Nuovo',
    lines: [`${formatStat(amt, def.fmt)} ${def.description}`],
    apply: () => g.addPassive(id, amt),
  };
}

function fallbackCards(g: Game): Card[] {
  return [
    {
      icon: 'gold',
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
  if (g.weapons.length < TUNING.maxWeapons)
    for (const id of WEAPON_IDS)
      if (!g.weapons.some((w) => w.def.id === id)) options.push({ key: 'n' + id, weight: 0.8, make: () => newWeaponCard(g, id) });
  for (const id of PASSIVE_IDS) {
    const owned = g.passives.find((p) => p.id === id);
    if (owned ? owned.level < PASSIVES[id].maxLevel : g.passives.length < TUNING.maxPassives)
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
