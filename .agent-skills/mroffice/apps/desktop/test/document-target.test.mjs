/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Where a document opened from the system goes while the app runs (src/document-target.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FocusOrder } = require("../dist/document-target.js");

const win = (name) => ({ name, focused: false, destroyed: false, isFocused() { return this.focused; }, isDestroyed() { return this.destroyed; } });

test("a document goes to the focused window, else the one used last, else a new one", () => {
  const order = new FocusOrder();
  assert.equal(order.target(), null);
  const first = win("first");
  const second = win("second");
  order.add(first);
  order.add(second);
  assert.equal(order.target(), second);
  order.focused(first);
  assert.equal(order.target(), first);
  second.focused = true;
  assert.equal(order.target(), second);
  second.focused = false;
  first.destroyed = true;
  assert.equal(order.target(), second);
  order.remove(second);
  assert.equal(order.target(), null);
});

test("a window never tracked (a page's scratch window, the splash) is never the target", () => {
  const order = new FocusOrder();
  const page = win("page");
  const scratch = win("scratch");
  order.add(page);
  order.focused(scratch);
  scratch.focused = true;
  assert.equal(order.target(), page);
});
