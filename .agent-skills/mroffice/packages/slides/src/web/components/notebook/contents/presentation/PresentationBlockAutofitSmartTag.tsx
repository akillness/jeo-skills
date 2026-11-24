"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The AutoFit Options smart tag beside an overflowing text block on the
 * canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { IconTextAutofit } from "../PresentationRibbonIcons";
import presentationContextMenu from "../../../../lib/presentation/presentation-context-menu.module.css";
import { autofitModeForBlock } from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import { Check } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AutofitMode } from "@mrnote/core/web/lib/presentation-autofit.ts";
import type { PresentationTextBlock, PresentationTextBoxBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationBlockAutofitSmartTagCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  autofitSmartMenuBlockId: string | null;
  setAutofitSmartMenuBlockId: Dispatch<SetStateAction<string | null>>;
  autofitSmartMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  setTextBlockAutofit: (blockId: string, mode: AutofitMode) => boolean;
  block: PresentationTextBlock | PresentationTextBoxBlock;
}

export function PresentationBlockAutofitSmartTag({ ctl }: { ctl: PresentationBlockAutofitSmartTagCtl }) {
  const {
    t,
    autofitSmartMenuBlockId,
    setAutofitSmartMenuBlockId,
    autofitSmartMenuTriggerRef,
    setTextBlockAutofit,
    block,
  } = ctl;
  return (
                    <div
                      data-testid="presentation-autofit-smart-tag"
                      style={{
                        position: "absolute",
                        left: 7,
                        bottom: 7,
                        zIndex: 12,
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 5,
                        pointerEvents: "auto",
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        // The smart tag sits inside the body's own wrapper,
                        // whose arrow keys move the box. Its menu keeps them:
                        // Down/Up/Home/End walk the commands, and no arrow
                        // pressed here reaches the box (PPT-B393).
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp" ||
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight" ||
                          event.key === "Home" ||
                          event.key === "End"
                        ) {
                          event.stopPropagation();
                          if (event.key === "ArrowLeft" || event.key === "ArrowRight") return;
                          const items = Array.from(
                            event.currentTarget.querySelectorAll<HTMLButtonElement>(
                              '[role="menu"] [role^="menuitem"]:not(:disabled)',
                            ),
                          );
                          if (items.length === 0) return;
                          event.preventDefault();
                          const at = items.indexOf(document.activeElement as HTMLButtonElement);
                          const next =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? items.length - 1
                                : event.key === "ArrowDown"
                                  ? (at + 1) % items.length
                                  : at <= 0
                                    ? items.length - 1
                                    : at - 1;
                          items[next]?.focus({ preventScroll: true });
                          return;
                        }
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        event.stopPropagation();
                        setAutofitSmartMenuBlockId(null);
                        requestAnimationFrame(() =>
                          autofitSmartMenuTriggerRef.current?.focus({
                            preventScroll: true,
                          }),
                        );
                      }}
                    >
                      <button
                        ref={autofitSmartMenuTriggerRef}
                        type="button"
                        data-testid="presentation-autofit-smart-tag-trigger"
                        aria-label={t("presentation.autofit.options")}
                        title={t("presentation.autofit.options")}
                        aria-haspopup="menu"
                        aria-expanded={autofitSmartMenuBlockId === block.id}
                        onClick={() =>
                          setAutofitSmartMenuBlockId((current) =>
                            current === block.id ? null : block.id,
                          )
                        }
                        style={{
                          width: 30,
                          height: 30,
                          padding: 4,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#1f4f78",
                          background: "#ffffff",
                          border: "1px solid rgba(15, 108, 189, 0.48)",
                          borderRadius: 5,
                          boxShadow:
                            "0 2px 6px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(255,255,255,0.65) inset",
                          cursor: "pointer",
                        }}
                      >
                        <IconTextAutofit size={20} />
                      </button>
                      {autofitSmartMenuBlockId === block.id ? (
                        <div
                          role="menu"
                          aria-label={t("presentation.autofit.options")}
                          data-testid="presentation-autofit-smart-menu"
                          data-office-menu-enter=""
                          className={`docs-cupertino-menu ${presentationContextMenu.menu}`}
                          style={{
                            width: 238,
                            display: "grid",
                            gap: 2,
                            fontSize: 12,
                            lineHeight: 1.3,
                          }}
                        >
                          {(
                            [
                              [
                                "shrink",
                                "presentation.autofit.autoFitText",
                                "presentation-autofit-auto-fit-text",
                              ],
                              [
                                "none",
                                "presentation.autofit.stopFitting",
                                "presentation-autofit-stop-fitting-text",
                              ],
                            ] as const
                          ).map(([mode, labelKey, testId]) => {
                            const active = autofitModeForBlock(block) === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                data-testid={testId}
                                onClick={() => {
                                  setTextBlockAutofit(block.id, mode);
                                  setAutofitSmartMenuBlockId(null);
                                }}
                                className={presentationContextMenu.item}
                                style={{
                                  minHeight: 30,
                                  padding: "5px 8px",
                                  display: "grid",
                                  gridTemplateColumns: "18px 1fr",
                                  alignItems: "center",
                                  gap: 7,
                                }}
                              >
                                {active ? (
                                  <Check size={15} aria-hidden="true" />
                                ) : (
                                  <span aria-hidden="true" />
                                )}
                                <span>{t(labelKey)}</span>
                              </button>
                            );
                          })}
                          <div
                            role="separator"
                            className={presentationContextMenu.separator}
                          />
                          <button
                            type="button"
                            role="menuitem"
                            disabled
                            aria-disabled="true"
                            data-testid="presentation-autofit-split-unsupported"
                            title={t(
                              "presentation.autofit.splitUnsupportedReason",
                            )}
                            className={presentationContextMenu.item}
                            style={{
                              minHeight: 30,
                              padding: "5px 8px 5px 33px",
                            }}
                          >
                            {t("presentation.autofit.splitUnsupported")}
                          </button>
                        </div>
                      ) : null}
                    </div>
  );
}
