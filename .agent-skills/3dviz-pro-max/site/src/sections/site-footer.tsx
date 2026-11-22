// The design's footer. The repository's own code, data and authored media are MIT licensed;
// third-party material is not, so the credit line names it and the last link points at LICENSE.
import { GITHUB_REPO, INSTALL_DOC, LICENSE_SECTION } from '../lib/site-links';

const CREDIT =
  'MIT licensed. Anatomy meshes credit BodyParts3D (CC BY-SA 2.1 Japan); the bundled fonts are ' +
  'under the SIL Open Font License; the historical village recording was supplied by the author ' +
  'and is not covered by the MIT grant.';

const LINKS = [
  { href: GITHUB_REPO, label: 'GitHub' },
  { href: INSTALL_DOC, label: 'Install' },
  { href: '#gallery', label: 'Demos' },
  { href: LICENSE_SECTION, label: 'License' },
];

export default function SiteFooter() {
  return (
    <footer className="relative border-t border-line bg-cream">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-6 px-6 pt-7 pb-[46px]">
        <p className="m-0 max-w-[560px] text-[13.5px] leading-[1.65] text-pretty text-dim">{CREDIT}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-[18px] text-[14px] font-medium">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-green"
              // Repository links leave the page; in-page anchors stay in this tab.
              {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
