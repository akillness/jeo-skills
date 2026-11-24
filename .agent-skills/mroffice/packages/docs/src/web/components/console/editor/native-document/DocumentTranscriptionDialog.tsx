"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import {
  useCallback,
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
import { isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import {
  insertDocumentTranscriptionSegments,
  loadDocumentTranscription,
  refreshDocumentTranscription,
  startDocumentTranscription,
  uploadDocumentTranscriptionAudio,
  type DocumentTranscriptionInsertionTarget,
  type DocumentTranscriptionPayload,
  type DocumentTranscriptionSegment,
} from "./documentTranscription";

export interface DocumentTranscriptionDialogProps {
  readonly open: boolean;
  readonly locale: string;
  readonly pageId: string;
  readonly canEdit: boolean;
  readonly insertionTarget: DocumentTranscriptionInsertionTarget | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onPayloadChange?: (payload: DocumentTranscriptionPayload) => void;
}

interface ActiveTranscriptionSubmission {
  readonly generation: number;
  readonly pageId: string;
  readonly controller: AbortController;
}

interface ActiveTranscriptionRecording {
  readonly generation: number;
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly chunks: Blob[];
  submitOnStop: boolean;
}

function timestamp(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function transcriptionErrorCodeMessage(
  code: string | undefined | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (code === "transcription_provider_unavailable") {
    return t("toolbar.transcriptionDialog.errorProviderUnavailable");
  }
  if (
    code === "workspace_ai_egress_policy_unconfigured" ||
    code === "workspace_ai_egress_policy_denied"
  ) {
    return t("toolbar.transcriptionDialog.errorEgressDenied");
  }
  if (code === "transcription_audio_stale") {
    return t("toolbar.transcriptionDialog.errorAudioStale");
  }
  if (code === "invalid_audio_attachment") {
    return t("toolbar.transcriptionDialog.errorInvalidAudio");
  }
  return t("toolbar.transcriptionDialog.errorGeneric");
}

function errorMessage(
  error: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  return transcriptionErrorCodeMessage(
    isApiRequestError(error) ? error.code : undefined,
    t,
  );
}

export function DocumentTranscriptionDialog({
  open,
  pageId,
  canEdit,
  insertionTarget,
  returnFocusRef,
  onClose,
  onPayloadChange,
}: DocumentTranscriptionDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  // Loads and uploads read the translator through a ref, so a new translator
  // identity never restarts a transcript load or an upload.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const copy = useMemo(
    () => ({
      title: t("toolbar.transcriptionDialog.title"),
      description: t("toolbar.transcriptionDialog.description"),
      upload: t("toolbar.transcriptionDialog.upload"),
      record: t("toolbar.transcriptionDialog.record"),
      stop: t("toolbar.transcriptionDialog.stop"),
      privacy: t("toolbar.transcriptionDialog.privacy"),
      privacyRequired: t("toolbar.transcriptionDialog.privacyRequired"),
      providerUnavailable: t("toolbar.transcriptionDialog.providerUnavailable"),
      egressPolicyUnavailable: t(
        "toolbar.transcriptionDialog.egressPolicyUnavailable",
      ),
      loading: t("toolbar.transcriptionDialog.loading"),
      processing: t("toolbar.transcriptionDialog.processing"),
      empty: t("toolbar.transcriptionDialog.empty"),
      speaker: t("toolbar.transcriptionDialog.speaker"),
      insert: t("toolbar.transcriptionDialog.insert"),
      insertAll: t("toolbar.transcriptionDialog.insertAll"),
      cancel: t("toolbar.transcriptionDialog.cancel"),
      stale: t("toolbar.transcriptionDialog.stale"),
      microphoneUnavailable: t(
        "toolbar.transcriptionDialog.microphoneUnavailable",
      ),
    }),
    [t],
  );
  const [payload, setPayload] = useState<DocumentTranscriptionPayload | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const privacyInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const activeSubmissionRef = useRef<ActiveTranscriptionSubmission | null>(
    null,
  );
  const pendingMicrophoneGenerationRef = useRef<number | null>(null);
  const activeRecordingRef = useRef<ActiveTranscriptionRecording | null>(null);
  const authorityPageIdRef = useRef(pageId);
  const providerAvailable = payload?.capability.providerAvailable ?? false;
  const providerCapabilityResolved = payload !== null;

  const retireActiveWriteWork = useCallback((updateUi = true) => {
    operationGenerationRef.current += 1;
    activeSubmissionRef.current?.controller.abort();
    activeSubmissionRef.current = null;
    pendingMicrophoneGenerationRef.current = null;
    const activeRecording = activeRecordingRef.current;
    activeRecordingRef.current = null;
    if (activeRecording) {
      activeRecording.submitOnStop = false;
      if (activeRecording.recorder.state !== "inactive") {
        try {
          activeRecording.recorder.stop();
        } catch {
          // The browser may race an already-completing recorder. Its stream is
          // still retired below and the generation can no longer upload.
        }
      }
      for (const track of activeRecording.stream.getTracks()) track.stop();
    }
    if (updateUi) {
      setBusy(false);
      setRecording(false);
      setRequestingMicrophone(false);
    }
  }, []);

  useLayoutEffect(() => {
    const pageChanged = authorityPageIdRef.current !== pageId;
    authorityPageIdRef.current = pageId;
    if (pageChanged || !open) {
      readGenerationRef.current += 1;
      setPayload(null);
    }
    if (
      pageChanged ||
      !open ||
      !canEdit ||
      (providerCapabilityResolved && !providerAvailable)
    ) {
      retireActiveWriteWork();
    }
  }, [
    canEdit,
    open,
    pageId,
    providerAvailable,
    providerCapabilityResolved,
    retireActiveWriteWork,
  ]);

  const publishPayload = useCallback(
    (next: DocumentTranscriptionPayload) => {
      setPayload(next);
      onPayloadChange?.(next);
    },
    [onPayloadChange],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    setPayload(null);
    setBusy(true);
    setError(null);
    void loadDocumentTranscription(pageId, controller.signal)
      .then((next) => {
        if (
          controller.signal.aborted ||
          readGenerationRef.current !== generation ||
          authorityPageIdRef.current !== pageId
        ) {
          return;
        }
        publishPayload(next);
      })
      .catch((nextError: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(nextError, tRef.current));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      if (readGenerationRef.current === generation) {
        readGenerationRef.current += 1;
      }
    };
  }, [open, pageId, publishPayload]);

  useEffect(() => {
    if (
      !open ||
      !canEdit ||
      busy ||
      recording ||
      requestingMicrophone ||
      !payload?.transcription ||
      !["pending", "processing"].includes(payload.transcription.status)
    ) {
      return;
    }
    const controller = new AbortController();
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    const timeout = window.setTimeout(() => {
      void refreshDocumentTranscription(
        pageId,
        payload.transcription!.attachmentId,
        controller.signal,
      )
        .then((next) => {
          if (
            controller.signal.aborted ||
            readGenerationRef.current !== generation ||
            authorityPageIdRef.current !== pageId
          ) {
            return;
          }
          publishPayload(next);
        })
        .catch((nextError: unknown) => {
          if (!controller.signal.aborted)
            setError(errorMessage(nextError, tRef.current));
        });
    }, 1600);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      if (readGenerationRef.current === generation) {
        readGenerationRef.current += 1;
      }
    };
  }, [
    busy,
    canEdit,
    open,
    pageId,
    payload,
    publishPayload,
    recording,
    requestingMicrophone,
  ]);

  useEffect(
    () => () => {
      retireActiveWriteWork(false);
    },
    [retireActiveWriteWork],
  );

  const submitAudio = useCallback(
    async (file: File) => {
      if (
        !open ||
        !canEdit ||
        busy ||
        !providerAvailable ||
        activeSubmissionRef.current !== null ||
        pendingMicrophoneGenerationRef.current !== null ||
        activeRecordingRef.current !== null
      ) {
        return;
      }
      if (!privacyAcknowledged) {
        setError(copy.privacyRequired);
        return;
      }
      const operation: ActiveTranscriptionSubmission = {
        generation: operationGenerationRef.current + 1,
        pageId,
        controller: new AbortController(),
      };
      operationGenerationRef.current = operation.generation;
      activeSubmissionRef.current = operation;
      setBusy(true);
      setError(null);
      try {
        const attachment = await uploadDocumentTranscriptionAudio(
          operation.pageId,
          file,
          operation.controller.signal,
        );
        if (
          activeSubmissionRef.current !== operation ||
          operation.controller.signal.aborted ||
          operationGenerationRef.current !== operation.generation
        ) {
          return;
        }
        const nextPayload = await startDocumentTranscription(
          operation.pageId,
          attachment.attachment_id,
          operation.controller.signal,
        );
        if (
          activeSubmissionRef.current !== operation ||
          operation.controller.signal.aborted ||
          operationGenerationRef.current !== operation.generation
        ) {
          return;
        }
        publishPayload(nextPayload);
      } catch (nextError) {
        if (
          activeSubmissionRef.current === operation &&
          !operation.controller.signal.aborted
        ) {
          setError(errorMessage(nextError, tRef.current));
        }
      } finally {
        if (activeSubmissionRef.current === operation) {
          activeSubmissionRef.current = null;
          setBusy(false);
        }
      }
    },
    [
      busy,
      canEdit,
      copy.privacyRequired,
      open,
      pageId,
      privacyAcknowledged,
      providerAvailable,
      publishPayload,
    ],
  );

  const startRecording = useCallback(async () => {
    if (
      !open ||
      !canEdit ||
      busy ||
      requestingMicrophone ||
      !providerAvailable ||
      activeSubmissionRef.current !== null ||
      pendingMicrophoneGenerationRef.current !== null ||
      activeRecordingRef.current !== null
    ) {
      return;
    }
    if (!privacyAcknowledged) {
      setError(copy.privacyRequired);
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(copy.microphoneUnavailable);
      return;
    }
    const generation = operationGenerationRef.current + 1;
    operationGenerationRef.current = generation;
    pendingMicrophoneGenerationRef.current = generation;
    setRequestingMicrophone(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        pendingMicrophoneGenerationRef.current !== generation ||
        operationGenerationRef.current !== generation
      ) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const preferredMime = ["audio/webm;codecs=opus", "audio/webm"].find(
        (mime) => MediaRecorder.isTypeSupported(mime),
      );
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      // The stop listener outlives this narrowing of the outer `let`.
      const recordingStream = stream;
      const session: ActiveTranscriptionRecording = {
        generation,
        recorder,
        stream: recordingStream,
        chunks: [],
        submitOnStop: false,
      };
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) session.chunks.push(event.data);
      });
      recorder.addEventListener(
        "stop",
        () => {
          for (const track of recordingStream.getTracks()) track.stop();
          const owned = activeRecordingRef.current === session;
          if (owned) {
            activeRecordingRef.current = null;
            setRecording(false);
          }
          const blob = new Blob(session.chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          session.chunks.length = 0;
          if (
            owned &&
            session.submitOnStop &&
            operationGenerationRef.current === generation &&
            blob.size > 0
          ) {
            void submitAudio(
              new File([blob], `recording-${Date.now()}.webm`, {
                type: blob.type || "audio/webm",
              }),
            );
          }
        },
        { once: true },
      );
      recorder.start(1000);
      activeRecordingRef.current = session;
      pendingMicrophoneGenerationRef.current = null;
      setRequestingMicrophone(false);
      setError(null);
      setRecording(true);
    } catch {
      for (const track of stream?.getTracks() ?? []) track.stop();
      if (
        pendingMicrophoneGenerationRef.current === generation &&
        operationGenerationRef.current === generation
      ) {
        pendingMicrophoneGenerationRef.current = null;
        setRequestingMicrophone(false);
        setError(copy.microphoneUnavailable);
      }
    }
  }, [
    busy,
    canEdit,
    copy.microphoneUnavailable,
    copy.privacyRequired,
    open,
    privacyAcknowledged,
    providerAvailable,
    requestingMicrophone,
    submitAudio,
  ]);

  const stopRecording = useCallback(() => {
    const session = activeRecordingRef.current;
    if (session?.recorder.state === "recording") {
      session.submitOnStop = true;
      session.recorder.stop();
    }
  }, []);

  const closeDialog = useCallback(() => {
    retireActiveWriteWork();
    onClose();
  }, [onClose, retireActiveWriteWork]);

  const insert = useCallback(
    (segments: readonly DocumentTranscriptionSegment[]) => {
      if (
        !canEdit ||
        !insertionTarget ||
        !insertDocumentTranscriptionSegments(insertionTarget, segments)
      ) {
        setError(copy.stale);
        return;
      }
      closeDialog();
    },
    [canEdit, closeDialog, copy.stale, insertionTarget],
  );

  const segments = payload?.transcription?.segments ?? [];
  const succeeded =
    payload?.transcription?.status === "succeeded" && segments.length > 0;
  const visibleError =
    error ??
    (payload?.transcription?.status === "failed"
      ? transcriptionErrorCodeMessage(payload.transcription.errorCode, t)
      : null);
  const controlsDisabled =
    !canEdit || busy || requestingMicrophone || recording || !providerAvailable;

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.insertAll}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit || !succeeded || insertionTarget === null}
      busy={busy}
      busyActionLabel={copy.processing}
      onDefaultAction={() => insert(segments)}
      onCancel={closeDialog}
      initialFocusRef={privacyInputRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-transcription"
      className="sm:max-w-[680px]"
    >
      <label className={parts.check}>
        <input
          ref={privacyInputRef}
          type="checkbox"
          checked={privacyAcknowledged}
          data-testid="document-transcription-privacy"
          onChange={(event) => {
            setPrivacyAcknowledged(event.target.checked);
            setError(null);
          }}
        />
        <span>{copy.privacy}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/mp4,video/webm"
          className="sr-only"
          data-testid="document-transcription-file"
          disabled={controlsDisabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void submitAudio(file);
          }}
        />
        <button
          type="button"
          disabled={controlsDisabled || !privacyAcknowledged}
          className={parts.button}
          data-testid="document-transcription-upload"
          onClick={() => fileInputRef.current?.click()}
        >
          {copy.upload}
        </button>
        <button
          type="button"
          disabled={
            busy ||
            requestingMicrophone ||
            !providerAvailable ||
            (!recording && (!canEdit || !privacyAcknowledged))
          }
          className={parts.button}
          data-testid="document-transcription-record"
          onClick={() => {
            if (recording) stopRecording();
            else void startRecording();
          }}
        >
          {recording ? copy.stop : copy.record}
        </button>
      </div>

      {!providerAvailable && payload ? (
        <p role="status" className={parts.message} data-tone="warning">
          {payload.capability.reasonCode ===
            "workspace_ai_egress_policy_unconfigured" ||
          payload.capability.reasonCode === "workspace_ai_egress_policy_denied"
            ? copy.egressPolicyUnavailable
            : copy.providerUnavailable}
        </p>
      ) : null}
      {visibleError ? (
        <p role="alert" className={parts.error}>
          {visibleError}
        </p>
      ) : null}
      {busy && !payload ? (
        <EditorLoadingState kind="document" compact label={copy.loading} />
      ) : null}
      {payload?.transcription &&
      ["pending", "processing"].includes(payload.transcription.status) ? (
        <p role="status" className={parts.hint}>
          {copy.processing}
        </p>
      ) : null}
      {payload && !payload.transcription ? (
        <p className={parts.hint}>{copy.empty}</p>
      ) : null}

      {succeeded ? (
        <ol
          className={`${parts.list} max-h-72 overflow-y-auto`}
          data-testid="document-transcription-segments"
        >
          {segments.map((segment) => (
            <li
              key={`${segment.index}-${segment.beginMs}`}
              className={`${parts.listItem} grid grid-cols-[auto_1fr_auto] items-start gap-2`}
            >
              <span className={`${parts.hint} whitespace-nowrap`}>
                {timestamp(segment.beginMs)}–{timestamp(segment.endMs)}
              </span>
              <div className="min-w-0">
                <p className={parts.hint}>
                  {copy.speaker} {segment.speakerId ?? "—"}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {segment.text}
                </p>
              </div>
              <button
                type="button"
                disabled={!canEdit}
                className={parts.compactButton}
                data-testid={`document-transcription-insert-${segment.index}`}
                onClick={() => insert([segment])}
              >
                {copy.insert}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </OfficeDialogShell>
  );
}
