/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The public types of the npm package (scripts/npm/pack.mjs checks that they
// name every export of the built module).
import type { ReactElement } from "react";
import type { EditorDefinition, EditorProps } from "mroffice-core";

export declare const MRDOC_FORMAT: "mrnote.document";

/** A .mrdoc file: the editor's own document JSON. */
export interface MrDocFile {
  format: typeof MRDOC_FORMAT;
  version: 1;
  title: string;
  content: Record<string, unknown>;
}

/** A local file (.mrdoc, .html, .md, .txt) as the editor's document JSON. */
export declare function documentFromFile(name: string, bytes: Uint8Array): { title: string; content: Record<string, unknown> };
/** The bytes of a .mrdoc file. */
export declare function mrdocBytes(title: string, content: Record<string, unknown>): Uint8Array;
/** The document editor over one file; `extension` is what Save writes. */
export declare function DocumentEditor(props: EditorProps & { extension?: string; editorProps?: Record<string, unknown> }): ReactElement;
export declare const docsEditor: EditorDefinition;
export default docsEditor;
