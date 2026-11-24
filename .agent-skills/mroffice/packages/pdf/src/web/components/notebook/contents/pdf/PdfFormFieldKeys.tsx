"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Previous Field / Next Field on the on-screen keyboard's bar while a PDF
 * form field is being filled (lib/pdf/form-field-navigation): a phone's
 * keyboard has no Tab, and the fields of a form drawn to a phone's width
 * are a fingertip high. Only while the focus is in a field; the bar itself
 * (OfficeSoftKeyboardLayer) shows only while the keyboard is up.
 */

import { useCallback, useSyncExternalStore, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeSoftKeyboardKey } from "@mrnote/core/web/components/office-ribbon/OfficeSoftKeyboardLayer.tsx";
import { ChevronDown, ChevronUp } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { focusInPdfFormField, movePdfFormField } from "../../../../lib/pdf/form-field-navigation";

export function PdfFormFieldKeys({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const t = useTranslations("console-notebooks");
  // Whether the focus is in a field, read live (the bar mounts as the
  // keyboard comes up for the field already focused).
  const subscribe = useCallback(
    (onChange: () => void) => {
      const root = rootRef.current;
      root?.addEventListener("focusin", onChange);
      root?.addEventListener("focusout", onChange);
      return () => {
        root?.removeEventListener("focusin", onChange);
        root?.removeEventListener("focusout", onChange);
      };
    },
    [rootRef],
  );
  const inField = useSyncExternalStore(
    subscribe,
    () => (rootRef.current ? focusInPdfFormField(rootRef.current) : false),
    () => false,
  );
  if (!inField) return null;
  const move = (direction: 1 | -1) => {
    const root = rootRef.current;
    if (root) movePdfFormField(root, direction);
  };
  return (
    <>
      <OfficeSoftKeyboardKey name={t("forms.previous")} testId="pdf-soft-key-previous-field" onPress={() => move(-1)}>
        <ChevronUp size={18} />
      </OfficeSoftKeyboardKey>
      <OfficeSoftKeyboardKey name={t("forms.next")} testId="pdf-soft-key-next-field" onPress={() => move(1)}>
        <ChevronDown size={18} />
      </OfficeSoftKeyboardKey>
    </>
  );
}
