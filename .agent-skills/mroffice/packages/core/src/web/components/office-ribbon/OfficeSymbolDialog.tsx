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
  useSyncExternalStore,
} from "react";

import {
  OFFICE_CJK_FONT_FAMILY_VALUES,
  OFFICE_FONT_FAMILY_LABELS,
  OFFICE_FONT_FAMILY_VALUES,
  OFFICE_SYMBOL_FONT_VALUES,
  officePrimaryFontFamily,
} from "./officeTypographyCatalog";
import {
  officeDialogClassName,
  officeDialogParts,
  useOfficeDialogChrome,
} from "./officeDialogChrome";
import {
  OFFICE_SPECIAL_CHARACTERS,
  OFFICE_SYMBOL_DEFAULT_RECENT,
  OFFICE_SYMBOL_FONT_CODE_BASES,
  OFFICE_SYMBOL_UNICODE_CODE_BASES,
  SYMBOL_GRID_COLUMNS,
  symbolCodeForBase,
  symbolCodePointFromCode,
  symbolSubsetForCodePoint,
  symbolSubsetsForCodePoints,
  type OfficeSymbolCodeBase,
  formatSymbolShortcut,
  isLegacySymbolFont,
  symbolCharCodeForFont,
  symbolCharCodeFromCodePoint,
  symbolGridCodePoints,
  symbolInFontCharCode,
  symbolInsertionForCodePoint,
  symbolInsertionForRecent,
  symbolInsertionForSpecialCharacter,
  symbolShortcutForChar,
  type OfficeRecentSymbol,
  type OfficeSpecialCharacter,
  type OfficeSymbolInsertion,
} from "../../lib/office-symbols";
import { containDialogTab } from "../../lib/dialog-tab-containment";

import styles from "./OfficeSymbolDialog.module.css";

/**
 * Word's Insert → Symbol dialog, editor-neutral.
 *
 * The caller owns the document: this component decides only WHICH character the
 * user picked and hands back an {@link OfficeSymbolInsertion}. It knows nothing
 * about ProseMirror, slides, or cells, so Docs, Presentation and Spreadsheet can
 * all mount the same dialog behind their own insert adapters instead of growing
 * three equivalent symbol pickers.
 *
 * WORD PARITY (see `lib/office-symbols` for the documented contract):
 *   - Two tabs: Symbols, Special Characters.
 *   - A font dropdown whose first entry is `(normal text)` — no symbol font, an
 *     ordinary character — followed by the MRAI font catalogue's groups and the
 *     legacy symbol fonts.
 *   - A code-point-ordered scrolling grid, ONE tab stop, arrow-key navigation.
 *   - A readout naming the selected character's code in the current font AND its
 *     Unicode code point.
 *   - A "Keyboard shortcut:" line showing the binding, when MRAI binds one.
 *   - A recently-used row that remembers each entry's font (up to 16, Word's
 *     shipped row until the user has inserted something).
 *   - Subset: the Unicode block of the selected character; picking a block
 *     scrolls the grid to it (hidden for a legacy symbol font, as in Word).
 *   - Character code + from: the selected character's code in Unicode (hex),
 *     ASCII (decimal / hex) or, for a symbol font, Symbol (decimal / hex);
 *     typing a code selects that character, and a valid Unicode code outside
 *     the grid's blocks is still selected and inserted.
 *   - Cancel / Insert, and the dialog STAYS OPEN after an insert (Word's
 *     behaviour: people insert several symbols in a row).
 */

/**
 * `(normal text)` is modelled as a null font all the way through; this sentinel
 * is only the <select> option's value. It can never collide with a real entry:
 * every other option's value is a CSS font stack or a font name, and neither can
 * contain "__".
 */
const NORMAL_TEXT_VALUE = "__mrai_symbol_normal_text__";

/** The platform store is immutable, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => {};
}

let cachedPlatform: "mac" | "other" | null = null;

/**
 * The real platform, cached — useSyncExternalStore requires a snapshot that is
 * referentially stable between renders or it re-renders forever.
 */
