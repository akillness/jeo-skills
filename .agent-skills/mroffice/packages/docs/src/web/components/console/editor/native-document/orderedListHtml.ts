/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Standard HTML numbering the ordered list model states its own way.
 *
 * Pasted HTML says `<ol type="A" start="5">` and `<li value="5">`; the model
 * says `listStyleType` and a list that starts at a number. Both readings
 * here are input mappings only: nothing new is stored.
 */

import { DEFAULT_LIST_STYLE, type ListStyleType } from "@mrnote/core/web/components/console/editor/native-document/listNumbering.ts";

const TYPE_ATTRIBUTE: Readonly<Record<string, ListStyleType>> = {
  a: "lower-alpha",
  A: "upper-alpha",
  i: "lower-roman",
  I: "upper-roman",
};

const CSS_LIST_STYLE: Readonly<Record<string, ListStyleType>> = {
  "lower-alpha": "lower-alpha",
  "lower-latin": "lower-alpha",
  "upper-alpha": "upper-alpha",
  "upper-latin": "upper-alpha",
  "lower-roman": "lower-roman",
  "upper-roman": "upper-roman",
};



export function listStyleTypeFromHtml(element: HTMLElement): ListStyleType {
  const css = element.style?.listStyleType?.trim().toLowerCase() ?? "";
  if (css && CSS_LIST_STYLE[css]) return CSS_LIST_STYLE[css]!;
  const type = element.getAttribute("type") ?? "";
  return TYPE_ATTRIBUTE[type] ?? DEFAULT_LIST_STYLE;
}

function parsedOrdinal(value: string | null): number | null {
  if (value === null || !/^\s*-?\d{1,6}\s*$/.test(value)) return null;
  const ordinal = Number.parseInt(value, 10);
  return ordinal >= 0 ? ordinal : null;
}








export function splitOrderedListsAtItemValues(html: string): string {
  if (typeof DOMParser === "undefined" || !/<li[^>]*\svalue\s*=/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  const pending = Array.from(doc.body.querySelectorAll("ol"));
  while (pending.length > 0) {
    const list = pending.shift()!;
    let expected = parsedOrdinal(list.getAttribute("start")) ?? 1;
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      const value = parsedOrdinal(item.getAttribute("value"));
      if (item.hasAttribute("value")) {
        item.removeAttribute("value");
        changed = true;
      }
      if (value !== null && value !== expected) {
        if (index === 0) {
          list.setAttribute("start", String(value));
        } else {
          const rest = list.cloneNode(false) as HTMLOListElement;
          rest.setAttribute("start", String(value));
          rest.removeAttribute("id");
          let node: ChildNode | null = item;
          while (node) {
            const next: ChildNode | null = node.nextSibling;
            rest.appendChild(node);
            node = next;
          }
          list.after(rest);
          // The moved items carry their value still on later ones.
          item.setAttribute("value", String(value));
          pending.unshift(rest);
          break;
        }
        expected = value;
      }
      expected += 1;
    }
  }
  return changed ? doc.body.innerHTML : html;
}
