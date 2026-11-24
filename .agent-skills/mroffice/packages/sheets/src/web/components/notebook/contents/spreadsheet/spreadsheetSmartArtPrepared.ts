/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The worksheet's half of "opening a file writes nothing"
 * (lib/office-smartart/prepared-conversion).
 *
 * A selected preserved diagram's conversion is placed on the sheet in this window
 * only: the sheet's `objects` array is swapped for one holding the conversion's
 * members, so every command, gesture and menu works on them as on any SmartArt.
 * That array stands, by identity, for the file's own one: a save reads through it
 * ({@link sheetsToPersist}), so a cell typed meanwhile saves the file's diagram,
 * and the drawing on screen stays the file's until a change is made.
 *
 * A writer that changes the objects makes a new array, which stands for nothing,
 * and the conversion goes out with that change; the history entry before it holds
 * the prepared array, so one Undo returns the file's diagram.
 * {@link sheetObjectsAfterPreparedCommit} tells that real edit from a commit that
 * left the conversion alone.
 */

import { readSpreadsheetNativeSmartArt } from "../../../../lib/spreadsheet/native-smartart";
import { spreadsheetSmartArtOwnDefinitionRef } from "../../../../lib/spreadsheet/smartart-own-definition";
import { nativeLayoutConvertsOnOpen, nativeLayoutToCatalogId } from "@mrnote/core/web/lib/office-smartart/native-layouts.ts";
import { smartArtConvertRefusal } from "@mrnote/core/web/lib/office-smartart/native-convert-model.ts";
import { readNativeSmartArtOutline } from "@mrnote/core/web/lib/office-smartart/native-outline-remote.ts";
import { smartArtMemberTextItem, type SmartArtMemberIdentity } from "@mrnote/core/web/lib/office-smartart/interaction-model.ts";
import {
  createSmartArtPreparations,
  type SmartArtPreparationAnswer,
} from "@mrnote/core/web/lib/office-smartart/prepared-conversion.ts";
import type { SpreadsheetObject } from "./spreadsheetSheetModel";

export interface PreparedSheetSmartArt {
  /** The file's own diagram, drawn until the conversion is really changed. */
  readonly native: SpreadsheetObject;
  /** The conversion's members, as the prepared array holds them. */
  readonly members: readonly SpreadsheetObject[];
  /** The array to save while the conversion is untouched. */
  readonly raw: readonly SpreadsheetObject[];
}

const PREPARED = new WeakMap<readonly SpreadsheetObject[], PreparedSheetSmartArt>();

export const sheetSmartArtPreparations = createSmartArtPreparations<SpreadsheetObject, readonly SpreadsheetObject[]>();

/**
 * A file's diagram that holds no cached drawing (Excel 2007 wrote empty ones):
 * the page holds only its frame, which paints nothing (`drawingless_frame_member`),
 * and Excel lays it out from its data as it opens the file. It is drawn as its
 * conversion, for display only, until its first real edit lands that conversion
 * (the deck's absent-cache scene, as the worksheet has it).
 */
export function sheetSmartArtDrawingless(object: SpreadsheetObject): boolean {
  if (object.type !== "smartart") return false;
  const members = (object as { members?: Array<{ drawingFrame?: unknown }> }).members;
  return Array.isArray(members) && members.length > 0 && members.every((member) => member?.drawingFrame === true);
}

/** A diagram of a layout MRAI owns: the kind its first real edit converts. */
export function sheetSmartArtConvertsOnEdit(object: SpreadsheetObject): boolean {
  const diagram = readSpreadsheetNativeSmartArt(object);
  return Boolean(
    diagram &&
      ((nativeLayoutConvertsOnOpen(diagram.layoutIdentity) && nativeLayoutToCatalogId(diagram.layoutIdentity)) ||
        // …or one with no drawing, laid out from the definition its own
        // workbook holds (SMARTART-GAP.md §8.6), as Excel lays it out on open.
        (sheetSmartArtDrawingless(object) && spreadsheetSmartArtOwnDefinitionRef(object) !== null)),
  );
}

/** The prepared diagram these objects hold, if they are a prepared array. */
export function preparedSheetSmartArt(
  objects: readonly SpreadsheetObject[] | undefined,
): PreparedSheetSmartArt | null {
  return objects ? PREPARED.get(objects) ?? null : null;
}

/** `sheets` as they are to be saved: a prepared array as the file's own. */
export function sheetsToPersist<Sheet extends { objects?: SpreadsheetObject[] }>(sheets: Sheet[]): Sheet[] {
  let replaced: Sheet[] | null = null;
  sheets.forEach((sheet, index) => {
    const prepared = preparedSheetSmartArt(sheet.objects);
    if (!prepared) return;
    replaced ??= [...sheets];
    replaced[index] = { ...sheet, objects: prepared.raw as SpreadsheetObject[] };
  });
  return replaced ?? sheets;
}

