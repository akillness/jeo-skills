"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * "Load pictures from <host>?" for IMAGE formulas and "Get data from <host>?"
 * for WEBSERVICE formulas, in the window's notice.
 *
 * The server refuses (#BLOCKED!) every host the member has not allowed: a
 * source can be computed from cells, so its URL can carry workbook text.
 * Excel likewise asks before turning on access to linked images. Pictures
 * and data are separate consents (web-image-store, web-data-store); one host
 * at a time, pictures first. "Allow" is kept on the server for the member,
 * "Don't allow" for this tab.
 */

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import WindowNotice from "@mrnote/core/web/components/notebook/WindowNotice.tsx";
import {
  allowSpreadsheetWebImageHost,
  denySpreadsheetWebImageHost,
  spreadsheetWebImageHostQuestions,
  subscribeSpreadsheetWebImages,
} from "../../../../lib/spreadsheet/web-image-store";
import {
  allowSpreadsheetWebServiceHost,
  denySpreadsheetWebServiceHost,
  spreadsheetWebServiceHostQuestions,
  subscribeSpreadsheetExternalData,
} from "../../../../lib/spreadsheet/web-data-store";

const NO_QUESTIONS: readonly string[] = [];

interface HostQuestionKind {
  /** The message keys: `${keys}.title|ask|warn|allow|deny`. */
  readonly keys: "spreadsheet.webImageHost" | "spreadsheet.webServiceHost";
  readonly testId: string;
  readonly allow: (host: string) => Promise<void>;
  readonly deny: (host: string) => void;
}

const PICTURES: HostQuestionKind = {
  keys: "spreadsheet.webImageHost",
  testId: "spreadsheet-web-image-host",
  allow: allowSpreadsheetWebImageHost,
  deny: denySpreadsheetWebImageHost,
};

const DATA: HostQuestionKind = {
  keys: "spreadsheet.webServiceHost",
  testId: "spreadsheet-web-service-host",
  allow: allowSpreadsheetWebServiceHost,
  deny: denySpreadsheetWebServiceHost,
};

function HostQuestion({
  host,
  kind,
}: {
  host: string;
  kind: HostQuestionKind;
}) {
  const t = useTranslations("console-notebooks");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <WindowNotice
      title={t(`${kind.keys}.title`)}
      scopeKey={kind === PICTURES ? host : `data:${host}`}
      testId={`${kind.testId}-consent`}
    >
      <div
        role="alertdialog"
        className="page-save-conflict-banner"
        // One column: the question, then its two answers (the banner's own
        // three columns expect an icon first, and squeezed "Allow" to 0 px).
        style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
        data-testid={`${kind.testId}-question`}
      >
        <div className="page-save-conflict-banner__copy">
          <strong>{t(`${kind.keys}.ask`, { host })}</strong>
          <span>{t(`${kind.keys}.warn`)}</span>
          {failed ? <span role="alert">{t("pages.saveFailed")}</span> : null}
        </div>
        <div className="page-save-conflict-banner__actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setFailed(false);
              kind
                .allow(host)
                .catch(() => setFailed(true))
                .finally(() => setBusy(false));
            }}
          >
            {t(`${kind.keys}.allow`)}
          </button>
          <button type="button" disabled={busy} onClick={() => kind.deny(host)}>
            {t(`${kind.keys}.deny`)}
          </button>
        </div>
      </div>
    </WindowNotice>
  );
}

export default function SpreadsheetWebImageHostConsent() {
  const pictureHosts = useSyncExternalStore(
    subscribeSpreadsheetWebImages,
    spreadsheetWebImageHostQuestions,
    () => NO_QUESTIONS,
  );
  const dataHosts = useSyncExternalStore(
    subscribeSpreadsheetExternalData,
    spreadsheetWebServiceHostQuestions,
    () => NO_QUESTIONS,
  );
  if (pictureHosts[0])
    return (
      <HostQuestion
        key={`p:${pictureHosts[0]}`}
        host={pictureHosts[0]}
        kind={PICTURES}
      />
    );
  if (dataHosts[0])
    return (
      <HostQuestion key={`d:${dataHosts[0]}`} host={dataHosts[0]} kind={DATA} />
    );
  return null;
}
