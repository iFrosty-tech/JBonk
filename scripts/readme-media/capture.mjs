// Cattura screenshot e GIF per il README in docs/media/.
//
//   npm run dev                                  (in un altro terminale)
//   node scripts/readme-media/capture.mjs        tutte le scene
//   node scripts/readme-media/capture.mjs hero boss   solo alcune
//
// Serve Playwright con Chromium (npm i --no-save playwright && npx playwright install chromium) e ffmpeg nel PATH.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  autoPick,
  camera,
  holdKeys,
  launch,
  loadout,
  openGame,
  recordGif,
  reload,
  spawnRing,
  startRun,
  step,
  teleport,
  toGif,
} from './harness.mjs';

const OUT = new URL('../../docs/media/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const out = (f) => join(OUT, f);

// personaggi e progetti (indici in config/characters.ts e config/biomes.ts)
const DEV = 0, PM = 1, SYS = 2;
const PHOENIX = 0, ATLAS = 1, HELIOS = 2;
// piazzale dell'Enjoy Sporting Club, tra i campi in terra rossa, la piscina e la cupola bianca
const CLUB = { x: -28, z: 175 };
// un campo da tennis in terra rossa dello Sporting Club
const COURT = { x: -45, z: 155 };
// prato aperto tra le palazzine a nord dello Sporting Club
const MEADOW = { x: -54, z: 121 };

/** HUD credibile: livello, budget e ticket chiusi da metà giornata. */
async function hudState(page, { level = 12, gold = 87, kills = 1342, time = 200 } = {}) {
  await page.evaluate(
    ({ level, gold, kills, time }) => {
      const app = window.jbonk;
      const g = app.game;
      Object.assign(g, { level, gold, kills, stageTime: time, runTime: time + 60, xp: 0, xpNext: 1e6 });
      // nasconde il suggerimento "clicca sul gioco…" (in headless il pointer lock non c'è)
      app.input.locked = true;
      // il cartello del progetto sparisce dopo 3,8 s di tempo reale: qui il tempo è virtuale
      document.querySelector('.stage-card')?.remove();
    },
    { level, gold, kills, time },
  );
}

/** Fa girare la partita qualche secondo (chiudendo le eventuali carte) prima di scattare. */
async function settle(page, frames = 90) {
  for (let i = 0; i < frames; i += 10) {
    await step(page, 10);
    await autoPick(page);
  }
}

const scenes = {
  // schermata del titolo
  async title(page) {
    await reload(page);
    await page.screenshot({ path: out('title.png') });
  },

  // intestazione del README: logo, slogan e un po' di personaggi presi dall'atlas
  async banner(_page, browser) {
    const page = await openGame(browser, { width: 1280, height: 400, scale: 2 });
    await page.evaluate(() => {
      const atlas = window.jbonk.atlas;
      const sprite = (id, px, style = '') => `<i style="${atlas.iconStyle(id, px)};position:absolute;${style}"></i>`;
      const el = document.createElement('div');
      el.innerHTML = `
        <style>
          #banner { position: fixed; inset: 0; z-index: 99; overflow: hidden; font-family: var(--font-ui); color: var(--paper);
            background:
              radial-gradient(ellipse at 15% 0%, rgba(76,134,255,.28), transparent 55%),
              radial-gradient(ellipse at 85% 110%, rgba(255,210,63,.22), transparent 55%),
              repeating-linear-gradient(0deg, transparent 0 39px, rgba(255,255,255,.04) 39px 40px),
              repeating-linear-gradient(90deg, transparent 0 39px, rgba(255,255,255,.04) 39px 40px),
              var(--ink); }
          #banner h1 { position: absolute; left: 70px; top: 70px; margin: 0; font-family: var(--font-display); font-weight: 400;
            font-size: 150px; line-height: .9; color: var(--postit); text-shadow: 6px 6px 0 var(--p3), 12px 12px 0 var(--ink-3); }
          #banner p { position: absolute; left: 74px; top: 232px; margin: 0; font-size: 27px; color: var(--paper-2); max-width: 30ch; line-height: 1.25; }
          #banner .shift { position: absolute; left: 74px; top: 318px; display: flex; gap: 10px; align-items: center; font: 700 22px var(--font-mono); }
          #banner .shift b { background: #0b0e15; color: #5dfd8a; padding: 4px 12px; border-radius: 8px; border: 2px solid #2a3146; }
          #banner .shift span { color: var(--muted); font-size: 18px; }
        </style>
        <div id="banner">
          <h1>JBONK</h1>
          <p>Survivor-like 2.5D a tema ufficio e consulenza IT. Si gioca nel browser.</p>
          <div class="shift"><b>09:00</b><span>→ chiudi ticket →</span><b>18:00</b></div>
          ${sprite('boss_cliente', 300, 'right:300px;top:20px;transform:rotate(-4deg)')}
          ${sprite('en_meeting', 150, 'right:60px;top:0px;transform:rotate(8deg)')}
          ${sprite('en_ticket', 120, 'right:120px;top:150px;transform:rotate(-6deg)')}
          ${sprite('en_email', 104, 'right:540px;top:50px;transform:rotate(-12deg)')}
          ${sprite('en_bug', 110, 'right:600px;top:235px;transform:rotate(10deg)')}
          ${sprite('char_pm', 150, 'right:390px;top:235px')}
          ${sprite('char_dev', 170, 'right:250px;top:220px')}
          ${sprite('char_sys', 150, 'right:130px;top:240px')}
          ${sprite('claude', 84, 'right:40px;top:285px')}
          ${sprite('java', 84, 'right:10px;top:150px;transform:rotate(12deg)')}
          ${sprite('angular', 78, 'right:520px;top:170px;transform:rotate(-10deg)')}
        </div>`;
      document.body.appendChild(el);
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('banner.png') });
    await page.close();
  },

  // telefono in orizzontale: controlli touch (joystick, pulsanti) e HUD compatto
  async mobile(_page, browser) {
    const page = await openGame(browser, {
      width: 844,
      height: 390,
      scale: 2,
      context: { isMobile: true, hasTouch: true },
    });
    await startRun(page, SYS, HELIOS);
    // armi a distanza: col firewall i numeri del danno coprirebbero il giocatore
    await loadout(page, [['angular', 4, { count: 3 }], ['java', 3, { count: 2 }], ['spring', 3]]);
    await teleport(page, CLUB.x, CLUB.z, 2.4);
    await hudState(page, { level: 9, gold: 58, kills: 731, time: 170 });
    await page.evaluate(() => (window.jbonk.input.locked = false));
    await camera(page, { pitch: 0.42, dist: 13 });
    await settle(page);
    await page.evaluate(() => (window.jbonk.game.enemies = [])); // via quelli già addosso al giocatore
    await spawnRing(page, ['cr', 'auditor', 'ticket'], 40, 9, 24);
    await step(page, 6); // i nemici stanno arrivando: dopo qualche secondo coprirebbero il giocatore
    // il joystick a schermo appare dove si appoggia il pollice: lo simula un tocco tenuto premuto
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 290 }] });
    await step(page, 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 135, y: 255 }] });
    await step(page, 3);
    const shot = await page.screenshot();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.close();
    // cornice da telefono, disegnata in HTML
    const frame = await browser.newPage({ viewport: { width: 1040, height: 600 }, deviceScaleFactor: 1.5 });
    await frame.setContent(`
      <style>
        body { margin: 0; display: grid; place-items: center; height: 100vh; background: transparent; }
        .shot { padding: 10px 40px 56px; } /* spazio per l'ombra, che altrimenti verrebbe tagliata */
        .phone { padding: 18px 26px; border-radius: 54px; background: linear-gradient(145deg, #2b2f3a, #0d0f14);
          box-shadow: 0 0 0 2px #454b5a inset, 0 24px 40px rgba(0,0,0,.3); position: relative; }
        .phone::before { content: ''; position: absolute; left: 9px; top: 50%; width: 6px; height: 64px; margin-top: -32px;
          border-radius: 3px; background: #1a1d25; }
        img { display: block; width: 844px; height: 390px; border-radius: 36px; }
      </style>
      <div class="shot"><div class="phone"><img src="data:image/png;base64,${shot.toString('base64')}"></div></div>`);
    await frame.locator('.shot').screenshot({ path: out('mobile.png'), omitBackground: true });
    await frame.close();
  },

  // gameplay: l'orda intorno al giocatore, armi a livello alto
  async hero(page) {
    await startRun(page, DEV, PHOENIX);
    await loadout(page, [
      ['duck', 6, { count: 3, damage: 40 }],
      ['claude', 5, { count: 3, damage: 40 }],
      ['angular', 5, { count: 4, damage: 40 }],
      ['jpanik', 4, { damage: 60 }],
    ]);
    await teleport(page, CLUB.x, CLUB.z, 2.4);
    await hudState(page);
    await camera(page, { pitch: 0.44, dist: 13 });
    await settle(page);
    await spawnRing(page, ['bug', 'email', 'ticket', 'bug', 'email'], 140, 12, 30);
    await step(page, 20);
    // camera ferma (la GIF resta più leggera): il giocatore gira in tondo con i tasti
    const path = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    await recordGif(page, out('hero.gif'), {
      frames: 110,
      fps: 20,
      gifFps: 15,
      width: 640,
      each: async (i) => {
        const extra = i === 30 ? ['Space'] : i === 75 ? ['ShiftLeft'] : [];
        await holdKeys(page, [path[Math.floor(i / 14) % 4], ...extra]);
        if (i % 20 === 0) await spawnRing(page, ['bug', 'email', 'ticket', 'meeting'], 22, 22, 30);
      },
    });
    await holdKeys(page, []);
  },

  // promozione: le carte-ticket tra cui scegliere
  async levelup(page) {
    await startRun(page, PM, HELIOS);
    await loadout(page, [['slides', 4, { count: 4 }], ['java', 3], ['spring', 2]]);
    await teleport(page, CLUB.x, CLUB.z, 0.6);
    await hudState(page, { level: 7, gold: 41, kills: 512, time: 130 });
    await camera(page, { pitch: 0.42, dist: 13 });
    await settle(page);
    await spawnRing(page, ['cr', 'auditor', 'cr'], 70, 7, 22);
    await step(page, 25);
    // cerca una mano con almeno una carta di rarità Alta o Bloccante
    for (let tries = 0; tries < 25; tries++) {
      await page.evaluate(() => {
        const g = window.jbonk.game;
        g.xp = g.xpNext = 50;
      });
      await step(page, 2);
      const good = await page.evaluate(() =>
        [...document.querySelectorAll('.ticket .prio')].some((e) => /Alta|Bloccante/.test(e.textContent)),
      );
      if (good) break;
      await page.evaluate(() => document.querySelector('.modal .link')?.click());
      await step(page, 1);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('levelup.png') });
    await page.evaluate(() => document.querySelector('.modal .link')?.click());
  },

  // i tre progetti: stessa mappa, luce diversa (mattina, notte, tramonto)
  async biomes(page) {
    const shots = [
      [PHOENIX, 'biome-phoenix.png', ['bug', 'email', 'ticket']],
      [ATLAS, 'biome-atlas.png', ['bug', 'merge', 'leak']],
      [HELIOS, 'biome-helios.png', ['cr', 'auditor', 'meeting']],
    ];
    for (const [biome, file, enemies] of shots) {
      await startRun(page, SYS, biome);
      await loadout(page, [['firewall', 3], ['deploy', 2]]);
      const st = await page.evaluate(() => window.jbonk.game.world.start);
      await teleport(page, st.x, st.z, st.yaw + 0.4);
      await hudState(page, { level: 5, gold: 23, kills: 180, time: 90 });
      await camera(page, { pitch: 0.3, dist: 17 });
      await settle(page);
      await spawnRing(page, enemies, 30, 11, 26);
      await step(page, 30);
      await page.screenshot({ path: out(file) });
    }
  },

  // boss: il Monolite COBOL di notte, con gli scudi Angular che bloccano i proiettili
  async boss(page) {
    await startRun(page, DEV, ATLAS);
    await loadout(page, [
      ['duck', 5, { count: 3 }],
      ['angular', 6, { count: 5 }],
      ['java', 4, { count: 2 }],
      ['claude', 4, { count: 3 }],
    ]);
    await teleport(page, MEADOW.x, MEADOW.z, 0.6);
    await hudState(page, { level: 21, gold: 140, kills: 2410, time: 300 });
    await camera(page, { pitch: 0.36, dist: 15 });
    await settle(page);
    await page.evaluate(() => {
      const g = window.jbonk.game;
      g.spawnBoss();
      const p = g.player;
      // il boss parte a 13 unità davanti alla camera
      g.boss.x = p.x + g.rig.forward.x * 13;
      g.boss.z = p.z + g.rig.forward.z * 13;
    });
    await spawnRing(page, ['bug', 'merge'], 40, 10, 22);
    await step(page, 30);
    await recordGif(page, out('boss.gif'), {
      frames: 90,
      fps: 20,
      gifFps: 15,
      width: 560,
      each: async (i) => {
        await holdKeys(page, i % 40 < 20 ? ['KeyA'] : ['KeyD']);
      },
    });
    await holdKeys(page, []);
  },

  // un GIF per ogni arma nata da un logo: pochi nemici e colpi letali, così l'effetto si vede bene
  async weapons(page) {
    const list = [
      ['claude', { count: 4 }],
      ['angular', { count: 4 }],
      ['java', { count: 3 }],
      ['spring', { count: 2 }],
      ['mongo', { count: 2, pierce: 4 }],
      ['jpanik', {}],
    ];
    for (const [id, extra] of list) {
      await startRun(page, DEV, PHOENIX);
      await loadout(page, [[id, 5, { ...extra, damage: 400 }]]);
      await teleport(page, COURT.x, COURT.z, 0.6);
      await hudState(page, { level: 9, time: 0 }); // a inizio giornata lo spawn automatico è al minimo
      await camera(page, { pitch: 0.55, dist: 9 });
      await settle(page, 60);
      await spawnRing(page, ['bug', 'email'], 14, 7, 12);
      await step(page, 10);
      await recordGif(page, out(`weapon-${id}.gif`), {
        frames: 60,
        fps: 20,
        gifFps: 15,
        width: 400,
        clip: { x: 340, y: 150, width: 600, height: 450 },
        each: async (i) => {
          if (i % 8 === 0) await spawnRing(page, ['bug', 'email'], 5, 9, 12);
        },
      });
    }
  },

  // totem NGH: l'onda del radar mette tutti in lista d'attesa
  async ngh(page) {
    await startRun(page, SYS, PHOENIX);
    await loadout(page, [['firewall', 2]]);
    const it = await page.evaluate(() => {
      const g = window.jbonk.game;
      const p = g.player;
      return g.interactables
        .filter((i) => i.kind === 'ngh')
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    });
    // il giocatore davanti al totem, la camera alle sue spalle
    await teleport(page, it.x + 2.5, it.z + 2.5, Math.PI / 4);
    await hudState(page, { level: 8, time: 150 });
    await camera(page, { pitch: 0.55, dist: 14 });
    await settle(page);
    await spawnRing(page, ['bug', 'email', 'ticket'], 80, 6, 20);
    await step(page, 25);
    await recordGif(page, out('ngh.gif'), {
      frames: 66,
      fps: 20,
      gifFps: 15,
      width: 560,
      each: async (i) => {
        if (i === 12)
          await page.evaluate(() => {
            const g = window.jbonk.game;
            const t = g.interactables.find((x) => x.kind === 'ngh' && Math.hypot(x.x - g.player.x, x.z - g.player.z) < 6);
            g.useNgh(t);
          });
      },
    });
  },

  // JOscar: la statuetta, la premiazione e i coriandoli
  async joscar(page) {
    await startRun(page, PM, ATLAS);
    await loadout(page, [['slides', 3]]);
    await teleport(page, CLUB.x, CLUB.z, 2.4);
    await hudState(page, { level: 18, gold: 96, time: 300 });
    await camera(page, { pitch: 0.25, dist: 9 });
    await settle(page);
    await page.evaluate(() => {
      const g = window.jbonk.game;
      g.enemies = [];
      const x = g.player.x + g.rig.forward.x * 4.5 + g.rig.right.x * 1.2;
      const z = g.player.z + g.rig.forward.z * 4.5 + g.rig.right.z * 1.2;
      g.interactables.push({ kind: 'joscar', x, z, y: g.world.height(x, z), used: false, charge: 0, free: true });
      g.stageTime = 0; // niente nuovi nemici durante la premiazione
    });
    await step(page, 20);
    await recordGif(page, out('joscar.gif'), {
      frames: 50,
      fps: 20,
      gifFps: 15,
      width: 480,
      clip: { x: 280, y: 120, width: 720, height: 405 },
      each: async (i) => {
        if (i === 12)
          await page.evaluate(() => {
            const g = window.jbonk.game;
            g.awardJOscar(g.interactables.find((x) => x.kind === 'joscar'));
            g.delayedChoices = []; // la scelta del premio arriverebbe a metà GIF
          });
      },
    });
  },

  // fine partita: tre progetti consegnati e tre JOscar
  async victory(page) {
    await startRun(page, DEV, PHOENIX);
    await loadout(page, [
      ['duck', 8],
      ['claude', 7],
      ['angular', 6],
      ['jpanik', 5],
    ]);
    await teleport(page, CLUB.x, CLUB.z, 2.4);
    await settle(page, 30);
    await page.evaluate(() => {
      const g = window.jbonk.game;
      const dmg = { duck: 48210, claude: 61877, angular: 39502, jpanik: 72145 };
      for (const w of g.weapons) w.damageDealt = dmg[w.def.id] ?? 0;
      Object.assign(g, { kills: 4873, level: 34, gold: 212, joscars: 3, runTime: 1187, stagesCleared: 3 });
      g.endRun(true);
    });
    await page.waitForTimeout(1200);
    await step(page, 2);
    await page.screenshot({ path: out('victory.png') });
  },

  // vista dall'alto del quartiere intorno alla sede
  async aerial(page) {
    for (const [biome, file] of [
      [HELIOS, 'aerial-helios.png'],
      [ATLAS, 'aerial-atlas.png'],
    ]) {
      await startRun(page, DEV, biome);
      await hudState(page, { level: 1, gold: 0, kills: 0, time: 0 });
      await settle(page, 30);
      await page.evaluate(() => {
        const g = window.jbonk.game;
        window.jbonk.hud.root.style.display = 'none'; // inquadratura pulita, senza HUD
        g.enemies = [];
        g.stageTime = 0;
        if (g.scene.fog) g.scene.fog.density *= 0.35;
        g.camera.far = 900;
        g.camera.updateProjectionMatrix();
        // niente "buco" tra camera e giocatore: dall'alto nasconderebbe gli alberi intorno alla sede
        const before = g.world.beforeRender.bind(g.world);
        g.world.beforeRender = (cam) => before(cam, cam.position.clone().setY(cam.position.y + 0.01));
        const rig = g.rig;
        const orig = rig.update.bind(rig);
        rig.update = (...a) => {
          orig(...a);
          const p = g.player;
          // dal lato della Colombo: in primo piano lo Sporting Club, poi la sede JPanik e il quartiere
          g.camera.position.set(p.x + 40, 90, p.z + 130);
          g.camera.lookAt(p.x + 10, 0, p.z - 30);
        };
      });
      await step(page, 6);
      await page.screenshot({ path: out(file) });
    }
  },

  // galleria degli sprite animati ricavati dai loghi, presi direttamente dall'atlas
  async sprites(page) {
    const ids = [
      ['claude', 'Claude Code'],
      ['angular', 'Angular'],
      ['java', 'Java'],
      ['spring_spin', 'Spring'],
      ['mongo', 'MongoDB'],
      ['jpanik_fly', 'JPanik'],
      ['soldo', 'Soldo'],
      ['ngh', 'NGH'],
      ['gpi', 'GPI'],
      ['joscar', 'JOscar'],
    ];
    const frames = 48;
    const urls = await page.evaluate(
      ({ ids, frames }) => {
        const atlas = window.jbonk.atlas;
        const CELL = 128;
        const box = 112; // lato di una casella
        const label = 26;
        const cols = 5;
        const pad = 14;
        const rows = Math.ceil(ids.length / cols);
        const c = document.createElement('canvas');
        c.width = cols * (box + pad) + pad;
        c.height = rows * (box + label + pad) + pad;
        const g = c.getContext('2d');
        const out = [];
        for (let t = 0; t < frames; t++) {
          g.fillStyle = '#10131c';
          g.fillRect(0, 0, c.width, c.height);
          ids.forEach(([id, name], k) => {
            const anim = atlas.anim(id);
            const n = anim.length;
            // circa 10 fotogrammi al secondo, con un numero intero di cicli (la GIF torna al punto di partenza)
            const loops = Math.max(1, Math.round(40 / n));
            const f = anim[Math.floor((t * n * loops) / frames) % n];
            const x = pad + (k % cols) * (box + pad);
            const y = pad + Math.floor(k / cols) * (box + label + pad);
            g.fillStyle = '#1a1f2e';
            g.beginPath();
            g.roundRect(x, y, box, box + label, 14);
            g.fill();
            const sw = f.cw * CELL;
            const sh = f.ch * CELL;
            const s = Math.min(box / sw, box / sh) * 0.94;
            g.drawImage(atlas.canvas, f.cx * CELL, f.cy * CELL, sw, sh, x + (box - sw * s) / 2, y + (box - sh * s) / 2, sw * s, sh * s);
            g.fillStyle = '#c9d1e4';
            g.font = '600 13px "IBM Plex Sans Condensed", sans-serif';
            g.textAlign = 'center';
            g.fillText(name, x + box / 2, y + box + label / 2 + 2);
          });
          out.push(c.toDataURL('image/png'));
        }
        return out;
      },
      { ids, frames },
    );
    const dir = mkdtempSync(join(tmpdir(), 'jbonk-sprites-'));
    urls.forEach((u, i) => writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(u.split(',')[1], 'base64')));
    toGif(dir, out('sprites.gif'), { fps: 12, width: 640, colors: 200 });
    rmSync(dir, { recursive: true, force: true });
  },
};

const wanted = process.argv.slice(2);
const list = wanted.length ? wanted : Object.keys(scenes);
const { browser, page } = await launch();
for (const name of list) {
  if (!scenes[name]) throw new Error(`Scena sconosciuta: ${name}`);
  console.log(`▸ ${name}`);
  await scenes[name](page, browser);
}
await browser.close();
