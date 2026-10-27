# JBonk — Game Design Document

Documento di design di JBonk. Proprietario: game-designer. Stato: **fase 1 chiusa (solo design, nessuna modifica a `src/`)**: le idee 1–3 hanno l'OK di bilanciamento e ux, l'idea 4 aspetta la decisione di Marco.
Questa versione specifica quattro idee proposte da un collega e le confronta con il gioco attuale.

## In breve

| # | Idea | Proposta | Riusa | Nuovo nel motore | Stima | OK bilanciamento | OK ux |
|---|---|---|---|---|---|---|---|
| 1 | Nemico «Call di Gruppo» (Teams) | Nemico di supporto che **è** una call: i nemici normali dentro il suo anello subiscono `⟨-30%⟩` di danno finché è viva | icona sopra la testa e interazione col totem NGH, numeri di danno colorati, timer degli élite | aura nemica che riduce il danno, suono allo spawn, timer e limite dedicati | M | **OK** (raggio 6) | **OK** |
| 2 | «Scorciatoie di Vim» | Passivo a due modalità: **fermo = INSERT** (+velocità d'attacco), **in movimento = NORMAL** (+velocità di movimento) | passivi, carte, statistiche | passivo condizionato dallo stato del giocatore, scritta `-- INSERT --` | S | **OK** | **OK** |
| 3 | «Aggiornamento» | Un nemico lento e basso arriva a intervalli regolari; se ti tocca **mette in aggiornamento un'arma** per qualche secondo. Si evita uccidendolo, saltandolo o con lo scatto | contatto, salto, scatto, lista d'attesa NGH, scudi Angular | stato "in aggiornamento" dell'arma, slot bloccato | M | **OK** | **OK** |
| 4 | Loadout «PC aziendale» (CPU/RAM) | **Decisione aperta per Marco.** Raccomandazione: **armi → RAM, passivi → CPU**, un costo per oggetto, prima come esperimento dietro un flag | carte, JOscar, le due righe di slot dell'HUD | costo per oggetto, filtro delle carte, barre a tacche | L | **OK sui numeri**; l'adozione è di Marco | **OK**; l'adozione è di Marco |

Ordine di sviluppo proposto: **2 → 1 → 3 → 4** (motivi in [Ordine di sviluppo](#ordine-di-sviluppo)).

## Convenzioni del documento

- `⟨numero⟩` = valore di bilanciamento: il valore finale lo decide balance-designer ("bilanciamento", `docs/design/balance.md`).
- «Nome» = nome di narrative-writer ("scrittura"). I testi definitivi sono suoi, in `docs/design/writing.md`, con un codice (es. `CALL-02`): qui li cito, il riferimento è quel file. I testi con numeri sono modelli (`-{p}%`) che leggono il valore dalla configurazione.
- La resa dell'interfaccia (dimensioni, colori, posizioni) è di ui-ux-designer ("ux", `docs/design/ux.md`): qui c'è quello che serve per capire e provare la meccanica.
- Ogni idea ha la stessa struttura: in una frase, come si gioca, regole, contromisure, sinergie, segnali, dati, criteri di accettazione, file, stima.
- I criteri di accettazione sono numerati e ognuno si prova aprendo il gioco con `#debug`.
- "Progetto 1 / 2 / 3" = il primo, secondo e terzo progetto **giocato** (lo stage), non un bioma: l'ordine dei biomi dipende da dove si parte.
- HP dei nemici normali (da `spawnEnemy`): HP base × (1 + 0,25 × minuti) × (1 + 1,3 × stage, da 0).

### Scorciatoie `#debug` proposte

Già usate: `L B G K T O N C F J` (più `M`, `P`, `E`, WASD, frecce, Spazio, Shift, 1–3). Libere e verificate in `src/app.ts` e `src/game/input.ts`:

| Tasto | Idea | Azione |
|---|---|---|
| `Y` | 1 | Fa comparire una «Call di Gruppo» 8 unità davanti al giocatore (rispetta il limite di call vive) |
| `V` | 2 | Dà il passivo «Scorciatoie di Vim» o lo fa salire di un livello |
| `U` | 3 | Fa comparire un «Aggiornamento» 8 unità davanti al giocatore |
| `R` | 4 | +1 RAM e +1 CPU (solo con il loadout a budget attivo) |

Le scorciatoie le aggiunge gameplay-programmer in `src/app.ts`, accanto alle altre.

---

## 1. Nemico «Call di Gruppo»: la call che protegge i bug

**In una frase:** una bolla di chat viola con le cuffie entra con il suono di una notifica: è una call di gruppo. I nemici dentro la call "ne stanno parlando" e nessuno li risolve: prendono meno danno finché non chiudi la call distruggendola.

Nome di scrittura: «Call di Gruppo», perché il nemico *è* la call e il nome spiega l'anello. Il collega chiedeva "qualcosa di legato a Microsoft Teams": il richiamo resta nel suono, nel colore e nelle battute; usare nome e logo veri di Teams è una [decisione aperta per Marco](#decisioni-aperte-per-marco). La meccanica non cambia.

### Fantasia e tema

"Hai un minuto? Facciamo una call per parlarne." Il bug non viene risolto, viene discusso. La call non attacca forte: rende tutti gli altri più difficili da chiudere.
Il collega chiedeva "un effetto fastidioso che rallenta l'uccisione dei bug": qui il rallentamento è letterale (i nemici muoiono in più colpi) e ha un colpevole visibile da eliminare.
"In call" è lo stato **dei nemici**, non del giocatore: il giocatore non ha nessun malus.

### Come si gioca (i primi 5 secondi)

1. Senti il *ding* di una notifica; la prima volta nella partita un banner dice "Chi è in call prende -30% danno" (`CALL-02`).
2. Sulla minimappa compare un segnale lilla, agganciato al bordo come quello degli élite.
3. Vedi un anello lilla tratteggiato a terra intorno a una bolla che fluttua dietro l'orda; i nemici dentro hanno una cuffietta sopra la testa e numeri di danno lilla e più piccoli.
4. Capisci: "devo far fuori quella lilla".

### Regole

- La call cammina verso il giocatore come gli altri, ma **lenta** (`⟨3,4⟩`, tra Riunione 3,0 e Auditor 3,9; il bug fa 5,0): resta dietro l'orda, con l'anello che copre i nemici davanti.
- Dopo `⟨1⟩` s dallo spawn ("sta squillando") apre la call: un anello di raggio `⟨6⟩` unità centrato su di lei, che la segue.
- I nemici **normali** dentro l'anello sono "in call": subiscono `⟨-30%⟩` di danno da ogni fonte (tempo per ucciderli ×1,43). L'effetto non si somma: due anelli sovrapposti danno sempre `⟨-30%⟩`.
- Vale per tutti i nemici normali, non solo per i bug: il Progetto Helios non ha bug.
- **Mai in call**: élite, boss e le altre call (niente gruppi di call che si proteggono a vicenda).
- La call stessa non è protetta. HP base `⟨80⟩` (105 a 75 s nel primo progetto, 720 a fine terzo): circa 2 s di fuoco concentrato quando la si prende di mira. Né istantanea né intoccabile.
- **Spawn a tempo**, come gli élite (`eliteEvery`): una ogni `⟨40 / 35 / 30⟩` s a partire da `⟨75 / 60 / 45⟩` s (progetto 1 / 2 / 3); al massimo `⟨2 / 2 / 3⟩` call vive insieme; nessuna mentre il boss è in campo. Con lo spawn da roster (peso 2) ne tornerebbe una ogni ~5 s e ucciderla non servirebbe a niente.
- Danno a contatto basso (`⟨5⟩`); il pericolo è indiretto. XP `⟨3⟩`.

**Obiettivo di bilanciamento**: velocità d'uccisione complessiva al massimo -10% nei progetti 1–2 e -15% nel 3. Con raggio 6 e -30%: 2 call vive → da -4,5% a -9,7%; 3 call (progetto 3) → da -6,9% a -14,4%. Il raggio 7 lo supera (fino a -19,8%); l'alternativa equivalente sarebbe raggio 7 con -25%. Scelta: raggio 6, -30%.

### Contromisure

- **Raggiungerla con le armi giuste**: le armi che non mirano al più vicino la colpiscono anche dietro l'orda: Deploy di Venerdì (`strike`, bersagli casuali), Spring Boot (`boomerang`, attraversa), Copia da Stack Overflow (`chain`, rimbalza), Foglia di MongoDB (`split`), Alveare JPanik (`swarm`).
- **Andarla a prendere**: con scatto e salto si passa l'orda e la call diventa il nemico più vicino per paperelle e Claude Code. Le armi iniziali di tutti e tre i personaggi (paperella, slide, firewall) non la raggiungono dietro l'orda: per questo l'effetto è -30% e non di più, perché il primo progetto deve restare finibile anche da telefono.
- **Totem NGH**: una call in lista d'attesa chiude l'anello per tutta l'attesa (`⟨6⟩` s).
- **Allontanarsi**: i nemici che escono dall'anello tornano normali.

### Sinergie e build

- Premia le build con almeno un'arma "a bersaglio libero" (strike, chain, boomerang): dà valore a scelte oggi meno popolari.
- Con «Scorciatoie di Vim» (idea 2) la risposta naturale è passare in NORMAL e andarla a prendere.
- Con l'Aggiornamento (idea 3) un aggiornamento in call resiste di più prima del contatto: vedi [Rischi incrociati](#rischi-incrociati-tra-le-idee).

### Segnali visivi e sonori

| Momento | Visivo | Sonoro |
|---|---|---|
| Spawn | sulla minimappa un segnale lilla chiaro con bordo bianco, **agganciato al bordo** come gli élite (un puntino viola sparirebbe tra i quadratini rossi e di notte avrebbe poco contrasto) | notifica sintetizzata, due note brevi che ricordano una notifica di chat senza copiarne una vera; al massimo una ogni `⟨1,5⟩` s |
| Prima comparsa nella partita | un solo banner (`CALL-02`); dalle volte successive niente banner | come sopra |
| Call aperta | anello **lilla chiaro tratteggiato con tratto scuro** a terra intorno alla call (si vede anche di notte); bolla con piccole onde "in chiamata" | nessuno (evita il rumore continuo) |
| Nemico in call | cuffietta sopra la testa (stesso schema del biglietto NGH), **piccola e ferma**: resta finché la call vive. Nessun testo | nessuno |
| Colpo su un nemico in call | numero di danno lilla **e più piccolo**: la dimensione dice "fai meno danno" anche a chi distingue male i colori | colpo normale |
| Call distrutta | le cuffiette spariscono insieme; piccolo sbuffo lilla | "chiamata terminata" (due note discendenti) |

Niente banner a ogni spawn né alla distruzione: con una call ogni 30–40 s sarebbe rumore. Dimensioni e colori esatti: ux.
Sprite e anello disegnati via codice (`src/render/logos/` o `atlas.ts`), tutto nella draw call unica degli sprite. Le cuffiette sono al massimo `⟨40⟩` a schermo.

### Dati proposti

Voce in `src/config/enemies.ts`:

```ts
{ id: 'call', name: 'Call di Gruppo', sprite: 'en_call', hp: 80, speed: 3.4, damage: 5, radius: 0.6, height: 2, xp: 3, gold: 0.2, hover: 1.2, // height 2 (era 1,6): decisione di Marco in fase 2, a 1,6 sul telefono si perdeva nell'orda
  aura: { radius: 6, reduction: 0.3, delay: 1 } }
```

`aura` è un campo nuovo di `EnemyDef` (lavoro di gameplay-programmer), riusabile per altri nemici di supporto; il banner `CALL-02` legge da `aura.reduction` la percentuale. Cadenza, limite di call vive e intervallo minimo del suono in `tuning.ts`.
Lo spawn è a tempo, non nei roster: `biomes.ts` non cambia. Se level-designer vuole escluderla da un progetto, basta un elenco in `tuning.ts`.

### Criteri di accettazione

- [ ] 1.1 Con `#debug`, `Y` fa comparire una call a circa 8 unità davanti al giocatore e si sente la notifica una volta.
- [ ] 1.2 Premendo `Y` 3 volte in meno di un secondo si sente al massimo una notifica.
- [ ] 1.3 Entro `⟨1⟩` s dallo spawn compare l'anello lilla tratteggiato, centrato sulla call, e la segue quando si muove; si vede anche nel progetto di notte.
- [ ] 1.4 Con `G` attivo, un nemico normale dentro l'anello colpito dalla paperella mostra un numero lilla, più piccolo di quelli bianchi, pari a circa il `⟨70%⟩` di quello di un nemico fuori dall'anello (stessa arma, stesso livello, critici esclusi).
- [ ] 1.5 Con `B` il boss entra nell'anello: i suoi numeri restano bianchi e non compare la cuffietta.
- [ ] 1.6 Distrutta la call (`K` o armi), entro `⟨0,3⟩` s spariscono tutte le cuffiette e i numeri tornano bianchi.
- [ ] 1.7 Con `F` (onda NGH) la call in attesa spegne l'anello per tutta l'attesa e lo riaccende quando riparte.
- [ ] 1.8 Nel primo progetto, premendo `Y` 5 volte restano vive al massimo `⟨2⟩` call.
- [ ] 1.9 Senza `Y`, con `T` per superare 75 s, le call compaiono da sole a intervalli di circa `⟨40⟩` s; dopo `B` non ne compaiono finché il boss è vivo.
- [ ] 1.10 La call compare sulla minimappa come segnale lilla con bordo bianco; quando è fuori dalla minimappa resta agganciata al bordo, come gli élite.
- [ ] 1.11 Il banner compare solo alla prima call della partita: con `Y` premuto più volte non si ripete.
- [ ] 1.12 Con `T` fino a fine giornata (280 nemici) e 3 call vive, la logica resta entro il budget di ~0,7 ms/frame (+0,05 ms al massimo) e gli sprite restano in una draw call.
- [ ] 1.13 Su touch non serve alcun input nuovo.

### File toccati

| File | Proprietario | Cosa |
|---|---|---|
| `docs/design/gdd.md` | game-designer | questa specifica |
| `src/config/enemies.ts` | game-designer | voce `call` |
| `src/config/types.ts` | gameplay-programmer (non in tabella: proposta) | campo `aura?` in `EnemyDef` |
| `src/config/tuning.ts` | balance-designer | cadenza, limite, intervallo minimo della notifica |
| `src/game/game.ts`, `src/game/entities.ts` | gameplay-programmer | timer di spawn, stato "in call", riduzione in `damageEnemy`, colore e dimensione dei numeri, banner della prima volta |
| `src/app.ts` | gameplay-programmer | scorciatoia `Y` |
| `src/game/audio.ts` | sound-designer | suoni `notify` e `callEnd` |
| `src/render/logos/` o `src/render/atlas.ts` | technical-artist | sprite della call (bolla viola con cuffie, o logo di Teams se Marco lo sceglie), anello, cuffietta |
| `src/ui/hud.ts` | ui-ux-designer | segnale sulla minimappa (agganciato al bordo), numeri lilla e piccoli |
| `docs/design/writing.md` | narrative-writer | nome, banner, descrizione (`CALL-01…03`) |

### Stima: **M**

Riusa: movimento e contatto dei nemici, schema dell'icona sopra la testa (biglietto NGH), interazione con la lista d'attesa (`frozen`), `addNumber` con colore, timer degli élite in `updateDirector`.
Nuovo nel motore: un'aura nemica che marca i vicini (una query ogni `⟨0,2⟩` s per call, al massimo 3 call: costo trascurabile), il moltiplicatore in `damageEnemy`, cadenza e limite dedicati, la dimensione dei numeri di danno. Più uno sprite animato e due suoni.

### Alternative scartate

- **Debuff sul giocatore "notifiche non lette"** (badge rosso e armi più lente): si percepisce poco nei primi 5 secondi, si sovrappone all'idea 3 (due malus "armi più lente" insieme) e peserebbe anche contro il boss.
- **Cura dei vicini**: una cura piatta è irrilevante sui nemici piccoli ed enorme su quelli grossi (Riunione a fine progetto 1: tempo per ucciderla da 9,7 a 15,9 s, +64%; bug: +9%). Calcolo di bilanciamento.
- **-50% di danno e 24 HP** (prima bozza): esito binario (muore all'istante se è a tiro, intoccabile se non lo è) e troppo duro nel primo progetto, quando nessuna arma iniziale la raggiunge.

---

## 2. Passivo «Scorciatoie di Vim»: NORMAL e INSERT

**In una frase:** un passivo con le due modalità di Vim: quando stai fermo sei in INSERT e attacchi più veloce, quando ti muovi sei in NORMAL e corri più veloce; da fermo sopra gli slot compare `-- INSERT --`, come nella riga di stato di Vim.

### Fantasia e tema

Chi usa Vim non tocca il mouse: fermo scrive codice a raffica, in movimento salta da una parte all'altra con `hjkl`.
Il collega chiedeva "velocità di attacco / movimento": le due modalità di Vim danno proprio l'una o l'altra, a seconda di cosa stai facendo.

### Come si gioca (i primi 5 secondi)

1. Prendi la carta: "Fermo: +12% Velocità d'attacco" / "In movimento: +5% Velocità".
2. Ti fermi: sopra gli slot compare `-- INSERT --`, l'icona di Vim si accende e le armi sparano più spesso.
3. Ti muovi: la scritta sparisce e corri più forte.

### Regole

- È un **passivo puro**: nessun tasto, nessuna combo, nessuna attivazione. Lo stato dipende solo dal fatto che ti stai muovendo o no.
- **INSERT**: nessun input di movimento per almeno `⟨0,4⟩` s → `+⟨12%⟩` velocità d'attacco per livello.
- **NORMAL**: input di movimento (tastiera o joystick oltre la zona morta) o scatto in corso → `+⟨5%⟩` velocità di movimento per livello. Si torna in NORMAL subito, senza ritardo.
- Conta l'input del giocatore, non lo spostamento: le spinte dei nemici non cambiano modalità. Saltare sul posto non esce da INSERT.
- Livello massimo `⟨5⟩` (a fondo: INSERT `+60%` velocità d'attacco, NORMAL `+25%` velocità).
- Occupa uno slot passivo come gli altri tomi.

### Perché non è strettamente migliore di Scrum o del Caffè

- **NORMAL resta sotto il Caffè Doppio** (`5%` contro 8% per livello). La velocità di movimento conta solo mentre ti muovi: se NORMAL valesse quanto il Caffè, Vim sarebbe un Caffè con un bonus gratis.
- **INSERT dà più di Scrum** (`12%` contro 10%) **ma solo da fermi**. Conti di bilanciamento, con *f* = frazione di tempo da fermo: Vim batte Scrum solo con *f* ≥ ~0,8 (torretta quasi pura) e batte il Caffè salvo *f* < ~0,07.
- **Verifica nel playtest**: si misura *f*. Se la mediana su telefono supera 0,5 (alzare il pollice è facile), INSERT scende a `10%` per livello.

| Stile di gioco | Scelta migliore |
|---|---|
| Sempre in movimento (kiting) | Caffè Doppio |
| Sempre fermo (torretta pura) | Scrum o Vim, quasi alla pari |
| Fermati e riparti (raccolta, forzieri, macchinette, aura e orbite) | Scorciatoie di Vim |

Alternativa valutata con bilanciamento: un ibrido sempre attivo (`+6%` attacco e `+4%` movimento per livello). Più semplice, ma è un "un po' di tutto" senza identità né battuta; le due modalità danno una scelta di stile di gioco e la riga `-- INSERT --` che ogni sviluppatore riconosce.

### Contromisure

È un bonus, non c'è nulla da contrastare. Il rischio è nel gioco: fermarsi per l'INSERT lascia avvicinare l'orda (e gli aggiornamenti dell'idea 3).

### Sinergie e build

- **Sistemista + Firewall (`aura`)**: il Firewall vuole i nemici vicini; fermo in INSERT brucia più spesso.
- **Scudo Angular e Slide PowerPoint (`orbit`)**: proteggono mentre stai fermo.
- **Macchinette del caffè e presidi GPI**: lì ti fermi comunque, quindi sei in INSERT gratis.
- **Call di Gruppo (idea 1)**: per andarla a prendere passi in NORMAL.
- **Loadout (idea 4)**: Vim costa quanto Scrum (stessa fascia, `⟨2⟩`). La battuta "Vim non pesa niente" a costo 1 lo renderebbe il miglior rapporto valore/costo del gioco e lo prenderebbero tutti.

### Segnali visivi e sonori

| Momento | Visivo | Sonoro |
|---|---|---|
| Entra in INSERT | scritta `-- INSERT --` in monospazio, senza lampeggio, con entrata e uscita brevi; icona Vim nello slot che si accende | facoltativo e molto basso: un "tic" di tastiera, al massimo uno ogni `⟨1⟩` s. Chi si ferma spesso lo sentirebbe di continuo: decide sound-designer, anche "nessun suono" |
| Torna in NORMAL | **nessuna scritta**: chi gioca a un survivor si muove quasi sempre, una scritta che cambia a ogni sosta sarebbe rumore (ed è quello che fa Vim vero). L'icona torna normale | nessuno |
| Senza il passivo | nessuna scritta | nessuno |

Posizione di `-- INSERT --` (ux, dettagli in `docs/design/ux.md`):

| Schermo | Dove |
|---|---|
| Desktop | in basso a sinistra, subito sopra le righe degli slot (dove la mette Vim vero, accanto all'icona) |
| Telefono in orizzontale | subito sopra la riga degli slot, al centro: non tocca joystick, Salta/Scatto né il prompt "Usa" |
| Telefono in verticale | sopra la riga degli slot; ux alza il prompt "Usa" quanto serve |

### Dati proposti

Voce in `src/config/passives.ts`:

```ts
{ id: 'vim', name: 'Scorciatoie di Vim', description: 'Fermo: velocità d\'attacco. In movimento: velocità', icon: 'ic_vim',
  stat: 'attackSpeed', amount: 0.12, fmt: 'pct', maxLevel: 5,
  modes: { still: { stat: 'attackSpeed', amount: 0.12 }, moving: { stat: 'moveSpeed', amount: 0.05 } } }
```

`modes` è un campo nuovo di `PassiveDef` (lavoro di gameplay-programmer); la forma esatta la sceglie chi implementa. La carta mostra **due righe d'effetto da ≤ 32 caratteri** (`Card.lines` ne accetta già più di una): "Fermo: +12% Velocità d'attacco" / "In movimento: +5% Velocità". Le percentuali seguono la rarità (con Bloccante restano entro 32 caratteri). La battuta ":q!" di scrittura va sulla carta solo se c'è spazio dopo le due righe d'effetto, mai al loro posto.

### Criteri di accettazione

- [ ] 2.1 Con `#debug`, `V` dà Vim al livello 1; premuto di nuovo lo porta al livello successivo, fino a 5.
- [ ] 2.2 Con Vim e senza toccare i comandi per `⟨0,4⟩` s compare `-- INSERT --`; col Developer al livello 1 di Vim il cooldown della paperella passa da 0,75 / 1,10 ≈ 0,68 s a 0,75 / 1,22 ≈ 0,61 s.
- [ ] 2.3 Appena si muove il joystick o si preme WASD la scritta `-- INSERT --` sparisce, nessun'altra scritta la sostituisce e la velocità d'attacco torna quella senza Vim nello stesso frame.
- [ ] 2.4 In NORMAL la velocità di movimento è `+⟨5%⟩` per livello rispetto a senza Vim.
- [ ] 2.5 Saltare sul posto non esce da INSERT; lo scatto sì.
- [ ] 2.6 Un nemico che spinge il giocatore fermo (con `G` attivo) non lo fa uscire da INSERT.
- [ ] 2.7 Senza Vim non compare nessuna scritta.
- [ ] 2.8 Su touch: alzare il pollice dal joystick porta in INSERT, senza pulsanti nuovi.
- [ ] 2.9 La carta di Vim mostra i due effetti su due righe di al massimo 32 caratteri l'una, senza andare a capo su telefono in verticale.
- [ ] 2.10 Su telefono in orizzontale e in verticale `-- INSERT --` non copre joystick, Salta, Scatto né il prompt "Usa".

### File toccati

| File | Proprietario | Cosa |
|---|---|---|
| `src/config/passives.ts` | game-designer | voce `vim` |
| `src/config/types.ts` | gameplay-programmer (proposta) | campo `modes?` in `PassiveDef` |
| `src/config/tuning.ts` | balance-designer | ritardo per INSERT, valori per livello |
| `src/game/game.ts`, `src/game/cards.ts` | gameplay-programmer | rilevare "fermo", ricalcolare le statistiche solo al cambio di modalità, carta con due righe d'effetto |
| `src/app.ts` | gameplay-programmer | scorciatoia `V` |
| `src/ui/hud.ts`, `src/ui/style.css` | ui-ux-designer | scritta `-- INSERT --`, icona accesa, prompt "Usa" alzato in verticale |
| `src/render/atlas.ts` | technical-artist | icona `ic_vim` |
| `src/game/audio.ts` | sound-designer | "tic" di tastiera (facoltativo) |
| `docs/design/writing.md` | narrative-writer | nome, righe della carta, battute (`VIM-…`) |

### Stima: **S**

Riusa: passivi, carte, `recomputeStats`, input già normalizzato tra tastiera e touch.
Nuovo nel motore: un timer di immobilità e un passivo con due effetti condizionati (poche decine di righe). Il ricalcolo avviene solo al cambio di modalità, non ogni frame. Più una scritta nell'HUD e un'icona.

---

## 3. Debuff «Aggiornamento»: l'arma che si riavvia

**In una frase:** a intervalli regolari arriva un nemico-aggiornamento lento e basso con la sua barra di download; se ti tocca si installa su una delle tue armi, che resta ferma per qualche secondo.

### Fantasia e tema

"Il tuo dispositivo verrà riavviato per completare l'installazione." Succede sempre nel momento peggiore.
Il collega chiedeva un debuff che "blocca un'arma/strumento per tot secondi": qui ha una causa visibile, un preavviso lungo e si può evitare.

### Perché un nemico e non un evento a orario

Bilanciamento proponeva un evento a orario (un'arma a caso bloccata a intervalli fissi, con 3 s di preavviso). La proposta tiene **la sua cadenza e i suoi vincoli**, ma l'evento diventa lo spawn di un nemico (bilanciamento d'accordo: la frequenza resta sotto controllo e in più c'è una contromisura):

| | Evento a orario | Nemico a orario (proposta) |
|---|---|---|
| Preavviso | 3 s | ~10 s: arriva da 30–42 unità a velocità `⟨3,2⟩` |
| Fonte visibile | banner | una scatola con la barra di download che ti viene incontro |
| Contromisure | nessuna | ucciderlo, saltarlo, scatto, scudi, NGH |
| Perdita di danni (calcolo di bilanciamento, 4 armi) | fissa | media 1,9% se si evita metà dei contatti, al massimo 3,75%; picco -25% per 6 s |

Un debuff che non si può evitare è una punizione a caso; un debuff con una causa che si vede arrivare è una sfida.
Non va nei roster dei biomi: con peso 2 su 23 ne arriverebbero ~20 al minuto e un'arma resterebbe bloccata quasi sempre.

### Come si gioca (i primi 5 secondi)

1. Vedi una scatola bassa con una barra di avanzamento che si riempie, lenta.
2. Se ti tocca sparisce in un lampo; sopra di te compare per 1 s l'icona dell'arma colpita (la prima volta nella partita anche il banner "Un'arma si sta aggiornando!", `UPD-02`) e quello slot si blocca.
3. Quell'arma smette di colpire; finita l'installazione la sua icona ricompare sopra di te con una spunta ✓ e un *ding* di riavvio.
4. La volta dopo lo salti o lo uccidi prima.

### Regole

- **Spawn a tempo**, come gli élite: uno ogni `⟨30⟩` s (±5) a partire da `⟨90⟩` s; al massimo `⟨2⟩` vivi; nessuno mentre il boss è in campo (uno Scudo Angular bloccato contro il boss sarebbe un picco ingiusto).
- Il nemico si muove piano (`⟨3,2⟩`), ha HP medi (`⟨40⟩` base), è **basso** (`⟨1,5⟩` di altezza): si scavalca col salto.
- **Contatto** (come il danno da contatto, ma con lo scatto attivo non succede nulla): infligge un danno basso (`⟨4⟩`), **si consuma** (sparisce senza XP né drop) e mette in aggiornamento un'arma per `⟨6⟩` s.
- **Quale arma**: a caso, ma **mai la stessa due volte di fila**.
- **Al massimo un'arma in aggiornamento alla volta**, e **`⟨8⟩` s di tregua dopo ogni riavvio**: in quei casi il contatto fa solo danno e il nemico si consuma comunque. Tetto teorico del tempo con un'arma bloccata: 6 / (6 + 8) = 43%.
- **Mai sull'unica arma**: con una sola arma il contatto fa solo danno. A inizio partita non si resta mai a mani vuote.
- **Arma in aggiornamento**: non avvia nuovi attacchi e non fa danno; quello che è già in volo finisce la sua corsa. Orbite, aura, aiutanti di Claude Code e alveare JPanik si spengono fino al riavvio.
- Solo armi: i passivi non vanno mai in aggiornamento (un passivo spento non si vedrebbe).
- L'aggiornamento non conta come danno: `G` (invincibile) e l'armatura (Unit Test) non lo fermano, lo scatto sì.

### Contromisure

- **Ucciderlo prima**: è lento e ha HP medi.
- **Saltarlo**: è basso, il salto lo scavalca (già oggi saltando si evitano i nemici bassi).
- **Scatto**: l'invulnerabilità dello scatto evita anche l'installazione.
- **Scudi Angular**: la respinta lo tiene lontano.
- **Totem NGH**: in lista d'attesa non si muove ed è innocuo (già così per tutti i nemici).
- **Più armi**: con 4 armi perderne una per 6 s costa circa un quarto dei danni per 6 s.

### Sinergie e build

- Premia la diversificazione: chi ha 4 armi soffre meno di chi ne ha 2 grosse.
- Con il loadout a budget (idea 4) pesa di più su chi ha scelto poche armi pesanti: un compromesso in più.
- Con «Scorciatoie di Vim» (idea 2) stare fermi in INSERT lascia arrivare gli aggiornamenti.
- Con la Call di Gruppo (idea 1) l'aggiornamento in call resiste di più prima del contatto.

### Segnali visivi e sonori

| Momento | Visivo | Sonoro |
|---|---|---|
| Nemico in arrivo | scatola bassa con barra di download che si riempie (animazione a fotogrammi) | nessuno |
| Contatto | lampo, il nemico sparisce; **icona dell'arma colpita sopra il giocatore per 1 s** (dice quale arma senza leggere, dove stai guardando) | suono di "spegnimento" (tono discendente) |
| Primo aggiornamento della partita | un solo banner (`UPD-02`); dalle volte successive niente banner. Il nome dell'arma non ci sta nel banner: lo dice l'icona | come sopra |
| Arma in aggiornamento | slot bloccato: velo grigio e spicchio scuro che si ritira (dettagli in `docs/design/ux.md`) | nessuno |
| Riavvio | **la stessa icona sopra il giocatore con una spunta ✓ per 0,5 s**; lo slot torna normale. Nessun testo | suono di "riavvio" (due note ascendenti) |

Nessun testo nel mondo sopra il giocatore oltre alle icone. La parola "aggiornamento" in interfaccia è riservata a questo debuff: gli upgrade delle carte restano "Lv 3 → 4".

### Dati proposti

Voce in `src/config/enemies.ts`:

```ts
{ id: 'update', name: 'Aggiornamento', sprite: 'en_update', hp: 40, speed: 3.2, damage: 4, radius: 0.65, height: 1.5, xp: 3, gold: 0.2,
  fps: 0.8, // fase 2: la barra di download si riempie in 10 s, quanto il preavviso
  badge: { sprite: 'update_badge', y: 2.4, size: 0.85 }, // fase 2, decisione del lead: in mezzo all'orda la scatola alta 1,5 è coperta; il segnale sta sopra le teste e la scatola resta scavalcabile
  onTouch: { lockWeapon: true, consume: true } }
```

`onTouch` è un campo nuovo di `EnemyDef` (lavoro di gameplay-programmer). Cadenza, durata, tregua e limiti in `tuning.ts`. Lo spawn è a tempo: `biomes.ts` non cambia.

### Criteri di accettazione

- [ ] 3.1 Con `#debug`, `U` fa comparire un «Aggiornamento» a circa 8 unità davanti al giocatore.
- [ ] 3.2 Con almeno 2 armi (`N`), toccandolo da fermi (anche con `G` attivo) il nemico sparisce senza lasciare XP, sopra il giocatore compare per 1 s l'icona dell'arma colpita e quello slot si blocca per `⟨6⟩` s.
- [ ] 3.3 Il banner compare solo al primo aggiornamento della partita; con altri `U` toccati non si ripete.
- [ ] 3.4 Durante l'aggiornamento quell'arma non fa danni: nella schermata finale (danni per arma) il contatore di quell'arma non cresce in quei secondi.
- [ ] 3.5 Finito l'aggiornamento l'arma riprende ad attaccare senza intervento del giocatore, sopra il giocatore compare per 0,5 s la sua icona con la spunta ✓ e si sente il suono di riavvio.
- [ ] 3.6 Toccando un secondo «Aggiornamento» mentre il primo è in corso, nessun'altra arma va in aggiornamento.
- [ ] 3.7 Toccando un «Aggiornamento» entro `⟨8⟩` s da un riavvio, nessuna arma va in aggiornamento.
- [ ] 3.8 Con 2 armi, due aggiornamenti in sequenza (il secondo dopo la tregua) bloccano due armi diverse.
- [ ] 3.9 Con una sola arma il contatto fa solo danno: nessuno slot si blocca.
- [ ] 3.10 Saltandolo all'apice non succede nulla.
- [ ] 3.11 Attraversandolo con lo scatto non succede nulla.
- [ ] 3.12 Con `F` (onda NGH) il nemico in attesa si può toccare senza effetti.
- [ ] 3.13 Con `N` per avere Claude Code e Alveare JPanik: messi in aggiornamento, l'aiutante e l'alveare non colpiscono fino al riavvio.
- [ ] 3.14 Senza `U`: con `T` oltre 90 s il nemico compare da solo circa ogni `⟨30⟩` s, mai più di `⟨2⟩` vivi; prima di 90 s e con il boss in campo (`B`) non compare.
- [ ] 3.15 Su touch lo slot bloccato si distingue dagli altri nell'HUD compatto.

### File toccati

| File | Proprietario | Cosa |
|---|---|---|
| `src/config/enemies.ts` | game-designer | voce `update` |
| `src/config/types.ts` | gameplay-programmer (proposta) | campo `onTouch?` in `EnemyDef` |
| `src/config/tuning.ts` | balance-designer | cadenza, durata, tregua, limiti |
| `src/game/game.ts`, `src/game/weapons.ts` | gameplay-programmer | timer di spawn, contatto che si consuma, stato `locked` su `WeaponInstance`, salto di `updateWeapon` e del disegno degli oggetti persistenti, ultima arma aggiornata, tregua, banner della prima volta |
| `src/app.ts` | gameplay-programmer | scorciatoia `U` |
| `src/ui/hud.ts`, `src/ui/style.css` | ui-ux-designer | slot bloccato, icone sopra il giocatore |
| `src/render/atlas.ts` o `src/render/logos/` | technical-artist | sprite del nemico con barra di download, spunta ✓ |
| `src/game/audio.ts` | sound-designer | suoni `powerDown` e `reboot` |
| `docs/design/writing.md` | narrative-writer | nome del nemico, banner della prima volta (`UPD-…`) |

### Stima: **M**

Riusa: contatto nemico e regola del salto sui nemici bassi, invulnerabilità dello scatto, lista d'attesa NGH, respinta degli scudi, timer degli élite, slot dell'HUD, banner.
Nuovo nel motore: un effetto a contatto che si consuma, un timer di blocco per arma (va rispettato da tutti gli 11 kind, compresi quelli con oggetti persistenti: `orbit`, `aura`, `minion`, `swarm`), la tregua, lo slot bloccato.

### Varianti non incluse

- Bloccare lo scatto invece di un'arma ("strumento"): leggibile sul pulsante Scatto, ma toglie la contromisura principale. Da valutare dopo il playtest.
- Bonus temporaneo dopo il riavvio ("nuove funzionalità"): aggiunge complessità e invoglia a farsi aggiornare apposta. Escluso.

---

## 4. Loadout «PC aziendale»: budget CPU/RAM al posto degli slot

> **Decisione aperta per Marco.** Questa sezione confronta le opzioni e dà una raccomandazione motivata. Non è approvata: finché Marco non decide restano gli slot di oggi (`maxWeapons: 4`, `maxPassives: 4` in `src/config/tuning.ts`). I conteggi completi di tutte le varianti sono in `docs/design/balance.md` §5.

**L'idea del collega:** invece di 4 slot armi e 4 passivi, hai una certa quantità di CPU e RAM e scegli cosa installare: "scelgo Vim e Claude Code, o finisco tutta la RAM su IntelliJ?".

### Le opzioni

| | A. Slot (oggi) | B. Una risorsa per categoria (raccomandata) | C. Una risorsa per oggetto | D. Due costi per oggetto |
|---|---|---|---|---|
| Regola | 4 armi + 4 passivi | **armi → RAM**, **passivi → CPU**; ogni oggetto ha un costo | ogni oggetto costa **una** risorsa scelta per lui (es. Claude Code RAM, Firewall CPU) | ogni oggetto costa sia CPU sia RAM |
| Chi la propone | — | ux (prima proposta: "un costo per carta"), bilanciamento (la più facile da tarare) | game-designer al giro 2 | bilanciamento, prima proposta |
| Cosa legge il giocatore | "c'è uno slot libero?" | un chip; la risorsa la dice già il tipo di carta (arma o passivo) | un chip, ma la risorsa cambia da oggetto a oggetto e va ricordata | due chip, due confronti |
| Scelta di build | ampiezza fissa | pesanti contro leggeri, dentro le armi e dentro i passivi; le 4 armi più forti (12) non stanno in 9 di RAM | come B, più armi contro passivi; a 8/8 le 4 armi più forti ci stanno, "poche armi più passivi premium" no | come C, più l'incastro tra le due risorse |
| HUD | due righe di slot | **le stesse due righe**: riga armi = RAM, riga passivi = CPU | due righe per risorsa, armi e passivi mescolati | due barre per ogni oggetto |
| Bilanciamento | fatto | due zaini indipendenti, il più semplice | bilanciabile (a 8/8: 8,1–8,4 oggetti, 23 composizioni), con più conti da tenere | il più difficile |
| Battuta del collega | no | sì: IntelliJ si mangia la RAM delle armi | sì, anche "Vim e Claude Code" | sì |
| Costo | zero | L | L | L+ |

La **RAM unica condivisa** della prima bozza è scartata: con 16 unità supera le ~12 tacche che stanno nell'HUD e la scala dei costi non tornava (4 armi da 4 riempivano già tutto).

### Raccomandazione del game-designer

**B, come esperimento dietro un flag, dopo le idee 1–3.**

- È la più leggibile: la risorsa la dice il tipo di carta, quindi ogni carta ha un solo numero da confrontare con una sola barra. Ux la considera la più leggera delle varianti nuove: su telefono la riga di icone resta identica a oggi.
- Riusa le due righe di slot che l'HUD ha già.
- È la più facile da bilanciare: due zaini indipendenti.
- Tiene la battuta principale: le armi stanno nella RAM, quindi "tutta la RAM su IntelliJ" funziona.
- I dati sono compatibili con C: se il playtest chiede più profondità, basta dare a qualche oggetto l'altra risorsa.

Al giro 2 raccomandavo C. Ho cambiato idea per i conti di bilanciamento e perché in C la risorsa di ogni oggetto va ricordata: è memoria, non riconoscimento. C resta bilanciabile: tra B e C la scelta è di Marco.

### Cosa cambia con B, sistema per sistema

| Sistema | Oggi | Con B |
|---|---|---|
| Carte level-up | arma o passivo nuovo solo se c'è lo slot | arma nuova solo se ci sta nella RAM libera, passivo nuovo solo se ci sta nella CPU libera. Sulla carta un chip **"RAM 3" o "CPU 2"** accanto al nome (stessa parola della barra, **nessuna unità**: niente "GB" né "core") e, piccolo, quanto resterà dopo ("→ 6/9"). Gli upgrade di ciò che hai non costano nulla e restano come oggi |
| Finestra della scelta | titolo e carte | sotto il sottotitolo, su una riga e **nello stesso ordine delle righe dell'HUD (armi sopra)**: "RAM 6/9 · CPU 4/7" a tacche |
| Ordini d'acquisto (forzieri) | carta di rarità almeno Media | invariati: nessuna carta che allarga il budget (ne arriverebbero 2–3 a partita e il vincolo sparirebbe) |
| Macchinette del caffè | bonus permanenti fuori dagli slot | invariate: le bevande non costano nulla |
| JOscar | premio, carte almeno Alte | tra i premi anche «Banco di RAM» (+1 RAM) o «Processore Nuovo» (+1 CPU): carta con tag "Bonus" e, sotto il nome, "RAM 9 → 10". Nessun banner: la scelta stessa è il feedback. Al massimo `⟨+2⟩` a partita. Fase 2, decisione del lead: è una sola carta delle tre (l'ultima), sulla risorsa con meno spazio libero rispetto al massimo (a parità a caso), così le altre due restano premi veri |
| Personaggi | stessi slot per tutti | RAM totale diversa solo per compensare il peso dell'arma iniziale (vedi le regole): tutti partono con le stesse risorse libere, quindi **nessun chip del budget nella schermata del titolo**. Un chip col totale farebbe credere a una differenza che in gioco non c'è (ux e bilanciamento). Il chip torna solo se un giorno le risorse libere alla partenza saranno diverse |
| HUD in combattimento | due file di 4 slot | **desktop**: le due righe diventano "Gestione attività": icone larghe in proporzione al costo, parte libera tratteggiata. **Telefono**: icone di dimensione fissa come oggi, nessuna barra in combattimento |
| Risorsa insufficiente | slot pieni | **non** nell'HUD in combattimento: nella finestra della scelta, una riga sotto le barre quando il filtro ha escluso oggetti nuovi: "RAM insufficiente", "CPU insufficiente" o "RAM e CPU insufficienti" (`PC-06…08`). "Insufficiente" è vero anche quando la risorsa è quasi piena (6/7 e niente da 1), "al 100%" no |
| Mobile | slot leggibili | un chip in più sulla carta; al massimo `⟨10⟩` icone in tutto, perché su iPhone SE in orizzontale la riga ha ~320 px utili |
| Rigiocabilità | build simili per ampiezza | archetipi nuovi: "monolite" (un'arma pesante), "microservizi" (tante armi leggere) |
| Design di armi nuove | ogni arma vale uno slot | un'arma può essere più forte se costa di più: una leva oltre la rarità (es. un futuro IntelliJ da `⟨3⟩` RAM) |

### Regole proposte per B

- **RAM delle armi**: `⟨9⟩` per il Developer, `⟨8⟩` per Project Manager e Sistemista. La Paperella pesa `⟨3⟩`, Slide e Firewall `⟨2⟩`: così tutti partono con 6 RAM libere. Con 9 per tutti, PM e Sistemista avrebbero il 4% di oggetti in più a fine build.
- **CPU dei passivi**: `⟨7⟩` per tutti.
- Costi: armi `⟨1–3⟩`, passivi `⟨1–4⟩` (Multitasking 4; Vim nella fascia di Scrum, `⟨2⟩`), in proporzione al valore. Oggi le armi vanno da 0,42 (Tazza di Java) a 1,58 (Foglia di MongoDB): le 4 armi più forti costano 12 e non stanno nella RAM, quindi il compromesso si vede già con le armi di oggi.
- Il budget cresce solo ai JOscar (`⟨+1⟩` RAM o CPU a scelta, al massimo `⟨+2⟩` a partita).
- Tetti di sicurezza: al massimo `⟨6⟩` armi, `⟨6⟩` passivi e `⟨10⟩` oggetti in tutto (limite dell'HUD su telefono). Nel primo progetto non scattano mai (si arriva al massimo a 5 + 5); servono nel terzo.
- Si paga una volta, all'installazione: i livelli salgono gratis, quindi gli upgrade di ciò che hai ci stanno sempre.
- L'arma iniziale conta nel budget.
- Una carta che non ci sta **non viene proposta** (come oggi con gli slot pieni): niente carte morte. Se non ci sta più niente di nuovo restano upgrade e carte di riserva (Rimborso Spese, Pizza di Team), come oggi.
- Si sceglie durante la partita, con le carte, come oggi. Nessuna scelta prima della partita.
- Niente disinstallazione ("Termina attività") nella prima versione: richiede una schermata in più. Da valutare dopo il playtest. Per lo stesso motivo nessun testo invita a "liberare RAM".
- Tutto dietro un flag in `tuning.ts` (`loadout: 'slots' | 'budget'`): si confrontano le due versioni giocando, senza buttare via gli slot. Fase 2: default `'budget'`, perché Marco ha approvato B.

### Pro e contro di B rispetto agli slot

**Pro**
- Tema: "IntelliJ si mangia la RAM" lo capisce chiunque lavori in ufficio.
- Scelte di build vere dentro ogni categoria: profondità contro ampiezza.
- Si distingue da PokeBonk/Megabonk, come chiedeva il collega.
- Dà una leva di design (il costo) per armi più forti senza renderle strettamente migliori.
- Cambia poco l'HUD: le due righe di slot restano, cambia come si riempiono.

**Contro**
- Un chip in più su ogni carta e una riga di barre nella finestra della scelta.
- Ogni arma e passivo ha bisogno di un costo tarato: lavoro di bilanciamento che va rifatto a ogni oggetto nuovo.
- Il "quasi pieno" è meno chiaro dello slot pieno: serve la riga "… insufficiente".
- Armi e passivi non competono tra loro: la battuta "Vim e Claude Code" del collega vale solo in C.
- È il cambiamento più grosso dei quattro: tocca carte, HUD, JOscar, tipi e tutti i file di contenuto.

### Criteri di accettazione (solo se Marco sceglie B)

- [ ] 4.1 Con `loadout: 'slots'` il gioco si comporta esattamente come oggi.
- [ ] 4.2 Con `loadout: 'budget'`, su desktop la riga delle armi mostra la RAM e quella dei passivi la CPU, con le icone larghe in proporzione al costo e la parte libera tratteggiata; su telefono le icone restano di dimensione fissa e non ci sono barre in combattimento.
- [ ] 4.3 Con `L` la finestra della scelta mostra su una riga le barre "RAM … · CPU …" (RAM prima), anche su telefono in verticale; le stesse barre ci sono in pausa.
- [ ] 4.4 Con `L` ripetuto, nessuna carta di arma nuova costa più della RAM libera e nessuna di passivo nuovo più della CPU libera.
- [ ] 4.5 Ogni carta di arma o passivo nuovo mostra un solo chip senza unità ("RAM 3" o "CPU 2") accanto al nome e quanto resterà dopo ("→ 6/9"); le carte di upgrade sono identiche a oggi.
- [ ] 4.6 Con `R` (+1 RAM, +1 CPU) tornano a uscire carte che prima non ci stavano.
- [ ] 4.7 Con `J` (JOscar) tra i premi può comparire «Banco di RAM» o «Processore Nuovo», con "RAM 9 → 10" (o "CPU 7 → 8") sotto il nome e nessun banner; dopo due di questi premi nella stessa partita non compaiono più.
- [ ] 4.8 Con `L` ripetuto non si superano mai 6 armi, 6 passivi e 10 oggetti in tutto.
- [ ] 4.9 Le bevande della macchinetta e i forzieri (`O`) non cambiano il budget.
- [ ] 4.10 Quando le carte nuove di una risorsa sono escluse, la finestra della scelta lo dice in una riga sotto le barre ("RAM insufficiente", "CPU insufficiente" o "RAM e CPU insufficienti"); l'HUD in combattimento non mostra nessun avviso.
- [ ] 4.11 La schermata del titolo non mostra nessun chip del budget; a inizio partita (prima carta con `L`) tutti e tre i personaggi hanno 6 RAM e 7 CPU libere.

### File toccati (solo se B)

| File | Proprietario | Cosa |
|---|---|---|
| `src/config/tuning.ts` | balance-designer | `loadout`, budget iniziale, crescita ai JOscar, tetti |
| `src/config/types.ts` | gameplay-programmer (proposta) | `cost` su `WeaponDef` e `PassiveDef`, budget su `CharacterDef` |
| `src/config/weapons.ts`, `passives.ts`, `characters.ts` | game-designer | costi e budget per personaggio (numeri da bilanciamento) |
| `src/game/cards.ts`, `src/game/game.ts` | gameplay-programmer | filtro delle carte, risorse usate e massime, premi del JOscar |
| `src/app.ts` | gameplay-programmer | scorciatoia `R` |
| `src/ui/hud.ts`, `src/ui/screens.ts`, `src/ui/style.css` | ui-ux-designer | righe "Gestione attività" su desktop, barre nella finestra della scelta e in pausa, chip di costo, riga "insufficiente" (nessun chip nel titolo) |
| `src/render/atlas.ts` | technical-artist | icone di «Banco di RAM» e «Processore Nuovo»; lo sprite del Memory Leak ha scritto "RAM 99%": resta come battuta, senza effetto sulla RAM del giocatore |
| `docs/design/writing.md` | narrative-writer | testi `PC-01…12` |
| `README.md` | lead (non in tabella) | "Come aggiungere un'arma o un passivo": il costo |

### Stima: **L**

Riusa: generazione delle carte, rarità, carte di riserva, premi del JOscar, le due righe di slot.
Nuovo: un campo di costo su ogni oggetto, il filtro delle carte, le barre, i premi del JOscar, budget per personaggio, una passata di bilanciamento su tutto il contenuto.

---

## Rischi incrociati tra le idee

- **Call + Aggiornamento nello stesso momento**: un aggiornamento in call subisce `⟨-30%⟩` di danno, quindi resiste circa 1,4 volte di più prima del contatto. Con al massimo 2 aggiornamenti vivi, la tregua di 8 s e un'arma bloccata alla volta il rischio è contenuto; da verificare nel playtest. Se serve, gli aggiornamenti si escludono dalla call.
- **Troppi debuff**: la call agisce sui nemici, l'Aggiornamento sulle armi del giocatore: due effetti diversi, ciascuno con un colpevole visibile e una contromisura.
- **Rumore**: un solo banner per partita per ciascuna meccanica, notifica della call limitata nel tempo, nessun suono continuo per call e aggiornamenti in corso.

## Ordine di sviluppo

1. **Scorciatoie di Vim (S)**: poco lavoro, nessun nemico nuovo, prova subito il linguaggio dell'HUD (scritta `-- INSERT --`).
2. **Call di Gruppo (M)**: è l'idea principale del collega e introduce l'aura nemica e lo spawn a tempo, riusabili.
3. **Aggiornamento (M)**: riusa lo spawn a tempo della call e introduce lo stato "arma bloccata", che tocca tutti gli 11 kind: meglio farlo quando il resto è stabile.
4. **Loadout a budget (L)**: solo dopo la decisione di Marco.

## Decisioni aperte per Marco

1. **Loadout**: A (slot di oggi), B (una risorsa per categoria: raccomandata come esperimento), C (una risorsa per oggetto) o D (due costi per oggetto). Vedi [idea 4](#4-loadout-pc-aziendale-budget-cpuram-al-posto-degli-slot).
2. **Marchio di Teams**: il collega chiedeva "qualcosa di legato a Microsoft Teams". Scrittura consiglia la «Call di Gruppo» generica (bolla viola con cuffie), perché oggi i marchi reali del gioco stanno tutti dalla parte del giocatore (armi, presidi, totem) e i nemici sono concetti (Bug, Email URGENTE, Riunione, Il Cliente): Teams sarebbe il primo marchio reale "cattivo". Con nome e logo veri la meccanica non cambia: cambiano solo sprite e nome.
3. **Proprietario di `src/config/types.ts`**: non è nella tabella di `CLAUDE.md`; le idee 1–4 lo toccano tutte. Proposta: gameplay-programmer.

## Registro del confronto nel team

| Idea | Bilanciamento | UX | Scrittura | Esito |
|---|---|---|---|---|
| 1 Call di Gruppo | giro 1: spawn a tempo invece del roster, -30%, HP 80, velocità 3,4, valori per stage → accolto; giro 2: **OK** con raggio 6 invece di 7 (obiettivo -10% / -15%) → **accolto** | giro 1: segnale in minimappa agganciato al bordo, numeri lilla e più piccoli, cuffiette piccole e ferme, anello tratteggiato, banner una volta → accolto; giro 2: **OK pieno** | nome «Call di Gruppo» (dopo un passaggio da «Ping», ritirato), banner `CALL-02`, marchio come decisione per Marco → **accolto** | **OK di entrambi** |
| 2 Scorciatoie di Vim | giro 1: **OK** a 12% / 5%, max 5; condizioni: nel loadout costa come Scrum, misura di *f* nel playtest → accolte; giro 2: **OK** confermato | giro 1: NORMAL nascosto, posizione di `-- INSERT --`, carta su due righe → accolto; giro 2: **OK pieno** | nome «Scorciatoie di Vim», due righe della carta, ":q!" solo se c'è spazio → **accolto** | **OK di entrambi** |
| 3 Aggiornamento | giro 1: niente roster, spawn ogni 30 s da 90 s, max 2 vivi, tregua 8 s, mai col boss → accolto; giro 2: **OK pieno**, anche alla fonte "nemico" e a "mai sull'unica arma" | giro 2: banner col nome dell'arma e rotellina nello slot → tolti; giro 3: **OK pieno** | nome «Aggiornamento», banner `UPD-02` → accolto; banner a caso dalla seconda volta e testo al riavvio → **non accolti** (rumore), scrittura d'accordo | **OK di entrambi** |
| 4 Loadout | giro 1: RAM unica sbagliata nei conti, preferisce per categoria, budget dai JOscar e non dai forzieri → accolto, raccomandazione passata a B; giro 2: **OK sui numeri** di B, RAM 9 / 8 / 8 per personaggio → accolto | giro 3: **OK** a B, RAM prima di CPU nelle barre, premio del JOscar senza banner → accolto; nessun chip del budget nel titolo finché le risorse libere alla partenza sono uguali (d'accordo bilanciamento) → accolto (criterio 4.11) | "PC aziendale", chip "RAM 3", "… insufficiente", «Banco di RAM», «Processore Nuovo» → **accolto** | OK di entrambi su B; **adozione: decisione per Marco** |
