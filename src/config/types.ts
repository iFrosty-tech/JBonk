// Tipi condivisi da tutti i file di configurazione.
// Per aggiungere un progetto/bioma, un nemico o un'arma basta aggiungere un oggetto
// che rispetti queste interfacce nei rispettivi file di config.

export type SpriteId = string;

export interface Stats {
  maxHp: number;
  regen: number; // HP al secondo
  armor: number; // riduzione piatta del danno subito
  moveSpeed: number; // moltiplicatore
  damage: number; // moltiplicatore
  attackSpeed: number; // moltiplicatore (divide i cooldown)
  area: number; // moltiplicatore
  projectiles: number; // proiettili extra
  projSpeed: number; // moltiplicatore
  duration: number; // moltiplicatore
  pickupRange: number; // moltiplicatore del raggio di raccolta
  xpGain: number; // moltiplicatore
  goldGain: number; // moltiplicatore
  critChance: number; // 0..1
  critDamage: number; // moltiplicatore del critico
  luck: number; // aumenta la rarità delle carte
}
export type StatKey = keyof Stats;

/** Come mostrare un valore: percentuale, numero con decimali o intero. */
export type StatFormat = 'pct' | 'num' | 'int';

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  description: string;
  sprite: SpriteId;
  companion: SpriteId;
  companionName: string;
  startWeapon: string;
  bonus: Partial<Stats>;
  bonusText: string;
}

export interface BossPattern {
  shotEvery: number; // secondi tra una raffica e l'altra
  shots: number; // proiettili per raffica (a raggiera)
  shotSpeed: number;
  chargeEvery: number; // secondi tra una carica e l'altra
  projectile: SpriteId;
  quote: string; // frase mostrata quando compare
}

/** Aura di un nemico di supporto (Call di Gruppo): i nemici normali dentro l'anello subiscono meno danno. */
export interface EnemyAura {
  radius: number; // raggio dell'anello (unità mondo)
  reduction: number; // 0..1, quota di danno tolta; più anelli non si sommano
  delay: number; // secondi dallo spawn prima che l'anello si apra
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: SpriteId;
  hp: number;
  speed: number;
  damage: number;
  radius: number; // raggio di collisione
  height: number; // altezza a schermo (unità mondo)
  xp: number;
  gold: number; // probabilità di lasciare buoni pasto
  hover?: number; // se vola, a che altezza
  kind?: 'normal' | 'elite' | 'boss';
  boss?: BossPattern;
  /** Solo nemici di supporto: protegge i nemici normali vicini. Mai su élite, boss o altri nemici con aura. */
  aura?: EnemyAura;
  /** Effetto al contatto col giocatore oltre al danno (Aggiornamento). Lo scatto lo evita, `G` e armatura no. */
  onTouch?: EnemyTouch;
  /** Sprite animato: fotogrammi al secondo del loop (default 8). */
  fps?: number;
  /** Segnale fermo sopra il nemico, per riconoscerlo in mezzo all'orda (Aggiornamento). */
  badge?: EnemyBadge;
}

/** Sprite disegnato sopra un nemico finché è vivo. */
export interface EnemyBadge {
  sprite: SpriteId;
  y: number; // quota della base dello sprite, da terra (unità mondo)
  size: number; // altezza a schermo (unità mondo)
}

/** Effetto di un nemico quando tocca il giocatore. */
export interface EnemyTouch {
  lockWeapon: boolean; // mette in aggiornamento un'arma (regole e durate in TUNING.update)
  consume: boolean; // sparisce al contatto, senza XP né drop
  fx?: SpriteId; // effetto quando si consuma (es. un lampo)
}

export type PropType =
  | 'desk'
  | 'plant'
  | 'cooler'
  | 'cubicle'
  | 'printer'
  | 'whiteboard'
  | 'sofa'
  | 'rack'
  | 'crac'
  | 'cabletray'
  | 'column'
  | 'counter'
  | 'tree'
  | 'bench';

export interface BiomeDef {
  id: string;
  project: string; // nome del progetto (es. "Progetto Phoenix")
  place: string; // ambientazione (es. "Open Space")
  /** Mappa reale (src/maps) in cui si svolge il progetto. Senza, l'arena è generata da terrain e props. */
  map?: string;
  client: string;
  description: string;
  palette: {
    tileA: string;
    tileB: string;
    hill: string;
    sky: string;
    fog: string;
    wall: string;
    accent: string;
  };
  fogDensity: number;
  terrain: { amplitude: number; frequency: number; tile: number };
  props: { type: PropType; count: number }[];
  /** Nemici del bioma: compaiono da `from` secondi in poi, con peso `weight`. */
  enemies: { id: string; from: number; weight: number }[];
  elite: string;
  boss: string;
  swarm: string; // nemico usato negli eventi "sciame"
  swarmName: string; // annuncio dell'evento sciame
}

export interface WeaponStats {
  damage: number;
  cooldown: number;
  count: number;
  area: number;
  speed: number;
  pierce: number;
  duration: number;
  range: number;
  knockback: number;
}
export type WeaponStatKey = keyof WeaponStats;

export interface UpgradeDef {
  stat: WeaponStatKey;
  amount: number;
  mode: 'add' | 'mul'; // mul: amount è una percentuale (es. -0.08 = -8%)
  label: string;
  int?: boolean;
}

export type WeaponKind =
  | 'projectile'
  | 'orbit'
  | 'aura'
  | 'radial'
  | 'strike'
  | 'chain'
  | 'minion'
  | 'lob'
  | 'boomerang' // va e torna, colpendo all'andata e al ritorno
  | 'split' // al primo impatto si divide in `pierce` frammenti
  | 'swarm'; // un alveare di celle che si staccano e inseguono i nemici

export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  kind: WeaponKind;
  icon: SpriteId;
  sprite: SpriteId;
  base: WeaponStats;
  upgrades: UpgradeDef[];
  maxLevel: number;
  /** Altezza a schermo dello sprite (unità mondo, prima del moltiplicatore d'area). */
  scale?: number;
  /** Solo 'orbit': gli oggetti in orbita distruggono i proiettili nemici. */
  blocks?: boolean;
}

/** Effetto di un passivo valido solo in una modalità (es. fermo o in movimento). */
export interface PassiveMode {
  stat: StatKey;
  amount: number; // per livello, prima della rarità
  /** Riga d'effetto della carta: `{v}` diventa il valore formattato (es. "+12%"). */
  line: string;
}

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  icon: SpriteId;
  stat: StatKey;
  amount: number;
  fmt: StatFormat;
  maxLevel: number;
  /**
   * Passivo a due modalità (Scorciatoie di Vim): al posto di `stat` vale l'effetto della modalità attiva.
   * `still` = nessun input di movimento da `TUNING.stillDelay` secondi, `moving` = altrimenti.
   * `stat` e `amount` restano la base della scala: ogni modalità vale `amount` della modalità × (valore accumulato / `amount`).
   */
  modes?: { still: PassiveMode; moving: PassiveMode };
}

/** Bonus della macchinetta del caffè: non occupano slot. */
export interface BuffDef {
  id: string;
  name: string;
  icon: SpriteId;
  stat: StatKey;
  amount: number;
  fmt: StatFormat;
  label: string;
}
