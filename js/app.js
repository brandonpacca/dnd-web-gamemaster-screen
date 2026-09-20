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
    sort: { key: null, dir: 1 }
  };

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
    updateSortArrows('partyTable');
  }

  setupSortableHeaders('partyTable', renderParty);
  document.getElementById('secPerRound').value = state.time.secPerRound;

  renderAll();
  if (state.time.running) startTicker();

})();
