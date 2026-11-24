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

export type PlacedDeckText = any;
export const changedDeckTexts: any = inertFunction("cut#changedDeckTexts", "array");
export type changedDeckTexts = any;
export const deckTextAt: any = inertFunction("cut#deckTextAt", "null");
export type deckTextAt = any;
export const deckTextFormatted: any = inertFunction("cut#deckTextFormatted", "boolean");
export type deckTextFormatted = any;
export const deckTextIndex: any = inertFunction("cut#deckTextIndex", "unknown");
export type deckTextIndex = any;
export const deckTextKey: any = inertFunction("cut#deckTextKey", "string");
export type deckTextKey = any;
export const placeDeckText: any = inertFunction("cut#placeDeckText", "null");
export type placeDeckText = any;
export const placedTextEdit: any = inertFunction("cut#placedTextEdit", "unknown");
export type placedTextEdit = any;
export const withDeckText: any = inertFunction("cut#withDeckText", "unknown");
export type withDeckText = any;
