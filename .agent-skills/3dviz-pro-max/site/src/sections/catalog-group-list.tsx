// The body of the catalog panel: one full-width row per group, hairline between rows. Left is the
// group's own id in the mono face with its one-line summary under it; right is the figure that
// group carries — a record count, a proved tier or a chapter. A Demos row is a button and opens the
// study modal; every other row is text. The body scrolls at about 640 px: the row cut off at the
// bottom edge is the cue that the list continues.
import type { Example } from '../types/generated-data';

export interface CatalogGroupRow {
  key: string;
  /** The group id as the store spells it: `environments-dioramas`, `blueprint-barrel`, `heart`. */
  id: string;
  summary: string;
  /** Right column: a count, a proved tier, a chapter. */
  figure: string;
  /** Set on the Demos tab only: the row opens this study in the page's modal. */
  study?: Example;
}

interface CatalogGroupListProps {
  rows: CatalogGroupRow[];
  onOpenStudy: (study: Example, opener: HTMLButtonElement) => void;
}

const ROW = 'flex w-full items-center justify-between gap-5 px-1 py-[13px] text-left';
const ID = 'm-0 truncate font-mono text-[13px] tracking-[-0.1px] text-ink';
const SUMMARY = 'm-0 mt-1 truncate text-[13.5px] leading-[1.5] text-mute';
const FIGURE = 'flex-none font-mono text-[13px] text-green tabular-nums';

function RowBody({ row }: { row: CatalogGroupRow }) {
  return (
    <>
      <span className="min-w-0">
        <span className={`block ${ID}`}>{row.id}</span>
        <span className={`block ${SUMMARY}`}>{row.summary}</span>
      </span>
      <span className={FIGURE}>{row.figure}</span>
    </>
  );
}

export default function CatalogGroupList({ rows, onOpenStudy }: CatalogGroupListProps) {
  return (
    <ul className="m-0 max-h-[640px] list-none overflow-y-auto p-0">
      {rows.map((row) => (
        <li key={row.key} className="border-b border-line last:border-b-0">
          {row.study ? (
            <button
              type="button"
              onClick={(event) => {
                if (row.study) onOpenStudy(row.study, event.currentTarget);
              }}
              className={`${ROW} cursor-pointer rounded-[14px] transition-colors duration-150 hover:bg-wash`}
            >
              <RowBody row={row} />
            </button>
          ) : (
            <div className={ROW}>
              <RowBody row={row} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
