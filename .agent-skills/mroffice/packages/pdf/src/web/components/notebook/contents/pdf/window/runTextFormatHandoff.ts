/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import type { PdfNativeListTextEditorController } from "../PdfNativeListTextEditDialog";
import { withKeysAfterTyped } from "../../../../../lib/pdf/carried-text-edit";
import { PDF_NATIVE_TEXT_EDITABLE_ATTR } from "../viewer/nativeTextDom";
import {
  pageTextFormatActionControl,
  pageTextFormatActions,
  pageTextFormatLanded,
  pageTextFormatSpan,
  typedFormatActions,
  type PdfPageTextFormatHandoff,
} from "./textFormatHandoff";

 
export type PageTextFormatHandoffEnv = Readonly<{
  /** The window's root (its reader's pages are under it). */
  root: () => HTMLElement | null;
  /** The reader shows `page` (0-based) painted from a verified source. */
  pageReady: (page: number) => boolean;
  /** The open line's editor (the dialog's controller), if any. */
  controller: () => PdfNativeListTextEditorController | null;
  /** The page as last saved. */
  savedPage: () => Pick<PageItem, "content_version" | "content_json"> | null;
  translate: (key: string) => string;
  toast: (options: { title: string; variant: "destructive" }) => void;
  /** The window is gone: nothing more is done, nothing more is said. */
  cancelled: () => boolean;
  trace?: (stage: string, detail?: unknown) => void;
  timing?: Partial<Readonly<{
    pollMs: number; settleMs: number; waitMs: number; editableMs: number; landedMs: number; proofMs: number;
  }>>;
}>;

/**
 * Run a format on a line of the page's own text the way a reader does it:
 * find the line's span by where it stands, open it as a click does, press
 * the ribbon buttons through the editor's controller and finish the line.
 * The Insert tab hands its format on page text over this way; so does an AI
 * window format (option C), which reports through `pending.settle`: done
 * only once the page save carrying the line has landed, else the editor's
 * own reason, the line left unwritten. Anything that cannot be done is said
 * (the notice the Insert tab gave before), never a silent drop.
 */
async function pressTypedFormat(
  typedFormat: NonNullable<PdfPageTextFormatHandoff["typedFormat"]>,
  live: () => PdfNativeListTextEditorController | null,
  until: <T>(read: () => T | null | undefined, ms: number) => Promise<T | null>,
  waitMs: number,
  trace: (stage: string, detail?: unknown) => void,
): Promise<void> {
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  // The words' own format is read once the line has taken them, and
  // pressed once the line's format is proven: pressed before, a size sends
  
  // below, V1-T04).
  const format = await until(() => {
    const current = live()?.readFormat();
    return current && current.fontSize != null && current.proven !== false ? current : null;
  }, Math.min(waitMs, 15_000));
  const actions = format ? typedFormatActions(typedFormat, format) : [];
  trace("typed-format", { typedFormat, actions });
  if (!actions.length) return;
  await tick();
  if (!live()?.selectLastTyped?.("range")) return;
  await tick();
  for (const action of actions) {
    await until(() => live()?.applyRibbonAction(action) || null, Math.min(waitMs, 3_000));
    await tick();
  }
  live()?.selectLastTyped?.("after");
}

export async function runPageTextFormatHandoff(
  pending: PdfPageTextFormatHandoff,
  env: PageTextFormatHandoffEnv,
): Promise<void> {
  // The keys kept for a typed line go back to the page however it ends.
  try {
    await runHandoff(pending, env);
  } finally {
    pending.keys?.dispose();
  }
}

