"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Bookmark dialog (Insert > Bookmark), one dialog for naming, listing,
 * deleting and going to bookmarks (Microsoft Support "Add or delete
 * bookmarks in a Word document"):
 *
 * - "Bookmark name": a name begins with a letter and holds only letters,
 *   numbers and underscores, at most 40 characters; Add stays disabled until
 *   the name is valid (Word does not rewrite it).
 * - The list of the document's bookmarks, sorted by Name or by Location
 *   (document order); choosing a row puts its name in the box.
 * - "Hidden bookmarks" also lists Word's own hidden bookmarks (names that
 *   start with "_", such as the `_Toc…` targets of an imported table of
 *   contents).
 * - Add names the selection, or the insertion point when nothing is
 *   selected (a point bookmark); a name already in use moves to the new
 *   location. Add closes the dialog.
 * - Delete removes the named bookmark (never its text); Go To selects the
 *   bookmarked range and leaves the dialog open, as Word does.
 * - Get Link (an embedded editor whose host makes links to a bookmark: an
 *   ONLYOFFICE config's onMakeActionLink) shows the host's link to the
 *   bookmark, to copy; opening it opens the document there.
 */

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { moveListboxSelection } from "@mrnote/core/web/lib/listbox-arrow-keys.ts";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { wordBookmarkNameProblem } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";

export interface DocumentBookmarkDialogEntry {
  readonly name: string;
  /** Word's hidden bookmarks (names starting with "_"). */
  readonly hidden?: boolean;
  /**
   * A bookmark the document keeps on its target itself (an imported
   * `_Toc…` heading target): listed and reachable, but not deletable here.
   */
  readonly permanent?: boolean;
}

export interface DocumentBookmarkDialogProps {
  readonly open: boolean;
  readonly canEdit: boolean;
  /** The document's bookmarks in document (Location) order. */
  readonly bookmarks: readonly DocumentBookmarkDialogEntry[];
  readonly onAdd: (name: string) => boolean;
  readonly onDelete: (name: string) => boolean;
  readonly onGoTo: (name: string) => boolean;
  /** The host's link that opens the document at the bookmark (null: none came). */
  readonly onGetLink?: (name: string) => Promise<string | null>;
  readonly onClose: () => void;
}

type BookmarkSort = "name" | "location";

export function DocumentBookmarkDialog({
  open,
  canEdit,
  bookmarks,
  onAdd,
  onDelete,
  onGoTo,
  onGetLink,
  onClose,
}: DocumentBookmarkDialogProps) {
  const t = useTranslations("console-notebooks");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [sort, setSort] = useState<BookmarkSort>("name");
  const [showHidden, setShowHidden] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [link, setLink] = useState<{ name: string; value: string | null; waiting: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName("");
  }

  const rows = useMemo(() => {
    const visible = bookmarks.filter((entry) => showHidden || !entry.hidden);
    return sort === "name"
      ? [...visible].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )
      : visible;
  }, [bookmarks, showHidden, sort]);

  const trimmed = name.trim();
  const problem = wordBookmarkNameProblem(trimmed);
  const existing = bookmarks.find((entry) => entry.name === trimmed) ?? null;
  const canAdd = canEdit && problem === null;
  const canDelete = canEdit && existing !== null && !existing.permanent;

  return (
    <OfficeDialogShell
      open={open}
      title={t("bookmark.dialogTitle")}
      description={t("bookmark.dialogDescription")}
      defaultActionLabel={t("bookmark.add")}
      cancelActionLabel={t("bookmark.cancel")}
      defaultActionDisabled={!canAdd}
      onDefaultAction={() => {
        if (!canAdd) return;
        if (onAdd(trimmed)) onClose();
      }}
      onCancel={onClose}
      initialFocusRef={nameRef}
      testIdPrefix="document-bookmark"
      defaultActionTestId="document-bookmark-add"
      footerStart={
        <>
          <button
            type="button"
            className={officeDialogParts.button}
            data-testid="document-bookmark-delete"
            disabled={!canDelete}
            onClick={() => {
              if (!existing || !onDelete(existing.name)) return;
              setName("");
            }}
          >
            <DocumentDialogIcon icon="edit.delete" />
            {t("bookmark.deleteButton")}
          </button>
          <button
            type="button"
            className={officeDialogParts.button}
            data-testid="document-bookmark-go-to"
            disabled={existing === null}
            onClick={() => {
              if (existing) onGoTo(existing.name);
            }}
          >
            <DocumentDialogIcon icon="nav.arrow.right" />
            {t("bookmark.goTo")}
          </button>
          {onGetLink ? (
            <button
              type="button"
              className={officeDialogParts.button}
              data-testid="document-bookmark-get-link"
              disabled={existing === null || existing.hidden === true}
              onClick={() => {
                if (!existing) return;
                const wanted = existing.name;
                setCopied(false);
                setLink({ name: wanted, value: null, waiting: true });
                void onGetLink(wanted).then((value) =>
                  setLink((current) => (current && current.name === wanted ? { name: wanted, value, waiting: false } : current)),
                );
              }}
            >
              <DocumentDialogIcon icon="link.insert" />
              {t("bookmark.getLink")}
            </button>
          ) : null}
        </>
      }
    >
      <label className={officeDialogParts.field}>
        <span className={officeDialogParts.label}>{t("bookmark.nameLabel")}</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          maxLength={80}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={trimmed !== "" && problem !== null}
          data-testid="document-bookmark-name"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {trimmed !== "" && problem !== null ? (
        <p
          className={officeDialogParts.hint}
          role="status"
          data-testid="document-bookmark-name-problem"
          data-problem={problem}
        >
          {problem === "reserved" ? t("bookmark.reservedName") : t("bookmark.nameRule")}
        </p>
      ) : null}
      <ul
        className={officeDialogParts.list}
        role="listbox"
        onKeyDown={moveListboxSelection}
        aria-label={t("bookmark.nameLabel")}
        data-testid="document-bookmark-list"
      >
        {rows.map((entry) => (
          <li key={entry.name} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={entry.name === trimmed}
              className={officeDialogParts.listItem}
              data-testid="document-bookmark-item"
              data-bookmark-name={entry.name}
              data-hidden={entry.hidden ? "true" : undefined}
              onClick={() => setName(entry.name)}
              onDoubleClick={() => onGoTo(entry.name)}
            >
              {entry.name}
            </button>
          </li>
        ))}
        {rows.length === 0 ? (
          <li
            className={officeDialogParts.hint}
            data-testid="document-bookmark-empty"
          >
            {t("bookmark.empty")}
          </li>
        ) : null}
      </ul>
      <div className={officeDialogParts.row} role="radiogroup" aria-label={t("bookmark.sortBy")}>
        <span className={officeDialogParts.label}>{t("bookmark.sortBy")}</span>
        {(["name", "location"] as const).map((value) => (
          <label key={value} className={officeDialogParts.check}>
            <input
              type="radio"
              name="document-bookmark-sort"
              value={value}
              checked={sort === value}
              data-testid={`document-bookmark-sort-${value}`}
              onChange={() => setSort(value)}
            />
            <DocumentDialogIcon icon={value === "name" ? "text.type" : "nav.pin"} />
            <span>
              {value === "name" ? t("bookmark.sortName") : t("bookmark.sortLocation")}
            </span>
          </label>
        ))}
      </div>
      {link ? (
        <div className={officeDialogParts.field} data-testid="document-bookmark-link">
          <span className={officeDialogParts.label}>{t("bookmark.linkLabel", { name: link.name })}</span>
          {link.waiting ? (
            <span className={officeDialogParts.hint} role="status">{t("bookmark.linkWaiting")}</span>
          ) : link.value ? (
            <span className={officeDialogParts.row}>
              <input type="text" readOnly value={link.value} onFocus={(event) => event.target.select()} data-testid="document-bookmark-link-value" />
              <button
                type="button"
                className={officeDialogParts.button}
                data-testid="document-bookmark-link-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.value ?? "").then(() => setCopied(true), () => setCopied(false));
                }}
              >
                {copied ? t("bookmark.linkCopied") : t("bookmark.linkCopy")}
              </button>
            </span>
          ) : (
            <span className={officeDialogParts.hint} role="status">{t("bookmark.linkFailed")}</span>
          )}
        </div>
      ) : null}
      <label className={officeDialogParts.check}>
        <input
          type="checkbox"
          checked={showHidden}
          data-testid="document-bookmark-hidden"
          onChange={(event) => setShowHidden(event.target.checked)}
        />
        <span>{t("bookmark.hidden")}</span>
      </label>
    </OfficeDialogShell>
  );
}
