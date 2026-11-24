/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The public types of the npm package (scripts/npm/pack.mjs checks that they
// name every export of the built module).
import type { ReactElement } from "react";
import type { EditorDefinition, EditorProps } from "mroffice-core";

export declare function PdfEditor(props: EditorProps): ReactElement;
export declare const pdfEditor: EditorDefinition;
export default pdfEditor;
