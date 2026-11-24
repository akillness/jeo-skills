/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  PdfSourceRiskProfile,
  PdfSourceRiskSnapshot,
} from "../../../../../lib/pdf/save-policy";
import type { PdfRibbonTranslator } from "../pdfRibbonTranslator";

export function samePdfSourceRiskSnapshot(
  left: PdfSourceRiskSnapshot | null,
  right: PdfSourceRiskSnapshot | null,
): boolean {
  return Boolean(
    left &&
    right &&
    left.identity.dataItemId === right.identity.dataItemId &&
    left.identity.byteGenerationKey === right.identity.byteGenerationKey &&
    left.identity.sha256 === right.identity.sha256 &&
    left.identity.documentRevision === right.identity.documentRevision &&
    left.profileDigest === right.profileDigest,
  );
}

export type PdfNativeSourceRiskReadOnlySubject =
  | "link"
  | "text"
  | "image"
  | "vector"
  | "form"
  | "page"
  | "decoration"
  | "undo"
  | "redo";

/** The subject a refused write command is named by (its policy action). */
export function pdfSourceRiskSubjectForAction(action: string): PdfNativeSourceRiskReadOnlySubject {
  if (action === "pdf.edit.undo") return "undo";
  if (action === "pdf.edit.redo") return "redo";
  if (action.startsWith("pdf.decoration.")) return "decoration";
  if (action.startsWith("pdf.page.") && action !== "pdf.page.background.commit") return "page";
  if (action.startsWith("pdf.link.")) return "link";
  if (action.startsWith("pdf.form.")) return "form";
  if (action.startsWith("pdf.image.") || action === "pdf.content.append-image.commit") return "image";
  if (action.startsWith("pdf.vector.") || action === "pdf.content.append-path.commit") return "vector";
  return "text";
}

export function pdfNativeSourceRiskReadOnlyReason(input: {
  readonly profile: PdfSourceRiskProfile | null;
  readonly t: PdfRibbonTranslator;
  readonly subject: PdfNativeSourceRiskReadOnlySubject;
}): string | undefined {
  if (!input.profile) return undefined;
  const riskLabels = [
    ["encryption", "pdf.pageWindow.riskEncryption"],
    ["certificateSignatures", "pdf.pageWindow.riskCertificateSignatures"],
    ["xfa", "pdf.pageWindow.riskXfa"],
    ["optionalContent", "pdf.pageWindow.riskOptionalContent"],
    ["attachments", "pdf.pageWindow.riskAttachments"],
    ["taggedStructure", "pdf.pageWindow.riskTaggedStructure"],
    ["pdfaClaim", "pdf.pageWindow.riskPdfaClaim"],
    ["inspectionFailure", "pdf.pageWindow.riskInspectionFailure"],
  ] as const;
  const present = riskLabels.filter(([key]) => input.profile?.[key] !== "none");
  // Native text, image and vector writes leave package siblings (tags, layers,
  // attachments) and an approval signature byte for byte, so only the risks
  // that keep them read-only are named: a tagged PDF/A file read 「包含标签结构、
  // PDF/A 声明」, as if its tags were the reason too. Only encryption and a
  
  // pdfNativeListTextRiskProfileIsSafe).
  const profile = input.profile;
  // Links are judged as the native writers are (PDF_ANNOTATION_WRITER_ACTIONS).
  // Page-tree and decoration writers too (PDF_PAGE_REVISION_ACTIONS).
  const native = input.subject === "text" || input.subject === "image" || input.subject === "vector" ||
    input.subject === "link" || input.subject === "page" || input.subject === "decoration";
  // Form authoring is judged by its own rule (PDF_FORM_AUTHORING_ACTIONS):
  // encryption, a signature, or an XFA form drawn from its template keep the
  // fields read-only; tags, layers, attachments, a PDF/A claim or a static
  // XFA form do not (a tagged IRS form read 「包含标签结构」 as the reason).
  const form = input.subject === "form";
  const blocking = native
    ? present.filter(([key]) =>
      key === "encryption" ||
      (key === "certificateSignatures" && profile.certifiedSignatures !== "none"))
    : form
      ? present.filter(([key]) =>
        key === "encryption" ||
        key === "certificateSignatures" ||
        (key === "xfa" && !(profile.xfa === "present" && profile.xfaDynamic === "none")))
      : present;
  // A native writer none of the present risks keeps read-only is not
  // read-only for them: naming them as the reason told the reader of a
  // tagged PDF that its tags kept text read-only, whatever had held the
  
  if ((native || form) && blocking.length === 0) return undefined;
  const risks = (blocking.length > 0 ? blocking : present).map(([, labelKey]) => input.t(labelKey));
  if (risks.length === 0) return undefined;
  const detail = risks.join(input.t("pdf.pageWindow.listSeparator"));
  if (input.subject === "link") {
    return input.t("pdf.pageWindow.sourceRiskLinks", { detail });
  }
  if (input.subject === "image") {
    return input.t("pdf.pageWindow.sourceRiskImages", { detail });
  }
  if (input.subject === "vector") {
    return input.t("pdf.pageWindow.sourceRiskVectors", { detail });
  }
  if (input.subject === "form") {
    return input.t("pdf.pageWindow.sourceRiskForms", { detail });
  }
  if (input.subject === "page") {
    return input.t("pdf.pageWindow.sourceRiskPages", { detail });
  }
  if (input.subject === "decoration") {
    return input.t("pdf.pageWindow.sourceRiskDecorations", { detail });
  }
  if (input.subject === "undo") {
    return input.t("pdf.pageWindow.sourceRiskUndo", { detail });
  }
  if (input.subject === "redo") {
    return input.t("pdf.pageWindow.sourceRiskRedo", { detail });
  }
  return input.t("pdf.pageWindow.sourceRiskText", { detail });
}

