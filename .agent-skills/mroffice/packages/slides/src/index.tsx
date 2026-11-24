/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The presentation editor: PresentationWindow, MR Note's slide editor, over
// a local file in its browser-only mode, in its own deck format (.mrslides,
// the editor's JSON).
import { useEffect, useRef } from "react";
import type { EditorDefinition, EditorProps } from "@mrnote/core";

import { defaultSlide } from "@mrnote/core/web/lib/presentation/deck-model.ts";

import PresentationWindow from "./web/components/notebook/contents/PresentationWindow";

export const MRSLIDES_TYPE = "mrnote.presentation.v1";
// Who writes a comment here: the person at this computer.
const LOCAL_AUTHOR = { id: "local-author", displayName: "Author" }; // as lib/collab/self-identity (shim)
const decoder = new TextDecoder();
const encoder = new TextEncoder();

type Deck = { type: string; title: string; slides: unknown[] } & Record<string, unknown>;

function stem(name: string): string {
  return name.replace(/\.(mrslides)(\.json)?$|\.[^.]+$/i, "") || "Presentation";
}

// A new deck starts on PowerPoint's Title Slide, its placeholders placed (the
// product's own new deck, deck-model defaultSlide): a slide with no blocks was
// read as the old stacked title-and-body form, whose title field the first
// placed object (a text box) turned into a canvas without it.
export function emptyDeck(title = "Presentation"): Deck {
  return { type: MRSLIDES_TYPE, title, slides: [{ ...defaultSlide(), backgroundColor: "#ffffff" }] };
}

export function deckFromFile(name: string, bytes: Uint8Array): Deck {
  if (name.toLowerCase().endsWith(".pptx")) throw new Error("PowerPoint files (.pptx) open free in MR Office: online at https://mroffice.ai in any browser (Linux too), or in the desktop app; the open-source editor opens .mrslides.");
  const parsed = JSON.parse(decoder.decode(bytes)) as Deck;
  if (parsed.type !== MRSLIDES_TYPE || !Array.isArray(parsed.slides)) throw new Error(`${name} is not an MR Note presentation.`);
  return parsed;
}

export function PresentationEditor({ file, registerSave, onSaveRequest, onDirty }: EditorProps) {
  const opened = useRef<Deck | null>(null);
  if (!opened.current) opened.current = deckFromFile(file.name, file.bytes);
  const latest = useRef<Deck>(opened.current);
  useEffect(
    () => registerSave(() => ({ name: `${stem(file.name)}.mrslides`, type: "application/json", bytes: encoder.encode(`${JSON.stringify(latest.current)}\n`) })),
    [file.name, registerSave],
  );
  return (
    <PresentationWindow
      pageId={`deck-${file.id}`}
      windowId={`window-${file.id}`}
      guestMode
      initialPresentation={opened.current}
      guestCommentActor={LOCAL_AUTHOR}
      onGuestSaveRequest={onSaveRequest}
      onGuestContentChange={(change: { final: Record<string, unknown> }) => {
        latest.current = change.final as Deck;
        onDirty?.();
      }}
    />
  );
}

export const slidesEditor: EditorDefinition = {
  id: "slides",
  label: "Presentation",
  extensions: [".mrslides", ".mrslides.json"],
  newFile: () => ({ name: "Presentation.mrslides", bytes: encoder.encode(`${JSON.stringify(emptyDeck())}\n`) }),
  Component: PresentationEditor,
};

export default slidesEditor;
