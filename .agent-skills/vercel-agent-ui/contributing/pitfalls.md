# Pitfalls

Things that cost real debugging time. Read them before you write core or adapter code, and add one when something bites.

## Frameworks

- **React StrictMode** attaches, detaches and reattaches refs, and creates and discards a `useState` instance. Never `hidePopover()` on unbind while the component is still mounted: the browser sends focus back to the trigger. Attach controllers in `setOptions`, not at creation.
- **React context doesn't re-render parts.** `usePrimitive`'s value is stable. A part renders through `usePart`, which re-renders it only for the attributes and state it read; anything else that reads the instance goes stale.
- **React event props must pass `event.nativeEvent`,** and core handlers must use `ctx.el`.
- **Arrays in part state re-render React parts on every change** unless they're stable. Keep label arrays stable, or compare shallowly.
- **Vue optional booleans default to `false`** unless declared `{ type: Boolean, default: undefined }` (`optionalBoolean`).
- **Vue's `mergeProps` keeps only the last `ref`.** `slot()` combines a ref passed in with its own; keep it that way when parts compose.
- **Vue re-renders per part.** `slot()`, `present()` and a part's state share one watcher per part, so a change re-renders only the parts it affects. Reads of `instance.api` aren't tracked, so use them only where nothing should re-render.
- **Vue binds refs before the app is in the document,** and before parents are attached. `showPopover()` and measuring throw or return zeros on a disconnected element, and `<fieldset>` lookups miss: defer until `isConnected`.
- **Vue registers parts before inserting them,** so DOM order isn't known at registration. Sort at use time.
- **Vue refs on components give instances,** so `slot()` unwraps `$el` through a cached wrapper. A new wrapper each render makes Vue detach and reattach the element.
- **Vue mounts a moved part's new component before it unmounts the old one,** so each component gets its own ref for a part, and a `null` lets go only of the element that component handed over.
- **TypeScript 7 breaks `vue-tsc`.** The catalog stays on TypeScript 5.9.
- **Svelte runs `onclick` written in markup from its root listener,** after any listener on the element, so a handler on a `render` snippet's element runs after the built-in one and can't cancel it. Handlers go on the component, where they run first.
- **Solid and Svelte can't read composed children before they render,** so a composed Select shows its value key in server HTML until mount.

## Web components

- **Custom elements give elements without `value` an automatic id.** Look singleton slots up with `element(slot)` and no key, and keyless parts with `elements(slot)`.
- **A `context` that returns `id` keys the part;** the adapter only falls back to `autoId` when neither `value` nor `id` is set.
- **Events don't bubble.** A listener on an owner hears its items' events with `{ capture: true }`. Root callbacks that items already report are listed in `silent` on the owner, or it fires a second event of the same name for the same change.
- **`hidden` belongs to whoever controls visibility.** A part the primitive shows and hides owns its `hidden`, so one the server wrote goes when it shows. On any other part an author's `hidden` stays, and `applyAttrs` removes only attributes it wrote. Never remove an attribute you didn't write.
- **Parts upgrade in any order.** Owners batch registrations into one microtask and bind in DOM order, so a trigger binds before a default-open popup. Moving a popup to a portal disconnects and reconnects it and every child in one task, so teardown waits a microtask and checks `isConnected`.
- **Custom elements display inline.** `display` in `createParts`/`definePart` adds a zero-specificity `:where()` default, so any class wins. Never default popups to `display: block`: author styles beat the browser's `[popover]` and `[hidden]` rules.
- **Wrapper elements between items** (like `ui-menu-sub`) need `role="none"` and `display: contents`, or position and set size are wrong for screen readers. Only the virtual screen reader spec caught this.
- **Write final attributes when a part stops being present,** before unbinding, or content closed without an animation keeps `data-open`. Only do it for parts that were shown, or never-opened submenus gain `role="menu"`.
- **Element parts whose cleanup writes state** can re-sync themselves forever. Bind and unbind in `define-element.ts` are guarded against it; keep it that way.
- **Hidden parts still count in `textContent`.** `textOf()` skips `[hidden]`; use it for labels.

