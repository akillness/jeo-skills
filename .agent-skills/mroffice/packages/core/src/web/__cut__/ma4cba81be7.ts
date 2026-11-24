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

export type AgentDraftKind = any;
export const isFollowingAgentDraft: any = inertFunction("cut#isFollowingAgentDraft", "boolean");
export type isFollowingAgentDraft = any;
export const pendingDraftUnits: any = inertFunction("cut#pendingDraftUnits", "array");
export type pendingDraftUnits = any;
export const setFollowingAgentDraft: any = inertFunction("cut#setFollowingAgentDraft", "void");
export type setFollowingAgentDraft = any;
export const useAgentDraftProgress: any = inertHook("cut#useAgentDraftProgress", "null");
export type useAgentDraftProgress = any;
