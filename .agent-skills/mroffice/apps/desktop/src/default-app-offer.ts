/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import fs from "node:fs";
import path from "node:path";

export interface DefaultAppChoice {
  /** "No thanks": never ask at launch again. */
  readonly declined: boolean;
}

interface OfferState {
  readonly supported: "direct" | "settings" | "none";
  readonly checked: boolean;
  readonly defaultFor: readonly string[];
  readonly extensions: readonly string[];
}

/** Ask when the system said which app opens each type, and one is not this one. */
export function shouldOfferDefaultApp(state: OfferState, choice: DefaultAppChoice): boolean {
  if (choice.declined || state.supported === "none" || !state.checked) return false;
  return state.extensions.some((ext) => !state.defaultFor.includes(ext));
}








export class LaunchOffer {
  private holder: number | null = null;
  private answered = false;

  /** Whether a page may be given the question now. */
  open(): boolean {
    return !this.answered && this.holder === null;
  }

  /** Gives the question to page ``id``; false when it is answered or held by another page. */
  take(id: number): boolean {
    if (!this.open()) return false;
    this.holder = id;
    return true;
  }

  /** The person answered (made it the default or said no): not asked again this run. */
  answer(): void {
    this.answered = true;
    this.holder = null;
  }

  /** Page ``id`` reloaded, went elsewhere or closed: unanswered, the question goes back. */
  release(id: number): void {
    if (this.holder === id && !this.answered) this.holder = null;
  }
}

export function readDefaultAppChoice(file: string): DefaultAppChoice {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { declined?: unknown };
    return { declined: parsed?.declined === true };
  } catch {
    return { declined: false };
  }
}

export function writeDefaultAppChoice(file: string, choice: DefaultAppChoice): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ declined: choice.declined, at: new Date().toISOString() }));
    fs.renameSync(temporary, file);
  } catch {
    // Not remembered: the question comes back at the next launch.
  }
}

/** The ProgID the installer registers for each offered type: `<prefix><kind>`
 * (electron-builder fileAssociations). */
export const WINDOWS_PROG_ID_KINDS: Readonly<Record<string, string>> = {
  docx: "Document",
  xlsx: "Workbook",
  pptx: "Presentation",
  pdf: "PDF",
  md: "Markdown",
  csv: "CSV",
};

/** The value of `reg query <key> /v ProgId` (or `/ve`), or null. */
export function parseRegValue(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+\S.*?\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return null;
}
