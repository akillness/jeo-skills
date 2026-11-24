/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word 97-2003 form fields (FORMTEXT, FORMCHECKBOX, FORMDROPDOWN) filled in,
 * as Word's "Filling in forms" restriction lets a reader do (w:edit="forms").
 *
 * A legacy form field reaches the page as a kept Word field (`documentField`,
 * NATIVE) whose preserved field carries its form data (`preservedField.form`,
 * the field's `w:ffData`, ECMA-376 17.16.17):
 * - a text field's words are its result runs (`preservedField.result`) and
 *   the field's `cachedValue`; `textInput/maxLength` bounds them;
 * - a check box's state is `checkBox/checked` (else its `default`);
 * - a drop-down shows the entry `ddList/result` names (0-based; absent, the
 *   first).
 * Filling changes exactly those, and the server takes a forms-restricted
 * page's save only when nothing else changed (`forms_fill_masked`).
 */

type FormItem = { n?: unknown; a?: { val?: unknown } | null; c?: unknown };
type FieldAttrs = Record<string, unknown>;

export type LegacyFormFieldKind = "text" | "checkBox" | "dropDown";

const KIND = /^\s*(FORMTEXT|FORMCHECKBOX|FORMDROPDOWN)\b/i;

export function legacyFormFieldKind(attrs: unknown): LegacyFormFieldKind | null {
  if (!attrs || typeof attrs !== "object") return null;
  const record = attrs as FieldAttrs;
  if (record.fieldType !== "NATIVE") return null;
  const match = KIND.exec(typeof record.instruction === "string" ? record.instruction : "");
  if (!match) return null;
  const word = match[1].toUpperCase();
  return word === "FORMTEXT" ? "text" : word === "FORMCHECKBOX" ? "checkBox" : "dropDown";
}

function preserved(attrs: FieldAttrs): Record<string, unknown> | null {
  const value = attrs.preservedField;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function formItems(attrs: FieldAttrs): FormItem[] {
  const form = preserved(attrs)?.form;
  return Array.isArray(form) ? (form as FormItem[]) : [];
}

function children(item: FormItem | undefined): FormItem[] {
  return Array.isArray(item?.c) ? (item!.c as FormItem[]) : [];
}

function value(item: FormItem | undefined): string | undefined {
  const raw = item?.a?.val;
  return typeof raw === "string" ? raw : undefined;
}

/** Whether the field may be filled at all (`w:enabled w:val="0"` locks it). */
export function legacyFormFieldEnabled(attrs: unknown): boolean {
  if (!attrs || typeof attrs !== "object") return false;
  const enabled = formItems(attrs as FieldAttrs).find((item) => item.n === "enabled");
  if (!enabled) return true;
  const raw = value(enabled);
  return raw === undefined || !["0", "false", "off"].includes(raw.toLowerCase());
}

/** A drop-down's entries, in order. */
export function legacyDropdownEntries(attrs: unknown): string[] {
  if (!attrs || typeof attrs !== "object") return [];
  const list = formItems(attrs as FieldAttrs).find((item) => item.n === "ddList");
  return children(list).filter((item) => item.n === "listEntry").map((item) => value(item) ?? "");
}

/** The entry a drop-down shows (`ddList/result`, else the first). */
export function legacyDropdownIndex(attrs: unknown): number {
  if (!attrs || typeof attrs !== "object") return 0;
  const list = formItems(attrs as FieldAttrs).find((item) => item.n === "ddList");
  const raw = value(children(list).find((item) => item.n === "result"));
  const index = raw === undefined ? 0 : Number(raw);
  const entries = legacyDropdownEntries(attrs).length;
  return Number.isInteger(index) && index >= 0 && index < Math.max(1, entries) ? index : 0;
}

/** What a drop-down shows: the entry its result names. */
export function legacyDropdownText(attrs: unknown): string {
  return legacyDropdownEntries(attrs)[legacyDropdownIndex(attrs)] ?? "";
}

/** A text field's maximum length (`textInput/maxLength`; 0 or absent: none). */
export function legacyTextMaxLength(attrs: unknown): number | null {
  if (!attrs || typeof attrs !== "object") return null;
  const input = formItems(attrs as FieldAttrs).find((item) => item.n === "textInput");
  const raw = Number(value(children(input).find((item) => item.n === "maxLength")));
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

/** Whether a check box is checked (`checked`, else `default`). */
export function legacyCheckBoxChecked(attrs: unknown): boolean {
  if (!attrs || typeof attrs !== "object") return false;
  const box = formItems(attrs as FieldAttrs).find((item) => item.n === "checkBox");
  const on = (name: string): boolean | null => {
    const item = children(box).find((entry) => entry.n === name);
    if (!item) return null;
    const raw = value(item);
    return raw === undefined || ["1", "true", "on"].includes(raw.toLowerCase());
  };
  return on("checked") ?? on("default") ?? false;
}

function withFormChild(attrs: FieldAttrs, holder: string, name: string, val: string, after: readonly string[]): FieldAttrs {
  const keep = preserved(attrs) ?? {};
  const form = formItems(attrs).map((item) => {
    if (item.n !== holder) return item;
    const list = children(item).filter((child) => child.n !== name);
    let at = 0;
    list.forEach((child, index) => {
      if (typeof child.n === "string" && after.includes(child.n)) at = index + 1;
    });
    list.splice(at, 0, { n: name, a: { val } });
    return { ...item, c: list };
  });
  return { ...attrs, preservedField: { ...keep, form } };
}

/** The field with its check box checked or cleared. */
export function withLegacyCheckBox(attrs: FieldAttrs, checked: boolean): FieldAttrs {
  return withFormChild(attrs, "checkBox", "checked", checked ? "1" : "0", ["size", "sizeAuto", "default"]);
}

/** The field showing entry `index` of its drop-down. */
export function withLegacyDropdown(attrs: FieldAttrs, index: number): FieldAttrs {
  return withFormChild(attrs, "ddList", "result", String(index), []);
}

/** The text field holding `text` as its result, in its result's formatting. */
export function withLegacyText(attrs: FieldAttrs, text: string): FieldAttrs {
  const keep = preserved(attrs) ?? {};
  const result = Array.isArray(keep.result) ? (keep.result as Record<string, unknown>[]) : [];
  const style = result[0]?.style ?? (attrs.runStyle as unknown) ?? undefined;
  const nextResult = text ? [{ text, ...(style ? { style } : {}) }] : [];
  return { ...attrs, cachedValue: text, preservedField: { ...keep, result: nextResult } };
}

/** The attrs with what filling a form field changes taken out. */
function fillMasked(attrs: FieldAttrs): unknown {
  const keep = preserved(attrs);
  const out: FieldAttrs = { ...attrs };
  delete out.cachedValue;
  delete out.runStyle;
  if (keep) {
    const form = formItems(attrs).map((item) =>
      item.n === "checkBox" || item.n === "ddList"
        ? { ...item, c: children(item).filter((child) => child.n !== "checked" && child.n !== "result") }
        : item,
    );
    const rest: Record<string, unknown> = { ...keep, form };
    delete rest.result;
    out.preservedField = rest;
  }
  return out;
}

/** Whether `after` is `before` with nothing changed but what filling it in
 * changes (the server's `forms_fill_masked`, field by field). */
export function legacyFormFieldFillOnly(before: unknown, after: unknown): boolean {
  if (!legacyFormFieldKind(before) || !legacyFormFieldKind(after)) return false;
  return JSON.stringify(fillMasked(before as FieldAttrs)) === JSON.stringify(fillMasked(after as FieldAttrs));
}