async function runHandoff(
  pending: PdfPageTextFormatHandoff,
  env: PageTextFormatHandoffEnv,
): Promise<void> {
  const pollMs = env.timing?.pollMs ?? 100;
  const waitMs = env.timing?.waitMs ?? 20_000;
  const trace = env.trace ?? (() => undefined);
  const cancelledNow = env.cancelled;
  const t = env.translate;
  let reported = false;
  const report = (reason: string | null) => {
    if (reported || !pending.settle) return;
    reported = true;
    pending.settle(reason === null ? { ok: true } : {
      ok: false,
      reason: reason || t("pdf.pageWindow.pageTextFormatNotWritten"),
    });
  };
  const notKept = (reason?: string | null) => {
    report(reason ?? (cancelledNow() ? t("pdf.pageWindow.aiFormatWindowClosed") : null) ?? "");
    if (cancelledNow()) return;
    env.toast({ title: reason || t("pdf.pageWindow.pageTextFormatNotWritten"), variant: "destructive" });
  };
  // The page as it was saved before the line was opened: the line's save
  // is a newer one.
  const savedBefore = env.savedPage();
  const until = async <T,>(read: () => T | null | undefined, ms: number): Promise<T | null> => {
    const end = performance.now() + ms;
    while (!cancelledNow() && performance.now() < end) {
      const value = read();
      if (value) return value;
      await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    }
    return null;
  };
  trace("handoff", { bold: pending.bold, italic: pending.italic, color: pending.color, fontSize: pending.fontSize,
    request: pending.request });
  // Open the line only once the reader has settled on the page: its canvas
  // painted and its source verified. A line opened earlier kept its editor
  // in the "previewing" state (its ribbon greyed, no size) or lost it to the
  // reader's own reload (walk r17), and no command could run.
  
  // the waits end early when the window closes, so they can be long.
  const settled = await until(() => env.pageReady(pending.page) || null, env.timing?.settleMs ?? 600_000);
  trace("settled", Boolean(settled));
  await new Promise<void>((resolve) => setTimeout(resolve, env.timing?.settleMs === undefined ? 1000 : 0));
  // The line's span, once the reader takes a click on it: its box marked
  // editable. Painted and verified is not yet that -- while the window's
  // write authority and the page's text layer settle the boxes are
  // "pending" (or read-only), and a click then is only kept behind the
  // rebuild and dropped after 12 s: the line never opened in a window just
  
  const editableSpan = () => {
    const found = pageTextFormatSpan(env.root(), pending);
    return found?.getAttribute(PDF_NATIVE_TEXT_EDITABLE_ATTR) === "true" ? found : null;
  };
  const span = await until(editableSpan, env.timing?.editableMs ?? 600_000);
  const seen = span ?? pageTextFormatSpan(env.root(), pending);
  trace("span", span ? span.textContent?.slice(0, 40) : {
    spans: env.root()?.querySelectorAll('span[data-pdf-native-text-edit-box="true"]').length ?? 0,
    page: Boolean(env.root()?.querySelector(`.pdf-viewer__page[data-page-number="${pending.page + 1}"]`)),
    editable: seen?.getAttribute(PDF_NATIVE_TEXT_EDITABLE_ATTR) ?? null,
  });
  if (!span) {
    // The box the reader shows refused says why, in its own words.
    const refused = seen?.getAttribute(PDF_NATIVE_TEXT_EDITABLE_ATTR) === "false" ? seen.getAttribute("title") : null;
    notKept(pending.settle ? refused || t("pdf.pageWindow.aiFormatLineNotFound") : null);
    return;
  }
  const live = env.controller;
  const openLine = (target: HTMLElement) => {
    const box = target.getBoundingClientRect();
    const point = { bubbles: true, cancelable: true, button: 0, buttons: 1,
      clientX: box.left + Math.min(8, box.width / 2), clientY: box.top + box.height / 2 };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...point, pointerType: "mouse", isPrimary: true }));
    target.dispatchEvent(new MouseEvent("mousedown", point));
    target.dispatchEvent(new PointerEvent("pointerup", { ...point, buttons: 0, pointerType: "mouse", isPrimary: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { ...point, buttons: 0 }));
    target.dispatchEvent(new MouseEvent("click", { ...point, buttons: 0 }));
  };
  // Text typed into the Insert tab's box: the opened line takes it where it
  // was typed, at once (its proof is not waited for: typing is taken while
  // it runs), and stays open with its caret after it for the next key.
  // The keys typed meanwhile go in after it, in the same step.
  if (pending.typed) {
    const typed = pending.typed;
    try {
      openLine(span);
      const carried = (await until(live, waitMs))
        ? await until(() => live()?.typeText?.(withKeysAfterTyped(typed, pending.keys?.read() ?? "")) || null, waitMs)
        : null;
      trace("typed", Boolean(carried));
      if (!carried) notKept();
      // Formats held at the caret where they were typed go on those words.
      else if (pending.typedFormat) await pressTypedFormat(pending.typedFormat, live, until, waitMs, trace);
    } finally {
      pending.keys?.dispose();
    }
    return;
  }
  // Open the line, then wait for its editor and its proved size (the
  // ribbon's); the editor is read afresh at every step. An editor that
  // closes before it proves the line (the reader reloading under it) is
  // opened once more.
  let proved: PdfNativeListTextEditorController | null = null;
  for (let attempt = 0; attempt < 2 && !proved; attempt += 1) {
    const target = attempt === 0 ? span : await until(editableSpan, waitMs);
    if (!target) break;
    openLine(target);
    if (!(await until(live, waitMs))) { trace("controller", false); continue; }
    proved = await until(() => {
      const current = live();
      return current && current.readFormat().fontSize != null ? current : null;
    }, waitMs);
    if (!proved && live()) break;
    trace("reopen", attempt);
  }
  // A reader opens the line, looks and then presses: by then the line's own
  // format (its run or its group of runs) is proven and a size is set in
  // place. Pressed at once, the AI's size came before that proof and sent the
  
  
  // is never proven is pressed after the wait, as before.
  if (proved && pending.settle) {
    const proven = await until(() => (live()?.readFormat().proven !== false ? live() : null),
      env.timing?.proofMs ?? 10_000);
    trace("proven", Boolean(proven));
  }
  const format = (proved ?? live())?.readFormat();
  trace("controller", format);
  if (!format) { notKept(); return; }
  // The editor that opened is this line's: its text is the line's.
  const opened = live()?.readDraft().replacementText ?? "";
  if (pending.settle && opened.replace(/\s+/gu, "") !== pending.text.replace(/\s+/gu, "")) {
    trace("other-line", opened.slice(0, 40));
    live()?.discard?.();
    notKept(t("pdf.pageWindow.aiFormatLineNotFound"));
    return;
  }
  const first = pageTextFormatActions(pending, format);
  // The AI's width for the line's frame (pdf.text.rewrap_original): its side
  // handle dragged there once the buttons are pressed.
  const frameWidth = pending.request?.frameWidth;
  trace("actions", { first, frameWidth });
  const unproven = () => (live()?.readFormat().fontSize ?? null) === null;
  // An AI format that cannot be completed throws its draft away: Leave
  // finishes a dirty draft as Escape does, which would write the buttons
  // already pressed (the size without the bold).
  const discard = () => live()?.discard?.();
  if (pending.settle) {
    // Every button asked for must be one this line takes, before any is
    // pressed: a half-made format is never written. The reason is the
    // button's own (its disabled reason in the ribbon).
    for (const action of first) {
      const control = pageTextFormatActionControl(action);
      const refusal = control ? live()?.readRefusal?.(control) ?? null : null;
      if (refusal) {
        trace("unavailable", action);
        discard();
        notKept(refusal);
        return;
      }
    }
    if (!first.length && frameWidth === undefined) {
      // The line already shows what was asked: nothing is written. Read
      // before the draft goes: with the editor closed every line read as
      // unproven, and a 12 pt line asked for 12 pt was "a format that cannot
      // be read" instead of already set (live, 07-en-manual-figures footer).
      const reason = t(unproven() ? "pdf.nativeTextEdit.propertiesUnproven" : "pdf.pageWindow.aiFormatAlreadySet");
      discard();
      notKept(reason);
      return;
    }
  }
  // A press takes effect at the editor's next render. The next press, or the
  // finish, made before it ran on the draft as it was: the finish found the
  // draft changed under it and gave up, the line unwritten (「SHIJINGSHAN」
  
  // it (a while at most: a size the line clamps never shows as asked).
  let shown = format;
  const pressed = (action: (typeof first)[number], now: NonNullable<typeof format>) =>
    action.type === "fontSize" ? now.fontSize !== null && Math.abs(now.fontSize - action.value) < 0.01
      : action.type === "fontSizeStep" ? now.fontSize !== shown.fontSize
      : action.type === "toggle" && action.control === "bold" ? now.bold !== shown.bold
      : action.type === "toggle" && action.control === "italic" ? now.italic !== shown.italic
      : true;
  for (const action of first) {
    const taken = await until(() => live()?.applyRibbonAction(action) || null, waitMs);
    if (!taken) {
      trace("refused", action);
      if (cancelledNow()) { report(t("pdf.pageWindow.aiFormatWindowClosed")); return; }
      const control = pageTextFormatActionControl(action);
      const refusal = (control ? live()?.readRefusal?.(control) : null) ??
        t(unproven() ? "pdf.nativeTextEdit.propertiesUnproven" : "pdf.pageWindow.pageTextFormatNotWritten");
      // An AI format is all or nothing: the buttons already pressed are
      // thrown away with the draft, the line left unwritten.
      if (pending.settle) discard();
      report(refusal);
      env.toast({ title: refusal, variant: "destructive" });
      return;
    }
    const now = await until(() => {
      const current = live()?.readFormat();
      return current && pressed(action, current) ? current : null;
    }, Math.min(waitMs, 3_000));
    trace("pressed", { action, shown: Boolean(now) });
    shown = now ?? live()?.readFormat() ?? shown;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (frameWidth !== undefined) {
    // The frame's side handle dragged to the width, as a reader drags it:
    // the paragraph set again in it, or the line taken into the text-box
    
    const resized = live()?.resizeWidth?.(frameWidth) ?? "refused";
    trace("resize", resized);
    if (resized === "unchanged" && !first.length) {
      // The frame already has that width: as for a format the line shows.
      discard();
      notKept(t("pdf.pageWindow.aiFormatAlreadySet"));
      return;
    }
    if (resized === "refused") {
      const refusal = live()?.readRefusal?.() ?? t("pdf.pageWindow.pageTextFormatNotWritten");
      if (pending.settle) discard();
      notKept(refusal);
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const editor = live();
  if (!editor) { notKept(); return; }
  if (!first.length && frameWidth === undefined) {
    // Nothing differs from what the ribbon shows. A line whose properties
    // are unproved shows no real format, so that is no proof the change is
    // already there: say why it is not taken.
    if (unproven() && !cancelledNow()) {
      env.toast({ title: t("pdf.nativeTextEdit.propertiesUnproven"), variant: "destructive" });
    }
    void editor.finish();
    return;
  }
  const finished = await editor.finish();
  trace("finish", finished);
  if (!finished) {
    // The dialog's own sentence for this draft, then the line is left as
    // it was (nothing of it was written).
    const refusal = pending.settle ? editor.readRefusal?.() ?? null : null;
    if (pending.settle) editor.discard?.();
    notKept(refusal);
    return;
  }
  if (!pending.settle) return;
  // Done only once the page save carrying the line has landed: the saved
  // page holds the line's box and its V5 record, or its native write.
  const landed = await until(
    () => pageTextFormatLanded(env.savedPage(), savedBefore, pending) || null,
    env.timing?.landedMs ?? 300_000,
  );
  trace("landed", Boolean(landed));
  if (landed) report(null);
  else notKept(t(cancelledNow() ? "pdf.pageWindow.aiFormatWindowClosed" : "pdf.pageWindow.aiFormatNotSaved"));
}
