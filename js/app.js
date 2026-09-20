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
    }
  };

  // ---- Kobold Fight Club style encounter-building data (5e DMG methodology) ----

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
      return;
    }
    rows.forEach(function (pc) {
      tbody.appendChild(renderPartyRow(pc));
    });
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

    var header = el('div', { class: 'npc-header' }, [nameInput, removeBtn]);

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

  // ---------------- ENCOUNTER BUILDER (Kobold Fight Club style) ----------------

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

      tbody.appendChild(el('tr', {}, [
        el('td', { text: m.name }),
        el('td', { text: 'GS ' + m.cr }),
        el('td', {}, [qtyInput]),
        el('td', {}, [acInput]),
        el('td', {}, [hpInput]),
        el('td', { text: rowXp.toLocaleString('it-IT') }),
        el('td', { class: 'col-actions' }, [removeBtn])
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
    updateSortArrows('partyTable');
  }

  setupSortableHeaders('partyTable', renderParty);
  document.getElementById('secPerRound').value = state.time.secPerRound;
  initNameGenerators();
  initEncounterCrSelect();

  renderAll();
  if (state.time.running) startTicker();

})();
