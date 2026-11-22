// "Built demos you can open": the 38 studies, grouped into the chapters examples/README.md puts
// them in. Titles, blurbs and chapter headings are that document's own words; the counter beside a
// heading is the length of its group, never a typed number. The modal a card opens belongs to the
// page (App.tsx), because the catalog's Studies tab opens the same one.
import DemoCard from '../components/demo-card';
import { chapterSubtitle } from '../lib/chapter-subtitles';
import { EXAMPLES_README } from '../lib/site-links';
import type { Example } from '../types/generated-data';

const LEDE =
  'studies the skill actually built, each one a runnable page with its own prompt, controls, ' +
  'sources and stated limits. Every still below is a real GPU capture of the page it opens.';

/** Cards arrive grouped by chapter and in chapter order; this only cuts them at the seams. */
function byChapter(examples: Example[]): { name: string; cards: Example[] }[] {
  const chapters: { name: string; cards: Example[] }[] = [];
  for (const study of examples) {
    const current = chapters.at(-1);
    if (current?.name === study.chapter) current.cards.push(study);
    else chapters.push({ name: study.chapter, cards: [study] });
  }
  return chapters;
}

interface DemoGalleryProps {
  examples: Example[];
  /** Hands the chosen study and the control that asked for it to the page's one modal. */
  onOpen: (study: Example, opener: HTMLButtonElement) => void;
}

export default function DemoGallery({ examples, onOpen }: DemoGalleryProps) {
  return (
    <section id="gallery" className="relative mx-auto max-w-[1240px] px-6 pt-11 pb-5">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[660px]">
          <h2 className="m-0 mb-2.5 text-[clamp(28px,3.6vw,44px)] leading-[1.12] font-extrabold tracking-[-0.012em] text-ink">
            Built demos you can open
          </h2>
          <p className="m-0 text-[16px] leading-[1.6] text-pretty text-mute">
            {examples.length} {LEDE}
          </p>
        </div>
        <a
          href={EXAMPLES_README}
          target="_blank"
          rel="noopener"
          className="rounded-full border border-line-strong bg-white px-[18px] py-[11px] font-mono text-[12px] text-green transition-colors duration-150 hover:bg-wash"
        >
          READ THE PROMPTS ↗
        </a>
      </div>

      {byChapter(examples).map((chapter) => (
        <div key={chapter.name}>
          <div className="mt-[34px] mb-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <h3 className="m-0 text-[20px] font-bold tracking-[-0.5px] text-ink">{chapter.name}</h3>
            <span className="text-[14px] text-mute">{chapterSubtitle(chapter.name)}</span>
            <span className="ml-auto font-mono text-[10.5px] text-mono-dim">
              {String(chapter.cards.length).padStart(2, '0')} STUDIES
            </span>
          </div>
          <ul
            aria-label={chapter.name}
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-[18px] p-0"
          >
            {chapter.cards.map((study) => (
              <li key={study.id} className="flex">
                <DemoCard study={study} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
