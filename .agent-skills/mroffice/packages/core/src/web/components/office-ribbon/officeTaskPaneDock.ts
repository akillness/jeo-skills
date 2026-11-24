"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { OfficeTaskPaneTab } from "./OfficeTaskPane";

/**
 * The task pane dock every MRAI editor shares.
 *
 * Office docks its task panes at one edge of the window (Microsoft Support,
 * "Manage pane layout in Office apps": a pane "docked" to the side edge of
 * the app window). Opening a second pane there does not lay it over the
 * first: the dock shows one pane at a time, every open pane keeps a tab until
 * its own X closes it, and the pane just opened is the one in front
 * (Microsoft Q&A, "PowerPoint 2019 - View both Animation and Selection Pane
 * at the same time"). Word docks the Navigation pane and the vertical
 * Reviewing Pane at the LEFT edge by default and its format / Styles /
 * Selection / Accessibility panes at the right, so a host may run one dock
 * per edge; the model is the same.
 *
 * The model remembers two orders: the order panes were opened in (the tab
 * order) and the order they were brought forward in (the front is the last).
 * It owns no pane's open state. A host whose panes have one flag each (the
 * slide editor) reconciles the model with those flags on every render
 * (`useOfficeTaskPaneDock`); a host whose panes mount only while open (the
 * document editor, split over two components) lets each pane register while
 * it is mounted (`useOfficeTaskPaneDockRegistry` + a slot per pane).
 */

export interface OfficeTaskPaneDockState<Id extends string = string> {
  /** Open panes, in the order they were opened: the tab order. */
  readonly opened: readonly Id[];
  /** Open panes, least recently brought forward first. */
  readonly recency: readonly Id[];
}

export function emptyOfficeTaskPaneDock<
  Id extends string,
>(): OfficeTaskPaneDockState<Id> {
  return { opened: [], recency: [] };
}

function sameOrder<Id extends string>(
  left: readonly Id[],
  right: readonly Id[],
): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

/**
 * Brings the remembered order up to date with which panes are open now. A
 * pane that has just opened joins at the end of both lists (it is the one in
 * front), in `order` when several open at once; a pane that has closed leaves
 * both. Returns `state` itself when nothing changed, so a render can call it
 * on every pass.
 */
export function reconcileOfficeTaskPaneDock<Id extends string>(
  state: OfficeTaskPaneDockState<Id>,
  order: readonly Id[],
  open: Readonly<Record<Id, boolean>>,
): OfficeTaskPaneDockState<Id> {
  const opened = state.opened.filter((id) => open[id]);
  const recency = state.recency.filter((id) => open[id]);
  for (const id of order) {
    if (!open[id] || opened.includes(id)) continue;
    opened.push(id);
    recency.push(id);
  }
  return sameOrder(opened, state.opened) && sameOrder(recency, state.recency)
    ? state
    : { opened, recency };
}

/** A pane has opened: it takes the last tab and comes to the front. A pane
 * already open is left where it is. */
export function openOfficeTaskPane<Id extends string>(
  state: OfficeTaskPaneDockState<Id>,
  id: Id,
): OfficeTaskPaneDockState<Id> {
  if (state.opened.includes(id)) return state;
  return { opened: [...state.opened, id], recency: [...state.recency, id] };
}

/** A pane has closed: its tab leaves, and the pane brought forward before it
 * is in front again. */
export function closeOfficeTaskPane<Id extends string>(
  state: OfficeTaskPaneDockState<Id>,
  id: Id,
): OfficeTaskPaneDockState<Id> {
  if (!state.opened.includes(id)) return state;
  return {
    opened: state.opened.filter((candidate) => candidate !== id),
    recency: state.recency.filter((candidate) => candidate !== id),
  };
}

export function bringOfficeTaskPaneForward<Id extends string>(
  state: OfficeTaskPaneDockState<Id>,
  id: Id,
): OfficeTaskPaneDockState<Id> {
  if (!state.opened.includes(id) || state.recency.at(-1) === id) return state;
  return {
    opened: state.opened,
    recency: [...state.recency.filter((candidate) => candidate !== id), id],
  };
}

/** The pane in front: the last brought forward among those that can show. */
export function officeTaskPaneDockFront<Id extends string>(
  state: OfficeTaskPaneDockState<Id>,
  showing: (id: Id) => boolean,
): Id | null {
  for (let index = state.recency.length - 1; index >= 0; index -= 1) {
    const id = state.recency[index];
    if (showing(id)) return id;
  }
  return null;
}

