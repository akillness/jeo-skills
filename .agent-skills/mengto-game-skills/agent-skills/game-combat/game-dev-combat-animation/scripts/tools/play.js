// In-game attack capture: loads the character stage, triggers a real attack through game.js and
// steps the game loop frame by frame, reading the WebGL canvas each frame (crop around the pilgrim).
(async () => {
  let src = await (await fetch('http://127.0.0.1:6163/driver.js')).text(); src = src.replaceAll('6127', '6163'); (0, eval)(src);
  window.__play = (name, cls, action, { view = 'side', frames = 36, dt = 1 / 30, crop = null } = {}) => ({
    name: name + '-last', url: `/?review=character&class=${cls}&action=moves&view=${view}&photo=1&hud=0`, settle: 3000, frames: 1,
    ready: win => !!(win.game && win.world && win.__stepFrames && win.document.querySelector('[data-game-move="Idle"]')),
    read: async (win, wait) => {
      win.document.querySelector('[data-game-move="Idle"]').click(); await wait(1500);
      const game = await win.eval("import('/src/game.js')"), p = win.game.player;
      win.game.status = 'playing'; win.game.effects = []; win.game.projectiles = [];
      game.startAction(win.game, action, p.angle);
      const canvas = win.document.querySelector('#world'), c = document.createElement('canvas');
      const [x, y, w, h] = crop || [0, 0, canvas.width, canvas.height]; c.width = w; c.height = h; const g = c.getContext('2d');
      for (let i = 0; i < frames; i++) {
        if (i) win.__stepFrames(1, dt); else win.__stepFrames(1, 1e-4);
        win.world.render(); g.drawImage(canvas, x, y, w, h, 0, 0, w, h);
        await fetch('http://127.0.0.1:6163', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${name}-${String(i).padStart(4, '0')}`, dataUrl: c.toDataURL('image/png') }) });
        window.__vidProgress = `${name} ${i + 1}/${frames}`;
      }
      return c.toDataURL('image/png');
    },
  });
  return 'play ready';
})();
