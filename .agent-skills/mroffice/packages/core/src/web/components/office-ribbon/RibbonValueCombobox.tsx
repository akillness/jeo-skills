"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, useState } from "react";

import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import {
  officeFormatPreviewHandlers,
  useOfficeFormatPreview,
  type OfficeFormatPreviewPatch,
} from "./officeFormatPreview";
import { useOfficeRibbonCommandGate } from "./officeRibbonCommandGate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export type RibbonValueOption = Readonly<{
  id?: string;
  value: string;
  label: string;
}>;

export type RibbonValueComboboxProps = {
  testId: string;
  /** Semantic command shared by the editable face, disclosure and options. */
  controlId?: string;
  /** Physical ribbon surface used with occurrence IDs to distinguish aliases. */
  controlSurface?: string;
  /** Optional distinct semantic identity for the menu disclosure. */
  disclosureControlId?: string;
  /** Semantic identity for each parameterized preset option. */
  optionControlId?: (option: RibbonValueOption) => string | undefined;
  /** Stable identity for each parameterized option rendered in the portal. */
  optionOccurrenceId?: (option: RibbonValueOption) => string;
  label: string;
  placeholder: string;
  value: string;
  inputMode: "decimal" | "numeric";
  options: readonly RibbonValueOption[];
  className?: string;
  disabled?: boolean;
  mixed?: boolean;
  mixedLabel?: string;
  selectOnFocus?: boolean;
  restoreMenuInvokerOnSelect?: boolean;
  /** Marks portalled options as owned by an active object-selection surface. */
  retainObjectSelection?: boolean;
  onDraftChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onRememberSelection: () => void;
  onCommit: (
    value: string,
    options: { allowClear: boolean; restoreFocus: boolean },
  ) => boolean;
  /**
   * Live Preview: what a preset under the pointer or keyboard focus would
   * apply (a font size box returns `{ fontSizePt }`). Omitted: no preview.
   */
  formatPreview?: (value: string) => OfficeFormatPreviewPatch | null;
};

/** "-1.5" -> "minus-1-5": stable test-id suffixes for arbitrary values. */
export function ribbonValueOptionTestSuffix(value: string): string {
  return value.replace(/-/g, "minus-").replace(/\./g, "-");
}

/**
 * Shared editable ribbon value box. The current value stays visible when it is
 * real, mixed state is announced without inventing a value, and a disabled
 * control cannot open or dispatch a latent blur commit.
 */
