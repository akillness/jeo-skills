"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { flushSync } from "react-dom";

type ChromeRender = () => ReactNode;

interface ShownChrome {
  render: ChromeRender;
  syncKey: string | undefined;
}

export interface OfficeDeferredChromeProps {
  /**
   * Builds the chrome from the host editor's current render. Called only when
   * the chrome actually repaints, so none of its elements (or the labels and
   * command states they read) are built on a render that skips it.
   */
  render: ChromeRender;
  /**
   * Structural identity that must never lag: the tab row, the active tab. A
   * change repaints in the same frame as the editor surface.
   */
  syncKey?: string;
  /**
   * The host editor's promise that this render changed nothing the chrome
   * shows (a scroll step that only mounts new grid rows). No background
   * repaint is scheduled for it; the chrome still repaints from this render
   * before any interaction reaches it.
   */
  quiet?: boolean;
  className?: string;
  /** "contents" lays the host element out as if absent (a pane body). */
  display?: "contents";
  testId?: string;
}

const INTERACTION_EVENTS = ["pointerdown", "keydown", "focusin"] as const;

/** A click on a checkbox or radio arrives with the box already toggled; a
 * repaint then would write the old `checked` back and swallow the change. */
function clickTogglesTarget(event: SyntheticEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement &&
    (target.type === "checkbox" || target.type === "radio")
  );
}

/**
 * Editor chrome (a ribbon) that does not repaint in the same frame as the
 * document surface when the user is working in the document.
 *
 * An editor built as one large render scope rebuilds its whole ribbon — every
 * group, label, command state and menu trigger — on each selection move, even
 * though the move rarely changes what the ribbon shows. This host keeps the
 * painted ribbon while the editor's own frame commits, then brings it up to
 * date at transition priority: a key held down in the grid coalesces into one
 * ribbon repaint when it stops, and each repaint yields to the next input.
 *
 * The ribbon is never stale where it matters:
 * - While the user works IN the ribbon (focus, pointer or keys inside it,
 *   including its portalled menus, which bubble through the React tree), it
 *   repaints in the same frame, so a typed combobox value or an opened menu
 *   never waits for a background pass.
 * - The first interaction with a ribbon that is still catching up repaints it
 *   synchronously before the event reaches any control, so every handler it
 *   runs is the one from the editor's latest render. (The one exception is a
 *   scripted click on a checkbox or radio with no press before it.)
 * - A `syncKey` change (a tab appearing, the active tab) repaints at once.
 */
export function OfficeDeferredChrome({
  render,
  syncKey,
  quiet = false,
  className,
  display,
  testId,
}: OfficeDeferredChromeProps) {
  const [shown, setShown] = useState<ShownChrome>(() => ({ render, syncKey }));
  const [engaged, setEngaged] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<ShownChrome>({ render, syncKey });
  const paintedRef = useRef<ChromeRender>(render);
  const markedEventsRef = useRef<WeakSet<Event>>(new WeakSet());
  const urgent = engaged || shown.syncKey !== syncKey;
  const painted = urgent ? render : shown.render;
  const node = useMemo(() => painted(), [painted]);

  useLayoutEffect(() => {
    latestRef.current = { render, syncKey };
    paintedRef.current = painted;
    if (quiet && !urgent) return;
    if (painted !== render || shown.render !== render) {
      // Catch up (or, after an in-frame repaint, let the resting state follow
      // it) at transition priority. A newer editor render schedules again;
      // the last scheduled update wins, so the resting state never goes back.
      startTransition(() => setShown({ render, syncKey }));
    }
  });

  const release = useCallback(() => {
    // Rest on what is painted now, never on an older pending pass.
    setShown(latestRef.current);
    setEngaged(false);
  }, []);

  const engage = useCallback(
    (event: SyntheticEvent, allowSyncRepaint: boolean) => {
      markedEventsRef.current.add(event.nativeEvent);
      if (allowSyncRepaint && paintedRef.current !== latestRef.current.render) {
        // The ribbon is behind the editor: repaint it from the latest render
        // before this event's bubble-phase handlers are collected.
        flushSync(() => setEngaged(true));
        return;
      }
      setEngaged(true);
    },
    [],
  );

  useEffect(() => {
    if (!engaged) return;
    const ownerDocument = hostRef.current?.ownerDocument ?? document;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // A document listener runs before React dispatches the same event, so the
    // verdict waits a task: an event that reached the ribbon's React tree
    // (its own DOM or a portalled menu) is marked by then.
    const onInteraction = (event: Event) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!markedEventsRef.current.has(event)) release();
      }, 0);
      timers.add(timer);
    };
    for (const type of INTERACTION_EVENTS) {
      ownerDocument.addEventListener(type, onInteraction, true);
    }
    return () => {
      for (const type of INTERACTION_EVENTS) {
        ownerDocument.removeEventListener(type, onInteraction, true);
      }
      for (const timer of timers) clearTimeout(timer);
    };
  }, [engaged, release]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid={testId}
      style={display === "contents" ? { display: "contents" } : undefined}
      onPointerDownCapture={(event) => engage(event, true)}
      onKeyDownCapture={(event) => engage(event, true)}
      // A pointer or key press has already repainted before a user's click;
      // a click with none (a script's .click()) repaints here, unless it
      // toggled a box.
      onClickCapture={(event) => engage(event, !clickTogglesTarget(event))}
      onContextMenuCapture={(event) => engage(event, true)}
      // Programmatic focus (a dialog handing focus back) may arrive inside a
      // commit, where a synchronous repaint is not allowed; the key or click
      // that follows it repaints first.
      onFocusCapture={(event) => engage(event, false)}
    >
      {node}
    </div>
  );
}
