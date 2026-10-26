import * as THREE from 'three';
import { CHARACTERS } from './config/characters';
import { BIOMES } from './config/biomes';
import { Audio } from './game/audio';
import { Game, type GameHooks } from './game/game';
import { Input } from './game/input';
import { Atlas } from './render/atlas';
import { Hud } from './ui/hud';
import { Screens, type TitleChoice } from './ui/screens';

// Collega renderer, input, HUD, schermate e la partita in corso.

const STORE_KEY = 'officebonk:selection';

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
  readonly atlas: Atlas;
  readonly input: Input;
  readonly audio = new Audio();
  readonly screens: Screens;
  game: Game | null = null;
  hud: Hud | null = null;
  private selection = loadSelection();
  private last = performance.now();
  private readonly debug = location.hash === '#debug';

  constructor(private readonly root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const canvas = this.renderer.domElement;
    canvas.className = 'game';
    root.appendChild(canvas);
    this.atlas = new Atlas();
    this.input = new Input(canvas);
    this.screens = new Screens(root, this.atlas);

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
    this.hud = new Hud(this.root, this.atlas);
    const { clientWidth: w, clientHeight: h } = this.root;
    this.game = new Game(this.atlas, CHARACTERS[c.character], c.biome, this.input, this.audio, this.hooks, w / Math.max(1, h));
    this.input.requestLock();
    this.last = performance.now();
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
    );
  }

  private resume() {
    if (!this.game || this.game.mode !== 'paused') return;
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
  };

  private resize = () => {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.renderer.setSize(w, h, false);
    if (this.game) {
      this.game.camera.aspect = w / Math.max(1, h);
      this.game.camera.updateProjectionMatrix();
    }
  };

  private loop = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    const g = this.game;
    if (g) {
      g.update(dt);
      g.draw(this.renderer);
      this.hud?.update(g, this.input.locked);
    }
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  };
}
