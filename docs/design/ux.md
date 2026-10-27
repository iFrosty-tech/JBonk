# UX: aggiornamento in corso, loadout CPU/RAM, Call di Gruppo e Vim

Come si leggono sul campo le quattro idee del collega, su desktop e su telefono (orizzontale e verticale).
Fase 1, solo design: nessuna modifica a `src/`. Il documento dice **dove** compare ogni segnale, **quando** cambia,
**cosa non mostrare** e **come si verifica**. Le regole di gioco sono in `docs/design/gdd.md` (game-designer), i numeri sono di
`balance-designer`, i testi definitivi di `narrative-writer` (`docs/design/writing.md`).

## In breve

| Idea | Segnale principale | Desktop | Telefono | Costo d'interfaccia |
|---|---|---|---|---|
| Aggiornamento in corso | icona dell'arma sopra il giocatore all'inizio (1 s) e alla fine (con ✓, 0,5 s); in mezzo lo slot con velo grigio e spicchio scuro che si ritira | + secondi in cifra nello slot (44 px) | solo spicchio nello slot (28 px) | basso: nessun pulsante, stati nuovi di elementi esistenti |
| Loadout CPU/RAM (decisione di Marco) | armi → RAM, passivi → CPU; costo "RAM 3" nella riga sotto il nome della carta; le due barre in cima alla finestra delle carte | le due righe di slot diventano "Gestione attività" (blocchi larghi quanto il costo) | riga di icone come oggi; barre solo nella finestra delle carte e in pausa | medio: +1 riga nella finestra delle carte, righe a lunghezza variabile |
| Nemico Call di Gruppo (Teams) | cuffietta sui nemici in call, anello a terra, numeri lilla e più piccoli, Call di Gruppo sulla minimappa agganciata al bordo | idem | idem | basso: nessun elemento HUD fisso |
| Passivo Scorciatoie di Vim | `-- INSERT --` solo quando sei fermo, icona Vim accesa | in basso a sinistra sopra gli slot | sopra la riga degli slot | basso: una scritta |

## Principi validi per tutte le idee

1. **Gerarchia**: HP e pericolo, poi orologio e livello, poi tutto il resto. Nessuna delle idee scavalca HP e barra del boss.
2. **Il segnale va dove guardi**: se chiede una reazione sta sul personaggio (centro schermo); se è solo uno stato sta nell'angolo.
3. **Nessun pulsante touch nuovo.** Le idee si leggono, non si attivano. `touch.ts` resta com'è.
4. **Mai solo colore**: ogni stato ha anche una forma (icona, tratteggio, dimensione) e una differenza di luminosità.
5. **Tre luci**: mattina (Phoenix), notte (Atlas), tramonto (Helios). Tutto ciò che sta sopra il mondo ha il doppio contorno già usato dai numeri di danno: tratto scuro `#10131c` più riempimento chiaro.
6. **Riuso del linguaggio esistente**: lo spicchio scuro che si ritira è già "il tempo che manca" (ricarica dello Scatto, `.touch-ui .dash`); la cuffietta riusa lo schema del biglietto NGH sopra i nemici in attesa.
7. **Testo solo quando il gioco è fermo**: in combattimento icone e forme; le frasi stanno nei banner (una riga, ≤ 38 caratteri, solo la prima volta), nelle carte e in pausa.
8. **Movimento ridotto**: con `prefers-reduced-motion` spariscono pop, pulsazioni e lampi; restano anelli, icone e spunte.
9. **Parole riservate**: "aggiornamento" indica solo il debuff; gli upgrade restano "Lv 3 → 4". Le risorse si chiamano "CPU" e "RAM", senza unità.

## Inventario dell'interfaccia attuale

Viewport di riferimento: desktop **1280×720**; telefono orizzontale **844×390** (iPhone 14) e **667×375** (iPhone SE, caso peggiore);
telefono verticale **390×844** e **375×667**. Desktop e orizzontale sono verificati sulle catture in `docs/media/`
(`levelup.png`, `title.png`, `mobile.png`, `biome-atlas.png`); il verticale è ricavato dal CSS (`src/ui/style.css`) e va verificato a schermo in fase 2.

