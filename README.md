# Schermo del Game Master — D&D 5e

🔗 **Sito live**: https://brandonpacca.github.io/dnd-web-gamemaster-screen/

Sito statico (HTML/CSS/JS, nessuna build necessaria) per tenere traccia degli aspetti principali di una campagna D&D 5e durante le sessioni di gioco, con una grafica ispirata a [Homebrewery](https://homebrewery.naturalcrit.com/).

Tutti i dati vengono salvati automaticamente nel `localStorage` del browser: nessun server o database richiesto.

## Funzionalità

### Riepilogo
- **Dashboard** in cima alla pagina con un colpo d'occhio sullo stato corrente: round e tempo trascorso, turno attivo, party/PNG con PF critici (≤25%), quest aperte e ultima sessione registrata — aggiornata automaticamente ad ogni modifica

### Tracciamento del combattimento
- **Round**: contatore incrementabile/decrementabile
- **Tempo trascorso**: cronometro avvia/pausa/azzera, con stima del tempo di gioco in base ai round (secondi/round configurabili)
- **Spell slot dei caster**: aggiungi quanti incantatori servono, con slot per livello (1-9) e segnaposto cliccabili per marcare l'uso
- **Ira del barbaro**: aggiungi più barbari, ciascuno con numero massimo di ire configurabile
- **Tabella del party**: Nome PG / Razza / Classe / CA / PF / Iniziativa / Danni subiti / Condizione, ordinabile cliccando sulle intestazioni di colonna, con suggerimenti di razze/classi standard 5e
- **Schede PNG in combattimento**: card separate per nemici e alleati con CA / PF / Iniziativa / Danni subiti / Condizione
- **Condizioni**: tutte le 14 condizioni della 5e (Accecato, Affascinato, Assordato, Spaventato, Afferrato, Incapacitato, Invisibile, Paralizzato, Pietrificato, Avvelenato, Prono, Trattenuto, Stordito, Privo di sensi) come segnaposto cliccabili, più il livello di Sfinimento (0-6), sia per il party sia per i PNG
- **Ordine di Iniziativa**: unisce automaticamente party e PNG in un unico ordine di turno ordinato per Iniziativa, con controlli avanti/indietro; superare l'ultimo combattente incrementa da solo il Round

### Strumenti di preparazione ed improvvisazione
- **Costruttore Incontro**: calcola la difficoltà di uno scontro con soglie XP e moltiplicatori basati sulle regole del Manuale del Dungeon Master; permette di scegliere un mostro dall'elenco dei contenuti aperti (SRD) o di inserirne uno personalizzato per Grado di Sfida, e di trasformarli con un click in PNG nemici
- **Generatore di Tesori**: monete, gemme e oggetti d'arte scalati su quattro fasce di Grado di Sfida, con valore totale stimato in monete d'oro
- **Generatore di nomi PNG fantasy**: per razza (Umano, Elfo, Nano, Halfling, Orco/Goblin, Oscuro/Non-morto) e genere, con soprannome opzionale
- **Generatore di nomi di luoghi fantasy**: per tipo (città, foresta, montagna, corso d'acqua, rovine, regno...)
- **Taverna Casuale**: genera con un click una taverna completa di nome, locandiere, menù di cibo e bevande con prezzi, disponibilità e costo dei posti letto, PNG presenti (con descrizione fisica e caratteriale) e gossip attribuiti a loro
- **Tabella Eventi Negativi (Wild Magic Surge)**: 100 scariche di magia selvaggia su tre livelli di gravità (Estremo/Moderato/Fastidio), consultabile a pagine da 10 righe con tiro rapido (d100 + d20) o ricerca per numero/parola chiave

### Dati di campagna persistenti
A differenza del tracciamento del combattimento, questi dati **sopravvivono** al pulsante "Nuovo Combattimento" e restano disponibili per l'intera campagna:
- **Rubrica di PNG e Fazioni**: scheda per ogni PNG/fazione con razza o ruolo, luogo, disposizione (alleato/neutrale/nemico/sconosciuto), descrizione e note del GM, con ricerca e filtro per tipo. Un pulsante "+ Rubrica" sulle schede PNG di combattimento permette di salvare al volo un PNG ricorrente
- **Diario di Sessione**: registro delle sessioni giocate (numerate automaticamente, data reale, data in-game, riassunto libero e campo Note separato), ordinato dalla più recente con ricerca full-text
- **Tracker Quest/Obiettivi**: quest con committente, stato (Attiva/In Sospeso/Completata/Fallita), ricompensa e una checklist di sotto-obiettivi da spuntare, ordinate con le attive in cima, con ricerca e filtro per stato
- **Compendio**: archivio di oggetti/tesori e mostri incontrati, ciascuno con ricerca dedicata. Il Costruttore Incontro ha un pulsante "+ Comp." per salvare un mostro, e il Generatore di Tesori può salvare gemme e oggetti d'arte generati con un click. Include anche un **Generatore Casuale di Mostri** (filtrabile per Grado di Sfida) con dati meccanici — nome, tipo, GS, CA, PF — tratti dai contenuti aperti (SRD) delle regole ufficiali di D&D 5e, con indicazione della fonte e un campo per annotare manualmente manuale/pagina una volta verificati

### Backup
- **Esporta/Importa dati (JSON)**: scarica in un unico file sia lo stato del combattimento sia i dati di campagna (rubrica, diario e compendio), e ripristinali in seguito — utile perché tutto vive solo nel `localStorage` del browser in uso

Un menu di navigazione fisso in alto permette di raggiungere rapidamente ogni sezione.

## Utilizzo

Non è richiesta alcuna installazione: basta aprire `index.html` in un browser, oppure servire la cartella con un server statico qualsiasi, ad esempio:

```bash
python3 -m http.server 8000
```

e visitare `http://localhost:8000`.

## Struttura del progetto

```
index.html      Markup e sezioni della pagina
css/style.css   Grafica in stile Homebrewery (pergamena, font fantasy, bordi ornati)
js/app.js       Logica dell'applicazione (stato, rendering, generatori, persistenza)
```

## Note

- Nessuna dipendenza esterna a runtime: solo JavaScript vanilla e i font Google (MedievalSharp, EB Garamond).
- Tutti i contenuti generati (nomi, taverne, mostri) sono creati dinamicamente lato client.
