/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The public types of the npm package (scripts/npm/pack.mjs checks that they
// name every export of the built module).
import type { ReactElement } from "react";
import type { EditorDefinition, EditorProps } from "mroffice-core";

/** The editor's language for a file name ("hello.py" -> "python"). */
export declare function languageForFile(name: string): string;
export declare function CodeEditor(props: EditorProps): ReactElement;
/** The extensions the code editor opens. */
export declare const CODE_EXTENSIONS: string[];
export declare const codeEditor: EditorDefinition;
export default codeEditor;
