/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export { EditorHostProvider, EDITOR_LOCALES, browserDownloadHost, editorHost, useEditorHost, type EditorHost, type EditorHostFile } from "./host/host";
export { HostFeatureUnavailableError } from "./host/inert";
export { DESKTOP_DOWNLOAD_URL, WEB_APP_URL, noteDesktopFeature } from "./host/desktop-app";
export type { EditorDefinition, EditorFeature, EditorProps, LocalFile, SavedFile } from "./host/editor";
