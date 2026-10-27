import type { BuffDef, PassiveDef } from './types';

// "Tomi" alla Megabonk: occupano uno slot e salgono di livello.
const list: PassiveDef[] = [
  { id: 'caffe', name: 'Caffè Doppio', description: 'Velocità di movimento', icon: 'ic_coffee', stat: 'moveSpeed', amount: 0.08, fmt: 'pct', maxLevel: 5 },
  { id: 'scrum', name: 'Certificazione Scrum', description: 'Velocità d\'attacco', icon: 'ic_scrum', stat: 'attackSpeed', amount: 0.1, fmt: 'pct', maxLevel: 5 },
  { id: 'cloud', name: 'Certificazione Cloud', description: 'Danno', icon: 'ic_cloud', stat: 'damage', amount: 0.12, fmt: 'pct', maxLevel: 5 },
  { id: 'smart', name: 'Smart Working', description: 'Raggio di raccolta', icon: 'ic_home', stat: 'pickupRange', amount: 0.25, fmt: 'pct', maxLevel: 5 },
  { id: 'sedia', name: 'Sedia Ergonomica', description: 'HP massimi', icon: 'ic_chair', stat: 'maxHp', amount: 20, fmt: 'int', maxLevel: 5 },
  { id: 'test', name: 'Unit Test', description: 'Armatura', icon: 'ic_test', stat: 'armor', amount: 1, fmt: 'int', maxLevel: 5 },
  { id: 'cv', name: 'CV Aggiornato', description: 'Esperienza guadagnata', icon: 'ic_cv', stat: 'xpGain', amount: 0.12, fmt: 'pct', maxLevel: 5 },
  { id: 'cornetto', name: 'Cornetto delle 10', description: 'Rigenerazione HP/s', icon: 'ic_croissant', stat: 'regen', amount: 0.6, fmt: 'num', maxLevel: 5 },
  { id: 'lavagna', name: 'Lavagna Bianca', description: 'Area degli attacchi', icon: 'ic_board', stat: 'area', amount: 0.12, fmt: 'pct', maxLevel: 5 },
  { id: 'review', name: 'Code Review', description: 'Probabilità di critico', icon: 'ic_review', stat: 'critChance', amount: 0.05, fmt: 'pct', maxLevel: 5 },
  { id: 'multitask', name: 'Multitasking', description: 'Proiettili extra', icon: 'ic_multi', stat: 'projectiles', amount: 1, fmt: 'int', maxLevel: 3 },
  // fermo = INSERT (velocità d'attacco), in movimento = NORMAL (velocità); la carta mostra le due righe di `modes`
  {
    id: 'vim', name: 'Scorciatoie di Vim', description: 'Per uscire: :q! (in teoria)', icon: 'ic_vim',
    stat: 'attackSpeed', amount: 0.12, fmt: 'pct', maxLevel: 5,
    modes: {
      still: { stat: 'attackSpeed', amount: 0.12, line: 'Fermo: {v} Velocità d\'attacco' },
      moving: { stat: 'moveSpeed', amount: 0.05, line: 'In movimento: {v} Velocità' },
    },
  },
];

export const PASSIVES: Record<string, PassiveDef> = Object.fromEntries(list.map((p) => [p.id, p]));
export const PASSIVE_IDS = list.map((p) => p.id);

// Macchinetta del caffè: ogni bevanda è un bonus permanente.
export const BUFFS: BuffDef[] = [
  { id: 'ristretto', name: 'Ristretto', icon: 'ic_coffee', stat: 'damage', amount: 0.07, fmt: 'pct', label: 'Danno' },
  { id: 'espresso', name: 'Espresso Doppio', icon: 'ic_coffee', stat: 'attackSpeed', amount: 0.07, fmt: 'pct', label: 'Velocità d\'attacco' },
  { id: 'cappuccino', name: 'Cappuccino', icon: 'ic_coffee', stat: 'maxHp', amount: 12, fmt: 'int', label: 'HP massimi' },
  { id: 'ginseng', name: 'Caffè al Ginseng', icon: 'ic_coffee', stat: 'moveSpeed', amount: 0.05, fmt: 'pct', label: 'Velocità' },
  { id: 'macchiato', name: 'Macchiato', icon: 'ic_coffee', stat: 'critChance', amount: 0.03, fmt: 'pct', label: 'Critico' },
  { id: 'americano', name: 'Americano', icon: 'ic_coffee', stat: 'area', amount: 0.07, fmt: 'pct', label: 'Area' },
  { id: 'marocchino', name: 'Marocchino', icon: 'ic_coffee', stat: 'xpGain', amount: 0.08, fmt: 'pct', label: 'Esperienza' },
  { id: 'corretto', name: 'Caffè Corretto', icon: 'ic_coffee', stat: 'armor', amount: 1, fmt: 'int', label: 'Armatura' },
];