export function RibbonValueCombobox({
  testId,
  controlId,
  controlSurface,
  disclosureControlId,
  optionControlId,
  optionOccurrenceId,
  label,
  placeholder,
  value,
  inputMode,
  options,
  className,
  disabled: disabledProp = false,
  mixed = false,
  mixedLabel,
  selectOnFocus = false,
  restoreMenuInvokerOnSelect = false,
  retainObjectSelection = false,
  onDraftChange,
  onFocusChange,
  onRememberSelection,
  onCommit,
  formatPreview: formatPreviewPatch,
}: RibbonValueComboboxProps) {
  // The host's selection gate, by this box's base test id: a value box the
  // selected object cannot take is disabled like any other ribbon control.
  const gate = useOfficeRibbonCommandGate(testId, disabledProp, undefined);
  const disabled = gate.disabled ?? false;
  const formatPreview = useOfficeFormatPreview();
  const [open, setOpen] = useState(false);
  // False the moment the menu closes (its rows animate out under the pointer).
  const menuOpenRef = useRef(false);
  const [editingMixed, setEditingMixed] = useState(false);
  const skipNextBlurCommitRef = useRef(false);
  // What the box showed when the person started typing: a value the host
  // refuses (-5 pt, "abc") is not left standing in the box as if it applied.
  const valueAtFocusRef = useRef(value);
  const [rejected, setRejected] = useState(false);
  const skipMenuBlurCommitRef = useRef(false);
  const menuInvokerRef = useRef<HTMLElement | null>(null);
  const restoreInvokerOnCloseRef = useRef(false);
  const menuId = `${testId}-preset-menu`;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!mixed) setEditingMixed(false);
  }, [mixed]);

  const displayMixed = mixed && !editingMixed;

  return (
    <div
      className={`office-ribbon-control ${(`note-editor-ribbon-value-combobox${
        className ? ` ${className}` : ""
      }`)}`} data-office-control-part="field"
      data-disabled={disabled || undefined}
      data-office-text-format-control={formatPreviewPatch ? "true" : undefined}
      data-disabled-reason={gate.disabledReason || undefined}
      title={gate.disabledReason || undefined}
      data-mixed={mixed || undefined}
      onPointerDownCapture={() => {
        if (!disabled) onRememberSelection();
      }}
    >
      <input
        type="text"
        role="combobox"
        inputMode={inputMode}
        aria-label={label}
        aria-invalid={rejected || undefined}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        placeholder={displayMixed ? (mixedLabel ?? placeholder) : placeholder}
        className="note-editor-office-toolbar__select note-editor-office-toolbar__size-input note-editor-ribbon-value-combobox__input"
        data-control-id={controlSurface ? controlId : undefined}
        data-control-occurrence-id={controlSurface ? "input" : undefined}
        data-control-surface={controlSurface}
        data-testid={testId}
        disabled={disabled}
        value={displayMixed ? "" : value}
        onFocus={(event) => {
          if (disabled) return;
          skipMenuBlurCommitRef.current = false;
          valueAtFocusRef.current = value;
          onFocusChange(true);
          onRememberSelection();
          if (selectOnFocus) event.currentTarget.select();
        }}
        onChange={(event) => {
          if (mixed) setEditingMixed(true);
          setRejected(false);
          onDraftChange(event.target.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (disabled) return;
          if (event.key === "ArrowDown" && event.altKey) {
            event.preventDefault();
            skipMenuBlurCommitRef.current = true;
            menuInvokerRef.current = event.currentTarget;
            restoreInvokerOnCloseRef.current = false;
            menuOpenRef.current = true;
            setOpen(true);
            return;
          }
          if (event.key === "Escape" && open) {
            event.preventDefault();
            menuInvokerRef.current = event.currentTarget;
            restoreInvokerOnCloseRef.current = true;
            menuOpenRef.current = false;
            formatPreview.clearPreview();
            setOpen(false);
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          // The empty box of a mixed selection is a placeholder, not a value
          
          if (displayMixed) return;
          const committed = onCommit(event.currentTarget.value, {
            allowClear: true,
            restoreFocus: true,
          });
          if (committed) {
            skipNextBlurCommitRef.current = true;
            setEditingMixed(false);
            setRejected(false);
          } else {
            // Refused: the box shows the value in force again, selected so
            // the next keystroke replaces it, and reads as invalid until then.
            const input = event.currentTarget;
            onDraftChange(valueAtFocusRef.current);
            setRejected(true);
            requestAnimationFrame(() => {
              if (input.isConnected && input.ownerDocument.activeElement === input) input.select();
            });
          }
        }}
        onBlur={(event) => {
          onFocusChange(false);
          if (disabled) return;
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
          }
          if (skipMenuBlurCommitRef.current) {
            skipMenuBlurCommitRef.current = false;
            return;
          }
          // Focus passing through an untouched mixed box changes nothing.
          if (displayMixed) return;
          setEditingMixed(false);
          setRejected(false);
          const committed = onCommit(event.currentTarget.value, {
            allowClear: true,
            restoreFocus: false,
          });
          // Leaving with a value the host refused puts the one in force back.
          if (!committed) onDraftChange(valueAtFocusRef.current);
        }}
      />
      <DropdownMenu
        open={open}
        onOpenChange={(nextOpen) => {
          if (disabled) {
            setOpen(false);
            return;
          }
          if (nextOpen) {
            skipMenuBlurCommitRef.current = true;
            restoreInvokerOnCloseRef.current = false;
          } else {
            formatPreview.clearPreview();
          }
          menuOpenRef.current = nextOpen;
          setOpen(nextOpen);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="office-ribbon-control note-editor-ribbon-value-combobox__trigger" data-office-control-part="disclosure"
            data-control-id={
              controlSurface ? disclosureControlId : undefined
            }
            data-control-occurrence-id={
              controlSurface ? "options" : undefined
            }
            data-control-surface={controlSurface}
            data-testid={`${testId}-options`}
            aria-label={label}
            title={label}
            disabled={disabled}
            onPointerDown={(event) => {
              if (event.button === 0 && !event.ctrlKey && !disabled) {
                skipMenuBlurCommitRef.current = true;
                menuInvokerRef.current = event.currentTarget;
              }
            }}
            onFocus={(event) => {
              if (disabled) return;
              menuInvokerRef.current = event.currentTarget;
              onRememberSelection();
            }}
          >
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          id={menuId}
          align="start"
          sideOffset={6}
          className="docs-cupertino-menu note-editor-toolbar-value-menu"
          data-office-text-format-control={formatPreviewPatch ? "true" : undefined}
          data-ribbon-object-selection-retain={
            retainObjectSelection ? "true" : undefined
          }
          onEscapeKeyDown={() => {
            restoreInvokerOnCloseRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const invoker = restoreInvokerOnCloseRef.current
              ? menuInvokerRef.current
              : null;
            restoreInvokerOnCloseRef.current = false;
            menuInvokerRef.current = null;
            skipMenuBlurCommitRef.current = false;
            if (invoker?.isConnected) invoker.focus();
          }}
        >
          <DropdownMenuRadioGroup
            value={
              displayMixed
                ? ""
                : (options.find((option) => option.value === value)?.id ??
                  value)
            }
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.id ?? option.value}
                value={option.id ?? option.value}
                data-control-id={
                  controlSurface ? optionControlId?.(option) : undefined
                }
                data-control-occurrence-id={
                  controlSurface
                    ? (optionOccurrenceId?.(option) ??
                      option.id ??
                      option.value)
                    : undefined
                }
                data-control-surface={controlSurface}
                data-testid={`${testId}-option-${ribbonValueOptionTestSuffix(
                  option.id ?? option.value,
                )}`}
                {...officeFormatPreviewHandlers(
                  formatPreview,
                  formatPreviewPatch?.(option.value),
                  () => menuOpenRef.current,
                )}
                onSelect={() => {
                  formatPreview.clearPreview();
                  menuOpenRef.current = false;
                  onDraftChange(option.value);
                  const committed = onCommit(option.value, {
                    allowClear: false,
                    restoreFocus: true,
                  });
                  if (committed && restoreMenuInvokerOnSelect) {
                    restoreInvokerOnCloseRef.current = true;
                  }
                }}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