/** The objects with `native` replaced by its conversion, standing for `raw`. */
export function sheetObjectsWithPreparedSmartArt(
  raw: readonly SpreadsheetObject[],
  native: SpreadsheetObject,
  members: readonly SpreadsheetObject[],
): SpreadsheetObject[] {
  const prepared = raw.flatMap((entry) => (entry === native ? [...members] : [entry]));
  PREPARED.set(prepared, { native, members, raw });
  return prepared;
}

function sameObject(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The objects a commit really writes over a prepared array.
 *
 * `prepared` is the array the commit started from and `next` what it made. The
 * prepared array comes back when nothing changed; a new prepared array when what
 * changed lies elsewhere on the sheet; and `next` itself when the conversion was
 * really changed, which lets it out.
 */
export function sheetObjectsAfterPreparedCommit(
  prepared: readonly SpreadsheetObject[],
  next: readonly SpreadsheetObject[],
): readonly SpreadsheetObject[] {
  const held = preparedSheetSmartArt(prepared);
  if (!held || next === prepared) return next;
  const memberIds = new Set(held.members.map((member) => member.id));
  const members = next.filter((object) => memberIds.has(object.id));
  if (members.length !== held.members.length) return next;
  if (!members.every((member, index) => sameObject(member, held.members[index]))) return next;
  const rest = (objects: readonly SpreadsheetObject[]) => objects.filter((object) => !memberIds.has(object.id));
  const others = rest(next);
  const before = rest(prepared);
  const othersUnchanged = others.length === before.length && others.every((object, index) => sameObject(object, before[index]));
  if (othersUnchanged) return prepared;
  const at = new Map(before.map((object, index) => [object, others[index]]));
  const raw = held.raw.flatMap((object) => {
    if (object === held.native) return [held.native];
    const now = at.get(object);
    // Removed or added elsewhere on the sheet: the conversion goes out with it.
    return now ? [now] : [];
  });
  if (raw.length !== held.raw.length || others.length !== before.length) return next;
  PREPARED.set(next, { native: held.native, members, raw });
  return next;
}

/**
 * Words typed on the file's own drawing since its data part was read: the
 * conversion is read from that part, which holds the words before them, and must
 * not take them back.
 */
export async function sheetSmartArtMembersWithTypedWords(
  native: SpreadsheetObject,
  members: readonly SpreadsheetObject[],
): Promise<readonly SpreadsheetObject[]> {
  const diagram = readSpreadsheetNativeSmartArt(native);
  const outline = diagram ? await readNativeSmartArtOutline(diagram.dataXml).catch(() => null) : null;
  if (!diagram || !outline) return members;
  const placeOf = new Map(outline.map((item, index) => [item.id, index]));
  // The conversion's items have ids of their own, in the outline's order.
  const typed = new Map(
    diagram.points
      .filter((point) => placeOf.has(point.modelId) && outline[placeOf.get(point.modelId)!].text !== point.text)
      .map((point) => [placeOf.get(point.modelId)!, point.text]),
  );
  if (!typed.size) return members;
  return members.map((member) => {
    const hostsWords = smartArtMemberTextItem(member as unknown as SmartArtMemberIdentity) !== null;
    const index = (member as unknown as { smartArtItemIndex?: unknown }).smartArtItemIndex;
    const text = hostsWords && typeof index === "number" ? typed.get(index) : undefined;
    if (text === undefined || !member.shape) return member;
    return { ...member, shape: { ...member.shape, text } };
  });
}

export type SheetSmartArtAsk = (object: SpreadsheetObject) => Promise<readonly SpreadsheetObject[] | null>;

/** Ask for one selected diagram's conversion. Reads only. */
export function prepareSheetSmartArt(object: SpreadsheetObject, ask: SheetSmartArtAsk) {
  return sheetSmartArtPreparations.prepare(object, () => askSheetConversion(object, ask));
}

/** Ask again now: the author pressed something that needs the answer. */
export function retrySheetSmartArtPreparation(object: SpreadsheetObject, ask: SheetSmartArtAsk) {
  return sheetSmartArtPreparations.retry(object, () => askSheetConversion(object, ask));
}

async function askSheetConversion(
  object: SpreadsheetObject,
  ask: SheetSmartArtAsk,
): Promise<SmartArtPreparationAnswer<readonly SpreadsheetObject[]>> {
  const members = await ask(object);
  return members?.length ? { value: members } : { refusal: smartArtConvertRefusal() };
}