## Core and the DOM

- **Never hide content with `visibility: hidden` while positioning.** Hidden elements can't take focus. Positioning settles in microtasks before paint anyway.
- **Never put `popover` in `attrs`.** The browser hides `[popover]:not(:popover-open)`, so server-rendered open content stays invisible until JavaScript runs. `createPopup` sets it in `bind`.
- **Initial focus** runs in a `queueMicrotask` after the popup binds, because items bind in the same commit. Focus after a pointer open runs in `requestAnimationFrame`, so the browser's own mousedown focus doesn't undo it. Any delayed focus must check the component is still open.
- **Nested popups are DOM descendants of their parent.** Key events bubble through the parent, so handlers check that the closest popup is their own, and specs locate popups by name.
- **Collections read on every key or hover** keep a cached order with `createOrder()` from `kernel/order.ts`. `elements()` sorts on each call, so don't call it per key.
- **Typeahead** reads text through `textOf(el)`, which skips `aria-hidden` text such as shortcuts. Space continues a search only while it still matches.
- **Popup positioning sleeps.** Something that moves an anchor without scroll, resize, DOM changes, input, loads or an animation starting follows within 500 ms, not the next frame.
- **Page styles go through `writeStyle`** (`platform/style.ts`), never a `<style>` of their own, which a strict Content Security Policy blocks. Adopted sheets come after the document's, so `@layer ui-sdk` in one is declared after the page's layers and beats them: `writeStyle` adopts a sheet only when the page's `csp-nonce` meta tag has no nonce, and otherwise writes a `<style>` first in the head, with the tag's nonce.
- **Global side effects** (scroll lock, inert) are reference-counted, use idempotent releases, and restore only what they set, property by property. Another library may change the same element while a lock is held.
- **Kept elements must not hide their own subtree.** `inertOutside` skips targets inside other targets.
- **A popup animating out is inert, so presses fall through it.** A closing popup is already dismissed, so a press on its content reaches the page beneath. A modal one swallows a press on its backdrop, outside the content, and keeps presses from dismissing the popups beneath it.
- **Popups own nothing the layer already does.** Presence, focus return, dismissal, modal effects and Tab modes live in `createPopup`. A copy in a component drifts.
- **Options that affect rendering must reach state.** An options change never triggers a render, so a value read straight from `options()` in `attrs` goes stale. Sync it into state with `sync`, and add a spec that changes the option after mount.
- **`selects` must be right.** A slot whose state compares a store key with its own value, like `highlighted === key`, declares it in `selects`, with a guard test in `packages/core/test/selects.test.ts`. Without it every part hears every change; with a wrong one a part misses updates.
- **Anything platform-specific in render output** (shortcut glyphs, `aria-keyshortcuts`) comes from state that starts neutral and updates in a microtask after the client binds, or SSR hydration mismatches on Macs.
- **Opening a modal before the page hydrates** makes not-yet-hydrated markup inert, and React reports a hydration mismatch.
- **Core writes a part's state attribute before `animateOut`,** so exit keyframes keyed on it play.
- **Right to left:** read direction with `isRTL(el)` from computed style. Swap ArrowLeft and ArrowRight in key handling.

## Browsers and assistive technology

