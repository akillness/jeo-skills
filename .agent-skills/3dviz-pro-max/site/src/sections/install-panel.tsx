// "Copy one folder. That's the install." — the design's dark card, with the WORKS WITH rows read
// out of docs/compatibility.md through compatibility.json. The status labels are that document's
// own position, not the design's: Codex is the first EVALUATED target and Claude Code is OBSERVED
// (skill route documented, plugin load observed once) — neither is "supported". The full statement
// rides along as the row's title so the claim is one hover away.
import { GITHUB_REPO, INSTALL_DOC } from '../lib/site-links';
import type { CompatRow } from '../types/generated-data';

/** The two surfaces the card states, with the label docs/compatibility.md supports. */
const SURFACES = [
  { surface: 'Codex', label: 'Codex plugin', status: 'EVALUATED' },
  { surface: 'Claude Code', label: 'Claude Code plugin', status: 'OBSERVED' },
] as const;

export interface InstallPanelProps {
  compatibility: CompatRow[];
}

export default function InstallPanel({ compatibility }: InstallPanelProps) {
  const rows = SURFACES.map((entry) => ({
    ...entry,
    statement: compatibility.find((row) => row.surface === entry.surface)?.statement ?? '',
  }));

  return (
    <section id="install" className="relative mx-auto max-w-[1240px] px-6 pb-16">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(255px,1fr))] items-center gap-9 rounded-[40px] bg-dark px-[clamp(20px,3.4vw,38px)] py-[clamp(24px,4vw,44px)] text-white">
        <div className="min-w-0">
          <h2 className="m-0 mb-3 text-[clamp(26px,3.2vw,40px)] leading-[1.1] font-extrabold tracking-[-1.4px]">
            Copy one folder. That's the install.
          </h2>
          <p className="m-0 mb-[22px] max-w-[480px] text-[16px] leading-[1.6] text-pretty text-dark-mute">
            Drop <code className="font-mono text-[14px] text-dark-mint">skills/3dviz-pro-max/</code>{' '}
            into a skill location your agent reads, or load the repository as a plugin. Full steps,
            updates and removal live in the docs.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors duration-150 hover:bg-mint hover:text-ink"
            >
              Open the repository ↗
            </a>
            <a
              href={INSTALL_DOC}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/20 px-6 py-3.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-white/8 hover:text-white"
            >
              Installation guide
            </a>
          </div>
        </div>

        <div className="min-w-0 rounded-[28px] border border-white/12 bg-white/6 px-[26px] py-6">
          <h3 className="m-0 mb-3 font-mono text-[10.5px] tracking-[1.4px] text-dark-dim">WORKS WITH</h3>
          <dl className="m-0 flex flex-col gap-2.5 text-[15px]">
            {rows.map((row) => (
              <div key={row.surface} className="flex justify-between gap-3.5" title={row.statement}>
                <dt>{row.label}</dt>
                <dd className="m-0 font-mono text-[12px] text-dark-mint-2">{row.status}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
