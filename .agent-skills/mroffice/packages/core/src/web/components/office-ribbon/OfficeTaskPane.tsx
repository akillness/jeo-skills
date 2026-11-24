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
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  officeDialogClassName,
  officeDialogParts,
  type OfficeDialogTone,
} from "./officeDialogChrome";

import styles from "./OfficeTaskPane.module.css";
import { useOfficeTaskPaneDockSlot } from "./officeTaskPaneDock";
import {
  noteOfficeTaskPaneLeaving,
  noteOfficeTaskPaneShown,
} from "./officeTaskPaneMotion";
import { useOfficeScreenTipRegion } from "./OfficeScreenTipProvider";
import {
  OfficeTaskPaneOptions,
  useOfficeTaskPaneLayoutControls,
} from "./officeTaskPaneLayout";

/**
 * The shared docked task pane.
 *
 * `OfficeTaskPane` is the frame Word, Excel and PowerPoint all put a "format
 * this" surface in: a narrow non-modal column at the right of the document,
 * with a title row, an optional lede, a close button and bordered sections
 * (Microsoft Support, "Add a fill or effect to a shape or text box" — Format
 * Shape / Format Picture / Format Background are one pane, not three). Its
 * look lives in OfficeTaskPane.module.css, which the three editors' own pane
 * classes compose from, so a pane written before this component still takes
 * exactly the same chrome.
 *
 * It is deliberately non-modal: `role="dialog" aria-modal="false"`, the value
 * the deck's Format Background pane and Docs' Format Shape pane already
 * carried, so a screen reader announces a pane the user can leave, and the
 * editor behind it stays reachable. Escape closes it unless the editor lays
 * its panes out as Office does (`escapeKeepsPane`: Excel's panes stay open
 * on Escape); everything else — where it sits in the host's own box, what opens it, and
 * where the keyboard goes afterwards — stays with the host.
 *
 * It is seen coming and going (officeTaskPaneMotion.ts): it slides in from
 * the edge it docks at and fades in, and leaves the same way, a little
 * quicker, as a picture, while the pane itself is gone at once.
 */

export const officeTaskPaneParts = {
  pane: styles.pane,
  dockRight: styles.dockRight,
  header: styles.header,
  iconButton: styles.iconButton,
  headerActions: styles.headerActions,
  tabs: styles.tabs,
  tab: styles.tab,
  tabLabel: styles.tabLabel,
  tabItem: styles.tabItem,
  tabClose: styles.tabClose,
  title: styles.title,
  description: styles.description,
  close: styles.close,
  body: styles.body,
  section: styles.section,
  sectionLabel: styles.sectionLabel,
  field: styles.field,
  row: styles.row,
  check: styles.check,
  hint: styles.hint,
  button: styles.button,
  footer: styles.footer,
  gallery: styles.gallery,
  galleryOption: styles.galleryOption,
} as const;

/**
 * One tab of a dock that holds several panes at once.
 *
 * When a second task pane opens, Office does not lay it over the first: the
 * panes share the one dock at the right of the window, one shows at a time,
 * and each open pane keeps a tab there until its own X closes it (Microsoft
 * Q&A, "PowerPoint 2019 - View both Animation and Selection Pane at the same
 * time"; Microsoft Support, "Manage pane layout in Office apps": a task pane
 * "attaches itself to the edge of the app window"). A host that docks
 * several panes passes every open pane's tab to each of them; the pane's own
 * tab is the `selected` one and is its title.
 */
/**
 * An editor that draws its task panes in the dialogs' chrome (the Cupertino
 * glass card, title row and round close button of OfficeDialogChrome.css)
 * provides its tone here; a pane under no provider keeps this module's look.
 * The workbook opts in; Docs' own panels are unchanged.
 */
const OfficeTaskPaneChromeContext = createContext<OfficeDialogTone | null>(null);

