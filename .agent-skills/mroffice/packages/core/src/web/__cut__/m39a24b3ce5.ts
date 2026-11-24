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

export const AI_MOTION_ATTRIBUTE: any = "data-ai-motion";
export type AI_MOTION_ATTRIBUTE = any;
export type AiBlockSnapshotSet = any;
export type AiMotionDirection = any;
export const playAiBlockTransition: any = inertFunction("cut#playAiBlockTransition", "unknown");
export type playAiBlockTransition = any;
export const prefersReducedMotion: any = inertFunction("cut#prefersReducedMotion", "boolean");
export type prefersReducedMotion = any;
export const readAiBlocks: any = inertFunction("cut#readAiBlocks", "array");
export type readAiBlocks = any;
export const snapshotAiBlocks: any = inertFunction("cut#snapshotAiBlocks", "null");
export type snapshotAiBlocks = any;
export const stageAiBlockTransition: any = inertFunction("cut#stageAiBlockTransition", "unknown");
export type stageAiBlockTransition = any;
