(function () {
  'use strict';

  var STORAGE_KEY = 'dnd-combat-tracker-state-v1';

  var defaultState = {
    round: 0,
    time: {
      running: false,
      startedAt: null, // ms timestamp when current run started
      accumulatedMs: 0,
      secPerRound: 6
    },
    casters: [],   // { id, name, levels: [{level, max, used}] }
    rages: [],     // { id, name, max, used }
    party: [],     // { id, name, ac, hpCur, hpMax, init, damage, prone, restrained }
    npcs: [],      // { id, name, side, ac, hpCur, hpMax, init, damage, prone, restrained }
    sort: { key: null, dir: 1 },
    encounter: {
      partySize: 4,
      partyLevel: 3,
      monsters: [] // { id, name, cr, qty, ac, hp }
    },
    initiative: {
      activeId: null // id of the combatant whose turn is active, e.g. "pg-<id>" or "png-<id>"
    }
  };

  // ---- Encounter-building data (5e DMG XP threshold/multiplier methodology) ----

  var CR_XP = [
    { cr: '0', xp: 10 }, { cr: '1/8', xp: 25 }, { cr: '1/4', xp: 50 }, { cr: '1/2', xp: 100 },
    { cr: '1', xp: 200 }, { cr: '2', xp: 450 }, { cr: '3', xp: 700 }, { cr: '4', xp: 1100 },
    { cr: '5', xp: 1800 }, { cr: '6', xp: 2300 }, { cr: '7', xp: 2900 }, { cr: '8', xp: 3900 },
    { cr: '9', xp: 5000 }, { cr: '10', xp: 5900 }, { cr: '11', xp: 7200 }, { cr: '12', xp: 8400 },
    { cr: '13', xp: 10000 }, { cr: '14', xp: 11500 }, { cr: '15', xp: 13000 }, { cr: '16', xp: 15000 },
    { cr: '17', xp: 18000 }, { cr: '18', xp: 20000 }, { cr: '19', xp: 22000 }, { cr: '20', xp: 25000 },
    { cr: '21', xp: 33000 }, { cr: '22', xp: 41000 }, { cr: '23', xp: 50000 }, { cr: '24', xp: 62000 },
    { cr: '25', xp: 75000 }, { cr: '26', xp: 90000 }, { cr: '27', xp: 105000 }, { cr: '28', xp: 120000 },
    { cr: '29', xp: 135000 }, { cr: '30', xp: 155000 }
  ];

  var XP_THRESHOLDS = {
    1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
    5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
    9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
    13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
    17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700]
  };

  function xpForCr(cr) {
    var entry = CR_XP.find(function (e) { return e.cr === cr; });
    return entry ? entry.xp : 0;
  }

  var MULTIPLIER_SEQUENCE = [1, 1.5, 2, 2.5, 3, 4];

  function multiplierIndexForCount(count) {
    if (count <= 1) return 0;
    if (count === 2) return 1;
    if (count <= 6) return 2;
    if (count <= 10) return 3;
    if (count <= 14) return 4;
    return 5;
  }

  function effectiveMultiplier(count, partySize) {
    var idx = multiplierIndexForCount(count);
    if (partySize < 3) idx = Math.min(idx + 1, MULTIPLIER_SEQUENCE.length - 1);
    else if (partySize >= 6) idx = Math.max(idx - 1, 0);
    return MULTIPLIER_SEQUENCE[idx];
  }

  function difficultyForXp(adjustedXp, thresholds) {
    if (adjustedXp < thresholds[0]) return { label: 'Banale', cls: 'diff-trivial' };
    if (adjustedXp < thresholds[1]) return { label: 'Facile', cls: 'diff-easy' };
    if (adjustedXp < thresholds[2]) return { label: 'Medio', cls: 'diff-medium' };
    if (adjustedXp < thresholds[3]) return { label: 'Difficile', cls: 'diff-hard' };
    return { label: 'Mortale', cls: 'diff-deadly' };
  }

  // ---- Fantasy name generator data ----

  var RACE_ORDER = [
    { key: 'human', label: 'Umano' },
    { key: 'elf', label: 'Elfo' },
    { key: 'dwarf', label: 'Nano' },
    { key: 'halfling', label: 'Halfling' },
    { key: 'orc', label: 'Orco/Goblin' },
    { key: 'undead', label: 'Oscuro/Non-morto' }
  ];

  var NPC_NAMES = {
    human: {
      male: ['Aldric', 'Bryndon', 'Cedric', 'Doran', 'Edmund', 'Faelan', 'Garrick', 'Henrik', 'Ivor', 'Jasper', 'Kellan', 'Leofric', 'Magnus', 'Nolan', 'Osric', 'Quentin', 'Roderic', 'Soren', 'Tobias', 'Wendell'],
      female: ['Adelina', 'Brianne', 'Cassia', 'Delyth', 'Elowen', 'Fiora', 'Genevra', 'Hilde', 'Iris', 'Jocelyn', 'Katriona', 'Lysandra', 'Maren', 'Nessa', 'Odalys', 'Perrine', 'Rosalind', 'Seraphine', 'Tamsin', 'Wilhelmina']
    },
    elf: {
      male: ['Aerendyl', 'Beliador', 'Caelthil', 'Duskryn', 'Erevan', 'Faelivrin', 'Galanor', 'Haemir', 'Ithilion', 'Kaelthorn', 'Lucanthil', 'Orenthil', 'Quillion', 'Rivendal', 'Silvyr', 'Thelanis', 'Varendil', 'Aramil', 'Berrian', 'Carric'],
      female: ['Aelrindel', 'Briaris', 'Caelynn', 'Dariwen', 'Elowyn', 'Faelynn', 'Galinare', 'Ilyndra', 'Jariel', 'Keryth', 'Liriel', 'Myrandriel', 'Naivara', 'Orlaith', 'Sariel', 'Thessaly', 'Undomel', 'Vaelith', 'Wrenna', 'Yavara']
    },
    dwarf: {
      male: ['Balin', 'Brogar', 'Durgrim', 'Eberk', 'Fargrim', 'Grundar', 'Harnik', 'Ivgar', 'Korvath', 'Maldrek', 'Norik', 'Orrik', 'Ragnvald', 'Skorri', 'Thorgar', 'Ulgrim', 'Vondal', 'Wulfric', 'Brenrik', 'Drakur'],
      female: ['Alrun', 'Brenna', 'Disa', 'Eldrid', 'Frida', 'Gundra', 'Helka', 'Ingrun', 'Kadga', 'Liska', 'Modda', 'Norna', 'Ottila', 'Runa', 'Sigrun', 'Torhild', 'Ulfa', 'Vestra', 'Wenna', 'Yorna']
    },
    halfling: {
      male: ['Alder', 'Bramwell', 'Corin', 'Doby', 'Elmo', 'Finnick', 'Garret', 'Hobb', 'Ivo', 'Jorey', 'Kip', 'Larkin', 'Merric', 'Nob', 'Otho', 'Pip', 'Rollo', 'Sam', 'Tobin', 'Wendic'],
      female: ['Alfrida', 'Bree', 'Cora', 'Daisy', 'Elanor', 'Fennel', 'Gilly', 'Holly', 'Ivy', 'Jasmina', 'Kora', 'Lily', 'Merla', 'Nora', 'Orla', 'Poppy', 'Rosie', 'Sela', 'Tilly', 'Wilda']
    },
    orc: {
      male: ['Grukk', 'Mogthar', 'Ruggash', 'Skarn', 'Thokk', 'Ugrat', 'Vrog', 'Zulgash', 'Bargol', 'Drazgul', 'Fesk', 'Gornak', 'Hrolk', 'Krusk', 'Morg', 'Nashgor', 'Orgul', 'Snagg', 'Throgg', 'Uzgash'],
      female: ['Agra', 'Brakka', 'Chok', 'Drusha', 'Eska', 'Grak', 'Hulga', 'Krusha', 'Mogra', 'Nira', 'Orka', 'Rukha', 'Scaba', 'Thura', 'Urka', 'Vashka', 'Yagra', 'Zeeka', 'Bogra', 'Nashka']
    },
    undead: {
      male: ['Malachar', 'Nyxander', 'Ossian', 'Ravenscar', 'Sythe', 'Thantos', 'Ulric Noir', 'Vaelkor', 'Wraithmoor', 'Xandrek', 'Zarnath', 'Corvain', 'Draven', 'Endros', 'Grimwald', 'Hadrix', 'Kravox', 'Lorthane', 'Morvain', 'Sablewynd'],
      female: ['Ashara', 'Belladonna', 'Cyrenne', 'Duskara', 'Evanthe', 'Fenwraith', 'Grishenna', 'Isolde Noir', 'Lilivex', 'Morgwraith', 'Nyssara', 'Ravenna', 'Selvara', 'Thanawyn', 'Umbraline', 'Vexara', 'Wraithe', 'Xylara', 'Yveth', 'Zaralyn']
    }
  };

  var EPITHETS = [
    'il Coraggioso', 'la Silenziosa', 'Manoferrea', 'delle Nebbie', 'Piedeleggero', 'il Vagabondo',
    'Occhiodifalco', 'la Saggia', 'il Temerario', 'delle Ombre', 'Cuordiquercia', 'la Instancabile',
    'il Custode', 'delle Terre Perdute', 'Lamaacuta', 'il Silente', 'la Errante', 'Barbagrigia',
    'Pugnodiferro', 'la Fiamma'
  ];

  var PLACE_TYPES = [
    { key: 'any', label: 'Tipo casuale', variants: null },
    { key: 'city', label: 'Città/Villaggio', variants: ['Città', 'Villaggio', 'Borgo', 'Cittadella'] },
    { key: 'forest', label: 'Foresta/Bosco', variants: ['Foresta', 'Bosco', 'Selva'] },
    { key: 'mountain', label: 'Montagna/Passo', variants: ['Montagna', 'Picco', 'Passo', 'Catena Montuosa'] },
    { key: 'water', label: 'Fiume/Lago/Palude', variants: ['Fiume', 'Lago', 'Palude', 'Baia'] },
    { key: 'ruin', label: 'Rovine/Fortezza', variants: ['Rovine', 'Fortezza Abbandonata', 'Cripta', 'Covo'] },
    { key: 'realm', label: 'Regno/Terra', variants: ['Regno', 'Terra', 'Dominio', 'Contea'] }
  ];

  var PLACE_SYLL_1 = ['Thorn', 'Shadow', 'Iron', 'Storm', 'Raven', 'Dusk', 'Silver', 'Elden', 'Wyn', 'Gal', 'Mor', 'Val', 'Kel', 'Bran', 'Fen', 'Grim', 'Moon', 'Sun', 'Wolf', 'Drake', 'Frost', 'Ember', 'Night', 'Star', 'Blood', 'Whisper'];
  var PLACE_SYLL_2 = ['haven', 'wood', 'mere', 'vale', 'moor', 'reach', 'fall', 'crest', 'hollow', 'shade', 'wick', 'brook', 'gate', 'spire', 'watch', 'keep', 'hold', 'crag', 'glen', 'marsh'];

  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateNpcName(raceKey, genderKey, withEpithet) {
    var race = NPC_NAMES[raceKey] || NPC_NAMES.human;
    var gender = genderKey === 'any' ? (Math.random() < 0.5 ? 'male' : 'female') : genderKey;
    var pool = race[gender] || race.male;
    var name = randChoice(pool);
    if (withEpithet) name += ' ' + randChoice(EPITHETS);
    return name;
  }

  function generatePlaceName(typeKey) {
    var candidates = typeKey === 'any' ? PLACE_TYPES.filter(function (t) { return t.key !== 'any'; }) : PLACE_TYPES.filter(function (t) { return t.key === typeKey; });
    var type = randChoice(candidates);
    var typeLabel = randChoice(type.variants);
    var invented = randChoice(PLACE_SYLL_1) + randChoice(PLACE_SYLL_2).toLowerCase();
    return typeLabel + ' di ' + invented;
  }

  // ---- Wild Magic Surge / Eventi Negativi table (d100 row, d20 severity band) ----
  // 1-3 = Estremo, 4-9 = Moderato, 10-20 = Fastidio

  var WILD_MAGIC_TABLE = [
    { e: "Una palla di fuoco esplode con te al centro. Tu e ogni creatura entro 20 piedi da te dovete effettuare un tiro salvezza su Destrezza contro la tua CD degli incantesimi, subendo 5d6 danni da fuoco in caso di fallimento, o la metà in caso di successo.", m: "Per il giorno successivo, il colore della tua pelle cambia ogni 30 minuti, ciclando attraverso i colori dell'arcobaleno.", n: "Una pozza d'untuosità appare dove ti trovi, con un raggio di 10 piedi. Tu e chiunque si trovi entro 10 piedi da te dovete superare una prova di Destrezza contro la tua CD o cadere proni." },
    { e: "Recuperi tutti gli slot incantesimo spesi.", m: "Sei confuso per 1 minuto, come se fossi colpito dall'incantesimo confusione.", n: "Levitate a circa 15 centimetri da terra per 1 minuto." },
    { e: "Perdi la capacità di udire per 1 giorno.", m: "La tua Forza aumenta di 2 per 1 giorno.", n: "Ottieni tremorsenso con un raggio di 30 piedi per 1 minuto." },
    { e: "Ogni creatura entro 30 piedi da te subisce 1d10 danni necrotici. Recuperi punti ferita pari alla somma dei danni inflitti.", m: "Un terzo occhio appare sulla tua fronte, dandoti vantaggio alle prove di Saggezza (Percezione) basate sulla vista per 1 minuto.", n: "Non emetti alcun suono per 1 minuto e ottieni vantaggio a qualsiasi prova di Destrezza (Furtività)." },
    { e: "Ti teletrasporti in un piano alternativo, per poi tornare nel luogo in cui ti trovavi dopo 1 minuto.", m: "Il prossimo incantesimo che lanci entro il prossimo minuto e che infligge danni, infligge il danno massimo.", n: "Ti cresce una barba fatta di piume, che rimane finché non starnutisci." },
    { e: "Ti trasformi in un grande barile vuoto per 1 minuto, durante il quale sei considerato pietrificato.", m: "Per il prossimo minuto, puoi teletrasportarti fino a 20 piedi come parte del tuo movimento in ciascuno dei tuoi turni.", n: "Non puoi parlare per 1 minuto. Quando ci provi, dalla tua bocca escono bolle rosa." },
    { e: "Sei al centro di un incantesimo oscurità per 1 minuto.", m: "Sei ubriaco per 2d6 ore.", n: "Sei immune all'ubriachezza per i prossimi 5d6 giorni." },
    { e: "Sei spaventato dalla creatura più vicina fino alla fine del tuo prossimo turno.", m: "La tua Intelligenza diminuisce di 2 per 1 giorno.", n: "Recuperi il tuo slot incantesimo di livello più basso tra quelli spesi." },
    { e: "Sei resistente a tutti i tipi di danno per 1 minuto.", m: "La tua Saggezza aumenta di 2 per 1 giorno.", n: "Per il prossimo minuto, devi urlare quando parli." },
    { e: "Una creatura casuale entro 60 piedi da te è avvelenata per 1d4 ore.", m: "Per 1 minuto, qualsiasi oggetto infiammabile che tocchi, e che non stai già indossando o portando con te, prende fuoco.", n: "Farfalle illusorie e petali di fiori svolazzano nell'aria intorno a te in un raggio di 10 piedi per 1 minuto." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua stessa CD. Se fallisci, vieni mutato in una gigantesca libellula per 1 minuto.", m: "Delle piante crescono intorno a te e sei trattenuto per 1 minuto.", n: "Lanci immagine speculare su te stesso, che dura 1 minuto e non richiede concentrazione." },
    { e: "Fino a tre creature a tua scelta entro 30 piedi da te subiscono 4d10 danni da fulmine.", m: "Una creatura casuale entro 30 piedi da te ottiene una velocità di volo pari alla sua velocità di movimento per 1 minuto.", n: "Sei circondato da una musica flebile ed eterea per 1 minuto." },
    { e: "Ottieni immediatamente 20 punti ferita temporanei.", m: "Puoi immediatamente compiere 1 azione aggiuntiva.", n: "Recuperi tutti i punti stregoneria spesi." },
    { e: "Ti teletrasporti fino a 60 piedi in uno spazio libero che puoi vedere.", m: "Se cadi entro il prossimo giorno, ottieni automaticamente il beneficio dell'incantesimo caduta piumata.", n: "I tuoi capelli raddoppiano la loro lunghezza attuale nel corso del prossimo minuto." },
    { e: "Sei al centro di un incantesimo silenzio per 1 minuto.", m: "Recuperi 1 slot incantesimo speso a tua scelta.", n: "I tuoi capelli cadono ma ricrescono entro 1 giorno." },
    { e: "Sei vulnerabile agli immondi per 1 ora. Tali creature ottengono vantaggio ai tiri per colpire contro di te.", m: "Per il prossimo incantesimo che infliggi danno entro 1 minuto, il danno è minimo.", n: "Ottieni la capacità di parlare una lingua aggiuntiva a tua scelta per 1 ora." },
    { e: "Per il giorno successivo, ogni volta che effettui una prova di caratteristica, tira 1d6 e sottrai il risultato.", m: "Sei circondato da uno scudo spettrale per 1 minuto, che ti dà un bonus di +2 alla CA e immunità al dardo incantato.", n: "Sei invisibile per 1 minuto." },
    { e: "Per qualsiasi incantesimo che richiede un tiro salvezza che lanci entro il prossimo minuto, il bersaglio ottiene vantaggio.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni perforanti per 1 minuto.", n: "I tuoi occhi cambiano colore permanentemente. Se sono di una tonalità blu o grigia, diventano marrone scuro, o viceversa. Un incantesimo come rimuovi maledizione può porre fine a questo effetto." },
    { e: "Il prossimo incantesimo a bersaglio singolo che lanci entro il prossimo minuto deve colpire un bersaglio aggiuntivo.", m: "Per 1 minuto, ottieni resistenza ai danni contundenti, perforanti e taglienti non magici.", n: "Piccoli uccelli svolazzano e cinguettano nelle tue vicinanze per 1 minuto, durante il quale fallisci automaticamente qualsiasi prova di Furtività." },
    { e: "Un demone il cui GS è pari al tuo livello appare vicino a te. Effettua un tiro salvezza su Carisma contro la tua CD. Se lo superi, il demone è sottomesso, altrimenti è ostile. Il demone, se non bandito o sconfitto, svanisce dopo 1 giorno.", m: "Sei protetto dagli elementali per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "Senti l'incredibile bisogno di andare in bagno. Finché non lo fai, la tua Forza e la tua Intelligenza sono ridotte di 1. Se non ti liberi entro i prossimi 2 minuti, i suddetti effetti vengono rimossi, ma il tuo punteggio di Carisma è ridotto di 4 per 1 ora o finché non cambi i pantaloni." },
    { e: "Per il prossimo minuto, ogni creatura entro 60 piedi da te che ti sente parlare sente solo insulti, come se stessi lanciando scherno crudele di primo livello.", m: "Per il prossimo minuto, una creatura a tua scelta subisce una penalità di -2 alla CA, ai tiri per colpire e ai tiri per i danni.", n: "Dei moscerini ronzano intorno alla tua testa per 1 minuto, distraendoti. Devi superare un tiro salvezza su Costituzione contro la tua CD per lanciare qualsiasi incantesimo." },
    { e: "Per il giorno successivo, hai vantaggio sui prossimi 2d6 tiri che effettui in cui non hai già vantaggio.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni contundenti per 1 minuto.", n: "Sei circondato da un debole cattivo odore per 1 minuto. Ottieni svantaggio a tutte le prove di Carisma." },
    { e: "Sei protetto dalle aberrazioni per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Emani luce in un raggio di 30 piedi per 1 minuto. Qualsiasi creatura entro 5 piedi da te che può vedere è accecata fino alla fine del suo prossimo turno.", n: "Per il prossimo minuto, tutti gli incantesimi con un tempo di lancio di 1 azione o 1 azione bonus richiedono 2 azioni consecutive per essere lanciati." },
    { e: "Per 1 minuto, un tuo duplicato appare nello spazio libero più vicino e può compiere azioni in modo indipendente, agendo con la tua stessa Iniziativa. Tuttavia, ogni danno che subisce, così come ogni slot incantesimo o punto stregoneria che utilizza, si applica anche a te.", m: "Per la prossima ora, ottieni vantaggio alle prove di Carisma quando hai a che fare con qualsiasi creatura che indossa nero, ma svantaggio se indossa bianco. Se indossa entrambi i colori, questo non si applica.", n: "Hai l'irresistibile bisogno di grattarti un prurito nel mezzo della schiena, appena fuori portata, per 1 minuto. Se non lo gratti usando un gratta-schiena o un dispositivo simile, devi superare un tiro salvezza su Costituzione contro la tua CD per lanciare un incantesimo." },
    { e: "Un forte boato emana da te. Tutte le creature entro 15 piedi subiscono 2d8 danni da tuono e devono superare un tiro salvezza su Costituzione contro la tua CD o essere assordate per 1 minuto.", m: "Sei protetto dalle piante per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "Hai una visione momentanea della tua stessa morte. Se fallisci un tiro salvezza su Saggezza contro la tua CD, sei spaventato per 1 minuto." },
    { e: "Tutte le creature entro 60 piedi da te recuperano 2d8 punti ferita.", m: "La tua Intelligenza aumenta di 2 per 1 giorno.", n: "Il tuo Carisma aumenta di 2 per 1 minuto." },
    { e: "Ti trasformi in una statua di marmo di te stesso per 1 minuto, durante il quale sei considerato pietrificato.", m: "Entro la prossima ora, hai vantaggio al prossimo tiro che effettui in cui non hai già vantaggio.", n: "Nel corso del prossimo minuto, tutte le piante entro 20 piedi da te crescono come se fossero colpite dall'incantesimo crescita delle piante lanciato come azione." },
    { e: "Sei immune alle malattie per 1 settimana.", m: "Ottieni un bonus di +2 alla CA per 1 minuto.", n: "I tuoi occhi brillano di rosso per 1 minuto." },
    { e: "Scendi immediatamente a 0 punti ferita.", m: "Per il prossimo minuto, ti trovi nel Confine Etereo vicino al luogo in cui ti trovavi.", n: "La tua Costituzione aumenta di 2 per 1 minuto." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua stessa CD. Se fallisci, vieni trasformato in un corvo per 1 minuto, come se fossi colpito dall'incantesimo mutare forma.", m: "Per il prossimo minuto, ottieni resistenza ai danni da tuono e da forza.", n: "Aggiungi il tuo bonus di competenza a tutte le prove di Carisma per la prossima ora, se non lo aggiungi già." },
    { e: "Sei protetto dalle bestie per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Un diavoletto appare entro 30 piedi da te. Effettua un tiro salvezza su Carisma contro la tua CD. Se lo superi, il diavoletto è sottomesso, altrimenti è ostile. Il diavoletto, se non bandito o sconfitto, svanisce dopo 1 giorno.", n: "Le tue componenti materiali sembrano essere state riorganizzate. Durante la prossima ora, devi effettuare una prova di Intelligenza contro la tua CD per lanciare qualsiasi incantesimo che richieda una componente materiale." },
    { e: "Ti trasformi in un pupazzo di peluche che ti somiglia per 1 minuto, durante il quale sei considerato pietrificato.", m: "Per il prossimo minuto, ottieni resistenza ai danni da fuoco e da freddo.", n: "Per il prossimo minuto, hai vantaggio al prossimo tiro che effettui in cui non hai già vantaggio." },
    { e: "Ti trovi al centro di un muro di fuoco circolare con un raggio di 15 piedi. Ogni creatura in una delle caselle coperte da questo fuoco deve superare un tiro salvezza su Destrezza contro la tua CD o subire 5d8 danni da fuoco. Il muro di fuoco rimane per 1 minuto.", m: "Per la prossima ora, ottieni vantaggio alle prove di Carisma quando hai a che fare con qualsiasi creatura che indossa rosso, ma svantaggio se indossa verde. Se indossa entrambi i colori, questo non si applica.", n: "Ogni creatura entro 15 piedi da te subisce 1 danno necrotico. Se sei ferito, recuperi punti ferita fino all'ammontare del danno inflitto. Se non sei ferito, ottieni questo ammontare come punti ferita temporanei." },
    { e: "Scegli 1 effetto permanente o innescato che è accaduto a te o a qualcun altro e che hai ricevuto da questa tabella, e rimuovilo, anche se era benefico.", m: "Ottieni il servizio di un occhio arcano per 1 minuto che non richiede concentrazione.", n: "Una bocca magica appare su un muro vicino o su una superficie piatta. Quando parli, la tua voce proviene dalla bocca magica. Questo dura 1 minuto." },
    { e: "Sei vulnerabile alle bestie per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "Perdi la capacità di odorare per 1 giorno.", n: "Puoi udire eccezionalmente bene per 1 minuto, ottenendo vantaggio a tutte le prove di Percezione legate all'udito." },
    { e: "Perdi permanentemente la capacità di odorare. Questo senso può essere ripristinato con un incantesimo che rimuove le maledizioni, come rimuovi maledizione.", m: "Ottieni una penalità di -2 alla CA per 1 minuto.", n: "Perdi la capacità di odorare per 1 ora." },
    { e: "Sei vulnerabile ai celestiali per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni necrotici per 1 minuto.", n: "Per il giorno successivo, ogni volta che pronunci una parola con il suono \"s\", questa suona come il sibilo di un serpente." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua CD. Se fallisci, vieni trasformato in un gatto per 1 minuto, come se fossi colpito dall'incantesimo mutare forma.", m: "Diventi invisibile e silenzioso per 1 minuto.", n: "Una leggera raffica di vento soffia da te verso l'esterno. Tutte le creature entro 40 piedi da te possono percepirla, ma altrimenti non ha alcun effetto." },
    { e: "Sei vulnerabile alle piante per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "La tua Destrezza aumenta di 2 per 1 giorno.", n: "La tua Destrezza aumenta di 2 per 1 minuto." },
    { e: "Ottieni il servizio di un occhio arcano per 1 ora che non richiede concentrazione.", m: "Puoi percepire i pensieri di 1 creatura che riesci a vedere entro 30 piedi da te per 1 minuto.", n: "Subisci immediatamente 1d10 danni radiosi." },
    { e: "Sei protetto dai celestiali per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Per il prossimo minuto, tutti gli attacchi in mischia che effettui con un'arma non magica ottengono un bonus di +1 ai tiri per colpire e per i danni, e sono considerati magici ai fini del superamento delle resistenze.", n: "Un oggetto non magico scelto casualmente in tuo possesso, che pesa 1 libbra o meno, svanisce e va perduto per sempre." },
    { e: "Ti trasformi in una pianta in vaso di medie dimensioni per 1 minuto, durante il quale sei considerato pietrificato.", m: "La tua Forza diminuisce di 2 per 1 ora.", n: "La tua Saggezza aumenta di 2 per 1 minuto." },
    { e: "3d6 gemme casuali appaiono vicino a te, ciascuna del valore di 50 mo.", m: "Ottieni libertà di movimento per 1 giorno.", n: "Ottieni immediatamente 10 punti ferita temporanei." },
    { e: "Tutti gli alleati entro 20 piedi da te ottengono un bonus di +2 ai tiri per colpire e ai tiri per i danni per qualsiasi attacco con arma in mischia che effettuano entro il prossimo minuto.", m: "La tua Destrezza diminuisce di 2 per 1 ora.", n: "3d6 monete d'argento appaiono vicino a te." },
    { e: "Per 2d6 giorni, risplendi di un giallo brillante. Hai svantaggio alle prove di Furtività e chiunque cerchi di percepirti ha vantaggio alla propria prova di Percezione.", m: "Sei colpito da un incantesimo fuoco fatuo per 1 minuto. Fallisci automaticamente il tiro salvezza.", n: "Recuperi 5 punti ferita per round per 1 minuto." },
    { e: "Ti trovi al centro di un muro di forza circolare con un raggio di 15 piedi. Ogni creatura in una delle caselle coperte da questo muro deve superare un tiro salvezza su Destrezza contro la tua CD o subire 5d8 danni da forza. Il muro rimane per 1 minuto.", m: "Sei protetto dalle bestie per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "Un diavoletto appare vicino a te. Effettua un tiro salvezza su Carisma contro la tua CD. Se lo superi, il diavoletto è sottomesso, altrimenti è ostile. Il diavoletto, se non bandito o sconfitto, svanisce dopo 1 ora." },
    { e: "Tutte le creature entro 20 piedi da te vengono atterrate e cadono prone.", m: "3d6 monete d'oro appaiono vicino a te.", n: "La tua velocità aumenta di 10 piedi per 1 minuto." },
    { e: "Sei vulnerabile alle aberrazioni per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "Per 2d6 ore, emani un leggero bagliore rosa. Chiunque cerchi di percepirti ha vantaggio alla propria prova di Percezione.", n: "Ottieni competenza in tutte le prove di Forza per la prossima ora, se non la possiedi già." },
    { e: "Per il giorno successivo, ti trovi nel Confine Etereo vicino al luogo in cui ti trovavi.", m: "Ottieni la capacità di respirare in acqua per 1 giorno.", n: "La tua Intelligenza aumenta di 2 per 1 minuto." },
    { e: "Tutti gli alleati entro 20 piedi da te ottengono un bonus di +2 ai tiri per colpire e ai tiri per i danni per qualsiasi attacco con arma a distanza che effettuano entro il prossimo minuto.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni taglienti per 1 minuto.", n: "Un oggetto non magico scelto casualmente in tuo possesso, che pesa 1 libbra o meno, viene duplicato." },
    { e: "Ti trovi al centro di un campo antimagico con raggio di 10 piedi che annulla tutta la magia di livello pari o inferiore al tuo per 1 ora e non richiede concentrazione.", m: "Per il prossimo minuto, luce e oscurità si alternano rapidamente intorno a te in un raggio di 30 piedi, creando un effetto stroboscopico. Le creature che si affidano alla vista subiscono una penalità di -1 ai tiri per colpire contro di te e alle prove di Percezione nei tuoi confronti, e tu ottieni un bonus di +1 alle prove di Furtività.", n: "Dei funghi spuntano intorno a te in un raggio di 5 piedi e svaniscono dopo 1 minuto. Se uno di essi viene raccolto e mangiato entro questo tempo, la creatura deve superare un tiro salvezza su Costituzione contro la tua CD. In caso di fallimento, subisce 5d6 danni da veleno. In caso di successo, ottiene 5d6 punti ferita temporanei." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua CD. Se fallisci, vieni trasformato in un lupo per 1 minuto, come se fossi colpito dall'incantesimo mutare forma.", m: "Tutte le creature entro 20 piedi da te devono superare un tiro salvezza su Forza contro la tua CD o cadere prone.", n: "Puoi odorare eccezionalmente bene per 1 minuto, ottenendo vista cieca con un raggio di 10 piedi e vantaggio a tutte le prove di Percezione legate all'olfatto." },
    { e: "Sei protetto dagli elementali per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Sei protetto dai non morti per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "I tuoi piedi sprofondano nel terreno, rendendoti completamente immobile per 1 minuto. Questo non ha effetto se non ti trovavi sul terreno quando l'effetto è scattato." },
    { e: "Tutti i tuoi capelli cadono permanentemente. Solo un incantesimo come rimuovi maledizione può porre fine a questo effetto.", m: "Per il prossimo minuto, puoi attraversare qualsiasi muro solido non magico spesso 15 centimetri o meno.", n: "Una gemma casuale del valore di 100 mo appare vicino a te." },
    { e: "Ottieni la capacità di parlare una nuova lingua a tua scelta. Tuttavia, perdi la capacità di parlare una lingua che già conosci.", m: "Sei protetto dagli immondi per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "Per il prossimo minuto, hai la vista doppia. Questo ti dà svantaggio agli attacchi a distanza (compresi gli attacchi con incantesimi) e alle prove di Percezione basate sulla vista." },
    { e: "Un pattern ipnotico a forma di cubo di 30 piedi appare con te al centro. Tutte le creature all'interno del pattern devono superare un tiro salvezza su Saggezza o addormentarsi per 1 minuto o finché non subiscono danni.", m: "Ottieni permanentemente uno slot incantesimo di 1° livello, ma dimentichi un trucchetto che già conosci. Un incantesimo come rimuovi maledizione può porre fine a questo effetto.", n: "Sei circondato da un debole profumo gradevole. Ottieni vantaggio a tutte le prove di Carisma che effettui entro il prossimo minuto." },
    { e: "Dimentichi permanentemente un trucchetto. Un incantesimo come rimuovi maledizione può ripristinare la tua memoria.", m: "Ottieni immediatamente 15 punti ferita temporanei.", n: "Perdi la competenza in tutte le prove di abilità per 1 minuto." },
    { e: "Subisci immediatamente 2d10 danni psichici.", m: "Tutto l'oro che porti con te diventa argento.", n: "Ottieni libertà di movimento per 1 minuto." },
    { e: "Sei vulnerabile ai non morti per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "Per il prossimo minuto, ottieni resistenza ai danni necrotici e radiosi.", n: "Ottieni scurovisione con un raggio di 60 piedi per 1 minuto. Se possiedi già la scurovisione, la perdi per 1 minuto." },
    { e: "Ti trasformi in una statua di ferro di te stesso per 1 minuto, durante il quale sei considerato pietrificato.", m: "Ti trovi al centro di un incantesimo nuvola di nebbia che dura 1 minuto.", n: "Circa 380 litri d'acqua appaiono sopra la tua testa e sopra chiunque si trovi entro 10 piedi da te, distribuiti uniformemente sopra tutti i presenti nel raggio." },
    { e: "Ottieni uno slot incantesimo aggiuntivo del tuo livello più alto per 1 settimana.", m: "Il tuo Carisma aumenta di 2 per 1 giorno.", n: "Ottieni un bonus di +1 alla CA per 1 minuto." },
    { e: "Se muori entro il prossimo minuto, torni in vita come se fossi colpito dall'incantesimo reincarnazione.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da fulmine per 1 minuto.", n: "Sei vittima di un terribile crampo a entrambe le gambe, che riduce la tua velocità di 10 piedi per 1 ora." },
    { e: "Ottieni permanentemente uno slot incantesimo di un livello inferiore al tuo slot di livello più alto, ma perdi uno slot incantesimo di 1° livello. Un incantesimo come rimuovi maledizione può porre fine a questo effetto.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da forza per 1 minuto.", n: "Il prossimo incantesimo che lanci entro la prossima ora utilizza uno slot incantesimo di un livello inferiore a quello normalmente richiesto. Se l'incantesimo è di 1° livello, devi comunque spendere uno slot incantesimo per lanciarlo." },
    { e: "Tutte le creature che possono percepirti devono superare un tiro salvezza su Saggezza contro la tua CD o essere spaventate da te.", m: "Per il prossimo minuto, qualsiasi creatura che tocchi subisce 2d6 danni da fulmine.", n: "Per la prossima ora, non riesci a leggere poiché tutte le lettere ti appaiono confuse." },
    { e: "Sei vulnerabile agli elementali per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "Ottieni vista cieca con un raggio di 60 piedi per 1 minuto.", n: "Per il giorno successivo, tutto ciò che dici deve fare rima. Se non lo fa, subisci 1d6 danni psichici." },
    { e: "Sei protetto dai fatati per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Sei circondato da un odore orribile e nauseante per 1 minuto. Chiunque si trovi entro 10 piedi da te deve superare un tiro salvezza su Costituzione o essere stordito.", n: "Durante la prossima ora, puoi ritirare un tiro salvezza, un tiro per colpire o una prova di abilità a tua scelta. Se lo fai, devi accettare il risultato del nuovo tiro." },
    { e: "Ottieni il servizio di una spada arcana che non richiede concentrazione fino al tuo prossimo riposo breve o lungo.", m: "Il tuo Carisma diminuisce di 2 per 1 ora.", n: "Cresci di 1d6 pollici in altezza. Torni gradualmente alla tua altezza originale nel corso di 1 giorno." },
    { e: "Ottieni permanentemente un trucchetto. Un incantesimo come rimuovi maledizione può porre fine a questo effetto.", m: "Ottieni il servizio di un destriero fantasma per 1 giorno.", n: "Subisci immediatamente 2d4 danni psichici." },
    { e: "Tutti gli alleati entro 20 piedi da te subiscono una penalità di -2 ai tiri per colpire e ai tiri per i danni per qualsiasi attacco in mischia che effettuano nel prossimo minuto.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da acido per 1 minuto.", n: "Per la prossima ora, ogni volta che effettui una prova di caratteristica, tira 1d4 e sottrai il risultato." },
    { e: "Tutti gli alleati entro 20 piedi da te recuperano fino a 3d8 punti ferita.", m: "La tua Saggezza diminuisce di 2 per 1 ora.", n: "Ottieni la capacità di parlare con gli animali per 1 ora." },
    { e: "Perdi la capacità di vedere per 1 giorno. Durante questo tempo, hai la condizione accecato.", m: "La tua velocità aumenta di 10 piedi per 1 giorno.", n: "Ottieni una penalità di -1 alla CA per 1 minuto." },
    { e: "Ottieni il servizio di un destriero fantasma per 1 settimana.", m: "Ottieni la capacità di camminare sull'acqua per 1 giorno.", n: "Ottieni l'uso di un servitore invisibile per 1 ora." },
    { e: "Effettua un tiro salvezza su Costituzione contro la tua CD. Se fallisci, sei stordito per 1 minuto.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni psichici per 1 minuto.", n: "Il prossimo incantesimo che lanci entro l'ora utilizza uno slot incantesimo di un livello superiore a quello normalmente richiesto." },
    { e: "Ti trasformi in una statua di pietra di te stesso per 1 minuto, durante il quale sei considerato pietrificato.", m: "Una creatura a tua scelta ottiene un bonus di +2 a tutti i tiri per colpire, ai tiri per i danni e alla propria CA per 1 minuto.", n: "Ti viene in mente una brutta barzelletta e finché non la racconti (il che richiede un'intera azione), subisci una penalità di 1 alla Saggezza." },
    { e: "Tutte le creature entro 20 piedi da te, te compreso, devono superare un tiro salvezza su Destrezza contro la tua CD o essere colpite da un incantesimo fuoco fatuo.", m: "Perdi la competenza in un'abilità, uno strumento o un tipo di arma scelto casualmente per 2d6 giorni.", n: "Senti un ronzio nelle orecchie per 1 minuto. Durante questo tempo, lanciare un incantesimo che richiede una componente verbale richiede una prova di Costituzione contro la tua CD." },
    { e: "Aumenta permanentemente un punteggio di caratteristica a tua scelta di 1 punto. Diminuisci permanentemente un diverso punteggio di caratteristica a tua scelta di 1 punto. Un incantesimo come rimuovi maledizione può porre fine a questo effetto.", m: "Tutto il cibo e le bevande entro 30 piedi da te diventano putridi, avariati o marci. Consumare questo cibo infligge 2d6 danni da veleno e causa la condizione avvelenato per 1 ora.", n: "Perdi 1d6×5 libbre di peso. Torni gradualmente al tuo peso originale nel corso di 1 giorno." },
    { e: "Ottieni la competenza in uno strumento o tipo di arma che non possiedi già per 1 giorno.", m: "Tutto l'argento che porti con te diventa rame.", n: "I tuoi vestiti diventano sporchi e sudici. Finché non riesci a cambiarti e/o pulire i vestiti, il tuo Carisma è ridotto di 1." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua CD. Se fallisci, vieni trasformato in un ragno gigante per 1 minuto, come se fossi colpito dall'incantesimo mutare forma.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da fuoco per 1 minuto.", n: "Ottieni la competenza nelle prove di Saggezza per la prossima ora, se non la possiedi già." },
    { e: "Ottieni gli effetti di simpatia dell'incantesimo antipatia/simpatia per 3d6 giorni.", m: "Perdi la competenza in tutte le prove di abilità per 1d4 ore.", n: "Ti rimpicciolisci di 1d6 pollici in altezza. Torni gradualmente alla tua altezza originale nel corso di 1 giorno." },
    { e: "Sei protetto dagli immondi per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Sei protetto dai fatati per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "La tua pelle si scurisce permanentemente come se avessi l'abbronzatura, o se hai già la pelle scura, la tua pelle diventa un tono più chiara. Un incantesimo come rimuovi maledizione può porre fine a questo effetto." },
    { e: "Tutti gli alleati entro 20 piedi da te subiscono una penalità di -2 ai tiri per colpire e ai tiri per i danni per qualsiasi attacco a distanza che effettuano entro il prossimo minuto.", m: "Per la prossima ora, ogni volta che effettui una prova di caratteristica, tira 1d6 e sottrai il risultato.", n: "Per 1 minuto, una creatura a tua scelta entro 30 piedi da te subisce una penalità di -1 ai tiri per colpire, ai tiri per i danni e alla propria CA." },
    { e: "Per 1 minuto, qualsiasi incantesimo con un tempo di lancio di 1 azione può essere lanciato come azione bonus.", m: "Per il prossimo minuto, ottieni resistenza ai danni da veleno e psichici.", n: "Per la prossima ora, ogni volta che effettui una prova di caratteristica, tira 1d4 e aggiungi il risultato." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua CD. Se fallisci, vieni trasformato in un coniglio gigante per 1 minuto, come se fossi colpito dall'incantesimo mutare forma.", m: "Ti senti fortunato. Per la prossima ora, ogni volta che effettui una prova di caratteristica, tira 1d6 e aggiungi il risultato.", n: "Se lanci un incantesimo con un tiro salvezza entro il prossimo minuto, il bersaglio ottiene svantaggio al proprio tiro salvezza." },
    { e: "La prossima volta che lanci un incantesimo, non tirare su questa tabella.", m: "Subisci immediatamente 2d6 danni psichici.", n: "La tua Forza aumenta di 2 per 1 minuto." },
    { e: "Per il giorno successivo, ottieni la competenza in tutte le abilità in cui non sei già competente.", m: "Ottieni la competenza in un'abilità a tua scelta in cui non sei già competente per 1 ora.", n: "Una creatura a tua scelta ottiene un bonus di +1 ai tiri per colpire, ai tiri per i danni e alla propria CA per 1 minuto." },
    { e: "La prossima volta che lanci un incantesimo, tira due volte su questa tabella. Entrambi gli effetti si applicano.", m: "La tua Costituzione aumenta di 2 per 1 giorno.", n: "Recuperi immediatamente 2d10 punti ferita." },
    { e: "Sei vulnerabile ai fatati per 1 ora. Tali creature ottengono vantaggio quando ti attaccano.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da tuono per 1 minuto.", n: "Ottieni la competenza in tutte le prove di Intelligenza per la prossima ora, se non la possiedi già." },
    { e: "Ti trasformi in una cassapanca di legno vuota per 1 minuto, durante il quale sei considerato pietrificato.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da freddo per 1 minuto.", n: "Il potere della tua magia è forte! Per la prossima ora, qualsiasi incantesimo che lanci non richiede una componente verbale." },
    { e: "Ottieni gli effetti di antipatia dell'incantesimo antipatia/simpatia per 3d6 giorni.", m: "Ottieni la capacità di parlare una lingua a tua scelta per 1 giorno.", n: "Aumenti di peso di 1d6×10 libbre. Torni gradualmente al tuo peso originale nel corso di 1 giorno." },
    { e: "Tutte le creature entro 30 piedi da te devono superare un tiro salvezza su Saggezza. Ogni creatura immune al sonno magico supera automaticamente il tiro salvezza. Quelle che falliscono si addormentano per 1d6 minuti.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni radiosi per 1 minuto.", n: "Ottieni la competenza in tutte le prove di Destrezza per la prossima ora, se non la possiedi già." },
    { e: "Sei protetto dalle piante per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Sei protetto dai celestiali per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "Le unghie delle tue mani e dei tuoi piedi crescono a una lunghezza scomoda. Finché non le tagli, la tua Destrezza è ridotta di 1 e la tua velocità è ridotta di 5 piedi, anche se non indossi scarpe." },
    { e: "Tutti i tuoi alleati entro 20 piedi da te ottengono un bonus di +2 alla CA per 1 minuto.", m: "Per il prossimo minuto, non puoi lanciare alcun incantesimo che infligga danni di qualsiasi tipo.", n: "Ottieni gli effetti dell'incantesimo offuscamento per 1 minuto, che non richiede concentrazione per essere mantenuto." },
    { e: "La prossima volta che scendi sotto 0 punti ferita entro il prossimo mese, fallisci automaticamente il tuo primo tiro salvezza contro la morte.", m: "Ottieni gli effetti di ragnatela per 1 minuto, che non richiede concentrazione per essere mantenuto.", n: "Per la prossima ora, appari agli altri come del genere opposto." },
    { e: "Ottieni due slot incantesimo del tuo secondo livello più alto per 1 settimana.", m: "Perdi immediatamente tutti i punti stregoneria non spesi e non puoi recuperarli finché non completi un riposo lungo.", n: "Ottieni il servizio di un'arma spirituale di 2° livello per 1 minuto." },
    { e: "Per il giorno successivo, ogni volta che effettui una prova di caratteristica, tira 1d6 e aggiungi il risultato.", m: "Tu e tutte le creature entro 30 piedi da te ottenete vulnerabilità ai danni da veleno per 1 minuto.", n: "Il potere della tua magia è forte! Per la prossima ora, qualsiasi incantesimo che lanci non richiede una componente somatica." },
    { e: "Effettua un tiro salvezza su Saggezza contro la tua CD. Se fallisci, vieni trasformato in una pecora per 1 minuto, come se fossi colpito dall'incantesimo mutare forma.", m: "Ottieni la capacità di parlare con gli animali per 1 giorno.", n: "Ottieni la competenza in tutte le prove di Costituzione per la prossima ora, se non la possiedi già." },
    { e: "Tutti gli alleati entro 30 piedi da te subiscono una penalità di -2 alla CA per 1 minuto.", m: "Tutto il cibo e le bevande entro 30 piedi da te vengono purificati.", n: "Ogni oggetto inanimato che non viene indossato o trasportato entro 40 piedi da te viene avvolto dalle ombre per 1 minuto. Gli oggetti avvolti sono considerati fortemente offuscati." },
    { e: "Sei protetto dai non morti per 1 giorno. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", m: "Sei protetto dalle aberrazioni per 1 ora. Tali creature non possono attaccarti o farti del male a meno che non superino un tiro salvezza su Carisma contro la tua CD.", n: "Le tue dita diventano doloranti per 1 ora. Durante questo tempo, devi superare un tiro salvezza su Destrezza contro la tua CD per lanciare un incantesimo con una componente somatica." },
    { e: "Salti avanti nel tempo esattamente di 1 minuto, per 1 minuto. Dal punto di vista di chiunque altro, smetti di esistere durante quel tempo.", m: "Tutti i tuoi vestiti ed equipaggiamento si teletrasportano nello spazio libero più vicino, ad almeno 15 piedi da te, che puoi vedere.", n: "Ti senti estremamente nauseato. Effettua un tiro salvezza su Costituzione contro la tua CD. Se fallisci, devi spendere la tua prossima azione per vomitare." },
    { e: "Tutti gli incantesimi che lanci entro il prossimo minuto falliscono automaticamente.", m: "La tua Costituzione diminuisce di 2 per 1 ora.", n: "Perdi immediatamente un punto stregoneria non speso." }
  ];

  // ---- Tavern generator data ----

  var TAVERN_NOUNS = [
    { w: 'Cinghiale', g: 'm' }, { w: 'Drago', g: 'm' }, { w: 'Lupo', g: 'm' }, { w: 'Corvo', g: 'm' },
    { w: 'Grifone', g: 'm' }, { w: 'Barile', g: 'm' }, { w: 'Calice', g: 'm' }, { w: 'Falco', g: 'm' },
    { w: 'Orso', g: 'm' }, { w: 'Martello', g: 'm' }, { w: 'Scudo', g: 'm' }, { w: 'Pellegrino', g: 'm' },
    { w: 'Sirena', g: 'f' }, { w: 'Volpe', g: 'f' }, { w: 'Civetta', g: 'f' }, { w: 'Candela', g: 'f' },
    { w: 'Luna', g: 'f' }, { w: 'Stella', g: 'f' }, { w: 'Fenice', g: 'f' }, { w: 'Ancora', g: 'f' },
    { w: 'Spada', g: 'f' }, { w: 'Quercia', g: 'f' }
  ];

  var TAVERN_ADJECTIVES = [
    { m: 'Ubriaco', f: 'Ubriaca' }, { m: 'Dorato', f: 'Dorata' }, { m: 'Allegro', f: 'Allegra' },
    { m: 'Danzante', f: 'Danzante' }, { m: 'Fedele', f: 'Fedele' }, { m: 'Silenzioso', f: 'Silenziosa' },
    { m: 'Sonnolento', f: 'Sonnolenta' }, { m: 'Rosso', f: 'Rossa' }, { m: 'Arrugginito', f: 'Arrugginita' },
    { m: 'Stanco', f: 'Stanca' }, { m: 'Sorridente', f: 'Sorridente' }, { m: 'Chiacchierone', f: 'Chiacchierona' },
    { m: 'Barbuto', f: 'Barbuta' }, { m: 'Zoppo', f: 'Zoppa' }, { m: 'Ubriacone', f: 'Ubriacona' }
  ];

  var TAVERN_DRINKS = [
    { name: 'Birra scura', price: '4 mr' }, { name: 'Birra chiara', price: '3 mr' },
    { name: 'Idromele speziato', price: '6 mr' }, { name: 'Vino della casa', price: '2 ma' },
    { name: 'Vino pregiato', price: '8 ma' }, { name: 'Sidro di mele', price: '3 mr' },
    { name: 'Acquavite di grano', price: '5 ma' }, { name: 'Tè alle erbe', price: '2 mr' },
    { name: 'Latte caldo', price: '1 mr' }, { name: 'Acqua fresca', price: 'gratis' },
    { name: 'Grog del marinaio', price: '4 ma' }, { name: 'Liquore alle bacche', price: '6 ma' },
    { name: 'Sciroppo di zenzero caldo', price: '2 mr' }
  ];

  var TAVERN_FOODS = [
    { name: 'Zuppa del giorno', price: '3 mr' }, { name: 'Stufato di manzo', price: '5 mr' },
    { name: 'Pane e formaggio', price: '2 mr' }, { name: 'Pollo arrosto', price: '6 mr' },
    { name: 'Pesce alla griglia', price: '5 mr' }, { name: 'Cosciotto di maiale', price: '8 mr' },
    { name: 'Torta di mele', price: '3 mr' }, { name: 'Focaccia alle erbe', price: '2 mr' },
    { name: 'Piatto di formaggi misti', price: '4 mr' }, { name: 'Minestra di legumi', price: '2 mr' },
    { name: 'Salsicce speziate', price: '4 mr' }, { name: 'Frutta di stagione', price: '1 mr' },
    { name: 'Selvaggina in umido', price: '9 mr' }, { name: 'Ostriche fresche', price: '1 ma' }
  ];

  var TAVERN_ROOM_TIERS = [
    { label: 'Povera (giaciglio di paglia in comune)', price: '2 ma' },
    { label: 'Modesta (camera semplice)', price: '5 ma' },
    { label: 'Modesta (camera semplice)', price: '5 ma' },
    { label: 'Confortevole (camera privata pulita)', price: '8 ma' },
    { label: 'Confortevole (camera privata pulita)', price: '8 ma' },
    { label: 'Di lusso (camera con camino e bagno privato)', price: '2 mo' }
  ];

  var TAVERN_PHYSICAL_TRAITS = [
    'alto e magro come una pertica', 'basso e tarchiato', 'robusto e dalle spalle larghe',
    'esile e dai movimenti nervosi', 'anziano, con la schiena curva', 'giovane e dai lineamenti delicati',
    'con una vistosa cicatrice sul volto', 'con capelli grigi legati in una coda', 'calvo e dalla pelle abbronzata',
    'con una folta barba intrecciata', 'con due occhi di colore diverso', 'tatuato dalle braccia al collo',
    'con un dente d\'oro sempre in mostra', 'claudicante, si appoggia a un bastone', 'con mani callose da lavoratore',
    'dal naso storto, rotto più di una volta', 'con un vistoso anello a ogni dito'
  ];

  var TAVERN_PERSONALITY_TRAITS = [
    'chiacchierone e sempre pronto a una battuta', 'diffidente verso gli sconosciuti',
    'ossessionato dal pulire ogni superficie', 'superstizioso, tocca ferro a ogni piè sospinto',
    'generoso ma distratto', 'avaro e sempre pronto a contrattare', 'timido, parla quasi sottovoce',
    'arrogante, si vanta di imprese mai compiute', 'malinconico, guarda spesso fuori dalla finestra',
    'curioso, fa sempre troppe domande', 'brillo fin dal primo pomeriggio', 'protettivo verso gli altri avventori',
    'ambizioso, sogna di lasciare il villaggio', 'pigro, il minimo sforzo è già troppo',
    'onesto fino all\'eccesso, non sa mentire'
  ];

  var TAVERN_NPC_ROLES = [
    'Avventore abituale', 'Mercante di passaggio', 'Cacciatore di taglie', 'Menestrello',
    'Guardia fuori servizio', 'Contadino', 'Marinaio', 'Ex-avventuriero', 'Sacerdote itinerante',
    'Fabbro', 'Viaggiatore misterioso', 'Ubriacone del villaggio', 'Giocatore d\'azzardo', 'Cantastorie'
  ];

  var TAVERN_GOSSIP = [
    'Dicono che nelle rovine a nord si aggirino luci spettrali di notte.',
    'Il fabbro del villaggio sarebbe indebitato fino al collo con un mercante di passaggio.',
    'Una nave mercantile è scomparsa nella nebbia al largo della costa, senza lasciare traccia.',
    'Il signore locale avrebbe assunto mercenari per "ripulire" la foresta vicina.',
    'Si vocifera che il pozzo del villaggio sia stato avvelenato da qualcuno di una locanda rivale.',
    'Un gruppo di avventurieri non ha fatto ritorno dalla vecchia miniera abbandonata.',
    'La figlia del mugnaio sarebbe scomparsa nel bosco tre notti fa.',
    'Pare che un drago sia stato avvistato volare basso sulle colline a est.',
    'Le tasse aumenteranno di nuovo, secondo una fonte vicina al castello.',
    'Un mercante ambulante vende amuleti che "proteggono dai non morti", ma sembrano solo cianfrusaglie.',
    'Qualcuno ha visto luci strane provenire dal cimitero, la notte scorsa.',
    'Il capo delle guardie avrebbe accettato una tangente per lasciar passare un carico sospetto.',
    'Una setta segreta si riunirebbe nelle cantine sotto la vecchia chiesa.',
    'I lupi sono diventati insolitamente aggressivi nell\'ultimo mese, quasi obbedissero a qualcuno.',
    'Si dice che uno spirito infesti la camera al piano di sopra.',
    'Un nobile in incognito starebbe cercando compagni per una missione pericolosa.',
    'Il fiume si è tinto di rosso per un giorno intero, due settimane fa.',
    'Qualcuno giura di aver visto un tesoro sepolto segnato su una vecchia mappa strappata.',
    'Le guardie cercano un ladro che ha rubato un artefatto dal tempio.',
    'Gli animali della fattoria vicina sono stati trovati dissanguati, senza una goccia di sangue.'
  ];

  function pickN(arr, n) {
    var copy = arr.slice();
    var out = [];
    n = Math.min(n, copy.length);
    for (var i = 0; i < n; i++) {
      var idx = Math.floor(Math.random() * copy.length);
      out.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return out;
  }

  // ---- Treasure generator data ----

  var GEM_DESCRIPTIONS = [
    'un piccolo zaffiro blu intenso', 'un opale dai riflessi iridescenti', 'una granata rosso sangue',
    'un topazio dal taglio squadrato', 'un\'ametista viola scuro', 'una perla perfettamente sferica',
    'uno smeraldo dal cuore verde brillante', 'un quarzo affumicato', 'un berillo dorato',
    'una turchese screziata', 'un corniola arancione', 'un giaietto nero lucido',
    'un diamante grezzo, ancora da tagliare', 'un rubino dalle sfumature scure'
  ];

  var ART_OBJECT_DESCRIPTIONS = [
    'una collana d\'argento con un pendente a forma di goccia', 'un piccolo calice smaltato di blu',
    'una statuetta d\'avorio raffigurante un animale', 'un anello sigillo inciso con uno stemma sconosciuto',
    'un candelabro d\'ottone finemente lavorato', 'un arazzo ricamato con scene di caccia',
    'una scatola di legno intarsiato con motivi floreali', 'una maschera cerimoniale dipinta a mano',
    'un pettine d\'osso decorato con perline', 'una coppa di cristallo dal bordo dorato',
    'un medaglione smaltato raffigurante una fenice', 'una fibbia di cintura in argento sbalzato'
  ];

  var TREASURE_TIERS = [
    { label: 'GS 0-4 (basso livello)', coins: { cp: [50, 600], sp: [50, 300], gp: [0, 100], pp: [0, 0] }, gemChance: 0.5, gemValue: [10, 50], gemCount: [1, 3], artChance: 0.2, artValue: [25, 100] },
    { label: 'GS 5-10 (livello medio)', coins: { cp: [0, 0], sp: [100, 600], gp: [200, 800], pp: [0, 50] }, gemChance: 0.65, gemValue: [50, 250], gemCount: [2, 4], artChance: 0.35, artValue: [100, 500] },
    { label: 'GS 11-16 (livello alto)', coins: { cp: [0, 0], sp: [0, 0], gp: [1000, 4000], pp: [100, 400] }, gemChance: 0.75, gemValue: [500, 2000], gemCount: [2, 6], artChance: 0.5, artValue: [500, 2500] },
    { label: 'GS 17+ (epico)', coins: { cp: [0, 0], sp: [0, 0], gp: [5000, 15000], pp: [1000, 3000] }, gemChance: 0.85, gemValue: [2000, 7500], gemCount: [3, 8], artChance: 0.65, artValue: [2500, 10000] }
  ];

  function generateTreasure(tierIdx) {
    var tier = TREASURE_TIERS[tierIdx] || TREASURE_TIERS[0];
    var coins = {};
    ['cp', 'sp', 'gp', 'pp'].forEach(function (denom) {
      var range = tier.coins[denom];
      coins[denom] = range[1] > 0 ? randInt(range[0], range[1]) : 0;
    });

    var gems = [];
    if (Math.random() < tier.gemChance) {
      var gemCount = randInt(tier.gemCount[0], tier.gemCount[1]);
      for (var i = 0; i < gemCount; i++) {
        gems.push({ desc: randChoice(GEM_DESCRIPTIONS), value: randInt(tier.gemValue[0], tier.gemValue[1]) });
      }
    }

    var art = [];
    if (Math.random() < tier.artChance) {
      var artCount = randInt(1, 2);
      for (var j = 0; j < artCount; j++) {
        art.push({ desc: randChoice(ART_OBJECT_DESCRIPTIONS), value: randInt(tier.artValue[0], tier.artValue[1]) });
      }
    }

    var totalGp = coins.cp / 100 + coins.sp / 10 + coins.gp + coins.pp * 10;
    gems.forEach(function (g) { totalGp += g.value; });
    art.forEach(function (a) { totalGp += a.value; });

    return { tier: tier, coins: coins, gems: gems, art: art, totalGp: Math.round(totalGp) };
  }

  // ---- Random monster generator data ----
  // Nome, tipo/taglia, GS, CA e PF: dati meccanici presi dai contenuti che Wizards of
  // the Coast ha rilasciato in forma aperta (System Reference Document). Valori
  // indicativi per un rapido riferimento al tavolo: per il testo completo delle
  // caratteristiche consulta il Manuale dei Mostri ufficiale.

  var MONSTER_GENERATOR_LIST = [
    { name: 'Topo', type: 'Bestia (Minuscola)', cr: '0', ac: 10, hp: 1 },
    { name: 'Pipistrello', type: 'Bestia (Minuscola)', cr: '0', ac: 12, hp: 1 },
    { name: 'Gatto', type: 'Bestia (Minuscola)', cr: '0', ac: 12, hp: 2 },
    { name: 'Corvo', type: 'Bestia (Minuscola)', cr: '0', ac: 12, hp: 1 },
    { name: 'Granchio', type: 'Bestia (Minuscola)', cr: '0', ac: 11, hp: 2 },
    { name: 'Kobold', type: 'Umanoide (Piccolo)', cr: '1/8', ac: 12, hp: 5 },
    { name: 'Ratto gigante', type: 'Bestia (Piccolo)', cr: '1/8', ac: 12, hp: 7 },
    { name: 'Stirge', type: 'Bestia (Piccolo)', cr: '1/8', ac: 14, hp: 2 },
    { name: 'Goblin', type: 'Umanoide (Piccolo)', cr: '1/4', ac: 15, hp: 7 },
    { name: 'Scheletro', type: 'Non Morto (Medio)', cr: '1/4', ac: 13, hp: 13 },
    { name: 'Zombie', type: 'Non Morto (Medio)', cr: '1/4', ac: 8, hp: 22 },
    { name: 'Lupo', type: 'Bestia (Medio)', cr: '1/4', ac: 13, hp: 11 },
    { name: 'Orco', type: 'Umanoide (Medio)', cr: '1/2', ac: 13, hp: 15 },
    { name: 'Hobgoblin', type: 'Umanoide (Medio)', cr: '1/2', ac: 18, hp: 11 },
    { name: 'Orso nero', type: 'Bestia (Medio)', cr: '1/2', ac: 11, hp: 19 },
    { name: 'Ragno gigante', type: 'Bestia (Grande)', cr: '1', ac: 14, hp: 26 },
    { name: 'Orso bruno', type: 'Bestia (Grande)', cr: '1', ac: 11, hp: 34 },
    { name: 'Bugbear', type: 'Umanoide (Medio)', cr: '1', ac: 16, hp: 27 },
    { name: 'Arpia', type: 'Mostruosità (Medio)', cr: '1', ac: 11, hp: 38 },
    { name: 'Ghoul', type: 'Non Morto (Medio)', cr: '1', ac: 12, hp: 22 },
    { name: 'Ogre', type: 'Gigante (Grande)', cr: '2', ac: 11, hp: 59 },
    { name: 'Grifone', type: 'Mostruosità (Grande)', cr: '2', ac: 12, hp: 59 },
    { name: 'Cubo gelatinoso', type: 'Melma (Grande)', cr: '2', ac: 6, hp: 84 },
    { name: 'Melma ocra', type: 'Melma (Grande)', cr: '2', ac: 8, hp: 45 },
    { name: 'Ghast', type: 'Non Morto (Medio)', cr: '2', ac: 13, hp: 36 },
    { name: 'Manticora', type: 'Mostruosità (Grande)', cr: '3', ac: 14, hp: 68 },
    { name: 'Basilisco', type: 'Mostruosità (Medio)', cr: '3', ac: 15, hp: 52 },
    { name: 'Minotauro', type: 'Mostruosità (Grande)', cr: '3', ac: 14, hp: 76 },
    { name: 'Wight', type: 'Non Morto (Medio)', cr: '3', ac: 14, hp: 45 },
    { name: 'Spettro', type: 'Non Morto (Medio)', cr: '4', ac: 11, hp: 45 },
    { name: 'Ettin', type: 'Gigante (Grande)', cr: '4', ac: 12, hp: 85 },
    { name: 'Troll', type: 'Gigante (Grande)', cr: '5', ac: 15, hp: 84 },
    { name: 'Ombra vagante', type: 'Non Morto (Medio)', cr: '5', ac: 13, hp: 67 },
    { name: 'Gigante delle colline', type: 'Gigante (Enorme)', cr: '5', ac: 13, hp: 105 },
    { name: 'Elementale del fuoco', type: 'Elementale (Grande)', cr: '5', ac: 13, hp: 102 },
    { name: 'Chimera', type: 'Mostruosità (Grande)', cr: '6', ac: 14, hp: 114 },
    { name: 'Medusa', type: 'Mostruosità (Medio)', cr: '6', ac: 15, hp: 127 },
    { name: 'Drago bianco (giovane)', type: 'Drago (Grande)', cr: '6', ac: 17, hp: 133 },
    { name: 'Gigante di pietra', type: 'Gigante (Enorme)', cr: '7', ac: 17, hp: 126 },
    { name: 'Drago nero (giovane)', type: 'Drago (Grande)', cr: '7', ac: 18, hp: 127 },
    { name: 'Naga spirituale', type: 'Mostruosità (Grande)', cr: '8', ac: 17, hp: 75 },
    { name: 'Gigante del ghiaccio', type: 'Gigante (Enorme)', cr: '8', ac: 15, hp: 138 },
    { name: 'Drago verde (giovane)', type: 'Drago (Grande)', cr: '8', ac: 18, hp: 136 },
    { name: 'Gigante del fuoco', type: 'Gigante (Enorme)', cr: '9', ac: 18, hp: 162 },
    { name: 'Gigante delle nuvole', type: 'Gigante (Enorme)', cr: '9', ac: 14, hp: 200 },
    { name: 'Drago blu (giovane)', type: 'Drago (Grande)', cr: '9', ac: 18, hp: 152 },
    { name: 'Drago rosso (giovane)', type: 'Drago (Grande)', cr: '10', ac: 18, hp: 178 },
    { name: 'Diavolo cornuto', type: 'Immondo (Grande)', cr: '11', ac: 17, hp: 178 },
    { name: 'Nalfeshnee', type: 'Immondo (Grande)', cr: '13', ac: 18, hp: 184 },
    { name: 'Gigante delle tempeste', type: 'Gigante (Enorme)', cr: '13', ac: 16, hp: 230 },
    { name: 'Marilith', type: 'Immondo (Grande)', cr: '16', ac: 18, hp: 189 },
    { name: 'Golem di ferro', type: 'Costrutto (Enorme)', cr: '16', ac: 20, hp: 210 },
    { name: 'Drago rosso (adulto)', type: 'Drago (Enorme)', cr: '17', ac: 19, hp: 256 },
    { name: 'Goristro', type: 'Immondo (Enorme)', cr: '17', ac: 17, hp: 310 },
    { name: 'Balor', type: 'Immondo (Enorme)', cr: '19', ac: 19, hp: 262 },
    { name: 'Diavolo supremo', type: 'Immondo (Enorme)', cr: '20', ac: 19, hp: 300 },
    { name: 'Lich', type: 'Non Morto (Medio)', cr: '21', ac: 17, hp: 135 },
    { name: 'Drago rosso (antico)', type: 'Drago (Colossale)', cr: '24', ac: 22, hp: 546 },
    { name: 'Tarrasca', type: 'Mostruosità (Titanica)', cr: '30', ac: 25, hp: 676 }
  ];

  function generateRandomMonster(crRangeKey) {
    var pool = MONSTER_GENERATOR_LIST;
    if (crRangeKey) {
      var parts = crRangeKey.split('-').map(Number);
      pool = pool.filter(function (m) {
        var val = m.cr === '1/8' ? 0.125 : m.cr === '1/4' ? 0.25 : m.cr === '1/2' ? 0.5 : Number(m.cr);
        return val >= parts[0] && val <= parts[1];
      });
    }
    if (pool.length === 0) pool = MONSTER_GENERATOR_LIST;
    return randChoice(pool);
  }

  var state = loadState();
  var timerInterval = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(defaultState);
      var parsed = JSON.parse(raw);
      return Object.assign(clone(defaultState), parsed);
    } catch (e) {
      return clone(defaultState);
    }
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore quota errors */ }
  }

  // ---- Persistent campaign data: roster + compendium (survives "Nuovo Combattimento") ----

  var CAMPAIGN_STORAGE_KEY = 'dnd-campaign-data-v1';

  var defaultCampaignData = {
    roster: [],             // { id, type: 'png'|'fazione', name, subtitle, location, disposition, description, notes }
    compendiumItems: [],    // { id, name, category, rarity, value, description, notes }
    compendiumMonsters: [], // { id, name, cr, ac, hp, description, notes }
    sessions: [],           // { id, number, title, realDate, gameDate, summary }
    quests: []              // { id, title, giver, status, description, reward, notes, objectives: [{id, text, done}] }
  };

  function loadCampaignData() {
    try {
      var raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
      if (!raw) return clone(defaultCampaignData);
      var parsed = JSON.parse(raw);
      return Object.assign(clone(defaultCampaignData), parsed);
    } catch (e) {
      return clone(defaultCampaignData);
    }
  }

  function saveCampaignData() {
    try {
      localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaignData));
    } catch (e) { /* ignore quota errors */ }
  }

  var campaignData = loadCampaignData();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') node[k] = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  // ---------------- ROUND ----------------

  function renderRound() {
    document.getElementById('roundDisplay').textContent = state.round;
    renderIngameTime();
  }

  document.getElementById('roundPlus').addEventListener('click', function () {
    state.round++;
    saveState();
    renderRound();
  });
  document.getElementById('roundMinus').addEventListener('click', function () {
    state.round = Math.max(0, state.round - 1);
    saveState();
    renderRound();
  });
  document.getElementById('roundReset').addEventListener('click', function () {
    state.round = 0;
    saveState();
    renderRound();
  });

  // ---------------- TIME ----------------

  function currentElapsedMs() {
    var ms = state.time.accumulatedMs;
    if (state.time.running && state.time.startedAt) {
      ms += Date.now() - state.time.startedAt;
    }
    return ms;
  }

  function formatHMS(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function renderTime() {
    document.getElementById('timeDisplay').textContent = formatHMS(currentElapsedMs());
    document.getElementById('timeStartPause').textContent = state.time.running ? 'Pausa' : 'Avvia';
  }

  function renderIngameTime() {
    var spr = state.time.secPerRound || 6;
    var totalSec = state.round * spr;
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    var text = m > 0 ? (m + 'm ' + s + 's') : (s + 's');
    document.getElementById('ingameTime').textContent = text;
  }

  document.getElementById('timeStartPause').addEventListener('click', function () {
    if (state.time.running) {
      state.time.accumulatedMs = currentElapsedMs();
      state.time.running = false;
      state.time.startedAt = null;
      stopTicker();
    } else {
      state.time.running = true;
      state.time.startedAt = Date.now();
      startTicker();
    }
    saveState();
    renderTime();
  });

  document.getElementById('timeReset').addEventListener('click', function () {
    state.time.running = false;
    state.time.startedAt = null;
    state.time.accumulatedMs = 0;
    stopTicker();
    saveState();
    renderTime();
  });

  document.getElementById('secPerRound').addEventListener('change', function (e) {
    var v = parseInt(e.target.value, 10);
    state.time.secPerRound = v > 0 ? v : 6;
    saveState();
    renderIngameTime();
  });

  function startTicker() {
    stopTicker();
    timerInterval = setInterval(renderTime, 1000);
  }
  function stopTicker() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ---------------- CASTERS / SPELL SLOTS ----------------

  function renderCasters() {
    var list = document.getElementById('casterList');
    list.innerHTML = '';
    if (state.casters.length === 0) {
      list.appendChild(el('div', { class: 'empty-hint', text: 'Nessun caster aggiunto. Aggiungine uno qui sotto.' }));
    }
    state.casters.forEach(function (caster) {
      list.appendChild(renderCasterCard(caster));
    });
  }

  function renderCasterCard(caster) {
    var header = el('div', { class: 'caster-header' }, [
      el('span', { class: 'name', text: caster.name }),
      el('div', {}, [
        el('button', {
          type: 'button', text: 'Azzera usati',
          onclick: function () {
            caster.levels.forEach(function (lv) { lv.used = 0; });
            saveState();
            renderCasters();
          }
        }),
        el('button', {
          type: 'button', class: 'btn-remove', text: '✕ Rimuovi',
          onclick: function () {
            if (confirm('Rimuovere il caster "' + caster.name + '"?')) {
              state.casters = state.casters.filter(function (c) { return c.id !== caster.id; });
              saveState();
              renderCasters();
            }
          }
        })
      ])
    ]);

    var levelsWrap = el('div', { class: 'caster-levels' });
    caster.levels.slice().sort(function (a, b) { return a.level - b.level; }).forEach(function (lv) {
      var pips = el('div', { class: 'pips' });
      for (var i = 0; i < lv.max; i++) {
        (function (index) {
          var used = index < lv.used;
          pips.appendChild(el('button', {
            type: 'button',
            class: 'pip' + (used ? ' used' : ''),
            title: used ? 'Segna come disponibile' : 'Segna come usato',
            onclick: function () {
              // clicking a pip sets "used" count up to that pip (toggle behavior)
              if (index < lv.used) {
                lv.used = index;
              } else {
                lv.used = index + 1;
              }
              saveState();
              renderCasters();
            }
          }));
        })(i);
      }
      var block = el('div', { class: 'level-block' }, [
        el('span', { class: 'level-label', text: 'Liv. ' + lv.level }),
        pips,
        el('span', { class: 'level-label', text: (lv.max - lv.used) + '/' + lv.max }),
        el('button', {
          type: 'button', class: 'level-remove', text: 'rimuovi livello',
          onclick: function () {
            caster.levels = caster.levels.filter(function (l) { return l !== lv; });
            saveState();
            renderCasters();
          }
        })
      ]);
      levelsWrap.appendChild(block);
    });

    var addLevelSelect = el('select', {});
    for (var lvl = 1; lvl <= 9; lvl++) {
      addLevelSelect.appendChild(el('option', { value: lvl, text: 'Livello ' + lvl }));
    }
    var addLevelMax = el('input', { type: 'number', min: '1', value: '1' });
    var addLevelForm = el('div', { class: 'add-level-form' }, [
      addLevelSelect,
      addLevelMax,
      el('button', {
        type: 'button', text: 'Imposta slot',
        onclick: function () {
          var levelNum = parseInt(addLevelSelect.value, 10);
          var maxNum = parseInt(addLevelMax.value, 10) || 1;
          var existing = caster.levels.find(function (l) { return l.level === levelNum; });
          if (existing) {
            existing.max = maxNum;
            existing.used = Math.min(existing.used, maxNum);
          } else {
            caster.levels.push({ level: levelNum, max: maxNum, used: 0 });
          }
          saveState();
          renderCasters();
        }
      })
    ]);

    return el('div', { class: 'caster-card' }, [header, levelsWrap, addLevelForm]);
  }

  document.getElementById('addCasterForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('newCasterName');
    var name = input.value.trim();
    if (!name) return;
    state.casters.push({ id: uid(), name: name, levels: [] });
    input.value = '';
    saveState();
    renderCasters();
  });

  // ---------------- RAGE ----------------

  function renderRages() {
    var list = document.getElementById('rageList');
    list.innerHTML = '';
    if (state.rages.length === 0) {
      list.appendChild(el('div', { class: 'empty-hint', text: 'Nessun barbaro aggiunto. Aggiungine uno qui sotto.' }));
    }
    state.rages.forEach(function (r) {
      var pips = el('div', { class: 'pips rage-pips' });
      for (var i = 0; i < r.max; i++) {
        (function (index) {
          var used = index < r.used;
          pips.appendChild(el('button', {
            type: 'button',
            class: 'pip' + (used ? ' used' : ''),
            title: used ? 'Segna come disponibile' : 'Segna come usata',
            onclick: function () {
              if (index < r.used) { r.used = index; }
              else { r.used = index + 1; }
              saveState();
              renderRages();
            }
          }));
        })(i);
      }

      var maxInput = el('input', { type: 'number', min: '1', value: r.max, style: 'width:56px' });
      maxInput.addEventListener('change', function () {
        var v = parseInt(maxInput.value, 10) || 1;
        r.max = v;
        r.used = Math.min(r.used, v);
        saveState();
        renderRages();
      });

      var card = el('div', { class: 'rage-card' }, [
        el('div', { class: 'rage-header' }, [
          el('span', { class: 'name', text: r.name }),
          el('div', {}, [
            el('button', {
              type: 'button', text: 'Riposo lungo',
              onclick: function () { r.used = 0; saveState(); renderRages(); }
            }),
            el('button', {
              type: 'button', class: 'btn-remove', text: '✕ Rimuovi',
              onclick: function () {
                if (confirm('Rimuovere "' + r.name + '"?')) {
                  state.rages = state.rages.filter(function (x) { return x.id !== r.id; });
                  saveState();
                  renderRages();
                }
              }
            })
          ])
        ]),
        el('div', { class: 'btn-row', style: 'justify-content:flex-start;align-items:center;margin-top:8px' }, [
          pips,
          el('span', { class: 'rage-count', text: (r.max - r.used) + '/' + r.max + ' disponibili' })
        ]),
        el('div', { style: 'margin-top:6px;font-size:0.85em' }, [
          el('label', { text: 'Max ' }, [maxInput])
        ])
      ]);
      list.appendChild(card);
    });
  }

  document.getElementById('addRageForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var nameInput = document.getElementById('newRageName');
    var maxInput = document.getElementById('newRageMax');
    var name = nameInput.value.trim();
    var max = parseInt(maxInput.value, 10) || 1;
    if (!name) return;
    state.rages.push({ id: uid(), name: name, max: max, used: 0 });
    nameInput.value = '';
    maxInput.value = '2';
    saveState();
    renderRages();
  });

  // ---------------- PARTY TABLE ----------------

  function sortRows(rows, sort) {
    if (!sort.key) return rows;
    var key = sort.key;
    return rows.slice().sort(function (a, b) {
      var va = sortValue(a, key), vb = sortValue(b, key);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }

  function sortValue(row, key) {
    if (key === 'name') return (row.name || '').toLowerCase();
    if (key === 'ac') return Number(row.ac) || 0;
    if (key === 'hp') return Number(row.hpCur) || 0;
    if (key === 'init') return Number(row.init) || 0;
    if (key === 'damage') return Number(row.damage) || 0;
    if (key === 'condition') return conditionText(row).toLowerCase();
    return '';
  }

  function conditionText(row) {
    var c = [];
    if (row.prone) c.push('Prono');
    if (row.restrained) c.push('Immobilizzato');
    return c.join(', ');
  }

  function setupSortableHeaders(tableId, renderFn) {
    var table = document.getElementById(tableId);
    table.querySelectorAll('th[data-key]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-key');
        if (state.sort.key === key) {
          state.sort.dir = -state.sort.dir;
        } else {
          state.sort.key = key;
          state.sort.dir = 1;
        }
        saveState();
        renderFn();
        updateSortArrows(tableId);
      });
    });
  }

  function updateSortArrows(tableId) {
    var table = document.getElementById(tableId);
    table.querySelectorAll('th[data-key]').forEach(function (th) {
      var arrow = th.querySelector('.sort-arrow');
      var key = th.getAttribute('data-key');
      if (state.sort.key === key) {
        arrow.textContent = state.sort.dir === 1 ? '▲' : '▼';
      } else {
        arrow.textContent = '';
      }
    });
  }

  function renderParty() {
    var tbody = document.getElementById('partyBody');
    tbody.innerHTML = '';
    var rows = sortRows(state.party, state.sort);
    if (rows.length === 0) {
      var tr = el('tr', {}, [el('td', { colspan: '7', class: 'empty-hint', text: 'Nessun personaggio aggiunto.' })]);
      tbody.appendChild(tr);
    } else {
      rows.forEach(function (pc) {
        tbody.appendChild(renderPartyRow(pc));
      });
    }
    renderInitiative();
  }

  function numberInput(value, onChange, width) {
    var input = el('input', { type: 'number', value: value });
    if (width) input.style.width = width;
    input.addEventListener('change', function () {
      onChange(parseFloat(input.value) || 0);
    });
    return input;
  }

  function textInput(value, onChange) {
    var input = el('input', { type: 'text', value: value });
    input.addEventListener('change', function () { onChange(input.value); });
    return input;
  }

  function textareaInput(value, onChange, rows) {
    var ta = document.createElement('textarea');
    ta.value = value || '';
    ta.rows = rows || 2;
    ta.addEventListener('change', function () { onChange(ta.value); });
    return ta;
  }

  function renderPartyRow(pc) {
    var nameInput = textInput(pc.name, function (v) { pc.name = v; saveState(); });
    var acInput = numberInput(pc.ac, function (v) { pc.ac = v; saveState(); });
    var hpCurInput = numberInput(pc.hpCur, function (v) { pc.hpCur = v; saveState(); }, '56px');
    var hpMaxInput = numberInput(pc.hpMax, function (v) { pc.hpMax = v; saveState(); }, '56px');
    var initInput = numberInput(pc.init, function (v) { pc.init = v; saveState(); renderParty(); });
    var dmgInput = numberInput(pc.damage, function (v) { pc.damage = v; saveState(); });

    var hpCell = el('td', {}, [hpCurInput, el('span', { text: ' / ' }), hpMaxInput]);

    var proneCb = el('input', { type: 'checkbox' });
    proneCb.checked = !!pc.prone;
    proneCb.addEventListener('change', function () { pc.prone = proneCb.checked; saveState(); });

    var restrainedCb = el('input', { type: 'checkbox' });
    restrainedCb.checked = !!pc.restrained;
    restrainedCb.addEventListener('change', function () { pc.restrained = restrainedCb.checked; saveState(); });

    var condCell = el('td', {}, [
      el('div', { class: 'condition-checks' }, [
        el('label', {}, [proneCb, document.createTextNode('Prono')]),
        el('label', {}, [restrainedCb, document.createTextNode('Immobilizzato')])
      ])
    ]);

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕',
      title: 'Rimuovi personaggio',
      onclick: function () {
        if (confirm('Rimuovere ' + pc.name + '?')) {
          state.party = state.party.filter(function (p) { return p.id !== pc.id; });
          saveState();
          renderParty();
        }
      }
    });

    return el('tr', {}, [
      el('td', {}, [nameInput]),
      el('td', {}, [acInput]),
      hpCell,
      el('td', {}, [initInput]),
      el('td', {}, [dmgInput]),
      condCell,
      el('td', { class: 'col-actions' }, [removeBtn])
    ]);
  }

  document.getElementById('addPcForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('pcName').value.trim();
    var ac = parseFloat(document.getElementById('pcAc').value) || 0;
    var hpCur = parseFloat(document.getElementById('pcHpCur').value) || 0;
    var hpMax = parseFloat(document.getElementById('pcHpMax').value) || 0;
    var init = parseFloat(document.getElementById('pcInit').value) || 0;
    if (!name) return;
    state.party.push({
      id: uid(), name: name, ac: ac, hpCur: hpCur, hpMax: hpMax,
      init: init, damage: 0, prone: false, restrained: false
    });
    e.target.reset();
    saveState();
    renderParty();
  });

  // ---------------- NPCS ----------------

  function renderNpcs() {
    var enemyWrap = document.getElementById('npcCardsEnemy');
    var allyWrap = document.getElementById('npcCardsAlly');
    enemyWrap.innerHTML = '';
    allyWrap.innerHTML = '';

    var enemies = state.npcs.filter(function (n) { return n.side !== 'ally'; });
    var allies = state.npcs.filter(function (n) { return n.side === 'ally'; });

    if (enemies.length === 0) {
      enemyWrap.appendChild(el('div', { class: 'empty-hint', text: 'Nessun nemico aggiunto.' }));
    } else {
      enemies.forEach(function (n) { enemyWrap.appendChild(renderNpcCard(n)); });
    }

    if (allies.length === 0) {
      allyWrap.appendChild(el('div', { class: 'empty-hint', text: 'Nessun alleato aggiunto.' }));
    } else {
      allies.forEach(function (n) { allyWrap.appendChild(renderNpcCard(n)); });
    }
    renderInitiative();
  }

  function renderNpcCard(npc) {
    var nameInput = textInput(npc.name, function (v) { npc.name = v; saveState(); });

    var sideSelect = el('select', {}, [
      el('option', { value: 'enemy', text: 'Nemico' }),
      el('option', { value: 'ally', text: 'Alleato' })
    ]);
    sideSelect.value = npc.side;
    sideSelect.addEventListener('change', function () {
      npc.side = sideSelect.value;
      saveState();
      renderNpcs();
    });

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕',
      title: 'Rimuovi PNG',
      onclick: function () {
        if (confirm('Rimuovere ' + npc.name + '?')) {
          state.npcs = state.npcs.filter(function (n) { return n.id !== npc.id; });
          saveState();
          renderNpcs();
        }
      }
    });

    var addToRosterBtn = el('button', {
      type: 'button', class: 'btn-small-outline', text: '+ Rubrica',
      title: 'Salva questo PNG nella Rubrica persistente',
      onclick: function () {
        campaignData.roster.push({
          id: uid(), type: 'png', name: npc.name, subtitle: '', location: '',
          disposition: npc.side === 'ally' ? 'alleato' : 'nemico',
          description: '', notes: 'Incontrato in combattimento.'
        });
        saveCampaignData();
        renderRoster();
      }
    });

    var header = el('div', { class: 'npc-header' }, [nameInput, addToRosterBtn, removeBtn]);

    var acInput = numberInput(npc.ac, function (v) { npc.ac = v; saveState(); });
    var hpCurInput = numberInput(npc.hpCur, function (v) { npc.hpCur = v; saveState(); });
    var hpMaxInput = numberInput(npc.hpMax, function (v) { npc.hpMax = v; saveState(); });
    var initInput = numberInput(npc.init, function (v) { npc.init = v; saveState(); });
    var dmgInput = numberInput(npc.damage, function (v) { npc.damage = v; saveState(); });

    var stats = el('div', { class: 'npc-stats' }, [
      el('label', { text: 'Lato' }, [sideSelect]),
      el('label', { text: 'CA' }, [acInput]),
      el('label', { text: 'PF attuali' }, [hpCurInput]),
      el('label', { text: 'PF massimi' }, [hpMaxInput]),
      el('label', { text: 'Iniziativa' }, [initInput]),
      el('label', { text: 'Danni subiti' }, [dmgInput])
    ]);

    var proneCb = el('input', { type: 'checkbox' });
    proneCb.checked = !!npc.prone;
    proneCb.addEventListener('change', function () { npc.prone = proneCb.checked; saveState(); });

    var restrainedCb = el('input', { type: 'checkbox' });
    restrainedCb.checked = !!npc.restrained;
    restrainedCb.addEventListener('change', function () { npc.restrained = restrainedCb.checked; saveState(); });

    var condition = el('div', { class: 'npc-condition' }, [
      el('label', {}, [proneCb, document.createTextNode('Prono')]),
      el('label', {}, [restrainedCb, document.createTextNode('Immobilizzato')])
    ]);

    return el('div', { class: 'npc-card ' + (npc.side === 'ally' ? 'ally' : 'enemy') }, [header, stats, condition]);
  }

  document.getElementById('addNpcForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('npcName').value.trim();
    var side = document.getElementById('npcSide').value;
    var ac = parseFloat(document.getElementById('npcAc').value) || 0;
    var hpCur = parseFloat(document.getElementById('npcHpCur').value) || 0;
    var hpMax = parseFloat(document.getElementById('npcHpMax').value) || 0;
    var init = parseFloat(document.getElementById('npcInit').value) || 0;
    if (!name) return;
    state.npcs.push({
      id: uid(), name: name, side: side, ac: ac, hpCur: hpCur, hpMax: hpMax,
      init: init, damage: 0, prone: false, restrained: false
    });
    e.target.reset();
    document.getElementById('npcInit').value = '0';
    saveState();
    renderNpcs();
  });

  // ---------------- ROSTER: PNG e Fazioni persistenti ----------------

  var DISPOSITION_LABELS = { alleato: 'Alleato', neutrale: 'Neutrale', nemico: 'Nemico', sconosciuto: 'Sconosciuto' };

  function renderRoster() {
    var wrap = document.getElementById('rosterList');
    var filterText = document.getElementById('rosterFilter').value.trim().toLowerCase();
    var filterType = document.getElementById('rosterFilterType').value;
    wrap.innerHTML = '';

    var rows = campaignData.roster.filter(function (r) {
      if (filterType && r.type !== filterType) return false;
      if (!filterText) return true;
      var blob = (r.name + ' ' + r.subtitle + ' ' + r.location + ' ' + r.description + ' ' + r.notes).toLowerCase();
      return blob.indexOf(filterText) !== -1;
    });

    if (rows.length === 0) {
      var hint = campaignData.roster.length === 0
        ? 'Nessun PNG o fazione in rubrica. Aggiungine uno qui sotto, oppure salva un PNG dalla sezione "PNG in Combattimento".'
        : 'Nessun risultato per questo filtro.';
      wrap.appendChild(el('div', { class: 'empty-hint', text: hint }));
      return;
    }

    rows.forEach(function (r) { wrap.appendChild(renderRosterCard(r)); });
  }

  function renderRosterCard(r) {
    var nameInput = textInput(r.name, function (v) { r.name = v; saveCampaignData(); });
    var subtitleInput = textInput(r.subtitle, function (v) { r.subtitle = v; saveCampaignData(); });
    var locationInput = textInput(r.location, function (v) { r.location = v; saveCampaignData(); });

    var dispSelect = el('select', {}, [
      el('option', { value: 'sconosciuto', text: 'Sconosciuto' }),
      el('option', { value: 'alleato', text: 'Alleato' }),
      el('option', { value: 'neutrale', text: 'Neutrale' }),
      el('option', { value: 'nemico', text: 'Nemico' })
    ]);
    dispSelect.value = r.disposition;
    dispSelect.addEventListener('change', function () {
      r.disposition = dispSelect.value;
      saveCampaignData();
      renderRoster();
    });

    var descArea = textareaInput(r.description, function (v) { r.description = v; saveCampaignData(); }, 2);
    var notesArea = textareaInput(r.notes, function (v) { r.notes = v; saveCampaignData(); }, 2);

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi dalla rubrica',
      onclick: function () {
        if (confirm('Rimuovere "' + r.name + '" dalla rubrica?')) {
          campaignData.roster = campaignData.roster.filter(function (x) { return x.id !== r.id; });
          saveCampaignData();
          renderRoster();
        }
      }
    });

    var header = el('div', { class: 'roster-header' }, [
      el('div', { class: 'roster-title-group' }, [
        nameInput,
        el('span', { class: 'roster-type-badge', text: r.type === 'fazione' ? 'Fazione' : 'PNG' })
      ]),
      removeBtn
    ]);

    var metaRow = el('div', { class: 'roster-meta' }, [
      el('label', { text: 'Razza/Ruolo o Tipo' }, [subtitleInput]),
      el('label', { text: 'Luogo' }, [locationInput]),
      el('label', { text: 'Disposizione' }, [dispSelect])
    ]);

    return el('div', { class: 'roster-card roster-' + r.disposition }, [
      header, metaRow,
      el('label', { class: 'roster-textarea-label', text: 'Descrizione' }, [descArea]),
      el('label', { class: 'roster-textarea-label', text: 'Note del GM' }, [notesArea])
    ]);
  }

  document.getElementById('addRosterForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var type = document.getElementById('rosterType').value;
    var name = document.getElementById('rosterName').value.trim();
    var subtitle = document.getElementById('rosterSubtitle').value.trim();
    var location = document.getElementById('rosterLocation').value.trim();
    var disposition = document.getElementById('rosterDisposition').value;
    if (!name) return;
    campaignData.roster.push({
      id: uid(), type: type, name: name, subtitle: subtitle, location: location,
      disposition: disposition, description: '', notes: ''
    });
    e.target.reset();
    saveCampaignData();
    renderRoster();
  });

  document.getElementById('rosterFilter').addEventListener('input', renderRoster);
  document.getElementById('rosterFilterType').addEventListener('change', renderRoster);

  // ---------------- DIARIO DI SESSIONE ----------------

  function renderSessions() {
    var wrap = document.getElementById('sessionList');
    var filterText = document.getElementById('sessionFilter').value.trim().toLowerCase();
    wrap.innerHTML = '';

    var rows = campaignData.sessions.filter(function (s) {
      if (!filterText) return true;
      var blob = (s.title + ' ' + s.realDate + ' ' + s.gameDate + ' ' + s.summary).toLowerCase();
      return blob.indexOf(filterText) !== -1;
    });

    rows = rows.slice().sort(function (a, b) { return b.number - a.number; });

    if (rows.length === 0) {
      var hint = campaignData.sessions.length === 0
        ? 'Nessuna sessione registrata. Aggiungi la prima qui sotto.'
        : 'Nessun risultato per questo filtro.';
      wrap.appendChild(el('div', { class: 'empty-hint', text: hint }));
      return;
    }

    rows.forEach(function (s) { wrap.appendChild(renderSessionCard(s)); });
  }

  function renderSessionCard(s) {
    var titleInput = textInput(s.title, function (v) { s.title = v; saveCampaignData(); });
    var realDateInput = el('input', { type: 'date', value: s.realDate || '' });
    realDateInput.addEventListener('change', function () { s.realDate = realDateInput.value; saveCampaignData(); });
    var gameDateInput = textInput(s.gameDate, function (v) { s.gameDate = v; saveCampaignData(); });
    var summaryArea = textareaInput(s.summary, function (v) { s.summary = v; saveCampaignData(); }, 6);

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi sessione',
      onclick: function () {
        if (confirm('Rimuovere "Sessione ' + s.number + ' — ' + s.title + '"?')) {
          campaignData.sessions = campaignData.sessions.filter(function (x) { return x.id !== s.id; });
          saveCampaignData();
          renderSessions();
        }
      }
    });

    var header = el('div', { class: 'session-header' }, [
      el('div', { class: 'session-title-group' }, [
        el('span', { class: 'session-number', text: 'Sessione ' + s.number }),
        titleInput
      ]),
      removeBtn
    ]);

    var metaRow = el('div', { class: 'roster-meta' }, [
      el('label', { text: 'Data reale' }, [realDateInput]),
      el('label', { text: 'Data in-game' }, [gameDateInput])
    ]);

    return el('div', { class: 'session-card' }, [
      header, metaRow,
      el('label', { class: 'roster-textarea-label', text: 'Riassunto della sessione' }, [summaryArea])
    ]);
  }

  document.getElementById('addSessionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = document.getElementById('sessionTitle').value.trim();
    var realDate = document.getElementById('sessionRealDate').value;
    var gameDate = document.getElementById('sessionGameDate').value.trim();
    if (!title) return;
    var nextNumber = campaignData.sessions.reduce(function (max, s) { return Math.max(max, s.number); }, 0) + 1;
    campaignData.sessions.push({ id: uid(), number: nextNumber, title: title, realDate: realDate, gameDate: gameDate, summary: '' });
    e.target.reset();
    saveCampaignData();
    renderSessions();
  });

  document.getElementById('sessionFilter').addEventListener('input', renderSessions);

  // ---------------- TRACKER QUEST/OBIETTIVI ----------------

  var QUEST_STATUS_LABELS = { attiva: 'Attiva', sospeso: 'In Sospeso', completata: 'Completata', fallita: 'Fallita' };
  var QUEST_STATUS_ORDER = { attiva: 0, sospeso: 1, completata: 2, fallita: 3 };

  function renderQuests() {
    var wrap = document.getElementById('questList');
    var filterText = document.getElementById('questFilter').value.trim().toLowerCase();
    var filterStatus = document.getElementById('questFilterStatus').value;
    wrap.innerHTML = '';

    var rows = campaignData.quests.filter(function (q) {
      if (filterStatus && q.status !== filterStatus) return false;
      if (!filterText) return true;
      var blob = (q.title + ' ' + q.giver + ' ' + q.description + ' ' + q.reward + ' ' + q.notes).toLowerCase();
      return blob.indexOf(filterText) !== -1;
    });

    rows = rows.slice().sort(function (a, b) { return QUEST_STATUS_ORDER[a.status] - QUEST_STATUS_ORDER[b.status]; });

    if (rows.length === 0) {
      var hint = campaignData.quests.length === 0
        ? 'Nessuna quest registrata. Aggiungine una qui sotto.'
        : 'Nessun risultato per questo filtro.';
      wrap.appendChild(el('div', { class: 'empty-hint', text: hint }));
      return;
    }

    rows.forEach(function (q) { wrap.appendChild(renderQuestCard(q)); });
  }

  function renderQuestCard(q) {
    var titleInput = textInput(q.title, function (v) { q.title = v; saveCampaignData(); });
    var giverInput = textInput(q.giver, function (v) { q.giver = v; saveCampaignData(); });
    var rewardInput = textInput(q.reward, function (v) { q.reward = v; saveCampaignData(); });

    var statusSelect = el('select', { class: 'quest-status-select' }, Object.keys(QUEST_STATUS_LABELS).map(function (key) {
      return el('option', { value: key, text: QUEST_STATUS_LABELS[key] });
    }));
    statusSelect.value = q.status;
    statusSelect.addEventListener('change', function () {
      q.status = statusSelect.value;
      saveCampaignData();
      renderQuests();
    });

    var descArea = textareaInput(q.description, function (v) { q.description = v; saveCampaignData(); }, 2);
    var notesArea = textareaInput(q.notes, function (v) { q.notes = v; saveCampaignData(); }, 2);

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi quest',
      onclick: function () {
        if (confirm('Rimuovere la quest "' + q.title + '"?')) {
          campaignData.quests = campaignData.quests.filter(function (x) { return x.id !== q.id; });
          saveCampaignData();
          renderQuests();
        }
      }
    });

    var header = el('div', { class: 'quest-header' }, [
      el('div', { class: 'quest-title-group' }, [
        titleInput,
        el('span', { class: 'quest-status-badge quest-status-' + q.status, text: QUEST_STATUS_LABELS[q.status] })
      ]),
      removeBtn
    ]);

    var metaRow = el('div', { class: 'roster-meta' }, [
      el('label', { text: 'Committente' }, [giverInput]),
      el('label', { text: 'Stato' }, [statusSelect]),
      el('label', { text: 'Ricompensa' }, [rewardInput])
    ]);

    var objectivesWrap = el('div', { class: 'quest-objectives' });
    q.objectives.forEach(function (obj) {
      var doneCb = el('input', { type: 'checkbox' });
      doneCb.checked = !!obj.done;
      doneCb.addEventListener('change', function () {
        obj.done = doneCb.checked;
        saveCampaignData();
        renderQuests();
      });

      var objText = textInput(obj.text, function (v) { obj.text = v; saveCampaignData(); });

      var objRemoveBtn = el('button', {
        type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi obiettivo',
        onclick: function () {
          q.objectives = q.objectives.filter(function (x) { return x.id !== obj.id; });
          saveCampaignData();
          renderQuests();
        }
      });

      objectivesWrap.appendChild(el('div', { class: 'quest-objective-row' + (obj.done ? ' quest-objective-done' : '') }, [
        doneCb, objText, objRemoveBtn
      ]));
    });

    var newObjInput = el('input', { type: 'text', placeholder: 'Nuovo obiettivo...' });
    var addObjBtn = el('button', {
      type: 'button', text: '+ Obiettivo',
      onclick: function () {
        var text = newObjInput.value.trim();
        if (!text) return;
        q.objectives.push({ id: uid(), text: text, done: false });
        saveCampaignData();
        renderQuests();
      }
    });
    newObjInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addObjBtn.click(); }
    });
    objectivesWrap.appendChild(el('div', { class: 'quest-objective-add' }, [newObjInput, addObjBtn]));

    return el('div', { class: 'quest-card quest-card-' + q.status }, [
      header, metaRow,
      el('label', { class: 'roster-textarea-label', text: 'Descrizione' }, [descArea]),
      el('div', { class: 'roster-textarea-label', text: 'Obiettivi' }, []),
      objectivesWrap,
      el('label', { class: 'roster-textarea-label', text: 'Note del GM' }, [notesArea])
    ]);
  }

  document.getElementById('addQuestForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = document.getElementById('questTitle').value.trim();
    var giver = document.getElementById('questGiver').value.trim();
    if (!title) return;
    campaignData.quests.push({
      id: uid(), title: title, giver: giver, status: 'attiva',
      description: '', reward: '', notes: '', objectives: []
    });
    e.target.reset();
    saveCampaignData();
    renderQuests();
  });

  document.getElementById('questFilter').addEventListener('input', renderQuests);
  document.getElementById('questFilterStatus').addEventListener('change', renderQuests);

  // ---------------- COMPENDIO: Oggetti, Tesori e Mostri persistenti ----------------

  function renderCompendiumItems() {
    var wrap = document.getElementById('compendiumItemList');
    var filterText = document.getElementById('compendiumItemFilter').value.trim().toLowerCase();
    wrap.innerHTML = '';

    var rows = campaignData.compendiumItems.filter(function (it) {
      if (!filterText) return true;
      var blob = (it.name + ' ' + it.category + ' ' + it.rarity + ' ' + it.description + ' ' + it.notes).toLowerCase();
      return blob.indexOf(filterText) !== -1;
    });

    if (rows.length === 0) {
      var hint = campaignData.compendiumItems.length === 0
        ? 'Nessun oggetto o tesoro nel compendio. Aggiungine uno qui sotto, oppure salvane uno dal Generatore di Tesori.'
        : 'Nessun risultato per questo filtro.';
      wrap.appendChild(el('div', { class: 'empty-hint', text: hint }));
      return;
    }

    rows.forEach(function (it) { wrap.appendChild(renderCompendiumItemCard(it)); });
  }

  function renderCompendiumItemCard(it) {
    var nameInput = textInput(it.name, function (v) { it.name = v; saveCampaignData(); });
    var valueInput = textInput(it.value, function (v) { it.value = v; saveCampaignData(); });
    var descArea = textareaInput(it.description, function (v) { it.description = v; saveCampaignData(); }, 2);

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi dal compendio',
      onclick: function () {
        if (confirm('Rimuovere "' + it.name + '" dal compendio?')) {
          campaignData.compendiumItems = campaignData.compendiumItems.filter(function (x) { return x.id !== it.id; });
          saveCampaignData();
          renderCompendiumItems();
        }
      }
    });

    var header = el('div', { class: 'compendium-header' }, [
      el('div', { class: 'compendium-title-group' }, [
        nameInput,
        el('span', { class: 'compendium-badge', text: it.category || 'Oggetto' }),
        el('span', { class: 'compendium-badge compendium-badge-rarity', text: it.rarity || 'Comune' })
      ]),
      removeBtn
    ]);

    return el('div', { class: 'compendium-card' }, [
      header,
      el('label', { class: 'roster-textarea-label', text: 'Valore' }, [valueInput]),
      el('label', { class: 'roster-textarea-label', text: 'Descrizione / Note' }, [descArea])
    ]);
  }

  document.getElementById('addCompendiumItemForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('itemName').value.trim();
    var category = document.getElementById('itemCategory').value;
    var rarity = document.getElementById('itemRarity').value;
    var value = document.getElementById('itemValue').value.trim();
    if (!name) return;
    campaignData.compendiumItems.push({ id: uid(), name: name, category: category, rarity: rarity, value: value, description: '', notes: '' });
    e.target.reset();
    saveCampaignData();
    renderCompendiumItems();
  });

  document.getElementById('compendiumItemFilter').addEventListener('input', renderCompendiumItems);

  function renderMonsterGenResult(monster) {
    var wrap = document.getElementById('monsterGenResult');
    wrap.innerHTML = '';

    var card = el('div', { class: 'compendium-card monster-gen-card' }, [
      el('div', { class: 'compendium-header' }, [
        el('div', { class: 'compendium-title-group' }, [
          el('span', { class: 'generated-result', style: 'margin:0', text: monster.name }),
          el('span', { class: 'compendium-badge', text: monster.type }),
          el('span', { class: 'compendium-badge compendium-badge-rarity', text: 'GS ' + monster.cr })
        ])
      ]),
      el('div', { text: 'CA ' + monster.ac + '  ·  PF ' + monster.hp })
    ]);

    var addBtn = el('button', {
      type: 'button', class: 'btn-secondary', style: 'margin-top:10px',
      text: '+ Aggiungi al Compendio',
      onclick: function () {
        campaignData.compendiumMonsters.push({
          id: uid(), name: monster.name, cr: monster.cr, ac: monster.ac, hp: monster.hp,
          description: monster.type, notes: 'Generato casualmente (contenuti aperti SRD).'
        });
        saveCampaignData();
        renderCompendiumMonsters();
      }
    });
    card.appendChild(addBtn);

    wrap.appendChild(card);
  }

  document.getElementById('monsterGenBtn').addEventListener('click', function () {
    var crRange = document.getElementById('monsterGenCrFilter').value;
    renderMonsterGenResult(generateRandomMonster(crRange));
  });

  function renderCompendiumMonsters() {
    var wrap = document.getElementById('compendiumMonsterList');
    var filterText = document.getElementById('compendiumMonsterFilter').value.trim().toLowerCase();
    wrap.innerHTML = '';

    var rows = campaignData.compendiumMonsters.filter(function (m) {
      if (!filterText) return true;
      var blob = (m.name + ' ' + m.cr + ' ' + m.description + ' ' + m.notes).toLowerCase();
      return blob.indexOf(filterText) !== -1;
    });

    if (rows.length === 0) {
      var hint = campaignData.compendiumMonsters.length === 0
        ? 'Nessun mostro nel compendio. Aggiungine uno qui sotto, oppure salvane uno dal Costruttore Incontro.'
        : 'Nessun risultato per questo filtro.';
      wrap.appendChild(el('div', { class: 'empty-hint', text: hint }));
      return;
    }

    rows.forEach(function (m) { wrap.appendChild(renderCompendiumMonsterCard(m)); });
  }

  function renderCompendiumMonsterCard(m) {
    var nameInput = textInput(m.name, function (v) { m.name = v; saveCampaignData(); });
    var crInput = textInput(m.cr, function (v) { m.cr = v; saveCampaignData(); });
    var acInput = numberInput(m.ac, function (v) { m.ac = v; saveCampaignData(); });
    var hpInput = numberInput(m.hp, function (v) { m.hp = v; saveCampaignData(); });
    var descArea = textareaInput(m.description, function (v) { m.description = v; saveCampaignData(); }, 2);

    var removeBtn = el('button', {
      type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi dal compendio',
      onclick: function () {
        if (confirm('Rimuovere "' + m.name + '" dal compendio?')) {
          campaignData.compendiumMonsters = campaignData.compendiumMonsters.filter(function (x) { return x.id !== m.id; });
          saveCampaignData();
          renderCompendiumMonsters();
        }
      }
    });

    var header = el('div', { class: 'compendium-header' }, [
      el('div', { class: 'compendium-title-group' }, [
        nameInput,
        el('span', { class: 'compendium-badge', text: 'GS ' + (m.cr || '?') })
      ]),
      removeBtn
    ]);

    var stats = el('div', { class: 'npc-stats' }, [
      el('label', { text: 'GS' }, [crInput]),
      el('label', { text: 'CA' }, [acInput]),
      el('label', { text: 'PF' }, [hpInput])
    ]);

    return el('div', { class: 'compendium-card' }, [
      header, stats,
      el('label', { class: 'roster-textarea-label', text: 'Descrizione / Tattiche' }, [descArea])
    ]);
  }

  document.getElementById('addCompendiumMonsterForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('monsterName').value.trim();
    var cr = document.getElementById('monsterCr').value.trim();
    var ac = parseFloat(document.getElementById('monsterAc').value) || 0;
    var hp = parseFloat(document.getElementById('monsterHp').value) || 0;
    if (!name) return;
    campaignData.compendiumMonsters.push({ id: uid(), name: name, cr: cr, ac: ac, hp: hp, description: '', notes: '' });
    e.target.reset();
    saveCampaignData();
    renderCompendiumMonsters();
  });

  document.getElementById('compendiumMonsterFilter').addEventListener('input', renderCompendiumMonsters);

  // ---------------- NAME GENERATORS ----------------

  var npcNameHistory = [];
  var placeNameHistory = [];

  function initNameGenerators() {
    var raceSelect = document.getElementById('npcGenRace');
    RACE_ORDER.forEach(function (r) {
      raceSelect.appendChild(el('option', { value: r.key, text: r.label }));
    });

    var placeSelect = document.getElementById('placeGenType');
    PLACE_TYPES.forEach(function (t) {
      placeSelect.appendChild(el('option', { value: t.key, text: t.label }));
    });

    document.getElementById('npcGenBtn').addEventListener('click', function () {
      var race = raceSelect.value;
      var gender = document.getElementById('npcGenGender').value;
      var withEpithet = document.getElementById('npcGenEpithet').checked;
      var name = generateNpcName(race, gender, withEpithet);
      document.getElementById('npcGenResult').textContent = name;
      npcNameHistory.unshift(name);
      npcNameHistory = npcNameHistory.slice(0, 5);
      renderNameHistory('npcGenHistory', npcNameHistory);
    });

    document.getElementById('npcGenUsePc').addEventListener('click', function () {
      var result = document.getElementById('npcGenResult').textContent;
      if (result && result !== '—') document.getElementById('pcName').value = result;
    });

    document.getElementById('npcGenUseNpc').addEventListener('click', function () {
      var result = document.getElementById('npcGenResult').textContent;
      if (result && result !== '—') document.getElementById('npcName').value = result;
    });

    document.getElementById('placeGenBtn').addEventListener('click', function () {
      var type = placeSelect.value;
      var name = generatePlaceName(type);
      document.getElementById('placeGenResult').textContent = name;
      placeNameHistory.unshift(name);
      placeNameHistory = placeNameHistory.slice(0, 5);
      renderNameHistory('placeGenHistory', placeNameHistory);
    });
  }

  function renderNameHistory(containerId, history) {
    var container = document.getElementById(containerId);
    if (history.length <= 1) { container.textContent = ''; return; }
    container.textContent = 'Precedenti: ' + history.slice(1).join(', ');
  }

  // ---------------- TAVERN GENERATOR ----------------

  function generateTavernName() {
    var noun = randChoice(TAVERN_NOUNS);
    var adj = randChoice(TAVERN_ADJECTIVES);
    var adjForm = noun.g === 'f' ? adj.f : adj.m;
    if (Math.random() < 0.4) {
      var articleDel = noun.g === 'f' ? 'della' : 'del';
      return 'La Taverna ' + articleDel + ' ' + noun.w + ' ' + adjForm;
    }
    var article = noun.g === 'f' ? 'La' : 'Il';
    return article + ' ' + noun.w + ' ' + adjForm;
  }

  function generateInnkeeper() {
    var race = randChoice(['human', 'human', 'dwarf', 'halfling']);
    var gender = Math.random() < 0.5 ? 'male' : 'female';
    var name = generateNpcName(race, gender, false);
    var phys = randChoice(TAVERN_PHYSICAL_TRAITS);
    var pers = randChoice(TAVERN_PERSONALITY_TRAITS);
    return { name: name, trait: phys + ', ' + pers + '.' };
  }

  function generateTavernNpc() {
    var race = randChoice(RACE_ORDER).key;
    var gender = Math.random() < 0.5 ? 'male' : 'female';
    var name = generateNpcName(race, gender, false);
    var role = randChoice(TAVERN_NPC_ROLES);
    var phys = randChoice(TAVERN_PHYSICAL_TRAITS);
    var pers = randChoice(TAVERN_PERSONALITY_TRAITS);
    return { name: name, role: role, desc: 'Aspetto: ' + phys + '. Carattere: ' + pers + '.' };
  }

  function generateTavern() {
    var hasRooms = Math.random() < 0.85;
    var room = hasRooms ? randChoice(TAVERN_ROOM_TIERS) : null;
    var roomCount = hasRooms ? (2 + Math.floor(Math.random() * 7)) : 0;
    var npcCount = 2 + Math.floor(Math.random() * 3);
    var npcs = [];
    for (var i = 0; i < npcCount; i++) npcs.push(generateTavernNpc());
    var gossipCount = 2 + Math.floor(Math.random() * 2);
    var gossip = pickN(TAVERN_GOSSIP, gossipCount).map(function (text) {
      return { text: text, teller: randChoice(npcs).name };
    });
    return {
      name: generateTavernName(),
      innkeeper: generateInnkeeper(),
      drinks: pickN(TAVERN_DRINKS, 4 + Math.floor(Math.random() * 2)),
      foods: pickN(TAVERN_FOODS, 5 + Math.floor(Math.random() * 2)),
      hasRooms: hasRooms, room: room, roomCount: roomCount,
      npcs: npcs, gossip: gossip
    };
  }

  function renderTavern(t) {
    var wrap = document.getElementById('tavernResult');
    wrap.innerHTML = '';

    var header = el('div', { class: 'tavern-header' }, [
      el('h3', { class: 'tavern-name', text: t.name }),
      el('div', { class: 'tavern-innkeeper', text: 'Locandiere: ' + t.innkeeper.name + ' — ' + t.innkeeper.trait })
    ]);

    var lodgingText = t.hasRooms
      ? ('🛏️ Posti letto disponibili (' + t.roomCount + ' stanze) — ' + t.room.label + ': ' + t.room.price + ' a persona/notte')
      : '🛏️ Nessun posto letto disponibile: solo mescita.';
    var lodging = el('div', { class: 'tavern-lodging', text: lodgingText });

    var menuWrap = el('div', { class: 'tavern-columns' }, [
      el('div', {}, [
        el('h4', { text: 'Bevande' }),
        el('ul', { class: 'tavern-menu-list' }, t.drinks.map(function (d) {
          return el('li', {}, [el('span', { text: d.name }), el('span', { class: 'tavern-price', text: d.price })]);
        }))
      ]),
      el('div', {}, [
        el('h4', { text: 'Cibo' }),
        el('ul', { class: 'tavern-menu-list' }, t.foods.map(function (f) {
          return el('li', {}, [el('span', { text: f.name }), el('span', { class: 'tavern-price', text: f.price })]);
        }))
      ])
    ]);

    var npcSection = el('div', {}, [
      el('h4', { text: 'PNG presenti in locanda' }),
      el('div', { class: 'tavern-npc-grid' }, t.npcs.map(function (n) {
        return el('div', { class: 'tavern-npc-card' }, [
          el('div', { class: 'tavern-npc-name', text: n.name + ' — ' + n.role }),
          el('div', { class: 'tavern-npc-desc', text: n.desc })
        ]);
      }))
    ]);

    var gossipSection = el('div', {}, [
      el('h4', { text: 'Gossip' }),
      el('ul', { class: 'tavern-gossip-list' }, t.gossip.map(function (g) {
        return el('li', {}, [el('strong', { text: g.teller + ': ' }), document.createTextNode('"' + g.text + '"')]);
      }))
    ]);

    wrap.appendChild(el('div', { class: 'tavern-sheet' }, [header, lodging, menuWrap, npcSection, gossipSection]));
  }

  document.getElementById('tavernGenBtn').addEventListener('click', function () {
    renderTavern(generateTavern());
  });

  // ---------------- TREASURE GENERATOR ----------------

  function renderTreasure(result) {
    var wrap = document.getElementById('treasureResult');
    wrap.innerHTML = '';

    var coinParts = [];
    ['pp', 'gp', 'sp', 'cp'].forEach(function (d) {
      if (result.coins[d] > 0) coinParts.push(result.coins[d] + ' ' + d);
    });
    var coinsText = coinParts.length ? coinParts.join(', ') : 'Nessuna moneta.';

    var sheet = el('div', { class: 'treasure-sheet' }, [
      el('div', { class: 'treasure-tier', text: result.tier.label }),
      el('div', { class: 'treasure-coins', text: '💰 Monete: ' + coinsText })
    ]);

    if (result.gems.length) {
      sheet.appendChild(el('div', {}, [
        el('h4', { text: 'Gemme' }),
        el('ul', { class: 'treasure-list' }, result.gems.map(function (g) {
          return el('li', {}, [el('span', { text: g.desc }), el('span', { class: 'treasure-value', text: g.value + ' mo' })]);
        }))
      ]));
    }

    if (result.art.length) {
      sheet.appendChild(el('div', {}, [
        el('h4', { text: 'Oggetti d\'arte' }),
        el('ul', { class: 'treasure-list' }, result.art.map(function (a) {
          return el('li', {}, [el('span', { text: a.desc }), el('span', { class: 'treasure-value', text: a.value + ' mo' })]);
        }))
      ]));
    }

    sheet.appendChild(el('div', { class: 'treasure-total', text: 'Valore totale stimato: ' + result.totalGp.toLocaleString('it-IT') + ' mo' }));
    sheet.appendChild(el('div', { class: 'treasure-hint', text: 'Valuta di aggiungere un oggetto magico adeguato a questo livello, a discrezione del Game Master.' }));

    if (result.gems.length || result.art.length) {
      sheet.appendChild(el('button', {
        type: 'button', class: 'btn-secondary', text: '💾 Salva gemme e oggetti d\'arte nel Compendio',
        style: 'margin-top:10px',
        onclick: function () {
          result.gems.forEach(function (g) {
            campaignData.compendiumItems.push({ id: uid(), name: g.desc, category: 'Gioiello/Tesoro', rarity: '', value: g.value + ' mo', description: '', notes: 'Trovato come tesoro (' + result.tier.label + ').' });
          });
          result.art.forEach(function (a) {
            campaignData.compendiumItems.push({ id: uid(), name: a.desc, category: 'Oggetto d\'arte', rarity: '', value: a.value + ' mo', description: '', notes: 'Trovato come tesoro (' + result.tier.label + ').' });
          });
          saveCampaignData();
          renderCompendiumItems();
          alert('Tesoro salvato nel Compendio.');
        }
      }));
    }

    wrap.appendChild(sheet);
  }

  document.getElementById('treasureGenBtn').addEventListener('click', function () {
    var tierIdx = parseInt(document.getElementById('treasureTier').value, 10) || 0;
    renderTreasure(generateTreasure(tierIdx));
  });

  // ---------------- INITIATIVE TRACKER ----------------

  function getCombinedCombatants() {
    var combined = [];
    state.party.forEach(function (pc) {
      combined.push({ id: 'pg-' + pc.id, kind: 'pg', name: pc.name, init: Number(pc.init) || 0 });
    });
    state.npcs.forEach(function (npc) {
      combined.push({ id: 'png-' + npc.id, kind: 'png', side: npc.side, name: npc.name, init: Number(npc.init) || 0 });
    });
    combined.sort(function (a, b) {
      return (b.init - a.init) || a.name.localeCompare(b.name);
    });
    return combined;
  }

  function renderInitiative() {
    var listEl = document.getElementById('initiativeList');
    if (!listEl) return;
    var combined = getCombinedCombatants();
    listEl.innerHTML = '';

    if (combined.length === 0) {
      listEl.appendChild(el('div', { class: 'empty-hint', text: 'Aggiungi PG o PNG con un valore di Iniziativa per generare l\'ordine dei turni.' }));
      return;
    }

    combined.forEach(function (c, idx) {
      var isActive = state.initiative.activeId === c.id;
      var sideClass = c.kind === 'pg' ? 'initiative-pg' : ('initiative-' + (c.side === 'ally' ? 'ally' : 'enemy'));
      var tag = c.kind === 'pg' ? 'PG' : (c.side === 'ally' ? 'Alleato' : 'Nemico');
      listEl.appendChild(el('div', { class: 'initiative-row ' + sideClass + (isActive ? ' initiative-active' : '') }, [
        el('span', { class: 'initiative-pos', text: (idx + 1) + '.' }),
        el('span', { class: 'initiative-name', text: c.name }),
        el('span', { class: 'initiative-init', text: 'Iniziativa ' + c.init }),
        el('span', { class: 'initiative-tag', text: tag })
      ]));
    });
  }

  function advanceTurn(direction) {
    var combined = getCombinedCombatants();
    if (combined.length === 0) return;
    var idx = combined.findIndex(function (c) { return c.id === state.initiative.activeId; });
    if (idx === -1) {
      idx = direction > 0 ? 0 : combined.length - 1;
    } else {
      idx += direction;
      if (idx >= combined.length) {
        idx = 0;
        state.round++;
        renderRound();
      } else if (idx < 0) {
        idx = combined.length - 1;
        state.round = Math.max(0, state.round - 1);
        renderRound();
      }
    }
    state.initiative.activeId = combined[idx].id;
    saveState();
    renderInitiative();
  }

  document.getElementById('initNextBtn').addEventListener('click', function () { advanceTurn(1); });
  document.getElementById('initPrevBtn').addEventListener('click', function () { advanceTurn(-1); });
  document.getElementById('initResetBtn').addEventListener('click', function () {
    state.initiative.activeId = null;
    saveState();
    renderInitiative();
  });

  // ---------------- ENCOUNTER BUILDER ----------------

  function initEncounterCrSelect() {
    var select = document.getElementById('monCr');
    CR_XP.forEach(function (entry) {
      select.appendChild(el('option', { value: entry.cr, text: 'GS ' + entry.cr + ' (' + entry.xp + ' XP)' }));
    });
  }

  function renderEncounter() {
    document.getElementById('encPartySize').value = state.encounter.partySize;
    document.getElementById('encPartyLevel').value = state.encounter.partyLevel;

    var partySize = Math.max(1, parseInt(state.encounter.partySize, 10) || 1);
    var partyLevel = Math.min(20, Math.max(1, parseInt(state.encounter.partyLevel, 10) || 1));
    var perCharacter = XP_THRESHOLDS[partyLevel];
    var thresholds = perCharacter.map(function (v) { return v * partySize; });

    var thresholdsWrap = document.getElementById('xpThresholds');
    thresholdsWrap.innerHTML = '';
    var labels = ['Facile', 'Medio', 'Difficile', 'Mortale'];
    labels.forEach(function (label, i) {
      thresholdsWrap.appendChild(el('div', { class: 'threshold-badge' }, [
        el('span', { class: 'label', text: label }),
        el('span', { class: 'value', text: thresholds[i].toLocaleString('it-IT') + ' XP' })
      ]));
    });

    var tbody = document.getElementById('encounterBody');
    tbody.innerHTML = '';
    if (state.encounter.monsters.length === 0) {
      tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'empty-hint', text: 'Nessun mostro aggiunto.' })]));
    }
    var totalXp = 0;
    var totalCount = 0;
    state.encounter.monsters.forEach(function (m) {
      var xpEach = xpForCr(m.cr);
      var rowXp = xpEach * m.qty;
      totalXp += rowXp;
      totalCount += m.qty;

      var qtyInput = numberInput(m.qty, function (v) { m.qty = Math.max(1, Math.round(v)); saveState(); renderEncounter(); }, '56px');
      var acInput = numberInput(m.ac, function (v) { m.ac = v; saveState(); }, '56px');
      var hpInput = numberInput(m.hp, function (v) { m.hp = v; saveState(); }, '56px');

      var removeBtn = el('button', {
        type: 'button', class: 'btn-remove', text: '✕', title: 'Rimuovi mostro',
        onclick: function () {
          state.encounter.monsters = state.encounter.monsters.filter(function (x) { return x.id !== m.id; });
          saveState();
          renderEncounter();
        }
      });

      var addToCompendiumBtn = el('button', {
        type: 'button', class: 'btn-small-outline', text: '+ Comp.', title: 'Salva nel Compendio dei mostri',
        onclick: function () {
          campaignData.compendiumMonsters.push({ id: uid(), name: m.name, cr: m.cr, ac: m.ac, hp: m.hp, description: '', notes: 'Incontrato in uno scontro preparato.' });
          saveCampaignData();
          renderCompendiumMonsters();
        }
      });

      tbody.appendChild(el('tr', {}, [
        el('td', { text: m.name }),
        el('td', { text: 'GS ' + m.cr }),
        el('td', {}, [qtyInput]),
        el('td', {}, [acInput]),
        el('td', {}, [hpInput]),
        el('td', { text: rowXp.toLocaleString('it-IT') }),
        el('td', { class: 'col-actions' }, [addToCompendiumBtn, removeBtn])
      ]));
    });

    var multiplier = totalCount > 0 ? effectiveMultiplier(totalCount, partySize) : 1;
    var adjustedXp = Math.round(totalXp * multiplier);
    var diff = totalCount > 0 ? difficultyForXp(adjustedXp, thresholds) : { label: '—', cls: '' };

    var summary = document.getElementById('encounterSummary');
    summary.innerHTML = '';
    summary.appendChild(el('div', {}, [
      document.createTextNode('Mostri totali: ' + totalCount + '  ·  XP totale: ' + totalXp.toLocaleString('it-IT') +
        '  ·  Moltiplicatore: x' + multiplier + '  ·  XP adeguato: ' + adjustedXp.toLocaleString('it-IT'))
    ]));
    summary.appendChild(el('div', { style: 'margin-top:6px' }, [
      document.createTextNode('Difficoltà stimata: '),
      el('span', { class: 'diff-pill ' + diff.cls, text: diff.label })
    ]));
  }

  document.getElementById('encPartySize').addEventListener('change', function (e) {
    state.encounter.partySize = Math.max(1, parseInt(e.target.value, 10) || 1);
    saveState();
    renderEncounter();
  });

  document.getElementById('encPartyLevel').addEventListener('change', function (e) {
    state.encounter.partyLevel = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1));
    saveState();
    renderEncounter();
  });

  document.getElementById('encSyncParty').addEventListener('click', function () {
    state.encounter.partySize = state.party.length > 0 ? state.party.length : state.encounter.partySize;
    saveState();
    renderEncounter();
  });

  document.getElementById('addMonsterForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('monName').value.trim();
    var cr = document.getElementById('monCr').value;
    var qty = Math.max(1, parseInt(document.getElementById('monQty').value, 10) || 1);
    var ac = parseFloat(document.getElementById('monAc').value) || 0;
    var hp = parseFloat(document.getElementById('monHp').value) || 0;
    if (!name) return;
    state.encounter.monsters.push({ id: uid(), name: name, cr: cr, qty: qty, ac: ac, hp: hp });
    e.target.reset();
    document.getElementById('monQty').value = '1';
    document.getElementById('monAc').value = '13';
    document.getElementById('monHp').value = '10';
    saveState();
    renderEncounter();
  });

  document.getElementById('encAddToNpcs').addEventListener('click', function () {
    if (state.encounter.monsters.length === 0) return;
    if (!confirm('Aggiungere tutti i mostri come PNG Nemici e svuotare la lista?')) return;
    state.encounter.monsters.forEach(function (m) {
      for (var i = 1; i <= m.qty; i++) {
        state.npcs.push({
          id: uid(),
          name: m.qty > 1 ? m.name + ' ' + i : m.name,
          side: 'enemy',
          ac: m.ac, hpCur: m.hp, hpMax: m.hp,
          init: 0, damage: 0, prone: false, restrained: false
        });
      }
    });
    state.encounter.monsters = [];
    saveState();
    renderEncounter();
    renderNpcs();
  });

  document.getElementById('encClear').addEventListener('click', function () {
    if (state.encounter.monsters.length === 0) return;
    if (!confirm('Svuotare la lista dei mostri?')) return;
    state.encounter.monsters = [];
    saveState();
    renderEncounter();
  });

  // ---------------- WILD MAGIC / EVENTI NEGATIVI ----------------

  function initWildMagicTable() {
    var tbody = document.getElementById('wmBody');
    WILD_MAGIC_TABLE.forEach(function (entry, idx) {
      var num = idx + 1;
      var searchBlob = (num + ' ' + entry.e + ' ' + entry.m + ' ' + entry.n).toLowerCase();
      tbody.appendChild(el('tr', { 'data-search': searchBlob }, [
        el('td', { text: num }),
        el('td', { text: entry.e }),
        el('td', { text: entry.m }),
        el('td', { text: entry.n })
      ]));
    });

    document.getElementById('wmFilter').addEventListener('input', function (e) {
      var q = e.target.value.trim().toLowerCase();
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var match = !q || tr.getAttribute('data-search').indexOf(q) !== -1;
        tr.style.display = match ? '' : 'none';
      });
    });

    document.getElementById('wmRollBtn').addEventListener('click', rollWildMagic);
  }

  function rollWildMagic() {
    var row = Math.floor(Math.random() * 100) + 1;
    var sevRoll = Math.floor(Math.random() * 20) + 1;
    var sevKey, sevLabel, sevCls;
    if (sevRoll <= 3) { sevKey = 'e'; sevLabel = 'Estremo'; sevCls = 'wm-extreme'; }
    else if (sevRoll <= 9) { sevKey = 'm'; sevLabel = 'Moderato'; sevCls = 'wm-moderate'; }
    else { sevKey = 'n'; sevLabel = 'Fastidio'; sevCls = 'wm-nuisance'; }

    var text = WILD_MAGIC_TABLE[row - 1][sevKey];
    var resultWrap = document.getElementById('wmResult');
    resultWrap.innerHTML = '';
    resultWrap.appendChild(el('div', { class: 'wm-result-card ' + sevCls }, [
      el('div', { class: 'wm-result-header', text: '#' + row + ' — ' + sevLabel + ' (d100=' + row + ', d20=' + sevRoll + ')' }),
      el('div', { class: 'wm-result-text', text: text })
    ]));
  }

  // ---------------- BACKUP: EXPORT / IMPORT JSON ----------------

  document.getElementById('exportDataBtn').addEventListener('click', function () {
    var payload = { combatState: state, campaignData: campaignData };
    var dataStr = JSON.stringify(payload, null, 2);
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = 'gm-screen-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('importDataBtn').addEventListener('click', function () {
    document.getElementById('importDataInput').click();
  });

  document.getElementById('importDataInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var imported;
      try {
        imported = JSON.parse(ev.target.result);
      } catch (err) {
        alert('File non valido: impossibile leggere i dati JSON.');
        return;
      }
      if (!confirm('Importare questi dati? Sovrascriveranno lo stato attuale (combattimento, rubrica e compendio).')) return;
      stopTicker();
      // Formato nuovo: { combatState, campaignData }. Formato legacy: solo lo stato del combattimento.
      if (imported && (imported.combatState || imported.campaignData)) {
        state = Object.assign(clone(defaultState), imported.combatState || {});
        campaignData = Object.assign(clone(defaultCampaignData), imported.campaignData || {});
      } else {
        state = Object.assign(clone(defaultState), imported);
      }
      saveState();
      saveCampaignData();
      renderAll();
      renderRoster();
      renderSessions();
      renderQuests();
      renderCompendiumItems();
      renderCompendiumMonsters();
      if (state.time.running) startTicker();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ---------------- RESET ALL ----------------

  document.getElementById('resetAll').addEventListener('click', function () {
    if (!confirm('Vuoi davvero azzerare l\'intero combattimento? Questa azione non è reversibile.')) return;
    stopTicker();
    state = clone(defaultState);
    saveState();
    renderAll();
  });

  // ---------------- INIT ----------------

  function renderAll() {
    renderRound();
    renderTime();
    renderCasters();
    renderRages();
    renderParty();
    renderNpcs();
    renderEncounter();
    renderInitiative();
    updateSortArrows('partyTable');
  }

  setupSortableHeaders('partyTable', renderParty);
  document.getElementById('secPerRound').value = state.time.secPerRound;
  initNameGenerators();
  initEncounterCrSelect();
  initWildMagicTable();

  renderAll();
  renderRoster();
  renderSessions();
  renderQuests();
  renderCompendiumItems();
  renderCompendiumMonsters();
  if (state.time.running) startTicker();

})();
