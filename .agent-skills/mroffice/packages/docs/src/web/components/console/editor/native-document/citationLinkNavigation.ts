/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { openCitationHref, parseCitationHref } from "@mrnote/core/web/lib/answer-citation-links.ts";

/**
 * An AI answer's citation pasted or applied into a document (lib/answer-report)
 * is a link to the cited place: followed as Word follows a link (Ctrl/Cmd+Click
 * while editing, a plain or middle click when the document is read-only), it
 * opens the cited page in its window and finds and flashes the paragraph,
 * table row or cells (lib/answer-citation-links `openCitationHref`), instead
 * of the browser opening the address in a new tab of its own.
 */
function followCitationLink(view: EditorView, event: MouseEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || !view.dom.contains(anchor)) return false;
  const href = anchor.getAttribute("href") || "";
  if (!parseCitationHref(href)) return false;
  const follow = event.metaKey || event.ctrlKey || event.button === 1 || !view.editable;
  if (!follow) return false;
  event.preventDefault();
  return openCitationHref(href);
}

export const CitationLinkNavigation = Extension.create({
  name: "citationLinkNavigation",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => followCitationLink(view, event),
            auxclick: (view, event) => followCitationLink(view, event),
          },
        },
      }),
    ];
  },
});

export default CitationLinkNavigation;
