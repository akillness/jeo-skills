"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { revealRibbonControlInline } from "./ribbonReveal";
import { createPortal } from "react-dom";
import { useTranslations } from "../../../host/next-intl";

import {
  assignOfficeRibbonCommandKeyTips,
  assignOfficeRibbonTabKeyTips,
  isMacOfficeRibbonPlatform,
  isOfficeRibbonKeyTipCharacter,
  type OfficeRibbonKeyTipAssignment,
  type OfficeRibbonKeyTipSource,
} from "./officeRibbonKeyTips";

import styles from "./OfficeRibbonKeyTips.module.css";

type KeyTipPhase = "off" | "tabs" | "commands";

interface KeyTipTarget extends OfficeRibbonKeyTipAssignment {
  element: HTMLElement;
}

interface VisibleKeyTip extends KeyTipTarget {
  left: number;
  top: number;
}

const EDITOR_ROOT_SELECTOR = [
  ".note-editor-wrapper",
  ".native-page-window",
  ".presentation-window",
  "[data-testid^='window-']",
].join(",");

const EDITOR_FOCUS_TARGET_SELECTOR = [
  "[data-office-editor-focus-target]",
  ".ProseMirror[contenteditable='true']",
  "[contenteditable='true']",
  "[role='grid']",
  "canvas[tabindex]",
  "textarea:not(:disabled)",
  "input:not([type='hidden']):not(:disabled)",
  "[tabindex='0']",
].join(",");

const POPUP_FOCUS_SELECTOR = [
  "[role='dialog']",
  "[aria-modal='true']",
  "[role='menu']",
  "[role='listbox']",
].join(",");

function platformName(): string {
  if (typeof navigator === "undefined") return "";
  const platformNavigator = navigator as Navigator & {
    readonly userAgentData?: { readonly platform?: string };
  };
  return (
    platformNavigator.userAgentData?.platform ??
    platformNavigator.platform ??
    ""
  );
}

function targetLabel(element: HTMLElement): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  const labelledByText =
    labelledBy
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ") || undefined;
  const nativeLabel =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim())
          .filter(Boolean)
          .join(" ") || undefined
      : undefined;
  return (
    element.getAttribute("aria-label") ??
    labelledByText ??
    nativeLabel ??
    element.getAttribute("title") ??
    element.textContent?.trim() ??
    "Command"
  );
}

function targetId(element: HTMLElement, index: number): string {
  return (
    element.dataset.controlId ??
    element.dataset.testid ??
    element.id ??
    `${targetLabel(element)}-${index}`
  );
}

function collectCommandElements(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      "button, input:not([type='hidden']), select, [role='checkbox'], [role='combobox']",
    ),
  ).filter((element) => {
    if (element.hidden || element.getAttribute("aria-hidden") === "true")
      return false;
    if (element.getAttribute("aria-disabled") === "true") return false;
    if ("disabled" in element && Boolean(element.disabled)) return false;
    return element.tabIndex >= 0;
  });
}

function isOnScreen(rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight
  );
}

function toVisibleKeyTips(targets: readonly KeyTipTarget[]): VisibleKeyTip[] {
  return targets.flatMap((target) => {
    const rect = target.element.getBoundingClientRect();
    if (!isOnScreen(rect)) return [];
    return [
      {
        ...target,
        left: Math.min(
          window.innerWidth - 10,
          Math.max(10, rect.left + rect.width / 2),
        ),
        top: Math.min(window.innerHeight - 22, Math.max(4, rect.top + 2)),
      },
    ];
  });
}

function focusWithoutScroll(element: HTMLElement | null | undefined): void {
  if (!element?.isConnected) return;
  element.focus({ preventScroll: true });
}

function focusRibbonRegion(element: HTMLElement | null | undefined): boolean {
  if (!element?.isConnected) return false;
  revealRibbonControlInline(element);
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

function isCommandAvailable(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true")
    return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  return !("disabled" in element && Boolean(element.disabled));
}

function activateCommand(element: HTMLElement): void {
  if (!isCommandAvailable(element)) return;
  if (element instanceof HTMLButtonElement) {
    element.click();
    return;
  }
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    element.click();
    return;
  }
  focusWithoutScroll(element);
}

type KeyTipTranslate = (key: string, values?: Record<string, string>) => string;

