/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The public types of the npm package (scripts/npm/pack.mjs checks that they
// name every export of the built module).
import type { ReactElement } from "react";
import type { EditorDefinition, EditorProps } from "mroffice-core";

export declare const MRSLIDES_TYPE: "mrnote.presentation.v1";
/** A .mrslides deck: the editor's own JSON. */
export type Deck = { type: string; title: string; slides: unknown[] } & Record<string, unknown>;

export declare function emptyDeck(title?: string): Deck;
export declare function deckFromFile(name: string, bytes: Uint8Array): Deck;
export declare function PresentationEditor(props: EditorProps): ReactElement;
export declare const slidesEditor: EditorDefinition;
export default slidesEditor;
