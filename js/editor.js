// Editor page: build a game, save it as a JSON file, and play-test it.
(function () {
  'use strict';

  var E = EscapeEngine;

  var game = E.createEmptyGame();
  var selectedId = null;
  var dirty = false;
  var playSession = null;

  var $ = function (id) { return document.getElementById(id); };
  var canvasFrame = $('canvas-frame');
  var objectList = $('object-list');
  var properties = $('properties');
  var fileInput = $('file-input');
  var playDialog = $('play-dialog');

  var stage = null;

  // Small helper for building DOM: h('label', {className: 'x'}, 'Text', child)
  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), props[key]);
      else el[key] = props[key];
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }

  function selectedObject() {
    return selectedId ? E.findObject(game, selectedId) : null;
  }

  function markDirty() { dirty = true; }

  // ---------------------------------------------------------------------------
  // Rendering

  function renderAll() {
    renderGameSettings();
    renderStage();
    renderObjectList();
    renderProperties();
  }

  function renderGameSettings() {
    $('game-title').value = game.title;
    $('game-width').value = game.width;
    $('game-height').value = game.height;
    if (/^#[0-9a-f]{6}$/i.test(game.background)) $('game-background').value = game.background;
  }

  function renderStage() {
    canvasFrame.textContent = '';
    canvasFrame.style.maxWidth = 'calc((100vh - 52px - 48px) * ' + game.width / game.height + ')';
    stage = E.createStage(game);
    stage.classList.add('is-editing');
    game.objects.forEach(function (obj) {
      stage.appendChild(E.createObjectElement(obj, game));
    });
    stage.addEventListener('pointerdown', onStagePointerDown);
    canvasFrame.appendChild(stage);
    game.objects.forEach(updateObjectView);
  }

  function objectElement(id) {
    return stage.querySelector('.escape-object[data-id="' + CSS.escape(id) + '"]');
  }

  function updateObjectView(obj) {
    var el = objectElement(obj.id);
    if (!el) return;
    E.updateObjectElement(el, obj, game);
    el.classList.toggle('is-hidden-at-start', !obj.visible);
    el.classList.toggle('is-selected', obj.id === selectedId);
    var handle = el.querySelector('.resize-handle');
    if (obj.id === selectedId && !handle) el.appendChild(h('div', { className: 'resize-handle' }));
    if (obj.id !== selectedId && handle) handle.remove();
  }

  function renderObjectList() {
    objectList.textContent = '';
    game.objects.forEach(function (obj) {
      var li = h('li', {
        className: (obj.id === selectedId ? 'is-selected ' : '') + (obj.visible ? '' : 'is-hidden-at-start'),
        title: obj.visible ? obj.id : obj.id + ' (hidden at start)',
        onclick: function () { select(obj.id); }
      }, obj.name);
      objectList.appendChild(li);
    });
  }

  function select(id) {
    selectedId = id;
    game.objects.forEach(updateObjectView);
    renderObjectList();
    renderProperties();
  }

  // ---------------------------------------------------------------------------
  // Properties panel

  var geometryInputs = {};

  function numberField(label, obj, key) {
    var input = h('input', {
      type: 'number',
      value: obj[key],
      oninput: function () {
        var n = Number(input.value);
        if (input.value === '' || !isFinite(n)) return;
        obj[key] = key === 'width' || key === 'height' ? Math.max(1, n) : n;
        updateObjectView(obj);
        markDirty();
      }
    });
    geometryInputs[key] = input;
    return h('label', null, label, input);
  }

  function syncGeometryInputs(obj) {
    Object.keys(geometryInputs).forEach(function (key) {
      geometryInputs[key].value = obj[key];
    });
  }

  function renderProperties() {
    properties.textContent = '';
    geometryInputs = {};
    var obj = selectedObject();
    if (!obj) {
      properties.appendChild(h('section', null,
        h('h2', null, 'Object'),
        h('p', { className: 'hint' }, 'Select an object on the stage or in the list, or add a new one.')));
      return;
    }

    var nameInput = h('input', {
      type: 'text',
      value: obj.name,
      oninput: function () {
        obj.name = nameInput.value;
        updateObjectView(obj);
        renderObjectList();
        markDirty();
      }
    });

    var index = game.objects.indexOf(obj);

    properties.appendChild(h('section', null,
      h('h2', null, 'Object'),
      h('div', { className: 'fields' },
        h('label', null, 'Name', nameInput),
        h('p', { className: 'hint' }, 'ID: ', h('code', null, obj.id)),
        renderImageField(obj),
        h('div', { className: 'fields-2' },
          numberField('X', obj, 'x'),
          numberField('Y', obj, 'y'),
          numberField('Width', obj, 'width'),
          numberField('Height', obj, 'height')),
        h('label', { className: 'row' },
          h('input', {
            type: 'checkbox',
            checked: obj.visible,
            onchange: function (e) {
              obj.visible = e.target.checked;
              updateObjectView(obj);
              renderObjectList();
              markDirty();
            }
          }),
          'Visible when the game starts'),
        h('div', { className: 'row' },
          h('button', { className: 'small', disabled: index === game.objects.length - 1, onclick: function () { moveObject(obj, 1); } }, 'Bring forward'),
          h('button', { className: 'small', disabled: index === 0, onclick: function () { moveObject(obj, -1); } }, 'Send backward')))));

    properties.appendChild(renderActions(obj));

    properties.appendChild(h('section', null,
      h('button', { className: 'danger', onclick: function () { deleteObject(obj); } }, 'Delete object')));
  }

  function renderImageField(obj) {
    var preview = h('div', { className: 'image-preview' }, obj.image ? '' : 'No image — invisible hotspot');
    if (obj.image) preview.style.backgroundImage = 'url("' + obj.image.replace(/"/g, '%22') + '")';

    var input = h('input', {
      type: 'file',
      accept: 'image/*',
      hidden: true,
      onchange: function () {
        var file = input.files[0];
        if (file) setObjectImage(obj, file);
      }
    });

    return h('div', { className: 'fields' },
      h('label', null, 'Image'),
      preview,
      input,
      h('div', { className: 'row' },
        h('button', { className: 'small', onclick: function () { input.click(); } }, obj.image ? 'Replace image…' : 'Choose image…'),
        obj.image && h('button', {
          className: 'small',
          onclick: function () {
            obj.image = '';
            updateObjectView(obj);
            renderProperties();
            markDirty();
          }
        }, 'Remove')));
  }

  // Images are embedded in the game file as data URLs so a game is one file.
  function setObjectImage(obj, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        // Use the image's own proportions, scaled down to fit the stage.
        var scale = Math.min(1, (game.width * 0.8) / img.naturalWidth, (game.height * 0.8) / img.naturalHeight);
        obj.image = reader.result;
        obj.width = Math.max(1, Math.round(img.naturalWidth * scale));
        obj.height = Math.max(1, Math.round(img.naturalHeight * scale));
        updateObjectView(obj);
        renderProperties();
        markDirty();
      };
      img.onerror = function () { alert('"' + file.name + '" is not an image the browser can show.'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function renderActions(obj) {
    var list = h('div', { className: 'action-list' });
    obj.actions.forEach(function (action, i) {
      list.appendChild(renderActionCard(obj, action, i));
    });

    return h('section', null,
      h('h2', null, 'When clicked'),
      obj.actions.length ? null : h('p', { className: 'hint', style: 'margin-bottom: 8px' }, 'Nothing happens yet.'),
      list,
      h('button', {
        onclick: function () {
          obj.actions.push(defaultAction('showText'));
          renderProperties();
          markDirty();
        }
      }, '+ Add action'));
  }

  function defaultAction(type) {
    if (type === 'showText') return { type: 'showText', text: '', duration: E.DEFAULT_TEXT_DURATION };
    return { type: type, target: '' };
  }

  function renderActionCard(obj, action, i) {
    var typeSelect = h('select', {
      onchange: function () {
        obj.actions[i] = defaultAction(typeSelect.value);
        renderProperties();
        markDirty();
      }
    });
    Object.keys(E.ACTION_TYPES).forEach(function (type) {
      typeSelect.appendChild(h('option', { value: type, selected: type === action.type }, E.ACTION_TYPES[type].label));
    });

    var body;
    if (action.type === 'showText') {
      body = h('div', { className: 'fields' },
        h('label', null, 'Text', h('textarea', {
          value: action.text,
          oninput: function (e) { action.text = e.target.value; markDirty(); }
        })),
        h('label', null, 'Seconds on screen', h('input', {
          type: 'number',
          min: 0.5,
          step: 0.5,
          value: action.duration,
          oninput: function (e) {
            var n = Number(e.target.value);
            if (isFinite(n) && n >= 0.5) { action.duration = n; markDirty(); }
          }
        })));
    } else {
      var targetSelect = h('select', {
        onchange: function () { action.target = targetSelect.value; markDirty(); }
      }, h('option', { value: '' }, '— choose an object —'));
      game.objects.forEach(function (other) {
        targetSelect.appendChild(h('option', { value: other.id, selected: other.id === action.target },
          other.id === obj.id ? other.name + ' (this object)' : other.name));
      });
      body = h('label', null, 'Object', targetSelect);
    }

    return h('div', { className: 'action-card' },
      h('div', { className: 'row between' },
        h('strong', null, (i + 1) + '.'),
        typeSelect,
        h('button', {
          className: 'small danger',
          title: 'Remove action',
          onclick: function () {
            obj.actions.splice(i, 1);
            renderProperties();
            markDirty();
          }
        }, '✕')),
      body);
  }

  // ---------------------------------------------------------------------------
  // Object operations

  function addObject() {
    var count = game.objects.length + 1;
    var offset = ((count - 1) % 6) * 20; // stagger so new objects don't stack exactly
    var obj = {
      id: E.uniqueObjectId(game, 'object-' + count),
      name: 'Object ' + count,
      image: '',
      x: Math.round(game.width / 2 - 60) + offset,
      y: Math.round(game.height / 2 - 60) + offset,
      width: 120,
      height: 120,
      visible: true,
      actions: []
    };
    game.objects.push(obj);
    selectedId = obj.id;
    markDirty();
    renderAll();
  }

  function deleteObject(obj) {
    if (!confirm('Delete "' + obj.name + '"?')) return;
    game.objects.splice(game.objects.indexOf(obj), 1);
    // Actions that pointed at this object now point at nothing.
    game.objects.forEach(function (other) {
      other.actions.forEach(function (action) {
        if (action.target === obj.id) action.target = '';
      });
    });
    selectedId = null;
    markDirty();
    renderAll();
  }

  function moveObject(obj, delta) {
    var from = game.objects.indexOf(obj);
    var to = from + delta;
    if (to < 0 || to >= game.objects.length) return;
    game.objects.splice(from, 1);
    game.objects.splice(to, 0, obj);
    markDirty();
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Dragging and resizing on the stage

  function onStagePointerDown(e) {
    if (e.button !== 0) return;
    var el = e.target.closest('.escape-object');
    if (!el) { select(null); return; }

    var obj = E.findObject(game, el.dataset.id);
    if (obj.id !== selectedId) select(obj.id);
    e.preventDefault();

    var resizing = e.target.classList.contains('resize-handle');
    var scale = game.width / stage.clientWidth; // screen px -> game units
    var start = { x: e.clientX, y: e.clientY, ox: obj.x, oy: obj.y, ow: obj.width, oh: obj.height };

    function onMove(ev) {
      var dx = Math.round((ev.clientX - start.x) * scale);
      var dy = Math.round((ev.clientY - start.y) * scale);
      if (resizing) {
        obj.width = Math.max(4, start.ow + dx);
        obj.height = Math.max(4, start.oh + dy);
      } else {
        obj.x = start.ox + dx;
        obj.y = start.oy + dy;
      }
      updateObjectView(obj);
      syncGeometryInputs(obj);
      markDirty();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------------------------------------------------------------------------
  // Game settings

  $('game-title').addEventListener('input', function (e) {
    game.title = e.target.value;
    markDirty();
  });
  ['width', 'height'].forEach(function (key) {
    $('game-' + key).addEventListener('input', function (e) {
      var n = Number(e.target.value);
      if (!isFinite(n) || n < 1) return;
      game[key] = n;
      renderStage();
      markDirty();
    });
  });
  $('game-background').addEventListener('input', function (e) {
    game.background = e.target.value;
    E.updateStage(stage, game);
    markDirty();
  });

  // ---------------------------------------------------------------------------
  // Toolbar: new / open / save / play

  function confirmDiscard() {
    return !dirty || confirm('Discard unsaved changes?');
  }

  function loadGame(newGame) {
    game = newGame;
    selectedId = null;
    dirty = false;
    renderAll();
  }

  $('new-button').addEventListener('click', function () {
    if (confirmDiscard()) loadGame(E.createEmptyGame());
  });

  $('open-button').addEventListener('click', function () {
    if (confirmDiscard()) fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    E.readGameFile(file).then(loadGame, function (e) { alert('Could not open game: ' + e.message); });
  });

  $('save-button').addEventListener('click', function () {
    var blob = new Blob([E.serializeGame(game)], { type: 'application/json' });
    var slug = game.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
    var link = h('a', { href: URL.createObjectURL(blob), download: slug + '.json' });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    dirty = false;
  });

  function startPlayTest() {
    if (playSession) playSession.destroy();
    playSession = E.play($('play-container'), game);
  }

  $('play-button').addEventListener('click', function () {
    $('play-title').textContent = 'Play test — ' + game.title;
    $('play-container').style.maxWidth = 'calc((100vh - 120px) * ' + game.width / game.height + ')';
    $('play-container').style.margin = '0 auto';
    startPlayTest();
    playDialog.showModal();
  });
  $('restart-play-button').addEventListener('click', startPlayTest);
  $('close-play-button').addEventListener('click', function () { playDialog.close(); });
  playDialog.addEventListener('close', function () {
    if (playSession) playSession.destroy();
    playSession = null;
  });

  $('add-object-button').addEventListener('click', addObject);

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !playDialog.open && selectedObject()) {
      e.preventDefault();
      deleteObject(selectedObject());
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  renderAll();
})();
