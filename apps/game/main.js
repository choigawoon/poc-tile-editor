// Game entry. Decides where the bundle comes from, then runs the Pixi engine.
//
// Bundle source priority:
//   1. postMessage { type:'poc-play', bundle:{map,images} }
//      — the editor's ▶Play embeds this page in an iframe and posts the live
//        project as an inline bundle (Step 4). We ack with 'poc-ready'/'poc-mounted'.
//   2. ?bundle=<url>  — explicit map.json URL
//   3. default        — the shipped demo bundle
import { createGame } from './game.js';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');

const DEFAULT_BUNDLE = '/bundles/demo/map.json';

(async () => {
  let game;
  try {
    game = await createGame(canvas, hud);
  } catch (err) {
    hud.textContent = 'Failed to init renderer: ' + err.message;
    console.error(err);
    return;
  }

  const embedded = window.parent && window.parent !== window;

  // ▶Play embed: accept inline bundles from the parent editor.
  window.addEventListener('message', async (e) => {
    const msg = e.data;
    if (!msg || msg.type !== 'poc-play' || !msg.bundle) return;
    try {
      await game.mount({ type: 'inline', inline: msg.bundle });
      const m = window.__game?.map;
      window.parent.postMessage({ type: 'poc-mounted',
        info: { renderer: 'pixi', width: m?.width, height: m?.height, layers: m?.layers?.length, tilesets: m?.tilesets?.length } }, '*');
    } catch (err) {
      hud.textContent = 'Play failed: ' + err.message;
      window.parent.postMessage({ type: 'poc-error', message: err.message }, '*');
      console.error(err);
    }
  });

  if (embedded) {
    hud.textContent = 'Embedded — waiting for editor ▶Play…';
    window.parent.postMessage({ type: 'poc-ready' }, '*');
    return;
  }

  // standalone: load from ?bundle= or the demo
  const url = new URLSearchParams(location.search).get('bundle') || DEFAULT_BUNDLE;
  try {
    await game.mount({ type: 'url', url });
  } catch (err) {
    hud.textContent = `Failed to load bundle (${url}): ${err.message}` +
      '  — run: npm run bundle:demo';
    console.error(err);
  }
})();
