# JBonk — Bilanciamento

Proprietario: balance-designer ("bilanciamento"). Stato: **fase 1, solo design**: nessun numero di `src/` è cambiato.
Questo documento dà i numeri delle quattro idee del collega (Teams, Vim, aggiornamento software, loadout CPU/RAM) e li giustifica con le formule che il gioco usa oggi.
Le meccaniche sono quelle di [`gdd.md`](gdd.md) (game-designer); qui ci sono quanto valgono, quanto durano e cosa rompono.

## In breve

| # | Idea | Numeri chiave | Effetto misurato | Esito con il designer |
|---|---|---|---|---|
| 1 | «Call di Gruppo» (Teams) | −30% danno ai nemici normali entro **6 u** · 80 HP base · velocità 3,4 · una ogni 40/35/30 s · max 2/2/3 vive | TTK ×1,43 nell'anello; velocità d'uccisione complessiva −4,5/−9,7% (P3: −6,8/−14,5%) | **OK** con raggio 6 |
| 2 | «Scorciatoie di Vim» | INSERT +12% vel. attacco/livello, NORMAL +5% movimento/livello, max 5, peso 2 nel loadout | batte Scrum solo se fermo ≥ 80% del tempo, batte il Caffè salvo fermo < 6% | **OK** |
| 3 | «Aggiornamento» | blocco 6 s · uno ogni 30 s ±5 da 90 s · max 2 vivi · tregua 8 s · mai sull'unica arma · mai con il boss | DPS medio −1,9% (al massimo −3,75%) con 4 armi; picco −25% per 6 s | **OK** |
| 4 | Loadout CPU/RAM | peso per oggetto: armi 1–3, passivi 1–4. B: armi → RAM 8 (Developer 9), passivi → CPU 7 | build piena media ~8,1 oggetti in P1 (oggi 8); in B le 4 armi più forti non stanno insieme | OK sui numeri; **adozione: decisione di Marco** |

