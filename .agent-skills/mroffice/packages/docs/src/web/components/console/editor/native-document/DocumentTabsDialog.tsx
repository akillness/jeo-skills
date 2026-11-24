"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { moveListboxSelection } from "@mrnote/core/web/lib/listbox-arrow-keys.ts";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { documentLengthUnit, parseDocumentLengthTwips } from "@mrnote/core/web/lib/document-length-fields.ts";
import {
  MAX_TAB_POS,
  MIN_TAB_POS,
  TAB_STOP_ALIGNMENTS,
  TAB_STOP_LEADERS,
  twipsToCm,
  twipsToInches,
  type TabStop,
  type TabStopAlign,
  type TabStopLeader,
} from "@mrnote/core/web/lib/document-tabstops.ts";

import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import styles from "@mrnote/core/web/components/console/editor/native-document/DocumentLayoutDialogs.module.css";
import {
  MAX_DEFAULT_TAB_STOP_TWIPS,
  MIN_DEFAULT_TAB_STOP_TWIPS,
} from "@mrnote/core/web/components/console/editor/native-document/wordDocumentSettings.ts";

/*
 * Word's Tabs dialog (Home > Paragraph launcher > Tabs…; "Set or change the
 * tab stops", "Clear or remove tab stops in Word", Microsoft Support;
 * ECMA-376 17.3.1.37 tab, 17.18.84 ST_TabJc, 17.15.1.25 defaultTabStop):
 * - Tab stop position, with the paragraph's stops listed under it. Picking a
 *   stop in the list loads its position, alignment and leader.
 * - Default tab stops: the document's implicit stop interval
 *   (settings.xml w:defaultTabStop, 0.5 in by default).
 * - Alignment: Left, Center, Right, Decimal, Bar. A bar tab draws a vertical
 *   line and is skipped by tab characters; it has no leader.
 * - Leader: None, dots, dashes, underline.
 * - Set: adds the stop at the typed position, or changes the alignment and
 *   leader of the stop already there. Clear: removes the selected stop.
 *   Clear All: removes every custom stop of the paragraph.
 * Every Set and Clear applies at once (one undo step each), so OK only
 * commits the Default tab stops value and closes.
 */

export interface DocumentTabsDialogProps {
  readonly stops: readonly TabStop[];
  readonly defaultTabStopTwips: number;
  readonly canEdit?: boolean;
  readonly onWriteStops: (stops: TabStop[]) => void;
  /** Commit the document's default tab interval; false keeps the dialog open. */
  readonly onSetDefaultTabStop: (twips: number) => boolean;
  readonly onClose: () => void;
  readonly returnFocusTarget?: () => HTMLElement | null;
}

function format(twips: number, unit: "cm" | "in"): string {
  return (unit === "cm" ? twipsToCm(twips) : twipsToInches(twips)).toFixed(2);
}

// A typed value may name its own unit ("1.5 cm", `0.5"`, "36 pt").
function parse(draft: string, unit: "cm" | "in"): number | null {
  return parseDocumentLengthTwips(draft, unit);
}

