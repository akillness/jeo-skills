"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "../../../host/next-intl";

import ConfirmDialog from "./ConfirmDialog";

/**
 * The one informed-consent surface for a server-refused lossy export.
 *
 * Every native editor's export gate speaks the same bounded vocabulary — a
 * list of loss codes plus a total — so the reader-facing half of the decision
 * lives here once: the codes become sentences, the unlisted remainder is still
 * counted out loud, and the confirm button that ships the lossy copy is the
 * same button in every editor. Callers keep only what is theirs: the title,
 * the verb on the confirm button, and what consent then does.
 */

/**
 * One sentence per code the export gates can name. A code missing here still
 * reaches the reader as a sentence through `toolbar.exportLossCodeUnknown`, so
 * a newer server can never make a bare identifier the only thing a consent
 * decision rests on.
 */
const PAGE_EXPORT_LOSS_MESSAGE_KEYS: Readonly<Record<string, string>> =
  Object.freeze({
    document_activex_preserve_only_not_exported:
      "toolbar.exportLossCode.document_activex_preserve_only_not_exported",
    document_embedded_object_preserve_only_not_exported:
      "toolbar.exportLossCode.document_embedded_object_preserve_only_not_exported",
    document_external_linked_image_not_exported:
      "toolbar.exportLossCode.document_external_linked_image_not_exported",
    document_attached_template_not_exported:
      "toolbar.exportLossCode.document_attached_template_not_exported",
    document_comment_media_preserve_only_not_exported:
      "toolbar.exportLossCode.document_comment_media_preserve_only_not_exported",
    document_declined_changes_not_in_file:
      "toolbar.exportLossCode.document_declined_changes_not_in_file",
    xlsx_declined_changes_not_in_file:
      "toolbar.exportLossCode.document_declined_changes_not_in_file",
    document_vml_object_rewritten:
      "toolbar.exportLossCode.document_vml_object_rewritten",
    document_content_control_not_kept:
      "toolbar.exportLossCode.document_content_control_not_kept",
    document_bookmark_not_kept:
      "toolbar.exportLossCode.document_bookmark_not_kept",
    document_drawing_canvas_rewritten:
      "toolbar.exportLossCode.document_drawing_canvas_rewritten",
    document_chart_not_kept_as_chart:
      "toolbar.exportLossCode.document_chart_not_kept_as_chart",
    document_smartart_written_as_shapes:
      "toolbar.exportLossCode.document_smartart_written_as_shapes",
    spreadsheet_smartart_written_as_shapes:
      "toolbar.exportLossCode.spreadsheet_smartart_written_as_shapes",
    document_header_footer_not_kept:
      "toolbar.exportLossCode.document_header_footer_not_kept",
    document_field_not_kept:
      "toolbar.exportLossCode.document_field_not_kept",
    document_table_of_contents_rewritten:
      "toolbar.exportLossCode.document_table_of_contents_rewritten",
    document_tracked_changes_not_kept:
      "toolbar.exportLossCode.document_tracked_changes_not_kept",
    // The file is rebuilt from the page because the original package does
    // not carry the current version (its last save was not written back).
    docx_original_package_not_preserved:
      "toolbar.exportLossCode.docx_original_package_not_preserved",
    pptx_original_package_not_preserved:
      "toolbar.exportLossCode.pptx_original_package_not_preserved",
    xlsx_original_package_not_preserved:
      "toolbar.exportLossCode.xlsx_original_package_not_preserved",
    picture_display_copy_exported:
      "toolbar.exportLossCode.picture_display_copy_exported",
    // A deck's local video written as its placeholder frame, as a picture
    // that cannot be authorized is drawn as unavailable.
    presentation_video_asset_unavailable_not_exported:
      "toolbar.exportLossCode.presentation_video_asset_unavailable_not_exported",
    presentation_video_unverified_not_exported:
      "toolbar.exportLossCode.presentation_video_unverified_not_exported",
    presentation_video_over_export_budget_not_exported:
      "toolbar.exportLossCode.presentation_video_over_export_budget_not_exported",
    // What a deck written from its page (whole, or slides of it put back in
    // the imported package) cannot carry: the codes `_presentation_to_pptx`
    // records, named for the reader after a download it did not ask about.
    pptx_slides_written_from_page:
      "toolbar.exportLossCode.pptx_slides_written_from_page",
    // A slide whose contents the import could not read went out as the
    // imported file has it, without boxes added there that no save has
    // written yet (readings row 820).
    pptx_unread_slide_additions_not_downloaded:
      "toolbar.exportLossCode.pptx_unread_slide_additions_not_downloaded",
    // Not a loss: a deck holding macros downloads as a .pptm with them kept.
    pptx_saved_as_pptm_with_macros:
      "toolbar.exportLossCode.pptx_saved_as_pptm_with_macros",
    // A deck written from its page leaves the original's macros out.
    pptx_macros_not_kept: "toolbar.exportLossCode.pptx_macros_not_kept",
    presentation_notes_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_notes_preserve_only_not_exported",
    // Notes the page changed, written from its plain text over a notes page
    
    presentation_notes_formatting_not_kept:
      "toolbar.exportLossCode.presentation_notes_formatting_not_kept",
    // A part of the original package the written deck dropped, named by kind
    // and owner (`presentation_part_not_exported:<kind>[:slide<N>...]`).
    "presentation_part_not_exported:":
      "toolbar.exportLossCode.presentation_part_not_exported",
    presentation_comments_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_comments_preserve_only_not_exported",
    presentation_historical_comments_not_exported:
      "toolbar.exportLossCode.presentation_historical_comments_not_exported",
    presentation_narration_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_narration_preserve_only_not_exported",
    slide_narration_not_exported:
      "toolbar.exportLossCode.presentation_narration_preserve_only_not_exported",
    presentation_animation_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_animation_preserve_only_not_exported",
    presentation_animation_effect_visual_not_reproduced:
      "toolbar.exportLossCode.presentation_animation_preserve_only_not_exported",
    presentation_animation_sound_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_animation_sound_preserve_only_not_exported",
    presentation_transition_sound_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_animation_sound_preserve_only_not_exported",
    presentation_transition_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_transition_preserve_only_not_exported",
    presentation_omml_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_omml_preserve_only_not_exported",
    presentation_native_smartart_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_native_smartart_preserve_only_not_exported",
    presentation_smartart_identity_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_native_smartart_preserve_only_not_exported",
    presentation_embedded_fonts_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_embedded_fonts_preserve_only_not_exported",
    presentation_model3d_preserve_only_not_exported:
      "toolbar.exportLossCode.presentation_model3d_preserve_only_not_exported",
    presentation_ole_object_exported_as_picture:
      "toolbar.exportLossCode.presentation_ole_object_exported_as_picture",
    presentation_web_page_embed_not_exported:
      "toolbar.exportLossCode.presentation_web_page_embed_not_exported",
    image_data_undecodable: "toolbar.exportLossCode.image_not_embeddable",
    image_not_embeddable: "toolbar.exportLossCode.image_not_embeddable",
    ink_stroke_unreadable: "toolbar.exportLossCode.ink_stroke_unreadable",
    "block_export_failed:": "toolbar.exportLossCode.block_export_failed",
    // What a PowerPoint 97-2003 file (.ppt) does not keep of the deck
    // (`office_conversion.ppt_export_loss_codes`), asked before it is written.
    ppt_export_smartart_as_shapes:
      "toolbar.exportLossCode.ppt_export_smartart_as_shapes",
    // A deck's PDF: a cache-less SmartArt the engine did not lay out printed
    // as its dashed frame (`smartart_absent_scene`, TRIAGE S2f).
    presentation_smartart_not_laid_out_in_pdf:
      "toolbar.exportLossCode.presentation_smartart_not_laid_out_in_pdf",
    ppt_export_shape_effects_dropped:
      "toolbar.exportLossCode.ppt_export_shape_effects_dropped",
    ppt_export_media_not_embedded:
      "toolbar.exportLossCode.ppt_export_media_not_embedded",
    ppt_export_equations_dropped:
      "toolbar.exportLossCode.ppt_export_equations_dropped",
    ppt_export_text_effects_dropped:
      "toolbar.exportLossCode.ppt_export_text_effects_dropped",
    ppt_export_ink_dropped:
      "toolbar.exportLossCode.ppt_export_ink_dropped",
    ppt_export_transitions_replaced:
      "toolbar.exportLossCode.ppt_export_transitions_replaced",
    ppt_export_svg_as_bitmap:
      "toolbar.exportLossCode.ppt_export_svg_as_bitmap",
    ppt_export_sections_dropped:
      "toolbar.exportLossCode.ppt_export_sections_dropped",
  });

