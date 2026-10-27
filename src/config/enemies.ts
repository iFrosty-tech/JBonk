import type { EnemyDef } from './types';

// Valori base al minuto 0 del primo progetto: il gioco li scala nel tempo e per progetto.
const list: EnemyDef[] = [
  { id: 'bug', name: 'Bug', sprite: 'en_bug', hp: 14, speed: 5.0, damage: 6, radius: 0.6, height: 1.3, xp: 1, gold: 0.1 },
  { id: 'email', name: 'Email URGENTE', sprite: 'en_email', hp: 9, speed: 6.4, damage: 5, radius: 0.55, height: 1.2, xp: 1, gold: 0.08, hover: 1.0 },
  { id: 'ticket', name: 'Ticket', sprite: 'en_ticket', hp: 28, speed: 4.2, damage: 9, radius: 0.7, height: 1.9, xp: 2, gold: 0.15 },
  { id: 'meeting', name: 'Riunione', sprite: 'en_meeting', hp: 70, speed: 3.0, damage: 14, radius: 0.9, height: 2.4, xp: 4, gold: 0.25 },
  { id: 'merge', name: 'Merge Conflict', sprite: 'en_merge', hp: 34, speed: 4.6, damage: 10, radius: 0.75, height: 2.0, xp: 2, gold: 0.15 },
  { id: 'leak', name: 'Memory Leak', sprite: 'en_leak', hp: 90, speed: 2.4, damage: 16, radius: 1.0, height: 2.2, xp: 5, gold: 0.3 },
  { id: 'auditor', name: 'Auditor', sprite: 'en_auditor', hp: 45, speed: 3.9, damage: 12, radius: 0.75, height: 2.6, xp: 3, gold: 0.2 },
  { id: 'cr', name: 'Change Request', sprite: 'en_cr', hp: 22, speed: 5.2, damage: 8, radius: 0.65, height: 1.8, xp: 2, gold: 0.12 },

  // Nemico di supporto: compare a tempo (TUNING.call), non nei roster dei biomi
  {
    id: 'call', name: 'Call di Gruppo', sprite: 'en_call', hp: 80, speed: 3.4, damage: 5, radius: 0.6, height: 2, xp: 3, gold: 0.2, hover: 1.2,
    aura: { radius: 6, reduction: 0.3, delay: 1 },
  },

  // Élite ("guardiani"): lasciano un forziere gratis
  { id: 'scope', name: 'Scope Creep', sprite: 'en_scope', hp: 650, speed: 3.6, damage: 22, radius: 1.8, height: 4.6, xp: 40, gold: 1, kind: 'elite' },
  { id: 'legacy', name: 'Codice Legacy', sprite: 'en_legacy', hp: 800, speed: 3.0, damage: 26, radius: 1.8, height: 4.6, xp: 45, gold: 1, kind: 'elite' },
  { id: 'deadline', name: 'Deadline', sprite: 'en_deadline', hp: 700, speed: 4.2, damage: 24, radius: 1.7, height: 4.4, xp: 45, gold: 1, kind: 'elite' },

  // Boss: uno per progetto
  {
    id: 'cliente', name: 'Il Cliente', sprite: 'boss_cliente', hp: 4200, speed: 4.4, damage: 30, radius: 2.4, height: 7.5, xp: 150, gold: 1, kind: 'boss',
    boss: { shotEvery: 3.2, shots: 10, shotSpeed: 11, chargeEvery: 6.5, projectile: 'proj_cr', quote: '"Solo una piccola modifica, veloce veloce…"' },
  },
  {
    id: 'monolito', name: 'Il Monolite COBOL', sprite: 'boss_monolito', hp: 6500, speed: 3.4, damage: 36, radius: 2.8, height: 8.5, xp: 200, gold: 1, kind: 'boss',
    boss: { shotEvery: 2.6, shots: 14, shotSpeed: 10, chargeEvery: 8, projectile: 'proj_punch', quote: '"Funziono dal 1987. Non toccatemi."' },
  },
  {
    id: 'audit', name: 'L\'Audit Annuale', sprite: 'boss_audit', hp: 9000, speed: 4.0, damage: 40, radius: 2.6, height: 8, xp: 260, gold: 1, kind: 'boss',
    boss: { shotEvery: 2.2, shots: 16, shotSpeed: 12, chargeEvery: 5.5, projectile: 'proj_x', quote: '"Mi mostri le evidenze, prego."' },
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