export function DocumentTabsDialog({
  stops,
  defaultTabStopTwips,
  canEdit = true,
  onWriteStops,
  onSetDefaultTabStop,
  onClose,
  returnFocusTarget,
}: DocumentTabsDialogProps) {
  const t = useTranslations("console-notebooks");
  const positionRef = useRef<HTMLInputElement | null>(null);
  // Word's measurement unit for the locale, as every Docs length field.
  const locale = useLocale();
  const [unit, setUnit] = useState<"cm" | "in">(() => documentLengthUnit(locale));
  const [positionDraft, setPositionDraft] = useState("");
  const [align, setAlign] = useState<TabStopAlign>("left");
  const [leader, setLeader] = useState<TabStopLeader>("none");
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [defaultDraft, setDefaultDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The exact position behind a value the dialog wrote itself (a picked
  // stop, a position carried across a unit switch). Two decimals of an inch
  // or a centimetre are not exact: 1 cm shows as 0.39 in, which reads back
  // as 562 twips instead of 567 and would set a second, new stop.
  const [shownPosition, setShownPosition] = useState<{
    draft: string;
    twips: number;
  } | null>(null);
  const positionOf = (draft: string, inUnit: "cm" | "in"): number | null =>
    shownPosition && shownPosition.draft === draft
      ? shownPosition.twips
      : parse(draft, inUnit);

  const shownDefault = defaultDraft ?? format(defaultTabStopTwips, unit);
  const selected = useMemo(
    () => stops.find((stop) => stop.pos === selectedPos) ?? null,
    [selectedPos, stops],
  );

  const set = () => {
    if (!canEdit) return;
    const pos = positionOf(positionDraft, unit);
    if (pos === null || pos < MIN_TAB_POS || pos > MAX_TAB_POS) {
      setError(t("toolbar.tabStopsInvalidPosition"));
      return;
    }
    // A stop already at this position is changed in place: the normalizer
    // keeps the LAST declaration for one position.
    onWriteStops([
      ...stops,
      { pos, align, leader: align === "bar" ? "none" : leader },
    ]);
    setSelectedPos(pos);
    setError(null);
  };

  const clearSelected = () => {
    if (!canEdit) return;
    const typed = positionOf(positionDraft, unit);
    const target = selected?.pos ?? typed;
    if (target === null || !stops.some((stop) => stop.pos === target)) return;
    onWriteStops(stops.filter((stop) => stop.pos !== target));
    setSelectedPos(null);
    setPositionDraft("");
  };

  const pick = (stop: TabStop) => {
    setSelectedPos(stop.pos);
    setPositionDraft(format(stop.pos, unit));
    setShownPosition({ draft: format(stop.pos, unit), twips: stop.pos });
    setAlign(stop.align);
    setLeader(stop.leader);
    setError(null);
  };

  const commit = () => {
    if (defaultDraft !== null) {
      const twips = parse(defaultDraft, unit);
      if (
        twips === null ||
        twips < MIN_DEFAULT_TAB_STOP_TWIPS ||
        twips > MAX_DEFAULT_TAB_STOP_TWIPS
      ) {
        setError(t("toolbar.tabStopsInvalidDefault"));
        return;
      }
      if (twips !== defaultTabStopTwips && !onSetDefaultTabStop(twips)) {
        setError(t("toolbar.tabStopsInvalidDefault"));
        return;
      }
    }
    onClose();
  };

  const onPositionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      set();
    }
  };

  return (
    <OfficeDialogShell
      open
      testIdPrefix="document-tab-stops"
      title={t("toolbar.tabStopsTitle")}
      description=""
      defaultActionLabel={t("toolbar.dialogOk")}
      defaultActionTestId="document-tab-stops-close"
      cancelActionLabel={t("toolbar.tabStopsClose")}
      showCancelAction={false}
      onDefaultAction={commit}
      onCancel={onClose}
      initialFocusRef={positionRef}
      returnFocusTarget={returnFocusTarget}
      className="sm:max-w-[520px]"
      footerStart={
        <span className={styles.footerButtons}>
          <button
            type="button"
            className="office-dialog__button"
            data-testid="document-tab-stops-add"
            disabled={!canEdit}
            onClick={set}
          >
            <DocumentDialogIcon icon="action.add" />
            {t("toolbar.tabStopsSet")}
          </button>
          <button
            type="button"
            className="office-dialog__button"
            data-testid="document-tab-stops-clear-one"
            disabled={!canEdit || stops.length === 0}
            onClick={clearSelected}
          >
            <DocumentDialogIcon icon="edit.delete" />
            {t("toolbar.tabStopsClearOne")}
          </button>
          <button
            type="button"
            className="office-dialog__button"
            data-testid="document-tab-stops-clear"
            disabled={!canEdit || stops.length === 0}
            onClick={() => {
              onWriteStops([]);
              setSelectedPos(null);
            }}
          >
            <DocumentDialogIcon icon="format.clear" />
            {t("toolbar.tabStopsClearAll")}
          </button>
        </span>
      }
    >
      <div className={styles.twoColumns} data-testid="document-tab-stops-add-form">
        <div className="office-dialog__field">
          <label className="office-dialog__label" htmlFor="document-tab-stops-position">
            {t("toolbar.tabStopsPosition")}
          </label>
          <input
            id="document-tab-stops-position"
            ref={positionRef}
            type="text"
            inputMode="decimal"
            className={documentValueInputClassName("note-editor-office-toolbar__input")}
            data-testid="document-tab-stops-position"
            aria-label={t("toolbar.tabStopsPosition")}
            value={positionDraft}
            disabled={!canEdit}
            onChange={(event) => {
              setPositionDraft(event.currentTarget.value);
              setSelectedPos(null);
              setError(null);
            }}
            onKeyDown={onPositionKeyDown}
          />
          {stops.length === 0 ? (
            <p className="office-dialog__hint" data-testid="document-tab-stops-empty">
              {t("toolbar.tabStopsEmpty")}
            </p>
          ) : (
            <ul
              className={styles.stopList}
              role="listbox"
              onKeyDown={moveListboxSelection}
              aria-label={t("toolbar.tabStopsPosition")}
              data-testid="document-tab-stops-list"
            >
              {stops.map((stop) => (
                <li key={stop.pos} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={stop.pos === selectedPos}
                    className={styles.stopItem}
                    data-testid={`document-tab-stops-item-${stop.pos}`}
                    onClick={() => pick(stop)}
                  >
                    <span data-testid={`document-tab-stops-item-${stop.pos}-pos`}>
                      {format(stop.pos, unit)}{" "}
                      {t(unit === "cm" ? "toolbar.tabStopsUnitCm" : "toolbar.tabStopsUnitIn")}
                    </span>
                    <span>
                      {t(`toolbar.tabStopsAlign_${stop.align}` as "toolbar.tabStopsAlign_left")}
                    </span>
                    <span>
                      {stop.align === "bar"
                        ? ""
                        : t(`toolbar.tabStopsLeader_${stop.leader}` as "toolbar.tabStopsLeader_none")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="office-dialog__body">
          <label className="office-dialog__field">
            <span className="office-dialog__label">{t("toolbar.tabStopsDefault")}</span>
            <input
              type="text"
              inputMode="decimal"
              className={documentValueInputClassName("note-editor-office-toolbar__input")}
              data-testid="document-tab-stops-default"
              aria-label={t("toolbar.tabStopsDefault")}
              value={shownDefault}
              disabled={!canEdit}
              onChange={(event) => {
                setDefaultDraft(event.currentTarget.value);
                setError(null);
              }}
            />
          </label>
          <label className="office-dialog__field">
            <span className="office-dialog__label">{t("toolbar.tabStopsUnit")}</span>
            <select
              data-testid="document-tab-stops-unit"
              aria-label={t("toolbar.tabStopsUnit")}
              value={unit}
              onChange={(event) => {
                const next = event.currentTarget.value === "in" ? "in" : "cm";
                // Keep the typed values meaning the same length.
                const typed = positionOf(positionDraft, unit);
                const typedDefault =
                  defaultDraft === null ? null : parse(defaultDraft, unit);
                setUnit(next);
                if (typed !== null) {
                  setPositionDraft(format(typed, next));
                  setShownPosition({ draft: format(typed, next), twips: typed });
                }
                if (typedDefault !== null) setDefaultDraft(format(typedDefault, next));
              }}
            >
              <option value="cm">{t("toolbar.tabStopsUnitCm")}</option>
              <option value="in">{t("toolbar.tabStopsUnitIn")}</option>
            </select>
          </label>
        </div>
      </div>
      <fieldset className="office-dialog__group" disabled={!canEdit}>
        <legend>{t("toolbar.tabStopsAlign")}</legend>
        <div className={styles.choiceRow} role="radiogroup">
          {TAB_STOP_ALIGNMENTS.map((value) => (
            <label className="office-dialog__check" key={value}>
              <input
                type="radio"
                name="document-tab-stops-align"
                value={value}
                checked={align === value}
                data-testid={`document-tab-stops-align-${value}`}
                onChange={() => setAlign(value)}
              />
              <DocumentDialogIcon icon={`paragraph.tab.${value}`} />
              {t(`toolbar.tabStopsAlign_${value}` as "toolbar.tabStopsAlign_left")}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="office-dialog__group" disabled={!canEdit || align === "bar"}>
        <legend>{t("toolbar.tabStopsLeader")}</legend>
        <div className={styles.choiceRow} role="radiogroup">
          {TAB_STOP_LEADERS.map((value) => (
            <label className="office-dialog__check" key={value}>
              <input
                type="radio"
                name="document-tab-stops-leader"
                value={value}
                checked={(align === "bar" ? "none" : leader) === value}
                data-testid={`document-tab-stops-leader-${value}`}
                onChange={() => setLeader(value)}
              />
              {t(`toolbar.tabStopsLeader_${value}` as "toolbar.tabStopsLeader_none")}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p className="office-dialog__message" role="alert" data-testid="document-tab-stops-error">
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
