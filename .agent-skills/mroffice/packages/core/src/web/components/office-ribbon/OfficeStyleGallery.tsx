"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type HTMLAttributes,
  type CSSProperties,
  cloneElement,
} from "react";
import { flushSync } from "react-dom";

import {
  OfficeGalleryMenuContent,
  OfficeGalleryMenuFooter,
  OfficeGalleryMenuSection,
  officeGalleryMenuGridStyle,
  officeGalleryMenuStyles,
} from "./OfficeGalleryMenu";
import { OfficeHomeMenuTrigger } from "./OfficeHomeRibbon";
import { OfficeRibbonGallery } from "./OfficeRibbonGallery";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import { officePreviewIgnoresPointer } from "./officeFormatPreview";
import styles from "./OfficeStyleGallery.module.css";

export interface OfficeStyleGalleryItem<K extends string> {
  readonly id: K;
  readonly label: string;
  readonly groupId?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export interface OfficeStyleGalleryGroup<K extends string> {
  readonly id: string;
  readonly label: string;
  readonly itemIds: readonly K[];
  /** A command row below the sheet's rule (Table Styles' Clear), not tiles. */
  readonly placement?: "footer";
}

/**
 * The More menu's sheet, as Office sizes it for this gallery: so many columns
 * of tiles, each tile the thumbnail box (width x height) in a thin frame. The
 * menu is as wide as that grid, never a fixed sheet.
 */
export interface OfficeStyleGalleryMenuGrid {
  readonly columns: number;
  readonly thumbnail: readonly [width: number, height: number];
  readonly gap?: number;
}

/** A tile's frame around its thumbnail: 3px padding and a 1px border a side. */
const MENU_TILE_FRAME_PX = 8;

function defaultMenuGrid(
  tile: NonNullable<OfficeStyleGalleryProps<string>["menuTile"]>,
  mode: NonNullable<OfficeStyleGalleryProps<string>["menuMode"]>,
): OfficeStyleGalleryMenuGrid {
  // Office's Picture Styles sheet: seven thumbnails a row.
  if (tile === "picture") return { columns: 7, thumbnail: [80, 66] };
  // A swatch sheet (table styles in PowerPoint for the web): six a row.
  if (mode === "preview-only") return { columns: 6, thumbnail: [64, 48] };
  if (tile === "framed") return { columns: 5, thumbnail: [88, 40] };
  // PowerPoint's SmartArt sheets: five captioned drawings a row.
  return { columns: 5, thumbnail: [84, 64] };
}

export interface OfficeStyleGalleryProps<K extends string> {
  readonly application: "docs" | "spreadsheet" | "presentation" | "pdf";
  readonly ariaLabel: string;
  readonly labels: Readonly<{ more: string }>;
  readonly items: readonly OfficeStyleGalleryItem<K>[];
  readonly quickIds: readonly K[];
  /** Visible width only; the rest of the existing catalog remains scrollable. */
  readonly visibleItemCount?: number;
  readonly groups?: readonly OfficeStyleGalleryGroup<K>[];
  /**
   * An item may stand in several groups (Office's SmartArt layouts: one
   * layout in every tab its definition names). Off, an item is shown in its
   * first group only. A repeat's tile is the same item -- one value, one
   * commit -- with its own test id (`…-menu-<group>-<item>`).
   */
  readonly repeatAcrossGroups?: boolean;
  readonly value: K | null;
  readonly disabled?: boolean;
  readonly renderPreview: (
    item: OfficeStyleGalleryItem<K>,
    surface: "inline" | "menu",
  ) => ReactNode;
  readonly onPreviewChange: (id: K | null) => void;
  readonly onCommit: (id: K) => void;
  readonly className?: string;
  /** An editor's own touches on the menu (never its size: see `menuGrid`). */
  readonly menuClassName?: string;
  /** The More menu's columns and thumbnail box; a default per `menuTile`. */
  readonly menuGrid?: OfficeStyleGalleryMenuGrid;
  /** Keep the shared interaction shell while exposing a Web-style swatch-only menu. */
  readonly menuMode?: "labeled" | "preview-only";
  /**
   * Head each group with its label in a preview-only menu too. A labeled menu
   * always does; a swatch-only sheet whose Office original heads its sections
   * (Shape Styles' "Theme Styles" / "Presets") opts in.
   */
  readonly groupHeadings?: boolean;
  /** How a popover tile is drawn. "art" (default) is Office's gallery sheet —
   * no card frame, the preview large and centred with its caption beneath;
   * "framed" is the older bordered card with a small 24px framed glyph;
   * "picture" is Office's Picture Styles sheet — no frame, no caption (the
   * name is the tooltip and accessible label), one large centred thumbnail
   * per cell on an even seven-column grid. It also draws the inline strip's
   * tiles frameless. */
  readonly menuTile?: "framed" | "art" | "picture";
  /** Reuse the exact grouped menu behind an editor-owned Ribbon trigger. */
  readonly menuTrigger?: ReactElement;
  /** Drawn at the top of the menu (Chart Styles' Style / Color tabs). */
  readonly menuHeader?: ReactNode;
  /** Drawn in place of the gallery's grid while set (the Color tab). */
  readonly menuBody?: ReactNode;
  readonly testIdPrefix?: string;
}

interface ResolvedGroup<K extends string> {
  readonly id: string;
  readonly label: string | null;
  readonly items: readonly OfficeStyleGalleryItem<K>[];
  readonly placement?: "footer";
}

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

function GalleryRoot({
  menuOnly,
  tile,
  application,
  ariaLabel,
  className,
  testIdPrefix,
  visibleItemCount,
  children,
}: {
  menuOnly: boolean;
  tile: NonNullable<OfficeStyleGalleryProps<string>["menuTile"]>;
  application: OfficeStyleGalleryProps<string>["application"];
  ariaLabel: string;
  className?: string;
  testIdPrefix: string;
  visibleItemCount: number;
  children: ReactNode;
}) {
  if (menuOnly) return <>{children}</>;
  const [viewport, more] = Children.toArray(children);
  return (
    <OfficeRibbonGallery
      className={classes(styles.gallery, className)}
      role="toolbar"
      ariaLabel={ariaLabel}
      aria-orientation="horizontal"
      data-application={application}
      data-tile={tile}
      testId={testIdPrefix}
      style={{ "--office-gallery-visible-items": visibleItemCount } as CSSProperties}
      viewport={viewport as ReactElement<HTMLAttributes<HTMLDivElement>>}
      more={more}
    />
  );
}

function titleProps(label: string, item: string, fallback?: string) {
  if (label === item) return fallback ? { title: fallback } : {};
  return { title: label, "data-disabled-reason": label };
}
function uniqueItemsById<K extends string>(
  items: readonly OfficeStyleGalleryItem<K>[],
) {
  const seen = new Set<K>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function resolveGroups<K extends string>(
  items: readonly OfficeStyleGalleryItem<K>[],
  groups: readonly OfficeStyleGalleryGroup<K>[] | undefined,
  repeatAcrossGroups = false,
): readonly ResolvedGroup<K>[] {
  if (!groups?.length) {
    return [{ id: "all", label: null, items }];
  }

  const itemById = new Map(items.map((item) => [item.id, item] as const));
  const assigned = new Set<K>();
  const resolved: ResolvedGroup<K>[] = groups.flatMap((group) => {
    const inGroup = new Set<K>();
    const groupItems = group.itemIds.flatMap((id) => {
      const item = itemById.get(id);
      if (!item || inGroup.has(id) || (assigned.has(id) && !repeatAcrossGroups)) return [];
      inGroup.add(id);
      assigned.add(id);
      return [item];
    });
    return groupItems.length
      ? [{ id: group.id, label: group.label, items: groupItems, placement: group.placement }]
      : [];
  });
  const ungrouped = items.filter((item) => !assigned.has(item.id));
  if (ungrouped.length) {
    resolved.push({ id: "ungrouped", label: null, items: ungrouped });
  }
  return resolved;
}

/**
 * Controlled Office-style gallery interaction shell.
 *
 * The host owns native authority, frozen targets, document mutations and Undo.
 * This component owns only roving focus, temporary preview lifecycle and the
 * shared More surface. Preview restoration always precedes a commit.
 */













const STRIP_PREVIEWS_BEYOND_VISIBLE = 7;
function canDrawPreviewsWhenIdle(): boolean {
  return typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
}

export function OfficeStyleGallery<K extends string>({
  application,
  ariaLabel,
  labels,
  items,
  quickIds,
  visibleItemCount,
  groups,
  repeatAcrossGroups = false,
  value,
  disabled = false,
  renderPreview,
  onPreviewChange,
  onCommit,
  className,
  menuClassName,
  menuGrid,
  menuMode = "labeled",
  groupHeadings = false,
  menuTile = "art",
  menuTrigger,
  menuHeader,
  menuBody,
  testIdPrefix = "office-style-gallery",
}: OfficeStyleGalleryProps<K>) {
  // Office's Picture Styles sheet never captions a thumbnail.
  const effectiveMenuMode = menuTile === "picture" ? "preview-only" : menuMode;
  const sheet = menuGrid ?? defaultMenuGrid(menuTile, effectiveMenuMode);
  const uniqueItems = useMemo(() => uniqueItemsById(items), [items]);
  const itemById = useMemo(
    () => new Map(uniqueItems.map((item) => [item.id, item] as const)),
    [uniqueItems],
  );
  const quickItems = useMemo(() => {
    const seen = new Set<K>();
    const preferred = quickIds.flatMap((id) => {
      const item = itemById.get(id);
      if (!item || seen.has(id)) return [];
      seen.add(id);
      return [item];
    });
    return [...preferred, ...uniqueItems.filter((item) => !seen.has(item.id))];
  }, [itemById, quickIds, uniqueItems]);
  const resolvedGroups = useMemo(
    () => resolveGroups(uniqueItems, groups, repeatAcrossGroups),
    [groups, repeatAcrossGroups, uniqueItems],
  );
  const sheetGroups = resolvedGroups.filter((group) => group.placement !== "footer");
  // Where each item is first shown, for a repeated item's own test id.
  const firstGroupOf = new Map<K, string>();
  for (const group of sheetGroups) {
    for (const item of group.items) if (!firstGroupOf.has(item.id)) firstGroupOf.set(item.id, group.id);
  }
  const footerGroups = resolvedGroups.filter((group) => group.placement === "footer");
  const enabledQuickIds = useMemo(
    () =>
      quickItems
        .filter((item) => !disabled && !item.disabled)
        .map((item) => item.id),
    [disabled, quickItems],
  );
  const hasEnabledMenuItem = uniqueItems.some(
    (item) => !disabled && !item.disabled,
  );
  // Office greys the gallery's own button when nothing in it applies (Quick
  // Layout on a chart whose writer can state none of the layouts), with the
  // reason on the tooltip. Opening a menu that only holds refused entries and
  // closing it again read as a flash; the menu never opens instead.
  const menuUnavailableReason = hasEnabledMenuItem
    ? undefined
    : uniqueItems.find((item) => item.disabledReason)?.disabledReason;
  const stripVisibleCount = Math.max(1, visibleItemCount ?? Math.min(7, quickIds.length || uniqueItems.length));
  const stripEagerCount = stripVisibleCount + STRIP_PREVIEWS_BEYOND_VISIBLE;
  const [stripPreviewsComplete, setStripPreviewsComplete] = useState(
    () => Boolean(menuTrigger) || !canDrawPreviewsWhenIdle(),
  );
  const stripPreviewsPending = !stripPreviewsComplete && quickItems.length > stripEagerCount;
  useEffect(() => {
    if (!stripPreviewsPending) return;
    const handle = window.requestIdleCallback(() => setStripPreviewsComplete(true), { timeout: 500 });
    return () => window.cancelIdleCallback(handle);
  }, [stripPreviewsPending]);
  /** Draw the previews out of sight now, before what is about to show them. */
  const completeStripPreviews = () => {
    if (stripPreviewsPending) flushSync(() => setStripPreviewsComplete(true));
  };
  const [rovingId, setRovingId] = useState<K | null>(value);
  const [menuOpen, setMenuOpen] = useState(false);
  const previewIdRef = useRef<K | null>(null);
  const previewCallbackRef = useRef(onPreviewChange);
  const buttonRefs = useRef(new Map<K, HTMLButtonElement>());
  const effectiveRovingId = enabledQuickIds.includes(rovingId as K)
    ? rovingId
    : value && enabledQuickIds.includes(value)
      ? value
      : (enabledQuickIds[0] ?? null);

  const publishPreview = useCallback(
    (id: K | null, force = false) => {
      if (!force && previewIdRef.current === id) return;
      previewIdRef.current = id;
      onPreviewChange(id);
    },
    [onPreviewChange],
  );

  useEffect(() => {
    previewCallbackRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(
    () => () => {
      if (previewIdRef.current === null) return;
      previewIdRef.current = null;
      previewCallbackRef.current(null);
    },
    [],
  );

  useEffect(() => {
    const previewId = previewIdRef.current;
    if (previewId === null) return;
    const previewItem = itemById.get(previewId);
    if (!disabled && previewItem && !previewItem.disabled) return;
    previewIdRef.current = null;
    onPreviewChange(null);
  }, [disabled, itemById, onPreviewChange]);

  useEffect(() => {
    if (hasEnabledMenuItem || !menuOpen) return;
    const timeout = window.setTimeout(() => {
      setMenuOpen(false);
      publishPreview(null);
    });
    return () => window.clearTimeout(timeout);
  }, [hasEnabledMenuItem, menuOpen, publishPreview]);

  const commit = (id: K) => {
    const item = itemById.get(id);
    if (disabled || !item || item.disabled) return;
    publishPreview(null, true);
    setRovingId(id);
    onCommit(id);
  };

  const moveInlineFocus = (
    currentId: K,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      publishPreview(null, true);
      return;
    }
    if (!enabledQuickIds.length) return;

    const currentIndex = Math.max(0, enabledQuickIds.indexOf(currentId));
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % enabledQuickIds.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + enabledQuickIds.length) % enabledQuickIds.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledQuickIds.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const nextId = enabledQuickIds[nextIndex];
    setRovingId(nextId);
    buttonRefs.current.get(nextId)?.focus();
  };

  const clearOnInlineBlur = (event: FocusEvent<HTMLButtonElement>) => {
    const next = event.relatedTarget;
    if (
      next instanceof HTMLElement &&
      next.dataset.officeStyleGalleryPreviewItem === "true"
    ) {
      return;
    }
    publishPreview(null);
  };

  return (
    <GalleryRoot
      menuOnly={Boolean(menuTrigger)}
      tile={menuTile}
      application={application}
      ariaLabel={ariaLabel}
      className={className}
      testIdPrefix={testIdPrefix}
      visibleItemCount={stripVisibleCount}
    >
      {menuTrigger ? null : (
        <div
          className={styles.quickItems}
          data-testid={`${testIdPrefix}-quick`}
          onMouseLeave={() => publishPreview(null)}
          onPointerEnter={completeStripPreviews}
          onFocusCapture={completeStripPreviews}
          onKeyDownCapture={completeStripPreviews}
          onWheelCapture={completeStripPreviews}
          onScroll={completeStripPreviews}
        >
          {quickItems.map((item, index) => {
            const itemDisabled = disabled || Boolean(item.disabled);
            const selected = value === item.id;
            const accessibleLabel =
              itemDisabled && item.disabledReason
                ? `${item.label}: ${item.disabledReason}`
                : item.label;
            return (
              <span
                key={item.id}
                className={styles.tileHitArea}
                onMouseEnter={(event) => {
                  // a tap's compatibility mouseenter: no hover, no preview
                  if (officePreviewIgnoresPointer(event)) return;
                  publishPreview(itemDisabled ? null : item.id);
                }}
              >
                <button
                  ref={(node) => {
                    if (node) buttonRefs.current.set(item.id, node);
                    else buttonRefs.current.delete(item.id);
                  }}
                  type="button"
                  className={styles.tile}
                  disabled={itemDisabled}
                  aria-label={accessibleLabel}
                  aria-pressed={selected}
                  {...titleProps(accessibleLabel, item.label, item.label)}
                  tabIndex={
                    !itemDisabled && effectiveRovingId === item.id ? 0 : -1
                  }
                  data-item-id={item.id}
                  data-selected={selected ? "true" : "false"}
                  data-office-style-gallery-preview-item="true"
                  data-testid={`${testIdPrefix}-inline-${item.id}`}
                  onFocus={() => {
                    if (itemDisabled) return;
                    setRovingId(item.id);
                    publishPreview(item.id);
                  }}
                  onBlur={clearOnInlineBlur}
                  onKeyDown={(event) => moveInlineFocus(item.id, event)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(item.id)}
                >
                  {stripPreviewsPending && index >= stripEagerCount ? (
                    // The same box, drawn once the browser is idle (above).
                    <span className={styles.preview} aria-hidden="true" data-office-preview-deferred="true" />
                  ) : (
                    <span className={styles.preview} aria-hidden="true">
                      {renderPreview(item, "inline")}
                    </span>
                  )}
                  <span className={styles.label}>{item.label}</span>
                </button>
              </span>
            );
          })}
        </div>
      )}

      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (open && !hasEnabledMenuItem) return;
          setMenuOpen(open);
          publishPreview(null);
        }}
      >
        <DropdownMenuTrigger asChild disabled={!hasEnabledMenuItem}>
          {menuTrigger ? (
            hasEnabledMenuItem
              ? menuTrigger
              : typeof (menuTrigger as ReactElement).type === "string"
                ? // A plain element (the chart's quick Styles button) takes the
                  // reason as its tooltip; `disabledReason` is a component
                  // prop and reached the DOM as an unknown attribute.
                  cloneElement(menuTrigger as ReactElement<{ disabled?: boolean; title?: string }>, {
                    disabled: true,
                    ...(menuUnavailableReason ? { title: menuUnavailableReason } : {}),
                  })
                : cloneElement(menuTrigger as ReactElement<{ disabled?: boolean; disabledReason?: string }>, {
                    disabled: true,
                    ...(menuUnavailableReason
                      ? { disabledReason: menuUnavailableReason }
                      : {}),
                  })
          ) : (
            <OfficeHomeMenuTrigger
              geometry="gallery"
              disabled={!hasEnabledMenuItem}
              icon={
                <OfficeSemanticIcon semanticId="menu.chevron.down" size={14} />
              }
              label={labels.more}
              testId={`${testIdPrefix}-more`}
              variant="icon"
              onFocus={() => publishPreview(null)}
              onMouseEnter={() => publishPreview(null)}
            />
          )}
        </DropdownMenuTrigger>
        <OfficeGalleryMenuContent
          className={classes(styles.menu, menuClassName)}
          style={{
            ...officeGalleryMenuGridStyle(
              sheet.columns,
              sheet.thumbnail[0] + MENU_TILE_FRAME_PX,
              sheet.gap,
            ),
            "--office-style-gallery-thumb-width": `${sheet.thumbnail[0]}px`,
            "--office-style-gallery-thumb-height": `${sheet.thumbnail[1]}px`,
          } as CSSProperties}
          aria-label={ariaLabel}
          data-application={application}
          data-menu-mode={effectiveMenuMode}
          data-menu-tile={menuTile}
          data-testid={`${testIdPrefix}-menu`}
          onEscapeKeyDown={() => publishPreview(null)}
          onPointerLeave={() => publishPreview(null)}
          onPointerMove={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("[data-disabled][data-item-id]")
            ) {
              publishPreview(null);
            }
          }}
        >
          {menuHeader}
          {menuBody !== undefined ? menuBody : sheetGroups.map((group, index) => {
            const heading =
              group.label && (effectiveMenuMode === "labeled" || groupHeadings)
                ? group.label
                : null;
            return (
              <DropdownMenuGroup
                key={group.id}
                data-headed={heading ? "true" : undefined}
              >
                {heading ? (
                  <OfficeGalleryMenuSection>
                    {heading}
                  </OfficeGalleryMenuSection>
                ) : index > 0 ? (
                  <DropdownMenuSeparator />
                ) : null}
                <DropdownMenuRadioGroup
                  value={value ?? undefined}
                  className={officeGalleryMenuStyles.grid}
                >
                  {group.items.map((item) => {
                    const itemDisabled = disabled || Boolean(item.disabled);
                    const accessibleLabel =
                      itemDisabled && item.disabledReason
                        ? `${item.label}: ${item.disabledReason}`
                        : item.label;
                    const captioned = effectiveMenuMode === "labeled";
                    return (
                      <div
                        key={item.id}
                        className={styles.menuItemHitArea}
                        // A disabled tile takes no pointer, so its own tooltip
                        // never shows: the reason hangs on the area around it.
                        title={itemDisabled && item.disabledReason ? accessibleLabel : undefined}
                        onPointerMove={(event) => {
                          // a finger scrolling the sheet passes over items
                          if (officePreviewIgnoresPointer(event)) return;
                          publishPreview(itemDisabled ? null : item.id);
                        }}
                      >
                        <DropdownMenuRadioItem
                          value={item.id}
                          disabled={itemDisabled}
                          className={officeGalleryMenuStyles.tile}
                          aria-label={accessibleLabel}
                          // An uncaptioned thumbnail, and a caption the tile
                          // cuts short, name themselves in the tooltip, as
                          // Office's sheets do.
                          {...titleProps(accessibleLabel, item.label, item.label)}
                          data-item-id={item.id}
                          data-nameless={captioned ? undefined : "true"}
                          data-selected={value === item.id ? "true" : "false"}
                          data-testid={
                            firstGroupOf.get(item.id) === group.id
                              ? `${testIdPrefix}-menu-${item.id}`
                              : `${testIdPrefix}-menu-${group.id}-${item.id}`
                          }
                          onFocus={() => {
                            if (!itemDisabled) publishPreview(item.id);
                          }}
                          onSelect={() => commit(item.id)}
                        >
                          <span
                            className={classes(officeGalleryMenuStyles.thumbnail, styles.menuPreview)}
                            aria-hidden="true"
                          >
                            {renderPreview(item, "menu")}
                          </span>
                          {captioned ? (
                            <span className={officeGalleryMenuStyles.name}>
                              {item.label}
                            </span>
                          ) : null}
                        </DropdownMenuRadioItem>
                      </div>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            );
          })}
          {menuBody === undefined && footerGroups.length ? (
            <OfficeGalleryMenuFooter>
              {footerGroups.map((group) => (
                <DropdownMenuRadioGroup
                  key={group.id}
                  value={value ?? undefined}
                  className={styles.menuFooter}
                >
                  {group.items.map((item) => {
                    const itemDisabled = disabled || Boolean(item.disabled);
                    const accessibleLabel =
                      itemDisabled && item.disabledReason
                        ? `${item.label}: ${item.disabledReason}`
                        : item.label;
                    return (
                      <DropdownMenuRadioItem
                        key={item.id}
                        value={item.id}
                        disabled={itemDisabled}
                        className={styles.menuCommand}
                        aria-label={accessibleLabel}
                        {...titleProps(accessibleLabel, item.label)}
                        data-item-id={item.id}
                        data-selected={value === item.id ? "true" : "false"}
                        data-testid={`${testIdPrefix}-menu-${item.id}`}
                        onFocus={() => publishPreview(null)}
                        onSelect={() => commit(item.id)}
                      >
                        <span aria-hidden="true">{renderPreview(item, "menu")}</span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              ))}
            </OfficeGalleryMenuFooter>
          ) : null}
        </OfficeGalleryMenuContent>
      </DropdownMenu>
    </GalleryRoot>
  );
}
