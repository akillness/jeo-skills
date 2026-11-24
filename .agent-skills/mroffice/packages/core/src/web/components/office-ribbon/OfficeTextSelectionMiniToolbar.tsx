"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "../../../host/next-intl";
import {
  Bold,
  Italic,
  Link,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  Underline,
} from "./icons/houseIcons";
import {
  OfficeFloatingMiniToolbar,
  OfficeFloatingMiniToolbarButton,
  OfficeFloatingMiniToolbarDivider,
  type OfficeFloatingAnchor,
} from "./OfficeFloatingMiniToolbar";
import { officeTextSelectionRect } from "../../lib/office-text-selection-rect";

/**
 * The Docs editor's glass mini toolbar over a text selection, for the hosts
 * whose text is not a ProseMirror document: a slide's text box, a cell being
 * edited, a shape's words on a sheet. The look and the buttons are the Docs
 * toolbar's own (OfficeFloatingMiniToolbar); each host hands in the commands
 * it can carry out on that selection, and a command it cannot is left out
 * rather than shown dead.
 *
 * It appears as Excel's and PowerPoint's Mini Toolbar does, "when you select
 * text with the mouse" (Microsoft Support, Use the Mini toolbar to format
 * text), and goes once the user types, scrolls, clicks elsewhere or the
 * selection collapses.
 */