export interface OfficeTaskPaneDockTabOptions<Id extends string> {
  readonly label: (id: Id) => string;
  /** Bring this pane forward from its tab. */
  readonly select: (id: Id) => void;
  /** Close this pane from its tab (a dock whose tabs carry close buttons). */
  readonly close?: (id: Id) => void;
  readonly closeLabel?: (label: string) => string;
  

  readonly newestFirst?: boolean;
  /** The test id of another pane's tab in this pane's strip (the pane's own
   * tab takes `own.testId`). */
  readonly tabTestId?: (id: Id) => string | undefined;
}

/**
 * The tab strip for one pane's title row: every pane that can show, in the
 * order they were opened, this pane's own tab selected. A pane that keeps its
 * node while it is closed keeps its own tab too (the same element, so the
 * focus it held comes back to it on reopening).
 */
export function officeTaskPaneDockTabs<Id extends string>(
  state: OfficeTaskPaneDockState<Id>,
  showing: (id: Id) => boolean,
  id: Id,
  options: OfficeTaskPaneDockTabOptions<Id>,
  own?: Pick<OfficeTaskPaneTab, "testId" | "controlId" | "tabRef">,
): OfficeTaskPaneTab[] {
  const order = [
    ...state.opened.filter(
      (candidate) => showing(candidate) || candidate === id,
    ),
    ...(state.opened.includes(id) ? [] : [id]),
  ];
  if (options.newestFirst) order.reverse();
  const close = options.close;
  return order.map((candidate) => {
    const label = options.label(candidate);
    const testId = candidate === id ? own?.testId : options.tabTestId?.(candidate);
    const tabTestId = options.tabTestId?.(candidate);
    return {
      key: candidate,
      label,
      selected: candidate === id,
      onSelect: candidate === id ? undefined : () => options.select(candidate),
      testId,
      controlId: candidate === id ? own?.controlId : undefined,
      tabRef: candidate === id ? own?.tabRef : undefined,
      ...(close
        ? {
            onClose: () => close(candidate),
            closeLabel: options.closeLabel?.(label),
            closeTestId: tabTestId ? `${tabTestId}-close` : undefined,
          }
        : {}),
    };
  });
}

// ---- a host whose panes each have an open flag -----------------------------

export interface OfficeTaskPaneDock<Id extends string> {
  /** The pane in front, among those that can show now. */
  readonly front: Id | null;
  isFront(id: Id): boolean;
  /** Is this pane open (possibly behind another)? */
  isOpen(id: Id): boolean;
  /** Bring an open pane to the front. A pane that is not open is left
   * alone: opening it (its own state) brings it to the front by itself. */
  bringForward(id: Id): void;
  /** The tab strip for this pane's title row. */
  tabs(
    id: Id,
    own?: Pick<OfficeTaskPaneTab, "testId" | "controlId" | "tabRef">,
  ): OfficeTaskPaneTab[];
}

export interface OfficeTaskPaneDockOptions<Id extends string> {
  /** Every pane id the dock can hold; panes opening in the same render take
   * their tabs in this order. */
  readonly order: readonly Id[];
  /** Each pane's own open state. */
  readonly open: Readonly<Record<Id, boolean>>;
  /** `open` narrowed to the panes that have something to show right now (a
   * format pane stays open while nothing is selected, as Office keeps its
   * tab, but the pane before it stays in front instead of an empty dock). */
  readonly showing: Readonly<Record<Id, boolean>>;
  readonly labels: Readonly<Record<Id, string>>;
  readonly tabTestId?: (id: Id) => string | undefined;
  /** A tab of the strip brought its pane forward: the pane that held the
   * focus is now hidden, so the host moves the focus to the new front pane's
   * own tab. */
  readonly onTabSelected?: (id: Id) => void;
}

export function useOfficeTaskPaneDock<Id extends string>({
  order,
  open,
  showing,
  labels,
  tabTestId,
  onTabSelected,
}: OfficeTaskPaneDockOptions<Id>): OfficeTaskPaneDock<Id> {
  const [stored, setStored] = useState<OfficeTaskPaneDockState<Id>>(() =>
    reconcileOfficeTaskPaneDock(emptyOfficeTaskPaneDock<Id>(), order, open),
  );
  // Adjusting state while rendering (React's documented pattern for state
  // derived from a changed input): the pane that has just opened is in
  // front in this very render, not one frame later, so its own focus effect
  // finds it showing.
  const state = reconcileOfficeTaskPaneDock(stored, order, open);
  if (state !== stored) setStored(state);

  const front = useMemo(
    () => officeTaskPaneDockFront(state, (id) => showing[id]),
    [showing, state],
  );

  const bringForward = useCallback((id: Id) => {
    setStored((current) => bringOfficeTaskPaneForward(current, id));
  }, []);

  return {
    front,
    isFront: (id) => front === id,
    isOpen: (id) => open[id],
    bringForward,
    tabs: (id, own) =>
      officeTaskPaneDockTabs(
        state,
        (candidate) => showing[candidate],
        id,
        {
          label: (candidate) => labels[candidate],
          select: (candidate) => {
            bringForward(candidate);
            onTabSelected?.(candidate);
          },
          tabTestId,
        },
        own,
      ),
  };
}

