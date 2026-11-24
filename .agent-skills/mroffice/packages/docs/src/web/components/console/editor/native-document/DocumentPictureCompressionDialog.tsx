"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import {
  DOCUMENT_PICTURE_COMPRESSION_PRESETS,
  type DocumentPictureCompressionPresetId,
} from "@mrnote/core/web/components/console/editor/native-document/documentPictureCompression.ts";

export type DocumentPictureCompressionSubmitResult =
  | "compressed"
  | "unchanged"
  | "rejected";

export interface DocumentPictureCompressionDialogProps {
  readonly open: boolean;
  readonly canEdit: boolean;
  readonly locale: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (
    presetId: DocumentPictureCompressionPresetId,
    signal: AbortSignal,
  ) => Promise<DocumentPictureCompressionSubmitResult>;
  readonly onClose: () => void;
}

// Print, Web and E-mail: where the compressed picture is headed.
const PICTURE_COMPRESSION_ICON = {
  print: "file.print",
  web: "web.globe",
  email: "mail.envelope",
} as const;

export function DocumentPictureCompressionDialog({
  open,
  canEdit,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentPictureCompressionDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => ({
      title: t("toolbar.pictureCompressionDialog.title"),
      description: t("toolbar.pictureCompressionDialog.description"),
      selectedOnly: t("toolbar.pictureCompressionDialog.selectedOnly"),
      deleteCrop: t("toolbar.pictureCompressionDialog.deleteCrop"),
      deleteCropUnavailable: t(
        "toolbar.pictureCompressionDialog.deleteCropUnavailable",
      ),
      resolution: t("toolbar.pictureCompressionDialog.resolution"),
      print: t("toolbar.pictureCompressionDialog.print"),
      web: t("toolbar.pictureCompressionDialog.web"),
      email: t("toolbar.pictureCompressionDialog.email"),
      apply: t("toolbar.pictureCompressionDialog.apply"),
      cancel: t("toolbar.pictureCompressionDialog.cancel"),
      unchanged: t("toolbar.pictureCompressionDialog.unchanged"),
      rejected: t("toolbar.pictureCompressionDialog.rejected"),
    }),
    [t],
  );
  const [presetId, setPresetId] =
    useState<DocumentPictureCompressionPresetId>("web");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const activeSubmitRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setPresetId("web");
    setBusy(false);
    setError(null);
  }, [open]);

  useLayoutEffect(() => {
    if (open && canEdit) return;
    const active = activeSubmitRef.current;
    activeSubmitRef.current = null;
    active?.abort();
    setBusy(false);
    if (active && open) setError(copy.rejected);
  }, [canEdit, copy.rejected, open]);

  useEffect(
    () => () => {
      activeSubmitRef.current?.abort();
      activeSubmitRef.current = null;
    },
    [],
  );

  const submit = async () => {
    if (busy || !canEdit) return;
    const controller = new AbortController();
    activeSubmitRef.current?.abort();
    activeSubmitRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(presetId, controller.signal);
      if (controller.signal.aborted || activeSubmitRef.current !== controller) {
        return;
      }
      if (result === "compressed") {
        activeSubmitRef.current = null;
        onClose();
        return;
      }
      setError(result === "unchanged" ? copy.unchanged : copy.rejected);
    } catch {
      if (
        !controller.signal.aborted &&
        activeSubmitRef.current === controller
      ) {
        setError(copy.rejected);
      }
    } finally {
      if (activeSubmitRef.current === controller) {
        activeSubmitRef.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.apply}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit || busy}
      busy={busy}
      busyActionLabel={t("toolbar.pictureCompressionDialog.compressing")}
      onDefaultAction={() => void submit()}
      onCancel={() => {
        activeSubmitRef.current?.abort();
        activeSubmitRef.current = null;
        setBusy(false);
        onClose();
      }}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-picture-compression"
    >
      <label className={parts.check}>
        <input type="checkbox" checked readOnly disabled />
        <span>{copy.selectedOnly}</span>
      </label>
      <label
        className={parts.check}
        title={copy.deleteCropUnavailable}
      >
        <input type="checkbox" checked={false} readOnly disabled />
        <span>{copy.deleteCrop}</span>
      </label>
      <p className={parts.hint}>
        {copy.deleteCropUnavailable}
      </p>
      <fieldset className={parts.group} disabled={!canEdit || busy}>
        <legend className={parts.sectionTitle}>
          {copy.resolution}
        </legend>
        {DOCUMENT_PICTURE_COMPRESSION_PRESETS.map((item) => (
          <label
            key={item.id}
            className={`${parts.choice} flex items-center gap-2`}
          >
            <input
              ref={item.id === "web" ? initialFocusRef : undefined}
              type="radio"
              name="document-picture-compression-resolution"
              value={item.id}
              checked={presetId === item.id}
              data-testid={`document-picture-compression-preset-${item.id}`}
              onChange={() => setPresetId(item.id)}
            />
            <DocumentDialogIcon icon={PICTURE_COMPRESSION_ICON[item.id]} />
            <span>{copy[item.id]}</span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className={parts.error}>
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
