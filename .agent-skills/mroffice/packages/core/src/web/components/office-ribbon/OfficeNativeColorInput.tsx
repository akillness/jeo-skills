"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";

export interface OfficeNativeColorInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "defaultValue" | "onChange" | "onInput"
  > {
  /** `#rrggbb` the picker opens on. */
  readonly value: string;
  /** The chosen colour, once per pick. */
  readonly onCommit: (color: string) => void;
  /** Every adjustment made inside the open picker. */
  readonly onPreview?: (color: string) => void;
}

/**
 * The colour field behind Office's "More Colors…". On a desktop pointer its
 * activation opens the product's colour picker (NativeFieldPopups →
 * ColorPickerPopover), which reports like the browser's own picker does; on
 * touch the browser's picker opens.
 *
 * WebKit and Chromium send `input` for every adjustment inside their picker (a
 * click in the saturation square, a hue drag, a typed R, G or B) and `change`
 * once, when the picker closes. React's onChange fires on both, so hosts that
 * applied the colour and closed their menu there tore the picker down on the
 * first click inside it: in Safari the popover under "Custom text color"
 * vanished after one click, and every adjustment was an undo step of its own.
 * Word applies a More Colors choice once, when the Colors dialog is confirmed
 * (Word for Mac shows the system colour picker for it).
 *
 * Here an adjustment is only a preview; the colour is committed once, on the
 * native `change`, or, when the host is closed (a click outside) while the
 * picker still holds an adjustment the browser has not reported as a change,
 * as the input goes away. The input is uncontrolled while a pick is open: a
 * controlled value would be written back after each adjustment, and Chromium
 * moves an open picker to a value set from script.
 */
export const OfficeNativeColorInput = forwardRef<
  HTMLInputElement,
  OfficeNativeColorInputProps
>(function OfficeNativeColorInput({ value, onCommit, onPreview, ...rest }, ref) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const commitRef = useRef(onCommit);
  const previewRef = useRef(onPreview);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    commitRef.current = onCommit;
    previewRef.current = onPreview;
  });

  useEffect(() => {
    const input = inputRef.current;
    if (!input || pendingRef.current !== null || input.value === value) return;
    input.value = value;
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const handleInput = () => {
      pendingRef.current = input.value;
      previewRef.current?.(input.value);
    };
    const handleChange = () => {
      pendingRef.current = null;
      commitRef.current(input.value);
    };
    input.addEventListener("input", handleInput);
    input.addEventListener("change", handleChange);
    return () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("change", handleChange);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) commitRef.current(pending);
    };
  }, []);

  return <input {...rest} ref={inputRef} type="color" defaultValue={value} />;
});
