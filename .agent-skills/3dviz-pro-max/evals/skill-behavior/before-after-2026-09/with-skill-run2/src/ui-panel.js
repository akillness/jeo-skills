// ui-panel.js - the DOM side of selection. Every spatial action has a keyboard equivalent here:
// a button per view and a button per building, so nothing depends on being able to click a roof.
// Button ids are stable (#view-<name>, #pick-<id>) because the capture script drives them.

/**
 * @param {object} options
 * @param {Record<string, object>} options.views
 * @param {Array<{id: string, name: string, note: string, dims: string}>} options.records
 * @param {(name: string) => void} options.onView
 * @param {(id: string|null) => void} options.onSelect
 * @returns {{render(record): void}}
 */
export function installPanel({ views, records, onView, onSelect }) {
  const nav = document.querySelector('#views');
  for (const name of Object.keys(views)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `view-${name}`;
    button.textContent = name;
    button.addEventListener('click', () => onView(name));
    nav.append(button);
  }

  const picks = document.querySelector('#picks');
  const buttons = new Map();
  for (const record of records) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `pick-${record.id}`;
    button.textContent = record.name;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => onSelect(record.id));
    picks.append(button);
    buttons.set(record.id, button);
  }

  const nameEl = document.querySelector('#readout-name');
  const noteEl = document.querySelector('#readout-note');
  const dimsEl = document.querySelector('#readout-dims');

  return {
    /** @param {{id, name, note, dims}|null} record */
    render(record) {
      for (const [id, button] of buttons) {
        button.setAttribute('aria-pressed', String(Boolean(record) && record.id === id));
      }
      nameEl.textContent = record ? record.name : 'Nothing selected';
      noteEl.textContent = record ? record.note : 'Click a building in the scene, or pick one from the list.';
      dimsEl.textContent = record ? record.dims : '';
    }
  };
}
