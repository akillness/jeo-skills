/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Strokes of ink at rest: the float pass does not measure them again.
 *
 * The pass runs after every view update and measured every floating shape in
 * the document, and every stroke of a handwritten page is one: 2,722 boxes
 * read per pen landing and per caret move, the page getting slower to write
 * on as it filled up (a real note: a stroke's next frame 26 ms at 300 strokes,
 * 190 ms at 2,722, in WebKit). A stroke out of the flow takes no room, so what
 * places it is the stroke's own element, its sheet's geometry and place in its
 * column, and the sheet's in-flow content. While none of those changed, it
 * stands where the last pass put it, and strokes coming and going beside it
 * change nothing of the kind.
 *
 * Layout can change with no mutation to see (a picture arriving): the pass
 * looks at everything once more when the writing pauses (`sweep`).
 */
import { isDocumentLayoutStatusAttribute } from "../documentLayoutStatus";
import { inkLayerMutation } from "./inkSheetLayer";
import { SHEET_STAMPS, sameLayoutClasses } from "./sheetMeasureMemo";

const SHEET_SELECTOR = "article[data-page-sheet]";
const STROKE_SELECTOR = 'figure[data-ink-tool][data-float-mode="overlay"]';
/** Attributes that decide whether a stroke is out of the flow at all. */
const FLOW_DECIDING_ATTRIBUTES = new Set(["data-ink-tool", "data-float-mode"]);

function isStroke(node: Node): boolean {
  return node.nodeType === 1 && (node as Element).matches(STROKE_SELECTOR);
}

export class InkAtRest {
  /** What each sheet stood at when its strokes were last all measured. */
  private settled = new WeakMap<Element, string>();
  /** Strokes of their own changed since the last pass. */
  private readonly changed = new Set<Element>();
  /** Strokes a pass left unmeasured because their sheet sleeps: measured by
   * the first pass after it wakes (`endPass` keeps them changed). */
  private readonly deferred = new Set<Element>();
  private observer: MutationObserver | null = null;
  private sweeping = false;

  constructor(private readonly root: HTMLElement) {
    const Observer = root.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    this.observer = new Observer((records) => this.record(records));
    this.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
  }

  /** The next pass measures every stroke of every sheet that is not asleep. */
  sweep(): void {
    this.sweeping = true;
  }

  /** Before a pass reads anything. */
  beginPass(): void {
    const records = this.observer?.takeRecords();
    if (records?.length) this.record(records);
  }

  /** Whether `stroke`, out of the flow on `sheet`, stands as it stood.
   * `standing` is the sheet's geometry and its place in its column (below a
   * whole pixel: what snaps a stroke to the pixel grid). */
  atRest(stroke: Element, sheet: Element, standing: string, asleep: boolean): boolean {
    if (this.settled.get(sheet) !== standing || this.changed.has(stroke)) return false;
    return !this.sweeping || asleep;
  }

  /** Whether a pass has measured `sheet`'s strokes as they stand: none of
   * them changed since, and the sheet was not forgotten (an edit in it, or
   * asleep at the last pass). */
  sheetSettled(sheet: Element): boolean {
    this.beginPass();
    if (!this.settled.has(sheet)) return false;
    for (const stroke of this.changed) if (stroke.parentElement === sheet) return false;
    return true;
  }

  /** Whether a pass may leave `stroke` unmeasured: its sheet sleeps (out of
   * the render tree; asking where anything in it stands wakes it, which laid
   * the whole sheet out again and put it back to sleep at the next pause, a
   * cycle per pause on a long handwritten note). It is measured by the first
   * pass after its sheet wakes. */
  deferAsleep(stroke: Element, sheet: Element): void {
    this.deferred.add(stroke);
    this.settled.delete(sheet);
  }

  /** After a pass that finished: these sheets' strokes are measured. A pass
   * that threw never gets here, and the next one looks again. */
  endPass(standings: ReadonlyMap<Element, string>): void {
    for (const [sheet, standing] of standings) this.settled.set(sheet, standing);
    this.changed.clear();
    for (const stroke of this.deferred) this.changed.add(stroke);
    this.deferred.clear();
    this.sweeping = false;
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private forgetSheetOf(node: Node): void {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const sheet = element?.closest(SHEET_SELECTOR);
    if (sheet) this.settled.delete(sheet);
  }

  private record(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (inkLayerMutation(record)) continue;
      const target = record.target;
      if (record.type === "attributes") {
        const element = target as Element;
        const name = record.attributeName ?? "";
        if (element.getAttribute(name) === record.oldValue) continue;
        if (element === this.root) {
          if (isDocumentLayoutStatusAttribute(name) && name !== "data-document-display-fonts") continue;
          if (name === "contenteditable" || name === "tabindex") continue;
          // The editor taking focus at the first stroke is no layout.
          if (name === "class" && sameLayoutClasses(record.oldValue, element.getAttribute("class"))) continue;
          this.settled = new WeakMap();
          continue;
        }
        if (element.parentElement === this.root && SHEET_STAMPS.has(name)) continue;
        if (FLOW_DECIDING_ATTRIBUTES.has(name)) {
          this.forgetSheetOf(element);
          continue;
        }
      }
      if (target === this.root) {
        // A sheet came or went: the ones after it moved, which their
        // standing shows. A new sheet has none yet.
        continue;
      }
      const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
      const stroke = element?.closest(STROKE_SELECTOR) ?? null;
      if (stroke) {
        this.changed.add(stroke);
        continue;
      }
      if (record.type === "childList") {
        const added = Array.from(record.addedNodes);
        if (added.every(isStroke) && Array.from(record.removedNodes).every(isStroke)) {
          for (const node of added) this.changed.add(node as Element);
          continue;
        }
      }
      this.forgetSheetOf(target);
    }
  }
}
