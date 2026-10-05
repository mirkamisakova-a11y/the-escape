# The Escape

A tiny framework for making and playing point-and-click escape-room games in the browser.
It's plain HTML, CSS and JavaScript: no build step and no dependencies.

- **`player.html`**: open a game file (`.json`) and play it.
- **`editor.html`**: build a game visually, play-test it, and save it as a `.json` file.
- **`examples/locked-room.json`**: a small example game.

## Running

Open `index.html` in a browser. Everything works straight from disk, including opening
and saving game files.

To load games by URL (`player.html?game=examples/locked-room.json`), serve the folder:

```sh
python3 -m http.server
# then visit http://localhost:8000
```

## How games work

A game is a stage of a fixed logical size (e.g. 800×600) holding **objects**. Each object has
an image, a position and size, whether it's visible when the game starts, and a list of
**actions** that run in order when it is clicked. An object without an image is an invisible
clickable hotspot.

Actions available so far:

| Action      | Effect                                          |
| ----------- | ----------------------------------------------- |
| `showText`  | Shows `text` on screen for `duration` seconds.  |
| `show`      | Makes the object `target` (an object id) visible. |
| `hide`      | Hides the object `target`.                      |

Puzzles come from combining these. In the example, the door is really three objects
(locked, unlocked, open), and picking up the key hides the locked door and shows the
unlocked one.

### File format

```json
{
  "format": "the-escape",
  "version": 1,
  "title": "My Room",
  "width": 800,
  "height": 600,
  "background": "#1e1e24",
  "objects": [
    {
      "id": "painting",
      "name": "Painting",
      "image": "data:image/png;base64,...",
      "x": 160, "y": 130, "width": 160, "height": 120,
      "visible": true,
      "actions": [
        { "type": "showText", "text": "Something glints behind it…", "duration": 3 },
        { "type": "hide", "target": "painting" },
        { "type": "show", "target": "key" }
      ]
    }
  ]
}
```

Objects are drawn in list order, so later objects appear on top. The editor embeds images
as data URLs so a whole game is one file. Image URLs work too.

## Code layout

- `js/engine.js`: the engine (file format, validation, rendering, playing). It's shared by
  the player and the editor and exposes a global `EscapeEngine`. Add new action types to
  `ACTION_TYPES`, `normalizeAction` and `runActions` there. The editor builds its action
  menu from `ACTION_TYPES`, and its per-action fields live in `renderActionCard` in
  `js/editor.js`.
- `js/player.js`, `js/editor.js`: the two apps.
- `css/engine.css`: stage and in-game styles. `css/app.css`: page chrome.