export function OfficeTaskPaneChromeProvider({
  tone,
  children,
}: {
  readonly tone: OfficeDialogTone;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <OfficeTaskPaneChromeContext.Provider value={tone}>
      {children}
    </OfficeTaskPaneChromeContext.Provider>
  );
}

/** The chrome tone task panes here are drawn in, or null for the pane look. */
export function useOfficeTaskPaneChrome(): OfficeDialogTone | null {
  return useContext(OfficeTaskPaneChromeContext);
}

export interface OfficeTaskPaneTab {
  readonly key: string;
  readonly label: string;
  readonly selected: boolean;
  /** Bring this tab's pane to the front of the dock. */
  readonly onSelect?: () => void;
  readonly testId?: string;
  readonly controlId?: string;
  readonly tabRef?: React.Ref<HTMLButtonElement>;
  /** Close this tab's pane from its tab (Excel: every tab of a pane group
   * carries its own close button). */
  readonly onClose?: () => void;
  readonly closeLabel?: string;
  readonly closeTestId?: string;
}

export interface OfficeTaskPaneProps {
  readonly title: string;
  /** The line under the title; Office panes often have none. */
  readonly description?: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  /** `<prefix>` gives `<prefix>-pane` and `<prefix>-pane-close`. */
  readonly testIdPrefix: string;
  /** A pane that predates this frame keeps the root test id its tests and
   * the dialog galleries already address (`styles-panel`,
   * `presentation-accessibility-panel`, …) instead of `<prefix>-pane`. */
  readonly testId?: string;
  /** Likewise for the close button's test id. */
  readonly closeTestId?: string;
  /** Extra classes on the close button (a host's own target-size and focus
   * utilities, e.g. the PDF panes' 44px hit area). */
  readonly closeClassName?: string;
  /** The close button is shown but cannot be used (a write in flight that
   * closing would orphan). Escape is ignored while it is set. */
  readonly closeDisabled?: boolean;
  /** No close button at all (a pane whose host has not wired one). */
  readonly hideClose?: boolean;
  /** Put the keyboard on the close button when the pane mounts (a pane
   * another pane sent the user to, as Office does). */
  readonly autoFocusClose?: boolean;
  /** The close button, for a pane that moves the keyboard there itself. */
  readonly closeRef?: React.Ref<HTMLButtonElement>;
  /** Likewise for the title's element id (`<prefix>-pane-title`). */
  readonly titleId?: string;
  /** The id of a description the pane is read with (a hidden hint). */
  readonly describedBy?: string;
  /** `data-control-id` of the pane and of its close button, for a host whose
   * controls are addressed by a stable control id. */
  readonly controlId?: string;
  readonly closeControlId?: string;
  /** Controls in the title row before the close button (a pane's own
   * filter or "new" button, as Word's Comments pane has). */
  readonly headerActions?: ReactNode;
  /** The dock's open panes, when the host docks more than one: the title row
   * becomes their tab strip (see OfficeTaskPaneTab). A pane mounted in a
   * registry dock's slot (OfficeTaskPaneDockSlot) takes the slot's strip and
   * hidden state when it passes neither. */
  readonly tabs?: readonly OfficeTaskPaneTab[];
  /** The accessible name of that tab strip. */
  readonly tabsLabel?: string;
  /** A pane that keeps its node while it is not showing — closed but kept
   * mounted, or behind another pane of the same dock — passes true. It is
   * then no dialog at all: hidden from sight, from the accessibility tree and
   * from "what is still open?" sweeps. */
  readonly hidden?: boolean;
  /** Escape closes the pane (the default here). A control inside that gives
   * Escape a meaning first (a field that reverts, a menu) handles it there
   * and calls preventDefault; a pane that must never close on Escape passes
   * false. An editor laying its panes out as Office does
   * (OfficeTaskPaneLayoutContext, `escapeKeepsPane`) keeps them open, as
   * Excel's task panes stay open on Escape. */
  readonly closeOnEscape?: boolean;
  readonly style?: CSSProperties;
  /** The pane's element id, for a host control's `aria-controls`. */
  readonly id?: string;
  /** The pane is still filling in (aria-busy), e.g. a search in progress. */
  readonly busy?: boolean;
  /** `data-*` attributes a pane's tests or styles read on its root. */
  readonly dataAttributes?: Readonly<Record<`data-${string}`, string>>;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  /** Dock flush with the right edge of the host's own box (the default). A
   * host that places the pane itself — a grid column, a floating card —
   * passes false and positions `className` instead. */
  readonly dockRight?: boolean;
  readonly className?: string;
  readonly paneRef?: React.Ref<HTMLElement>;
  readonly children: ReactNode;
}

