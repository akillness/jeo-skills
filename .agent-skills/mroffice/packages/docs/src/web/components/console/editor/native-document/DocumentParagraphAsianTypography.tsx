"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeTextAlignmentField } from "@mrnote/core/web/components/office-ribbon/OfficeTextAlignmentField.tsx";

import type { ParagraphTextAlignment } from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";

/**
 * Word's Paragraph > Asian Typography tab (Microsoft Support, "Asian
 * Typography options"; ECMA-376 17.3.1 paragraph properties), in Word's
 * three groups and order:
 *
 *   Line break
 *     [x] Use Asian rules to control first and last characters  w:kinsoku
 *     [ ] Allow Latin text to wrap in the middle of a word        w:wordWrap="0"
 *     [x] Allow hanging punctuation                               w:overflowPunct
 *   Character spacing
 *     [ ] Allow punctuation at the start of a line to compress    w:topLinePunct
 *     [x] Automatically adjust space between Asian and Latin text w:autoSpaceDE
 *     [x] Automatically adjust space between Asian text and numbers w:autoSpaceDN
 *   Text alignment: Auto / Top / Centered / Baseline / Bottom   w:textAlignment
 *
 * Checked defaults are Word's. The dialog's draft state and the OK write stay
 * in the toolbar; this is the tab's controls only. Word's "Options..." button
 * opens the application-wide Typography options (kinsoku character sets),
 * which MRAI does not have.
 */
export interface DocumentParagraphAsianTypographyValues {
  readonly kinsoku: boolean;
  readonly allowLatinWordBreak: boolean;
  readonly hangingPunctuation: boolean;
  readonly compressPunctuation: boolean;
  readonly autoSpaceDE: boolean;
  readonly autoSpaceDN: boolean;
  readonly textAlignment: ParagraphTextAlignment | "inherit";
}

interface Props {
  readonly values: DocumentParagraphAsianTypographyValues;
  readonly onKinsoku: (checked: boolean) => void;
  readonly onAllowLatinWordBreak: (checked: boolean) => void;
  readonly onHangingPunctuation: (checked: boolean) => void;
  readonly onCompressPunctuation: (checked: boolean) => void;
  readonly onAutoSpaceDE: (checked: boolean) => void;
  readonly onAutoSpaceDN: (checked: boolean) => void;
  readonly onTextAlignment: (value: ParagraphTextAlignment | "inherit") => void;
}

const TEXT_ALIGNMENT_OPTIONS = [
  "inherit",
  "auto",
  "top",
  "center",
  "baseline",
  "bottom",
] as const;

export default function DocumentParagraphAsianTypography({
  values,
  ...handlers
}: Props) {
  const t = useTranslations("console-notebooks");
  const check = (
    testId: string,
    labelKey: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ) => (
    <label className="office-dialog__check" key={testId}>
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{t(labelKey)}</span>
    </label>
  );
  return (
    <>
      <section
        className="office-dialog__group"
        data-testid="document-paragraph-asian-line-break"
      >
        <h3>{t("toolbar.paragraphAsianLineBreak")}</h3>
        <div className="note-editor-paragraph-checks">
          {check(
            "document-paragraph-kinsoku",
            "toolbar.paragraphAsianKinsoku",
            values.kinsoku,
            handlers.onKinsoku,
          )}
          {check(
            "document-paragraph-allow-latin-word-break",
            "toolbar.paragraphAsianLatinWordBreak",
            values.allowLatinWordBreak,
            handlers.onAllowLatinWordBreak,
          )}
          {check(
            "document-paragraph-overflow-punctuation",
            "toolbar.paragraphAsianHangingPunctuation",
            values.hangingPunctuation,
            handlers.onHangingPunctuation,
          )}
        </div>
      </section>
      <section
        className="office-dialog__group"
        data-testid="document-paragraph-asian-character-spacing"
      >
        <h3>{t("toolbar.paragraphAsianCharacterSpacing")}</h3>
        <div className="note-editor-paragraph-checks">
          {check(
            "document-paragraph-top-line-punctuation",
            "toolbar.paragraphAsianCompressPunctuation",
            values.compressPunctuation,
            handlers.onCompressPunctuation,
          )}
          {check(
            "document-paragraph-auto-space-de",
            "toolbar.paragraphAsianLatinSpacing",
            values.autoSpaceDE,
            handlers.onAutoSpaceDE,
          )}
          {check(
            "document-paragraph-auto-space-dn",
            "toolbar.paragraphAsianNumberSpacing",
            values.autoSpaceDN,
            handlers.onAutoSpaceDN,
          )}
        </div>
      </section>
      <section className="office-dialog__group">
        <OfficeTextAlignmentField
          testId="document-paragraph-text-alignment"
          value={values.textAlignment}
          choices={TEXT_ALIGNMENT_OPTIONS}
          onChange={handlers.onTextAlignment}
        />
      </section>
    </>
  );
}
