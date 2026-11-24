"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { FileText, Plus } from "../../office-ribbon/icons/houseIcons";
import type { Editor, Range } from "@tiptap/core";
import { isImeKeydown } from "../../../lib/soft-keyboard";

export interface WikiLinkPageCandidate {
  id: string;
  title: string;
}

export interface WikiLinkSuggestionContext {
  getPageId: () => string | null;
  fetchPages: (notebookId: string) => Promise<WikiLinkPageCandidate[]>;
  getNotebookId: () => string | null;
  translate: (key: string) => string;
}

interface CommandListProps {
  editor: Editor;
  items: WikiLinkPageCandidate[];
  query: string;
  command: (
    item: WikiLinkPageCandidate | { __create: true; title: string },
  ) => void;
  translate: (key: string) => string;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SelectionState {
  query: string;
  index: number;
}

type WikiLinkCommandItem =
  | WikiLinkPageCandidate
  | { __create: true; title: string };

type WikiLinkSuggestionProps = SuggestionProps<
  WikiLinkPageCandidate,
  WikiLinkCommandItem
>;

type CommandListRendererProps = CommandListProps & {
  translate: (key: string) => string;
};

const CommandListComponent = forwardRef<
  CommandListRef,
  CommandListRendererProps
>(({ editor, items, query, command, translate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editable, setEditable] = useState(
    () => !editor.isDestroyed && editor.isEditable,
  );
  const [selection, setSelection] = useState<SelectionState>({
    query,
    index: 0,
  });

  useEffect(() => {
    const refreshEditable = () => {
      setEditable(!editor.isDestroyed && editor.isEditable);
    };
    refreshEditable();
    editor.on("update", refreshEditable);
    editor.on("destroy", refreshEditable);
    return () => {
      editor.off("update", refreshEditable);
      editor.off("destroy", refreshEditable);
    };
  }, [editor]);
  // Index 0 is always the "Create new page" row. Real matches start at 1.
  const totalRows = items.length + 1;
  const selectedIndex = selection.query === query ? selection.index : 0;
  const setSelectedIndexForQuery = useCallback(
    (next: number | ((current: number) => number)) => {
      setSelection((currentSelection) => {
        const currentIndex =
          currentSelection.query === query ? currentSelection.index : 0;
        const nextIndex =
          typeof next === "function" ? next(currentIndex) : next;
        return { query, index: nextIndex };
      });
    },
    [query],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const fire = useCallback(
    (idx: number) => {
      if (!editable) return;
      if (idx === 0) {
        command({ __create: true, title: query });
        return;
      }
      const real = items[idx - 1];
      if (real) command(real);
    },
    [command, editable, items, query],
  );

  useEffect(() => {
    if (typeof ref === "function") {
      ref({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          // While a CJK IME candidate window is open, Enter/Arrow keys belong to
          // the IME (confirm candidate / move candidate list), NOT the wiki-link
          // suggestion menu — defer so a Chinese page-name search isn't hijacked.
          // Safari ends the composition before the Enter that commits it
          // (isComposing false, keyCode 229): isImeKeydown sees both.
          if (isImeKeydown(event)) return false;
          if (event.key === "ArrowDown") {
            setSelectedIndexForQuery((i) => (i + 1) % totalRows);
            return true;
          }
          if (event.key === "ArrowUp") {
            setSelectedIndexForQuery((i) => (i + totalRows - 1) % totalRows);
            return true;
          }
          if (event.key === "Enter") {
            fire(selectedIndex);
            return true;
          }
          return false;
        },
      });
    }
  }, [ref, totalRows, selectedIndex, fire, setSelectedIndexForQuery]);

  return (
    <div
      className="slash-menu docs-cupertino-menu"
      ref={containerRef}
      role="listbox"
    >
      <button
        type="button"
        role="option"
        aria-selected={selectedIndex === 0}
        disabled={!editable}
        className={`slash-menu-item${selectedIndex === 0 ? " is-selected" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          fire(0);
        }}
        onMouseEnter={() => setSelectedIndexForQuery(0)}
      >
        <span className="slash-menu-icon">
          <Plus size={18} />
        </span>
        <span className="slash-menu-text">
          <span className="slash-menu-title">
            {translate("wikilink.create")} &quot;{query || translate("wikilink.unnamed")}&quot;
          </span>
          <span className="slash-menu-desc">
            {translate("wikilink.createDesc")}
          </span>
        </span>
      </button>
      {items.map((page, i) => {
        const idx = i + 1;
        return (
          <button
            key={page.id}
            type="button"
            role="option"
            aria-selected={selectedIndex === idx}
            disabled={!editable}
            className={`slash-menu-item${selectedIndex === idx ? " is-selected" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              fire(idx);
            }}
            onMouseEnter={() => setSelectedIndexForQuery(idx)}
          >
            <span className="slash-menu-icon">
              <FileText size={18} />
            </span>
            <span className="slash-menu-text">
              <span className="slash-menu-title">{page.title || translate("wikilink.unnamed")}</span>
              <span className="slash-menu-desc">{page.id}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
});
CommandListComponent.displayName = "WikiLinkCommandList";

export function createWikiLinkSuggestionConfig(
  ctx: WikiLinkSuggestionContext,
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "[[",
    allowSpaces: true,
    items: async ({ query }: { query: string }) => {
      const notebookId = ctx.getNotebookId();
      if (!notebookId) return [];
      const all = await ctx.fetchPages(notebookId);
      const q = query.trim().toLowerCase();
      const filtered = q
        ? all.filter((p) => p.title.toLowerCase().includes(q))
        : all;
      return filtered.slice(0, 12);
    },
    command: ({
      editor,
      range,
      props,
    }: {
      editor: Editor;
      range: Range;
      props: WikiLinkPageCandidate | { __create: true; title: string };
    }) => {
      if (editor.isDestroyed || editor.isEditable === false) return;
      const isCreate = "__create" in props;
      const target = props.title.trim();
      // An empty target produces an unnavigable mark with no text the
      // serializer can round-trip. Drop the trigger range and bail so
      // the popup just closes — same UX as pressing Escape.
      if (!target) {
        editor.chain().focus().deleteRange(range).run();
        return;
      }
      const display = null;
      const resolved = !isCreate;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "text",
          text: target,
          marks: [
            {
              type: "wikiLink",
              attrs: { target, display, resolved },
            },
          ],
        })
        .insertContent(" ")
        .run();
    },
    render: () => {
      let component: ReactRenderer<
        CommandListRef,
        CommandListRendererProps
      > | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: WikiLinkSuggestionProps) => {
          const renderer = new ReactRenderer(CommandListComponent, {
            props: { ...props, translate: ctx.translate },
            editor: props.editor as Editor,
          });
          component = renderer;
          if (!props.clientRect) return;
          popup = tippy("body", {
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
            appendTo: () => document.body,
            content: renderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate: (props: WikiLinkSuggestionProps) => {
          component?.updateProps({ ...props, translate: ctx.translate });
          if (popup?.[0] && props.clientRect) {
            popup[0].setProps({
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(),
            });
          }
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return (
            (component?.ref as CommandListRef | null)?.onKeyDown(props) ?? false
          );
        },
        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

const WikiLinkSuggestion = Extension.create<{
  suggestion?: Omit<SuggestionOptions, "editor">;
}>({
  name: "wikiLinkSuggestion",

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    if (!this.options.suggestion) return [];
    return [
      Suggestion({
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export default WikiLinkSuggestion;