/**
 * The title row's tab strip: every open pane of the dock, the selected one
 * being this pane. Arrow keys, Home and End move between them and bring the
 * pane forward (automatic activation), as a tab strip does.
 */
export function OfficeTaskPaneTabs({
  tabs,
  label,
  selectedId,
}: {
  readonly tabs: readonly OfficeTaskPaneTab[];
  readonly label?: string;
  /** The element id of the selected tab: the pane's title. */
  readonly selectedId: string;
}): React.JSX.Element {
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.selected),
  );
  return (
    <span
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={officeTaskPaneParts.tabs}
      data-tab-count={tabs.length}
      onKeyDown={(event) => {
        const last = tabs.length - 1;
        const target =
          event.key === "ArrowRight"
            ? selectedIndex === last
              ? 0
              : selectedIndex + 1
            : event.key === "ArrowLeft"
              ? selectedIndex === 0
                ? last
                : selectedIndex - 1
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? last
                  : null;
        if (target === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (target !== selectedIndex) tabs[target]?.onSelect?.();
      }}
    >
      {tabs.map((tab) => {
        const button = (
          <button
            key={tab.key}
            ref={tab.tabRef}
            type="button"
            role="tab"
            id={tab.selected ? selectedId : undefined}
            aria-selected={tab.selected}
            tabIndex={tab.selected ? 0 : -1}
            className={officeTaskPaneParts.tab}
            title={tab.label}
            data-testid={tab.testId}
            data-control-id={tab.controlId}
            onClick={() => {
              if (!tab.selected) tab.onSelect?.();
            }}
          >
            {/* The label is its own box: the tab is a flex container (a
                host's button rules may make it one), and text-overflow does
                not reach the anonymous text of a flex container, so a narrow
                tab clipped mid-letter instead of ending in an ellipsis. */}
            <span className={officeTaskPaneParts.tabLabel}>{tab.label}</span>
          </button>
        );
        // The pane in front closes with the title bar's X (a lone tab is
        // the title itself); a tab behind it carries its own.
        if (!tab.onClose || tab.selected || tabs.length < 2) return button;
        return (
          <span
            key={tab.key}
            role="presentation"
            className={officeTaskPaneParts.tabItem}
            data-selected={tab.selected || undefined}
          >
            {button}
            {/* Beside the tab, not in it (a button holds no button); the
                keyboard closes a pane through Task Pane Options. */}
            <button
              type="button"
              tabIndex={-1}
              className={officeTaskPaneParts.tabClose}
              data-ui-close="small"
              aria-label={tab.closeLabel}
              title={tab.closeLabel}
              data-testid={tab.closeTestId}
              onClick={tab.onClose}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        );
      })}
    </span>
  );
}

/** A pane in a registry dock tells it how the pane closes, so the pane's
 * tab can carry its own close button (the dock calls it only on a click). */
function useReportOfficeTaskPaneClose(
  report: ((close: (() => void) | null) => void) | undefined,
  close: (() => void) | undefined,
): void {
  // The dock gets one callback per mount, which calls the latest close.
  const latest = useRef(close);
  useLayoutEffect(() => {
    latest.current = close;
  });
  const closable = Boolean(close);
  useLayoutEffect(() => {
    if (!report || !closable) return;
    report(() => latest.current?.());
    return () => report(null);
  }, [closable, report]);
}

