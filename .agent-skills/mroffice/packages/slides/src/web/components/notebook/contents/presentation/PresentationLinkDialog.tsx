"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { presentationSlideDisplayTitle } from "../../../../lib/presentation-outline-view";
import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { useId, useRef, useState } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  ChevronDown,
  ChevronRight,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  normalizeRunHyperlink,
  runSlideActionTarget,
} from "@mrnote/core/web/lib/presentation-runs.ts";
import {
  buildSlideLinkHref,
  parseSlideLinkTarget,
} from "@mrnote/core/web/lib/presentation-block-fx.ts";
import { OfficeLinkScreenTipDialog } from "@mrnote/core/web/components/office-ribbon/OfficeLinkScreenTipDialog.tsx";
import {
  MAX_PRESENTATION_LINK_TOOLTIP_LENGTH,
  linkTooltipFromInput,
} from "@mrnote/core/web/lib/presentation-link-settings.ts";
import styles from "./PresentationLinkDialog.module.css";

export interface PresentationLinkDialogProps {
  text: string;
  href?: string;
  slides: readonly { id: string; title: string; blocks?: readonly PresentationBlock[] }[];
  writable: boolean;
  canRename: boolean;
  /** The link's ScreenTip now (Insert Hyperlink > ScreenTip..., PPT-B010). */
  tooltip?: string;
  onInsert: (text: string, href: string, tooltip: string | undefined) => void;
  onCancel: () => void;
  /**
   * A link on a whole object (a shape, a picture) rather than on words: the
   * Text to Display box shows this, read-only, as PowerPoint shows
   * "<<Selection in Document>>", and no display text is required.
   */
  objectLabel?: string;
}

type LinkTab = "web" | "deck" | "email";
const LINK_TABS: readonly LinkTab[] = ["web", "deck", "email"];

/**
 * A `mailto:` link as PowerPoint's E-mail Address page states it: the address
 * and an optional `?subject=` (Insert Hyperlink > E-mail Address, PPT-B010).
 */
export function presentationMailtoHref(address: string, subject: string): string | null {
  const trimmed = address.trim().replace(/^mailto:/i, "");
  if (!trimmed || /[\s\u0000-\u001f?]/.test(trimmed)) return null;
  const topic = subject.trim();
  return `mailto:${trimmed}${topic ? `?subject=${encodeURIComponent(topic)}` : ""}`;
}

/** The address and subject a stored `mailto:` link names, or null. */
export function parsePresentationMailtoHref(
  href: string,
): { address: string; subject: string } | null {
  const match = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(href);
  if (!match) return null;
  let subject = "";
  for (const pair of (match[2] ?? "").split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key?.toLowerCase() === "subject") {
      try {
        subject = decodeURIComponent(value.replace(/\+/g, " "));
      } catch {
        subject = value;
      }
    }
  }
  return { address: match[1], subject };
}

