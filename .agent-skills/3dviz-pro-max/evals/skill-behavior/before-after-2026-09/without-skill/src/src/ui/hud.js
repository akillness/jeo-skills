// The overlay: building roster chips, the dossier panel, and the reset button.

import { VILLAGE } from '../world/village-layout.js';

const DEFAULT_COPY = {
  name: 'Emberhollow',
  kind: 'Village survey',
  desc: 'Nothing selected. Click any structure in the hollow, or pick one from the roster below.',
  stats: { Structures: String(VILLAGE.length), Founded: 'Year 1', Lanterns: '31' }
};

export function createHud({ onPick, onReset }) {
  const nameEl = document.getElementById('d-name');
  const kindEl = document.getElementById('d-kind');
  const descEl = document.getElementById('d-desc');
  const statsEl = document.getElementById('d-stats');
  const chipsEl = document.getElementById('chips');
  const chips = new Map();

  for (const spec of VILLAGE) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = spec.name;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => onPick(spec.id));
    chipsEl.appendChild(btn);
    chips.set(spec.id, btn);
  }

  document.getElementById('reset-cam').addEventListener('click', onReset);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') onReset();
    if (e.key === 'Escape') onPick(null);
  });

  function renderStats(stats) {
    statsEl.innerHTML = '';
    for (const [k, v] of Object.entries(stats)) {
      const label = document.createElement('span');
      label.textContent = k;
      const value = document.createElement('b');
      value.textContent = v;
      statsEl.append(label, value);
    }
  }

  /** Show a building's dossier, or the village summary when nothing is picked. */
  function show(building) {
    const data = building ? building.userData : DEFAULT_COPY;
    nameEl.textContent = data.name;
    kindEl.textContent = data.kind;
    descEl.textContent = data.desc;
    renderStats(data.stats ?? {});
    for (const [id, btn] of chips) {
      btn.setAttribute('aria-pressed', String(Boolean(building) && data.id === id));
    }
  }

  function hideLoader() {
    const el = document.getElementById('loading');
    if (el) {
      el.classList.add('hidden');
      setTimeout(() => el.remove(), 700);
    }
  }

  show(null);
  return { show, hideLoader };
}
