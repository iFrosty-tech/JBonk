import type { Frame } from '../render/atlas';
import type { Place } from '../render/world';
import type { EnemyDef } from '../config/types';

export interface Player {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  face: number;
  hp: number;
  invuln: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashZ: number;
  moving: boolean;
  anim: number;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  frame: Frame;
  anim: Frame[] | null; // se lo sprite ha più fotogrammi, gira in loop (es. le onde della Call di Gruppo)
  x: number;
  y: number;
  z: number;
  kx: number; // velocità di knockback
  kz: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  height: number;
  flash: number;
  face: number;
  phase: number;
  alive: boolean;
  frozen: number; // secondi rimasti "in lista d'attesa" (totem NGH)
  lost: number; // secondi passati senza strada verso il giocatore (es. in un cortile chiuso)
  reduction: number; // quota di danno tolta perché è "in call" (anello di una Call di Gruppo), 0 = nessuna
  auraT: number; // solo nemici con aura: secondi prima che l'anello si apra
  elite: boolean;
  boss: boolean;
  // solo boss
  shotT: number;
  chargeT: number;
  telegraph: number;
  charging: number;
  cx: number;
  cz: number;
}

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  pierce: number;
  radius: number;
  life: number;
  frame: Frame;
  anim: Frame[] | null; // se presente, lo sprite gira in loop
  size: number;
  rot: number;
  spin: number;
  split: number; // al primo impatto si divide in tanti frammenti (arma 'split')
  hits: number[];
  weapon: string;
  knock: number;
  alive: boolean;
}

export type PickupKind = 'xp' | 'gold' | 'heal' | 'magnet' | 'card';

export interface Pickup {
  kind: PickupKind;
  value: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  magnet: boolean;
  pull: number;
  alive: boolean;
  frame: Frame;
  anim: Frame[] | null; // se presente, lo sprite gira in loop
  size: number;
  t: number;
}

export type InteractKind = 'chest' | 'shrine' | 'altar' | 'portal' | 'clinic' | 'ngh' | 'joscar' | 'lunch';

export interface Interactable {
  kind: InteractKind;
  x: number;
  y: number;
  z: number;
  used: boolean;
  charge: number; // macchinetta e pranzo: secondi di attesa; presidio: HP già erogati
  free: boolean;
  place?: Place; // il locale della mappa (bar, ristorante) in cui si trova
}

export interface Fx {
  frame: Frame;
  anim: Frame[] | null; // se presente, l'animazione dura quanto l'effetto
  fps: number; // se > 0, l'animazione gira in loop a questa velocità
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size0: number;
  size1: number;
  life: number;
  max: number;
  rot: number;
  spin: number;
  gravity: number;
  alpha: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  z: number;
  text: string;
  life: number;
  crit: boolean;
  color: string;
  small: boolean; // colpo su un nemico in call: l'HUD lo disegna più piccolo
}

export interface Card {
  icon: string;
  name: string;
  tag: string;
  rarity: number;
  level: string;
  lines: string[];
  apply: () => void;
  /** Upgrade di un'arma che era in aggiornamento quando è uscita la carta: l'icona porta il glifo ⟳. */
  updating?: boolean;
  /** Loadout budget, solo su arma o passivo nuovo: "RAM 3 → 6/9" = res, amount, after/max. */
  cost?: { res: Resource; amount: number; after: number; max: number };
  /** Loadout budget, solo sul premio del JOscar che allarga una risorsa: "RAM 9 → 10". */
  bonus?: { res: Resource; from: number; to: number };
}

/** Risorse del loadout budget: RAM per le armi, CPU per i passivi. */
export type Resource = 'ram' | 'cpu';

/** Una risorsa del loadout budget: quanta ne occupano gli oggetti installati e quanta ce n'è. */
export interface Budget {
  used: number;
  max: number;
}

/** Barre e riga "insufficiente" nella finestra delle carte (solo con il loadout budget). */
export interface ChoiceBudget {
  ram: Budget;
  cpu: Budget;
  /** Risorse per cui il filtro ha escluso almeno un'arma o un passivo nuovo, RAM prima di CPU (vuoto = nessuna riga). */
  short: Resource[];
}

export interface ChoiceRequest {
  title: string;
  subtitle: string;
  cards: Card[];
  skipLabel: string | null;
  onSkip?: () => void;
  /** Solo con il loadout budget e solo per le carte di upgradeCards (level-up, forzieri, JOscar). */
  budget?: ChoiceBudget;
}
