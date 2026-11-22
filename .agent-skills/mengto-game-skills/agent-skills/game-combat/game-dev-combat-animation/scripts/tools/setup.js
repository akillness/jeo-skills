(async () => {
  let src = await (await fetch('http://127.0.0.1:6163/driver.js')).text(); src = src.replaceAll('6127', '6163'); (0, eval)(src);
  const cu = cls => `/characters.html?wardrobeReview=1&class=${cls}&tab=moves&capture=1&photo=1`;
  const reveal = win => { try { Object.defineProperty(win.document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(win.document, 'visibilityState', { configurable: true, get: () => 'visible' }); } catch {} };
  const pready = win => win.document.querySelector('[data-ready="true"]') && [...win.document.querySelectorAll('button')].some(b => b.textContent === 'Capture Retina PNG');
  window.__seqT = (name, cls, times, { crop = [940, 200, 1000, 1500], wardrobe = 'starter', move = 'idle', fractions = false } = {}) => ({ name: name + '-last', url: cu(cls), settle: 2000, ready: win => pready(win) && (reveal(win), true),
    prepare: async (win, wait) => {
      const st = win.document.querySelector(`[data-study-wardrobe="${wardrobe}"]`);
      if (st && wardrobe !== 'presentation') { st.click(); await wait(8000); for (let i = 0; i < 60 && !pready(win); i++) await wait(500); await wait(3000); }
      for (let i = 0; i < 60 && win.document.querySelector('[data-move="idle"]')?.disabled; i++) await wait(500);
      win.document.querySelector(`[data-move="${move}"]`).click(); await wait(3000);
      const play = win.document.querySelector('[data-move-play]'); if (play.textContent === 'Pause') play.click();
    },
    read: async (win, wait) => {
      win.dispatchEvent(new win.Event('resize'));
      const s = win.document.querySelector('[data-move-seek]'); s.step = 'any';
      const duration = Number(win.document.querySelector('[data-move-time]').textContent.split('/')[1].replace('s', '').trim());
      window.__idleDuration = duration;
      const btn = [...win.document.querySelectorAll('button')].find(b => b.textContent === 'Capture Retina PNG');
      const c = document.createElement('canvas'); c.width = crop[2]; c.height = crop[3]; const g = c.getContext('2d');
      for (let i = 0; i < times.length; i++) {
        s.value = String(fractions ? times[i] : Math.min(1, times[i] / duration)); s.dispatchEvent(new win.Event('input', { bubbles: true }));
        await wait(150);
        btn.click();
        const img = win.document.querySelector('dialog[open] img'); await img.decode();
        g.drawImage(img, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
        win.document.querySelector('dialog[open]')?.close();
        await fetch('http://127.0.0.1:6163', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${name}-${String(i).padStart(4, '0')}`, dataUrl: c.toDataURL('image/png') }) });
        window.__vidProgress = `${name} ${i + 1}/${times.length}`;
      }
      return c.toDataURL('image/png');
    } });
  return 'setup ready';
})();
