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

export const consumeAgentWriteExpectation: any = inertFunction("cut#consumeAgentWriteExpectation", "boolean");
export type consumeAgentWriteExpectation = any;
export const isAgentMotionActiveFor: any = inertFunction("cut#isAgentMotionActiveFor", "boolean");
export type isAgentMotionActiveFor = any;
export const isAgentWriteExpected: any = inertFunction("cut#isAgentWriteExpected", "boolean");
export type isAgentWriteExpected = any;
