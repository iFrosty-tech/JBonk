# OfficeBonk — POC

Survivor-like in 2.5D sullo stile di PokeBonk/Megabonk, a tema ufficio e consulenza IT.
Gira nel browser, senza installazione per chi gioca.

Obiettivo del POC: dimostrare che il gioco **si può fare** con un web stack leggero.
Gli asset sono generati via codice e sono volutamente semplici.

## Avvio

```bash
npm install
npm run dev        # http://localhost:5173  (aggiungere #debug all'URL per le scorciatoie di test)
npm run build      # build di produzione in dist/ (un solo game.js)
npm run artifact   # build + artifact/ (pagina + game.js pronti da pubblicare su qualsiasi hosting statico)
```

## Comandi

| Tasto | Azione |
|---|---|
| WASD / frecce | Muoversi (relativo alla camera) |
| Mouse | Camera (clic sul gioco per bloccare il puntatore, oppure trascina) |
| Rotella | Zoom |
| Spazio | Salto (si scavalcano i nemici bassi) |
| Shift | Scatto con invulnerabilità |
| E | Interagire (forzieri, sala riunioni, ascensore) |
| 1 / 2 / 3 | Scegliere una carta |
| Esc / P | Pausa |
| M | Audio on/off |

Con `#debug` nell'URL: `L` level-up, `B` boss, `G` invincibile, `K` uccidi tutti, `T` +1 ora, `O` +100 €.

## Il loop di gioco

- **Giornata = livello.** Dalle 09:00 alle 18:00 (6 minuti reali). Le ondate crescono nel tempo, ci sono sciami a orari fissi e un "guardiano" (élite) ogni 80 s.
- **Level-up = promozione.** Si sceglie 1 tra 3 carte-ticket. La rarità è la priorità del ticket (Bassa → Bloccante) e scala il bonus.
- **Ordini d'acquisto** (forzieri): costano buoni pasto e danno una carta di rarità almeno Media. I guardiani ne lasciano uno gratis.
- **Macchinette del caffè** (santuari): restandoci vicino si ottiene un bonus permanente, a scelta tra 3 bevande.
- **Sala riunioni**: convoca il boss in anticipo. Alle 18:00 arriva comunque, e scatta lo straordinario.
- **Boss sconfitto → ascensore** verso il progetto successivo. Si vince consegnando 3 progetti.

## Architettura

```
src/
  config/            ← DATI: qui si personalizza il gioco senza toccare il motore
    biomes.ts        progetti/biomi (palette, terreno, arredi, nemici, élite, boss)
    enemies.ts       nemici, élite e boss (statistiche + pattern d'attacco dei boss)
    weapons.ts       armi (tipo di comportamento + statistiche + upgrade possibili)
    passives.ts      passivi ("tomi") e bevande della macchinetta
    characters.ts    personaggi giocabili, compagno, arma iniziale, bonus
    tuning.ts        bilanciamento globale (durata giornata, spawn, curva XP, rarità)
  render/
    atlas.ts         sprite disegnati via codice in un'unica texture (stile sagoma di cartone)
    billboards.ts    TUTTI gli sprite in 1 draw call (quad istanziati rivolti alla camera) + ombre
    world.ts         terreno a colline con piastrelle, muri, luci, collisioni con gli arredi
    props.ts         arredi low-poly fatti con primitive (scrivanie, rack, colonne…)
  game/
    game.ts          stato della partita e loop: player, nemici, director delle ondate, boss, pickup, interattivi
    weapons.ts       6 pattern d'arma: projectile, orbit, aura, radial, strike, chain
    cards.ts         generazione carte (level-up, forziere, caffè) e rarità
    camera.ts, input.ts, spatial.ts (griglia per le collisioni), audio.ts (suoni sintetizzati)
  ui/                HUD, minimappa, numeri di danno, schermate (titolo, carte, pausa, fine partita)
```

Scelte tecniche:
- **Three.js + TypeScript + Vite**, senza motore fisico: collisioni a cerchi su una griglia spaziale, terreno ad altezza analitica.
- **2.5D**: mondo 3D low-poly, personaggi come sprite 2D "in piedi" (billboard cilindrici) con ombra a disco.
- **Prestazioni**: la logica con 280 nemici e 5 armi costa circa **0,7 ms per frame** (misurato). Tutti gli sprite stanno in una sola draw call.
- **Niente asset esterni**: sprite su canvas, arredi da primitive, effetti sonori in WebAudio. Il bundle è un solo file JS (~630 KB, ~170 KB gzip).

## Come aggiungere un progetto (bioma)

1. In `src/config/biomes.ts` aggiungi un oggetto `BiomeDef` con:
   - `project`, `place`, `client`, `description`;
   - `palette` (colori di pavimento, colline, cielo, nebbia, muri, accento);
   - `terrain` (`amplitude` = altezza delle colline, `frequency` = quanto sono fitte, `tile` = misura delle piastrelle);
   - `props`: quali arredi e quanti (i tipi sono in `PropType`; per uno nuovo aggiungi un `case` in `render/props.ts`);
   - `enemies`: quali nemici, da che secondo compaiono e con che peso;
   - `elite`, `boss`, `swarm`, `swarmName`.
2. Se servono nemici o boss nuovi, aggiungili in `src/config/enemies.ts`. Per il boss compila anche `boss: { shotEvery, shots, shotSpeed, chargeEvery, projectile, quote }`.
3. Per gli sprite nuovi aggiungi una voce in `sprites` dentro `render/atlas.ts` (una funzione che disegna su canvas). Nella versione finale si sostituisce con il caricamento di PNG/spritesheet: il resto del codice usa solo l'id dello sprite.

## Come aggiungere un'arma o un passivo

- **Arma**: in `config/weapons.ts` scegli un `kind` tra `projectile | orbit | aura | radial | strike | chain`, poi imposta statistiche base e upgrade. Un comportamento nuovo va aggiunto in `game/weapons.ts`.
- **Passivo**: in `config/passives.ts` indica la statistica (`stat`), il valore per livello e il formato.

## Limiti noti del POC

- Grafica segnaposto: sprite vettoriali ed emoji per le icone dei passivi (su Linux senza font emoji compaiono quadratini).
- Solo tastiera e mouse: niente controlli touch né gamepad.
- Niente salvataggi di progressione, sblocchi o classifica. Si memorizza solo la scelta di personaggio e progetto (localStorage).
- Bilanciamento verificato solo con un bot in simulazione: va rifinito giocando.

## Prossimi passi suggeriti

1. Playtest interno e taratura di `tuning.ts` e delle armi.
2. Pipeline grafica: spritesheet PNG (Aseprite) caricate nell'atlas, con 2–4 fotogrammi di animazione.
3. I progetti reali in `biomes.ts`, con nemici e boss a tema.
4. Classifica aziendale (piccolo backend, es. Supabase o Node+SQLite in intranet) e sblocchi tra una partita e l'altra.
5. Controlli touch o gamepad, musica, menu opzioni (sensibilità mouse, volume).