/**
 * What an Undo or Redo the save policy refused says, in place of doing
 * nothing: the refusal's own label, else the source risks that keep the
 * step's kind of write read-only on this PDF, else that the write policy
 * does not allow the step.
 */
export function pdfNativeHistoryRefusalReason(input: {
  readonly decision: Readonly<{
    enabled: boolean;
    reasonKey?: string | null;
    reasonLabel?: string | null;
  }>;
  readonly direction: "undo" | "redo";
  readonly profile: PdfSourceRiskProfile | null;
  readonly t: PdfRibbonTranslator;
}): string | undefined {
  if (input.decision.enabled) return undefined;
  if (input.decision.reasonLabel) return input.decision.reasonLabel;
  if (input.decision.reasonKey === "pdf.savePolicy.riskySourceReadOnly") {
    const reason = pdfNativeSourceRiskReadOnlyReason({
      profile: input.profile,
      t: input.t,
      subject: input.direction,
    });
    if (reason) return reason;
  }
  if (
    input.decision.reasonKey === "pdf.capability.registryStale" ||
    input.decision.reasonKey === "pdf.capability.mutationInFlight" ||
    input.decision.reasonKey === "pdf.capability.documentLoading" ||
    input.decision.reasonKey === "pdf.savePolicy.documentLoading" ||
    input.decision.reasonKey === "pdf.savePolicy.sourceIdentityRequired"
  ) {
    // The window waited for these and they did not clear.
    return input.t("pdf.pageWindow.historyWriteStillFinishing");
  }
  return input.t(
    input.direction === "undo"
      ? "pdf.pageWindow.historyUndoPolicyRefused"
      : "pdf.pageWindow.historyRedoPolicyRefused",
  );
}

