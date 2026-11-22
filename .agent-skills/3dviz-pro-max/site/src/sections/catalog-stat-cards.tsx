// The catalog in four figures, each counted out of the repository by build-data.mjs — including
// "across 24 directions", which is the summary's own planned-directions count. They count up once,
// when the cards are first scrolled to; readers who asked for less motion get the final numbers
// straight away (use-count-up handles that).
import useCountUp from '../hooks/use-count-up';
import useInView from '../hooks/use-in-view';
import type { Stats } from '../types/generated-data';

interface Figure {
  key: string;
  value: number;
  label: string;
  note: string;
}

const figures = (stats: Stats, studies: number): Figure[] => [
  { key: 'recipes', value: stats.recipes, label: 'Recipes', note: `across ${stats.directions} directions` },
  { key: 'knowledge', value: stats.knowledge, label: 'Knowledge records', note: 'styles, lighting, materials, rules' },
  { key: 'blueprints', value: stats.blueprints, label: 'Kit blueprints', note: 'each proved by real captures' },
  { key: 'studies', value: studies, label: 'Runnable studies', note: 'prompt, sources and limits included' },
];

function StatCard({ value, label, note, active }: Omit<Figure, 'key'> & { active: boolean }) {
  const shown = useCountUp(value, active);

  // The markup keeps the <dt>-before-<dd> order HTML wants; `order-*` shows the figure first.
  return (
    <div className="flex flex-col rounded-[28px] border border-line bg-linear-to-br from-panel-mint to-panel-leaf px-[26px] py-[24px]">
      <dt className="order-2 mt-1.5 text-[15px] font-semibold text-ink">{label}</dt>
      <dd className="order-1 m-0 text-[clamp(38px,4.2vw,54px)] leading-none font-extrabold tracking-[-0.02em] text-green tabular-nums">
        {shown}
      </dd>
      <dd className="order-3 m-0 mt-0.5 text-[13.5px] text-dim">{note}</dd>
    </div>
  );
}

export default function CatalogStatCards({ stats, studies }: { stats: Stats; studies: number }) {
  const [cards, inView] = useInView<HTMLDListElement>({ once: true, threshold: 0.2 });

  return (
    <dl ref={cards} className="m-0 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
      {figures(stats, studies).map(({ key, ...figure }) => (
        <StatCard key={key} {...figure} active={inView} />
      ))}
    </dl>
  );
}
