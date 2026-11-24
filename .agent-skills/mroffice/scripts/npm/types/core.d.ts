/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The public types of the npm package (scripts/npm/pack.mjs checks that they
// name every export of the built module).
import type { ComponentType, ReactNode } from "react";

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

export interface EditorHostFile {
  readonly name: string;
  readonly type: string;
  readonly data: Blob;
}

export interface EditorHost {
  /** Hands a file the editor produced (a download, an export) to the user. */
  saveFile(file: EditorHostFile): void | Promise<void>;
  /** A short message for the user (the editors' toasts go here too). */
  notify?(message: {
    title?: string;
    description?: string;
    tone?: "info" | "error";
    action?: { label: string; href: string };
    secondary?: { label: string; href: string };
  }): void;
}

/** Saves a file by downloading it (the default host). */
export declare const browserDownloadHost: EditorHost;
/** The host for code outside React. */
export declare function editorHost(): EditorHost;
export declare function useEditorHost(): EditorHost;
/** The interface languages the editors have text for ("en", "de", "zh", ...). */
export declare const EDITOR_LOCALES: string[];

/** Wraps the editors: the host they save through and the interface language.
 * It renders `fallback` until the interface text has loaded. */
export declare function EditorHostProvider(props: {
  host?: EditorHost;
  locale?: string;
  children: ReactNode;
  fallback?: ReactNode;
}): ReactNode;

export declare class HostFeatureUnavailableError extends Error {
  readonly code: "host_feature_unavailable";
  readonly feature: string;
  constructor(feature: string);
}

export declare const DESKTOP_DOWNLOAD_URL: string;
export declare const WEB_APP_URL: string;
/** Tells the user a feature is in the MR Office desktop app (through the host's notify). */
export declare function noteDesktopFeature(feature?: string): void;

export interface EditorsConfig {
  /** Where the files of the npm package mroffice-assets are served from (a URL or
   * a path on this site, ending in "/"). Default: jsDelivr's copy of the same version. */
  assetsBaseUrl?: string;
  /** The origin serving python-sandbox.html (from mroffice-assets), for running Python. */
  sandboxOrigin?: string;
}

/** The version of the packages (they are released together). */
export declare const MROFFICE_VERSION: string;
/** https://cdn.jsdelivr.net/npm/mroffice-assets@<version>/ */
export declare const DEFAULT_ASSETS_BASE_URL: string;
/** Configures the editors; call it before the editor modules load. */
export declare function configureEditors(config: EditorsConfig): void;
/** The base the assets are fetched from (absolute, ending in "/"). */
export declare function assetsBaseUrl(): string;
/** The URL of one file of mroffice-assets ("/pdf.worker.min.mjs" -> its URL). */
export declare function mrofficeAsset(path: string): string;
