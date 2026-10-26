// Utilità condivise per catturare screenshot e GIF del gioco in modo deterministico.
// Il tempo del browser è virtuale: ogni fotogramma avanza il gioco di `dt` secondi,
// quindi le GIF restano fluide anche se il rendering headless (SwiftShader) è lento.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// require() invece di import: trova Playwright anche se installato globalmente (NODE_PATH)
const { chromium } = createRequire(import.meta.url)('playwright');

export const URL = process.env.JBONK_URL ?? 'http://localhost:5173/#debug';

// sostituisce requestAnimationFrame e performance.now con un orologio manuale
const VIRTUAL_CLOCK = `(() => {
  let now = 0;
  let queue = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms) => {
    now += ms;
    const cbs = queue;
    queue = [];
    for (const cb of cbs) cb(now);
  };
})();`;

export async function launch(opts) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  return { browser, page: await openGame(browser, opts) };
}

/** Apre il gioco in una nuova pagina (`context`: opzioni extra di Playwright, es. emulazione telefono). */
export async function openGame(browser, { width = 1280, height = 720, scale = 1, context = {} } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, ...context });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.setDefaultTimeout(120_000);
  await page.addInitScript(VIRTUAL_CLOCK);
  await page.goto(URL);
  await ready(page);
  return page;
}

/** Ricarica la pagina: ogni scena parte pulita (SwiftShader rallenta se si accumulano partite). */
export async function reload(page) {
  await page.reload();
  await ready(page);
}

async function ready(page) {
  await page.waitForFunction(() => window.jbonk);
  await page.evaluate(async () => {
    await document.fonts.ready;
    // con il dev server di Vite i moduli del gioco si importano anche dalla pagina (stessa istanza)
    window.__enemies = (await import('/src/config/enemies.ts')).ENEMIES;
  });
  await step(page, 3);
}

/** Avanza il gioco di `n` fotogrammi da `dt` secondi, renderizzando ognuno. */
export async function step(page, n = 1, dt = 1 / 20) {
  await page.evaluate(
    ({ n, ms }) => {
      for (let i = 0; i < n; i++) window.__step(ms);
    },
    { n, ms: dt * 1000 },
  );
}

/** Inizia una partita con personaggio e progetto scelti (indici), in una pagina appena ricaricata. */
export async function startRun(page, character = 0, biome = 0) {
  await reload(page);
  await page.evaluate(
    ({ character, biome }) => {
      localStorage.setItem('jbonk:selection', JSON.stringify({ character, biome }));
      const app = window.jbonk;
      // niente pointer lock in headless: altrimenti la sua perdita mette in pausa la partita
      app.input.requestLock = () => {};
      app.input.onLockLost = null;
      app.startRun({ character, biome });
      app.game.god = true;
    },
    { character, biome },
  );
  await step(page, 2);
}

/** Chiude in automatico le schermate di scelta carta, se aperte. */
export async function autoPick(page) {
  await page.evaluate(() => document.querySelector('#card-0')?.click());
}

export async function holdKeys(page, codes) {
  await page.evaluate((codes) => {
    const keys = window.jbonk.input.keys;
    keys.clear();
    for (const c of codes) keys.add(c);
  }, codes);
}

/**
 * Registra una GIF: per ogni fotogramma chiama `each(i)` (per muovere camera e giocatore),
 * avanza il gioco e scatta uno screenshot. Poi ffmpeg crea la GIF con palette ottimizzata.
 */
export async function recordGif(page, out, { frames, fps = 20, gifFps = fps, width = 800, clip, each, sub = 1, pick = true, colors = 128 }) {
  const dir = join(process.env.TMPDIR ?? '/tmp', `jbonk-frames-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    if (each) await each(i);
    await step(page, sub, 1 / fps / sub);
    if (pick) await autoPick(page);
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`), clip });
    if (i % 20 === 0) process.stdout.write(`  ${out}: ${i}/${frames}\r`);
  }
  toGif(dir, out, { fps, gifFps, width, colors });
  if (process.env.KEEP_FRAMES) console.log(`  fotogrammi in ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
  console.log(`  ${out}: ok`);
}

/**
 * PNG numerati → GIF con palette ottimizzata (ffmpeg). Se c'è gifsicle (nel PATH o in $GIFSICLE)
 * la GIF viene anche compressa con perdita leggera: di solito pesa un terzo in meno.
 */
export function toGif(dir, out, { fps, gifFps = fps, width, colors = 128 }) {
  const filter =
    `fps=${gifFps},scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'), '-vf', filter, '-loop', '0', out]);
  const gifsicle = process.env.GIFSICLE ?? 'gifsicle';
  try {
    execFileSync(gifsicle, ['-b', '-O3', '--lossy=60', out], { stdio: 'ignore' });
  } catch {
    // gifsicle non disponibile: resta la GIF di ffmpeg
  }
}

/** Sposta il giocatore (e camera, compagno, armi) in un punto della mappa. */
export async function teleport(page, x, z, yaw) {
  await page.evaluate(
    ({ x, z, yaw }) => {
      const g = window.jbonk.game;
      const p = g.player;
      p.x = x;
      p.z = z;
      p.y = g.world.height(x, z);
      g.companion.x = x - 1.5;
      g.companion.z = z + 1;
      g.companion.y = p.y + 1;
      for (const w of g.weapons) w.resetStage(p.x, p.y, p.z);
      if (yaw !== undefined) g.rig.yaw = yaw;
      g.rig.snap();
    },
    { x, z, yaw },
  );
}

/** Imposta la camera (yaw, pitch, distanza). */
export async function camera(page, o) {
  await page.evaluate((o) => Object.assign(window.jbonk.game.rig, o), o);
}

/** Fa comparire `n` nemici in un anello intorno al giocatore. */
export async function spawnRing(page, ids, n, r0, r1) {
  await page.evaluate(
    ({ ids, n, r0, r1 }) => {
      const g = window.jbonk.game;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = r0 + Math.random() * (r1 - r0);
        const def = window.__enemies[ids[i % ids.length]];
        g.spawnEnemy(def, g.player.x + Math.cos(a) * r, g.player.z + Math.sin(a) * r);
      }
    },
    { ids, n, r0, r1 },
  );
}

/** Lascia solo le armi indicate, ognuna al livello voluto (aumenta numero e danno). */
export async function loadout(page, weapons) {
  await page.evaluate((weapons) => {
    const g = window.jbonk.game;
    g.weapons = [];
    for (const [id, level, extra] of weapons) {
      g.addWeapon(id);
      const w = g.weapons[g.weapons.length - 1];
      w.level = level;
      Object.assign(w.stats, extra ?? {});
    }
    g.recomputeStats();
  }, weapons);
}