- **Safari doesn't focus buttons on click.** After a pointer open, focus may still be on the body when the next key arrives, so closing returns focus when it's on the body too.
- **Safari skips buttons on Tab.** Specs press Tab through the `tab` fixture, which adds Option in WebKit.
- **Firefox's form validation bubble swallows the next click,** and Escape doesn't close it; tests use the keyboard after a blocked submit. Firefox can't focus an invalid group element.
- **Firefox and Safari click a control a second time** when you click inside it within a `<label>`; guard against the double toggle.
- **Microtasks run between the browser's `invalid` events.**
- **Synchronous store writes during `input` events break React controlled inputs;** Field listens on the document.
- **iOS VoiceOver ignores `aria-activedescendant`.** Lists move real focus when the source is `virtual`.
- **NVDA stops echoing typed characters once `aria-activedescendant` is set,** so text fields set it only after an arrow key.
- **`execCommand("insertText")` is the only insertion that keeps native undo** in inputs, textareas and contenteditable; `value` writes and `setRangeText` wipe it. WebKit fires a cancelable `beforeinput` for our own `execCommand`, so guard against re-entry.
- **Automated Firefox never fires window blur.** Skip blur-based specs there with a comment.
- **Automation can't move a locked pointer.** Headless Chromium on Linux grants pointer lock and then reports no movement, so drag specs lock through `standInPointerLock` in `tests/specs/number-input.helpers.ts`.
- **Headless browsers draw no scrollbars,** except WebKit for elements with `::-webkit-scrollbar` styles. Scrollbar specs skip where none is drawn.
- **Linux WebKit differs from macOS WebKit:** word deletion is Control+Backspace, wheel scrolls animate, an arrow key a focused element ignores scrolls its box, and pointer-lock stand-ins measure client positions. Fonts differ too, so specs that compare positions within a pixel are the first to check when only Linux fails.

## Tests and tooling

- **Check exit codes, not grep.** `pnpm typecheck | grep "error TS"` printed nothing when pnpm failed to parse a broken `package.json`.
- **`open()` in the specs doesn't wait for hydration** in the `*-ssr` projects. Wait for an interactive signal before pressing.
- **Every command that starts a server sets its own port** (`PLAYGROUND_PORT`, default 5300; `DOCS_PORT`, default 5400). Playwright reuses a server already running on its port, so stale results can come from another session's server. Run tests through `scripts/test-slot.sh`.
- **Two dev servers in one checkout share `node_modules/.vite`,** and one re-optimizing can break the other's pages (`_jsxDEV is not a function`). Give parallel sessions their own git worktree.
- **A failure under load isn't proof.** Rerun it alone with `--repeat-each` before trusting it.
- **`pkill -f` matches its own shell command line,** so a shell running `pkill -f "next dev"` can kill itself. Kill by port (`lsof -iTCP:<port> -sTCP:LISTEN -t`).
- **`pnpm docs` is pnpm's built-in "open a package's docs" command.** The docs dev server is `pnpm dev`.
- **The docs dev server runs under a watchdog** (`scripts/docs-dev.sh`), which clears `.next/dev` and restarts when the cache passes its limit. Don't start `next dev` directly, and don't turn off Turbopack's dev cache, which makes the docs route hang.
- **`apps/docs/next-env.d.ts` is rewritten by the docs server.** Restore it before committing.
- **Disk space.** `apps/docs/.next/dev` can grow past 10 GB in a few hours, and headless browsers leave folders in the temp directory on every launch. Delete `.next` and `test-results` after long runs, and check free space before a full sweep.
- **Examples are precompiled,** so a stale `apps/docs/public/examples` shows old code in the docs. Run `pnpm --filter examples build` after changing an example or an adapter, and never while someone else is testing the docs: it empties a framework's folder while it runs.
- **Edits that silently don't land.** Prettier rewrites quotes and wrapping, so a later exact-match edit can miss. Re-read a file after editing it and before trusting a test result.
- **Merges drop closing braces at seams** (TypeScript interfaces, CSS layers, JSX). Check brace balance, and rebuild JSON files like `package.json` exports with a parser instead of text unions. After a merge, check `git diff --stat` against main for whole sections removed.
- **Pushing workflow changes needs the `workflow` scope:** `gh auth refresh -h github.com -s workflow`.
- **MDX:** escape `{` and `}` in prose, and keep links out of headings that are themselves linked.
