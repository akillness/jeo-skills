// The catalog: four stat cards over one white panel of pill tabs, a scrolling group list and a
// footer that links to the folder the rows were read from. Every figure is generated (stats.json,
// catalog.json, examples.json) — none is typed. catalog.json is nine kilobytes, so it ships in the
// entry bundle; only the record store behind it is large. A Demos row opens the same <dialog> the
// gallery's cards open, which is why the page owns the modal and hands this section an opener.
import { useState } from 'react';
import catalog from '../generated/catalog.json';
import CatalogGroupList from './catalog-group-list';
import CatalogStatCards from './catalog-stat-cards';
import CatalogTabList from './catalog-tab-list';
import { catalogTabs } from './catalog-tab-content';
import type { Example, Stats } from '../types/generated-data';

interface CatalogTabsProps {
  stats: Stats;
  examples: Example[];
  /** The page owns the one study modal; the opener is the button focus returns to. */
  onOpen: (study: Example, opener: HTMLButtonElement) => void;
}

export default function CatalogTabs({ stats, examples, onOpen }: CatalogTabsProps) {
  const [active, setActive] = useState('recipes');
  const tabs = catalogTabs(catalog, stats, examples);
  const panel = tabs.find((tab) => tab.id === active) ?? tabs[0];
  if (!panel) return null;

  return (
    <section id="numbers" aria-label="Catalog" className="relative mx-auto max-w-[1240px] px-6 py-13">
      <CatalogStatCards stats={stats} studies={examples.length} />

      <div className="mt-[22px] rounded-[36px] border border-line bg-white px-[26px] py-[26px] sm:px-[34px] sm:py-[30px]">
        <CatalogTabList
          tabs={tabs.map(({ id, label, total }) => ({ id, label, total }))}
          active={panel.id}
          onSelect={setActive}
        />

        <div
          role="tabpanel"
          id={`catalog-panel-${panel.id}`}
          aria-labelledby={`catalog-tab-${panel.id}`}
          tabIndex={0}
          className="mt-[22px]"
        >
          <CatalogGroupList rows={panel.rows} onOpenStudy={onOpen} />
        </div>

        <div className="mt-[18px] flex flex-wrap items-center justify-between gap-4 border-t border-line pt-[18px]">
          <p className="m-0 max-w-[720px] text-[14px] leading-[1.6] text-pretty text-mute">{panel.footer}</p>
          <a
            href={panel.browseHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line-strong bg-white px-[18px] py-[11px] font-mono text-[12px] text-green transition-colors duration-150 hover:bg-wash"
          >
            BROWSE THE DATA ↗
          </a>
        </div>
      </div>
    </section>
  );
}
