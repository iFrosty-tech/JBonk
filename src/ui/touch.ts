import { TUNING } from '../config/tuning';
import type { Game } from '../game/game';
import type { Input } from '../game/input';

// Controlli touch: joystick sotto il pollice sinistro, camera trascinando con l'altro dito
// (due dita = zoom), pulsanti a schermo per salto, scatto, interazione e pausa.
// Scrivono in Input come fossero tastiera e mouse.

const STICK_R = 56; // corsa del joystick in px
const DEAD = 6; // zona morta al centro
const FULL = STICK_R * 0.55; // da qui in poi si corre a velocità piena
const LOOK_SPEED = 1.6; // px di trascinamento → px di mouse
const PINCH_STEP = 32; // px di pizzico per uno scatto della rotella

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class TouchControls {
  readonly root: HTMLDivElement;
  private stick: HTMLDivElement;
  private knob: HTMLElement;
  private use: HTMLButtonElement;
  private dash: HTMLButtonElement;
  private active = false;
  private stickId: number | null = null;
  private sx = 0;
  private sy = 0;
  /** Dita che girano la camera (con due si fa zoom). */
  private looks: { id: number; x: number; y: number }[] = [];
  private pinch = 0;
  /** Dito → tasto virtuale che sta tenendo premuto. */
  private held = new Map<number, string>();
  private cache = new Map<string, string>();

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
    private readonly onPause: () => void,
  ) {
    this.root = el('div', 'touch-ui', parent);
    this.root.hidden = true;
    this.stick = el('div', 'stick', this.root);
    this.knob = el('i', '', this.stick);
    this.dash = this.button('dash', 'Scatto', 'ShiftLeft');
    this.button('jump', 'Salta', 'Space');
    this.use = this.button('use', 'Usa', 'KeyE');
    this.use.hidden = true;
    const pause = el('button', 'pause', this.root);
    pause.type = 'button';
    pause.setAttribute('aria-label', 'Pausa');
    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onUp);
  }

  private button(cls: string, label: string, key: string) {
    const b = el('button', cls, this.root);
    b.type = 'button';
    b.dataset.key = key;
    b.textContent = label;
    return b;
  }

  private set(key: string, value: string, apply: (v: string) => void) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  /** Ogni frame: i controlli si vedono solo durante il gioco e col touch. */
  update(g: Game | null) {
    const active = !!g && g.mode === 'play' && this.input.touch;
    if (active !== this.active) {
      this.active = active;
      this.root.hidden = !active;
      if (!active) this.reset();
    }
    if (!g || !active) return;
    this.set('use', String(!!g.prompt?.startsWith('[E]')), (v) => (this.use.hidden = v !== 'true'));
    // il pulsante dello scatto si riempie mentre si ricarica
    const cd = Math.max(0, g.player.dashCd / TUNING.dashCooldown).toFixed(2);
    this.set('cd', cd, (v) => this.dash.style.setProperty('--cd', v));
  }

  /** Lascia tutto: dita, tasti virtuali e joystick. */
  private reset() {
    for (const key of this.held.values()) this.input.release(key);
    this.held.clear();
    for (const b of this.root.querySelectorAll('button.on')) b.classList.remove('on');
    this.looks = [];
    this.releaseStick();
  }

  private releaseStick() {
    this.stickId = null;
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.stick.classList.remove('on');
    this.stick.style.removeProperty('--x');
    this.stick.style.removeProperty('--y');
    this.knob.style.transform = '';
  }

  private moveStick(x: number, y: number) {
    let dx = x - this.sx;
    let dy = y - this.sy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // oltre la corsa il joystick insegue il dito, così non si "incastra"
      this.sx = x - (dx * STICK_R) / d;
      this.sy = y - (dy * STICK_R) / d;
      dx = x - this.sx;
      dy = y - this.sy;
    }
    this.stick.style.setProperty('--x', `${this.sx}px`);
    this.stick.style.setProperty('--y', `${this.sy}px`);
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = d > DEAD ? clamp((d - DEAD) / (FULL - DEAD), 0, 1) / d : 0;
    this.input.moveX = dx * k;
    this.input.moveY = -dy * k;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.active || e.pointerType === 'mouse') return;
    e.preventDefault(); // niente eventi mouse emulati, zoom o selezione
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // il dito è già stato rilasciato
    }
    const t = e.target as HTMLElement;
    if (t.closest('.pause')) {
      this.onPause();
      return;
    }
    const btn = t.closest<HTMLElement>('[data-key]');
    if (btn) {
      const key = btn.dataset.key!;
      this.held.set(e.pointerId, key);
      btn.classList.add('on');
      this.input.press(key);
      return;
    }
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (e.clientX < w / 2 && this.stickId === null) {
      // il joystick nasce sotto il pollice, ma non a filo del bordo
      this.stickId = e.pointerId;
      const m = STICK_R + 8;
      this.sx = clamp(e.clientX, m, w - m);
      this.sy = clamp(e.clientY, m, h - m);
      this.stick.classList.add('on');
      this.moveStick(e.clientX, e.clientY);
      return;
    }
    this.looks.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
    if (this.looks.length === 2) this.pinch = this.spread();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.active) return;
    if (e.pointerId === this.stickId) {
      this.moveStick(e.clientX, e.clientY);
      return;
    }
    const l = this.looks.find((l) => l.id === e.pointerId);
    if (!l) return;
    const dx = e.clientX - l.x;
    const dy = e.clientY - l.y;
    l.x = e.clientX;
    l.y = e.clientY;
    if (this.looks.length >= 2) {
      // allargare le dita avvicina la camera
      const d = this.spread();
      this.input.wheel -= (d - this.pinch) / PINCH_STEP;
      this.pinch = d;
    } else {
      this.input.mouseDX += dx * LOOK_SPEED;
      this.input.mouseDY += dy * LOOK_SPEED;
    }
  };

  private onUp = (e: PointerEvent) => {
    const key = this.held.get(e.pointerId);
    if (key) {
      this.held.delete(e.pointerId);
      if (![...this.held.values()].includes(key)) {
        this.input.release(key);
        this.root.querySelector(`[data-key="${key}"]`)?.classList.remove('on');
      }
      return;
    }
    if (e.pointerId === this.stickId) {
      this.releaseStick();
      return;
    }
    this.looks = this.looks.filter((l) => l.id !== e.pointerId);
    if (this.looks.length === 2) this.pinch = this.spread();
  };

  private spread() {
    const [a, b] = this.looks;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
