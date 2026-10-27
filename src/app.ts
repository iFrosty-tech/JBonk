import * as THREE from 'three';
import { CHARACTERS } from './config/characters';
import { BIOMES } from './config/biomes';
import { PASSIVES } from './config/passives';
import { TUNING } from './config/tuning';
import { WEAPONS, WEAPON_IDS } from './config/weapons';
import { Audio } from './game/audio';
import { Game, type GameHooks } from './game/game';
import { Input } from './game/input';
import type { Atlas } from './render/atlas';
import { Hud } from './ui/hud';
import { Screens, type TitleChoice } from './ui/screens';
import { TouchControls } from './ui/touch';

// Collega renderer, input, HUD, schermate e la partita in corso.

const STORE_KEY = 'jbonk:selection';

function loadSelection(): TitleChoice {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as TitleChoice;
      if (CHARACTERS[v.character] && BIOMES[v.biome]) return v;
    }
  } catch {
    // storage non disponibile
  }
  return { character: 0, biome: 0 };
}

function saveSelection(v: TitleChoice) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    // ignorato
  }
}

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  readonly audio = new Audio();
  readonly screens: Screens;
  readonly touch: TouchControls;
  game: Game | null = null;
  hud: Hud | null = null;
  private selection = loadSelection();
  private last = performance.now();
  private readonly debug = location.hash === '#debug';

  constructor(
    private readonly root: HTMLElement,
    readonly atlas: Atlas,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const canvas = this.renderer.domElement;
    canvas.className = 'game';
    root.appendChild(canvas);
    this.input = new Input(canvas);
    // sui telefoni meno pixel: lo schermo è piccolo e la GPU pure
    this.renderer.setPixelRatio(Math.min(this.input.touch ? 1.5 : 2, window.devicePixelRatio || 1));
    this.touch = new TouchControls(root, this.input, () => this.pause());
    this.screens = new Screens(root, this.atlas);
    const touchMode = () => root.classList.toggle('touch', this.input.touch);
    this.input.onTouchChange = touchMode;
    touchMode();

    this.input.onLockLost = () => {
      if (this.game?.mode === 'play') this.pause();
    };
    canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (this.game?.mode === 'play') this.input.requestLock();
    });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game?.mode === 'play') this.pause();
    });
    this.resize();
    this.showTitle();
    requestAnimationFrame(this.loop);
  }

  private hooks: GameHooks = {
    choice: (req) =>
      this.screens.choice(req, () => {
        this.game?.resolveChoice();
        this.input.requestLock();
      }),
    over: (res) => {
      setTimeout(() => {
        if (this.game?.mode !== 'over') return;
        this.screens.over(
          res,
          () => this.startRun(this.selection),
          () => this.showTitle(),
        );
      }, 700);
    },
    banner: (text, tone) => this.hud?.banner(text, tone),
    stage: (biome, stage) => this.hud?.stage(biome, stage),
  };

  private showTitle() {
    this.endGame();
    this.screens.title(this.selection, (c) => {
      this.selection = c;
      saveSelection(c);
      this.startRun(c);
    });
  }

  private endGame() {
    this.input.releaseLock();
    this.game?.dispose();
    this.game = null;
    this.hud?.root.remove();
    this.hud = null;
  }

  startRun(c: TitleChoice) {
    this.endGame();
    this.screens.close();
    this.audio.unlock();
    if (this.input.touch) this.fullscreen();
    this.hud = new Hud(this.root, this.atlas);
    const { clientWidth: w, clientHeight: h } = this.root;
    this.game = new Game(this.atlas, CHARACTERS[c.character], c.biome, this.input, this.audio, this.hooks, w / Math.max(1, h));
    this.input.requestLock();
    this.last = performance.now();
  }

  /** Sul telefono si gioca a schermo intero, dove il browser lo permette (non su iPhone né in un iframe). */
  private fullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    try {
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch {
      // ignorato
    }
  }

  private pause() {
    const g = this.game;
    if (!g || g.mode !== 'play') return;
    g.mode = 'paused';
    this.input.releaseLock();
    this.screens.pause(
      () => this.resume(),
      () => this.startRun(this.selection),
      () => this.showTitle(),
      this.audio,
      { ram: g.ram, cpu: g.cpu }, // barre del loadout in pausa (le mostra solo col budget)
    );
  }

  private resume() {
    if (!this.game || this.game.mode !== 'paused') return;
    this.audio.unlock(); // su iPhone l'audio si sospende quando si esce dall'app
    this.screens.close();
    this.game.mode = 'play';
    this.input.requestLock();
  }

  private onKey = (e: KeyboardEvent) => {
    this.audio.unlock();
    const g = this.game;
    if (e.code === 'KeyM') this.hud?.banner(this.audio.toggle() ? 'Audio disattivato' : 'Audio attivo', 'info');
    if (!g) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && g.mode === 'play') this.pause();
    if (!this.debug || g.mode !== 'play') return;
    // scorciatoie di test (aprire la pagina con #debug)
    if (e.code === 'KeyL') g.xp = g.xpNext;
    if (e.code === 'KeyB') g.spawnBoss();
    if (e.code === 'KeyG') {
      g.god = !g.god;
      this.hud?.banner(g.god ? 'Invincibile' : 'Mortale', 'info');
    }
    if (e.code === 'KeyK') for (const en of g.enemies) g.damageEnemy(en, 1e6, null, 0, 0);
    if (e.code === 'KeyT') g.stageTime += 60;
    if (e.code === 'KeyO') g.gold += 100;
    if (e.code === 'KeyN') {
      // aggiunge un'arma che non hai, partendo dalle ultime inserite
      const id = [...WEAPON_IDS].reverse().find((w) => !g.weapons.some((x) => x.def.id === w));
      if (id) {
        g.addWeapon(id);
        this.hud?.banner(`Arma di test: ${WEAPONS[id].name}`, 'info');
      }
    }
    if (e.code === 'KeyV') this.debugVim(g);
    // loadout budget: +1 RAM e +1 CPU (non conta per il limite dei premi del JOscar)
    if (e.code === 'KeyR' && TUNING.loadout === 'budget') {
      g.addBudget('ram', 1);
      g.addBudget('cpu', 1);
      this.hud?.banner(`RAM ${g.ram.max} · CPU ${g.cpu.max}`, 'info');
    }
    // una Call di Gruppo 8 unità davanti (rispetta il limite di call vive)
    if (e.code === 'KeyY') g.spawnTimed('call', g.player.x + g.rig.forward.x * 8, g.player.z + g.rig.forward.z * 8);
    // un Aggiornamento 8 unità davanti (anche oltre il limite di vivi: serve per provarne due di fila)
    if (e.code === 'KeyU') g.spawnTimed('update', g.player.x + g.rig.forward.x * 8, g.player.z + g.rig.forward.z * 8, true);
    if (e.code === 'KeyC') g.spawnPickup('card', 15, g.player.x + g.rig.forward.x * 4, g.player.z + g.rig.forward.z * 4);
    if (e.code === 'KeyF') g.startWave(g.player.x, g.player.z);
    if (e.code === 'KeyJ') {
      const x = g.player.x + g.rig.forward.x * 5;
      const z = g.player.z + g.rig.forward.z * 5;
      g.interactables.push({ kind: 'joscar', x, z, y: g.world.height(x, z), used: false, charge: 0, free: true });
    }
  };

  /** `#debug` + V: dà Scorciatoie di Vim al livello 1, poi lo fa salire di un livello fino al massimo. */
  private debugVim(g: Game) {
    const def = PASSIVES.vim;
    const owned = g.passives.find((p) => p.id === def.id);
    const block = owned ? null : g.installBlock('cpu', def.id);
    if (owned && owned.level >= def.maxLevel) this.hud?.banner(`${def.name}: livello massimo`, 'info');
    else if (block) this.hud?.banner(block === 'cpu' ? 'CPU insufficiente' : 'Slot dei passivi pieni', 'warn');
    else {
      g.addPassive(def.id, def.amount);
      this.hud?.banner(`Passivo di test: ${def.name} Lv ${owned ? owned.level : 1}`, 'info');
    }
  }

  private resize = () => {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.renderer.setSize(w, h, false);
    this.game?.rig.setAspect(w / Math.max(1, h));
  };

  private loop = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    const g = this.game;
    if (g) {
      g.update(dt);
      g.draw(this.renderer);
      this.hud?.update(g);
    }
    this.touch.update(g);
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  };
}