// ---- a host whose panes mount only while open ------------------------------

export interface OfficeTaskPaneDockRegistry {
  readonly state: OfficeTaskPaneDockState<string>;
  readonly front: string | null;
  /** The element the docked panes render into (null until it mounts). */
  readonly host: HTMLElement | null;
  readonly setHost: (element: HTMLElement | null) => void;
  /** A pane has mounted (opened). */
  register(id: string): void;
  /** A pane has unmounted (closed). */
  unregister(id: string): void;
  /** The title a pane's tab reads, reported by the pane itself. */
  setLabel(id: string, label: string): void;
  label(id: string): string;
  bringForward(id: string): void;
  /** Its tab was chosen: bring it forward and give it the keyboard once it
   * is in front. */
  select(id: string): void;
  /** Did a tab choose this pane since it last took the keyboard? */
  takeFocusRequest(id: string): boolean;
  readonly tabTestId?: (id: string) => string | undefined;
  /** The accessible name of every pane's tab strip. */
  readonly tabsLabel?: string;
  /**
   * Panes moved out of the tab group (Office's Task Pane Options > Move Out
   * of Tab): each shows beside the group, in a column of its own, with its
   * plain title instead of a tab. Only a host that lays such columns out
   * passes them (`separate` option); every other dock keeps all its panes as
   * tabs.
   */
  readonly separate?: ReadonlySet<string>;
  /** The element a pane moved out of the tab renders into. */
  readonly separateHost?: (id: string) => HTMLElement | null;
  readonly setSeparateHost?: (id: string, element: HTMLElement | null) => void;
  /** Tabs in Excel for Mac's order: the most recently opened first. */
  readonly newestTabFirst?: boolean;
  /** Every tab closes its own pane (Excel's pane group): the accessible
   * name of a tab's close button, given the pane's title. */
  readonly tabCloseLabel?: (label: string) => string;
  /** How a pane closes itself, reported by the pane (OfficeTaskPane's X). */
  readonly setCloser?: (id: string, close: (() => void) | null) => void;
  /** Close a pane from its tab. */
  readonly closePane?: (id: string) => void;
}

const NO_SEPARATE_PANES: ReadonlySet<string> = new Set();

export function useOfficeTaskPaneDockRegistry(options?: {
  readonly tabTestId?: (id: string) => string | undefined;
  readonly tabsLabel?: string;
  /** The panes the person moved out of the tab group (kept by the host). */
  readonly separate?: ReadonlySet<string>;
  readonly newestTabFirst?: boolean;
  readonly tabCloseLabel?: (label: string) => string;
}): OfficeTaskPaneDockRegistry {
  const [state, setState] = useState<OfficeTaskPaneDockState<string>>(
    emptyOfficeTaskPaneDock<string>,
  );
  const [labels, setLabels] = useState<Readonly<Record<string, string>>>({});
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [separateHosts, setSeparateHosts] = useState<
    Readonly<Record<string, HTMLElement | null>>
  >({});
  const focusRequest = useRef<string | null>(null);
  const tabTestId = options?.tabTestId;
  const tabsLabel = options?.tabsLabel;
  const separate = options?.separate ?? NO_SEPARATE_PANES;
  const newestTabFirst = options?.newestTabFirst;
  const tabCloseLabel = options?.tabCloseLabel;
  // How each pane closes itself: read when a tab's X is pressed, never in a
  // render, so a pane reporting a new callback re-renders nothing.
  const closers = useRef(new Map<string, () => void>());
  const setCloser = useCallback((id: string, close: (() => void) | null) => {
    if (close) closers.current.set(id, close);
    else closers.current.delete(id);
  }, []);
  const closePane = useCallback((id: string) => closers.current.get(id)?.(), []);
  const setSeparateHost = useCallback(
    (id: string, element: HTMLElement | null) =>
      setSeparateHosts((current) =>
        (current[id] ?? null) === element ? current : { ...current, [id]: element },
      ),
    [],
  );
  // Every action is stable: a slot registers in an effect keyed on them, and
  // a new identity per render would close and reopen every pane.
  const register = useCallback(
    (id: string) => setState((current) => openOfficeTaskPane(current, id)),
    [],
  );
  const unregister = useCallback((id: string) => {
    if (focusRequest.current === id) focusRequest.current = null;
    setState((current) => closeOfficeTaskPane(current, id));
  }, []);
  const setLabel = useCallback(
    (id: string, label: string) =>
      setLabels((current) =>
        current[id] === label ? current : { ...current, [id]: label },
      ),
    [],
  );
  const bringForward = useCallback(
    (id: string) =>
      setState((current) => bringOfficeTaskPaneForward(current, id)),
    [],
  );
  const select = useCallback(
    (id: string) => {
      focusRequest.current = id;
      bringForward(id);
    },
    [bringForward],
  );
  const takeFocusRequest = useCallback((id: string) => {
    if (focusRequest.current !== id) return false;
    focusRequest.current = null;
    return true;
  }, []);
  return useMemo(
    () => ({
      state,
      // The front of the tab group: a pane moved out of it is never behind
      // another, so it is never the group's front either.
      front: officeTaskPaneDockFront(state, (id) => !separate.has(id)),
      host,
      setHost,
      separate,
      separateHost: (id: string) => separateHosts[id] ?? null,
      setSeparateHost,
      newestTabFirst,
      tabCloseLabel,
      setCloser,
      closePane,
      register,
      unregister,
      setLabel,
      label: (id: string) => labels[id] ?? "",
      bringForward,
      select,
      takeFocusRequest,
      tabTestId,
      tabsLabel,
    }),
    [
      bringForward,
      host,
      labels,
      register,
      closePane,
      newestTabFirst,
      select,
      separate,
      separateHosts,
      setCloser,
      setLabel,
      setSeparateHost,
      tabCloseLabel,
      state,
      tabTestId,
      tabsLabel,
      takeFocusRequest,
      unregister,
    ],
  );
}

