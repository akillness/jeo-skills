"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  FileText,
  Globe,
  Mail,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import {
  MAX_LINK_TITLE_CHARS,
  findLinkPlaceByHref,
  type LinkPlaceOption,
} from "@mrnote/core/web/components/console/editor/native-document/linkPlaces.ts";

/**
 * Word's Insert Hyperlink dialog (Insert > Link, Ctrl+K), "Edit Hyperlink"
 * when the caret or selection is on a link. Microsoft Support, "Create or
 * edit a hyperlink", "Add hyperlinks to a location within the same
 * document" and "Use a screen reader to insert a hyperlink in Word":
 *
 *   - "Text to display" at the top: the words the link shows. With a plain
 *     run of text selected it holds that text (editing it replaces the
 *     text); a selection that is more than plain text shows
 *     "<<Selection in Document>>" and cannot be edited. With nothing
 *     selected it follows the address as the user types, until the user
 *     types a text of their own.
 *   - "ScreenTip..." beside it opens the small "Set Hyperlink ScreenTip"
 *     dialog; its text is the hover tip of the link.
 *   - "Link to" on the left chooses the destination page:
 *       Web Page         the Address box (the keyboard starts here),
 *       Place in This Document   the document's headings and bookmarks,
 *       E-mail Address   address and Subject, stored as a mailto: link.
 *     Word's file browser, "Create New Document" and "Top of the Document"
 *     have no counterpart in a web document and are not offered.
 *   - OK writes the link, Cancel / Escape leave the document unchanged, and
 *     an existing link offers "Remove Link".
 *
 * The dialog owns only its draft; the toolbar turns the request into the
 * link mark through its own selection authority (`onApply`).
 */

export type DocumentHyperlinkTarget =
  | { readonly kind: "web"; readonly address: string }
  | { readonly kind: "place"; readonly href: string }
  | {
      readonly kind: "email";
      readonly address: string;
      readonly subject: string;
      



      readonly headers?: readonly string[];
    };

export interface DocumentHyperlinkRequest {
  readonly target: DocumentHyperlinkTarget;
  /** The text to display ("" when the selection keeps its own text). */
  readonly text: string;
  readonly screenTip: string;
}

export interface DocumentHyperlinkDialogProps {
  readonly open: boolean;
  /** The caret or selection is on a link: "Edit Hyperlink", Remove Link. */
  readonly editing: boolean;
  readonly initialHref: string;
  readonly initialScreenTip: string;
  readonly initialText: string;
  /** False when the selection is more than a plain run of text. */
  readonly textEditable: boolean;
  readonly places: readonly LinkPlaceOption[];
  readonly canEdit: boolean;
  /** True when written; a message keeps the dialog open with the reason. */
  readonly onApply: (request: DocumentHyperlinkRequest) => true | string;
  readonly onRemove: () => void;
  readonly onCancel: () => void;
  readonly returnFocusTarget?: () => HTMLElement | null;
}

const MAX_ADDRESS_CHARS = 2_048;
const MAX_DISPLAY_CHARS = 1_000;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+$/;







export function mailtoAddressList(value: string): string[] | null {
  const addresses = value
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address !== "");
  if (addresses.length === 0) return null;
  return addresses.every((address) => EMAIL_RE.test(address)) ? addresses : null;
}

/**
 * `mailto:` address and subject of a stored link, or null. `headers` keeps
 * every `hfname=hfvalue` pair of the query as it is spelled, in order,
 * subject included, so a rebuilt link loses none of the fields the dialog
 * does not show (RFC 6068 section 2).
 */
export function parseMailtoHref(
  href: string,
): { address: string; subject: string; headers: readonly string[] } | null {
  if (!/^mailto:/i.test(href)) return null;
  const rest = href.slice("mailto:".length);
  const queryAt = rest.indexOf("?");
  const rawAddress = queryAt < 0 ? rest : rest.slice(0, queryAt);
  let address = rawAddress;
  try {
    address = decodeURIComponent(rawAddress);
  } catch {
    // Keep the stored spelling.
  }
  const query = queryAt < 0 ? "" : rest.slice(queryAt + 1);
  const headers = query ? query.split("&").filter((pair) => pair !== "") : [];
  // RFC 6068: header field names are case-insensitive, so `Subject=` is the
  // subject as `subject=` is -- read and written by the same rule, or an
  
  const subjectPair = headers.find((pair) => mailtoHeaderName(pair) === "subject");
  const subject = subjectPair ? mailtoHeaderValue(subjectPair) : "";
  return { address, subject, headers };
}







