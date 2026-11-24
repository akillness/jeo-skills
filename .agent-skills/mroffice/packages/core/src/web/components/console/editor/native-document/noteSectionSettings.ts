/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Footnote and endnote settings as Word numbers them: per SECTION.
 *
 * The note doc attrs (footnoteNumFmt, footnoteNumStart, …) hold the
 * document's values; a `sectionLayouts` entry's `footnotePr` / `endnotePr`
 * holds what that section sets differently (Footnote and Endnote > Apply
 * changes to > This section). Every surface that shows a note number — the
 * in-text marker, the page-bottom zone, the endnote list, cross-references,
 * find, offline export — reads the same resolution through
 * {@link documentNoteSettings}, so their labels cannot disagree.
 */

import {
  noteSettingsFromDocAttrs,
  resolveSectionNoteSettings,
  type NoteStreamSettings,
  type NoteStreamsSettings,
} from "./footnotes";
import { normalizeSectionLayouts } from "./sectionLayouts";

/**
 * The document's note settings plus, when the section chain carries any
 * section-level note property, the settings each section numbers with.
 * A malformed `sectionLayouts` (which the page renderer also refuses)
 * contributes nothing: every section then follows the document values.
 */
export function documentNoteSettings(
  attrs: Record<string, unknown>,
): NoteStreamsSettings {
  const settings = noteSettingsFromDocAttrs(attrs);
  const layouts = normalizeSectionLayouts(attrs.sectionLayouts);
  if (!layouts || !layouts.some((layout) => layout.footnotePr || layout.endnotePr)) {
    return settings;
  }
  return {
    ...settings,
    sections: layouts.map((layout) => ({
      footnote: resolveSectionNoteSettings(
        "footnote",
        settings.footnote,
        layout.footnotePr,
      ),
      endnote: resolveSectionNoteSettings(
        "endnote",
        settings.endnote,
        layout.endnotePr,
      ),
    })),
  };
}

/** The settings one section numbers with (the document's beyond the chain). */
export function noteSettingsAtSection(
  settings: NoteStreamsSettings,
  sectionIndex: number,
): { footnote: NoteStreamSettings; endnote: NoteStreamSettings } {
  return (
    settings.sections?.[sectionIndex] ?? {
      footnote: settings.footnote,
      endnote: settings.endnote,
    }
  );
}
