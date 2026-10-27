# Testi di JBonk

Voce del gioco, glossario e ogni stringa approvata con il posto in cui vive.
Chi aggiunge o cambia un testo visibile al giocatore parte da qui; i campi di testo in `src/` li scrivono i loro proprietari (vedi [Consegne](#consegne-ai-proprietari)).

> **Stato:** v5 finale, fase 1 (solo design). Confronto chiuso con "designer" e "ux": `gdd.md` e `ux.md` sono allineati a questo file. I numeri tra `{}` arrivano dai file in `src/config/` (`tuning.ts`, `enemies.ts`, `passives.ts`): il testo li legge, non li ripete a mano.

## In breve

| Idea | Nome | Testo chiave | Battuta migliore |
|---|---|---|---|
| 1. Nemico legato a Teams | **Call di Gruppo** (stato dei nemici: **in call**) | "Chi è in call prende -30% danno" | "Il bug non si risolve: si discute" |
| 2. Passivo di Vim | **Scorciatoie di Vim** | "Fermo: +12% Velocità d'attacco" / "In movimento: +5% Velocità" | "Per uscire: :q! (in teoria)" |
| 3. Debuff aggiornamento | nemico **Aggiornamento**, arma **in aggiornamento** | "Un'arma si sta aggiornando!" | "Riavvio pianificato alle 17:59" |
| 4. Loadout CPU/RAM | **PC aziendale**: armi a RAM, passivi a CPU | "RAM 3" / "CPU 2" sulla carta, "RAM insufficiente" | "Richiesta hardware approvata. Dopo sei mesi." |

Unica decisione aperta dal lato dei testi: [marchio reale di Teams o parodia](#decisioni-aperte-per-marco). Il loadout intero è una decisione di Marco nel GDD: i testi del §4 servono solo se lo approva.

## Tono di voce

1. **Si ride con chi lavora, non di qualcuno.** Satira affettuosa dell'ufficio e della consulenza: il nemico è la situazione (la call che non risolve niente, l'aggiornamento alle 17:59), mai una persona, un cliente o un prodotto.
2. **I marchi reali stanno dalla parte del giocatore.** Oggi tutti i marchi veri sono armi o aiuti (Claude Code, Angular, Java, Spring, MongoDB, JPanik, GPI, NGH, Soldo, JOscar). I nemici sono concetti: Bug, Email URGENTE, Riunione, Il Cliente. Le idee nuove seguono la stessa regola.
3. **Prima la meccanica, poi la battuta.** Il giocatore deve capire cosa succede e di quanto. Nessun testo promette un effetto o un'azione che non c'è (niente "migliorato" dopo un riavvio, niente "libera RAM" senza disinstallazione). I numeri che il bilanciamento può cambiare si leggono dalla configurazione, non si scrivono nel testo.
4. **Corto vince.** Si legge mentre ti sparano addosso: un solo banner per meccanica, una riga per effetto. Le battute lunghe vanno nel titolo o nella pausa.
5. **Italiano corretto, gergo vero.** Accenti giusti (è, più, novità), il gergo IT come lo dice davvero un ufficio italiano ("sei in call", "deploy", "non spegnere il computer"), senza tradurre a forza.

## Glossario

Stessa idea, stessa parola. Le voci con ✱ sono nuove, introdotte dalle 4 idee.

| Termine | Significa nel gioco | Non usare |
|---|---|---|
| giornata | un livello, dalle 09:00 alle 18:00 | turno, round |
| progetto | bioma / stage | livello, mondo |
| promozione | level-up | livello su |
| carta-ticket, ticket | la carta da scegliere | — |
| priorità (Bassa, Media, Alta, Bloccante) | rarità della carta | rarità, raro |
| potenziamento ("Lv 3 → 4" sulla carta) | un livello in più di un'arma o di un passivo | **aggiornamento** (riservato al debuff), upgrade |
| buoni pasto, € | la valuta | soldi, monete, oro |
| ordine d'acquisto | il forziere | forziere, cassa |
| guardiano | l'élite | élite, miniboss |
| ticket chiusi | nemici uccisi | uccisioni, kill |
| straordinario | dopo le 18:00 | overtime |
| Burnout | sconfitta | game over, morto |
| arma, passivo, oggetto ("oggetto" = l'uno o l'altro) | le cose che si installano | tomo, abilità, strumento |
| Velocità d'attacco | stat sulle carte (maiuscola dopo il numero) | rapidità |
| Velocità di movimento; "Velocità" da sola dove manca spazio | stat sulle carte; "Velocità" da sola vuol dire movimento, come per il Caffè al Ginseng | speed, passo |
| ✱ Call di Gruppo | il nemico che apre la call (idea Teams) | Teams (salvo decisione di Marco), Ping, riunione |
| ✱ in call | stato dei nemici dentro l'anello: prendono meno danno | distratti, protetti, in riunione |
| ✱ INSERT, NORMAL | le due modalità di Vim, sempre in maiuscolo come in Vim; `-- INSERT --` non si traduce | inserimento, normale |
| ✱ Aggiornamento | il nemico con la barra di download | Update, Patch, Aggiornamento Obbligatorio |
| ✱ in aggiornamento | stato dell'arma bloccata | bloccata, disattivata, in update |
| ✱ riavvio | il momento in cui l'arma torna | sblocco, ripristino |
| ✱ PC aziendale | il sistema del loadout a budget | computer, inventario |
| ✱ RAM, CPU | le due risorse (armi a RAM, passivi a CPU), sempre in maiuscolo e **senza unità**: la stessa parola sulla carta, sulle barre e negli avvisi. **Sempre RAM prima di CPU**, come le righe dell'HUD (armi sopra, passivi sotto) | GB, core, memoria, processore |
| ✱ insufficiente ("RAM insufficiente", "CPU insufficiente") | una risorsa non basta per gli oggetti nuovi | RAM piena, memoria insufficiente, CPU al 100% |

**Regole di forma**
- Numeri come li stampa `formatStat` in `src/game/cards.ts`: `+8%`, `-10%`, `+20`.
- Puntini di sospensione con il carattere `…`, come nelle battute dei boss.
- **Nei modelli con `{arma}` niente aggettivi accordati al nome**: le armi sono maschili, femminili e plurali ("il Firewall", "la Tazza di Java", "le Slide PowerPoint"). I banner nuovi non contengono `{arma}`: il nome più lungo, "Copia da Stack Overflow" (23), lascerebbe 15 caratteri per tutto il resto.
- Il "Lv" delle carte e il "LV" dell'HUD restano come sono: due posti diversi, non si mescolano.

## Lunghezze su telefono

Concordate con "ux", misurate sul font e sul layout attuali (carta larga ~260 px, iPhone SE in orizzontale come caso peggiore). Caratteri contati con uno script (`[...testo].length`), non a occhio.

| Testo | Dove si vede | Max |
|---|---|---|
| Nome di carta (arma, passivo, premio) | `.ticket .body b` | 20 car. ideale, 22 tetto (oltre 20 va a capo su iPhone SE) |
| Riga d'effetto della carta | `.ticket ul li` | 32 car., **una** riga; due effetti = due righe |
| Descrizione di arma o passivo nuovo | carta "Nuova arma" / "Nuovo passivo" | 60 car., due righe |
| Riga di flavor sulla carta | — | **non esiste**: non c'è spazio |
| Nome di nemico normale | banner e barra del boss | 18 car. |
| Nome di nemico in "Guardiano in arrivo: {nome}" | banner esistente | 17 car. (38 meno i 21 del prefisso) |
| Banner nuovo | `.banner` | 38 car., una riga, una frase; **uno solo per meccanica**, alla prima volta nella partita |
| Banner del boss | `.banner.boss` | 70 car., due righe |
| Riga "risorsa insufficiente" nella scelta delle carte | sotto le barre RAM/CPU | 38 car. |
| Chip di costo sulla carta | accanto al nome | 5 car. ("RAM 3") |
| Testo sullo slot bloccato | `.slot` | desktop: solo i secondi, 1 cifra; telefono: nessuno |
| Testo sopra il personaggio o sopra i nemici | nel mondo | **nessuno**: solo icone |
| Stato "in call" nell'HUD | — | **nessuno**: la call riguarda i nemici, non il giocatore |
| Sottotitolo della pausa | `.panel p` | 46 car. |
| Frasi lunghe di tono | titolo, pausa | libere, con misura |

---

## 1. Nemico "Call di Gruppo" (idea Teams)

> *qualcosa di legato a microsoft teams come nemico, che fa il rumore della notifica quando spawna e poi ha qualche effetto fastidioso che rallenta l'uccisione dei bug*

**Meccanica (GDD §1):** il nemico arriva con il suono di una notifica e **è** una call: i nemici normali dentro il suo anello sono **in call** e prendono `-30%` di danno finché è vivo. Élite, boss e altre Call non vanno mai in call.

**Nome: "Call di Gruppo".** Il nemico è la call stessa, quindi il nome spiega l'anello: chi ci sta dentro è in call. Segue lo schema di "Riunione" ed "Email URGENTE" (un concetto, non un prodotto) e regge anche se un giorno l'ufficio cambia chat. "Ping", proposto nel primo giro, è ritirato: descriveva il suono, non l'effetto. Nome e logo reali: [decisione aperta per Marco](#decisioni-aperte-per-marco).

### Stringhe

| ID | Testo | Dove (file · campo) | Car. |
|---|---|---|---|
| CALL-01 | Call di Gruppo | `src/config/enemies.ts` · `name` (voce `call`) | 14 |
| CALL-02 | Chi è in call prende -{p}% danno | banner `warn` solo alla **prima** comparsa della partita · `src/game/game.ts`; `{p}` = `aura.reduction` × 100 (campo di `EnemyDef` nel GDD), letto dalla configurazione, mai scritto a mano | 31 |
| CALL-03 | Apre una call: i nemici dentro prendono -{p}% danno. | descrizione per bestiario e documentazione (oggi `EnemyDef` non ha un campo `description`) | 51 |

- Sui nemici in call **nessun testo**: cuffietta e numeri di danno lilla (GDD §1).
- Nessun banner dalle comparse successive né quando la Call muore: bastano suono, minimappa e le cuffiette che spariscono.
- "-30% danno" e non "danno subito": "subito" si leggerebbe anche come "immediatamente".

### Battute di chat, nella pausa

Le frasi tipiche della chat d'ufficio non stanno sopra i nemici: vanno nel sottotitolo della pausa, insieme a quella attuale (`src/ui/screens.ts` · `pause()`, proprietario "ux", **accolto**). Una a caso a ogni apertura della pausa; non cambia mentre è aperta.

| ID | Testo | Car. |
|---|---|---|
| PAUSA-01 | Il timer è fermo. Le mail, purtroppo, no. (attuale) | 41 |
| PAUSA-02 | Il timer è fermo. Le call, purtroppo, no. | 41 |
| PAUSA-03 | Il timer è fermo. Sta scrivendo… | 32 |
| PAUSA-04 | Stato: torno subito. | 20 |

Riserva per titolo, pausa o schermata di fine: "Il bug non si risolve: si discute", "Facciamo una call per parlarne", "Hai un minuto?", "Ci sei?", "Ti ho scritto in chat", "Hai visto la mail?", "Una cosa veloce", "Puoi condividere lo schermo?", "Hai il microfono spento".

---

## 2. Passivo "Scorciatoie di Vim"

> *potenziamento scorciatoie di vim che aumenta la velocità di attacco / movimento*

**Meccanica (GDD §2):** fermo da almeno `0,4 s` sei in INSERT (`+12%` Velocità d'attacco per livello); in movimento sei in NORMAL (`+5%` Velocità di movimento per livello). Livello massimo 5. Fermo compare `-- INSERT --`; in NORMAL nessuna scritta, come in Vim.

**Nome: "Scorciatoie di Vim".** Sono le parole del collega e dicono il tema; le modalità le spiegano la carta e la scritta nell'HUD. Scartati ":wq" e "hjkl": divertenti per chi usa Vim, muti per chi gioca il Project Manager.

| ID | Testo | Dove (file · campo) | Car. |
|---|---|---|---|
| VIM-01 | Scorciatoie di Vim | `src/config/passives.ts` · `name` | 18 |
| VIM-02 | Fermo: +{a}% Velocità d'attacco | prima riga d'effetto della carta · `src/game/cards.ts` | 30 |
| VIM-03 | In movimento: +{m}% Velocità | seconda riga d'effetto della carta · `src/game/cards.ts` | 26–27 |
| VIM-04 | Per uscire: :q! (in teoria) | `src/config/passives.ts` · `description` (GDD §2): solo se "ux" trova lo spazio, **mai al posto** di VIM-02 e VIM-03 | 27 |
| VIM-05 | -- INSERT -- | riga di stato nell'HUD · `src/ui/hud.ts`; testo fisso, non si traduce | 12 |

- Due righe e non una (criterio 2.9 del GDD): le sole etichette "Velocità d'attacco" e "Velocità di movimento" fanno 39 caratteri, il limite è 32.
- Caso peggiore con la priorità Bloccante (×2,3 in `tuning.ts`): "Fermo: +28% Velocità d'attacco" (30) e "In movimento: +12% Velocità" (27). Restano entro 32.
- "In movimento" e non "In moto": "in moto" si legge anche come "in motocicletta".

---

## 3. Nemico "Aggiornamento" e arma in aggiornamento

> *Debuff aggiornamento software, blocca un arma/strumento per tot secondi*

**Meccanica (GDD §3):** un nemico lento e basso con la barra di download arriva a intervalli regolari. Se ti tocca si consuma e mette **una** arma in aggiornamento per qualche secondo. Mai l'unica arma, mai due insieme, mai i passivi. Quale arma lo dice la sua icona sopra il giocatore per `1 s`; lo slot si blocca; al riavvio la stessa icona torna con una spunta ✓ e un *ding*.

**Nome: "Aggiornamento".** Il segnaposto "Aggiornamento Obbligatorio" faceva 26 caratteri, oltre i 18 dei nomi dei nemici. "Aggiornamento" (13) lega il nemico al suo effetto: un Aggiornamento ti tocca e un'arma va in aggiornamento.

### Stringhe

| ID | Testo | Dove (file · campo) | Car. |
|---|---|---|---|
| UPD-01 | Aggiornamento | `src/config/enemies.ts` · `name` (voce `update`) | 13 |
| UPD-02 | Un'arma si sta aggiornando! | banner `warn` solo al **primo** aggiornamento della partita · `src/game/game.ts` | 27 |
| UPD-03 | {n} | secondi rimasti sullo slot bloccato, solo su desktop · `src/ui/hud.ts` | 1 |

- Il banner non nomina l'arma: "Aggiornamento: Copia da Stack Overflow" farebbe esattamente 38, senza margine per armi future. L'arma la mostra l'icona sopra il giocatore, dove stai guardando.
- Al riavvio **nessun testo**: icona con la spunta ✓, lampeggio dello slot e suono bastano. Mai "migliorato" o "nuove funzionalità": l'arma torna identica (il GDD esclude il bonus dopo il riavvio).
- La parola "aggiornamento" in interfaccia vale **solo** per questo debuff: i potenziamenti delle carte restano "Lv 3 → 4".

Riserva per titolo, pausa o schermata di fine (non sono banner in partita): "Non spegnere il computer", "Riavvio pianificato alle 17:59", "Aggiornamento bloccato al 99%", "Aggiornamento 1 di 37", "Aggiornamento di sicurezza critico", "Riavvio richiesto", "Corretti bug minori", "Tutto come prima".

---

## 4. Loadout "PC aziendale" (RAM e CPU)

> *il loadout invece di slots ha tot di cpu e ram, e lì devi fare compromessi, tipo scelgo vim e claude code, o finisco tutta la ram su intellij?*

**Meccanica (GDD §4, raccomandazione, decisione di Marco):** al posto degli slot, due budget: le **armi costano RAM**, i **passivi costano CPU** (circa `9` RAM e `7` CPU all'inizio, da confermare). Si paga all'installazione, i potenziamenti sono gratis; una carta che non ci sta non esce. Il budget cresce solo con due premi del JOscar, `+1 RAM` o `+1 CPU`, al massimo `+2` a partita. Niente disinstallazione nella prima versione.

**Linguaggio:** quello del Task Manager ("Gestione attività" in italiano), che in ufficio tutti hanno aperto almeno una volta per capire chi si stava mangiando la memoria. Stessa parola sulla carta, sulle barre e negli avvisi ("RAM", "CPU"), senza unità: la sottrazione è immediata.

### Stringhe

| ID | Testo | Dove (file · campo) | Car. |
|---|---|---|---|
| PC-01 | RAM {c} | chip di costo sulla carta di un'arma nuova · `src/ui/screens.ts` | 5 |
| PC-02 | CPU {c} | chip di costo sulla carta di un passivo nuovo · `src/ui/screens.ts` | 5 |
| PC-03 | → {r}/{t} | quanto resterà dopo, accanto al chip ("→ 6/9") | 5 |
| PC-04 | RAM {u}/{t}, CPU {u}/{t} | etichette delle barre: nella scelta delle carte e in pausa; su desktop anche sotto gli slot | ≤ 9 ciascuna |
| PC-05 | RAM {r} · CPU {c} | chip del budget di partenza del personaggio, nella schermata del titolo ("RAM 9 · CPU 7") | ≤ 15 |
| PC-06 | RAM insufficiente | riga nella scelta delle carte, sotto le barre, quando il filtro ha escluso armi nuove | 17 |
| PC-07 | CPU insufficiente | come PC-06, quando ha escluso passivi nuovi | 17 |
| PC-08 | RAM e CPU insufficienti | come PC-06, quando ha escluso entrambi | 23 |
| PC-09 | Banco di RAM | nome del premio JOscar che aggiunge RAM · `src/game/cards.ts` | 12 |
| PC-10 | +{n} RAM | riga d'effetto di PC-09 (schema di "+20 HP massimi") | 6 |
| PC-11 | Richiesta hardware approvata. Dopo sei mesi. | descrizione di PC-09 | 44 |
| PC-12 | Processore Nuovo | nome del premio JOscar che aggiunge CPU · `src/game/cards.ts` | 16 |
| PC-13 | +{n} CPU | riga d'effetto di PC-12 | 6 |
| PC-14 | Dal magazzino IT, ancora nella plastica. | descrizione di PC-12 | 40 |

- "Insufficiente" e non "piena" o "al 100%": è vero anche quando la risorsa non è piena ma nessun oggetto nuovo ci sta (6/7 e i passivi costano 2).
- Nessun invito a "liberare RAM": senza disinstallazione il giocatore non può farlo.
- In combattimento l'HUD non mostra avvisi di risorsa insufficiente (GDD §4).

Descrizione d'esempio per un'arma futura citata nel GDD (≤ 60, sulla carta "Nuova arma"):

| Arma | Descrizione | Car. |
|---|---|---|
| IntelliJ IDEA (arma pesante, RAM alta) | Indicizzazione in corso… | 24 |

Riserva, se un giorno arriva la disinstallazione: pulsante "Termina attività" (16), banner "Attività terminata" (18). Per titolo o pausa: "Memoria insufficiente", "CPU al 100%".

### Conseguenza: le descrizioni delle armi vanno accorciate

Le descrizioni attuali vanno da 63 a 114 caratteri: su telefono spingono la terza carta fuori dallo schermo, e con il chip del costo ancora di più ("ux"). Il limite è 60, e vale anche senza loadout. Proposta, stessa meccanica e stessa battuta dove possibile (campo `description` in `src/config/weapons.ts`, proprietario "game-designer", tabella già inviata):

| Arma | Oggi | Proposta | Car. |
|---|---|---|---|
| Paperella di Gomma | 73 | Paperelle al nemico più vicino. Il rubber duck funziona. | 56 |
| Slide PowerPoint | 63 | Slide in orbita intorno a te. Nessuno regge 80 slide. | 53 |
| Firewall | 64 | Anello di fuoco: brucia chi entra. Porta 443 esclusa. | 53 |
| Rispondi a Tutti | 64 | Email in tutte le direzioni. Nessuno è al sicuro. | 49 |
| Deploy di Venerdì | 70 | Esplosioni sui nemici vicini. Cosa potrà mai andare storto? | 59 |
| Copia da Stack Overflow | 69 | Scarica a catena tra i nemici. Non chiedere perché funziona. | 60 |
| Claude Code | 93 | Un agente corre dai nemici e li sistema da solo. | 48 |
| Scudo Angular | 82 | Scudi in orbita: respingono nemici, bloccano proiettili. | 56 |
| Tazza di Java | 92 | Lancia pozze di caffè bollente. Write once, burn anywhere. | 58 |
| Spring Boot | 114 | Frisbee: attraversa i nemici e torna. Inversion of Control. | 59 |
| Foglia di MongoDB | 101 | Si divide in shard all'impatto. Scala orizzontalmente. | 54 |
| Alveare JPanik | 110 | Esagoni che inseguono i nemici, esplodono e ricrescono. | 55 |

- Claude Code perde la frase sui subagenti: la carta di potenziamento "+1 Subagenti" la spiega quando serve.
- "Copia da Stack Overflow" fa 23 caratteri: supera di 1 anche il tetto di 22 e va a capo su iPhone SE. Alternativa: "Stack Overflow" (14), che però perde la battuta del copia-incolla. Decide "game-designer".

---

## Decisioni aperte per Marco

1. **Nemico Teams: marchio reale o parodia?** (è anche la decisione n. 2 del GDD)
   - **Raccomandata: "Call di Gruppo"** con un logo generico viola (bolla di chat con le cuffie). Coerente con la regola "i marchi reali stanno dalla parte del giocatore"; regge se cambia la chat aziendale. Contro: il richiamo a Teams è affidato a colore, suono e battute.
   - "Teams" con il logo vero ridisegnato, come Angular o Java. Pro: si riconosce al primo colpo. Contro: sarebbe il primo prodotto reale trattato da nemico, e molti clienti lo usano ogni giorno.
   - In ogni caso il suono resta una notifica "che ricorda senza copiare" (GDD §1). Con il marchio reale cambia solo CALL-01: il banner CALL-02 non contiene il nome.

## Debito di lunghezza nei testi esistenti

Non fa parte delle 4 idee, ma va saputo: diversi banner attuali superano i 38 caratteri dei banner nuovi, ad esempio "Progetto consegnato! Ritira il JOscar e prendi l'ascensore per chiudere." (72) e "Il cliente ha mandato le Change Request!" (40). Da rivedere insieme a "ux" e "gameplay-programmer" in un passaggio dedicato.

## Consegne ai proprietari

Fase 1 è solo design: nessuna stringa è ancora in `src/`. Quando le idee entrano in sviluppo, le stringhe vanno così:

| Stringhe | File | Proprietario |
|---|---|---|
| CALL-01, UPD-01 | `src/config/enemies.ts` · `name` | game-designer |
| VIM-01, VIM-04 | `src/config/passives.ts` | game-designer |
| Descrizioni accorciate delle armi | `src/config/weapons.ts` · `description` | game-designer |
| VIM-02, VIM-03, PC-09…14 | `src/game/cards.ts` | gameplay-programmer |
| CALL-02, UPD-02 | `src/game/game.ts` (banner) | gameplay-programmer |
| VIM-05, UPD-03, PAUSA-01…04, PC-01…08 | `src/ui/` | ui-ux-designer |

Già comunicato a "designer" (nomi, banner, premi, righe di risorsa insufficiente) e a "ux" (testi UI, sottotitoli della pausa). Il GDD finale è allineato a questo file (conferma di "designer"): «Call di Gruppo» (id `call`), «Scorciatoie di Vim», «Aggiornamento», premi «Banco di RAM» e «Processore Nuovo», righe "… insufficiente".

Proposta per il lead: la lista a rotazione della pausa e le riserve di battute potrebbero vivere in un file di sola configurazione, es. `src/config/texts.ts`, di proprietà di narrative-writer, così i testi restano fuori dal motore.

## Registro del confronto

I messaggi con "designer" si sono incrociati più volte e il nome del nemico è rimbalzato tra "Ping" e "Call di Gruppo". Regola concordata per chiudere: per i testi vale **questo file**, non l'ordine dei messaggi; `docs/design/ux.md` è già allineato.

| Tema | Con chi | Esito |
|---|---|---|
| Lunghezze su telefono | ux | accordo: tabella sopra (banner nuovi 38 e uno per meccanica, riga d'effetto 32, niente flavor sulle carte, niente unità, pausa 46) |
| Nome del nemico Teams | designer | "Ping" nel primo giro, poi "Call di Gruppo" (il nome spiega l'anello): nel GDD; marchio reale → decisione di Marco |
| Effetto della Call | designer, ux | lo stato "in call" è dei **nemici**, non del giocatore: nessuna etichetta nell'HUD |
| Carta di Vim | designer, ux | due righe ≤ 32 (criterio 2.9); `:q!` solo se c'è spazio, mai al posto degli effetti |
| Nome dell'Aggiornamento | designer | "Aggiornamento" (13) al posto di "Aggiornamento Obbligatorio" (26): nel GDD |
| Banner di Call e Aggiornamento | designer, ux | uno solo per meccanica, alla prima volta; niente varianti a caso, niente testo al riavvio (proposte di scrittura ritirate) |
| Unità del loadout | designer, ux | "RAM 3" / "CPU 2" senza unità: nel GDD |
| Righe di risorsa insufficiente | ux, designer | "RAM insufficiente" / "CPU insufficiente" / "RAM e CPU insufficienti" (stessa parola della barra, RAM prima di CPU); niente "libera RAM" |
| Crescita del budget | designer | premi del JOscar "Banco di RAM" e "Processore Nuovo"; la riga "PC aziendale: +1 CPU, +1 RAM" nella cartolina cade |
