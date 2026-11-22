import { useRef, useState } from 'react';
import stats from './generated/stats.json';
import examples from './generated/examples.json';
import compatibility from './generated/compatibility.json';
import SiteNav from './components/site-nav';
import StudyModal from './components/study-modal';
import HeroCinematic from './sections/hero-cinematic';
import DemoGallery from './sections/demo-gallery';
import CatalogTabs from './sections/catalog-tabs';
import LoopSection from './sections/loop-section';
import InstallPanel from './sections/install-panel';
import SiteFooter from './sections/site-footer';
import type { Example } from './types/generated-data';

// The Daylight page, top to bottom. install.json and showcase.json are still generated and still
// tested (site/README.md says so), but no section renders them.
//
// The page owns the one study modal, because two sections open it: a gallery card and a row of the
// catalog's Studies tab. `opener` is the control focus goes back to when the dialog closes.
export default function App() {
  const [study, setStudy] = useState<Example | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  function openStudy(selected: Example, from: HTMLButtonElement): void {
    opener.current = from;
    setStudy(selected);
  }

  return (
    <>
      <SiteNav />
      <main id="main">
        <HeroCinematic stats={stats} />
        <DemoGallery examples={examples} onOpen={openStudy} />
        <CatalogTabs stats={stats} examples={examples} onOpen={openStudy} />
        <LoopSection />
        <InstallPanel compatibility={compatibility} />
      </main>
      <SiteFooter />
      <StudyModal
        study={study}
        onClose={() => {
          setStudy(null);
          opener.current?.focus();
        }}
      />
    </>
  );
}