/** What a pane mounted inside a registry dock's slot reads: its tab strip and
 * whether it is behind another pane. */
export interface OfficeTaskPaneDockSlotValue {
  readonly id: string;
  readonly tabs: readonly OfficeTaskPaneTab[];
  readonly tabsLabel?: string;
  readonly hidden: boolean;
  /** Moved out of the tab group: shown in a column of its own. */
  readonly separate?: boolean;
  /** The pane reports how it closes (its X), for its tab's close button. */
  readonly setClose?: (close: (() => void) | null) => void;
  /** The pane reports the title its tab reads. */
  readonly setLabel: (label: string) => void;
}

export const OfficeTaskPaneDockSlotContext =
  createContext<OfficeTaskPaneDockSlotValue | null>(null);

/**
 * For a pane that may be mounted in a registry dock's slot: the slot's tab
 * strip and hidden state (null outside a dock), and the pane's title reported
 * as its tab label.
 */
export function useOfficeTaskPaneDockSlot(
  title: string | undefined,
): OfficeTaskPaneDockSlotValue | null {
  const slot = useContext(OfficeTaskPaneDockSlotContext);
  const setLabel = slot?.setLabel;
  useLayoutEffect(() => {
    if (setLabel && title) setLabel(title);
  }, [setLabel, title]);
  return slot;
}

/** The slot value for pane `id` of a registry dock (see OfficeTaskPaneDockSlot). */
export function officeTaskPaneDockSlotValue(
  dock: OfficeTaskPaneDockRegistry,
  id: string,
  setLabel: (label: string) => void,
  setClose?: (close: (() => void) | null) => void,
): OfficeTaskPaneDockSlotValue {
  const separate = dock.separate ?? NO_SEPARATE_PANES;
  // Moved out of the tab: always showing, under its own title.
  if (separate.has(id)) {
    return { id, hidden: false, separate: true, setLabel, setClose, tabsLabel: dock.tabsLabel, tabs: [] };
  }
  const grouped = (candidate: string) => !separate.has(candidate);
  // A pane in its first render has not registered yet: it is the one just
  // opened, so it is in front and takes the last tab.
  const state = openOfficeTaskPane(dock.state, id);
  const front = dock.state.opened.includes(id)
    ? dock.front
    : officeTaskPaneDockFront(state, grouped);
  return {
    id,
    hidden: front !== id,
    setLabel,
    setClose,
    tabsLabel: dock.tabsLabel,
    tabs: officeTaskPaneDockTabs(state, grouped, id, {
      label: (candidate) => dock.label(candidate),
      select: dock.select,
      tabTestId: dock.tabTestId,
      newestFirst: dock.newestTabFirst,
      ...(dock.tabCloseLabel && dock.closePane
        ? { close: dock.closePane, closeLabel: dock.tabCloseLabel }
        : {}),
    }),
  };
}