/** Screenshot-matched PPT adapter; selection and native transactions stay owned by the editor. */
export function PresentationLinkDialog({
  text,
  href = "",
  slides,
  writable,
  canRename,
  onInsert,
  onCancel,
  objectLabel,
  tooltip: initialTooltip,
}: PresentationLinkDialogProps) {
  const objectLink = objectLabel !== undefined;
  const t = useTranslations("console-notebooks");
  const instanceId = useId();
  const [displayText, setDisplayText] = useState(text);
  const [tooltip, setTooltip] = useState(initialTooltip ?? "");
  const [screenTipOpen, setScreenTipOpen] = useState(false);
  const [tab, setTab] = useState<LinkTab>(() =>
    parseSlideLinkTarget(href) || runSlideActionTarget(href)
      ? "deck"
      : parsePresentationMailtoHref(href)
        ? "email"
        : "web",
  );
  const [address, setAddress] = useState(() => (tab === "web" ? href : ""));
  const [email, setEmail] = useState(
    () => parsePresentationMailtoHref(href)?.address ?? "",
  );
  const [subject, setSubject] = useState(
    () => parsePresentationMailtoHref(href)?.subject ?? "",
  );
  const emailRef = useRef<HTMLInputElement | null>(null);
  const [target, setTarget] = useState(() => (tab === "deck" ? href : ""));
  const [titlesOpen, setTitlesOpen] = useState(
    Boolean(parseSlideLinkTarget(href)),
  );
  const addressRef = useRef<HTMLInputElement | null>(null);
  const knownIds = new Set(slides.map((slide) => slide.id));
  const destination = normalizeRunHyperlink(
    tab === "web"
      ? address.trim()
      : tab === "email"
        ? (presentationMailtoHref(email, subject) ?? "")
        : target,
    knownIds,
  );
  const valid =
    writable &&
    (objectLink ||
      (Boolean(displayText.trim()) &&
        !/[\r\n\u0000-\u001f]/.test(displayText))) &&
    Boolean(destination) &&
    (tab === "deck"
      ? Boolean(
          runSlideActionTarget(destination) ||
          parseSlideLinkTarget(destination, knownIds),
        )
      : !runSlideActionTarget(destination) &&
        !parseSlideLinkTarget(destination));
  const insert = () => {
    if (valid && destination) onInsert(displayText, destination, linkTooltipFromInput(tooltip));
  };
  return (
    <OfficeDialogShell
      open
      title={t(
        href
          ? "presentation.linkDialog.editTitle"
          : "presentation.linkDialog.insertTitle",
      )}
      description={
        <span className={styles.srOnly}>
          {t("presentation.linkDialog.description")}
        </span>
      }
      defaultActionLabel={t("presentation.linkDialog.ok")}
      cancelActionLabel={t("toolbar.cancel")}
      defaultActionDisabled={!valid}
      onDefaultAction={insert}
      onCancel={onCancel}
      initialFocusRef={
        tab === "web" ? addressRef : tab === "email" ? emailRef : undefined
      }
      testIdPrefix="presentation-link-dialog"
      className={styles.dialog}
    >
      <div className={styles.textHeader}>
        <label className={styles.textRow}>
          <span>{t("presentation.linkDialog.displayText")}</span>
          <input
            value={objectLink ? objectLabel : displayText}
            readOnly={objectLink || !canRename || !writable}
            maxLength={2000}
            title={
              !canRename
                ? t("presentation.linkDialog.renameUnavailable")
                : undefined
            }
            onChange={(event) => setDisplayText(event.target.value)}
            data-testid="presentation-link-display-text"
          />
        </label>
        {/* PowerPoint's "ScreenTip..." beside Text to Display: the text the
            slide show shows when the pointer rests on the link. */}
        <button
          type="button"
          className={officeDialogParts.button}
          disabled={!writable}
          aria-haspopup="dialog"
          title={tooltip || undefined}
          onClick={() => setScreenTipOpen(true)}
          data-testid="presentation-link-screentip-open"
        >
          {t("presentation.linkDialog.screenTip")}
        </button>
      </div>
      {!writable ? (
        <p
          className={styles.reason}
          role="status"
          data-testid="presentation-link-unavailable"
        >
          {t("presentation.linkDialog.stale")}
        </p>
      ) : !canRename && !objectLink ? (
        <p className={styles.reason}>
          {t("presentation.linkDialog.renameUnavailable")}
        </p>
      ) : null}
      <div
        className={officeDialogParts.tabs}
        role="tablist"
        aria-label={t("presentation.linkDialog.destination")}
      >
        {LINK_TABS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            aria-controls={`${instanceId}-link-${kind}-panel`}
            id={`${instanceId}-link-${kind}-tab`}
            tabIndex={tab === kind ? 0 : -1}
            className={officeDialogParts.tab}
            onClick={() => setTab(kind)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : LINK_TABS.length - 1;
                const next =
                  LINK_TABS[(LINK_TABS.indexOf(kind) + step) % LINK_TABS.length];
                setTab(next);
                event.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(
                    `[data-testid="presentation-link-tab-${next}"]`,
                  )
                  ?.focus();
              }
            }}
            data-testid={`presentation-link-tab-${kind}`}
          >
            {t(
              kind === "web"
                ? "presentation.linkDialog.webFile"
                : kind === "email"
                  ? "presentation.linkDialog.emailAddress"
                  : "presentation.linkDialog.thisPresentation",
            )}
          </button>
        ))}
      </div>
      <section
        className={styles.panel}
        role="tabpanel"
        id={`${instanceId}-link-${tab}-panel`}
        aria-labelledby={`${instanceId}-link-${tab}-tab`}
      >
        {tab === "web" ? (
          <>
            <p>{t("presentation.linkDialog.webHint")}</p>
            <label className={styles.addressRow}>
              <span>{t("presentation.linkDialog.address")}</span>
              <input
                ref={addressRef}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                disabled={!writable}
                maxLength={2048}
                data-testid="presentation-ribbon-insert-link-url"
                data-link-scope="run"
              />
            </label>
          </>
        ) : tab === "email" ? (
          <>
            <label className={styles.addressRow}>
              <span>{t("presentation.linkDialog.emailAddressField")}</span>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!writable}
                maxLength={512}
                data-testid="presentation-link-email-address"
              />
            </label>
            <label className={styles.addressRow}>
              <span>{t("presentation.linkDialog.emailSubject")}</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={!writable}
                maxLength={255}
                data-testid="presentation-link-email-subject"
              />
            </label>
          </>
        ) : (
          <>
            <p>{t("presentation.linkDialog.chooseSlide")}</p>
            <div className={`${officeDialogParts.list} ${styles.targets}`}>
              {(["first", "last", "next", "previous"] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  disabled={!writable}
                  aria-pressed={target === `slide-action://${kind}`}
                  className={officeDialogParts.listItem}
                  onClick={() => setTarget(`slide-action://${kind}`)}
                  data-testid={`presentation-link-target-${kind}`}
                >
                  {t(`presentation.linkDialog.${kind}`)}
                </button>
              ))}
              <button
                type="button"
                className={`${officeDialogParts.listItem} ${styles.titlesToggle}`}
                aria-expanded={titlesOpen}
                onClick={() => setTitlesOpen((open) => !open)}
                data-testid="presentation-link-slide-titles"
              >
                {titlesOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                {t("presentation.linkDialog.slideTitles")}
              </button>
              {titlesOpen ? (
                <div className={styles.slideList}>
                  {slides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      disabled={!writable}
                      aria-pressed={target === buildSlideLinkHref(slide.id)}
                      className={officeDialogParts.listItem}
                      data-testid={`presentation-link-slide-${slide.id}`}
                      onClick={() =>
                        setTarget(buildSlideLinkHref(slide.id) ?? "")
                      }
                    >
                      {index + 1}.{" "}
                      {presentationSlideDisplayTitle(slide) || t("presentation.untitledSlide")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
      <OfficeLinkScreenTipDialog
        open={screenTipOpen}
        value={tooltip}
        maxLength={MAX_PRESENTATION_LINK_TOOLTIP_LENGTH}
        onApply={(value) => {
          setTooltip(linkTooltipFromInput(value) ?? "");
          setScreenTipOpen(false);
        }}
        onCancel={() => setScreenTipOpen(false)}
        testIdPrefix="presentation-link-screentip"
      />
    </OfficeDialogShell>
  );
}
