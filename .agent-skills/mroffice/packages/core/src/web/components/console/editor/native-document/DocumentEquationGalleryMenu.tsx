"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useState } from "react";
import { promptText } from "../../../ui/modal-dialog";
import { Trash2 } from "../../../office-ribbon/icons/houseIcons";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "../../../ui/dropdown-menu";
import {
  RibbonDropdownMenuContent as DropdownMenuContent,
  RibbonDropdownMenuSubContent as DropdownMenuSubContent,
} from "../../../office-ribbon/CupertinoRibbonMenu";

import { DocsInsertIcon } from "../DocumentInsertRibbonIcons";
import {
  EQUATION_GALLERY_ENTRIES,
  EQUATION_TEMPLATES,
  MATH_SYMBOLS,
  MATH_SYMBOL_GROUPS,
  equationGalleryInsertPayload,
  equationInsertPayload,
  symbolInsertPayload,
  type EquationGalleryEntry,
  type EquationTemplate,
  type MathSymbol,
} from "../extensions/equationCatalog";
import { renderValidatedKatexMarkup } from "../extensions/lazyKatex";
import {
  DocumentEquationSymbolGallery,
  type EquationSymbolGalleryClassNames,
} from "./DocumentEquationSymbolGallery";
import {
  readUserEquationGallery,
  removeUserEquationGalleryEntry,
  saveUserEquationGalleryEntry,
  writeUserEquationGallery,
  type UserEquationGalleryEntry,
} from "./equationGalleryStore";

/** The `insertContent` shape every equation insertion in the toolbar dispatches. */
export interface EquationInsertPayload {
  type: string;
  attrs: { latex: string };
}

export interface DocumentEquationGalleryMenuProps {
  /** `console-notebooks` translator. */
  t: (key: string) => string;
  /** Active UI locale; Word sorts the gallery by localized entry name. */
  locale: string;
  /** Test-id prefix, so both Insert surfaces stay individually addressable. */
  testIdPrefix: string;
  /** Radix content alignment relative to the split-button chevron. */
  align?: "start" | "end";
  /** Insert an equation node and open its editor (the toolbar's own routine). */
  onInsert: (payload: EquationInsertPayload) => void;
  /**
   * Word's "Insert New Equation": a new empty equation whose placement the
   * caller decides from the paragraph (empty paragraph → display, otherwise
   * inline).
   */
  onInsertNew: () => void;
  /**
   * The LaTeX of the currently selected equation, or `null` when no equation
   * is selected — which is exactly when Word greys out "Save Selection to
   * Equation Gallery…".
   */
  selectedEquationLatex: string | null;
  /**
   * Word's "More Symbols…" tail of the Symbols submenu: the gallery above
   * inserts MATH (an `m:oMath` zone), which the Symbol dialog cannot produce,
   * so the two coexist — but every path to a plain symbol character ends at
   * the one Symbol dialog instead of a second grid. Omit to hide the entry.
   */
  onMoreSymbols?: () => void;
  moreSymbolsDisabled?: boolean;
}

/**
 * Word orders every gallery group by the LOCALIZED entry name (二次公式,
 * 二项式定理, 傅立叶级数, 勾股定理, 和的展开式 … in Chinese; Area of Circle,
 * Binomial Theorem, Expansion of a Sum … in English). A locale collator gives
 * that order for free instead of freezing one language's order in data.
 */
export function sortGalleryByLocalizedName<T>(
  entries: readonly T[],
  name: (entry: T) => string,
  locale: string,
): T[] {
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  } catch {
    collator = new Intl.Collator(undefined, { numeric: true });
  }
  return [...entries].sort((a, b) => collator.compare(name(a), name(b)));
}

/**
 * The Insert panel skins the shared symbol-gallery anatomy with this editor's
 * own gallery chrome (the Home ribbon's text-effects menu classes), so a symbol
 * cell, heading and footer row read the same here as in every other gallery.
 */
const SYMBOL_GALLERY_CLASS_NAMES: EquationSymbolGalleryClassNames = {
  root: "docs-insert-equation-symbols__groups",
  group: "docs-home-gallery-menu__section docs-insert-equation-symbols__group",
  heading:
    "docs-home-gallery-menu__heading docs-insert-equation-symbols__heading",
  grid: "docs-home-gallery-menu__grid docs-insert-equation-symbols__grid",
  cell: "docs-home-gallery-menu__tile docs-insert-equation-symbols__cell",
  glyph: "docs-insert-equation-symbols__glyph",
  footer: "docs-home-gallery-menu__footer docs-insert-equation-symbols__footer",
};