export function pdfNativeSourceLinkWriteDisabledReason(input: {
  readonly decision: Readonly<{
    enabled: boolean;
    reasonKey?: string | null;
    reasonLabel?: string | null;
  }>;
  readonly profile: PdfSourceRiskProfile | null;
  readonly t: PdfRibbonTranslator;
}): string | undefined {
  if (input.decision.enabled) return undefined;
  if (input.decision.reasonLabel) return input.decision.reasonLabel;
  if (input.decision.reasonKey === "pdf.savePolicy.riskySourceReadOnly") {
    return (
      pdfNativeSourceRiskReadOnlyReason({
        profile: input.profile,
        t: input.t,
        subject: "link",
      }) ??
      input.t("pdf.pageWindow.sourceRiskUnverifiedLinks")
    );
  }
  return input.t("pdf.pageWindow.linkWriteNoAuthority");
}

export function pdfNativeListTextRiskProfileIsSafe(
  profile: PdfSourceRiskSnapshot["profile"],
): boolean {
  // Native text writes replace one proven content-stream run and then reopen
  // the exact receipt-bound PDF. Attachments, OCG catalogs, and Tagged-PDF
  // structure are package siblings that the transaction preserves byte-for-
  // byte; their mere presence must not block every otherwise eligible run.
  // An approval signature is another: it signs the revision it was made over,
  // and the write only appends a new one. A certification signature carries
  // the author's own rule against the edit, and still blocks it. Nothing else
  
  // page content is written as any page's, a PDF/A claim is dropped by the
  // write in the same revision, and an inspection that could not read some
  // other part of the catalog is background, not a refusal. Encryption or a
  // signature the inspection could not settle ("unknown") still blocks.
  return (
    profile.encryption === "none" &&
    profile.certifiedSignatures === "none"
  );
}

export function pdfNativeStrictPackageWriterRiskProfileIsSafe(
  profile: PdfSourceRiskSnapshot["profile"],
): boolean {
  // Image and other package-wide writers have broader resource/catalog reach.
  // Keep their historical all-risks-none boundary separate from text.
  return (
    pdfNativeListTextRiskProfileIsSafe(profile) &&
    profile.attachments === "none" &&
    profile.optionalContent === "none" &&
    profile.taggedStructure === "none"
  );
}

export function pdfNativeEmbeddedImageRiskProfileIsSafe(
  profile: PdfSourceRiskSnapshot["profile"],
): boolean {
  // The native image engine owns one proven content-stream Do invocation and,
  // for replacement, one direct page XObject mapping plus a newly allocated
  // image object. Both paths append an exact-source revision and reopen every
  // revised object; catalog siblings such as attachments, OCG configuration,
  // and Tagged-PDF structure remain byte-preserved. Keep terminal document
  // risks blocked, but do not turn unrelated package siblings into a blanket
  // image-edit ban.
  return pdfNativeListTextRiskProfileIsSafe(profile);
}

const pdfaClaimEditNoticesShown = new Set<string>();








export function takePdfaClaimEditNotice(snapshot: PdfSourceRiskSnapshot | null): boolean {
  if (snapshot?.profile.pdfaClaim !== "present") return false;
  const key = `${snapshot.identity.dataItemId}:${snapshot.identity.sha256}`;
  if (pdfaClaimEditNoticesShown.has(key)) return false;
  pdfaClaimEditNoticesShown.add(key);
  return true;
}

const xfaFormAuthoringNoticesShown = new Set<string>();

/**
 * Whether a field authored now says, once per file this session, that the
 * file's static XFA form was left out and the file is now the AcroForm form
 * every reader shows (the server's _native_form_release_source_grants). The
 * XFA packets carry the form's own scripts and calculations, which Acrobat
 * ran and which do not come back.
 */
export function takeXfaFormAuthoringNotice(snapshot: PdfSourceRiskSnapshot | null): boolean {
  if (snapshot?.profile.xfa !== "present") return false;
  const key = snapshot.identity.dataItemId;
  if (xfaFormAuthoringNoticesShown.has(key)) return false;
  xfaFormAuthoringNoticesShown.add(key);
  return true;
}
