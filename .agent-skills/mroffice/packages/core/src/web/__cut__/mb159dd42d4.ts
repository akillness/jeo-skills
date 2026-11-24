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

export const getAgentDraftPageState: any = inertFunction("cut#getAgentDraftPageState", "null");
export type getAgentDraftPageState = any;
export const useAgentDraftOpening: any = inertHook("cut#useAgentDraftOpening", "unknown");
export type useAgentDraftOpening = any;
export const useAgentDraftPageReadSync: any = inertHook("cut#useAgentDraftPageReadSync", "void");
export type useAgentDraftPageReadSync = any;
export const useAgentDraftPageState: any = inertHook("cut#useAgentDraftPageState", "null");
export type useAgentDraftPageState = any;
export const useAgentDraftRevealing: any = inertHook("cut#useAgentDraftRevealing", "boolean");
export type useAgentDraftRevealing = any;
