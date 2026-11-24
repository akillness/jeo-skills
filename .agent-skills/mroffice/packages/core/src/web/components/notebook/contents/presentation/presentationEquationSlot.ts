"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The place an equation being written takes IN its line (PowerPoint's Insert
 * > Equation in a text box, and an equation among words reopened): while the
 * in-place field is open, the text box is drawn from a copy of its words
 * holding one equation run whose LaTeX is the session's `sentinel`, and the
 * run renderer (`PresentationRunsText`) draws that run as an empty slot the
 * field's size. The words lay out around it as they will around the
 * committed equation -- a centred line re-centres, a long one wraps -- and
 * the field is pinned over the slot, so it is always where the equation goes.
 * The copy is only drawn: the box's own words, and what it saves, are not
 * touched until the equation commits.
 */

import { createContext } from "react";

export interface PresentationEquationSlotValue {
  /** The LaTeX of the run drawn as the slot. */
  readonly sentinel: string;
  /** The open field's size, in the text's own px. */
  readonly width: number;
  readonly height: number;
}

export const PresentationEquationSlotContext = createContext<PresentationEquationSlotValue | null>(null);

/** The characters the slot's run stands for in the copy (one, never drawn). */
export const PRESENTATION_EQUATION_SLOT_TEXT = "⁠";

/** The attribute the slot carries, valued by its sentinel. */
export const PRESENTATION_EQUATION_SLOT_ATTRIBUTE = "data-presentation-equation-slot";

/** A session's sentinel LaTeX (never valid LaTeX, so no equation is ever one). */
export function presentationEquationSlotSentinel(key: number): string {
  return `\\mraiEquationSlot{${key}}`;
}

/** Whether `latex` is a session's slot sentinel (never an equation of its own). */
export function isPresentationEquationSlotSentinel(latex: string): boolean {
  return /^\\mraiEquationSlot\{\d+\}$/.test(latex);
}

/** The custom properties a field holding a slot sizes it by (the open field's size). */
export const PRESENTATION_EQUATION_SLOT_WIDTH_VAR = "--presentation-equation-slot-width";
export const PRESENTATION_EQUATION_SLOT_HEIGHT_VAR = "--presentation-equation-slot-height";
