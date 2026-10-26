// Tastiera + mouse, oppure touch. La camera si gira col mouse (pointer lock se disponibile,
// altrimenti trascinando). Col touch joystick e pulsanti a schermo (ui/touch.ts) scrivono
// qui dentro come se fossero tasti e mouse: il gioco non vede la differenza.

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** Joystick virtuale, da -1 a 1: x verso destra, y in avanti. */
  moveX = 0;
  moveY = 0;
  /** Si sta giocando col touch: niente pointer lock, compaiono i controlli a schermo. */
  touch = matchMedia('(pointer: coarse)').matches;
  onTouchChange: (() => void) | null = null;
  private dragging = false;
  locked = false;
  onLockLost: (() => void) | null = null;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('wheel', this.onWheel, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    // l'ultimo puntatore usato decide (portatili col touchscreen, tablet col mouse)
    window.addEventListener('pointerdown', this.onPointer, true);
    window.addEventListener('pointermove', this.onPointer, true);
  }

  down(code: string) {
    return this.keys.has(code);
  }

  /** Vero solo nel frame in cui il tasto è stato premuto. */
  hit(code: string) {
    return this.pressed.has(code);
  }

  /** Tasto premuto anche da un pulsante a schermo. */
  press(code: string) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  release(code: string) {
    this.keys.delete(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  requestLock() {
    if (this.touch || this.locked || !this.el.requestPointerLock) return;
    try {
      const r = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // pointer lock non disponibile (iframe, mobile): si usa il trascinamento
    }
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    this.press(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
  };
  private onMouseDown = (e: MouseEvent) => {
    this.dragging = true;
    if (e.button === 0) this.pressed.add('Mouse0');
  };
  private onMouseUp = () => {
    this.dragging = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.locked || this.dragging) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };
  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.el;
    if (was && !this.locked) this.onLockLost?.();
  };
  private onPointer = (e: PointerEvent) => {
    if (!e.pointerType) return;
    const touch = e.pointerType !== 'mouse';
    if (touch === this.touch) return;
    // il browser manda finti movimenti del mouse quando la pagina cambia sotto il cursore
    if (!touch && e.type === 'pointermove' && !e.movementX && !e.movementY) return;
    this.touch = touch;
    if (touch) this.releaseLock();
    this.onTouchChange?.();
  };
}