| Elemento | Desktop | Telefono orizzontale | Telefono verticale |
|---|---|---|---|
| LV + barra HP, € e ticket | alto a sinistra, larghezza `min(300px, 40vw)` | idem | idem, larghezza `100% − 150px` |
| Orologio + luogo | alto al centro, 30 px | 22 px, senza nome del progetto | sotto i contatori (`top: 92px`), a sinistra |
| Minimappa | alto a destra, 150 px | 96 px | 96 px |
| Barra del boss | `top: 96px`, centrata | `top: 84px` | `top: 176px` |
| Banner | `top: 150px`, max 3 | `top: 124px` | `top: 230px` |
| Slot armi + passivi | basso a sinistra, 2 righe × 4, 44 px, vuoti tratteggiati | 1 riga in basso al centro, 28 px (icona scalata a ~25 px) | come in orizzontale ma alzata di 196 px sopra i controlli |
| Prompt "[E] …" / "Usa" | 18% dal fondo, centrato | idem | `+244px` dal fondo |
| Controlli touch | — | joystick a sinistra (a riposo x 40–160), Salta/Scatto a destra, Usa sopra Salta, pausa sotto la minimappa | idem |
| Carte (level-up, forziere, JOscar, caffè) | 3 colonne da ~322 px | 844: 3 colonne da ~260 px; **667: 2 colonne, la terza carta va sotto il bordo** | 1 colonna da ~358 px, si scorre |
| Cartolina d'inizio progetto | centrata al 38% d'altezza, 3,8 s | idem | idem |
| Titolo | 3 personaggi + 3 progetti, pulsante in basso | si scorre, pulsante fisso in basso | si scorre, pulsante fisso in basso |

Cosa conta per queste idee:

- **Lo slot oggi mostra solo icona + livello**: non c'è posto per uno stato temporaneo. Sul telefono è 28 px: uno spicchio ci sta, un testo no.
- **Spazio in basso su telefono orizzontale**: tra il joystick a riposo (bordo destro x ≈ 160) e lo Scatto (bordo sinistro W − 188) restano **~320 px su 667** e ~500 px su 844. Ci stanno al massimo 10 icone da 28 px.
- **Carte**: la rarità è banda colorata più etichetta testuale (non solo colore, bene). La descrizione di un'arma nuova è lunga (Claude Code ~95 caratteri = 4 righe su telefono): su 844×390 una carta è già ~196 px dei 390 disponibili.
- **"Non ci sta" oggi non esiste**: con gli slot pieni le carte di oggetti nuovi non vengono generate (`src/game/cards.ts:122` e `:127`). La macchinetta del caffè dà bonus permanenti che non occupano slot.
- **Collisione di parole**: lo sprite del nemico Memory Leak porta la scritta "RAM 99%". Con la RAM come risorsa del giocatore, la stessa parola indica un nemico e una tua risorsa.

## 1. Debuff "Aggiornamento in corso"

Regole in `gdd.md` § 3: un nemico basso e lento con la barra di download (~10 s di preavviso); se ti tocca blocca un'arma a caso per qualche secondo.
Al massimo un'arma bloccata alla volta, mai l'unica arma.

**Soluzione**: inizio e fine si leggono **dove guardi**: un'icona sopra il giocatore all'inizio (1 s) e di nuovo alla fine con una spunta (0,5 s).
Per quanto manca c'è lo slot: velo grigio, tratteggio e spicchio scuro che si ritira, cioè lo stesso segno della ricarica dello Scatto.

### Segnali