/** The sentence key for ``lossCode``: its own, else the one of its family
 * (``block_export_failed:<kind>`` reads as ``block_export_failed:``). */
function lossMessageKey(lossCode: string): string | undefined {
  const own = PAGE_EXPORT_LOSS_MESSAGE_KEYS[lossCode];
  if (own) return own;
  const colon = lossCode.indexOf(":");
  return colon > 0 ? PAGE_EXPORT_LOSS_MESSAGE_KEYS[lossCode.slice(0, colon + 1)] : undefined;
}

export interface PageExportLossInventory {
  readonly lossCodes: readonly string[];
  readonly lossCount: number;
}

export interface PageExportLossConfirmDialogProps {
  /** The refusal being answered, or null when nothing is pending. */
  readonly pending: PageExportLossInventory | null;
  readonly title: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** Sentence above the list: what this inventory is, per editor. */
  readonly summary?: string;
  /** Sentence under the list: what to do instead, per editor. */
  readonly notice?: string;
  /** The changes the file lacks, each named (the page's `declined_changes`). */
  readonly missingChanges?: readonly string[];
  /**
   * Defaults to false: consent is the irreversible half of this choice, so
   * focus opens inside the dialog rather than on the button that ships the
   * copy. Editors that already shipped Enter-to-confirm keep it by opting in.
   */
  readonly autoFocusConfirm?: boolean;
  readonly testIdPrefix: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** A third choice beside the lossy copy (the file as last saved). */
  readonly secondaryAction?: { label: string; onClick: () => void; testId?: string };
  /**
   * The file is already on its way (a download the server wrote without
   * asking): the same item list, as a notice with OK alone.
   */
  readonly acknowledgeOnly?: boolean;
}

