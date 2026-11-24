"use client";























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isImeCompositionActive } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";

const IOS_ENTER_REPLAY_WINDOW_MS = 300;

const nativeParagraphInputKey = new PluginKey("nativeParagraphInput");

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /AppleWebKit/.test(navigator.userAgent) && navigator.maxTouchPoints > 2 &&
    !/Chrome|Android/.test(navigator.userAgent);
}

function enterKeyEvent(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
  Object.defineProperty(event, "keyCode", { configurable: true, value: 13 });
  return event;
}

export const NativeParagraphInput = Extension.create({
  name: "nativeParagraphInput",

  addProseMirrorPlugins() {
    let lastEnterKeydown = 0;
    return [new Plugin({
      key: nativeParagraphInputKey,
      props: {
        handleDOMEvents: {
          keydown(_view: EditorView, event: KeyboardEvent) {
            if (event.keyCode === 13 && !event.isComposing) lastEnterKeydown = Date.now();
            return false;
          },
          beforeinput(view: EditorView, event: Event) {
            const input = event as InputEvent;
            if (input.inputType !== "insertParagraph" || event.defaultPrevented) return false;
            if (!view.editable || isImeCompositionActive(view, event)) return false;
            if (isIOS() && Date.now() - lastEnterKeydown < IOS_ENTER_REPLAY_WINDOW_MS) return false;
            const handled = view.someProp("handleKeyDown", (handle) => handle(view, enterKeyEvent()));
            if (!handled) return false;
            event.preventDefault();
            return true;
          },
        },
      },
    })];
  },
});

export default NativeParagraphInput;