Regole che valgono per tutte le idee:
- I valori sono legati allo **stage** (progetto 1, 2, 3 della partita), non al bioma: l'ordine dei biomi dipende dal progetto scelto all'inizio.
- Ogni nuova fonte di difficoltà resta lieve nel progetto 1, che deve restare finibile da telefono.
- Nessuna idea tocca il budget di prestazioni (~0,7 ms/frame di logica): vedi [§1.6](#16-prestazioni).

## Convenzioni

- **P1, P2, P3** = primo, secondo e terzo progetto della partita (`stage` 0, 1, 2 nel codice).
- **Ora del giorno**: 360 s reali = 09:00 → 18:00, quindi 1 minuto reale = 1,5 ore di gioco (13:30 = 180 s).
- **TTK** = tempo per uccidere. **Breakpoint** = soglia in cui un nemico passa da *n* a *n+1* colpi.
- **ln P** = logaritmo della potenza della build (vedi [§1.5](#15-valore-dei-passivi-modello-di-potenza)): +0,10 ≈ +10,5% di potenza.
- [ipotesi] = stima da verificare in playtest (protocollo in [§7](#7-verifica-in-gioco-fase-2)).

---

## 1. Modello di base (dal codice di oggi)

### 1.1 Nemici nel tempo

Da `spawnEnemy` in `src/game/game.ts` (`min` = minuti reali dall'inizio della giornata, `s` = stage):

```
HP normale = hp_base × (1 + 0,25·min) × (1 + 1,3·s)
HP élite   = hp_base × (1 + 0,20·min) × (1 + 1,3·s)
HP boss    = hp_base × (1 + 1,3·s)
Danno      = danno_base × (1 + 0,09·min) × (1 + 0,45·s)
```

| Nemico (HP base) | P1 09:00 / 13:30 / 18:00 | P2 09:00 / 13:30 / 18:00 | P3 09:00 / 13:30 / 18:00 |
|---|---|---|---|
| Bug (14) | 14 / 25 / 35 | 32 / 56 / 81 | 50 / 88 / 126 |
| Email (9) | 9 / 16 / 23 | 21 / 36 / 52 | 32 / 57 / 81 |
| Ticket (28) | 28 / 49 / 70 | 64 / 113 / 161 | 101 / 176 / 252 |
| Change Request (22) | 22 / 39 / 55 | 51 / 89 / 126 | 79 / 139 / 198 |
| Riunione (70) | 70 / 123 / 175 | 161 / 282 / 402 | 252 / 441 / 630 |
| Danno del bug (6) | 6,0 / 7,6 / 9,2 | 8,7 / 11,0 / 13,4 | 11,4 / 14,5 / 17,6 |

- Élite Scope Creep (650) alle 4 comparse (80/160/240/320 s): 823–1343 HP in P1, 1894–3090 in P2, 2964–4836 in P3.
- Boss nell'ordine di default (Phoenix → Atlas → Helios): Cliente 4200, Monolite 6500 × 2,3 = 14 950, Audit 9000 × 3,6 = 32 400.
- **Attenzione**: il bioma Helios (banca) non ha bug. Ogni effetto pensato "sui bug" deve valere su tutti i nemici normali.

### 1.2 Spawn e nemici vivi

```
spawn/s = (0,9 + 0,014·t) × (1 + 0,25·s)      × 1,8 negli straordinari, × 0,5 con il boss vivo
tetto nemici = 280 + 60·s
```

| | spawn/s 09:00 / 13:30 / 18:00 | spawn nella giornata | sciami (2 per giornata) | tetto |
|---|---|---|---|---|
| P1 | 0,90 / 3,42 / 5,94 | 1231 | 52 | 280 |
| P2 | 1,13 / 4,28 / 7,43 | 1539 | 68 | 340 |
| P3 | 1,35 / 5,13 / 8,91 | 1846 | 84 | 400 |

Nemici vivi: con velocità d'uccisione K e spawn S, se K ≥ S restano in campo circa S × 7 s (il tempo di arrivo da 30–42 u a 5 u/s), cioè ~40 a fine P1. Se K < S i vivi crescono di (S − K) al secondo fino al tetto.
Per questo ogni malus alla velocità d'uccisione conta quando la build è appena sufficiente: −7% di K a fine P1 sono +0,4 nemici/s in più.

### 1.3 XP e livelli

```
XP per passare dal livello L al successivo = round(5 + 5·(L−1) + 0,55·(L−1)²)      (tuning.ts)
XP per uccisione = xp_base × (1 + 0,3·s)
```

XP cumulata: L5 58 · L10 338 · L15 977 · L20 2112 · L25 3881 · L30 6421.
In P1 [ipotesi: si uccide e si raccoglie l'85% dello spawn, primi nemici a tiro dopo 7 s]:

| Minuto reale | 0:13 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Livello | primo level-up | 4 | 7 | 10 | 13 | 15 | 17 |

Una partita intera arriva intorno al livello 35–40: una quarantina di scelte di carte, contro le 60 che servirebbero a portare al massimo 4 armi e 4 passivi.

### 1.4 DPS delle armi

Metodo (da `src/game/weapons.ts`):
- **Singolo** = DPS su un bersaglio solo (il boss). **Folla** = DPS totale in una folla di densità ρ = 0,05 nemici/u² [ipotesi].
- **L10 atteso** = livello 1 + 9 upgrade presi a caso tra quelli dell'arma, con la rarità media (moltiplicatore atteso 1,2015 = 0,62·1 + 0,25·1,35 + 0,10·1,75 + 0,03·2,3; per gli upgrade interi ×1,03).
- **Indice V** = √(singolo × folla) a L10, diviso per la media delle 12 armi. Misura il "valore" dell'arma e serve al loadout.
- Dettagli che contano: la velocità d'attacco divide i cooldown; le orbite colpiscono lo stesso nemico al massimo una volta per passaggio *e* per cooldown (Slide: limitata dal cooldown, Angular dal passaggio, quindi la velocità d'attacco non serve all'Angular); le pozze di Java fanno danno ogni 0,5 s fissi.

| Arma | Tipo | L1 singolo / folla | L10 singolo / folla | V |
|---|---|---|---|---|
| Paperella (`duck`) | projectile | 24 / 38 | 138 / 374 | 1,44 |
| Slide (`slides`) | orbit | 17 / 48 | 60 / 298 | 0,84 |
| Firewall (`firewall`) | aura | 18 / 55 | 54 / 441 | 0,97 |
| Rispondi a Tutti (`replyall`) | radial | 6 / 26 | 27 / 231 | 0,50 |
| Deploy di Venerdì (`deploy`) | strike | 15 / 39 | 35 / 510 | 0,85 |
| Stack Overflow (`stackoverflow`) | chain | 12 / 48 | 93 / 587 | 1,48 |
| Claude Code (`claude`) | minion | 19 / 15 | 158 / 126 | 0,89 |
| Scudo Angular (`angular`) | orbit | 11 / 39 | 43 / 292 | 0,71 (+ blocca i proiettili) |
| Tazza di Java (`java`) | lob | 8 / 18 | 14 / 308 | 0,42 |
| Spring Boot (`spring`) | boomerang | 21 / 42 | 139 / 439 | 1,56 |
| MongoDB (`mongo`) | split | 18 / 39 | 135 / 461 | 1,58 |
| Alveare JPanik (`jpanik`) | swarm | 23 / 33 | 92 / 158 | 0,76 |

Da notare: Java e Rispondi a Tutti sono le armi più deboli del modello, MongoDB, Spring e Stack Overflow le più forti, con un rapporto di ~3,8 tra gli estremi. Da verificare in playtest con i danni per arma della schermata finale (vedi [§7](#7-verifica-in-gioco-fase-2)).

### 1.5 Valore dei passivi (modello di potenza)

Per confrontare danno e sopravvivenza uso una sola misura di potenza:

```
P = DPS × EHP^0,5          EHP = HP effettivi (HP, armatura, rigenerazione, schivata)
valore di un passivo = Δ ln P al livello massimo, senza rarità
```

L'esponente 0,5 sull'EHP [ipotesi] riflette che in un survivor uccidere in fretta riduce anche il danno subito: il DPS conta due volte.
Per la velocità di movimento [ipotesi]: +1% di movimento ≈ +0,5% di EHP, e vale solo mentre ci si muove.

| Passivo | Al massimo | Calcolo | Valore (ln P) |
|---|---|---|---|
| Multitasking | +3 proiettili (Lv 3) | media del modello sulle 12 armi a L10 | 0,50 (e cresce con il numero di armi) |
| Certificazione Cloud | +60% danno | ln 1,6 | 0,47 |
| Lavagna Bianca | +60% area | media del modello (aure e orbite fino a +150%, proiettili 0%) | 0,42 |
| Certificazione Scrum | +50% vel. attacco | media del modello (Angular 0%) | 0,36 |
| Sedia Ergonomica | +100 HP | 0,5 × ln(200/100) | 0,35 |
| Cornetto delle 10 | +3 HP/s | [ipotesi] dimezza il danno netto sotto pressione (~6 HP/s) | 0,25–0,35 |
| Unit Test | +5 armatura | 0,5 × ln(danno / (danno − 5)): 0,53 in P1, 0,30 in P2, 0,21 in P3 | ~0,27 nella partita |
| Code Review | +25% critico | ln 1,25 (critico ×2) | 0,22 |
| CV Aggiornato | +60% XP | fine P1 dal livello 17 al 21; ~0,05 a scelta in più | ~0,20 |
| Caffè Doppio | +40% movimento | 0,5 × ln(1 + 0,5 × 0,40) | 0,09 |
| Smart Working | +125% raggio di raccolta | raccolta dall'85% al 95%: livello 17 → 18 in P1 | ~0,05 |

Già oggi il Caffè Doppio vale circa un quarto di Scrum: è il candidato principale a essere "mai scelto". Va guardato nella prossima passata di bilanciamento, indipendentemente dalle idee nuove.

### 1.6 Prestazioni

| Idea | Costo per frame | Motivo |
|---|---|---|
| Call di Gruppo | trascurabile (< 0,01 ms) | ≤ 3 call × una query di vicinato ogni 0,2 s; il moltiplicatore in `damageEnemy` è un confronto |
| Vim | zero nel frame normale | `recomputeStats` solo al cambio di modalità |
| Aggiornamento | zero | un timer per arma |
| Loadout | zero | si calcola solo quando si generano le carte |
| Spawn extra | ≤ 5 nemici in più (2%) | call e aggiornamenti con timer dedicato, come gli élite |

---

## 2. Nemico «Call di Gruppo» (Teams)

Meccanica del designer ([gdd §1](gdd.md)): un logo fluttuante apre una "call" e i nemici normali dentro l'anello subiscono meno danno finché è viva.

### Obiettivo in numeri

- Una call ignorata allunga il TTK dei nemici nel suo anello di circa il 40%, non di più.
- Distruggerla costa circa 2 s di fuoco quando la si ha a tiro, in ogni progetto.
- Con il numero massimo di call vive, la velocità d'uccisione complessiva cala al massimo del 10% in P1 e P2 e del 15% in P3.
- Distruggerla serve: la successiva arriva dopo almeno 30 s.

### Numeri concordati

| Parametro | Prima bozza del designer | Concordato | Motivo |
|---|---|---|---|
| Riduzione del danno | −50% | **−30%** (massimo accettabile −40%) | −50% raddoppia il TTK; vedi la tabella dei breakpoint |
| Raggio dell'anello | 6 | **6** | con 7 si esce dall'obiettivo (vedi sotto) |
| Cumulabile | no | **no** | con più call lo stesso nemico resta a −30% |
| Chi è protetto | nemici normali | **nemici normali** (no élite, boss, altre call) | il boss resta nella finestra 45–75 s |
| HP base | 24 | **80** | con 24 HP muore in 2 colpi se è a tiro ed è intoccabile se non lo è: esito binario |
| Velocità | 4,6 | **3,4** | a 4,6 sta dentro l'orda (bug 5,0); a 3,4 resta dietro, come vuole l'idea |
| Danno a contatto / XP / buoni | 5 / 3 / 0,2 | **5 / 3 / 0,2** | — |
| Spawn | roster, peso 2 da 120 s | **timer dedicato**: una ogni 40 / 35 / 30 s, da 75 / 60 / 45 s (P1/P2/P3) | col roster ne nasce una ogni ~5 s e il tetto è sempre pieno |
| Massimo vive insieme | 3 | **2 / 2 / 3** | la difficoltà cresce tra i progetti, P1 resta lieve |
| Durante il boss | (roster a metà) | **nessuno spawn** | — |

### Perché non lo spawn da roster

Con peso 2 su un roster da 25 (Phoenix dopo 160 s), a 13:30 nascono 3,42 × 2/27 = 0,25 call al secondo, una ogni ~4 s.
Il tetto di 3 è sempre pieno e una call distrutta viene sostituita in pochi secondi: la contromisura principale ("chiudi la call") non serve più.
Con il timer, nella giornata nascono circa 7 call in P1 ((360 − 75)/40), 9 in P2, 10 in P3.

### Raggio: perché 6 e non 7

```
quota di nemici in call   f = call vive × π·R² / zona occupata dall'orda (700–1500 u²) [ipotesi geometrica]
calo della velocità d'uccisione = f × 0,30
```

| Raggio, riduzione | 2 call (P1, P2) | 3 call (P3) | Dentro l'obiettivo (10% / 15%)? |
|---|---|---|---|
| **R 6, −30%** | f 15–32% → **−4,5/−9,7%** | f 23–48% → **−6,8/−14,5%** | sì |
| R 7, −30% | f 21–44% → −6,2/−13,2% | f 31–66% → −9,2/−19,8% | no |
| R 7, −25% | −5,1/−11,0% | −7,7/−16,5% | appena sopra |

### HP della call (80 base, scala come i nemici normali)

| Momento | HP |
|---|---|
| P1, prima call (75 s) | 105 |
| P1, 18:00 | 200 |
| P2, prima (60 s) | 230 |
| P2, 18:00 | 460 |
| P3, prima (45 s) | 342 |
| P3, 18:00 | 720 |

DPS su bersaglio singolo di una build media [ipotesi dal modello in §1.4]: ~50 a 75 s di P1 (arma iniziale a L3–4 più un'arma nuova), ~160–200 a fine P1, ~900 a fine P3. Quindi 2,1 s per la prima call di P1, ~1 s o meno dopo.

### Impatto sul tempo per uccidere

TTK continuo nell'anello: ×1/(1 − 0,3) = **×1,43** (con −50%: ×2).
Breakpoint con un "colpo tipico" [ipotesi] che cresce lungo la partita (18 → 30 in P1, 36 → 55 in P2, 60 → 90 in P3):

| Momento | Bug: HP · colpi (normale / −30% / −50%) | Ticket: HP · colpi (normale / −30% / −50%) |
|---|---|---|
| P1 09:00 | 14 · 1 / 2 / 2 | 28 · 2 / 3 / 4 |
| P1 13:30 | 25 · 2 / 2 / 3 | 49 · 3 / 3 / 5 |
| P1 18:00 | 35 · 2 / 2 / 3 | 70 · 3 / 4 / 5 |
| P2 09:00 | 32 · 1 / 2 / 2 | 64 · 2 / 3 / 4 |
| P2 13:30 | 56 · 2 / 2 / 3 | 113 · 3 / 4 / 6 |
| P2 18:00 | 81 · 2 / 3 / 3 | 161 · 3 / 5 / 6 |
| P3 09:00 | 50 · 1 / 2 / 2 | 101 · 2 / 3 / 4 |
| P3 13:30 | 88 · 2 / 2 / 3 | 176 · 3 / 4 / 5 |
| P3 18:00 | 126 · 2 / 3 / 3 | 252 · 3 / 5 / 6 |

- Il caso peggiore (un colpo che diventa due) cade all'inizio della giornata, quando con il timer la call non c'è ancora (prima a 75/60/45 s; a 75 s un bug di P1 ha già 18 HP e muore in 2 colpi anche senza call).
- TTK in secondi di un bug, con un colpo ogni 0,75 s: P1 0,58 / 0,77 / 0,88 s senza call, 0,83 / 1,09 / 1,25 s in call; P3 0,63 / 0,88 / 1,05 s senza, 0,90 / 1,26 / 1,50 s in call.

### Alternative valutate per l'effetto

| Effetto | Problema |
|---|---|
| Cura dei nemici vicini (HP/s piatti) | non lineare: irrilevante sui nemici piccoli e enorme su quelli grossi. Con 4% degli HP/s e 18 DPS: bug di fine P1 +9% di TTK, Riunione da 9,7 s a 15,9 s (+64%). E diventa immortale chi ha meno DPS della cura |
| Malus alla velocità d'attacco del giocatore | si somma all'aggiornamento (due malus "armi più lente" insieme) e colpisce anche il boss |
| **Riduzione percentuale del danno (scelta)** | uniforme su tutti i nemici e in tutti i momenti; la forza della call non dipende dall'arma usata |

---

## 3. Passivo «Scorciatoie di Vim»

Meccanica del designer ([gdd §2](gdd.md)): **INSERT** (nessun input di movimento da 0,4 s) dà velocità d'attacco, **NORMAL** (in movimento) dà velocità di movimento.

### Obiettivo in numeri

- Vim non è strettamente migliore di Scrum né del Caffè: esiste uno stile di gioco in cui ciascuno dei tre è la scelta migliore.
- Vim vale come un passivo di fascia media (circa come Scrum) per chi si ferma spesso.

### Numeri concordati

| Livello | Vim INSERT (vel. attacco) | Vim NORMAL (movimento) | Scrum (vel. attacco) | Caffè (movimento) |
|---|---|---|---|---|
| 1 | +12% | +5% | +10% | +8% |
| 2 | +24% | +10% | +20% | +16% |
| 3 | +36% | +15% | +30% | +24% |
| 4 | +48% | +20% | +40% | +32% |
| 5 | +60% | +25% | +50% | +40% |

Ritardo per entrare in INSERT: 0,4 s. Livello massimo 5. La rarità moltiplica entrambi i valori, come per gli altri passivi.

### Confronto con Scrum e Caffè (valore ln P al livello 5, f = frazione di tempo da fermo)

```
Vim(f)   = 0,898 · ln(1 + 0,60·f) + 0,5 · ln(1 + 0,5·0,25·(1 − f))
Scrum    = 0,364                       (0,898 = quota di armi che sfrutta la velocità d'attacco, dal modello)
Caffè(f) = 0,5 · ln(1 + 0,5·0,40·(1 − f))
```

| f (fermo) | Vim | Scrum | Caffè | Migliore |
|---|---|---|---|---|
| 0 (sempre in movimento) | 0,059 | 0,364 | 0,091 | Scrum; tra i due "di movimento" il Caffè |
| 0,2 (kiting tipico) [ipotesi] | 0,149 | 0,364 | 0,074 | Scrum |
| 0,5 | 0,266 | 0,364 | 0,048 | Scrum |
| 0,8 | 0,364 | 0,364 | 0,020 | pari |
| 1 (torretta) | 0,422 | 0,364 | 0 | Vim |

- Pareggi: **Vim = Scrum a f = 0,80**, **Vim = Caffè a f = 0,06**. Non è strettamente migliore di nessuno dei due.
- La torretta pura (Sistemista + Firewall + scudi) è la nicchia in cui Vim vince: +60% contro +50% di velocità d'attacco, cioè +6,7% di DPS. È un vantaggio da nicchia, non una strategia dominante.
- Il passaggio rapido fermo/movimento rende poco: con 0,5 s fermo e 0,5 s in movimento si sta in INSERT solo il 10% del tempo, perché servono 0,4 s per entrarci.
- Velocità d'attacco totale possibile da fermi: Developer (+10%) + Scrum Lv5 + Vim Lv5 + 2 Espresso (+14%) ≈ +134%. Non serve un tetto: le orbite sono già limitate dal loro cooldown.

### Condizioni dell'OK (accolte dal designer)

1. Nel loadout Vim ha **peso 2** (come Scrum), non 1: a peso 1 sarebbe il miglior rapporto valore/costo del gioco e finirebbe in ogni build.
2. In playtest si misura f; se la mediana su telefono supera 0,5 (alzare il pollice = INSERT), INSERT scende a +10% per livello (a f = 1 pareggia Scrum).

---

## 4. Debuff «Aggiornamento»

Meccanica del designer ([gdd §3](gdd.md)): un nemico lento e basso che, se ti tocca, si consuma e mette in aggiornamento un'arma (non attacca e non fa danno) per qualche secondo.

### Obiettivo in numeri

- Perdita media di DPS ≤ 4% con 4 armi; picco ≤ 25% per ≤ 6 s.
- Un'arma non resta mai bloccata per più del 43% del tempo, anche se il giocatore non schiva mai.
- Mai durante il boss, mai nei primi 90 s, mai sull'unica arma.

### Numeri concordati

| Parametro | Prima bozza del designer | Concordato | Motivo |
|---|---|---|---|
| Durata del blocco | 6 s (3 s con una sola arma) | **6 s; con una sola arma nessun blocco** (solo il danno) | a inizio partita non si resta mai a mani vuote |
| Armi bloccate insieme | al massimo 1 | **al massimo 1** | — |
| Quale arma | a caso | **a caso, mai la stessa due volte di fila** | evita la sfortuna ripetuta |
| Tregua dopo il riavvio | — | **8 s senza nuovi blocchi** | limita il tempo bloccato a 6/(6+8) = 43% |
| Spawn | roster di Atlas, peso 2 da 100 s | **timer dedicato: uno ogni 30 s (±5) da 90 s**, massimo 2 vivi | col roster arrivano ~18–22 aggiornamenti al minuto |
| Durante il boss | (roster a metà) | **nessuno spawn** | un Angular bloccato contro il boss è un picco ingiusto |
| HP / velocità / altezza / danno | 40 / 3,2 / 1,5 / 4 | **invariati** | lento e basso: si uccide o si salta |

### Perché non lo spawn da roster

Peso 2 su un roster da 23 (Atlas dopo 140 s) = 8,7% degli spawn: a 13:30 di P1 sono 3,42 × 0,087 × 60 ≈ 18 aggiornamenti al minuto (22 in P2).
Anche uccidendone il 90%, restano 2 contatti al minuto: un'arma bloccata il 20% del tempo, e fino al 100% quando gli aggiornamenti lenti si accumulano intorno al giocatore che gira in cerchio.

### Impatto sul DPS

```
perdita media di DPS = (1 / numero di armi) × (tempo bloccato / tempo di gioco)
```

Con il timer: (360 − 90)/30 ≈ 9 aggiornamenti per giornata.

| Contatti | Tempo bloccato nella giornata | 2 armi | 3 armi | 4 armi |
|---|---|---|---|---|
| metà (4,5 × 6 s) | 27 s (7,5%) | 3,8% | 2,5% | 1,9% |
| tutti (9 × 6 s) | 54 s (15%) | 7,5% | 5,0% | 3,75% |
| tetto teorico (tregua 8 s) | 43% | 21% | 14% | 11% |

Picco: con 4 armi −25% di DPS per 6 s. A fine P3 (8,9 spawn/s), se la build tiene appena il passo, sono 0,25 × 8,9 × 6 ≈ 13 nemici in più, il 3% del tetto: si smaltiscono dopo il riavvio.

Varianti scartate (d'accordo con il designer): bloccare lo scatto toglie la contromisura principale; un bonus dopo il riavvio invoglia a farsi aggiornare apposta.

---

## 5. Loadout CPU/RAM

> **Decisione aperta per Marco.** Qui ci sono i numeri e i rischi delle varianti; nessuna è approvata. Finché Marco non decide restano gli slot di oggi (`maxWeapons: 4`, `maxPassives: 4`). Le etichette A–D sono quelle di [gdd §4](gdd.md).

### Le varianti sul tavolo

| Variante | Chi la propone | Regola | Leggibilità (ux) | Bilanciamento |
|---|---|---|---|---|
| A. Slot | oggi | 4 armi + 4 passivi | immediata | nessun lavoro |
| **B. Una risorsa per categoria** | ux, bilanciamento; raccomandata dal designer | armi → RAM, passivi → CPU; un costo per oggetto | un chip per carta, la risorsa la dice il tipo di carta; budget ≤ 12; usa le due righe di slot | due zaini indipendenti: la più facile da tarare |
| C. Una risorsa per oggetto | designer (giro 2) | ogni oggetto costa una sola risorsa, scelta per lui | un chip per carta, ma la risorsa va ricordata oggetto per oggetto | armi e passivi competono dentro ogni risorsa |
| D. Due costi per oggetto | richiesta originale del collega | ogni oggetto costa CPU e RAM | due chip e due barre: sconsigliata da ux su telefono | 24 × 2 costi da tarare; incastri difficili da leggere |
| ~~RAM unica condivisa~~ | prima bozza del designer, scartata | un solo budget per tutto | 16 tacche, oltre il tetto di 12 | apre la build "poche armi e passivi premium" |

### Formula del peso

Ogni oggetto ha un **peso** intero. In B e in C è il suo costo; in D si divide tra CPU e RAM.

```
armi:    peso = 1 + round(2 × (V − V_min) / (V_max − V_min))          → 1…3      (V dalla §1.4: V_min 0,42, V_max 1,58)
passivi: peso = clamp(1, 4, round(valore ln P / 0,15))                 → 1…4      (valore dalla §1.5)
```

Perché la stessa scala per armi e passivi: togliere un'arma media da una build da 4 vale ln(1/0,75) = 0,29, un passivo medio vale 0,27. Hanno lo stesso valore, quindi lo stesso peso medio (armi 2,17, passivi 2,00).

Regola della risorsa, per C e D, che il giocatore può ricordare:
- **CPU = calcolo**: attacchi che partono e spariscono (proiettili, catene, esplosioni) e le statistiche di attacco (danno, velocità d'attacco, critico, movimento).
- **RAM = memoria**: ciò che resta in campo (orbite, aure, pozze, alveare, aiutanti) e le statistiche di sopravvivenza e raccolta (HP, rigenerazione, raggio, XP). Spring Boot e MongoDB pesano in RAM per tema (JVM, database); Vim non usa RAM.
- In D le somme sono armi 13 CPU / 13 RAM e passivi 12 / 12: nessuna delle due risorse è sempre quella che finisce prima. In C sono CPU 24 / RAM 26.

| Arma | V | Peso (B) | C | D CPU / RAM |
|---|---|---|---|---|
| MongoDB | 1,58 | 3 | RAM 3 | 1 / 2 |
| Spring Boot | 1,56 | 3 | RAM 3 | 1 / 2 |
| Stack Overflow | 1,48 | 3 | CPU 3 | 3 / 0 |
| Paperella | 1,44 | 3 | CPU 3 | 2 / 1 |
| Firewall | 0,97 | 2 | CPU 2 | 1 / 1 |
| Claude Code | 0,89 | 2 | RAM 2 | 2 / 0 |
| Deploy di Venerdì | 0,85 | 2 | CPU 2 | 2 / 0 |
| Slide PowerPoint | 0,84 | 2 | RAM 2 | 0 / 2 |
| Alveare JPanik | 0,76 | 2 | RAM 2 | 0 / 2 |
| Scudo Angular | 0,71 (+ blocca i proiettili) | 2 | RAM 2 | 0 / 2 |
| Rispondi a Tutti | 0,50 | 1 | CPU 1 | 1 / 0 |
| Tazza di Java | 0,42 | 1 | RAM 1 | 0 / 1 |

| Passivo | Valore (ln P) | Peso (B) | C | D CPU / RAM |
|---|---|---|---|---|
| Multitasking | 0,50 + premio | 4 | CPU 4 | 2 / 2 |
| Certificazione Cloud | 0,47 | 3 | CPU 3 | 2 / 1 |
| Lavagna Bianca | 0,42 | 3 | RAM 3 | 1 / 2 |
| Certificazione Scrum | 0,36 | 2 | CPU 2 | 2 / 0 |
| Sedia Ergonomica | 0,35 | 2 | RAM 2 | 0 / 2 |
| Cornetto delle 10 | 0,25–0,35 | 2 | RAM 2 | 0 / 2 |
| Unit Test | ~0,27 | 2 | RAM 2 | 1 / 1 |
| Vim | 0,27 (f = 0,5) | 2 | CPU 2 | 2 / 0 |
| Code Review | 0,22 | 1 | CPU 1 | 1 / 0 |
| CV Aggiornato | ~0,20 | 1 | RAM 1 | 0 / 1 |
| Caffè Doppio | 0,09 | 1 | CPU 1 | 1 / 0 |
| Smart Working | ~0,05 | 1 | RAM 1 | 0 / 1 |

- Multitasking prende +1 di premio (0,50 / 0,15 = 3,3 → 4) perché il suo valore cresce con il numero di armi, e con un budget le armi possono essere 5–6.
- Il peso non cresce con il livello: si paga quando l'oggetto entra, gli upgrade restano gratis (vincolo di ux).
- La colonna C è un'assegnazione di esempio secondo la regola sopra; il designer può spostare singoli oggetti, ricontrollando le somme.

### Budget, crescita e tetti

Tutti i conteggi sono enumerazioni complete di tutti i sottoinsiemi possibili, con l'arma iniziale già installata (Paperella per il Developer, Slide per il PM). "Build piena" = nessun altro oggetto ci sta.

| | B (armi → RAM, passivi → CPU) | C (una risorsa per oggetto) | D (due costi) | RAM unica (scartata) |
|---|---|---|---|---|
| Budget in P1 | RAM 8 per le armi (Developer 9), CPU 7 per i passivi | CPU 8 / RAM 8 | CPU 8 / RAM 8 | 16 |
| Crescita | +1 a ogni JOscar, a scelta CPU o RAM, al massimo +2 a partita | uguale | uguale | +1 a ogni JOscar |
| Tetti | 6 armi, 6 passivi, 10 oggetti | 6, 6, 10 | 5, 5 | 5, 5 |
| Oggetti per build piena, media in P1 | 8,05 (PM) – 8,15 (Developer) | 8,12 (Developer) – 8,39 (PM) | 7,97 (Developer) – 8,26 (PM) | 7,93 |
| Oggetti, media in P3 (+2) | 8,86 – 9,01 | 9,08 – 9,28 | 8,78 – 9,06 | 8,71 |
| Build piene in P1 (Developer) | 15 169 | 15 281 | 17 857 | 71 738 |
| Composizioni diverse (armi + passivi) | 12 (3–5 armi × 2–5 passivi) | 23 | 17 | 18 |

Confronto con gli slot: oggi le build piene sono 81 675 (arma iniziale fissa, 3 armi su 11, 4 passivi su 12 con Vim) e la composizione è una sola (4 + 4).
Con un budget il numero di build piene non cresce: cambia la forma. Le build si distinguono per ampiezza (3–5 armi, 2–5 passivi) e alcune combinazioni forti non stanno più insieme.

- **Arma iniziale**: conta nel budget. In B il Developer ha 9 RAM e PM e Sistemista 8, perché la Paperella pesa 3 contro il 2 di Slide e Firewall: tutti partono con **6 RAM libere**. Con 9 per tutti, PM e Sistemista arrivano in media a 8,49 oggetti contro 8,15 del Developer (+4%).
- **Tetti**: in P1 non scattano mai (con 8–9 / 7 si arriva al massimo a 5 armi e 5 passivi); il tetto di 10 oggetti serve all'HUD su telefono in P3.
- **Vincoli di ux rispettati in B**: interi, costi 1–4, una risorsa per carta, al massimo 11 tacche per barra (Developer con +2 in RAM) contro un tetto di 12, al massimo 10 oggetti installati.
- **Niente carte che allargano il budget nei forzieri** (il «Banco di RAM» da +4 della prima bozza): +4 su 16 vale +25% del budget per carta, e dai forzieri ne arriverebbero 2–3 a partita. In P3 starebbero più oggetti degli slot di oggi.

### Build degeneri da evitare

| Build | Cosa succede | B | C | D |
|---|---|---|---|---|
| Le 4 armi più forti (MongoDB, Spring, Stack Overflow, Paperella) | oggi possibile con gli slot, senza rinunce | impossibile (RAM 12 > 8–9) | 6 CPU / 6 RAM su 8/8: restano 2/2 per i passivi | 7 / 5 su 8/8: restano solo passivi difensivi o da 1 |
| Poche armi e passivi premium (Paperella + SO + Multitasking + Cloud + Lavagna) | 2 armi moltiplicate da 3 passivi forti, che moltiplicano tutte le armi | impossibile (CPU 10 > 7) | impossibile (CPU 13 > 8) | impossibile (CPU 10 > 8) |
| Tante armi leggere e Multitasking | +1 proiettile su 5–6 armi | possibile solo in P3 con 6 armi; upgrade diluiti su 6 armi | idem | tetto 5 |
| Riempitivi da 1 (Review, CV, Smart, Caffè) | build larghe ma deboli | innocua | innocua | innocua |
| Vim a peso 1 | miglior rapporto valore/costo del gioco: in ogni build | evitata con peso 2 | idem | idem |
| Torretta di difesa (Sedia, Cornetto, Unit Test) | sopravvive ma uccide piano | il boss delle 18:00 è il controllo del DPS | idem | idem |

Le 4 armi più forti sono impossibili solo in B; in C e D diventano un compromesso (armi forti contro passivi).

### Rischi

1. **Costi fissi, valori che cambiano** (il rischio principale): il valore di Multitasking cresce con il numero di armi, quello della Lavagna dipende da quante aure e orbite hai, quello di Unit Test cala del 60% da P1 a P3. Un oggetto con il costo sbagliato diventa la scelta di tutti. Serve la taratura da playtest descritta in [§7](#7-verifica-in-gioco-fase-2).
2. **Il modello DPS è approssimato** (densità di folla e quota di colpi a segno stimate): i pesi sono un punto di partenza, non un risultato.
3. **Leggibilità**: D con due costi e la RAM unica a 16 tacche superano i limiti indicati da ux per il telefono. C chiede di ricordare la risorsa di ogni oggetto.
4. **Ogni oggetto nuovo ha bisogno di un peso**: la formula lo rende ripetibile (V o valore ln P → peso), ma va ricalcolato ogni volta.
5. **La sostituzione in 2 tocchi proposta da ux** permette di cambiare build a metà partita, perdendo i livelli: si penalizza da sola e non crea build degeneri.

---

## 6. Decisioni aperte per Marco

1. **Loadout**: A (slot di oggi), B (armi → RAM, passivi → CPU: raccomandata dal designer, preferita da ux e, per i conti, da bilanciamento), C (una risorsa per oggetto) o D (due costi per oggetto, la richiesta originale). Numeri in [§5](#5-loadout-cpuram).
2. **Crescita del budget**: +1 a ogni JOscar a scelta, al massimo +2 a partita (proposta concordata), oppure budget fisso per tutta la partita.

Nessun disaccordo con il designer è rimasto aperto sulle idee 1–3: vedi il [registro](#8-registro-del-confronto-e-delle-modifiche).

## 7. Verifica in gioco (fase 2)

Protocollo per qa-tester, quando le idee saranno implementate (`npm run dev`, URL con `#debug`):

| Idea | Passi | Atteso |
|---|---|---|
| Call di Gruppo | `Y` per una call; colpire con la Paperella un bug dentro e uno fuori dall'anello, 10 colpi ciascuno, critici esclusi | rapporto medio dei numeri di danno 0,70 ± 0,05 |
| Call di Gruppo | `T` fino a 13:30 di P1, contare le call comparse | 3 (a 75, 115, 155 s); mai più di 2 vive |
| Vim | `V` ×5, fermi 2 s: cooldown della Paperella del Developer | 0,75 / (1,10 + 0,60) = 0,44 s |
| Vim | registrare 3 partite da telefono e 3 da desktop: frazione di tempo da fermo f | se la mediana su telefono è > 0,5, INSERT a 10% |
| Aggiornamento | `T` per una giornata intera: contare i blocchi e la loro durata | ≤ 9 blocchi; nessun blocco entro 8 s da un riavvio; nessuno con il boss vivo o con una sola arma |
| Loadout | 10 partite per variante; dalla schermata finale, quota di danno di ogni arma | se la quota media di un'arma supera 1,5× la sua quota di peso nella build, il peso sale di 1 (e viceversa) |
| Tutte | `T` fino a fine giornata con 280 nemici, 3 call e 2 aggiornamenti vivi | logica ≤ 0,75 ms/frame, sprite in una draw call |

Tasso di scelta dalle carte: un passivo o un'arma presente in più del 60% delle build finali è troppo forte (regola "nessuna strategia dominante").

## 8. Registro del confronto e delle modifiche

Nessun valore di `src/config/` è cambiato in questa fase. Le modifiche proposte, prima → dopo, sono nelle tabelle "Numeri concordati" delle sezioni 2–4 e nella sezione 5.

| Data | Idea | Giro | Bilanciamento | Designer | Esito |
|---|---|---|---|---|---|
| 2026-10-27 | Call di Gruppo | 1 | −30%, 80 HP, velocità 3,4, timer 40/35/30 s, massimo 2/2/3, valori per stage | −50%, 24 HP, velocità 4,6, roster peso 2, massimo 3 | tutto accolto; raggio passato a 7 |
| 2026-10-27 | Call di Gruppo | 2 | raggio 6 (il 7 era un mio errore rispetto all'obiettivo); alternativa R7 con −25% | — | **OK** con raggio 6 |
| 2026-10-27 | Vim | 1 | OK su 12%/5%, a condizione del peso 2 nel loadout e della misura di f | 12%/5%, "1 GB, il più leggero" | **OK**, condizioni accolte |
| 2026-10-27 | Aggiornamento | 1 | timer 30 s, tregua 8 s, niente durante il boss | roster di Atlas, peso 2 | tutto accolto; in più "mai sull'unica arma" |
| 2026-10-27 | Aggiornamento | 2 | OK alla fonte "nemico" e a "mai sull'unica arma" | — | **OK** |
| 2026-10-27 | Loadout | 1 | scala comune 1–3 / 1–4; RAM unica fuori dal tetto di ux; niente Banco +4 dai forzieri | RAM unica 16 GB, armi 2–6, passivi 1–3, Banco +4 | accolto: raccomandazione passata a B |
| 2026-10-27 | Loadout | 2 | OK ai numeri di B; budget armi 9 Developer / 8 PM e Sistemista; tetti 6/6/10 OK | B con 9 RAM / 7 CPU, tetti 6/6/10 | OK sui numeri; adozione: Marco |
| 2026-10-27 | Loadout (ux) | — | budget RAM 8–9 / CPU 7, costi 1–3 e 1–4, massimo 11 tacche, nessun chip del budget nel titolo (6 RAM libere per tutti) | — | **OK di ux**, riportato in `ux.md` |
