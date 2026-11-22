// The catalog panel's pill tabs: a bold label and, beside it, the group's total in the lighter mono
// face. Active is the solid green pill. Keyboard: a roving tabindex with ←/→/↑/↓/Home/End and
// automatic activation, as the tabs pattern asks.
import type { KeyboardEvent } from 'react';

export interface CatalogTab {
  id: string;
  label: string;
  total: number;
}

interface CatalogTabListProps {
  tabs: CatalogTab[];
  active: string;
  onSelect: (id: string) => void;
}

const PILL =
  'flex cursor-pointer items-baseline gap-2 rounded-full px-[18px] py-[10px] text-[14.5px] ' +
  'font-semibold transition-colors duration-150';
const ON = 'bg-green text-white hover:bg-green-dark';
const OFF = 'border border-line bg-white text-ink hover:bg-wash';

export default function CatalogTabList({ tabs, active, onSelect }: CatalogTabListProps) {
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : step === undefined
            ? null
            : (index + step + tabs.length) % tabs.length;
    const next = target === null ? undefined : tabs[target];
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    document.getElementById(`catalog-tab-${next.id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label="Catalog" className="flex flex-wrap gap-2">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`catalog-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`catalog-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={`${PILL} ${selected ? ON : OFF}`}
          >
            {tab.label}
            <span className={`font-mono text-[12.5px] font-normal ${selected ? 'text-white/80' : 'text-mono-dim'}`}>
              {tab.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