function mailtoHeaderValue(pair: string): string {
  const at = pair.indexOf("=");
  const raw = at < 0 ? "" : pair.slice(at + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function mailtoHeaderName(pair: string): string {
  const name = pair.split("=", 1)[0] ?? "";
  try {
    return decodeURIComponent(name).toLowerCase();
  } catch {
    return name.toLowerCase();
  }
}

/**
 * RFC 6068 section 2: an address in a `mailto:` URI keeps only unreserved
 * characters and the "some-delims" as they are; every other character (`?`,
 * `#`, `%`, `&`, `/`, non-ASCII, ...) is percent-encoded, or it would read as
 * the start of the header fields or the fragment and cut the address short.
 */
function mailtoAddress(address: string): string {
  return address.replace(/[^A-Za-z0-9\-._~!$'()*+,;:@]/gu, (character) =>
    encodeURIComponent(character),
  );
}

/**
 * The `mailto:` link Word writes for an E-mail Address destination, or null
 * for an address that is not one. A pasted "mailto:" link is accepted and
 * read as the URI it is (escapes decoded, its subject used when none is
 * given) before it is written again.
 */
export function buildMailtoHref(
  address: string,
  subject: string,
  headers: readonly string[] = [],
): string | null {
  const trimmed = address.trim();
  const pasted = parseMailtoHref(trimmed);
  const recipients = mailtoAddressList(pasted ? pasted.address : trimmed);
  if (!recipients) return null;
  const bare = recipients.join(",");
  const topic = (subject.trim() ? subject : (pasted?.subject ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  // The other header fields stay as they were spelled and where they were;
  // only the subject is rewritten, dropped when cleared, or appended. A pasted
  // mailto: link brings its own fields.
  const query: string[] = [];
  let subjectPlaced = false;
  for (const pair of pasted ? pasted.headers : headers) {
    if (mailtoHeaderName(pair) !== "subject") {
      query.push(pair);
    } else if (!subjectPlaced && topic) {
      // An unchanged subject keeps its own spelling (`%20` or `%2B`, a literal `+`).
      const stored = mailtoHeaderValue(pair).replace(/\s+/g, " ").trim();
      query.push(stored === topic ? pair : `subject=${encodeURIComponent(topic)}`);
      subjectPlaced = true;
    }
  }
  if (topic && !subjectPlaced) query.unshift(`subject=${encodeURIComponent(topic)}`);
  return `mailto:${mailtoAddress(bare)}${query.length ? `?${query.join("&")}` : ""}`;
}

/** A group title in the place list lines up with the rows under it. */
const GROUP_TITLE_STYLE = { padding: "4px 8px 2px" } as const;

type Destination = DocumentHyperlinkTarget["kind"];
const DESTINATIONS: readonly Destination[] = ["web", "place", "email"];

export function DocumentHyperlinkDialog({
  open,
  editing,
  initialHref,
  initialScreenTip,
  initialText,
  textEditable,
  places,
  canEdit,
  onApply,
  onRemove,
  onCancel,
  returnFocusTarget,
}: DocumentHyperlinkDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const id = useId();
  const initialPlace = findLinkPlaceByHref([...places], initialHref);
  const initialMail = parseMailtoHref(initialHref);
  const [destination, setDestination] = useState<Destination>(
    initialPlace ? "place" : initialMail ? "email" : "web",
  );
  const [address, setAddress] = useState(
    initialPlace || initialMail ? "" : initialHref,
  );
  const [placeHref, setPlaceHref] = useState(initialPlace?.href ?? "");
  const [emailAddress, setEmailAddress] = useState(initialMail?.address ?? "");
  const [emailSubject, setEmailSubject] = useState(initialMail?.subject ?? "");
  const [text, setText] = useState(initialText);
  // An empty "Text to display" mirrors the destination until the user types
  // one of their own, as Word's does.
  const [textFollows, setTextFollows] = useState(
    textEditable && initialText === "",
  );
  const [screenTip, setScreenTip] = useState(initialScreenTip);
  const [screenTipOpen, setScreenTipOpen] = useState(false);
  const [screenTipDraft, setScreenTipDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);
  // The place the keyboard lands on in the place list (the chosen one, or
  // the first).
  const placeFocusRef = useRef<HTMLButtonElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const screenTipRef = useRef<HTMLInputElement | null>(null);
  const initialFocusRef =
    destination === "place"
      ? placeFocusRef
      : destination === "email"
        ? emailRef
        : addressRef;

  const follow = (next: string) => {
    if (textFollows) setText(next);
  };
  const edited = () => {
    if (error) setError(null);
  };

  const target: DocumentHyperlinkTarget =
    destination === "place"
      ? { kind: "place", href: placeHref }
      : destination === "email"
        ? {
            kind: "email",
            address: emailAddress,
            subject: emailSubject,
            headers: initialMail?.headers ?? [],
          }
        : { kind: "web", address };
  const targetReady =
    target.kind === "place"
      ? findLinkPlaceByHref([...places], target.href) !== null
      : target.address.trim() !== "";

  const apply = () => {
    const result = onApply({
      target,
      text: textEditable ? text : "",
      screenTip,
    });
    if (result !== true) setError(result);
  };

  const selectDestination = (next: Destination) => {
    setDestination(next);
    setError(null);
    // Text that still mirrors the destination mirrors the one now chosen:
    // what that destination already holds, as typing into it would have
    
    if (next === "web") {
      follow(address);
    } else if (next === "email") {
      const bare = emailAddress.trim().replace(/^mailto:/i, "");
      follow(bare ? `mailto:${bare}` : "");
    } else {
      follow(findLinkPlaceByHref([...places], placeHref)?.label ?? "");
    }
  };
  const destinationLabel = (kind: Destination) =>
    kind === "web"
      ? t("toolbar.linkDialogWebPage")
      : kind === "place"
        ? t("toolbar.linkDialogPlace")
        : t("toolbar.linkDialogEmail");
  const destinationIcon = (kind: Destination) =>
    kind === "web" ? (
      <Globe size={16} aria-hidden="true" />
    ) : kind === "place" ? (
      <FileText size={16} aria-hidden="true" />
    ) : (
      <Mail size={16} aria-hidden="true" />
    );

  // Up/Down, Home and End move through a vertical list and choose.
  const moveInList = (
    event: KeyboardEvent<HTMLElement>,
    count: number,
    index: number,
    select: (index: number) => void,
  ) => {
    const next =
      event.key === "ArrowDown"
        ? Math.min(count - 1, index + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
  };

  const headings = places.filter((place) => place.kind === "heading");
  const bookmarks = places.filter((place) => place.kind === "bookmark");
  const orderedPlaces = [...headings, ...bookmarks];
  const pickPlace = (place: LinkPlaceOption) => {
    setPlaceHref(place.href);
    follow(place.label);
    edited();
  };
  const rovingPlace =
    orderedPlaces.find((place) => place.href === placeHref) ?? orderedPlaces[0];
  const placeOption = (place: LinkPlaceOption) => (
    <button
      key={`${place.kind}:${place.id}`}
      ref={place === rovingPlace ? placeFocusRef : undefined}
      type="button"
      role="option"
      aria-selected={placeHref === place.href}
      tabIndex={place === rovingPlace ? 0 : -1}
      className={parts.listItem}
      style={
        place.kind === "heading"
          ? { paddingInlineStart: `${8 + Math.max(0, place.level - 1) * 14}px` }
          : undefined
      }
      data-testid="document-toolbar-link-place-option"
      data-href={place.href}
      disabled={!canEdit}
      onClick={() => pickPlace(place)}
    >
      {place.label}
    </button>
  );

  return (
    <OfficeDialogShell
      open={open}
      title={
        editing
          ? t("toolbar.linkDialogEditTitle")
          : t("toolbar.linkDialogInsertTitle")
      }
      description={
        <span className="sr-only">{t("toolbar.linkDialogDescription")}</span>
      }
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.dialogCancel")}
      defaultActionDisabled={!canEdit || !targetReady}
      onDefaultAction={apply}
      onCancel={onCancel}
      initialFocusRef={initialFocusRef}
      returnFocusTarget={returnFocusTarget}
      testIdPrefix="document-hyperlink"
      defaultActionTestId="document-toolbar-link-apply"
      cancelActionTestId="document-toolbar-link-cancel"
      className="w-[min(640px,calc(100vw-32px))] sm:max-w-[640px]"
      footerStart={
        editing ? (
          <button
            type="button"
            className={parts.button}
            disabled={!canEdit}
            data-testid="document-toolbar-link-remove"
            onClick={onRemove}
          >
            {t("toolbar.linkDialogRemove")}
          </button>
        ) : null
      }
    >
      {/* Text to display fills the row; ScreenTip... sits at its end. A grid,
          because the chrome pins a field's flex so it would not grow. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className={parts.field}>
          <span className={parts.label}>{t("toolbar.linkTextPlaceholder")}</span>
          <input
            type="text"
            value={textEditable ? text : t("toolbar.linkDialogSelectionInDocument")}
            readOnly={!textEditable}
            disabled={!canEdit}
            maxLength={MAX_DISPLAY_CHARS}
            data-testid="document-toolbar-link-text"
            onChange={(event) => {
              setText(event.target.value);
              setTextFollows(false);
              edited();
            }}
          />
        </label>
        <button
          type="button"
          className={parts.button}
          disabled={!canEdit}
          aria-haspopup="dialog"
          title={screenTip || undefined}
          data-testid="document-toolbar-link-screentip-open"
          onClick={() => {
            setScreenTipDraft(screenTip);
            setScreenTipOpen(true);
          }}
        >
          <DocumentDialogIcon icon="chat.bubble" />
          {t("toolbar.linkDialogScreenTip")}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[168px_minmax(0,1fr)]">
        <div className={parts.field}>
          <span className={parts.label} id={`${id}-link-to`}>
            {t("toolbar.linkDialogLinkTo")}
          </span>
          <div
            className={parts.list}
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby={`${id}-link-to`}
            data-testid="document-toolbar-link-to"
            onKeyDown={(event) =>
              moveInList(
                event,
                DESTINATIONS.length,
                DESTINATIONS.indexOf(destination),
                (index) => {
                  const next = DESTINATIONS[index];
                  selectDestination(next);
                  event.currentTarget
                    .querySelector<HTMLElement>(`[data-destination="${next}"]`)
                    ?.focus();
                },
              )
            }
          >
            {DESTINATIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                id={`${id}-tab-${kind}`}
                aria-selected={destination === kind}
                aria-controls={`${id}-panel`}
                tabIndex={destination === kind ? 0 : -1}
                className={`${parts.listItem} flex items-center gap-2`}
                data-destination={kind}
                data-testid={`document-toolbar-link-to-${kind}`}
                onClick={() => selectDestination(kind)}
              >
                {destinationIcon(kind)}
                {destinationLabel(kind)}
              </button>
            ))}
          </div>
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${destination}`}
          className="flex min-w-0 flex-col gap-3"
          data-testid={`document-toolbar-link-panel-${destination}`}
        >
          {destination === "web" ? (
            <label className={parts.field}>
              <span className={parts.label}>
                {t("toolbar.linkDialogAddress")}
              </span>
              <input
                ref={addressRef}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://"
                value={address}
                disabled={!canEdit}
                maxLength={MAX_ADDRESS_CHARS}
                aria-invalid={error ? "true" : undefined}
                data-testid="document-toolbar-link-input"
                onChange={(event) => {
                  setAddress(event.target.value);
                  follow(event.target.value);
                  edited();
                }}
              />
            </label>
          ) : destination === "place" ? (
            <div className={parts.field}>
              <span className={parts.label} id={`${id}-place-label`}>
                {t("toolbar.linkDialogSelectPlace")}
              </span>
              {orderedPlaces.length > 0 ? (
                <div
                  role="listbox"
                  aria-labelledby={`${id}-place-label`}
                  className={`${parts.list} max-h-56 overflow-auto`}
                  data-testid="document-toolbar-link-place"
                  onKeyDown={(event) => {
                    const index = orderedPlaces.findIndex(
                      (place) => place.href === placeHref,
                    );
                    moveInList(event, orderedPlaces.length, index, (next) => {
                      const place = orderedPlaces[next];
                      pickPlace(place);
                      Array.from(
                        event.currentTarget.querySelectorAll<HTMLElement>(
                          '[role="option"]',
                        ),
                      )
                        .find((option) => option.dataset.href === place.href)
                        ?.focus();
                    });
                  }}
                >
                  {headings.length > 0 ? (
                    <div role="group" aria-labelledby={`${id}-headings`}>
                      <div
                        id={`${id}-headings`}
                        className={parts.sectionTitle}
                        style={GROUP_TITLE_STYLE}
                      >
                        {t("toolbar.linkDialogHeadings")}
                      </div>
                      {headings.map(placeOption)}
                    </div>
                  ) : null}
                  {bookmarks.length > 0 ? (
                    <div role="group" aria-labelledby={`${id}-bookmarks`}>
                      <div
                        id={`${id}-bookmarks`}
                        className={parts.sectionTitle}
                        style={GROUP_TITLE_STYLE}
                      >
                        {t("toolbar.linkDialogBookmarks")}
                      </div>
                      {bookmarks.map(placeOption)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={parts.hint} data-testid="document-toolbar-link-place-empty">
                  {t("toolbar.linkDialogNoPlaces")}
                </p>
              )}
            </div>
          ) : (
            <>
              <label className={parts.field}>
                <span className={parts.label}>
                  {t("toolbar.linkDialogEmailAddress")}
                </span>
                <input
                  ref={emailRef}
                  type="email"
                  // Several recipients, comma-separated, as a mailto: holds
                  
                  multiple
                  autoComplete="off"
                  spellCheck={false}
                  value={emailAddress}
                  disabled={!canEdit}
                  maxLength={320}
                  aria-invalid={error ? "true" : undefined}
                  data-testid="document-toolbar-link-email"
                  onChange={(event) => {
                    setEmailAddress(event.target.value);
                    const bare = event.target.value.trim().replace(/^mailto:/i, "");
                    follow(bare ? `mailto:${bare}` : "");
                    edited();
                  }}
                />
              </label>
              <label className={parts.field}>
                <span className={parts.label}>
                  {t("toolbar.linkDialogEmailSubject")}
                </span>
                <input
                  type="text"
                  value={emailSubject}
                  disabled={!canEdit}
                  maxLength={255}
                  data-testid="document-toolbar-link-email-subject"
                  onChange={(event) => {
                    setEmailSubject(event.target.value);
                    edited();
                  }}
                />
              </label>
            </>
          )}
          {error ? (
            <p role="alert" className={parts.error} data-testid="document-toolbar-link-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      {/* Word's "Set Hyperlink ScreenTip": a small dialog over this one. Its
          own form submits and closes it; the wrapper keeps that submit from
          reaching this dialog's form through the React tree. */}
      <div style={{ display: "contents" }} onSubmit={(event) => event.stopPropagation()}>
        <OfficeDialogShell
          open={screenTipOpen}
          title={t("toolbar.linkScreenTipDialogTitle")}
          description={
            <span className="sr-only">
              {t("toolbar.linkScreenTipDialogDescription")}
            </span>
          }
          defaultActionLabel={t("toolbar.dialogOk")}
          cancelActionLabel={t("toolbar.dialogCancel")}
          onDefaultAction={() => {
            setScreenTip(screenTipDraft.replace(/\s+/g, " ").trim());
            setScreenTipOpen(false);
          }}
          onCancel={() => setScreenTipOpen(false)}
          initialFocusRef={screenTipRef}
          testIdPrefix="document-hyperlink-screentip"
          className="w-[min(400px,calc(100vw-32px))]"
        >
          <label className={parts.field}>
            <span className={parts.label}>{t("toolbar.linkScreenTipText")}</span>
            <input
              ref={screenTipRef}
              type="text"
              value={screenTipDraft}
              maxLength={MAX_LINK_TITLE_CHARS}
              data-testid="document-toolbar-link-screentip"
              onChange={(event) => setScreenTipDraft(event.target.value)}
            />
          </label>
        </OfficeDialogShell>
      </div>
    </OfficeDialogShell>
  );
}
