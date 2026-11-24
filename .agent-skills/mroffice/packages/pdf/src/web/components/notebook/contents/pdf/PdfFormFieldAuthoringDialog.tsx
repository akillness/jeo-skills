"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  PDF_FIELD_DATE_PATTERNS,
  PDF_FIELD_TIME_PATTERNS,
  PDF_FORM_FIELD_FORMAT_CHOICES,
  pdfFormFieldFormatChoice,
  pdfFormFieldFormatFor,
  type PdfFormFieldFormatChoice,
  type PdfTextFieldFormat,
} from "@mrnote/core/web/lib/pdf/form-field-format.ts";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  FileText,
  Hash,
  ImageIcon,
  LockKeyhole,
  Maximize2,
  Move,
  Presentation,
  Printer,
  RotateCcw,
  Save,
  Scaling,
  Search,
  Signature,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  type HouseIcon,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useOpenedOnce } from "@mrnote/core/web/lib/use-opened-once.ts";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

import { OfficeColorPalettePopover } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { OfficeTaskPaneDockSlot } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPaneDockSlot.tsx";
import type { OfficeTaskPaneDockRegistry } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";
import { PDF_TASK_PANE_BODY_CLASS, PDF_TASK_PANE_CLOSE_CLASS, pdfTaskPaneClassName } from "./pdfTaskPaneDock";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  MAX_FIELD_ALTERNATE_NAME_LENGTH,
  MAX_NATIVE_PDF_FORM_TAB_ORDER,
  reviewFormField,
  type ExistingFormField,
  type FormFieldDraft,
  type FormFieldProblem,
} from "../../../../lib/pdf/form-field-authoring";
import type { AuthoredTextFieldPlacement } from "@/lib/pdf/form-field-create";
import { sanitizeLinkUrl } from "@mrnote/core/web/lib/pdf/doc-search.ts";
import { PDF_LINK_OVERLAY_MAX_URL } from "@mrnote/core/web/lib/pdf/links.ts";
import {
  ACROFORM_MAX_TEXT_FONT_SIZE,
  ACROFORM_MAX_WIDGET_BORDER_WIDTH,
  PDF_TEXT_FIELD_DEFAULT_BACKGROUND_COLOR,
  PDF_TEXT_FIELD_DEFAULT_BORDER_COLOR,
  PDF_TEXT_FIELD_DEFAULT_BORDER_WIDTH,
  PDF_TEXT_FIELD_NO_COLOR,
  PDF_TEXT_FIELD_DEFAULT_COLOR,
  formTextCharacterCount,
  type PdfNavigationButtonAction,
  type PdfTextFieldAlignment,
  type PdfTextFieldVisibility,
  type PdfViewCommandAction,
} from "@mrnote/core/web/lib/pdf/acroform.ts";

import type { PdfRibbonTranslator } from "./pdfRibbonTranslator";
import {
  isPdfFormRoleName,
  nextPdfFormRoleColor,
  PDF_FORM_ROLE_MAX_NAME,
  PDF_FORM_ROLE_PALETTE,
  type PdfFormRole,
} from "../../../../lib/pdf/form-roles";

export type PdfAuthoredFormFieldKind =
  | "text"
  | "checkbox"
  | "dropdown"
  | "listbox"
  | "radio"
  | "signature"
  | "resetButton"
  | "printButton"
  | "navigationButton"
  | "viewButton"
  | "saveButton"
  | "goToPageButton"
  | "webLinkButton"
  | "imageField";

type PdfFormFieldAuthoringSection = "general" | "field" | "position";

export interface PdfAuthoredFormFieldSelection {
  readonly kind: PdfAuthoredFormFieldKind;
  readonly draft: FormFieldDraft;
  readonly placement: AuthoredTextFieldPlacement;
  readonly checked: boolean;
  readonly editable: boolean;
  readonly selectedValues: readonly string[];
  readonly multiselect: boolean;
  readonly options: readonly string[];
  readonly selectedValue: string | null;
  readonly offToggleable: boolean;
  readonly buttonLabel: string;
  readonly buttonUrl: string;
  readonly navigationAction: PdfNavigationButtonAction;
  readonly viewAction: PdfViewCommandAction;
}






export type PdfFormFieldDialogSection = "general" | "appearance" | "options" | "actions";

interface PdfFormFieldAuthoringDialogProps {
  readonly open: boolean;
  readonly initialSection?: PdfFormFieldDialogSection | null;
  readonly initialKind: PdfAuthoredFormFieldKind;
  readonly mode?: "create" | "edit";
  readonly initialSelection?: PdfAuthoredFormFieldSelection | null;
  readonly busy?: boolean;
  readonly nativeAuthoring?: boolean;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly existingFields: readonly ExistingFormField[];
  




  readonly pageSizes?: readonly { readonly width: number; readonly height: number }[];
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly container?: HTMLElement | null;
  




  readonly submitError?: string | null;
  /** The form's filling roles (form-roles.ts): the field's role is one of
   * them, a new one, or none (anyone). */
  readonly formRoles?: readonly PdfFormRole[];
  readonly onApply: (selection: PdfAuthoredFormFieldSelection) => void;
  readonly onCancel: () => void;
  /** The reader's right-edge dock: a field being edited opens its
   * properties there, beside the page (ONLYOFFICE's form settings), not in a
   * modal dialog over it. */
  readonly docked?: OfficeTaskPaneDockRegistry | null;
}

/** A bare control: the dialog chrome draws every field inside `.office-dialog`. */
const FIELD_CLASS = "w-full";
/** The role choice that names a new role (typed below it). */
const NEW_FORM_ROLE = "\u0000new";