/**
 * The title of a pane that draws its own header (a Format pane written before
 * OfficeTaskPane): inside a registry dock's slot it is the dock's tab strip,
 * as OfficeTaskPane's title row is; anywhere else it is the plain title.
 */
export function OfficeTaskPaneDockedTitle({
  title,
  onClose,
}: {
  readonly title: string;
  /** How the pane closes (its X), for its tab's close button. */
  readonly onClose?: () => void;
}): React.JSX.Element {
  const slot = useOfficeTaskPaneDockSlot(title);
  useReportOfficeTaskPaneClose(slot?.setClose, onClose);
  const id = useId();
  return slot && slot.tabs.length > 0 ? (
    <span>
      <OfficeTaskPaneTabs
        tabs={slot.tabs}
        label={slot.tabsLabel}
        selectedId={id}
      />
    </span>
  ) : (
    <strong>{title}</strong>
  );
}

export function OfficeTaskPane({
  title,
  description,
  closeLabel,
  onClose,
  testIdPrefix,
  dockRight = true,
  className,
  paneRef,
  id,
  busy,
  testId,
  closeTestId,
  closeClassName,
  closeDisabled,
  hideClose,
  autoFocusClose,
  closeRef,
  titleId: titleIdOverride,
  describedBy,
  controlId,
  closeControlId,
  headerActions,
  tabs,
  tabsLabel,
  hidden,
  closeOnEscape = true,
  style,
  dataAttributes,
  onKeyDown,
  children,
}: OfficeTaskPaneProps): React.JSX.Element {
  const titleId = titleIdOverride ?? `${testIdPrefix}-pane-title`;
  const slot = useOfficeTaskPaneDockSlot(title);
  useReportOfficeTaskPaneClose(
    slot?.setClose,
    hideClose || closeDisabled ? undefined : onClose,
  );
  // The Task Pane Options menu, where the editor lays its panes out
  // (officeTaskPaneLayout.tsx): only a pane in a dock has a place to keep.
  const layoutControls = useOfficeTaskPaneLayoutControls();
  const showOptions = Boolean(layoutControls && slot && !hideClose);
  const chromeTone = useOfficeTaskPaneChrome();
  // Inside an editor's ScreenTip provider, the pane's buttons show the card
  // (its fields keep their labels; Office's panes tip only their buttons).
  const screenTipRegion = useOfficeScreenTipRegion();
  tabs ??= slot?.tabs;
  tabsLabel ??= slot?.tabsLabel;
  hidden ??= slot?.hidden || undefined;
  // Focus stays in an open pane, so Escape and the next key still reach it:
  // the pane itself takes a click that lands on no control (Safari focuses
  // no clicked button and would hand focus to the window), and a control
  // that turns disabled or leaves while focused (Replace All with nothing
  // left to replace) hands focus to the pane instead of the page.
  const paneElementRef = useRef<HTMLElement | null>(null);
  const paneOwnsFocusRef = useRef(false);
  const setPaneElement = useCallback(
    (node: HTMLElement | null) => {
      paneElementRef.current = node;
      if (typeof paneRef === "function") paneRef(node);
      else if (paneRef) {
        (paneRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [paneRef],
  );
  useLayoutEffect(() => {
    const pane = paneElementRef.current;
    if (!pane || hidden || !paneOwnsFocusRef.current) return;
    const dropped = () => {
      const active = document.activeElement;
      return (
        !active ||
        active === document.body ||
        !active.isConnected ||
        (pane.contains(active) && active.matches(":disabled"))
      );
    };
    if (!dropped()) return;
    // Judged a frame later: a field committing as it loses focus renders
    // while focus is between it and the field clicked next (on the body),
    // and taking it then cancelled the click's own focus, so typing went to
    
    const frame = requestAnimationFrame(() => {
      if (pane.isConnected && dropped()) pane.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  });
  // Seen coming and going: shown (mounted, or no longer hidden) it slides in
  // from its edge; leaving (unmounted, or hidden) its picture slides out.
  // A pane taking another's place at once (a tab of the dock) is instant.
  const showing = !hidden;
  useLayoutEffect(() => {
    const pane = paneElementRef.current;
    if (!pane || !showing) return;
    const shown = noteOfficeTaskPaneShown(pane);
    return () => noteOfficeTaskPaneLeaving(shown);
  }, [showing]);
  return (
    <aside
      ref={setPaneElement}
      id={id}
      tabIndex={-1}
      onFocus={() => {
        paneOwnsFocusRef.current = true;
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        if (next) {
          paneOwnsFocusRef.current = false;
          return;
        }
        // Focus that left for nowhere from a control still there and usable
        // is the person leaving the pane.
        const from = event.target;
        requestAnimationFrame(() => {
          if (
            from.isConnected &&
            !(from instanceof HTMLElement && from.matches(":disabled"))
          ) {
            paneOwnsFocusRef.current = false;
          }
        });
      }}
      className={[
        officeTaskPaneParts.pane,
        dockRight ? officeTaskPaneParts.dockRight : null,
        chromeTone ? officeDialogClassName({ tone: chromeTone, pane: true }) : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={hidden ? undefined : "dialog"}
      aria-modal={hidden ? undefined : "false"}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      aria-busy={busy}
      aria-hidden={hidden === undefined ? undefined : hidden}
      hidden={hidden || undefined}
      // What the pane motion (officeTaskPaneMotion.ts) looks for.
      data-office-task-pane=""
      data-office-task-pane-edge={dockRight ? "right" : undefined}
      data-testid={testId ?? `${testIdPrefix}-pane`}
      data-control-id={controlId}
      {...screenTipRegion}
      data-office-screen-tip-controls={screenTipRegion["data-office-screen-tips"] ? "buttons" : undefined}
      {...dataAttributes}
      style={style}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          !closeOnEscape ||
          // An editor laying its panes out as Office does keeps them open.
          layoutControls?.escapeKeepsPane ||
          hideClose ||
          closeDisabled ||
          event.key !== "Escape"
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header
        className={
          chromeTone
            ? `${officeTaskPaneParts.header} ${officeDialogParts.header}`
            : officeTaskPaneParts.header
        }
      >
        <span>
          {tabs && tabs.length > 0 ? (
            <OfficeTaskPaneTabs
              tabs={tabs}
              label={tabsLabel}
              selectedId={titleId}
            />
          ) : (
            <strong
              id={titleId}
              className={chromeTone ? officeDialogParts.title : undefined}
            >
              {title}
            </strong>
          )}
          {description ? (
            <small className={chromeTone ? officeDialogParts.description : undefined}>
              {description}
            </small>
          ) : null}
        </span>
        {headerActions ? (
          <span className={officeTaskPaneParts.headerActions}>
            {headerActions}
          </span>
        ) : null}
        {showOptions && slot ? (
          <OfficeTaskPaneOptions
            paneId={slot.id}
            onClose={onClose}
            closeDisabled={closeDisabled}
            // A bare arrow beside the X, as Office draws it.
            className={[
              officeTaskPaneParts.iconButton,
              chromeTone ? officeDialogParts.iconButton : null,
            ]
              .filter(Boolean)
              .join(" ")}
            testIdPrefix={testIdPrefix}
          />
        ) : null}
        {hideClose ? null : (
          <button
            type="button"
            className={[
              officeTaskPaneParts.close,
              chromeTone ? officeDialogParts.close : null,
              closeClassName,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onClose}
            disabled={closeDisabled || undefined}
            aria-label={closeLabel}
            title={closeLabel}
            ref={closeRef}
            autoFocus={autoFocusClose}
            data-testid={closeTestId ?? `${testIdPrefix}-pane-close`}
            data-control-id={closeControlId}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </header>
      {children}
    </aside>
  );
}
