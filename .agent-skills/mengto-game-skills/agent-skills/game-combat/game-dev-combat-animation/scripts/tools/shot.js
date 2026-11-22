// Full-size changelog stills from real play: loads the character stage, starts a real action through
// game.js and steps the game loop to the chosen moment, then returns the whole 2880 x 1800 canvas.
(async () => {
  let src = await (await fetch('http://127.0.0.1:6163/driver.js')).text(); src = src.replaceAll('6127', '6163'); (0, eval)(src);
  window.__shot = (name, cls, action, at, { view = 'side' } = {}) => ({
    name, url: `/?review=character&class=${cls}&action=moves&view=${view}&photo=1&hud=0`, settle: 3000, frames: 1,
    ready: win => !!(win.game && win.world && win.__stepFrames && win.document.querySelector('[data-game-move="Idle"]')),
    read: async (win, wait) => {
      win.document.querySelector('[data-game-move="Idle"]').click(); await wait(1500);
      const game = await win.eval("import('/src/game.js')"), p = win.game.player;
      win.game.status = 'playing'; win.game.effects = []; win.game.projectiles = [];
      game.startAction(win.game, action, p.angle); win.__stepFrames(1, 1e-4);
      for (let t = 0; t < at - 1e-6; t += 1 / 60) win.__stepFrames(1, Math.min(1 / 60, at - t));
      win.world.render();
      return win.document.querySelector('#world').toDataURL('image/png');
    },
  });
  return 'shot ready';
})();
