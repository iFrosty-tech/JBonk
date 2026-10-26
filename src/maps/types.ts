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

export interface MapBuilding {
  h: number; // altezza
  k: number; // tipo: 0 abitazioni, 1 negozi, 2 scuole e uffici pubblici, 3 chiese, 4 tettoie
  s: number; // stile della facciata, indice di FACADES in render/city.ts
  r: number; // tetto: 0 lastrico solare, 1 coppi, 2 cupola, 3 pensilina, 4 lamiera
  rc: number; // colore del tetto, 0xRRGGBB
  wc: number; // colore dei muri, 0xRRGGBB
  /** Lati del contorno esterno (lato i: dal vertice i al successivo) con vetrine al piano terra. */
  shop?: number[];
  /** Tetto a padiglione sul rettangolo che contiene la pianta: x, z, angolo del lato lungo, lunghezza, larghezza. */
  hip?: [number, number, number, number, number];
  /** Pensilina di un distributore: sotto ci sono le pompe. */
  fuel?: 1;
  rings: Ring[];
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
  /** Colore del suolo misurato dalla Sentinel-2: n×n celle RGB (base64), riga 0 a nord, colonna 0 a ovest. */
  tint: { n: number; data: string };
  buildings: MapBuilding[];
  /** Campi sportivi: tipo (0 tennis in terra rossa, 1 tennis in resina, 2 padel, 3 calcetto), x, z, angolo del lato lungo, lunghezza, larghezza. */
  courts: number[];
  pools: Poly[];
  /** [classe, indice del nome (-1 = senza nome), flag (1 senso unico, 2 svincolo), x0, z0, x1, z1, …] */
  roads: number[][];
  dashes: number[]; // tratteggio centrale: x, z, angolo
  edges: Ring[]; // linee di bordo delle carreggiate a senso unico
  crossings: number[]; // strisce pedonali: x, z, angolo della strada, larghezza della strada
  stops: number[]; // fermate dell'autobus: x, z, angolo
  lamps: number[]; // lampioni: x, z, angolo verso la strada
  trees: number[]; // alberi: x, z, tipo (0 pino domestico, 1 latifoglia, 2 cipresso, 3 arbusto, 4 olivo), altezza, raggio della chioma
  pois: MapPoi[];
}

/** Classi delle strade, nello stesso ordine di ROAD_CODE in build_map.py. */
export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service', 'unknown', 'pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track', 'bridleway'] as const;
