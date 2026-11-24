"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  ChevronDown,
  ChevronUp,
  LocateFixed,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  officeDialogClassName,
  officeDialogParts,
  useOfficeDialogChrome,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

import {
  collectDocumentGoToTargets,
  DOCUMENT_GO_TO_KINDS,
  goToDocumentTarget,
  type DocumentGoToKind,
  type DocumentGoToTarget,
} from "./native-document/documentGoTo";

interface DocumentGoToProps {
  editor: Editor;
  onClose: () => void;
  initialKind?: DocumentGoToKind;
  restrictToKind?: DocumentGoToKind;
  dialogLabel?: string;
  actionLabel?: string;
  testId?: string;
}

function firstAvailableKind(
  targets: ReadonlyArray<DocumentGoToTarget>,
): DocumentGoToKind {
  return (
    DOCUMENT_GO_TO_KINDS.find((kind) =>
      targets.some((target) => target.kind === kind),
    ) ?? "page"
  );
}

export default function DocumentGoTo({
  editor,
  onClose,
  initialKind = "page",
  restrictToKind,
  dialogLabel,
  actionLabel,
  testId = "document-go-to",
}: DocumentGoToProps) {
  const t = useTranslations("console-notebooks");
  const chromeTone = useOfficeDialogChrome();
  const [documentVersion, setDocumentVersion] = useState(0);
  const [kind, setKind] = useState<DocumentGoToKind>(
    restrictToKind ?? initialKind,
  );
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    const refresh = () => setDocumentVersion((value) => value + 1);
    const runtime = editor as unknown as {
      off?: (event: string, callback: () => void) => unknown;
      on?: (event: string, callback: () => void) => unknown;
    };
    runtime.on?.("update", refresh);
    return () => {
      runtime.off?.("update", refresh);
    };
  }, [editor]);

  const targetSnapshot = useMemo(() => {
    void documentVersion;
    const doc = editor.state.doc;
    return { doc, targets: collectDocumentGoToTargets(doc) };
  }, [documentVersion, editor]);
  const targets = targetSnapshot.targets;

  const effectiveKind = restrictToKind
    ? restrictToKind
    : targets.some((target) => target.kind === kind)
      ? kind
      : firstAvailableKind(targets);
  const visibleKinds: readonly DocumentGoToKind[] = restrictToKind
    ? [restrictToKind]
    : DOCUMENT_GO_TO_KINDS;

  const kindTargets = useMemo(
    () => targets.filter((target) => target.kind === effectiveKind),
    [effectiveKind, targets],
  );
  const selectedTarget =
    kindTargets.find((target) => target.id === targetId) ?? kindTargets[0];
  const selectedIndex = selectedTarget
    ? kindTargets.findIndex((target) => target.id === selectedTarget.id)
    : -1;

  const navigate = useCallback(
    (target: DocumentGoToTarget | undefined) => {
      if (!target) return false;
      return goToDocumentTarget(editor, target, targetSnapshot.doc);
    },
    [editor, targetSnapshot.doc],
  );

  const move = useCallback(
    (direction: 1 | -1) => {
      if (!kindTargets.length) return;
      const current = selectedIndex < 0 ? 0 : selectedIndex;
      const next =
        (current + direction + kindTargets.length) % kindTargets.length;
      const target = kindTargets[next];
      if (!navigate(target)) return;
      setTargetId(target.id);
    },
    [kindTargets, navigate, selectedIndex],
  );

  const kindLabel = useCallback(
    (value: DocumentGoToKind) =>
      value === "equation" ? t("toolbar.equation") : t(`goTo.kind.${value}`),
    [t],
  );
  const targetLabel = useCallback(
    (target: DocumentGoToTarget) => {
      const suffix = target.label ? ` — ${target.label}` : "";
      return `${kindLabel(target.kind)} ${target.ordinal}${suffix}`;
    },
    [kindLabel],
  );

  return (
    <div
      className={
        chromeTone
          ? `note-editor-find-replace ${officeDialogClassName({ tone: chromeTone })}`
          : "note-editor-find-replace"
      }
      role="dialog"
      aria-label={dialogLabel ?? t("toolbar.goTo")}
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <LocateFixed size={15} aria-hidden="true" />
      <select
        className="note-editor-find-replace__input"
        aria-label={t("goTo.kindLabel")}
        data-testid="document-go-to-kind"
        value={effectiveKind}
        disabled={Boolean(restrictToKind)}
        onChange={(event) => {
          const next = event.target.value as DocumentGoToKind;
          setKind(next);
          setTargetId(targets.find((target) => target.kind === next)?.id ?? "");
        }}
      >
        {visibleKinds.map((value) => {
          const count = targets.filter(
            (target) => target.kind === value,
          ).length;
          return (
            <option key={value} value={value} disabled={count === 0}>
              {kindLabel(value)} ({count})
            </option>
          );
        })}
      </select>
      <select
        className="note-editor-find-replace__input"
        aria-label={t("goTo.targetLabel")}
        data-testid="document-go-to-target"
        value={selectedTarget?.id ?? ""}
        disabled={!selectedTarget}
        onChange={(event) => setTargetId(event.target.value)}
        autoFocus
      >
        {kindTargets.length ? (
          kindTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {targetLabel(target)}
            </option>
          ))
        ) : (
          <option value="">{t("goTo.empty")}</option>
        )}
      </select>
      <span
        className="note-editor-find-replace__count"
        data-testid="document-go-to-count"
        aria-live="polite"
      >
        {selectedIndex >= 0 ? selectedIndex + 1 : 0}/{kindTargets.length}
      </span>
      <button
        type="button"
        className="note-editor-find-replace__button"
        aria-label={t("findReplace.previous")}
        title={t("findReplace.previous")}
        data-testid="document-go-to-previous"
        disabled={!selectedTarget}
        onClick={() => move(-1)}
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        className="note-editor-find-replace__button"
        aria-label={t("findReplace.next")}
        title={t("findReplace.next")}
        data-testid="document-go-to-next"
        disabled={!selectedTarget}
        onClick={() => move(1)}
      >
        <ChevronDown size={16} />
      </button>
      <button
        type="button"
        className="note-editor-find-replace__action"
        data-testid="document-go-to-apply"
        disabled={!selectedTarget}
        onClick={() => navigate(selectedTarget)}
      >
        <LocateFixed size={15} />
        <span>{actionLabel ?? t("goTo.go")}</span>
      </button>
      <button
        type="button"
        className={
          chromeTone
            ? `note-editor-find-replace__button ${officeDialogParts.close}`
            : "note-editor-find-replace__button"
        }
        aria-label={t("findReplace.close")}
        title={t("findReplace.close")}
        data-testid="document-go-to-close"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}