export default function PageExportLossConfirmDialog({
  pending,
  title,
  confirmLabel,
  cancelLabel,
  summary,
  notice,
  missingChanges,
  autoFocusConfirm = false,
  testIdPrefix,
  onConfirm,
  onCancel,
  secondaryAction,
  acknowledgeOnly = false,
}: PageExportLossConfirmDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const unlisted = pending
    ? pending.lossCount - pending.lossCodes.length
    : 0;
  return (
    <ConfirmDialog
      open={pending !== null}
      title={title}
      body={
        pending ? (
          <>
            {summary ? (
              <p style={{ marginBottom: 8 }}>{summary}</p>
            ) : null}
            <ul
              role="status"
              aria-label={t("toolbar.exportLossItems")}
              data-testid={`${testIdPrefix}-items`}
              data-loss-count={pending.lossCount}
              style={{ margin: 0, paddingInlineStart: 20 }}
            >
              {pending.lossCodes.map((lossCode) => {
                const key = lossMessageKey(lossCode);
                return (
                  <li
                    key={lossCode}
                    data-testid={`${testIdPrefix}-item-${lossCode}`}
                    data-loss-code={lossCode}
                  >
                    {key
                      ? t(key as "toolbar.exportLossCodeUnknown")
                      : t("toolbar.exportLossCodeUnknown", { code: lossCode })}
                  </li>
                );
              })}
              {unlisted > 0 ? (
                <li data-testid={`${testIdPrefix}-item-unlisted`}>
                  {t("toolbar.exportLossAdditional", { count: unlisted })}
                </li>
              ) : null}
            </ul>
            {missingChanges?.length ? (
              <ul
                data-testid={`${testIdPrefix}-missing`}
                style={{ margin: "8px 0 0", paddingInlineStart: 20 }}
              >
                {missingChanges.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            ) : null}
            {notice ? <p style={{ marginTop: 8 }}>{notice}</p> : null}
          </>
        ) : undefined
      }
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      autoFocusConfirm={autoFocusConfirm || acknowledgeOnly}
      acknowledgeOnly={acknowledgeOnly}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...(secondaryAction ? { secondaryAction } : {})}
    />
  );
}