function readClientPlatform(): "mac" | "other" {
  if (cachedPlatform !== null) return cachedPlatform;
  const probe =
    typeof navigator === "undefined"
      ? ""
      : `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  cachedPlatform = /mac|iphone|ipad|ipod/i.test(probe) ? "mac" : "other";
  return cachedPlatform;
}

function readServerPlatform(): "mac" | "other" {
  return "other";
}

export interface OfficeSymbolDialogLabels {
  readonly title: string;
  readonly close: string;
  readonly symbolsTab: string;
  readonly specialCharactersTab: string;
  readonly fontLabel: string;
  readonly normalText: string;
  readonly latinFontsGroup: string;
  readonly cjkFontsGroup: string;
  readonly symbolFontsGroup: string;
  readonly grid: string;
  readonly recent: string;
  readonly characterColumn: string;
  readonly shortcutColumn: string;
  readonly shortcutLabel: string;
  readonly shortcutNone: string;
  readonly autoCorrect: string;
  readonly shortcutKey: string;
  readonly cancel: string;
  readonly insert: string;
  /**
   * The grid readout. Receives `{font}` (the font's display name, or the
   * `(normal text)` label), `{code}` (the character's code IN THAT FONT) and
   * `{unicode}` (its Unicode code point) so each locale can order the sentence
   * its own way — Word's own wording differs between them.
   */
  readonly readout: (values: {
    font: string;
    code: string;
    unicode: string;
  }) => string;
  /** Name of one Special Characters row, by its catalogue id. */
  readonly specialCharacterName: (id: string) => string;
  readonly subset: string;
  readonly characterCode: string;
  readonly codeFrom: string;
  /** Name of one "from" notation (Unicode (hex), ASCII (decimal), ...). */
  readonly codeBaseName: (base: OfficeSymbolCodeBase) => string;
  /** Name of one Unicode block in the Subset box. */
  readonly subsetName: (id: string) => string;
  /**
   * Said under Character code while what is typed there names no character
   * of the font (Insert is off until it does). Optional: without it the
   * field is still marked invalid and Insert stays off.
   */
  readonly invalidCode?: string;
}

export interface OfficeSymbolDialogProps {
  readonly open: boolean;
  readonly labels: OfficeSymbolDialogLabels;
  readonly recent: readonly OfficeRecentSymbol[];
  readonly onInsert: (insertion: OfficeSymbolInsertion) => void;
  readonly onCancel: () => void;
  /** Opens the editor's AutoCorrect surface, when it has one. */
  readonly onOpenAutoCorrect?: () => void;
  /** Opens the editor's keyboard-shortcut surface, when it has one. */
  readonly onOpenShortcuts?: () => void;
  readonly testIdPrefix?: string;
  /**
   * Whose Symbol dialog this is. Word's (the default) has the Special
   * Characters page, shortcut keys and AutoCorrect. PowerPoint's has the
   * Symbols page alone, and a slide's text names one font per run with no
   * `a:sym`, so the legacy symbol fonts (Wingdings, Symbol...) whose
   * characters only mean something in their own encoding are not offered.
   */
  readonly variant?: "word" | "powerpoint";
}

type SymbolTab = "symbols" | "special";

/** The font dropdown's options, built from MRAI's own catalogue. */
interface SymbolFontOption {
  readonly value: string;
  readonly label: string;
  /** The `w:font` name, or null for `(normal text)`. */
  readonly font: string | null;
}

function buildFontGroups(
  labels: OfficeSymbolDialogLabels,
  symbolFonts: boolean,
): Array<{
  id: string;
  label: string | null;
  options: SymbolFontOption[];
}> {
  const cjk = new Set<string>(OFFICE_CJK_FONT_FAMILY_VALUES);
  const toOption = (stack: string): SymbolFontOption => {
    // The catalogue stores CSS stacks; `w:font` needs the face NAME, which is the
    // stack's primary family — the same reduction the DOCX exporter applies to a
    // fontFamily mark, so the dialog and the exporter agree on the name.
    const name = officePrimaryFontFamily(stack);
    return {
      value: stack,
      label: OFFICE_FONT_FAMILY_LABELS[stack] ?? name,
      font: name,
    };
  };
  return [
    {
      id: "normal",
      label: null,
      options: [
        { value: NORMAL_TEXT_VALUE, label: labels.normalText, font: null },
      ],
    },
    {
      id: "cjk",
      label: labels.cjkFontsGroup,
      options: OFFICE_CJK_FONT_FAMILY_VALUES.map(toOption),
    },
    {
      id: "latin",
      label: labels.latinFontsGroup,
      options: OFFICE_FONT_FAMILY_VALUES.filter(
        (stack) => !cjk.has(stack),
      ).map(toOption),
    },
    ...(symbolFonts
      ? [
          {
            id: "symbol",
            label: labels.symbolFontsGroup,
            options: OFFICE_SYMBOL_FONT_VALUES.map((name) => ({
              value: name,
              label: name,
              font: name,
            })),
          },
        ]
      : []),
  ];
}

export function OfficeSymbolDialog({
  open,
  labels,
  recent,
  onInsert,
  onCancel,
  onOpenAutoCorrect,
  onOpenShortcuts,
  testIdPrefix = "office-symbol",
  variant = "word",
}: OfficeSymbolDialogProps): React.JSX.Element | null {
  const word = variant === "word";
  const [tab, setTab] = useState<SymbolTab>("symbols");
  // Under an editor's dialog chrome the card, title row, tabs and buttons are
  // the shared chrome's; the module keeps placement, the grid and the table.
  const chromeTone = useOfficeDialogChrome();
  const chrome = (own: string, part: string) =>
    chromeTone ? `${own} ${part}` : own;
  const [fontValue, setFontValue] = useState<string>(NORMAL_TEXT_VALUE);
  /**
   * The highlighted cell, stored WITH the font whose repertoire it indexes.
   *
   * Switching fonts changes the repertoire, so a bare index would point at an
   * unrelated character (or past the end). Word resets to the first cell; here
   * that reset is DERIVED from the stored font not matching the selected one,
   * rather than written back by an effect — an effect that setState()s on every
   * font change costs an extra render pass and a frame of wrong highlight.
   */
  const [gridSelection, setGridSelection] = useState<{
    font: string | null;
    index: number;
  }>({ font: null, index: 0 });
  const [codeBaseChoice, setCodeBaseChoice] =
    useState<OfficeSymbolCodeBase>("unicodeHex");
  /** The Character code box while the user types in it (null: derived). */
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  /**
   * A code typed into Character code that names a character outside the
   * grid's blocks. It is selected (readout + Insert) until a cell is picked.
   */
  const [typedCodePoint, setTypedCodePoint] = useState<{
    font: string | null;
    codePoint: number;
  } | null>(null);
  const [selectedSpecialId, setSelectedSpecialId] = useState<string>(
    OFFICE_SPECIAL_CHARACTERS[0]?.id ?? "",
  );
  const gridRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const insertButtonRef = useRef<HTMLButtonElement | null>(null);

  const fontGroups = useMemo(() => buildFontGroups(labels, word), [labels, word]);
  const selectedFontOption = useMemo(() => {
    for (const group of fontGroups) {
      const found = group.options.find((option) => option.value === fontValue);
      if (found) return found;
    }
    return fontGroups[0]?.options[0] ?? null;
  }, [fontGroups, fontValue]);
  const selectedFont = selectedFontOption?.font ?? null;

  const codePoints = useMemo(
    () => symbolGridCodePoints(selectedFont),
    [selectedFont],
  );

  const selectedIndex =
    gridSelection.font === selectedFont
      ? Math.min(gridSelection.index, Math.max(0, codePoints.length - 1))
      : 0;
  const setSelectedIndex = useCallback(
    (index: number) => {
      setGridSelection({ font: selectedFont, index });
      setTypedCodePoint(null);
      setCodeDraft(null);
    },
    [selectedFont],
  );

  const legacyFont = selectedFont !== null && isLegacySymbolFont(selectedFont);
  const codeBases = legacyFont
    ? OFFICE_SYMBOL_FONT_CODE_BASES
    : OFFICE_SYMBOL_UNICODE_CODE_BASES;
  const codeBase = codeBases.includes(codeBaseChoice)
    ? codeBaseChoice
    : codeBases[0]!;
  const typed =
    typedCodePoint && typedCodePoint.font === selectedFont
      ? typedCodePoint.codePoint
      : null;
  const selectedCodePoint =
    typed ?? codePoints[selectedIndex] ?? codePoints[0] ?? null;
  const subsets = useMemo(
    () => (legacyFont ? [] : symbolSubsetsForCodePoints(codePoints)),
    [codePoints, legacyFont],
  );
  const selectedSubset =
    selectedCodePoint === null
      ? null
      : symbolSubsetForCodePoint(selectedCodePoint);
  const derivedCode =
    selectedCodePoint === null
      ? ""
      : symbolCodeForBase(selectedCodePoint, codeBase);
  // A Character code being typed that names no character here: Enter and
  // Insert must not fall back to the character selected before it.
  const typedCodeInvalid = (() => {
    if (codeDraft === null) return false;
    const codePoint = symbolCodePointFromCode(codeDraft, codeBase);
    if (codePoint === null) return true;
    return legacyFont && !codePoints.includes(codePoint);
  })();
  const applyTypedCode = useCallback(
    (raw: string) => {
      setCodeDraft(raw);
      const codePoint = symbolCodePointFromCode(raw, codeBase);
      if (codePoint === null) return;
      const index = codePoints.indexOf(codePoint);
      if (index >= 0) {
        setGridSelection({ font: selectedFont, index });
        setTypedCodePoint(null);
      } else if (!legacyFont) {
        setTypedCodePoint({ font: selectedFont, codePoint });
      }
    },
    [codeBase, codePoints, legacyFont, selectedFont],
  );

  /**
   * The platform the shortcut labels are drawn for.
   *
   * Read through useSyncExternalStore so the SERVER snapshot is always "other"
   * and the client's is the real platform: rendering "⌘⌥-" during SSR and
   * "Ctrl+Alt+-" after hydration (or the reverse) is a hydration mismatch, and a
   * shortcut shown with the wrong modifier glyphs is worse than none. The store
   * never changes, so the subscribe callback is a no-op unsubscribe.
   */
  const platform = useSyncExternalStore(
    subscribeNever,
    readClientPlatform,
    readServerPlatform,
  );

  const requestInsert = useCallback(
    (insertion: OfficeSymbolInsertion | null) => {
      if (!insertion) return;
      onInsert(insertion);
      // Word keeps the Symbol dialog — and the keyboard — on the dialog for
      // the next character. The host's insert focuses its editor, which left
      // this modal open with focus behind it (Esc then went to the editor).
      window.requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        if (!dialog || !dialog.isConnected) return;
        if (dialog.contains(document.activeElement)) return;
        (insertButtonRef.current ?? closeButtonRef.current)?.focus({
          preventScroll: true,
        });
      });
    },
    [onInsert],
  );

  const insertSelected = useCallback(() => {
    if (tab === "special") {
      const entry = OFFICE_SPECIAL_CHARACTERS.find(
        (item) => item.id === selectedSpecialId,
      );
      if (entry) requestInsert(symbolInsertionForSpecialCharacter(entry));
      return;
    }
    if (selectedCodePoint === null || typedCodeInvalid) return;
    requestInsert(symbolInsertionForCodePoint(selectedFont, selectedCodePoint));
  }, [
    requestInsert,
    selectedCodePoint,
    selectedFont,
    selectedSpecialId,
    tab,
    typedCodeInvalid,
  ]);

  // Escape cancels, from anywhere inside the card. Registered on the card rather
  // than on the document so it cannot swallow Escape for an unrelated surface.
  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // The card is aria-modal: Tab past "Insert" (or Shift+Tab before the
      // close button) wraps inside it. Unwrapped, focus reached the editor
      // behind the dimmer and the next Tab typed a tab character into the
      // document while the dialog was still open (WUA 239).
      if (containDialogTab(event, event.currentTarget)) return;
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    },
    [onCancel],
  );

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const total = codePoints.length;
      if (total === 0) return;
      const move = (delta: number): void => {
        event.preventDefault();
        // The selection is DERIVED from the stored {font, index} pair, so the
        // setter takes an index, never an updater: handing it a function
        // stored the function itself and the next clamp read NaN.
        setSelectedIndex(Math.min(total - 1, Math.max(0, selectedIndex + delta)));
      };
      switch (event.key) {
        case "ArrowRight":
          move(1);
          return;
        case "ArrowLeft":
          move(-1);
          return;
        case "ArrowDown":
          move(SYMBOL_GRID_COLUMNS);
          return;
        case "ArrowUp":
          move(-SYMBOL_GRID_COLUMNS);
          return;
        case "PageDown":
          move(SYMBOL_GRID_COLUMNS * 8);
          return;
        case "PageUp":
          move(-SYMBOL_GRID_COLUMNS * 8);
          return;
        case "Home":
          event.preventDefault();
          setSelectedIndex(0);
          return;
        case "End":
          event.preventDefault();
          setSelectedIndex(total - 1);
          return;
        case "Enter":
          event.preventDefault();
          insertSelected();
          return;
        default:
          return;
      }
    },
    [codePoints.length, insertSelected, selectedIndex, setSelectedIndex],
  );

  // Keep the highlighted cell in view as the arrow keys walk past the viewport.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cell = grid.querySelector<HTMLElement>('[data-symbol-selected="true"]');
    // Optional call: jsdom has no scrollIntoView, and a missing scroll is
    // never worth a crash.
    cell?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex, codePoints]);

  // Opening the dialog moves focus into it, so the keyboard is never left behind
  // on the trigger while a modal is up.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const fontDisplayName = selectedFontOption?.label ?? labels.normalText;
  const readout =
    selectedCodePoint === null
      ? ""
      : labels.readout({
          font: fontDisplayName,
          code:
            (selectedFont === null
              ? symbolCharCodeFromCodePoint(selectedCodePoint)
              : symbolInFontCharCode(
                  selectedFont,
                  symbolCharCodeForFont(selectedFont, selectedCodePoint) ?? "",
                )) ?? "",
          unicode: symbolCharCodeFromCodePoint(selectedCodePoint) ?? "",
        });

  const selectedChar =
    selectedCodePoint === null ? "" : String.fromCodePoint(selectedCodePoint);
  const gridShortcut =
    selectedFont === null ? symbolShortcutForChar(selectedChar) : null;

  const selectedSpecial: OfficeSpecialCharacter | null =
    OFFICE_SPECIAL_CHARACTERS.find((item) => item.id === selectedSpecialId) ??
    null;
  const activeShortcut =
    tab === "special" ? (selectedSpecial?.shortcut ?? null) : gridShortcut;

  // A legacy symbol font's PUA glyphs only render from that face, so the cells
  // must carry it. Quoted because a symbol font name may contain a space.
  const gridFontStyle =
    selectedFont !== null && isLegacySymbolFont(selectedFont)
      ? { fontFamily: `"${selectedFont}"` }
      : selectedFontOption && selectedFontOption.font !== null
        ? { fontFamily: selectedFontOption.value }
        : undefined;

  // Word's row is never empty: a fresh install shows its shipped symbols
  // until the user's own inserts replace them.
  const recentRow = recent.length > 0 ? recent : OFFICE_SYMBOL_DEFAULT_RECENT;

  return (
    <>
      {/* A real element, never a pseudo and never portaled — see the module CSS. */}
      <div aria-hidden="true" className={styles.dimmer} data-testid={`${testIdPrefix}-dimmer`} />
      <div
        aria-label={labels.title}
        aria-modal="true"
        className={
          chromeTone
            ? `${styles.dialog} ${officeDialogClassName({ tone: chromeTone })}`
            : styles.dialog
        }
        data-testid={`${testIdPrefix}-dialog`}
        onKeyDown={handleCardKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className={chrome(styles.titleRow, officeDialogParts.header)}>
          <h2 className={chrome(styles.title, officeDialogParts.title)}>{labels.title}</h2>
          <button
            aria-label={labels.close}
            className={chrome(styles.closeButton, officeDialogParts.close)}
            data-testid={`${testIdPrefix}-dialog-close`}
            onClick={onCancel}
            ref={closeButtonRef}
            title={labels.close}
            type="button"
          >
            <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        </div>

        <div
          aria-label={labels.title}
          className={chrome(styles.tabs, officeDialogParts.tabs)}
          role="tablist"
        >
          <button
            aria-selected={tab === "symbols"}
            className={chrome(`${styles.tab}${tab === "symbols" ? ` ${styles.tabActive}` : ""}`, officeDialogParts.tab)}
            data-testid={`${testIdPrefix}-tab-symbols`}
            onClick={() => setTab("symbols")}
            role="tab"
            type="button"
          >
            {labels.symbolsTab}
          </button>
          {word ? <button
            aria-selected={tab === "special"}
            className={chrome(`${styles.tab}${tab === "special" ? ` ${styles.tabActive}` : ""}`, officeDialogParts.tab)}
            data-testid={`${testIdPrefix}-tab-special`}
            onClick={() => setTab("special")}
            role="tab"
            type="button"
          >
            {labels.specialCharactersTab}
          </button> : null}
        </div>

        {tab === "symbols" ? (
          <>
            <div className={styles.fontRow}>
              <label className={chrome(styles.fieldLabel, officeDialogParts.label)} htmlFor={`${testIdPrefix}-font`}>
                {labels.fontLabel}
              </label>
              {/* A native select with optgroups IS Word's control here, and it
                  gets platform keyboard behaviour and type-ahead for free. The
                  OPTIONS come from MRAI's shared font catalogue, never from an
                  enumeration of the local machine's fonts. */}
              <select
                className={styles.footerButton}
                data-testid={`${testIdPrefix}-font`}
                id={`${testIdPrefix}-font`}
                onChange={(event) => setFontValue(event.target.value)}
                value={fontValue}
              >
                {fontGroups.map((group) =>
                  group.label === null ? (
                    group.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  ) : (
                    <optgroup key={group.id} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
              {subsets.length ? (
                <>
                  <label
                    className={chrome(styles.fieldLabel, officeDialogParts.label)}
                    htmlFor={`${testIdPrefix}-subset`}
                  >
                    {labels.subset}
                  </label>
                  <select
                    className={styles.footerButton}
                    data-testid={`${testIdPrefix}-subset`}
                    id={`${testIdPrefix}-subset`}
                    onChange={(event) => {
                      const subset = subsets.find(
                        (item) => item.id === event.target.value,
                      );
                      if (!subset) return;
                      const index = codePoints.findIndex(
                        (codePoint) =>
                          codePoint >= subset.first && codePoint <= subset.last,
                      );
                      if (index >= 0) setSelectedIndex(index);
                    }}
                    value={selectedSubset?.id ?? ""}
                  >
                    {selectedSubset ? null : <option value="" />}
                    {subsets.map((subset) => (
                      <option key={subset.id} value={subset.id}>
                        {labels.subsetName(subset.id)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>

            <div
              aria-label={labels.grid}
              className={styles.grid}
              data-testid={`${testIdPrefix}-grid`}
              onKeyDown={handleGridKeyDown}
              ref={gridRef}
              role="listbox"
              style={
                {
                  ...gridFontStyle,
                  "--symbol-grid-columns": String(SYMBOL_GRID_COLUMNS),
                } as React.CSSProperties
              }
              tabIndex={0}
            >
              {codePoints.map((codePoint, index) => {
                const selected = typed === null && index === selectedIndex;
                const hex = symbolCharCodeFromCodePoint(codePoint) ?? "";
                return (
                  <span
                    aria-label={hex}
                    aria-selected={selected}
                    className={`${styles.cell}${selected ? ` ${styles.cellSelected}` : ""}`}
                    data-symbol-code={hex}
                    data-symbol-selected={selected ? "true" : "false"}
                    data-testid={`${testIdPrefix}-cell-${hex}`}
                    key={codePoint}
                    onDoubleClick={() => {
                      setSelectedIndex(index);
                      requestInsert(
                        symbolInsertionForCodePoint(selectedFont, codePoint),
                      );
                    }}
                    // mousedown, not click: the editor's selection must survive
                    // the pick, and mousedown is what would blur it.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSelectedIndex(index);
                    }}
                    role="option"
                  >
                    {String.fromCodePoint(codePoint)}
                  </span>
                );
              })}
            </div>

            {recentRow.length > 0 ? (
              <div
                aria-label={labels.recent}
                className={styles.recentRow}
                data-testid={`${testIdPrefix}-recent`}
                role="group"
              >
                <span className={chrome(styles.fieldLabel, officeDialogParts.label)}>{labels.recent}</span>
                {recentRow.map((entry) => (
                  <button
                    aria-label={entry.char}
                    className={styles.recentCell}
                    data-testid={`${testIdPrefix}-recent-${entry.font ?? "normal"}-${
                      entry.char.codePointAt(0)?.toString(16) ?? ""
                    }`}
                    key={`${entry.font ?? "normal"}:${entry.char}`}
                    // Mouse down keeps the document selection; the insert runs
                    // on click, which Enter and Space also fire on a focused
                    
                    onClick={() => requestInsert(symbolInsertionForRecent(entry))}
                    onMouseDown={(event) => event.preventDefault()}
                    style={
                      entry.font
                        ? { fontFamily: `"${entry.font}"` }
                        : undefined
                    }
                    title={entry.font ?? labels.normalText}
                    type="button"
                  >
                    {entry.char}
                  </button>
                ))}
              </div>
            ) : null}

            <div
              className={styles.readout}
              data-testid={`${testIdPrefix}-readout`}
            >
              <span className={styles.readoutCode}>{readout}</span>
            </div>

            <div className={styles.fontRow}>
              <label
                className={chrome(styles.fieldLabel, officeDialogParts.label)}
                htmlFor={`${testIdPrefix}-char-code`}
              >
                {labels.characterCode}
              </label>
              <input
                autoComplete="off"
                className={styles.footerButton}
                data-testid={`${testIdPrefix}-char-code`}
                id={`${testIdPrefix}-char-code`}
                inputMode={
                  codeBase === "asciiDecimal" || codeBase === "symbolDecimal"
                    ? "numeric"
                    : "text"
                }
                maxLength={5}
                aria-invalid={typedCodeInvalid || undefined}
                aria-describedby={
                  typedCodeInvalid && labels.invalidCode
                    ? `${testIdPrefix}-char-code-invalid`
                    : undefined
                }
                onBlur={() => setCodeDraft(null)}
                onChange={(event) => applyTypedCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  insertSelected();
                }}
                size={6}
                spellCheck={false}
                value={codeDraft ?? derivedCode}
              />
              {typedCodeInvalid && labels.invalidCode ? (
                <span
                  className={styles.codeInvalid}
                  data-testid={`${testIdPrefix}-char-code-invalid`}
                  id={`${testIdPrefix}-char-code-invalid`}
                  role="alert"
                >
                  {labels.invalidCode}
                </span>
              ) : null}
              <label
                className={chrome(styles.fieldLabel, officeDialogParts.label)}
                htmlFor={`${testIdPrefix}-code-base`}
              >
                {labels.codeFrom}
              </label>
              <select
                className={styles.footerButton}
                data-testid={`${testIdPrefix}-code-base`}
                id={`${testIdPrefix}-code-base`}
                onChange={(event) => {
                  setCodeBaseChoice(event.target.value as OfficeSymbolCodeBase);
                  setCodeDraft(null);
                }}
                value={codeBase}
              >
                {codeBases.map((base) => (
                  <option key={base} value={base}>
                    {labels.codeBaseName(base)}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className={styles.specialScroll}>
            <table className={styles.specialTable}>
              <thead>
                <tr>
                  {/* Word's Character column holds the glyph and its name; a
                      header over the glyph alone broke 字符 over two lines. */}
                  <th scope="col" colSpan={2}>{labels.characterColumn}</th>
                  <th scope="col">{labels.shortcutColumn}</th>
                </tr>
              </thead>
              <tbody data-testid={`${testIdPrefix}-special-table`}>
                {OFFICE_SPECIAL_CHARACTERS.map((entry) => {
                  const selected = entry.id === selectedSpecialId;
                  return (
                    <tr
                      aria-selected={selected}
                      className={`${styles.specialRow}${
                        selected ? ` ${styles.specialRowSelected}` : ""
                      }`}
                      data-testid={`${testIdPrefix}-special-${entry.id}`}
                      key={entry.id}
                      onDoubleClick={() =>
                        requestInsert(symbolInsertionForSpecialCharacter(entry))
                      }
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setSelectedSpecialId(entry.id);
                      }}
                    >
                      <td className={styles.specialGlyph}>
                        {entry.display ?? entry.char}
                      </td>
                      <td>{labels.specialCharacterName(entry.id)}</td>
                      <td className={styles.specialShortcut}>
                        {entry.shortcut
                          ? formatSymbolShortcut(entry.shortcut, platform)
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {word ? <div
          className={styles.readout}
          data-testid={`${testIdPrefix}-shortcut-readout`}
        >
          {labels.shortcutLabel}{" "}
          <span className={styles.readoutCode}>
            {activeShortcut
              ? formatSymbolShortcut(activeShortcut, platform)
              : labels.shortcutNone}
          </span>
        </div> : null}

        <div className={chrome(styles.footer, officeDialogParts.footer)}>
          {word ? <>
          <button
            className={chrome(styles.footerButton, officeDialogParts.button)}
            data-testid={`${testIdPrefix}-autocorrect`}
            disabled={!onOpenAutoCorrect}
            onClick={onOpenAutoCorrect}
            type="button"
          >
            {labels.autoCorrect}
          </button>
          <button
            className={chrome(styles.footerButton, officeDialogParts.button)}
            data-testid={`${testIdPrefix}-shortcut-key`}
            disabled={!onOpenShortcuts}
            onClick={onOpenShortcuts}
            type="button"
          >
            {labels.shortcutKey}
          </button>
          </> : null}
          <button
            className={chrome(`${styles.footerButton} ${styles.footerSpacer}`, officeDialogParts.button)}
            data-testid={`${testIdPrefix}-cancel`}
            onClick={onCancel}
            type="button"
          >
            {labels.cancel}
          </button>
          <button
            className={chrome(`${styles.footerButton} ${styles.footerButtonPrimary}`, officeDialogParts.primaryButton)}
            data-testid={`${testIdPrefix}-insert`}
            disabled={tab !== "special" && typedCodeInvalid}
            // mousedown-prevented so the click never blurs the editor before the
            // insert runs against the remembered selection.
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertSelected}
            ref={insertButtonRef}
            type="button"
          >
            {labels.insert}
          </button>
        </div>
      </div>
    </>
  );
}