function EquationTile({
  name,
  latex,
  testId,
  onSelect,
  onRemove,
  removeLabel,
}: {
  name: string;
  latex: string;
  testId: string;
  onSelect: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  // Display-mode typesetting is what Word shows in its gallery preview boxes
  // (a display equation's own rendering, not a linear approximation).
  const markup = renderValidatedKatexMarkup(latex, true);
  return (
    <DropdownMenuItem
      className="docs-insert-equation-gallery__tile"
      data-testid={testId}
      onSelect={onSelect}
      aria-label={name}
      title={name}
    >
      <span className="docs-insert-equation-gallery__tile-name">
        <span className="docs-insert-equation-gallery__tile-title">{name}</span>
        {onRemove && removeLabel ? (
          <span
            role="button"
            tabIndex={-1}
            className="docs-insert-equation-gallery__tile-remove"
            title={removeLabel}
            aria-label={removeLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 size={11} aria-hidden />
          </span>
        ) : null}
      </span>
      {markup ? (
        <span
          className="docs-insert-equation-gallery__tile-preview katex-gallery-preview"
          aria-hidden
          data-latex={latex}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      ) : (
        <span
          className="docs-insert-equation-gallery__tile-preview docs-insert-equation-gallery__tile-preview--source"
          aria-hidden
        >
          {latex}
        </span>
      )}
    </DropdownMenuItem>
  );
}

/**
 * The Insert → Equation dropdown, shaped like Word's:
 *
 *   Built-In            — the nine built-in equations, each a typeset preview
 *   General             — the user's saved equations (only when any exist)
 *   ──────
 *   Templates ▸ / Symbols ▸  — MRAI's structure skeletons and symbol palette,
 *                              placed as secondary galleries under the built-ins
 *   ──────
 *   Insert New Equation
 *   Save Selection to Equation Gallery…   (disabled without a selected equation)
 *
 * The panel scrolls; every tile inserts a display equation, exactly as Word's
 * gallery entries (all stored as `m:oMathPara`) do.
 */
export function DocumentEquationGalleryMenu(props: DocumentEquationGalleryMenuProps) {
  return (
    <DropdownMenuContent
      align={props.align ?? "end"}
      className="note-editor-toolbar-menu docs-insert-menu docs-insert-equation-menu docs-insert-equation-gallery"
      data-testid={`${props.testIdPrefix}-gallery`}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <DocumentEquationGalleryMenuBody {...props} />
    </DropdownMenuContent>
  );
}

/**
 * The gallery itself, under the menu's content: it mounts when the menu
 * opens. Sorting the gallery by its localized names and naming every symbol
 * ran on every render of the tab that holds the closed menu (the Insert tab,
 * each time it is shown).
 */
function DocumentEquationGalleryMenuBody({
  t,
  locale,
  testIdPrefix,
  onInsert,
  onInsertNew,
  selectedEquationLatex,
  onMoreSymbols,
  moreSymbolsDisabled = false,
}: DocumentEquationGalleryMenuProps) {
  // The body mounts only when the dropdown opens (client-side), so the one
  // localStorage read can seed the state directly.
  const [userGallery, setUserGallery] = useState<UserEquationGalleryEntry[]>(
    () => readUserEquationGallery(),
  );

  const builtIn = useMemo(
    () =>
      sortGalleryByLocalizedName<EquationGalleryEntry>(
        EQUATION_GALLERY_ENTRIES,
        (entry) => t(entry.labelKey),
        locale,
      ),
    [locale, t],
  );
  const saved = useMemo(
    () =>
      sortGalleryByLocalizedName<UserEquationGalleryEntry>(
        userGallery,
        (entry) => entry.name,
        locale,
      ),
    [locale, userGallery],
  );

  // Word heads every category of its Symbols gallery; only the heading and the
  // command name are localized — the glyph and the LaTeX never are.
  const symbolGroups = useMemo(
    () =>
      MATH_SYMBOL_GROUPS.map((group) => ({
        id: group.id,
        label: t(group.labelKey),
        cells: group.symbols.map((symbol) => ({
          id: symbol.id,
          glyph: symbol.glyph ?? symbol.latex,
          label: t(symbol.labelKey),
        })),
      })),
    [t],
  );
  const symbolById = useMemo(
    () => new Map(MATH_SYMBOLS.map((symbol) => [symbol.id, symbol] as const)),
    [],
  );

  const persist = (next: UserEquationGalleryEntry[]) => {
    setUserGallery(next);
    writeUserEquationGallery(next);
  };

  const saveSelection = async () => {
    if (selectedEquationLatex === null) return;
    const name = await promptText(
      t("toolbar.equationGallerySaveNamePrompt"),
      { defaultValue: t("toolbar.equationGallerySaveDefaultName") },
    );
    if (!name) return;
    const next = saveUserEquationGalleryEntry(
      userGallery,
      name,
      selectedEquationLatex,
    );
    if (next) persist(next);
  };

  const insertTemplate = (template: EquationTemplate) =>
    onInsert(equationInsertPayload(template));
  const insertSymbol = (symbol: MathSymbol) =>
    onInsert(symbolInsertPayload(symbol));
  const insertBuiltIn = (entry: EquationGalleryEntry) => {
    const payload = equationGalleryInsertPayload(entry.id);
    if (payload) onInsert(payload);
  };
  const insertSaved = (entry: UserEquationGalleryEntry) =>
    onInsert({ type: "mathBlock", attrs: { latex: entry.latex } });

  return (
    <>
      <div className="docs-insert-equation-gallery__scroll">
        <div
          className="docs-insert-equation-gallery__heading"
          data-testid={`${testIdPrefix}-gallery-heading-built-in`}
        >
          {t("toolbar.equationGalleryBuiltIn")}
        </div>
        {builtIn.map((entry) => (
          <EquationTile
            key={entry.id}
            name={t(entry.labelKey)}
            latex={entry.latex}
            testId={`${testIdPrefix}-gallery-${entry.id}`}
            onSelect={() => insertBuiltIn(entry)}
          />
        ))}
        {saved.length > 0 ? (
          <>
            <div
              className="docs-insert-equation-gallery__heading"
              data-testid={`${testIdPrefix}-gallery-heading-general`}
            >
              {t("toolbar.equationGalleryGeneral")}
            </div>
            {saved.map((entry) => (
              <EquationTile
                key={entry.id}
                name={entry.name}
                latex={entry.latex}
                testId={`${testIdPrefix}-gallery-user-${entry.id}`}
                onSelect={() => insertSaved(entry)}
                onRemove={() =>
                  persist(removeUserEquationGalleryEntry(userGallery, entry.id))
                }
                removeLabel={t("toolbar.equationGalleryRemove")}
              />
            ))}
          </>
        ) : null}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid={`${testIdPrefix}-templates`}>
          <DocsInsertIcon name="equation" size={18} />
          {t("toolbar.equationTemplates")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="note-editor-toolbar-menu docs-insert-equation-templates">
          {EQUATION_TEMPLATES.map((template) => {
            const markup = renderValidatedKatexMarkup(template.latex);
            return (
              <DropdownMenuItem
                key={template.id}
                data-testid={`${testIdPrefix}-template-${template.id}`}
                onSelect={() => insertTemplate(template)}
              >
                {markup ? (
                  <span
                    className="docs-insert-equation-menu__preview docs-insert-equation-menu__preview--typeset"
                    aria-hidden
                    dangerouslySetInnerHTML={{ __html: markup }}
                  />
                ) : (
                  <span className="docs-insert-equation-menu__preview" aria-hidden>
                    {template.latex}
                  </span>
                )}
                {t(template.labelKey)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid={`${testIdPrefix}-symbols`}>
          <DocsInsertIcon name="symbol" size={18} />
          {t("toolbar.equationSymbols")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="note-editor-toolbar-menu docs-home-gallery-menu docs-insert-equation-symbols"
          data-testid={`${testIdPrefix}-symbol-panel`}
        >
          <DocumentEquationSymbolGallery
            groups={symbolGroups}
            galleryTestId={`${testIdPrefix}-symbol-gallery`}
            groupTestId={(groupId) => `${testIdPrefix}-symbol-group-${groupId}`}
            cellTestId={(cellId) => `${testIdPrefix}-symbol-${cellId}`}
            headingId={(groupId) =>
              `${testIdPrefix}-symbol-heading-${groupId}`
            }
            classNames={SYMBOL_GALLERY_CLASS_NAMES}
            onSelectCell={(cell) => {
              const symbol = symbolById.get(cell.id);
              if (symbol) insertSymbol(symbol);
            }}
            footer={
              onMoreSymbols ? (
                <DropdownMenuItem
                  className="docs-insert-equation-symbols__more"
                  data-testid="document-toolbar-equation-more-symbols"
                  disabled={moreSymbolsDisabled}
                  onSelect={onMoreSymbols}
                >
                  <DocsInsertIcon name="symbol" size={16} />
                  <span>{t("toolbar.symbolMoreSymbols")}</span>
                </DropdownMenuItem>
              ) : null
            }
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid={`${testIdPrefix}-insert-new`}
        onSelect={onInsertNew}
      >
        <DocsInsertIcon name="equation" size={18} />
        {t("toolbar.equationInsertNew")}
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`${testIdPrefix}-save-selection`}
        disabled={selectedEquationLatex === null}
        onSelect={saveSelection}
      >
        <DocsInsertIcon name="symbol" size={18} />
        {t("toolbar.equationGallerySaveSelection")}
      </DropdownMenuItem>
    </>
  );
}
