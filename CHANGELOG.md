# Changelog

## v1.1.0 — 2026-09-25

- Tracker Quest/Obiettivi persistente, con checklist di sotto-obiettivi
- Generatore Casuale di Mostri nel Compendio (filtrabile per Grado di Sfida), con dati
  meccanici tratti dai contenuti aperti (SRD) delle regole ufficiali di D&D 5e, indicazione
  della fonte e campo per annotare manualmente manuale/pagina
- Campi Razza e Classe nella tabella Party, con suggerimenti delle opzioni standard 5e
- Costruttore Incontro: selezione rapida di un mostro dall'elenco SRD, oltre all'inserimento manuale
- Rimossi i riferimenti a "Kobold Fight Club" dal Costruttore Incontro
- Tracciamento completo delle 14 condizioni 5e (non più solo Prono/Immobilizzato) più il
  livello di Sfinimento, per party e PNG, con migrazione automatica dei dati salvati
- Nuova sezione Riepilogo (dashboard) in cima alla pagina: round, tempo, turno attivo,
  PF critici, quest aperte, ultima sessione
- Monete del Generatore di Tesori tradotte in italiano (mr/ma/mo/mp)
- Campo Note nel Diario di Sessione, separato dal riassunto
- Ordine di Iniziativa spostato subito dopo il Riepilogo
- Tabella Eventi Negativi paginata (10 righe alla volta) invece di un'unica lista lunga
- Spell slot dei caster calcolati automaticamente da classe e livello (regole 5e 2014):
  caster completi, mezzi caster, caster a un terzo e Magia del Patto del Warlock
- Pulsante "Aggiungi al Party" sulle schede caster e barbaro per aggiungerli alla tabella Party
- Ire del barbaro calcolate automaticamente dal livello (regole 5e 2014), incluse le
  ire illimitate al 20° livello
- Tiri Salvezza contro la Morte per i PG a 0 PF (3 successi/3 fallimenti), con
  stabilizzazione o morte automatiche e azzeramento quando i PF tornano sopra 0
- Tracciamento della Concentrazione (attiva/incantesimo) per party e PNG, visibile anche
  nel Riepilogo

## v1.0.0

Prima release dello Schermo del Game Master.

### Tracciamento del combattimento
- Round (contatore) e Tempo trascorso (cronometro con stima del tempo di gioco)
- Spell slot dei caster, per livello, con più incantatori
- Ira del barbaro, con più barbari
- Tabella del party (CA/PF/Iniziativa/Danni/Condizione) ordinabile per colonna
- Schede PNG in combattimento (nemici e alleati)
- Ordine di Iniziativa unificato (PG + PNG), con avanzamento automatico del Round

### Strumenti di preparazione e improvvisazione
- Costruttore Incontro con soglie XP e moltiplicatori basati sulle regole del Manuale del Dungeon Master
- Generatore di Tesori (monete, gemme, oggetti d'arte) per fascia di Grado di Sfida
- Generatore di nomi PNG fantasy (per razza e genere)
- Generatore di nomi di luoghi fantasy
- Taverna Casuale (nome, locandiere, menù, alloggio, PNG presenti, gossip)
- Tabella Eventi Negativi / Wild Magic Surge (100 voci, tre livelli di gravità)

### Dati di campagna persistenti
- Rubrica di PNG e Fazioni
- Diario di Sessione
- Compendio di oggetti, tesori e mostri incontrati
- Tutti sopravvivono al pulsante "Nuovo Combattimento"

### Altro
- Esporta/Importa dati come backup JSON
- Grafica in stile Homebrewery, responsive da mobile a desktop
