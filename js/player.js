// Player page: loads a game file and plays it.
(function () {
  'use strict';

  var openButton = document.getElementById('open-button');
  var restartButton = document.getElementById('restart-button');
  var fileInput = document.getElementById('file-input');
  var emptyState = document.getElementById('empty-state');
  var errorBox = document.getElementById('error');
  var frame = document.getElementById('player-frame');
  var titleEl = document.getElementById('game-title');

  var currentGame = null;
  var session = null;

  function start(game) {
    if (session) session.destroy();
    currentGame = game;
    // Fit the stage to the window height as well as its width.
    frame.style.maxWidth = 'calc((100vh - 84px) * ' + game.width / game.height + ')';
    session = EscapeEngine.play(frame, game);
    titleEl.textContent = '— ' + game.title;
    document.title = game.title + ' — The Escape';
    emptyState.hidden = true;
    frame.hidden = false;
    restartButton.hidden = false;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    emptyState.hidden = false;
  }

  function loadFile(file) {
    EscapeEngine.readGameFile(file).then(start, function (e) { showError(e.message); });
  }

  openButton.addEventListener('click', function () { fileInput.click(); });
  restartButton.addEventListener('click', function () { if (currentGame) start(currentGame); });

  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // Drag and drop a game file anywhere on the page.
  document.addEventListener('dragover', function (e) {
    e.preventDefault();
    emptyState.classList.add('is-dragover');
  });
  document.addEventListener('dragleave', function () {
    emptyState.classList.remove('is-dragover');
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    emptyState.classList.remove('is-dragover');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  // player.html?game=path/to/game.json loads a game by URL (needs a web server).
  var url = new URLSearchParams(location.search).get('game');
  if (url) {
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load "' + url + '" (' + res.status + ').');
        return res.text();
      })
      .then(EscapeEngine.parseGame)
      .then(start)
      .catch(function (e) {
        var hint = location.protocol === 'file:'
          ? ' Browsers block loading files by URL from disk — use "Open game…" instead.'
          : '';
        showError(e.message + hint);
      });
  }
})();