/** A two-state character format the host applies to the selection. */
export interface OfficeMiniToolbarToggle {
  readonly active: boolean | "mixed";
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

export interface OfficeTextMiniToolbarCommands {
  readonly bold?: OfficeMiniToolbarToggle;
  readonly italic?: OfficeMiniToolbarToggle;
  readonly underline?: OfficeMiniToolbarToggle;
  readonly strikethrough?: OfficeMiniToolbarToggle;
  /** Clear Formatting over the selection, where the host has it. */
  readonly clearFormatting?: { readonly disabled?: boolean; readonly onClick: () => void };
  readonly link?: { readonly active?: boolean; readonly disabled?: boolean; readonly onClick: () => void };
  readonly ai?: {
    readonly disabled?: boolean;
    readonly disabledReason?: string;
    readonly onClick: () => void;
  };
}

/** The mark every mini toolbar carries, so a press on it is not "elsewhere". */
export const OFFICE_TEXT_MINI_TOOLBAR_ATTRIBUTE = "data-office-text-mini-toolbar";

export function OfficeTextSelectionMiniToolbar({
  anchor,
  commands,
  testIdPrefix,
}: {
  /** The selection's rect in viewport pixels; null hides the toolbar. */
  readonly anchor: OfficeFloatingAnchor | null;
  readonly commands: OfficeTextMiniToolbarCommands;
  /** `${prefix}`, `${prefix}-bold`, ... for the toolbar and its buttons. */
  readonly testIdPrefix: string;
}): React.JSX.Element | null {
  const t = useTranslations("console-notebooks");
  const { bold, italic, underline, strikethrough, clearFormatting, link, ai } = commands;
  const formatting = Boolean(bold || italic || underline || strikethrough || clearFormatting);
  return (
    <OfficeFloatingMiniToolbar
      anchor={anchor}
      label={t("toolbar.miniToolbar")}
      testId={testIdPrefix}
    >
      <span {...{ [OFFICE_TEXT_MINI_TOOLBAR_ATTRIBUTE]: "" }} style={{ display: "contents" }}>
        {bold ? (
          <OfficeFloatingMiniToolbarButton
            label={t("toolbar.bold")}
            active={bold.active}
            disabled={bold.disabled}
            testId={`${testIdPrefix}-bold`}
            onClick={bold.onToggle}
          >
            <Bold size={16} />
          </OfficeFloatingMiniToolbarButton>
        ) : null}
        {italic ? (
          <OfficeFloatingMiniToolbarButton
            label={t("toolbar.italic")}
            active={italic.active}
            disabled={italic.disabled}
            testId={`${testIdPrefix}-italic`}
            onClick={italic.onToggle}
          >
            <Italic size={16} />
          </OfficeFloatingMiniToolbarButton>
        ) : null}
        {underline ? (
          <OfficeFloatingMiniToolbarButton
            label={t("toolbar.underline")}
            active={underline.active}
            disabled={underline.disabled}
            testId={`${testIdPrefix}-underline`}
            onClick={underline.onToggle}
          >
            <Underline size={16} />
          </OfficeFloatingMiniToolbarButton>
        ) : null}
        {strikethrough ? (
          <OfficeFloatingMiniToolbarButton
            label={t("toolbar.strikethrough")}
            active={strikethrough.active}
            disabled={strikethrough.disabled}
            testId={`${testIdPrefix}-strikethrough`}
            onClick={strikethrough.onToggle}
          >
            <Strikethrough size={16} />
          </OfficeFloatingMiniToolbarButton>
        ) : null}
        {clearFormatting ? (
          <OfficeFloatingMiniToolbarButton
            label={t("toolbar.clearFormatting")}
            disabled={clearFormatting.disabled}
            testId={`${testIdPrefix}-clear`}
            onClick={clearFormatting.onClick}
          >
            <RemoveFormatting size={16} />
          </OfficeFloatingMiniToolbarButton>
        ) : null}
        {link ? (
          <>
            {formatting ? <OfficeFloatingMiniToolbarDivider /> : null}
            <OfficeFloatingMiniToolbarButton
              label={t("toolbar.link")}
              active={link.active ?? false}
              disabled={link.disabled}
              testId={`${testIdPrefix}-link`}
              onClick={link.onClick}
            >
              <Link size={16} />
            </OfficeFloatingMiniToolbarButton>
          </>
        ) : null}
        {false ? (
          <>
            {formatting || link ? <OfficeFloatingMiniToolbarDivider /> : null}
            <OfficeFloatingMiniToolbarButton
              label={ai.disabled && ai.disabledReason ? ai.disabledReason : t("toolbar.aiActions")}
              disabled={ai.disabled}
              className="floating-toolbar-ai-btn"
              testId={`${testIdPrefix}-ai`}
              onClick={ai.onClick}
            >
              <Sparkles size={16} />
            </OfficeFloatingMiniToolbarButton>
          </>
        ) : null}
      </span>
    </OfficeFloatingMiniToolbar>
  );
}

function sameAnchor(a: OfficeFloatingAnchor | null, b: OfficeFloatingAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

/**
 * When the mini toolbar shows and where: after a mouse selection inside a
 * text host `hostFor` recognises, until the user types, scrolls, presses
 * elsewhere, leaves the window or collapses the selection. `refresh` measures
 * the selection again after a command changed how its characters lay out,
 * and re-renders the toolbar so its buttons read the selection's format
 * anew. A command that swaps the editing surface (a plain entry or text box
 * that becomes rich text once a word in it is bold) names the surface now
 * holding the selection: the element itself, or a resolver from the old one.
 */
export function useOfficeMouseSelectionMiniToolbar({
  enabled,
  hostFor,
}: {
  readonly enabled: boolean;
  /** The text host an event landed in, or null when it is none. */
  readonly hostFor: (target: EventTarget | null) => HTMLElement | null;
}): {
  readonly anchor: OfficeFloatingAnchor | null;
  readonly host: HTMLElement | null;
  readonly refresh: (next?: HTMLElement | ((host: HTMLElement) => HTMLElement | null)) => void;
  readonly dismiss: () => void;
} {
  const [state, setState] = useState<{ host: HTMLElement; anchor: OfficeFloatingAnchor } | null>(null);
  const [, setRevision] = useState(0);
  const stateRef = useRef(state);
  const hostForRef = useRef(hostFor);
  useLayoutEffect(() => {
    stateRef.current = state;
    hostForRef.current = hostFor;
  });
  const frameRef = useRef<number | null>(null);
  // Whether the last state asked for shows the toolbar. Hiding a toolbar that
  // is not shown asks for nothing: every keystroke, press and scroll hides it,
  // and a same-value update still re-renders the host before bailing out.
  const shownRef = useRef(false);

  const dismiss = useCallback(() => {
    if (!shownRef.current) return;
    shownRef.current = false;
    setState(null);
  }, []);

  const measure = useCallback((host: HTMLElement) => {
    const rect = host.isConnected ? officeTextSelectionRect(host) : null;
    const shown = stateRef.current;
    // A mouse-up with nothing selected, or over the same selection, finds
    // the toolbar already as it should be.
    if (
      rect === null
        ? !shownRef.current
        : shownRef.current && shown?.host === host && sameAnchor(shown.anchor, rect)
    ) {
      return;
    }
    shownRef.current = rect !== null;
    setState((current) => {
      if (!rect) return null;
      if (current && current.host === host && sameAnchor(current.anchor, rect)) return current;
      return { host, anchor: rect };
    });
  }, []);

  const refresh = useCallback(
    (next?: HTMLElement | ((host: HTMLElement) => HTMLElement | null)) => {
      const current = stateRef.current?.host;
      const replacement = next instanceof HTMLElement ? next : null;
      // A replacement host (the editor that took over the selection) is
      // measured even if the toolbar just went with the old one.
      if (!replacement && !current) return;
      setRevision((revision) => revision + 1);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      // A frame later: after the command's own selection restore, which the
      // host schedules for the next frame too.
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const host =
          replacement ??
          (typeof next === "function" && current ? next(current) : null) ??
          current;
        if (host) measure(host);
      });
    },
    [measure],
  );

  useEffect(() => {
    if (!enabled) return;
    const insideToolbar = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest(`.floating-toolbar, [${OFFICE_TEXT_MINI_TOOLBAR_ATTRIBUTE}]`) !== null;
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || insideToolbar(event.target)) return;
      const host = hostForRef.current(event.target);
      if (!host) {
        dismiss();
        return;
      }
      // The selection settles after the mouse-up that ends it.
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure(host);
      });
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!insideToolbar(event.target)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!MODIFIER_KEYS.has(event.key)) dismiss();
    };
    const onScroll = (event: Event) => {
      if (!insideToolbar(event.target)) dismiss();
    };
    const onSelectionChange = () => {
      const current = stateRef.current;
      if (!current) return;
      if (!current.host.isConnected || !officeTextSelectionRect(current.host)) dismiss();
    };
    const onBlur = () => dismiss();
    // Captured: a text host may stop its own mouse-up from bubbling (a
    // slide's rich text box does), and the selection still ended there.
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("blur", onBlur);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [dismiss, enabled, measure]);

  // A host that stops taking the toolbar hides it at once.
  const shown = enabled ? state : null;
  return { anchor: shown?.anchor ?? null, host: shown?.host ?? null, refresh, dismiss };
}