function liveCopy(
  t: KeyTipTranslate,
  phase: KeyTipPhase,
  label?: string,
): string {
  if (phase === "tabs") {
    return t("office.keyTips.tabsShown");
  }
  if (phase === "commands") {
    return t("office.keyTips.commandsShown", {
      tab: label ?? t("office.keyTips.currentTab"),
    });
  }
  return t("office.keyTips.closed");
}

function focusCycleCopy(
  t: KeyTipTranslate,
  region: "commands" | "editor" | "tabs",
): string {
  if (region === "tabs") {
    return t("office.keyTips.focusTabs");
  }
  if (region === "commands") {
    return t("office.keyTips.focusCommands");
  }
  return t("office.keyTips.focusEditor");
}

export function OfficeRibbonKeyTips<K extends string>({
  activeTab,
  tabs,
  tabRefs,
  tabsContainerRef,
  testIdPrefix,
}: {
  activeTab: K;
  tabs: ReadonlyArray<{ key: K; label: string }>;
  tabRefs: RefObject<Map<K, HTMLButtonElement>>;
  tabsContainerRef: RefObject<HTMLDivElement | null>;
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const [phase, setPhaseState] = useState<KeyTipPhase>("off");
  const [visibleTips, setVisibleTips] = useState<VisibleKeyTip[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const phaseRef = useRef<KeyTipPhase>("off");
  const targetsRef = useRef<KeyTipTarget[]>([]);
  const bufferRef = useRef("");
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lastEditorFocusRef = useRef<HTMLElement | null>(null);
  const altArmedRef = useRef(false);

  const tabAssignments = useMemo(
    () =>
      assignOfficeRibbonTabKeyTips(
        tabs.map((tab) => ({ id: String(tab.key), label: tab.label })),
      ),
    [tabs],
  );

  const toolbar = useCallback(
    () =>
      tabsContainerRef.current?.closest<HTMLElement>("[role='toolbar']") ??
      null,
    [tabsContainerRef],
  );

  const editorRoot = useCallback(
    () => toolbar()?.closest<HTMLElement>(EDITOR_ROOT_SELECTOR) ?? null,
    [toolbar],
  );

  const selectedTab = useCallback(
    () => tabRefs.current?.get(activeTab) ?? null,
    [activeTab, tabRefs],
  );

  const activePanel = useCallback(() => {
    const host = toolbar();
    const panelId = selectedTab()?.getAttribute("aria-controls");
    return (
      (panelId ? document.getElementById(panelId) : null) ??
      host?.querySelector<HTMLElement>("[role='tabpanel']") ??
      null
    );
  }, [selectedTab, toolbar]);

  const editorFocusTarget = useCallback((): HTMLElement | null => {
    const host = toolbar();
    const root = editorRoot();
    if (!host || !root) return null;
    const remembered = lastEditorFocusRef.current;
    if (
      remembered?.isConnected &&
      root.contains(remembered) &&
      !host.contains(remembered)
    ) {
      return remembered;
    }
    return (
      Array.from(
        root.querySelectorAll<HTMLElement>(EDITOR_FOCUS_TARGET_SELECTOR),
      ).find(
        (candidate) =>
          !host.contains(candidate) &&
          !candidate.hidden &&
          candidate.getAttribute("aria-hidden") !== "true" &&
          candidate.getAttribute("aria-disabled") !== "true",
      ) ?? null
    );
  }, [editorRoot, toolbar]);

  const isCurrentRibbon = useCallback((): boolean => {
    const host = toolbar();
    if (!host) return false;
    const focused = document.activeElement;
    if (focused instanceof Node && host.contains(focused)) return true;
    const root = host.closest<HTMLElement>(EDITOR_ROOT_SELECTOR);
    if (root && focused instanceof Node && root.contains(focused)) return true;
    if (
      focused instanceof Element &&
      focused.closest("[role='dialog'], [aria-modal='true']")
    ) {
      return false;
    }
    const visibleHosts = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-office-keytips-host='true']",
      ),
    ).filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return visibleHosts.length === 1 && visibleHosts[0] === host;
  }, [toolbar]);

  const setPhase = useCallback(
    (next: KeyTipPhase, label?: string) => {
      phaseRef.current = next;
      bufferRef.current = "";
      setPhaseState(next);
      setAnnouncement(liveCopy(t, next, label));
    },
    [t],
  );

  const refreshTargets = useCallback(() => {
    if (phaseRef.current === "off") {
      targetsRef.current = [];
      setVisibleTips([]);
      return;
    }
    if (phaseRef.current === "tabs") {
      targetsRef.current = tabAssignments.flatMap((assignment) => {
        const element = tabRefs.current?.get(assignment.id as K);
        return element ? [{ ...assignment, element }] : [];
      });
      setVisibleTips(toVisibleKeyTips(targetsRef.current));
      return;
    }

    const host = toolbar();
    const selectedTab = tabRefs.current?.get(activeTab);
    const panelId = selectedTab?.getAttribute("aria-controls");
    const panel =
      (panelId ? document.getElementById(panelId) : null) ??
      host?.querySelector<HTMLElement>("[role='tabpanel']") ??
      null;
    const commandElements = collectCommandElements(panel);
    const sources: OfficeRibbonKeyTipSource[] = commandElements.map(
      (element, index) => ({
        id: targetId(element, index),
        label: targetLabel(element),
      }),
    );
    const assignments = assignOfficeRibbonCommandKeyTips(sources);
    targetsRef.current = assignments.map((assignment, index) => ({
      ...assignment,
      element: commandElements[index],
    }));
    setVisibleTips(toVisibleKeyTips(targetsRef.current));
  }, [activeTab, tabAssignments, tabRefs, toolbar]);

  const closeAndRestore = useCallback(() => {
    setPhase("off");
    targetsRef.current = [];
    setVisibleTips([]);
    focusWithoutScroll(previousFocusRef.current);
  }, [setPhase]);

  const showTabs = useCallback(() => {
    if (!isCurrentRibbon()) return;
    const focused = document.activeElement;
    if (phaseRef.current === "off") {
      previousFocusRef.current =
        focused instanceof HTMLElement ? focused : null;
    }
    setPhase("tabs");
    requestAnimationFrame(refreshTargets);
  }, [isCurrentRibbon, refreshTargets, setPhase]);

  useEffect(() => {
    const host = toolbar();
    if (!host) return;
    host.dataset.officeKeytipsHost = "true";
    return () => {
      delete host.dataset.officeKeytipsHost;
    };
  }, [toolbar]);

  useEffect(() => {
    const host = toolbar();
    const root = editorRoot();
    if (!host || !root) return;
    const rememberEditorFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (!root.contains(event.target) || host.contains(event.target)) return;
      if (event.target.closest(POPUP_FOCUS_SELECTOR)) return;
      lastEditorFocusRef.current = event.target;
    };
    root.addEventListener("focusin", rememberEditorFocus);
    return () => root.removeEventListener("focusin", rememberEditorFocus);
  }, [editorRoot, toolbar]);

  useEffect(() => {
    if (phase === "off") return;
    requestAnimationFrame(refreshTargets);
  }, [activeTab, phase, refreshTargets, tabs]);

  useEffect(() => {
    const handleGeometryChange = () => {
      if (phaseRef.current !== "off") refreshTargets();
    };
    window.addEventListener("resize", handleGeometryChange);
    window.addEventListener("scroll", handleGeometryChange, true);
    return () => {
      window.removeEventListener("resize", handleGeometryChange);
      window.removeEventListener("scroll", handleGeometryChange, true);
    };
  }, [refreshTargets]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (
        event.key === "F6" &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        const host = toolbar();
        const root = editorRoot();
        const focused = document.activeElement;
        if (
          !host ||
          !root ||
          !(focused instanceof HTMLElement) ||
          (!host.contains(focused) && !root.contains(focused)) ||
          focused.closest(POPUP_FOCUS_SELECTOR)
        ) {
          return;
        }

        const tab = selectedTab();
        const panel = activePanel();
        const commands = collectCommandElements(panel);
        const tabList =
          tabsContainerRef.current?.querySelector<HTMLElement>(
            "[role='tablist']",
          );
        const focusInTabs = Boolean(tabList?.contains(focused));
        const focusInEditor = !host.contains(focused);
        const backwards = event.shiftKey;
        let target: HTMLElement | null = null;
        let targetRegion: "commands" | "editor" | "tabs";

        if (backwards) {
          if (focusInEditor) {
            target = commands[commands.length - 1] ?? tab;
            targetRegion = commands.length ? "commands" : "tabs";
          } else if (focusInTabs) {
            target = editorFocusTarget();
            targetRegion = "editor";
          } else {
            target = tab;
            targetRegion = "tabs";
          }
        } else if (focusInEditor) {
          target = tab;
          targetRegion = "tabs";
        } else if (focusInTabs) {
          target = commands[0] ?? editorFocusTarget();
          targetRegion = commands.length ? "commands" : "editor";
        } else {
          target = editorFocusTarget();
          targetRegion = "editor";
        }

        if (!target || !focusRibbonRegion(target)) return;
        event.preventDefault();
        event.stopPropagation();
        altArmedRef.current = false;
        if (phaseRef.current !== "off") {
          setPhase("off");
          targetsRef.current = [];
          setVisibleTips([]);
        }
        setAnnouncement(focusCycleCopy(t, targetRegion));
        return;
      }
      const isMac = isMacOfficeRibbonPlatform(platformName());
      const webChord =
        (!isMac &&
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.key === ".") ||
        (isMac &&
          event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          event.key === ".");
      if (webChord) {
        event.preventDefault();
        event.stopPropagation();
        altArmedRef.current = false;
        if (phaseRef.current === "off") showTabs();
        else closeAndRestore();
        return;
      }

      if (altArmedRef.current && event.key !== "Alt") {
        // A real browser/OS Alt chord is not a KeyTips invocation. Leave it to
        // the host and make sure releasing Alt cannot open the overlay later.
        altArmedRef.current = false;
      }

      if (
        !isMac &&
        event.key === "Alt" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        if (!isCurrentRibbon()) return;
        altArmedRef.current = true;
        return;
      }

      if (event.key === "Escape" && phaseRef.current !== "off") {
        event.preventDefault();
        event.stopPropagation();
        if (phaseRef.current === "commands") {
          setPhase("tabs");
          focusWithoutScroll(tabRefs.current?.get(activeTab));
          requestAnimationFrame(refreshTargets);
        } else {
          closeAndRestore();
        }
        return;
      }

      if (phaseRef.current === "off") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      if (!isOfficeRibbonKeyTipCharacter(event.key)) return;

      event.preventDefault();
      event.stopPropagation();
      const nextBuffer = `${bufferRef.current}${event.key.toUpperCase()}`;
      const matches = targetsRef.current.filter((target) =>
        target.keyTip.startsWith(nextBuffer),
      );
      if (matches.length === 0) {
        bufferRef.current = "";
        setAnnouncement(liveCopy(t, phaseRef.current));
        return;
      }
      bufferRef.current = nextBuffer;
      const exact = matches.find((target) => target.keyTip === nextBuffer);
      if (!exact) return;

      bufferRef.current = "";
      if (phaseRef.current === "tabs") {
        if (!exact.element.isConnected) {
          closeAndRestore();
          return;
        }
        exact.element.click();
        focusWithoutScroll(exact.element);
        setPhase("commands", exact.label);
        requestAnimationFrame(refreshTargets);
        return;
      }

      if (!isCommandAvailable(exact.element)) {
        closeAndRestore();
        return;
      }
      setPhase("off");
      targetsRef.current = [];
      setVisibleTips([]);
      requestAnimationFrame(() => activateCommand(exact.element));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== "Alt" || !altArmedRef.current) return;
      altArmedRef.current = false;
      if (phaseRef.current === "off") showTabs();
      else closeAndRestore();
    };

    const onPointerDown = () => {
      altArmedRef.current = false;
      if (phaseRef.current !== "off") closeAndRestore();
    };
    const onWindowBlur = () => {
      altArmedRef.current = false;
      if (phaseRef.current !== "off") closeAndRestore();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [
    activeTab,
    activePanel,
    closeAndRestore,
    editorFocusTarget,
    editorRoot,
    isCurrentRibbon,
    refreshTargets,
    setPhase,
    showTabs,
    selectedTab,
    t,
    tabRefs,
    tabsContainerRef,
    toolbar,
  ]);

  const overlay =
    phase === "off" || typeof document === "undefined"
      ? null
      : createPortal(
          <div
            className={styles.overlay}
            data-office-keytip-phase={phase}
            data-testid={`${testIdPrefix}-keytips-overlay`}
          >
            {visibleTips.map((tip) => (
              <span
                key={`${tip.id}:${tip.keyTip}`}
                className={styles.badge}
                data-keytip={tip.keyTip}
                data-keytip-label={tip.label}
                style={{ left: tip.left, top: tip.top }}
                title={tip.label}
              >
                {tip.keyTip}
              </span>
            ))}
          </div>,
          document.body,
        );

  return (
    <>
      <span
        className={styles.live}
        aria-live="polite"
        aria-atomic="true"
        data-testid={`${testIdPrefix}-keytips-live`}
      >
        {announcement}
      </span>
      {overlay}
    </>
  );
}