| Momento | Dove | Dettaglio | Proprietario |
|---|---|---|---|
| Nemico in arrivo | nel mondo | scatola bassa con barra di download; sagoma e colore diversi dagli altri nemici bassi | technical-artist |
| Contatto | sopra la testa del giocatore, 1 s | cerchio scuro (`#10131c` all'85%) di 34 px su desktop e 30 px su telefono, con l'icona dell'arma colpita (24/22 px) desaturata; entra con un pop | ui (`hud.ts`, canvas dei numeri) |
| Contatto | audio | suono di "spegnimento", discendente; **diverso dalla notifica della Call di Gruppo** | sound-designer |
| Durante | slot dell'arma | velo grigio + tratteggio diagonale + spicchio scuro che si ritira (`conic-gradient` come `.dash`); il livello resta | ui (`hud.ts`, `style.css`) |
| Durante, solo desktop | slot da 44 px | secondi rimanenti al centro, mono 14 px grassetto, chiaro con contorno scuro | ui |
| Riavvio | sopra la testa, 0,5 s | stessa icona a colori con una spunta ✓ verde `#5dfd8a` | ui |
| Riavvio | slot + audio | lampo del bordo verde (400 ms); suono di "riavvio", due note ascendenti | ui, sound-designer |
| Prima volta nella partita | zona banner | "Un'arma si sta aggiornando!" (testo di narrative-writer); nessun testo al riavvio | ui, narrative-writer |

### Layout desktop (1280×720)

```
┌──────────────────────────────────────────────────────────────┐
│ LV 9 [███████ 125/125]        [ 13:22 ]                 (◉) │
│ € 58  ✔ 734 ticket                                     map  │
│                                                              │
│                          ╭───╮  ← solo 1 s all'inizio        │
│                          │🦆 │    e 0,5 s alla fine (con ✓)  │
│                          ╰───╯                               │
│                          [dev]                               │
│                    bug  bug   bug                            │
│                                                              │
│ [▒4▒][☕3][🍃2]  ← slot bloccato: velo, tratteggio, spicchio,  │
│ [🥐1][📋2]         "4" = secondi rimanenti                    │
└──────────────────────────────────────────────────────────────┘
```

### Layout telefono

- **Orizzontale (844×390, 667×375)**: icona sopra il giocatore (30 px) all'inizio e alla fine. Nello slot da 28 px velo, tratteggio e spicchio, **senza cifre** (a 28 px non si leggono).
- **Verticale (390×844)**: identico; la riga degli slot è alzata sopra i controlli, l'icona sta sul personaggio.
- L'icona sopra la testa non tocca mai HP, orologio, minimappa, banner o pulsanti: la camera tiene il personaggio al centro e l'icona sta ~40–60 px sopra di lui.

### Stati

| Stato | Sopra il giocatore | Slot | Suono |
|---|---|---|---|
| Normale | niente | normale | — |
| Contatto (0–1 s) | icona desaturata, entra con un pop (scala 0,6 → 1 in 200 ms) | si vela | "spegnimento" |
| Bloccata | niente | velo + tratteggio + spicchio che si ritira; desktop: secondi | — |
| In scadenza (ultimi 2 s) | niente | lo spicchio è quasi sparito; desktop: "2", "1" | — |
| Riavvio | icona a colori con ✓ per 0,5 s | lampo verde del bordo | "riavvio" |
| Interrotto (fine progetto, burnout) | niente | torna normale | — |
| Pausa, carte, premiazione | niente | lo spicchio è fermo (il tempo non scorre) | — |

Se durante il blocco esce una carta di upgrade per la stessa arma, la carta si sceglie normalmente; la sua icona porta il glifo ⟳.

### Cosa NON mostrare

- Nessun banner a ogni contatto: col nome dell'arma diventa 41–47 caratteri su due righe, da leggere con l'orda addosso. Quale arma lo dice l'icona sopra il giocatore.
- Nessun banner "Aggiornamento completato": alla fine bastano ✓ e ding.
- Nessuna percentuale e nessuna rotellina che gira: nello slot lo spicchio basta; due segni in movimento in 28 px si confondono.
- Nessuna bolla fissa sopra il personaggio per tutta la durata: i momenti che contano sono l'inizio e la fine.
- Nessuna barra di avanzamento a centro schermo stile Windows Update, nessun testo nel mondo (la battuta "Non spegnere il computer" può stare solo nella pausa).
- Nessuna finestra "Riavvia ora / Più tardi": sarebbe una scelta sotto pressione.
- Nessun effetto su tutto lo schermo (desaturazione, vignetta): quello è il linguaggio dei danni (`.hurt`).

### Criteri di accettazione

- [ ] Al contatto, a 1280×720, 844×390, 667×375 e 390×844, sopra il giocatore compare per 1 s l'icona dell'arma bloccata, ≥ 22 px CSS.
- [ ] Al riavvio la stessa icona compare con la ✓ per 0,5 s insieme al suono di riavvio, entro 100 ms dal momento in cui l'arma riprende ad attaccare.
- [ ] L'icona sopra la testa non si sovrappone a HP, orologio, minimappa, barra del boss, banner né ai pulsanti touch.
- [ ] Su una cattura desaturata lo slot bloccato si distingue dagli altri (velo + tratteggio + spicchio), non solo per il colore.
- [ ] Su desktop lo slot bloccato mostra i secondi rimanenti; su telefono nessun testo nello slot.
- [ ] Spicchio scuro e parte chiara hanno contrasto ≥ 3:1 su catture di mattina, notte e tramonto.
- [ ] Il suono di spegnimento e la notifica della Call di Gruppo sono distinguibili all'ascolto.
- [ ] Il banner compare solo alla prima occorrenza della partita.
- [ ] Lo spicchio non avanza in pausa né durante la scelta delle carte.
- [ ] Con `prefers-reduced-motion` niente pop e niente lampo; spicchio, icona e ✓ restano.
- [ ] Nessun elemento touch nuovo: `touch.ts` invariato.

## 2. Loadout CPU/RAM

> **L'adozione è una decisione di Marco.** `gdd.md` § 4 confronta A (slot di oggi), **B (una risorsa per categoria: armi → RAM, passivi → CPU; raccomandata)**,
> C (una risorsa scelta per ogni oggetto) e D (due costi per oggetto). Qui c'è come si leggerebbe B, cosa cambia con C e perché D non regge sul telefono.

**Soluzione (B)**: le due righe di slot di oggi restano e diventano due budget: la riga delle armi consuma RAM, quella dei passivi CPU.
La risorsa la dice il tipo di carta; quanto costa lo dice un chip ("RAM 3") **nella riga che già c'è** sotto il nome ("Nuova · RAM 3 → 6/9"),
quindi la carta non si allunga. In cima alla finestra delle carte ci sono le due barre su una riga, nello stesso ordine delle righe dell'HUD.
In partita, su desktop, le righe diventano "Gestione attività"; su telefono restano icone fisse e nessuna barra.

### Vincoli perché resti leggibile (concordati con design e bilanciamento)

| Vincolo | Perché |
|---|---|
| Una risorsa per categoria: armi → RAM, passivi → CPU | la risorsa si capisce dal tipo di carta; le due righe di slot di oggi restano |
| Chip con la stessa parola della barra: "RAM 3", "CPU 2"; niente "GB" né "core" | il giocatore abbina chip e barra senza ricordare le unità |
| Sempre RAM prima di CPU (barre, criteri, testi) | stesso ordine delle righe dell'HUD: armi sopra, passivi sotto |
| Solo interi; budget `⟨8–9⟩` RAM (arma iniziale compresa) e `⟨7⟩` CPU; costi armi `⟨1–3⟩`, passivi `⟨1–4⟩`; massimo assoluto 11 tacche | fino a 12 tacche si contano a colpo d'occhio |
| Il numero `6/9` sempre accanto alla barra | conferma il conteggio senza contare |
| Il costo si paga all'installazione e non cresce coi livelli | le carte di upgrade restano come oggi |
| Il budget cresce solo coi premi del JOscar (`⟨+1⟩` RAM o CPU a scelta, al massimo `⟨+2⟩` a partita) | la barra cambia scala al massimo due volte, in un momento calmo |
| Al massimo `⟨6⟩` armi, `⟨6⟩` passivi e `⟨10⟩` oggetti in tutto | spazio fisico della riga in basso su iPhone SE in orizzontale |

### Finestra delle carte (level-up, forzieri, JOscar)

Le tre schermate usano lo stesso generatore (`upgradeCards`), quindi lo stesso disegno.

```
                    PROMOZIONE! LIVELLO 10
             Scegli un ticket da prendere in carico
         RAM ■■■■■■□□□ 6/9   ·   CPU ■■■■■■■ 7/7                  ← sempre, una riga, RAM prima di CPU
                      CPU insufficiente                            ← solo se il filtro ha escluso passivi nuovi
 ┌────────────────────────────┐ ┌────────────────────────────┐ ┌─────────────────────────────────┐
 │▌OB-567 · Nuova arma [MEDIA]│ │▌OB-568 · Arma        [ALTA]│ │▌OB-569 · Passivo         [BASSA]│
 │▌ [ico] Spring Boot         │ │▌ [ico] Slide PowerPoint    │ │▌ [ico] Scorciatoie di Vim       │
 │▌       Nuova · RAM 2 → 8/9 │ │▌       Lv 4 → 5            │ │▌       Lv 1 → 2                 │
 │▌ Frisbee che va e torna.   │ │▌ +1 Slide                  │ │▌ Fermo: +10% Velocità d'attacco │
 │▌                       [1] │ │▌                       [2] │ │▌ In movimento: +5% Velocità [3] │
 └────────────────────────────┘ └────────────────────────────┘ └─────────────────────────────────┘

 premio del JOscar
 ┌────────────────────────────┐
 │▌OB-570 · Bonus       [ALTA]│
 │▌ [ico] Banco di RAM        │
 │▌       RAM 9 → 10          │
 │▌ +1 RAM per le armi        │
 └────────────────────────────┘
```

- **Costo**: nella riga mono sotto il nome. "RAM 2" è un chip in evidenza (fondo scuro, testo chiaro); "→ 8/9" è secondario. Su telefono in orizzontale la colonna è ~164 px: 20 caratteri in mono 12 px ci stanno.
- **Carte di upgrade**: invariate, nessun costo (nell'esempio Vim è già installato: con la CPU piena esce solo come upgrade).
- **Barre in cima**: una riga sola con le due barre, ~280 px, che sta anche in verticale. Tacche piene = occupata, vuote = libera, numero accanto.
- **Riga "insufficiente"**: compare solo se il filtro ha escluso armi o passivi nuovi per mancanza di quella risorsa. Una frase per stato, con la stessa parola della barra: "RAM insufficiente", "CPU insufficiente", "RAM e CPU insufficienti" (testi di narrative-writer, sempre RAM prima di CPU). Risponde al "perché non escono armi nuove?". Non promette azioni che non esistono (niente "libera RAM": nella prima versione non si disinstalla).
- **Premio "+1" del JOscar**: «Banco di RAM» (+1 RAM) o «Processore Nuovo» (+1 CPU), nomi di narrative-writer; carta con tag "Bonus" e "RAM 9 → 10" nella riga sotto il nome. Nessun banner: la scelta stessa è il feedback. Dopo il secondo premio di questo tipo nella partita non esce più.
- **Rarità e tastiera**: invariate (banda + etichetta; 1/2/3).

**Quando una carta non ci sta**:

| Strada | Come si usa | Pro | Contro | Stato |
|---|---|---|---|---|
| **Non offrirla** + riga "insufficiente" | la carta non esce; la finestra spiega perché | nessuna interfaccia nuova; niente carte morte | la rinuncia non si vede: il compromesso si vede solo quando installi ("→ 9/9") | **prima versione** (accordo design, bilanciamento, ux) |
| Sostituisci in 2 tocchi ("Termina attività") | tocco la carta che non ci sta → "Cosa disinstalli?" con i soli oggetti della stessa riga che, tolti, fanno spazio → tocco → fatto; "Annulla" torna alle 3 carte | il compromesso si decide davanti al giocatore | un passo e una schermata in più (bersagli ≥ 44 px, tastiera 1…n ed Esc) | dopo il playtest |
| Mostrarla spenta | carta grigia non selezionabile | si vede il vincolo | spreca una delle tre scelte | scartata |

### Macchinette del caffè e forzieri

Le bevande sono bonus permanenti, non oggetti installati: **nessun costo, nessuna barra**, schermata invariata.
I forzieri non cambiano il budget: la loro finestra è quella delle carte, con barre e chip come sopra.

### HUD in partita

- **Desktop, "Gestione attività"**: le due righe di oggi in basso a sinistra, armi sopra (RAM) e passivi sotto (CPU). Ogni oggetto è un blocco largo `costo × 36 px` con l'icona al centro e il livello come oggi; la parte libera è tratteggiata; a inizio riga l'etichetta, a fine riga il numero. Con 9 RAM la riga è ~324 px, con 7 CPU ~252 px; il massimo assoluto è 11 unità (Developer con due premi in RAM), cioè ~396 px.
- **Telefono**: la riga di icone di oggi, invariata: icone a **dimensione fissa** (28 px), armi, uno stacco di 10 px, passivi. **Nessuna barra** durante il combattimento.
- **Pausa**: sezione "Configurazione" con le due righe "Gestione attività" e i costi, da leggere con calma (fase 2b).
- **Risorsa piena**: nessun avviso in partita; lo dice la riga nella finestra delle carte.
- **Premio "+1" preso**: su desktop la riga si allunga di un'unità tratteggiata; su telefono non cambia nulla.

```
 desktop, basso a sinistra (1 unità = 36 px)
 -- INSERT --                                     ← passivo Vim (§ 3)
 RAM [ Paperella 3    ][ Spring 2 ][🚀1][· · ·]  6/9
 CPU [Vim1][🥐1][ Cloud 2  ][· · ·]               4/7

 telefono, riga in basso (come oggi)
 [🦆][🌀][🚀]  [Vim][🥐][☁]
```

### Schermata del titolo

**Nessun chip del budget.** Con i numeri di `docs/design/balance.md` §5 i budget totali sono diversi (RAM 9 per il Developer, 8 per PM e Sistemista) ma l'arma iniziale li pareggia: tutti partono con 6 RAM libere e 7 CPU. Un chip "RAM 9" contro "RAM 8" farebbe pensare a una differenza che in gioco non c'è. La barra con l'arma iniziale già piena si vede alla prima promozione.
Se in futuro le risorse **libere** alla partenza diventano diverse, allora un chip "RAM 6 · CPU 7" (le libere, non il totale) accanto al chip del bonus.

### Stati

| Stato | Finestra delle carte | HUD desktop | HUD telefono |
|---|---|---|---|
| Ci sta | "Nuova · RAM 2 → 8/9" | blocco nuovo nella riga | icona nuova nella riga |
| Riempie esattamente | "→ 9/9" | riga piena, nessun allarme | niente |
| Una risorsa piena e oggetti esclusi | riga "RAM insufficiente" (o "CPU …") sotto le barre | — | — |
| Entrambe piene | riga "RAM e CPU insufficienti"; restano upgrade e carte di riserva | — | — |
| Premio "+1" del JOscar | carta "Bonus · RAM 9 → 10" tra i premi (al massimo due per partita) | la riga si allunga di un'unità tratteggiata | niente |

### Cosa NON mostrare

- Nessuna barra in combattimento su telefono.
- Nessuna barra per ogni carta: le due barre stanno una volta sola in cima alla finestra.
- Nessun costo sulle carte di upgrade.
- Nessun avviso "RAM insufficiente" / "CPU insufficiente" durante il combattimento.
- Nessun banner per il premio "+1".
- Nessuna unità (GB, core).

### Le altre opzioni del GDD, viste da qui

| Opzione | Carta | Finestra delle carte | HUD | Verdetto UX |
|---|---|---|---|---|
| A. Slot di oggi | invariata | invariata | invariato | zero costo |
| **B. Una risorsa per categoria** (armi → RAM, passivi → CPU) | un chip; la risorsa la dice il tipo di carta | due barre su una riga | righe di oggi; desktop proporzionali, telefono invariato | **la più leggera delle nuove** |
| C. Una risorsa per oggetto | un chip; la risorsa va letta oggetto per oggetto | due barre su una riga | righe per risorsa, non più per tipo; telefono: icone fisse in due gruppi | regge sul telefono, ma il giocatore deve imparare la risorsa di ogni oggetto |
| D. Due costi per oggetto | "Nuova · RAM 2 · CPU 1": su telefono in orizzontale non sta su una riga | due barre | come C | **sconsigliata**: due confronti per carta nel momento della scelta |

### Costo in complessità di B, soprattutto su telefono

| Elemento | Oggi | Con B | Impatto sul telefono |
|---|---|---|---|
| Carta di oggetto nuovo | icona, nome, "Nuova", descrizione | stesso disegno, costo nella riga "Nuova" | nessuno in altezza; la descrizione deve restare ≤ 60 caratteri |
| Finestra delle carte | titolo, sottotitolo, carte | + riga delle barre (~20 px) e, a volte, una riga "insufficiente" (~18 px) | su 844×390 ci sta solo con descrizioni ≤ 60 caratteri; su 667×375 la terza carta era già sotto il bordo |
| HUD in partita | 2 righe da 4 slot | stesse righe, a lunghezza variabile; su desktop blocchi proporzionali | invariato; tetto di 10 oggetti |
| JOscar | carte almeno Alte | + carta "+1 RAM" o "+1 CPU" | nessuno |
| Titolo | — | nessun cambiamento (le risorse libere alla partenza sono uguali per tutti) | nessuno |
| Codice | — | costo e "dopo" nella `Card`; budget e "oggetti esclusi" nella `ChoiceRequest`; flag `loadout` | lavoro di gameplay + ui |

- **Pro UX**: la risorsa non va imparata, la dice il tipo di carta; su telefono l'HUD in partita resta quello di oggi; su desktop la "Gestione attività" mostra a colpo d'occhio cosa ti mangia le risorse (un'arma pesante è un blocco lungo); il "→ 8/9" mostra la conseguenza della scelta.
- **Contro UX**: è vicina a "slot pesati", quindi la differenza da oggi si sente meno (la battuta "Vim o IntelliJ" vale dentro ogni riga, non tra le righe); la rinuncia non si vede (le carte che non ci stanno spariscono).

### Criteri di accettazione (solo se Marco sceglie B)

- [ ] Su ogni carta di oggetto nuovo il costo si legge nella riga sotto il nome ("Nuova · RAM 2 → 8/9"), senza allungare la carta.
- [ ] Il chip usa la stessa parola della barra ("RAM"/"CPU"), senza unità.
- [ ] La finestra delle carte mostra le due barre su una sola riga, RAM prima di CPU, con il numero `usata/totale` accanto a ciascuna, anche a 375 px di larghezza.
- [ ] Se il filtro ha escluso oggetti nuovi per mancanza di una risorsa, la finestra mostra la riga che lo dice; altrimenti no.
- [ ] A 844×390 titolo, sottotitolo, barre, riga, 3 carte e "Rimanda" stanno senza scorrere (con descrizioni ≤ 60 caratteri); a 667×375 le prime 2 carte sono intere e la terza è raggiungibile scorrendo.
- [ ] Desktop: riga delle armi = RAM e riga dei passivi = CPU, con blocchi larghi in proporzione al costo. Telefono: riga di icone a 28 px come oggi, nessuna barra in partita.
- [ ] Con 10 oggetti installati la riga di icone su 667×375 in orizzontale non tocca joystick né Scatto.
- [ ] Il premio "+1 RAM"/"+1 CPU" del JOscar mostra "RAM 9 → 10" (o CPU) sotto il nome e non produce banner.
- [ ] Titolo: nessun chip del budget finché le risorse libere alla partenza sono uguali per tutti i personaggi.
- [ ] Macchinetta del caffè: nessun costo né barra sulle bevande.

## 3. Nemico Call di Gruppo e passivo Scorciatoie di Vim (solo segnali d'interfaccia)

### Nemico Call di Gruppo (Teams)

Regole in `gdd.md` § 1: la Call di Gruppo apre una call (anello di raggio `⟨6⟩`); i nemici normali dentro subiscono `⟨-30%⟩` di danno finché non la sconfiggi.

| Momento | Segnale | Dettaglio | Proprietario |
|---|---|---|---|
| Spawn | notifica | due note brevi, al massimo una ogni `⟨1,5⟩` s | sound-designer |
| Spawn | minimappa | quadrato arrotondato 12 px, lilla chiaro `#b9bbff` con bordo bianco, **agganciato al bordo** come le élite: è un bersaglio prioritario che sta dietro l'orda | ui (`hud.ts`) |
| Prima comparsa nella partita | banner | uno solo, ≤ 38 caratteri; descrive l'effetto **sui nemici** (narrative-writer: "Chi è in call prende -{p}% danno", 31 caratteri); `{p}` si legge dalla config, non si scrive a mano | narrative-writer, ui |
| Call aperta | anello a terra | lilla chiaro tratteggiato con tratto scuro (il viola di Teams su terra scura di notte non si vede); logo con onde "in chiamata" | technical-artist |
| Nemico in call | cuffietta | piccola (≤ 1/3 dell'altezza del bug) e ferma, senza animazione: resta finché la Call di Gruppo è in campo. Al massimo `⟨40⟩` a schermo | technical-artist |
| Colpo su un nemico in call | numero di danno | lilla **e più piccolo** (14 px invece di 17): "fai meno danno" si legge dalla dimensione anche in scala di grigi | gameplay-programmer (colore e dimensione), ui (`hud.ts` li disegna) |
| Call di Gruppo sconfitta | cuffiette | spariscono tutte insieme, sbuffo lilla; suono "chiamata terminata" | technical-artist, sound-designer |

**Cosa NON mostrare**: niente etichetta "In call" nell'HUD (la call riguarda i nemici, non te); niente linee tra la Call di Gruppo e i nemici in call (con centinaia di nemici diventano una ragnatela); niente testo sopra i nemici; niente suono continuo durante la call; niente banner dopo il primo.

**Criteri di accettazione**

- [ ] In una cattura con ≥ 100 nemici e una Call di Gruppo in campo, la Call di Gruppo si individua in meno di un secondo di mattina, di notte e al tramonto.
- [ ] In una cattura desaturata si vedono l'anello e le cuffiette, e i numeri sui nemici in call sono visibilmente più piccoli.
- [ ] Sulla minimappa la Call di Gruppo ha una forma diversa da nemici, élite e boss ed è agganciato al bordo quando è fuori portata.
- [ ] Le cuffiette non coprono i numeri di danno.
- [ ] Il banner compare solo alla prima comparsa nella partita.

### Passivo Scorciatoie di Vim

Regole in `gdd.md` § 2: fermo per `⟨0,4⟩` s sei in INSERT (+velocità d'attacco); appena ti muovi sei in NORMAL (+velocità di movimento).

- **`-- INSERT --`**: compare solo in INSERT, in mono 14 px, chiaro su fondo scuro come i contatori, senza lampeggio; entra ed esce in 150 ms. Testo fisso come in Vim, non tradotto.
- **NORMAL è nascosto**: in un survivor ci si muove quasi sempre; una scritta fissa che cambia a ogni sosta è rumore. Il bonus di NORMAL si sente.
- **Icona Vim nello slot**: accesa in INSERT, normale in NORMAL. È la conferma per chi guarda gli slot.
- **Carta**: nome ≤ 20 caratteri; due righe d'effetto ≤ 32 caratteri l'una (velocità d'attacco da fermo, velocità in movimento).
- **Niente attivazione**: nessun tasto e nessuna combo; su touch basta alzare il pollice dal joystick.

Posizione di `-- INSERT --`:

| Viewport | Posizione | Perché |
|---|---|---|
| Desktop 1280×720 | in basso a sinistra, subito sopra le righe degli slot, allineata a sinistra | è dove la mette Vim, accanto all'icona |
| Telefono orizzontale | centrata subito sopra la riga degli slot (~44–60 px dal fondo) | tra joystick e Scatto c'è spazio; il prompt sta più su (18% dal fondo). Il suggerimento iniziale (`.hint`) occupa la stessa fascia ma solo nei primi 10 s, quando Vim non si può avere |
| Telefono verticale | centrata sopra la riga degli slot alzata | il prompt "Usa" sale di ~16 px (da `+244px` a `+260px`) per non toccarla |

```
 telefono orizzontale (844×390)
┌──────────────────────────────────────────────────────────────┐
│ LV 9 [█████ 125/125]      [13:22]                       (◉) │
│ € 58 ✔ 734                                              [II] │
│                                                              │
│                         [dev]                                │
│                                                              │
│   ( o )                 -- INSERT --              (SCATTO)   │
│  joystick         [🦆][📊][🛡][🥐][Vim]           (SALTA)    │
└──────────────────────────────────────────────────────────────┘
```

**Criteri di accettazione**

- [ ] Con Vim, fermo per `⟨0,4⟩` s, compare `-- INSERT --` nella posizione della tabella; muovendosi sparisce nello stesso frame.
- [ ] In NORMAL non compare nessuna scritta; senza Vim mai.
- [ ] A 844×390, 667×375 e 390×844 la scritta non si sovrappone a joystick, Salta, Scatto, Usa né al prompt.
- [ ] L'icona di Vim si riconosce a 25 px su catture di mattina, notte e tramonto.
- [ ] Nessuna riga della carta di Vim va a capo a 844×390.
- [ ] Nessun input nuovo, né da tastiera né touch.

## Pausa

Il sottotitolo della pausa diventa una frase a caso da una lista di narrative-writer (≤ 46 caratteri), scelta ogni volta che la pausa si apre e ferma finché resta aperta.
È il posto per le battute lunghe (Call di Gruppo, "Non spegnere il computer", Vim): il gioco è fermo.

## File da toccare in fase 2

| File | Proprietario | Cosa cambia |
|---|---|---|
| `src/ui/hud.ts` | ui-ux-designer | icona dell'arma sopra il giocatore (inizio e riavvio), stato dello slot bloccato, `-- INSERT --`, Call di Gruppo sulla minimappa, righe "Gestione attività" su desktop (armi = RAM, passivi = CPU) |
| `src/ui/style.css` | ui-ux-designer | velo, tratteggio, spicchio e lampo dello slot; scritta INSERT; prompt alzato in verticale; righe a blocchi proporzionali; chip del costo e barre della finestra delle carte |
| `src/ui/screens.ts` | ui-ux-designer | costo sulle carte, barre e riga "insufficiente" nella finestra delle carte, sottotitolo della pausa a caso, configurazione in pausa |
| `src/ui/touch.ts` | ui-ux-designer | **nessuna modifica** |
| `src/game/entities.ts`, `cards.ts`, `game.ts`, `weapons.ts` | gameplay-programmer | blocco dell'arma con tempo rimanente leggibile dall'HUD, modalità di Vim, stato "in call", colore e dimensione dei numeri, risorsa, costo e "dopo" nella `Card`, budget e "oggetti esclusi" nella `ChoiceRequest` |
| `src/config/tuning.ts` | balance-designer | durate, raggio, budget, costi, tetti |
| `src/config/enemies.ts`, `passives.ts`, `weapons.ts`, `characters.ts` | game-designer | voci `ping`, `update`, `vim`, costi e risorsa per oggetto, budget per personaggio, descrizioni ≤ 60 caratteri |
| `src/render/atlas.ts`, `src/render/logos/` | technical-artist | sprite della Call di Gruppo e del nemico-aggiornamento, cuffietta, anello, icona Vim, glifo ⟳ |
| `src/game/audio.ts` | sound-designer | notifica, chiamata terminata, spegnimento, riavvio |
| `docs/design/writing.md` | narrative-writer | banner, nomi, righe delle carte, righe "insufficiente", frasi della pausa |

## Decisioni aperte per Marco

1. **Loadout**: A (slot di oggi), B (una risorsa per categoria: armi → RAM, passivi → CPU; raccomandata dal game-designer), C (una risorsa per oggetto) o D (due costi per oggetto). Lato UX: A costa zero, B è la più leggera delle nuove, C regge sul telefono ma chiede di imparare la risorsa di ogni oggetto, D no.
2. **Sostituzione in 2 tocchi ("Termina attività")**: esclusa dalla prima versione; da rivalutare dopo il playtest se la rinuncia non si sente.
3. **"RAM 99%" sullo sprite del Memory Leak**: con la RAM come risorsa, togliere la scritta (technical-artist) o farne una sinergia voluta (game-designer).

## Registro del confronto

| Idea | Con chi | Giri | Esito |
|---|---|---|---|
| tutte | designer | 0 | 6 vincoli UX anticipati prima della bozza: accolti tutti |
| testi | scrittura | 2 | limiti adottati: nome ≤ 20 (22 tetto), effetto ≤ 32, descrizione nuova ≤ 60, banner ≤ 38 (boss ≤ 70), pausa ≤ 46, nessun testo sullo slot su telefono, nessuna etichetta "In call", "aggiornamento" riservato al debuff (gli upgrade nei testi sono "potenziamenti"). Ultimi ritocchi chiesti: numero del banner della Call di Gruppo letto dalla config, righe "RAM/CPU insufficiente" con la parola della barra, nessun banner per la crescita del budget |
| numeri CPU/RAM | bilanciamento | 1 | un costo per carta, barre una volta sola per finestra, numero sempre accanto alla barra, ≤ 10 oggetti; budget RAM 8–9 (6 libere per tutti dopo l'arma iniziale) e CPU 7, costi armi 1–3 e passivi 1–4, crescita solo dai premi del JOscar (max +2, massimo assoluto 11 tacche), build piene di 8–9 oggetti: leggibili; niente chip del budget nel titolo (dettagli in `docs/design/balance.md` §5) |
| 1 Call di Gruppo (ex Ping, ex Teams) | designer | 2 | **OK pieno**: minimappa agganciata e lilla chiaro, numeri lilla e più piccoli, cuffiette piccole e ferme, anello tratteggiato, banner solo la prima volta |
| 2 Vim | designer | 2 | **OK pieno**: NORMAL nascosto (criterio 2.3 corretto), posizioni della scritta, carta su due righe, criterio 2.10 sui controlli touch |
| 3 Aggiornamento | designer | 2 | **OK pieno**: banner solo alla prima occorrenza (non a ogni contatto), icona sopra il giocatore all'inizio e con ✓ al riavvio, slot con velo, tratteggio e spicchio, cifre solo su desktop (criterio 3.14) |
| 4 Loadout | designer | 2 + una conferma | **OK pieno a B per categoria** (armi → RAM, passivi → CPU), che era la variante proposta da ux e che il designer ha adottato dopo i conti di bilanciamento: chip senza unità ("RAM 3"/"CPU 2"), barre su telefono solo nella finestra delle carte (una riga, RAM prima di CPU) e in pausa, "Gestione attività" proporzionale solo su desktop, riga "insufficiente" nella finestra delle carte, premio "+1" del JOscar senza banner, tetto di 10. L'OK precedente alla risorsa per oggetto vale ora per l'opzione C |
