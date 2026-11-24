/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// This module (MR Note's AI) is part of MR Note, not of the open-source editors. This
// stand-in exports what the editors import from it and does nothing; a host
// that has the feature provides it through the host adapter instead.
/* eslint-disable */
import { inertClass, inertComponent, inertFunction, inertHook, inertValue } from "@mrnote/core/host/inert.ts";

export const AI_EDIT_TRANSIENT_SAVE_WINDOW_MS: any = 150_000;
export type AI_EDIT_TRANSIENT_SAVE_WINDOW_MS = any;
export const saveAiEditThroughTransientFailures: any = inertFunction("cut#saveAiEditThroughTransientFailures", "promise");
export type saveAiEditThroughTransientFailures = any;
