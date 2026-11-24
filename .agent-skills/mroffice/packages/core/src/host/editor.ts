/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// What every editor package exports: which files it opens, a new empty one,
// and the component that edits one.
import type { ComponentType } from "react";

/** A file as the host holds it: its name and its bytes. */
export interface LocalFile {
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** What an editor gives back to be saved: the file's new name and bytes. */
export interface SavedFile {
  readonly name: string;
  readonly type: string;
  readonly bytes: Uint8Array | Blob;
}

export interface EditorProps {
  readonly file: LocalFile;
  /** The editor hands the host a function that writes the current state. */
  readonly registerSave: (save: () => Promise<SavedFile> | SavedFile) => () => void;
  /** Called on the editor's own Save gesture (ribbon Save, Ctrl/Cmd+S). */
  readonly onSaveRequest: () => void;
  readonly onDirty?: () => void;
}

export interface EditorFeature {
  readonly name: string;
  readonly available: boolean;
  readonly note?: string;
}

export interface EditorDefinition {
  readonly id: "code" | "pdf" | "docs" | "sheets" | "slides";
  readonly label: string;
  /** Extensions (lower case, with the dot) this editor opens. */
  readonly extensions: readonly string[];
  readonly accept?: string;
  /** A new, empty file of this kind. */
  readonly newFile?: () => { name: string; bytes: Uint8Array };
  readonly Component: ComponentType<EditorProps>;
}
