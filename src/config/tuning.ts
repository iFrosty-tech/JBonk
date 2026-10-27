// Numeri di bilanciamento in un unico posto.
export const TUNING = {
  arenaHalf: 100, // l'arena è 200x200 unità
  stageSeconds: 360, // 6 minuti reali = una giornata 09:00 → 18:00
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 18 * 60,
  playerSpeed: 8,
  playerRadius: 0.6,
  jumpVelocity: 10,
  gravity: 28,
  dashSpeed: 24,
  dashTime: 0.18,
  dashCooldown: 1.4,
  stillDelay: 0.4, // secondi senza input di movimento per entrare in INSERT (Scorciatoie di Vim)
  hurtInvuln: 0.45,
  pickupRadius: 4.5,
  maxWeapons: 4,
  maxPassives: 4,
  spawnDistance: [30, 42] as const,
  baseSpawnRate: 0.9, // nemici al secondo a inizio giornata
  spawnRateGrowth: 0.014, // +nemici/s per ogni secondo
  maxEnemies: 280,
  eliteEvery: 80, // secondi
  // Nemici a tempo, come gli élite e mai col boss in campo. Valori per progetto giocato (1°, 2°, 3°):
  // con meno valori vale l'ultimo. `every` ± `jitter` secondi tra uno spawn e il successivo; al limite di vivi si salta un giro.
  timed: [
    { enemy: 'call', first: [75, 60, 45], every: [40, 35, 30], jitter: 0, maxAlive: [2, 2, 3] }, // Call di Gruppo
    { enemy: 'update', first: [90], every: [30], jitter: 5, maxAlive: [2] }, // Aggiornamento
  ],
  call: {
    headsetMax: 40, // cuffiette disegnate al massimo per frame
  },
  update: {
    lockTime: 6, // secondi in aggiornamento per l'arma colpita
    truce: 8, // secondi senza nuovi blocchi dopo un riavvio
  },
  swarmAt: [120, 240],
  chestCount: 7,
  shrineCount: 3,
  chestBaseCost: 12,
  shrineChargeTime: 2.5,
  lunchTime: 2, // secondi al tavolino per la pausa pranzo
  lunchHeal: 0.5, // frazione degli HP massimi recuperata
  clinicCount: 2, // presidi GPI per progetto
  clinicStock: 80, // HP che un presidio può erogare
  clinicRate: 16, // HP al secondo
  clinicRadius: 3.6,
  nghCount: 2, // totem NGH per progetto
  nghFreeze: 6, // secondi "in lista d'attesa" (boss: un terzo)
  nghRadius: 60, // fin dove arriva l'onda del radar
  nghWaveSpeed: 45,
  stagesToWin: 3,
  rarity: {
    names: ['Bassa', 'Media', 'Alta', 'Bloccante'],
    weights: [62, 25, 10, 3],
    mult: [1, 1.35, 1.75, 2.3],
  },
};

/** XP necessaria per passare dal livello `level` al successivo. */
export function xpForLevel(level: number): number {
  const l = level - 1;
  return Math.round(5 + l * 5 + l * l * 0.55);
}
