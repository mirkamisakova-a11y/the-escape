/*
 * The Escape — game engine.
 *
 * Shared by the player and the editor. Exposes a single global,
 * `EscapeEngine`, so the pages work when opened straight from disk
 * (file://), where ES modules are blocked by the browser.
 *
 * Game file format (JSON):
 *
 *   {
 *     "format": "the-escape",
 *     "version": 1,
 *     "title": "My Room",
 *     "width": 800,              // logical stage size; the stage scales to fit
 *     "height": 600,
 *     "background": "#1e1e24",   // any CSS colour
 *     "objects": [               // drawn in order: later objects are on top
 *       {
 *         "id": "door",
 *         "name": "Door",
 *         "image": "data:image/png;base64,...",  // or a URL; "" = invisible hotspot
 *         "x": 100, "y": 50, "width": 120, "height": 240,
 *         "visible": true,       // visible when the game starts
 *         "actions": [           // run in order when the object is clicked
 *           { "type": "showText", "text": "It's locked.", "duration": 3 },
 *           { "type": "show", "target": "key" },
 *           { "type": "hide", "target": "door" }
 *         ]
 *       }
 *     ]
 *   }
 */
(function (global) {
  'use strict';

  var FORMAT = 'the-escape';
  var VERSION = 1;
  var DEFAULT_TEXT_DURATION = 3;

  // Every action the engine understands. The editor builds its UI from this.
  var ACTION_TYPES = {
    showText: { label: 'Show text' },
    show: { label: 'Show object' },
    hide: { label: 'Hide object' }
  };

  function createEmptyGame() {
    return {
      format: FORMAT,
      version: VERSION,
      title: 'Untitled room',
      width: 800,
      height: 600,
      background: '#1e1e24',
      objects: []
    };
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function normalizeAction(action) {
    if (!action || !ACTION_TYPES.hasOwnProperty(action.type)) return null;
    if (action.type === 'showText') {
      return {
        type: 'showText',
        text: String(action.text == null ? '' : action.text),
        duration: Math.max(0.5, toNumber(action.duration, DEFAULT_TEXT_DURATION))
      };
    }
    return { type: action.type, target: String(action.target || '') };
  }

  function normalizeObject(obj, index) {
    var actions = Array.isArray(obj.actions) ? obj.actions : [];
    return {
      id: String(obj.id || 'object-' + (index + 1)),
      name: String(obj.name || obj.id || 'Object ' + (index + 1)),
      image: typeof obj.image === 'string' ? obj.image : '',
      x: toNumber(obj.x, 0),
      y: toNumber(obj.y, 0),
      width: Math.max(1, toNumber(obj.width, 100)),
      height: Math.max(1, toNumber(obj.height, 100)),
      visible: obj.visible !== false,
      actions: actions.map(normalizeAction).filter(Boolean)
    };
  }

  // Validates game data and returns a clean deep copy with defaults filled in.
  // Throws an Error with a readable message if the data is not a game.
  function normalizeGame(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('This file does not contain a game.');
    }
    if (data.format !== undefined && data.format !== FORMAT) {
      throw new Error('Unknown game format "' + data.format + '".');
    }
    if (toNumber(data.version, VERSION) > VERSION) {
      throw new Error('This game was made with a newer version of The Escape.');
    }
    var defaults = createEmptyGame();
    var objects = Array.isArray(data.objects) ? data.objects : [];
    var game = {
      format: FORMAT,
      version: VERSION,
      title: String(data.title || defaults.title),
      width: Math.max(1, toNumber(data.width, defaults.width)),
      height: Math.max(1, toNumber(data.height, defaults.height)),
      background: String(data.background || defaults.background),
      objects: objects.map(normalizeObject)
    };

    var seen = {};
    game.objects.forEach(function (obj) {
      if (seen[obj.id]) throw new Error('Two objects share the id "' + obj.id + '".');
      seen[obj.id] = true;
    });
    return game;
  }

  function parseGame(json) {
    var data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      throw new Error('This file is not valid JSON.');
    }
    return normalizeGame(data);
  }

  function serializeGame(game) {
    return JSON.stringify(normalizeGame(game), null, 2);
  }

  // Reads a File (from an <input type=file> or drag-and-drop) into a game.
  function readGameFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          resolve(parseGame(reader.result));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = function () {
        reject(new Error('Could not read "' + file.name + '".'));
      };
      reader.readAsText(file);
    });
  }

  // Returns an id not used by any object in the game, based on `base`.
  function uniqueObjectId(game, base) {
    var slug = String(base || 'object').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'object';
    var taken = {};
    game.objects.forEach(function (obj) { taken[obj.id] = true; });
    if (!taken[slug]) return slug;
    for (var i = 2; ; i++) {
      if (!taken[slug + '-' + i]) return slug + '-' + i;
    }
  }

  function findObject(game, id) {
    for (var i = 0; i < game.objects.length; i++) {
      if (game.objects[i].id === id) return game.objects[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Rendering (shared by player and editor)

  function createStage(game) {
    var stage = document.createElement('div');
    stage.className = 'escape-stage';
    updateStage(stage, game);
    return stage;
  }

  function updateStage(stage, game) {
    stage.style.aspectRatio = game.width + ' / ' + game.height;
    stage.style.background = game.background;
  }

  function createObjectElement(obj, game) {
    var el = document.createElement('div');
    el.className = 'escape-object';
    el.dataset.id = obj.id;
    updateObjectElement(el, obj, game);
    return el;
  }

  // Objects are positioned in percentages of the stage, so the stage can be
  // any on-screen size while the game keeps its logical coordinates.
  function updateObjectElement(el, obj, game) {
    el.style.left = (obj.x / game.width) * 100 + '%';
    el.style.top = (obj.y / game.height) * 100 + '%';
    el.style.width = (obj.width / game.width) * 100 + '%';
    el.style.height = (obj.height / game.height) * 100 + '%';
    el.style.backgroundImage = obj.image ? 'url("' + obj.image.replace(/"/g, '%22') + '")' : '';
    el.classList.toggle('has-image', !!obj.image);
    el.title = obj.name;
  }

  // ---------------------------------------------------------------------------
  // Playing

  // Starts `gameData` inside `container`. Returns a handle with `destroy()`.
  // The game data itself is never modified; runtime state lives here.
  function play(container, gameData) {
    var game = normalizeGame(gameData);
    var elements = {};
    var messageTimer = null;

    var stage = createStage(game);
    stage.classList.add('is-playing');

    game.objects.forEach(function (obj) {
      var el = createObjectElement(obj, game);
      if (obj.actions.length) {
        el.classList.add('is-clickable');
        el.addEventListener('click', function () { runActions(obj.actions); });
      }
      el.hidden = !obj.visible;
      elements[obj.id] = el;
      stage.appendChild(el);
    });

    var message = document.createElement('div');
    message.className = 'escape-message';
    message.hidden = true;
    message.setAttribute('role', 'status');
    stage.appendChild(message);

    container.appendChild(stage);

    function setVisible(id, visible) {
      if (elements[id]) elements[id].hidden = !visible;
    }

    function showText(text, seconds) {
      clearTimeout(messageTimer);
      message.textContent = text;
      message.hidden = false;
      messageTimer = setTimeout(function () { message.hidden = true; }, seconds * 1000);
    }

    function runActions(actions) {
      actions.forEach(function (action) {
        switch (action.type) {
          case 'showText': showText(action.text, action.duration); break;
          case 'show': setVisible(action.target, true); break;
          case 'hide': setVisible(action.target, false); break;
        }
      });
    }

    return {
      game: game,
      destroy: function () {
        clearTimeout(messageTimer);
        stage.remove();
      }
    };
  }

  global.EscapeEngine = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    DEFAULT_TEXT_DURATION: DEFAULT_TEXT_DURATION,
    ACTION_TYPES: ACTION_TYPES,
    createEmptyGame: createEmptyGame,
    normalizeGame: normalizeGame,
    parseGame: parseGame,
    serializeGame: serializeGame,
    readGameFile: readGameFile,
    uniqueObjectId: uniqueObjectId,
    findObject: findObject,
    createStage: createStage,
    updateStage: updateStage,
    createObjectElement: createObjectElement,
    updateObjectElement: updateObjectElement,
    play: play
  };
})(window);
