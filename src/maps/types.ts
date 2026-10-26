// Formato delle mappe reali generate da scripts/map/build_map.py.
// Coordinate di gioco (x verso est, z verso sud) in DECIMI di unità, angoli in millesimi di radiante.

/** Anello di un poligono: x0, z0, x1, z1, … (chiuso implicitamente). */
export type Ring = number[];
/** Poligono: contorno esterno seguito dai buchi. */
export type Poly = Ring[];

/** Aree del terreno, nell'ordine in cui vengono disegnate (dal basso). */
export const AREA_KINDS = ['res', 'farm', 'green', 'forest', 'pitch', 'plaza', 'parking', 'water', 'path', 'walk', 'road'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/** start = sede (si parte qui), lunch = pausa pranzo, coffee = macchinetta del caffè, sign/park = solo insegna. */
export type PoiRole = 'start' | 'lunch' | 'coffee' | 'sign' | 'park';

export interface MapPoi {
  id: string;
  name: string;
  addr: string;
  role: PoiRole;
  /** Sprite del segnaposto che galleggia sopra il locale (solo i punti principali). */
  icon?: string;
  x: number;
  z: number;
  /** Insegna: x, z, angolo della normale della facciata, altezza (0 = su un palo). */
  sign: [number, number, number, number];
  /** Davanti all'ingresso: qui stanno il giocatore all'inizio e gli interattivi. */
  door: [number, number];
  building?: number;
}

export interface MapData {
  meta: {
    name: string;
    source: string;
    office: [number, number];
    centerM: [number, number];
    scale: number; // unità di gioco per metro
    half: number; // metà lato dell'area giocabile
    renderHalf: number; // metà lato dell'area disegnata
    sun: [number, number, number];
  };
  start: [number, number];
  names: string[];
  areas: Record<AreaKind, Poly[]>;
  shadow: Poly[];
  /** [altezza, tipo (0 abitazioni, 1 negozi, 2 scuole e uffici pubblici, 3 chiese, 4 tettoie), ...anelli] */
  buildings: [number, number, ...Ring[]][];
  pools: Poly[];
  /** [classe, indice del nome (-1 = senza nome), flag (1 senso unico, 2 svincolo), x0, z0, x1, z1, …] */
  roads: number[][];
  dashes: number[]; // tratteggio centrale: x, z, angolo
  edges: Ring[]; // linee di bordo delle carreggiate a senso unico
  crossings: number[]; // strisce pedonali: x, z, angolo della strada, larghezza della strada
  stops: number[]; // fermate dell'autobus: x, z, angolo
  lamps: number[]; // lampioni: x, z, angolo verso la strada
  trees: number[]; // alberi: x, z, tipo (0 pino, 1 latifoglia, 2 cipresso, 3 cespuglio), scala in centesimi
  pois: MapPoi[];
}

/** Classi delle strade, nello stesso ordine di ROAD_CODE in build_map.py. */
export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service', 'unknown', 'pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track', 'bridleway'] as const;
