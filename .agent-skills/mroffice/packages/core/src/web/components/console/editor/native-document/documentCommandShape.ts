/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The shape test of a native document command, apart from the command
// applier (documentCommands, which re-exports both): readers that only ask
// "is this a document command?" (the AI run card, the conversation) need
// not load the applier's Markdown, table, chart and PDF machinery.
import type { NativeDocumentCommand } from "./documentCommands";

export const MRNOTE_DOCUMENT_COMMAND_TYPE = "mrnote.document-command.v1";

export function isNativeDocumentCommand(
  value: unknown,
): value is NativeDocumentCommand {
  if (!value || typeof value !== "object") {
    return false;
  }
  const command = value as Partial<NativeDocumentCommand>;
  return (
    command.type === MRNOTE_DOCUMENT_COMMAND_TYPE &&
    Array.isArray(command.operations)
  );
}
