// What each catalog tab is made of: its pill label and total, its rows, the sentence in the panel's
// footer and the folder that footer's "BROWSE THE DATA" pill opens. Every figure here comes from
// stats.json or catalog.json (both generated); the sentences are page copy with the figures
// substituted in, so a record added to the store changes them without an edit.
import { BLUEPRINTS_DIR, EXAMPLES_README, KNOWLEDGE_DIR, RECIPES_DIR } from '../lib/site-links';
import { knowledgeKindSummary } from '../lib/knowledge-kind-summaries';
import type { CatalogGroupRow } from './catalog-group-list';
import type { Catalog, Example, Stats } from '../types/generated-data';

export interface CatalogTabContent {
  id: string;
  label: string;
  /** The number in the pill: the records behind the tab, not the number of rows. */
  total: number;
  rows: CatalogGroupRow[];
  footer: string;
  browseHref: string;
}

/** The chapter headings are sentences; the right column takes their first word (Crafted, Physics…). */
const chapterFigure = (chapter: string): string => chapter.split(' ')[0]?.replace(/[^A-Za-z]/g, '') ?? chapter;

export function catalogTabs(catalog: Catalog, stats: Stats, examples: Example[]): CatalogTabContent[] {
  return [
    {
      id: 'recipes',
      label: 'Recipes',
      total: stats.recipes,
      rows: catalog.directions.map((direction) => ({
        key: direction.id,
        id: direction.id,
        summary: direction.summary,
        figure: String(direction.count),
      })),
      footer:
        `All ${stats.directions} directions · ${stats.recipes} recipes. ` +
        'Each recipe carries a prompt, entities, invariants, sources and stated limits.',
      browseHref: RECIPES_DIR,
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      total: stats.knowledge,
      rows: catalog.kinds.map((kind) => ({
        key: kind.id,
        id: kind.id,
        summary: knowledgeKindSummary(kind.id),
        figure: String(kind.count),
      })),
      footer:
        `All ${catalog.kinds.length} kinds · ${stats.knowledge} records. ` +
        'Each record carries principles, implementation notes and observable checks.',
      browseHref: KNOWLEDGE_DIR,
    },
    {
      id: 'kits',
      label: 'Kits',
      total: stats.blueprints,
      rows: catalog.blueprints.map((blueprint) => ({
        key: blueprint.id,
        id: blueprint.id,
        summary: blueprint.summary,
        figure: blueprint.tier,
      })),
      footer:
        `${stats.blueprints} kit blueprints. ` +
        'Each one ships a module, its parameters and a proof capture at its stated tier.',
      browseHref: BLUEPRINTS_DIR,
    },
    {
      id: 'demos',
      label: 'Demos',
      total: examples.length,
      rows: examples.map((study) => ({
        key: study.id,
        id: study.id,
        summary: study.blurb,
        figure: chapterFigure(study.chapter),
        study,
      })),
      footer:
        `${examples.length} runnable studies. ` +
        'Each one has its own prompt, controls, sources and limits.',
      browseHref: EXAMPLES_README,
    },
  ];
}