function FormFieldCheckbox({
  checked,
  className = "",
  disabled = false,
  label,
  onCheckedChange,
  testId,
}: {
  readonly checked: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly testId: string;
}): React.JSX.Element {
  // The dialog chrome's check row with a 44px touch target: an invisible
  // native checkbox over the chrome-drawn mark.
  return (
    <label className={`${parts.check} min-h-11${className ? ` ${className}` : ""}`}>
      <span className="relative size-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          data-testid={testId}
          className={`${parts.markInput} absolute -left-3.5 -top-3.5 size-11 cursor-pointer disabled:cursor-not-allowed`}
        />
        <span
          aria-hidden
          className={`${parts.mark} pointer-events-none absolute inset-0 size-4`}
        >
          <Check size={12} strokeWidth={2.5} aria-hidden />
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}

const NAVIGATION_BUTTON_ACTIONS: readonly PdfNavigationButtonAction[] = [
  "FirstPage",
  "PrevPage",
  "NextPage",
  "LastPage",
  "GoBack",
  "GoForward",
];

const VIEW_BUTTON_ACTIONS: readonly PdfViewCommandAction[] = [
  "Find",
  "FullScreen",
  "ZoomIn",
  "ZoomOut",
  "FitPage",
  "FitWidth",
];

function navigationActionLabel(
  action: PdfNavigationButtonAction,
  t: PdfRibbonTranslator,
): string {
  const labels: Record<PdfNavigationButtonAction, string> = {
    FirstPage: "pdf.formField.navigationFirstPage",
    PrevPage: "pdf.formField.navigationPrevPage",
    NextPage: "pdf.formField.navigationNextPage",
    LastPage: "pdf.formField.navigationLastPage",
    GoBack: "pdf.formField.navigationGoBack",
    GoForward: "pdf.formField.navigationGoForward",
  };
  return t(labels[action]);
}

function NavigationActionIcon({
  action,
  size,
}: {
  action: PdfNavigationButtonAction;
  size: number;
}): React.JSX.Element {
  if (action === "FirstPage") return <ChevronsLeft size={size} aria-hidden />;
  if (action === "PrevPage") return <ChevronLeft size={size} aria-hidden />;
  if (action === "NextPage") return <ChevronRight size={size} aria-hidden />;
  if (action === "LastPage") return <ChevronsRight size={size} aria-hidden />;
  if (action === "GoBack") return <CornerUpLeft size={size} aria-hidden />;
  return <CornerUpRight size={size} aria-hidden />;
}

function viewActionLabel(
  action: PdfViewCommandAction,
  t: PdfRibbonTranslator,
): string {
  const labels: Record<PdfViewCommandAction, string> = {
    Find: "pdf.formField.viewFind",
    FullScreen: "pdf.formField.viewFullScreen",
    ZoomIn: "pdf.formField.viewZoomIn",
    ZoomOut: "pdf.formField.viewZoomOut",
    FitPage: "pdf.formField.viewFitPage",
    FitWidth: "pdf.formField.viewFitWidth",
  };
  return t(labels[action]);
}

function ViewActionIcon({
  action,
  size,
}: {
  action: PdfViewCommandAction;
  size: number;
}): React.JSX.Element {
  if (action === "Find") return <Search size={size} aria-hidden />;
  if (action === "FullScreen") return <Presentation size={size} aria-hidden />;
  if (action === "ZoomIn") return <ZoomIn size={size} aria-hidden />;
  if (action === "ZoomOut") return <ZoomOut size={size} aria-hidden />;
  if (action === "FitPage") return <Scaling size={size} aria-hidden />;
  return <Maximize2 size={size} aria-hidden />;
}

function nextFieldName(
  existing: readonly ExistingFormField[],
  kind: PdfAuthoredFormFieldKind,
): string {
  const names = new Set(existing.map((field) => field.name));
  const prefix =
    kind === "checkbox"
      ? "CheckBox"
      : kind === "dropdown"
        ? "Dropdown"
        : kind === "listbox"
          ? "ListBox"
          : kind === "radio"
            ? "RadioGroup"
            : kind === "signature"
              ? "Signature"
              : kind === "imageField"
                ? "ImageField"
              : kind === "resetButton"
                ? "ResetButton"
                : kind === "printButton"
                  ? "PrintButton"
                  : kind === "navigationButton"
                    ? "NavigationButton"
                    : kind === "viewButton"
                      ? "ViewButton"
                    : kind === "saveButton"
                      ? "SaveButton"
                      : kind === "goToPageButton"
                        ? "GoToPageButton"
                        : kind === "webLinkButton"
                          ? "WebLinkButton"
                    : "TextField";
  for (let index = 1; index <= existing.length + 1; index += 1) {
    const candidate = `${prefix}_${index}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${prefix}_${existing.length + 2}`;
}

function problemText(
  problem: FormFieldProblem,
  t: PdfRibbonTranslator,
): string {
  const labels: Record<FormFieldProblem, string> = {
    "empty-name": "pdf.formField.problemEmptyName",
    "name-too-long": "pdf.formField.problemNameTooLong",
    "invalid-name-path": "pdf.formField.problemInvalidNamePath",
    "hierarchy-name-conflict": "pdf.formField.problemHierarchyNameConflict",
    "alternate-name-too-long": "pdf.formField.problemAlternateNameTooLong",
    "invalid-alternate-name": "pdf.formField.problemInvalidAlternateName",
    "duplicate-name": "pdf.formField.problemDuplicateName",
    "kind-conflict": "pdf.formField.problemKindConflict",
    "missing-export-value": "pdf.formField.problemMissingExportValue",
    "reserved-export-value": "pdf.formField.problemReservedExportValue",
    "duplicate-export-value": "pdf.formField.problemDuplicateExportValue",
    "missing-options": "pdf.formField.problemMissingOptions",
    "default-not-an-option": "pdf.formField.problemDefaultNotAnOption",
    "negative-max-length": "pdf.formField.problemNegativeMaxLength",
    "incompatible-text-flags": "pdf.formField.problemIncompatibleTextFlags",
    "comb-requires-max-length": "pdf.formField.problemCombRequiresMaxLength",
    "password-default-value": "pdf.formField.problemPasswordDefaultValue",
    "invalid-text-alignment": "pdf.formField.problemInvalidTextAlignment",
    "invalid-text-font-size": "pdf.formField.problemInvalidTextFontSize",
    "invalid-text-color": "pdf.formField.problemInvalidTextColor",
    "invalid-text-background-color":
      "pdf.formField.problemInvalidTextBackgroundColor",
    "invalid-text-border-color": "pdf.formField.problemInvalidTextBorderColor",
    "invalid-text-format": "pdf.formField.problemInvalidTextFormat",
    "invalid-text-border-width": "pdf.formField.problemInvalidTextBorderWidth",
    "invalid-text-visibility": "pdf.formField.problemInvalidTextVisibility",
    "invalid-tab-order": "pdf.formField.problemInvalidTabOrder",
  };
  return t(labels[problem], {
    maxFontSize: ACROFORM_MAX_TEXT_FONT_SIZE,
    maxBorderWidth: ACROFORM_MAX_WIDGET_BORDER_WIDTH,
    maxTabOrder: MAX_NATIVE_PDF_FORM_TAB_ORDER,
  });
}

export default function PdfFormFieldAuthoringDialog(
  props: PdfFormFieldAuthoringDialogProps,
): React.JSX.Element | null {
  if (!useOpenedOnce(props.open)) return null;
  return <PdfFormFieldAuthoringDialogBody {...props} />;
}

function PdfFormFieldAuthoringDialogBody({
  open,
  initialSection = null,
  initialKind,
  mode = "create",
  initialSelection = null,
  busy = false,
  nativeAuthoring = false,
  currentPage,
  totalPages,
  existingFields,
  pageSizes,
  returnFocusRef,
  container,
  submitError = null,
  formRoles = [],
  onApply,
  onCancel,
  docked = null,
}: PdfFormFieldAuthoringDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const editing = mode === "edit";
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] =
    useState<PdfFormFieldAuthoringSection>("general");
  const sectionSeed = open ? `${mode}:${initialKind}` : null;
  // Opened at a part: that part is brought into view once the dialog shows.
  useEffect(() => {
    if (!open || !initialSection || initialSection === "general") return;
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-form-section="${initialSection}"]`),
      ).find((element) => !element.closest('[role="dialog"]')?.hasAttribute("hidden"));
      target?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, initialSection, sectionSeed]);
  const [lastSectionSeed, setLastSectionSeed] = useState(sectionSeed);
  if (sectionSeed !== lastSectionSeed) {
    setLastSectionSeed(sectionSeed);
    if (sectionSeed !== null) setActiveSection("general");
  }
  const [name, setName] = useState("");
  const [alternateName, setAlternateName] = useState("");
  // Who fills the field: "" anyone, a role's name, or NEW_ROLE (named below).
  const [roleChoice, setRoleChoice] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(() => nextPdfFormRoleColor(formRoles));
  const [initialRole, setInitialRole] = useState<PdfFormRole | null>(null);
  const [defaultValue, setDefaultValue] = useState("");
  const [exportValue, setExportValue] = useState("Yes");
  const [optionsText, setOptionsText] = useState("");
  const [checked, setChecked] = useState(false);
  const [editable, setEditable] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [multiselect, setMultiselect] = useState(false);
  const [offToggleable, setOffToggleable] = useState(false);
  const [required, setRequired] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [maxLength, setMaxLength] = useState(0);
  const [multiline, setMultiline] = useState(false);
  const [password, setPassword] = useState(false);
  const [comb, setComb] = useState(false);
  // Acrobat's Format (ONLYOFFICE's special fields): null for none.
  const [format, setFormat] = useState<PdfTextFieldFormat | null>(null);
  const [spellCheck, setSpellCheck] = useState(true);
  const [scrollable, setScrollable] = useState(true);
  const [alignment, setAlignment] = useState<PdfTextFieldAlignment>("left");
  const [fontSize, setFontSize] = useState(0);
  const [textColor, setTextColor] = useState(PDF_TEXT_FIELD_DEFAULT_COLOR);
  const [textColorPaletteOpen, setTextColorPaletteOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState(
    PDF_TEXT_FIELD_DEFAULT_BACKGROUND_COLOR,
  );
  const [backgroundColorPaletteOpen, setBackgroundColorPaletteOpen] =
    useState(false);
  const [borderColor, setBorderColor] = useState(
    PDF_TEXT_FIELD_DEFAULT_BORDER_COLOR,
  );
  const [borderColorPaletteOpen, setBorderColorPaletteOpen] = useState(false);
  const textColorAnchorRef = useRef<HTMLButtonElement | null>(null);
  const backgroundColorAnchorRef = useRef<HTMLButtonElement | null>(null);
  const borderColorAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [borderWidth, setBorderWidth] = useState(
    PDF_TEXT_FIELD_DEFAULT_BORDER_WIDTH,
  );
  const [visibility, setVisibility] =
    useState<PdfTextFieldVisibility>("visible");
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [navigationAction, setNavigationAction] =
    useState<PdfNavigationButtonAction>("NextPage");
  const [viewAction, setViewAction] = useState<PdfViewCommandAction>("Find");
  const [page, setPage] = useState(currentPage);
  const [x, setX] = useState(10);
  const [y, setY] = useState(10);
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(6);
  const [manualTabOrder, setManualTabOrder] = useState(
    Math.min(existingFields.length + 1, MAX_NATIVE_PDF_FORM_TAB_ORDER),
  );

  useEffect(() => {
    if (!open) return;
    if (
      editing &&
      initialSelection !== null &&
      initialSelection.kind === initialKind
    ) {
      const initialDraft = initialSelection.draft;
      setName(initialDraft.name);
      setAlternateName(initialDraft.alternateName ?? "");
      setInitialRole(initialDraft.role ?? null);
      setRoleChoice(initialDraft.role?.name ?? "");
      setNewRoleName("");
      setDefaultValue(initialDraft.defaultValue ?? "");
      setExportValue(initialDraft.exportValue ?? "Yes");
      setOptionsText((initialDraft.options ?? []).join("\n"));
      setChecked(initialSelection.checked);
      setEditable(initialSelection.editable);
      setSelectedValues([...initialSelection.selectedValues]);
      setMultiselect(initialSelection.multiselect);
      setOffToggleable(initialSelection.offToggleable);
      setRequired(initialDraft.required ?? false);
      setReadOnly(initialDraft.readOnly ?? false);
      setMaxLength(initialDraft.maxLength ?? 0);
      setMultiline(initialDraft.multiline ?? false);
      setPassword(initialDraft.password ?? false);
      setComb(initialDraft.comb ?? false);
      setFormat(initialDraft.format ?? null);
      setSpellCheck(initialDraft.spellCheck ?? true);
      setScrollable(initialDraft.scrollable ?? true);
      setAlignment(initialDraft.alignment ?? "left");
      setFontSize(initialDraft.fontSize ?? 0);
      setTextColor(initialDraft.textColor ?? PDF_TEXT_FIELD_DEFAULT_COLOR);
      setTextColorPaletteOpen(false);
      setBackgroundColor(
        initialDraft.backgroundColor ??
          PDF_TEXT_FIELD_DEFAULT_BACKGROUND_COLOR,
      );
      setBackgroundColorPaletteOpen(false);
      setBorderColor(
        initialDraft.borderColor ?? PDF_TEXT_FIELD_DEFAULT_BORDER_COLOR,
      );
      setBorderColorPaletteOpen(false);
      setBorderWidth(
        initialDraft.borderWidth ?? PDF_TEXT_FIELD_DEFAULT_BORDER_WIDTH,
      );
      setVisibility(initialDraft.visibility ?? "visible");
      setButtonLabel(initialSelection.buttonLabel);
      setButtonUrl(initialSelection.buttonUrl);
      setNavigationAction(initialSelection.navigationAction);
      setViewAction(initialSelection.viewAction);
      setPage(initialSelection.placement.page);
      setX(Number((initialSelection.placement.x * 100).toFixed(2)));
      setY(Number((initialSelection.placement.y * 100).toFixed(2)));
      setWidth(Number((initialSelection.placement.width * 100).toFixed(2)));
      setHeight(Number((initialSelection.placement.height * 100).toFixed(2)));
      setManualTabOrder(initialDraft.tabOrder ?? 1);
      return;
    }
    setName(nextFieldName(existingFields, initialKind));
    setAlternateName("");
    setInitialRole(null);
    setRoleChoice("");
    setNewRoleName("");
    setNewRoleColor(nextPdfFormRoleColor(formRoles));
    setDefaultValue("");
    setExportValue("Yes");
    setOptionsText("");
    setChecked(false);
    setEditable(false);
    setSelectedValues([]);
    setMultiselect(false);
    setOffToggleable(false);
    setRequired(false);
    setReadOnly(false);
    setMaxLength(0);
    setMultiline(false);
    setPassword(false);
    setComb(false);
    setSpellCheck(true);
    setScrollable(true);
    setAlignment("left");
    setFontSize(0);
    setTextColor(PDF_TEXT_FIELD_DEFAULT_COLOR);
    setTextColorPaletteOpen(false);
    setBackgroundColor(PDF_TEXT_FIELD_DEFAULT_BACKGROUND_COLOR);
    setBackgroundColorPaletteOpen(false);
    setBorderColor(PDF_TEXT_FIELD_DEFAULT_BORDER_COLOR);
    setBorderColorPaletteOpen(false);
    setBorderWidth(PDF_TEXT_FIELD_DEFAULT_BORDER_WIDTH);
    setVisibility("visible");
    setButtonUrl("");
    setNavigationAction("NextPage");
    setViewAction("Find");
    setButtonLabel(
      initialKind === "printButton"
        ? t("pdf.formField.actionPrint")
        : initialKind === "navigationButton"
          ? navigationActionLabel("NextPage", t)
          : initialKind === "viewButton"
            ? viewActionLabel("Find", t)
            : initialKind === "saveButton"
              ? t("pdf.formField.actionSaveAs")
              : initialKind === "goToPageButton"
                ? t("pdf.formField.actionGoToPage")
                : initialKind === "webLinkButton"
                  ? t("pdf.formField.actionOpenWebsite")
                  : t("pdf.formField.actionResetForm"),
    );
    setPage(Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1)));
    setX(10);
    setY(10);
    setWidth(
      initialKind === "checkbox"
        ? 4
        : initialKind === "text"
          ? 32
          : initialKind === "signature"
            ? 28
            : initialKind === "imageField"
              ? 24
            : initialKind === "resetButton" ||
                initialKind === "printButton" ||
                initialKind === "navigationButton" ||
                initialKind === "viewButton" ||
                initialKind === "saveButton" ||
                initialKind === "goToPageButton" ||
                initialKind === "webLinkButton"
              ? 24
              : 24,
    );
    setHeight(
      initialKind === "checkbox"
        ? 4
        : initialKind === "listbox" || initialKind === "radio"
          ? 18
          : initialKind === "signature"
            ? 8
            : initialKind === "imageField"
              ? 16
            : 6,
    );
    setManualTabOrder(
      Math.min(existingFields.length + 1, MAX_NATIVE_PDF_FORM_TAB_ORDER),
    );
  }, [
    currentPage,
    editing,
    existingFields,
    initialKind,
    initialSelection,
    open,
    t,
    totalPages,
  ]);

  const choiceOptions = useMemo(
    () =>
      optionsText
        .split(/\r?\n/)
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    [optionsText],
  );

  const authoredDefaultValue =
    initialKind === "listbox" ? (selectedValues[0] ?? "") : defaultValue;
  const isActionButton =
    initialKind === "resetButton" ||
    initialKind === "printButton" ||
    initialKind === "navigationButton" ||
    initialKind === "viewButton" ||
    initialKind === "saveButton" ||
    initialKind === "goToPageButton" ||
    initialKind === "webLinkButton";
  const fieldSectionLabel = isActionButton
    ? t("pdf.formField.tabAction")
    : initialKind === "signature" || initialKind === "imageField"
      ? t("pdf.formField.tabBehavior")
      : initialKind === "text"
        ? t("pdf.formField.tabAppearance")
        : t("pdf.formField.tabOptions");
  const sections: ReadonlyArray<{
    id: PdfFormFieldAuthoringSection;
    label: string;
    icon: HouseIcon;
  }> = [
    { id: "general", label: t("pdf.formField.tabGeneral"), icon: FileText },
    { id: "field", label: fieldSectionLabel, icon: SlidersHorizontal },
    { id: "position", label: t("pdf.formField.tabPosition"), icon: Move },
  ];
  const selectAdjacentSection = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sections.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) %
            sections.length;
    const next = sections[target];
    if (!next) return;
    setActiveSection(next.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(target)
      ?.focus();
  };
  const validationKind =
    initialKind === "resetButton" ||
    initialKind === "printButton" ||
    initialKind === "navigationButton" ||
    initialKind === "viewButton" ||
    initialKind === "saveButton" ||
    initialKind === "goToPageButton" ||
    initialKind === "webLinkButton"
      ? "text"
      : initialKind;

  // The roles offered: the form's, and the field's own when it names one the
  // form no longer lists.
  const roleOptions = useMemo<readonly PdfFormRole[]>(() =>
    initialRole && !formRoles.some((role) => role.name === initialRole.name)
      ? [...formRoles, initialRole] : formRoles, [formRoles, initialRole]);
  const trimmedNewRoleName = newRoleName.trim();
  const fieldRole = useMemo<PdfFormRole | null>(() => {
    if (roleChoice === NEW_FORM_ROLE) {
      if (!isPdfFormRoleName(trimmedNewRoleName)) return null;
      return roleOptions.find((role) => role.name === trimmedNewRoleName) ??
        { name: trimmedNewRoleName, color: newRoleColor };
    }
    return roleOptions.find((role) => role.name === roleChoice) ?? null;
  }, [newRoleColor, roleChoice, roleOptions, trimmedNewRoleName]);
  const draft = useMemo<FormFieldDraft>(
    () => ({
      kind: validationKind,
      name,
      ...(!isActionButton && alternateName.trim()
        ? { alternateName }
        : {}),
      ...(fieldRole ? { role: fieldRole } : {}),
      ...(initialKind !== "checkbox" &&
      !(initialKind === "text" && password) &&
      authoredDefaultValue
        ? { defaultValue: authoredDefaultValue }
        : {}),
      ...(initialKind === "checkbox" ? { exportValue } : {}),
      ...(initialKind === "radio"
        ? { exportValue: choiceOptions[0] ?? "" }
        : {}),
      ...(initialKind === "dropdown" || initialKind === "listbox"
        ? { options: choiceOptions }
        : {}),
      ...(required ? { required: true } : {}),
      ...(readOnly ? { readOnly: true } : {}),
      ...(initialKind === "text" && maxLength > 0 ? { maxLength } : {}),
      ...(initialKind === "text" && multiline ? { multiline: true } : {}),
      ...(initialKind === "text" && password ? { password: true } : {}),
      ...(initialKind === "text" && comb ? { comb: true } : {}),
      ...(initialKind === "text" && format ? { format } : {}),
      ...(initialKind === "text" ? { spellCheck } : {}),
      ...(initialKind === "text" ? { scrollable } : {}),
      ...(initialKind === "text" ? { alignment } : {}),
      ...(initialKind === "text" ? { fontSize } : {}),
      ...(initialKind === "text" ? { textColor } : {}),
      ...(initialKind === "text" ? { backgroundColor } : {}),
      ...(initialKind === "text" ? { borderColor } : {}),
      ...(initialKind === "text" ? { borderWidth } : {}),
      ...(initialKind === "text" ? { visibility } : {}),
      tabOrder: manualTabOrder,
    }),
    [
      alternateName,
      fieldRole,
      alignment,
      backgroundColor,
      authoredDefaultValue,
      borderColor,
      borderWidth,
      choiceOptions,
      comb,
      exportValue,
      fontSize,
      format,
      initialKind,
      isActionButton,
      maxLength,
      manualTabOrder,
      multiline,
      name,
      password,
      readOnly,
      required,
      scrollable,
      spellCheck,
      textColor,
      validationKind,
      visibility,
    ],
  );
  const problems = useMemo(
    () => reviewFormField(draft, existingFields),
    [draft, existingFields],
  );
  
  // page is drawn 10:7, never squeezed into the dialog's wide strip.
  const previewPageSize = pageSizes?.[page - 1];
  const previewPageRatio =
    previewPageSize &&
    previewPageSize.width > 0 &&
    previewPageSize.height > 0 &&
    Number.isFinite(previewPageSize.width / previewPageSize.height)
      ? Number((previewPageSize.width / previewPageSize.height).toFixed(6))
      : 612 / 792;
  const geometryInvalid =
    !Number.isInteger(page) ||
    page < 1 ||
    page > totalPages ||
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 100 ||
    y + height > 100;
  const valueTooLong =
    initialKind === "text" &&
    maxLength > 0 &&
    formTextCharacterCount(defaultValue) > maxLength;
  const choiceConfigurationInvalid =
    (initialKind === "dropdown" || initialKind === "listbox") &&
    (choiceOptions.length > 200 ||
      choiceOptions.some((option) => option.length > 256) ||
      new Set(choiceOptions).size !== choiceOptions.length ||
      (initialKind === "listbox" &&
        (selectedValues.some((value) => !choiceOptions.includes(value)) ||
          (!multiselect && selectedValues.length > 1))));
  const radioNameConflict =
    initialKind === "radio" &&
    existingFields.some((field) => field.name === name.trim());
  const radioConfigurationInvalid =
    initialKind === "radio" &&
    (choiceOptions.length < 2 ||
      choiceOptions.length > 200 ||
      choiceOptions.some(
        (option) => option.length > 256 || option === "Off",
      ) ||
      new Set(choiceOptions).size !== choiceOptions.length ||
      (defaultValue !== "" && !choiceOptions.includes(defaultValue)));
  const actionButtonLabelInvalid =
    isActionButton &&
    (buttonLabel.length === 0 ||
      buttonLabel !== buttonLabel.trim() ||
      buttonLabel.length > 512 ||
      /[\u0000-\u001f\u007f]/.test(buttonLabel));
  const navigationActionInvalid =
    initialKind === "navigationButton" &&
    !NAVIGATION_BUTTON_ACTIONS.includes(navigationAction);
  const viewActionInvalid =
    initialKind === "viewButton" && !VIEW_BUTTON_ACTIONS.includes(viewAction);
  const normalizedButtonUrl =
    initialKind === "webLinkButton" &&
    buttonUrl.length <= PDF_LINK_OVERLAY_MAX_URL
      ? sanitizeLinkUrl(buttonUrl)
      : null;
  const buttonUrlInvalid =
    initialKind === "webLinkButton" && normalizedButtonUrl === null;
  const canApply =
    totalPages > 0 &&
    problems.length === 0 &&
    !geometryInvalid &&
    !valueTooLong &&
    !choiceConfigurationInvalid &&
    !radioNameConflict &&
    !radioConfigurationInvalid &&
    !actionButtonLabelInvalid &&
    !navigationActionInvalid &&
    !viewActionInvalid &&
    !buttonUrlInvalid &&
    // A new role is named before the field takes it.
    !(roleChoice === NEW_FORM_ROLE && fieldRole === null);

  // The inputs show a field's place to two decimals; a value the user left
  // alone goes back exactly as the file had it, so saving another property
  
  const keptPlacementFraction = (
    key: "x" | "y" | "width" | "height",
    shown: number,
  ): number => {
    const original =
      editing && initialSelection !== null && initialSelection.placement.page === page
        ? initialSelection.placement[key]
        : null;
    return original !== null &&
      Number((original * 100).toFixed(2)) === shown
      ? original
      : shown / 100;
  };
  const apply = () => {
    if (!canApply) return;
    onApply({
      kind: initialKind,
      draft,
      placement: {
        page,
        x: keptPlacementFraction("x", x),
        y: keptPlacementFraction("y", y),
        width: keptPlacementFraction("width", width),
        height: keptPlacementFraction("height", height),
      },
      checked: initialKind === "checkbox" && checked,
      editable: initialKind === "dropdown" && editable,
      selectedValues: initialKind === "listbox" ? selectedValues : [],
      multiselect: initialKind === "listbox" && multiselect,
      options: initialKind === "radio" ? choiceOptions : [],
      selectedValue:
        initialKind === "radio" && defaultValue ? defaultValue : null,
      offToggleable: initialKind === "radio" && offToggleable,
      buttonLabel:
        isActionButton ? buttonLabel : "",
      buttonUrl:
        initialKind === "webLinkButton" ? (normalizedButtonUrl ?? "") : "",
      navigationAction,
      viewAction,
    });
  };

  // A field read from the file carries its own fractional position, size,
  // font size and border width (a 30 pt-high widget on a 420 pt page is
  // 7.142857%). Those inputs accept any decimal; only counts (page, maximum
  // length, tab order) step by whole numbers. A value the browser still
  // refuses opens the tab it is on, so Save never fails without a word
  
  const revealInvalidInput = (input: HTMLInputElement) => {
    const panel = input.closest<HTMLElement>("[role='tabpanel']");
    const section = panel?.id.replace("pdf-form-field-panel-", "");
    if (section === "general" || section === "field" || section === "position") {
      setActiveSection(section);
    }
  };
  const numberField = (
    label: string,
    value: number,
    setValue: (value: number) => void,
    min: number,
    max: number,
    testId: string,
    step: number | "any" = "any",
  ) => (
    <label className={parts.field}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          setValue(Number.isFinite(next) ? next : 0);
        }}
        onInvalid={(event) => revealInvalidInput(event.currentTarget)}
        className={FIELD_CLASS}
        data-testid={testId}
      />
    </label>
  );
  const colorField = (
    label: string,
    chooseLabel: string,
    value: string,
    setValue: (value: string) => void,
    open: boolean,
    setOpen: (value: boolean | ((current: boolean) => boolean)) => void,
    testId: string,
    anchorRef: RefObject<HTMLButtonElement | null>,
    // Fill and border offer "No Fill"/"No Color": a transparent field
    
    noColorLabel?: string,
  ) => {
    const none = noColorLabel !== undefined && value === PDF_TEXT_FIELD_NO_COLOR;
    return (
    <div className="relative grid gap-1 text-xs font-medium">
      <span>{label}</span>
      <button
        ref={anchorRef}
        type="button"
        className={`${FIELD_CLASS} flex items-center justify-between gap-2 text-left`}
        aria-label={chooseLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setTextColorPaletteOpen(false);
          setBackgroundColorPaletteOpen(false);
          setBorderColorPaletteOpen(false);
          setOpen(next);
        }}
        data-testid={testId}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <span
            className="h-4 w-4 shrink-0 rounded-sm border border-border"
            data-chrome-preview=""
            style={
              none
                ? {
                    background:
                      "linear-gradient(to top right, transparent calc(50% - 1px), #d13438 calc(50% - 1px), #d13438 calc(50% + 1px), transparent calc(50% + 1px)), #ffffff",
                  }
                : { background: value }
            }
            aria-hidden
          />
          {none ? (
            <span className="truncate">{noColorLabel}</span>
          ) : (
            <span className="truncate font-mono uppercase">{value}</span>
          )}
        </span>
        <ChevronDown className="shrink-0" size={14} aria-hidden />
      </button>
      {open ? (
        <OfficeColorPalettePopover
          anchorRef={anchorRef}
          value={none ? undefined : value}
          labels={{
            themeColors: t("pdf.formField.themeColors"),
            standardColors: t("pdf.formField.standardColors"),
            recentColors: t("pdf.formField.recentColors"),
            moreColors: t("pdf.formField.moreColors"),
            ...(noColorLabel !== undefined ? { noFill: noColorLabel } : {}),
          }}
          allowNoFill={noColorLabel !== undefined}
          noFillSelected={none}
          onPick={(next) => {
            if (next) setValue(next);
            else if (noColorLabel !== undefined) setValue(PDF_TEXT_FIELD_NO_COLOR);
            setOpen(false);
          }}
          onDismiss={() => setOpen(false)}
          testIdPrefix={testId}
        />
      ) : null}
    </div>
    );
  };

  const dialogTitle = (
        editing
          ? initialKind === "checkbox"
            ? t("pdf.formField.titleEditCheckbox")
            : initialKind === "dropdown"
              ? t("pdf.formField.titleEditDropdown")
              : initialKind === "listbox"
                ? t("pdf.formField.titleEditListbox")
                : initialKind === "signature"
                  ? t("pdf.formField.titleEditSignature")
                  : initialKind === "imageField"
                    ? t("pdf.formField.titleEditImageField")
                  : isActionButton
                    ? t("pdf.formField.titleEditButton")
                    : t("pdf.formField.titleEditText")
          : initialKind === "checkbox"
            ? t("pdf.formField.titleAddCheckbox")
            : initialKind === "dropdown"
              ? t("pdf.formField.titleAddDropdown")
              : initialKind === "listbox"
                ? t("pdf.formField.titleAddListbox")
                : initialKind === "radio"
                  ? t("pdf.formField.titleAddRadio")
                  : initialKind === "signature"
                    ? t("pdf.formField.titleAddSignature")
                    : initialKind === "imageField"
                      ? t("pdf.formField.titleAddImageField")
                    : initialKind === "resetButton"
                      ? t("pdf.formField.titleAddResetButton")
                      : initialKind === "printButton"
                        ? t("pdf.formField.titleAddPrintButton")
                        : initialKind === "navigationButton"
                          ? t("pdf.formField.titleAddNavigationButton")
                          : initialKind === "viewButton"
                            ? t("pdf.formField.titleAddViewButton")
                            : initialKind === "saveButton"
                              ? t("pdf.formField.titleAddSaveButton")
                              : initialKind === "goToPageButton"
                                ? t("pdf.formField.titleAddGoToPageButton")
                                : initialKind === "webLinkButton"
                                  ? t("pdf.formField.titleAddWebLinkButton")
                                  : t("pdf.formField.titleAddText")
  );
  const dialogDescription = (
        editing
          ? initialKind === "checkbox"
            ? t("pdf.formField.descEditCheckbox")
            : initialKind === "dropdown"
              ? t("pdf.formField.descEditDropdown")
              : initialKind === "listbox"
                ? t("pdf.formField.descEditListbox")
                : initialKind === "signature"
                  ? t("pdf.formField.descEditSignature")
                  : initialKind === "imageField"
                    ? t("pdf.formField.descEditImageField")
                  : isActionButton
                    ? t("pdf.formField.descEditButton")
                    : t("pdf.formField.descEditText")
          : initialKind === "checkbox"
            ? t("pdf.formField.descCreateCheckbox")
            : initialKind === "dropdown"
              ? t("pdf.formField.descCreateDropdown")
              : initialKind === "listbox"
                ? t("pdf.formField.descCreateListbox")
                : initialKind === "radio"
                  ? t("pdf.formField.descCreateRadio")
                  : initialKind === "signature"
                    ? t("pdf.formField.descCreateSignature")
                    : initialKind === "imageField"
                      ? t("pdf.formField.descCreateImageField")
                    : initialKind === "resetButton"
                      ? t("pdf.formField.descCreateResetButton")
                      : initialKind === "printButton"
                        ? t("pdf.formField.descCreatePrintButton")
                        : initialKind === "navigationButton"
                          ? t("pdf.formField.descCreateNavigationButton")
                          : initialKind === "viewButton"
                            ? t("pdf.formField.descCreateViewButton")
                            : initialKind === "saveButton"
                              ? t("pdf.formField.descCreateSaveButton")
                              : initialKind === "goToPageButton"
                                ? t("pdf.formField.descCreateGoToPageButton")
                                : initialKind === "webLinkButton"
                                  ? t("pdf.formField.descCreateWebLinkButton")
                                  : t("pdf.formField.descCreateText")
  );
  const content = (
    <>
      <div
        className="office-dialog__tabs"
        role="tablist"
        aria-label={t("pdf.formField.categories")}
        data-testid="pdf-form-field-tabs"
      >
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              id={`pdf-form-field-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              aria-controls={`pdf-form-field-panel-${section.id}`}
              tabIndex={activeSection === section.id ? 0 : -1}
              className="office-dialog__tab"
              onClick={() => setActiveSection(section.id)}
              onKeyDown={(event) => selectAdjacentSection(event, index)}
              data-testid={`pdf-form-field-tab-${section.id}`}
            >
              <Icon size={15} aria-hidden />
              {section.label}
            </button>
          );
        })}
      </div>

      <section
        id="pdf-form-field-panel-general"
        role="tabpanel"
        aria-labelledby="pdf-form-field-tab-general"
        hidden={activeSection !== "general"}
        className={
          activeSection === "general"
            ? "grid min-h-[360px] content-start gap-3"
            : "hidden min-h-[360px] content-start gap-3"
        }
        data-testid="pdf-form-field-panel-general"
      >
      <label className={parts.field}>
        <span>{t("pdf.formField.fieldName")}</span>
        <input
          ref={nameInputRef}
          value={name}
          maxLength={127}
          onChange={(event) => setName(event.target.value)}
          readOnly={editing}
          disabled={busy}
          className={FIELD_CLASS}
          autoComplete="off"
          aria-describedby="pdf-form-field-name-help"
          data-testid="pdf-form-field-name"
        />
        <span
          id="pdf-form-field-name-help"
          className={parts.hint}
        >
          {editing
            ? t("pdf.formField.nameLockedHint")
            : t("pdf.formField.nameHierarchyHint")}
        </span>
      </label>

      {!isActionButton ? (
        <label className={parts.field}>
          <span>{t("pdf.formField.alternateName")}</span>
          <input
            value={alternateName}
            maxLength={MAX_FIELD_ALTERNATE_NAME_LENGTH}
            onChange={(event) => setAlternateName(event.target.value)}
            className={FIELD_CLASS}
            autoComplete="off"
            aria-describedby="pdf-form-field-alternate-name-help"
            data-testid="pdf-form-field-alternate-name"
          />
          <span
            id="pdf-form-field-alternate-name-help"
            className={parts.hint}
          >
            {t("pdf.formField.alternateNameHint")}
          </span>
        </label>
      ) : null}

      {/* Who fills the field (ONLYOFFICE's form roles): anyone, one of the
          form's roles, or a new one named here. */}
      {!isActionButton ? (
        <div className={parts.field}>
          <label className="contents">
            <span>{t("pdf.formField.role")}</span>
            <select
              value={roleChoice}
              onChange={(event) => setRoleChoice(event.target.value)}
              className={FIELD_CLASS}
              data-testid="pdf-form-field-role"
            >
              <option value="">{t("pdf.formField.roleAnyone")}</option>
              {roleOptions.map((role) => (
                <option key={role.name} value={role.name}>{role.name}</option>
              ))}
              <option value={NEW_FORM_ROLE}>{t("pdf.formField.roleNew")}</option>
            </select>
          </label>
          {roleChoice === NEW_FORM_ROLE ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={newRoleName}
                maxLength={PDF_FORM_ROLE_MAX_NAME}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder={t("pdf.formField.roleNamePlaceholder")}
                aria-label={t("pdf.formField.roleName")}
                className="min-w-40 flex-1"
                autoComplete="off"
                data-testid="pdf-form-field-role-name"
              />
              <span role="radiogroup" aria-label={t("pdf.formField.roleColor")} className="flex gap-1">
                {PDF_FORM_ROLE_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={newRoleColor === color}
                    aria-label={color}
                    onClick={() => setNewRoleColor(color)}
                    className="size-6 rounded-full border border-black/20"
                    style={{ background: color, outline: newRoleColor === color ? "2px solid var(--pdf-chrome-ink, #0f172a)" : undefined, outlineOffset: 1 }}
                    data-testid={`pdf-form-field-role-color-${color.slice(1)}`}
                  />
                ))}
              </span>
            </div>
          ) : null}
          <span className={parts.hint}>{t("pdf.formField.roleHint")}</span>
        </div>
      ) : null}

        {!isActionButton || editing ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <FormFieldCheckbox
              checked={required}
              label={t("pdf.formField.required")}
              onCheckedChange={setRequired}
              testId="pdf-form-field-required"
            />
            <FormFieldCheckbox
              checked={readOnly}
              label={t("pdf.formField.readOnly")}
              onCheckedChange={setReadOnly}
              testId="pdf-form-field-read-only"
            />
          </div>
        ) : null}
      </section>

      <section
        id="pdf-form-field-panel-field"
        role="tabpanel"
        aria-labelledby="pdf-form-field-tab-field"
        hidden={activeSection !== "field"}
        className={
          activeSection === "field"
            ? "grid min-h-[360px] content-start gap-3"
            : "hidden min-h-[360px] content-start gap-3"
        }
        data-testid="pdf-form-field-panel-field"
      >

      {initialKind === "text" ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            {password ? (
              <div
                className={`${parts.hint} flex items-start gap-2`}
                role="note"
              >
                <LockKeyhole
                  className="mt-0.5 shrink-0"
                  size={16}
                  aria-hidden
                />
                <span>
                  {t("pdf.formField.passwordHint")}
                </span>
              </div>
            ) : (
              <label className={parts.field}>
                <span>{t("pdf.formField.initialValue")}</span>
                {multiline ? (
                  <textarea
                    value={defaultValue}
                    maxLength={4000}
                    onChange={(event) => setDefaultValue(event.target.value)}
                    className={`${FIELD_CLASS} min-h-20 resize-y py-2`}
                    data-testid="pdf-form-field-default-value"
                  />
                ) : (
                  <input
                    value={defaultValue}
                    maxLength={4000}
                    onChange={(event) => setDefaultValue(event.target.value)}
                    className={FIELD_CLASS}
                    data-testid="pdf-form-field-default-value"
                  />
                )}
              </label>
            )}
            {numberField(
              t("pdf.formField.maxLength"),
              maxLength,
              setMaxLength,
              0,
              1_000_000,
              "pdf-form-field-max-length",
              1,
            )}
          </div>
          {/* Acrobat's Format (Text Field Properties › Format) and
              ONLYOFFICE's special fields: the reader checks each entry, and
              the field carries the standard scripts every form reader runs. */}
          <div className="grid grid-cols-2 gap-3">
            <label className={parts.field}>
              <span>{t("pdf.formField.format.label")}</span>
              <select
                value={pdfFormFieldFormatChoice(format)}
                onChange={(event) => setFormat(pdfFormFieldFormatFor(event.target.value as PdfFormFieldFormatChoice))}
                // A field whose scripts are of another kind keeps them.
                disabled={editing && initialSelection?.draft.formatLocked === true}
                className={FIELD_CLASS}
                data-testid="pdf-form-field-format"
              >
                {PDF_FORM_FIELD_FORMAT_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>{t(`pdf.formField.format.${choice}`)}</option>
                ))}
              </select>
            </label>
            {format?.kind === "number" || format?.kind === "percent" ? (
              numberField(
                t("pdf.formField.format.decimals"),
                format.decimals,
                (decimals: number) => setFormat({ ...format, decimals: Math.max(0, Math.min(10, Math.round(decimals))) }),
                0,
                10,
                "pdf-form-field-format-decimals",
                1,
              )
            ) : format?.kind === "date" || format?.kind === "time" ? (
              <label className={parts.field}>
                <span>{t("pdf.formField.format.pattern")}</span>
                <select
                  value={format.pattern}
                  onChange={(event) => setFormat(
                    format.kind === "date"
                      ? { kind: "date", pattern: event.target.value as (typeof PDF_FIELD_DATE_PATTERNS)[number] }
                      : { kind: "time", pattern: event.target.value as (typeof PDF_FIELD_TIME_PATTERNS)[number] },
                  )}
                  className={FIELD_CLASS}
                  data-testid="pdf-form-field-format-pattern"
                >
                  {(format.kind === "date" ? PDF_FIELD_DATE_PATTERNS : PDF_FIELD_TIME_PATTERNS).map((pattern) => (
                    <option key={pattern} value={pattern}>{pattern}</option>
                  ))}
                </select>
              </label>
            ) : format?.kind === "mask" ? (
              <label className={parts.field}>
                <span>{t("pdf.formField.format.maskValue")}</span>
                <input
                  value={format.mask}
                  maxLength={64}
                  onChange={(event) => setFormat({ kind: "mask", mask: event.target.value })}
                  className={FIELD_CLASS}
                  data-testid="pdf-form-field-format-mask"
                />
              </label>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={parts.field}>
              <span>{t("pdf.formField.textAlignment")}</span>
              <select
                value={alignment}
                onChange={(event) =>
                  setAlignment(event.target.value as PdfTextFieldAlignment)
                }
                className={FIELD_CLASS}
                data-testid="pdf-form-field-alignment"
              >
                <option value="left">{t("pdf.formField.alignLeft")}</option>
                <option value="center">{t("pdf.formField.alignCenter")}</option>
                <option value="right">{t("pdf.formField.alignRight")}</option>
              </select>
            </label>
            {numberField(
              t("pdf.formField.fontSize"),
              fontSize,
              setFontSize,
              0,
              ACROFORM_MAX_TEXT_FONT_SIZE,
              "pdf-form-field-font-size",
            )}
          </div>
          <div className="grid grid-cols-2 gap-3" data-form-section="appearance">
            {colorField(
              t("pdf.formField.textColor"),
              t("pdf.formField.chooseTextColor"),
              textColor,
              setTextColor,
              textColorPaletteOpen,
              setTextColorPaletteOpen,
              "pdf-form-field-text-color",
              textColorAnchorRef,
            )}
            {colorField(
              t("pdf.formField.fillColor"),
              t("pdf.formField.chooseFillColor"),
              backgroundColor,
              setBackgroundColor,
              backgroundColorPaletteOpen,
              setBackgroundColorPaletteOpen,
              "pdf-form-field-background-color",
              backgroundColorAnchorRef,
              t("pdf.formField.noFill"),
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {colorField(
              t("pdf.formField.borderColor"),
              t("pdf.formField.chooseBorderColor"),
              borderColor,
              setBorderColor,
              borderColorPaletteOpen,
              setBorderColorPaletteOpen,
              "pdf-form-field-border-color",
              borderColorAnchorRef,
              t("pdf.formField.noColor"),
            )}
            {numberField(
              t("pdf.formField.borderWidth"),
              borderWidth,
              setBorderWidth,
              0,
              ACROFORM_MAX_WIDGET_BORDER_WIDTH,
              "pdf-form-field-border-width",
            )}
          </div>
          <label className={parts.field}>
            <span>{t("pdf.formField.fieldVisibility")}</span>
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as PdfTextFieldVisibility)
              }
              className={FIELD_CLASS}
              data-testid="pdf-form-field-visibility"
            >
              <option value="visible">
                {t("pdf.formField.visibilityVisible")}
              </option>
              <option value="screenOnly">
                {t("pdf.formField.visibilityNoPrint")}
              </option>
              <option value="printOnly">
                {t("pdf.formField.visibilityPrintOnly")}
              </option>
              <option value="hidden">{t("pdf.formField.visibilityHidden")}</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-x-5 gap-y-2" data-form-section="options">
            <FormFieldCheckbox
              checked={multiline}
              label={t("pdf.formField.allowMultipleLines")}
              onCheckedChange={(next) => {
                setMultiline(next);
                if (next) {
                  setPassword(false);
                  setComb(false);
                }
              }}
              testId="pdf-form-field-multiline"
            />
            <FormFieldCheckbox
              checked={password}
              label={t("pdf.formField.passwordField")}
              onCheckedChange={(next) => {
                setPassword(next);
                if (next) {
                  setMultiline(false);
                  setComb(false);
                  setDefaultValue("");
                  setSpellCheck(false);
                }
              }}
              testId="pdf-form-field-password"
            />
            <FormFieldCheckbox
              checked={comb}
              label={t("pdf.formField.combField")}
              onCheckedChange={(next) => {
                setComb(next);
                if (next) {
                  setMultiline(false);
                  setPassword(false);
                  if (maxLength < 1) setMaxLength(6);
                }
              }}
              testId="pdf-form-field-comb"
            />
            <FormFieldCheckbox
              checked={spellCheck}
              className={`text-xs font-medium ${
                password ? parts.hint : ""
              }`}
              disabled={password}
              label={t("pdf.formField.allowSpellChecking")}
              onCheckedChange={setSpellCheck}
              testId="pdf-form-field-spellcheck"
            />
            <FormFieldCheckbox
              checked={scrollable}
              label={t("pdf.formField.allowContentScrolling")}
              onCheckedChange={setScrollable}
              testId="pdf-form-field-scrollable"
            />
          </div>
        </div>
      ) : initialKind === "checkbox" ? (
        <label className={parts.field}>
          <span>{t("pdf.formField.checkedExportValue")}</span>
          <input
            value={exportValue}
            maxLength={128}
            onChange={(event) => setExportValue(event.target.value)}
            className={FIELD_CLASS}
            autoComplete="off"
            data-testid="pdf-form-field-export-value"
          />
        </label>
      ) : initialKind === "resetButton" ||
        initialKind === "printButton" ||
        initialKind === "navigationButton" ||
        initialKind === "viewButton" ||
        initialKind === "saveButton" ||
        initialKind === "goToPageButton" ||
        initialKind === "webLinkButton" ? (
        <div className="grid gap-3">
          {initialKind === "navigationButton" ? (
            <label className={parts.field}>
              <span>{t("pdf.formField.navigationAction")}</span>
              <select
                value={navigationAction}
                onChange={(event) => {
                  const nextAction = event.target
                    .value as PdfNavigationButtonAction;
                  const priorDefault = navigationActionLabel(
                    navigationAction,
                    t,
                  );
                  setNavigationAction(nextAction);
                  setButtonLabel((current) =>
                    current === priorDefault
                      ? navigationActionLabel(nextAction, t)
                      : current,
                  );
                }}
                className={FIELD_CLASS}
                data-form-section="actions"
                data-testid="pdf-form-field-navigation-action"
              >
                {NAVIGATION_BUTTON_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {navigationActionLabel(action, t)}
                  </option>
                ))}
              </select>
            </label>
          ) : initialKind === "viewButton" ? (
            <label className={parts.field}>
              <span>{t("pdf.formField.viewAction")}</span>
              <select
                value={viewAction}
                onChange={(event) => {
                  const nextAction = event.target.value as PdfViewCommandAction;
                  const priorDefault = viewActionLabel(viewAction, t);
                  setViewAction(nextAction);
                  setButtonLabel((current) =>
                    current === priorDefault
                      ? viewActionLabel(nextAction, t)
                      : current,
                  );
                }}
                className={FIELD_CLASS}
                data-testid="pdf-form-field-view-action"
              >
                {VIEW_BUTTON_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {viewActionLabel(action, t)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {initialKind === "webLinkButton" ? (
            <label className={parts.field}>
              <span>{t("pdf.formField.webAddress")}</span>
              <input
                type="url"
                inputMode="url"
                value={buttonUrl}
                maxLength={PDF_LINK_OVERLAY_MAX_URL}
                onChange={(event) => setButtonUrl(event.target.value)}
                className={FIELD_CLASS}
                autoComplete="url"
                placeholder="https://example.com"
                data-testid="pdf-form-field-web-link-url"
              />
            </label>
          ) : null}
          <label className={parts.field}>
            <span>{t("pdf.formField.buttonLabel")}</span>
            <input
              value={buttonLabel}
              maxLength={512}
              onChange={(event) => setButtonLabel(event.target.value)}
              className={FIELD_CLASS}
              autoComplete="off"
              data-testid="pdf-form-field-reset-button-label"
            />
          </label>
          <div
            className={`${parts.hint} flex items-start gap-2`}
            role="note"
            data-testid="pdf-form-field-action-button-note"
          >
            {initialKind === "printButton" ? (
              <Printer className="mt-0.5 shrink-0" size={18} aria-hidden />
            ) : initialKind === "navigationButton" ? (
              <span className="mt-0.5 shrink-0">
                <NavigationActionIcon action={navigationAction} size={18} />
              </span>
            ) : initialKind === "viewButton" ? (
              <span className="mt-0.5 shrink-0">
                <ViewActionIcon action={viewAction} size={18} />
              </span>
            ) : initialKind === "saveButton" ? (
              <Save className="mt-0.5 shrink-0" size={18} aria-hidden />
            ) : initialKind === "goToPageButton" ? (
              <Hash className="mt-0.5 shrink-0" size={18} aria-hidden />
            ) : initialKind === "webLinkButton" ? (
              <ExternalLink
                className="mt-0.5 shrink-0"
                size={18}
                aria-hidden
              />
            ) : (
              <RotateCcw className="mt-0.5 shrink-0" size={18} aria-hidden />
            )}
            <span>
              {initialKind === "printButton"
                ? t("pdf.formField.printButtonHint")
                : initialKind === "navigationButton"
                  ? t("pdf.formField.navigationButtonHint")
                  : initialKind === "viewButton"
                    ? t("pdf.formField.viewButtonHint")
                    : initialKind === "saveButton"
                      ? t("pdf.formField.saveButtonHint")
                      : initialKind === "goToPageButton"
                        ? t("pdf.formField.goToPageButtonHint")
                        : initialKind === "webLinkButton"
                          ? t("pdf.formField.webLinkButtonHint")
                  : t("pdf.formField.resetButtonHint")}
            </span>
          </div>
        </div>
      ) : initialKind === "signature" ? (
        <div
          className={`${parts.hint} flex items-start gap-2`}
          role="note"
          data-testid="pdf-form-field-signature-note"
        >
          <Signature className="mt-0.5 shrink-0" size={18} aria-hidden />
          <span>
            {t("pdf.formField.signatureHint")}
          </span>
        </div>
      ) : initialKind === "imageField" ? (
        <div
          className={`${parts.hint} flex items-start gap-2`}
          role="note"
          data-testid="pdf-form-field-image-note"
        >
          <ImageIcon className="mt-0.5 shrink-0" size={18} aria-hidden />
          <span>
            {t("pdf.formField.imageFieldHint")}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className={parts.field}>
            <span>{t("pdf.formField.optionsList")}</span>
            <textarea
              value={optionsText}
              maxLength={51_399}
              onChange={(event) => setOptionsText(event.target.value)}
              className={`${FIELD_CLASS} min-h-24 resize-y py-2`}
              data-testid="pdf-form-field-options"
            />
          </label>
          <label className={`${parts.field} content-start`}>
            <span>{t("pdf.formField.initialSelection")}</span>
            {initialKind === "dropdown" || initialKind === "radio" ? (
              <select
                value={defaultValue}
                onChange={(event) => setDefaultValue(event.target.value)}
                className={FIELD_CLASS}
                data-testid={
                  initialKind === "radio"
                    ? "pdf-form-field-radio-selection"
                    : "pdf-form-field-default-option"
                }
              >
                <option value="">{t("pdf.formField.none")}</option>
                {choiceOptions.map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : multiselect ? (
              <select
                multiple
                size={6}
                value={selectedValues}
                onChange={(event) =>
                  setSelectedValues(
                    Array.from(event.target.selectedOptions, (option) =>
                      option.value,
                    ),
                  )
                }
                className={`${FIELD_CLASS} min-h-28 py-1`}
                data-testid="pdf-form-field-selected-options"
              >
                {choiceOptions.map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedValues[0] ?? ""}
                onChange={(event) =>
                  setSelectedValues(
                    event.target.value ? [event.target.value] : [],
                  )
                }
                className={FIELD_CLASS}
                data-testid="pdf-form-field-selected-options"
              >
                <option value="">{t("pdf.formField.none")}</option>
                {choiceOptions.map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
            <span className={parts.hint}>
              {initialKind === "radio"
                ? t("pdf.formField.radioOptionsHint")
                : t("pdf.formField.choiceOptionsHint")}
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        {initialKind === "checkbox" ? (
          <FormFieldCheckbox
            checked={checked}
            label={t("pdf.formField.initiallyChecked")}
            onCheckedChange={setChecked}
            testId="pdf-form-field-initially-checked"
          />
        ) : null}
        {initialKind === "dropdown" ? (
          <FormFieldCheckbox
            checked={editable}
            label={t("pdf.formField.allowCustomText")}
            onCheckedChange={setEditable}
            testId="pdf-form-field-editable"
          />
        ) : null}
        {initialKind === "listbox" ? (
          <FormFieldCheckbox
            checked={multiselect}
            label={t("pdf.formField.allowMultipleSelection")}
            onCheckedChange={(next) => {
              setMultiselect(next);
              if (!next) {
                setSelectedValues((current) => current.slice(0, 1));
              }
            }}
            testId="pdf-form-field-multiselect"
          />
        ) : null}
        {initialKind === "radio" ? (
          <FormFieldCheckbox
            checked={offToggleable}
            label={t("pdf.formField.allowClearingSelection")}
            onCheckedChange={setOffToggleable}
            testId="pdf-form-field-off-toggleable"
          />
        ) : null}
      </div>
      </section>

      <section
        id="pdf-form-field-panel-position"
        role="tabpanel"
        aria-labelledby="pdf-form-field-tab-position"
        hidden={activeSection !== "position"}
        className={
          activeSection === "position"
            ? "grid min-h-[360px] content-start gap-3"
            : "hidden min-h-[360px] content-start gap-3"
        }
        data-testid="pdf-form-field-panel-position"
      >
      <fieldset className={`${parts.group} grid gap-3`}>
        <legend className={parts.sectionTitle}>
          {t("pdf.formField.placement")}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {numberField(
            t("pdf.formField.placementPage"),
            page,
            setPage,
            1,
            Math.max(totalPages, 1),
            "pdf-form-field-page",
            1,
          )}
          {numberField(t("pdf.formField.placementLeft"), x, setX, 0, 100, "pdf-form-field-x")}
          {numberField(t("pdf.formField.placementTop"), y, setY, 0, 100, "pdf-form-field-y")}
          {numberField(t("pdf.formField.placementWidth"), width, setWidth, 0, 100, "pdf-form-field-width")}
          {numberField(t("pdf.formField.placementHeight"), height, setHeight, 0, 100, "pdf-form-field-height")}
          {numberField(
            t("pdf.formField.tabOrder"),
            manualTabOrder,
            setManualTabOrder,
            1,
            MAX_NATIVE_PDF_FORM_TAB_ORDER,
            "pdf-form-field-tab-order",
            1,
          )}
        </div>
        <div
          className={`${parts.well} relative flex h-40 items-center justify-center overflow-hidden p-2`}
          style={{ containerType: "size" }}
          data-chrome-preview=""
          role="img"
          aria-label={
            initialKind === "text" && password
              ? t("pdf.formField.previewPassword")
              : initialKind === "text" && comb
                ? t("pdf.formField.previewComb")
              : t("pdf.formField.previewField")
          }
          data-testid="pdf-form-field-placement-preview"
        >
          <div
            className="relative shrink-0 border border-border bg-background"
            style={{
              width: `min(100cqw, calc(100cqh * ${previewPageRatio}))`,
              height: `min(100cqh, calc(100cqw / ${previewPageRatio}))`,
            }}
            data-page-ratio={previewPageRatio}
            data-testid="pdf-form-field-placement-preview-page"
          >
          {!geometryInvalid ? (
            <span
              className="absolute flex items-center justify-center rounded-sm border-2 border-dashed border-primary bg-primary/10 text-primary"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${width}%`,
                height: `max(2px, ${height}%)`,
                ...(initialKind === "text" && comb && maxLength > 0
                  ? {
                      backgroundImage:
                        "linear-gradient(to right, transparent calc(100% - 1px), currentColor calc(100% - 1px))",
                      backgroundSize: `${100 / maxLength}% 100%`,
                    }
                  : {}),
              }}
            >
              {initialKind === "text" ? (
                <span className="flex min-w-0 items-center gap-1 px-1 text-[9px] font-medium">
                  {password ? (
                    <>
                      <LockKeyhole size={12} aria-hidden />
                      <span aria-hidden>••••••</span>
                    </>
                  ) : (
                    <span
                      className={
                        multiline
                          ? "line-clamp-3 whitespace-pre-wrap text-left"
                          : comb
                            ? "truncate font-mono tracking-widest"
                            : "truncate"
                      }
                    >
                      {defaultValue || name}
                    </span>
                  )}
                </span>
              ) : initialKind === "checkbox" && checked ? (
                <Check size={12} strokeWidth={2} aria-hidden />
              ) : initialKind === "dropdown" ? (
                <>
                  <span className="min-w-0 flex-1 truncate px-1 text-[10px]">
                    {defaultValue || t("pdf.formField.noSelection")}
                  </span>
                  <ChevronDown
                    size={14}
                    strokeWidth={1.75}
                    className="mr-1 shrink-0"
                    aria-hidden
                  />
                </>
              ) : initialKind === "listbox" ? (
                <span className="grid h-full w-full content-start gap-px overflow-hidden p-1 text-[9px] leading-tight">
                  {choiceOptions.slice(0, 5).map((option, index) => (
                    <span
                      key={`${option}-${index}`}
                      className={
                        selectedValues.includes(option)
                          ? "truncate rounded-sm bg-primary/20 px-1"
                          : "truncate px-1"
                      }
                    >
                      {option}
                    </span>
                  ))}
                </span>
              ) : initialKind === "radio" ? (
                <span className="grid h-full w-full content-center gap-1 overflow-hidden p-1 text-[9px] leading-tight">
                  {choiceOptions.slice(0, 5).map((option, index) => (
                    <span
                      key={`${option}-${index}`}
                      className="flex min-w-0 items-center gap-1"
                    >
                      <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-primary">
                        {defaultValue === option ? (
                          <span className="size-1.5 rounded-full bg-primary" />
                        ) : null}
                      </span>
                      <span className="truncate">{option}</span>
                    </span>
                  ))}
                </span>
              ) : initialKind === "signature" ? (
                <span className="flex min-w-0 items-center gap-1 px-1 text-[9px] font-medium">
                  <Signature size={12} aria-hidden />
                  <span className="truncate">
                    {t("pdf.formField.signHere")}
                  </span>
                </span>
              ) : initialKind === "imageField" ? (
                <span className="flex min-w-0 items-center gap-1 px-1 text-[9px] font-medium">
                  <ImageIcon size={12} aria-hidden />
                  <span className="truncate">
                    {t("pdf.formField.imageFieldPlaceholder")}
                  </span>
                </span>
              ) : initialKind === "resetButton" ||
                initialKind === "printButton" ||
                initialKind === "navigationButton" ||
                initialKind === "viewButton" ||
                initialKind === "saveButton" ||
                initialKind === "goToPageButton" ||
                initialKind === "webLinkButton" ? (
                <span className="flex min-w-0 items-center gap-1 px-1 text-[9px] font-medium">
                  {initialKind === "printButton" ? (
                    <Printer size={12} aria-hidden />
                  ) : initialKind === "navigationButton" ? (
                    <NavigationActionIcon
                      action={navigationAction}
                      size={12}
                    />
                  ) : initialKind === "viewButton" ? (
                    <ViewActionIcon action={viewAction} size={12} />
                  ) : initialKind === "saveButton" ? (
                    <Save size={12} aria-hidden />
                  ) : initialKind === "goToPageButton" ? (
                    <Hash size={12} aria-hidden />
                  ) : initialKind === "webLinkButton" ? (
                    <ExternalLink size={12} aria-hidden />
                  ) : (
                    <RotateCcw size={12} aria-hidden />
                  )}
                  <span className="truncate">{buttonLabel}</span>
                </span>
              ) : null}
            </span>
          ) : null}
          </div>
        </div>
      </fieldset>
      </section>

      {problems.length > 0 ||
      geometryInvalid ||
      valueTooLong ||
      choiceConfigurationInvalid ||
      radioNameConflict ||
      radioConfigurationInvalid ||
      actionButtonLabelInvalid ||
      navigationActionInvalid ||
      viewActionInvalid ||
      buttonUrlInvalid ? (
        <div
          className={parts.message}
          role="alert"
          data-testid="pdf-form-field-authoring-error"
        >
          {radioNameConflict
            ? t("pdf.formField.errorRadioName")
            : radioConfigurationInvalid
              ? t("pdf.formField.errorRadioOptions")
              : actionButtonLabelInvalid
                ? t("pdf.formField.errorButtonLabel")
                : navigationActionInvalid
                  ? t("pdf.formField.errorNavigationAction")
                  : viewActionInvalid
                    ? t("pdf.formField.errorViewAction")
                    : buttonUrlInvalid
                      ? t("pdf.formField.errorWebAddress")
                      : problems.length > 0
                        ? problemText(problems[0], t)
                        : choiceConfigurationInvalid
                          ? t("pdf.formField.errorChoiceOptions")
                          : valueTooLong
                            ? t("pdf.formField.errorDefaultTooLong")
                            : t("pdf.formField.errorRectangle")}
        </div>
      ) : submitError ? (
        <div
          className={parts.message}
          role="alert"
          data-tone="error"
          data-testid="pdf-form-field-authoring-submit-error"
        >
          {submitError}
        </div>
      ) : null}
    </>
  );
  // Docked (a field being edited, ONLYOFFICE's form settings at the right):
  // the same sections in a task pane beside the page, Apply writing them.
  if (docked && editing) {
    if (!open) return null as unknown as React.JSX.Element;
    return (
      <OfficeTaskPaneDockSlot dock={docked} id="form-field-properties">
        <OfficeTaskPane
          title={dialogTitle}
          closeLabel={t("pdf.formField.cancel")}
          onClose={onCancel}
          closeClassName={PDF_TASK_PANE_CLOSE_CLASS}
          testIdPrefix="pdf-form-field-pane"
          dockRight={false}
          className={pdfTaskPaneClassName("pdf-viewer__form-field-pane")}
        >
          <div className={`${PDF_TASK_PANE_BODY_CLASS} office-dialog pdf-viewer__form-field-pane-body`}>
            {content}
            <div className="pdf-viewer__form-field-pane-actions">
              <button
                type="button"
                className={parts.button}
                data-variant="primary"
                disabled={!canApply || busy}
                onClick={apply}
                data-testid="pdf-form-field-pane-apply"
              >
                {busy ? t("pdf.formField.saving") : nativeAuthoring ? t("pdf.formField.saveToOriginal") : t("pdf.formField.saveField")}
              </button>
            </div>
          </div>
        </OfficeTaskPane>
      </OfficeTaskPaneDockSlot>
    );
  }

  return (
    <OfficeDialogShell
      open={open}
      title={dialogTitle}
      description={dialogDescription}
      defaultActionLabel={
        nativeAuthoring
          ? editing
            ? t("pdf.formField.saveToOriginal")
            : t("pdf.formField.createInOriginal")
          : editing
            ? t("pdf.formField.saveField")
            : t("pdf.formField.createField")
      }
      cancelActionLabel={t("pdf.formField.cancel")}
      onDefaultAction={apply}
      onCancel={onCancel}
      defaultActionDisabled={!canApply}
      busy={busy}
      busyActionLabel={t("pdf.formField.saving")}
      initialFocusRef={nameInputRef}
      returnFocusRef={returnFocusRef}
      container={container}
      className="max-h-[calc(100vh-48px)] overflow-y-auto sm:max-w-[760px]"
      testIdPrefix="pdf-form-field-authoring"
    >
{content}
    </OfficeDialogShell>
  );
}
