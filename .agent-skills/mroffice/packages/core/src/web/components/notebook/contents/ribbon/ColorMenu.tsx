/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "../../../../../host/next-intl";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../../ui/dropdown-menu";

export function PresentationSwatchGrid({
  colors,
  current,
  label,
  onPick,
  testPrefix,
  variant,
}: {
  colors: readonly string[];
  current: string | undefined;
  label: string;
  onPick: (color: string) => void;
  testPrefix: string;
  variant: "highlight" | "text";
}) {
  return (
    <div className="note-editor-office-toolbar__swatches" aria-label={label}>
      {colors.map((color) => (
        <SwatchButton
          key={color}
          active={current === color}
          color={color}
          label={`${label} ${color}`}
          onClick={() => onPick(color)}
          testId={`${testPrefix}-${color.slice(1)}`}
          variant={variant}
        />
      ))}
    </div>
  );
}

function SwatchButton({
  active,
  color,
  label,
  onClick,
  testId,
  variant,
}: {
  active?: boolean;
  color: string;
  label: string;
  onClick: () => void;
  testId?: string;
  variant: "highlight" | "text";
}) {
  const pointerHandledRef = useRef(false);
  const runFromPointer = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.button !== 0) return;
    pointerHandledRef.current = true;
    onClick();
  };
  const runFromKeyboard = () => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }
    onClick();
  };
  return (
    <button
      type="button"
      className={`note-editor-office-toolbar__swatch note-editor-office-toolbar__swatch--${variant}${
        active ? " is-active" : ""
      }`}
      style={{ backgroundColor: color }}
      onMouseDown={runFromPointer}
      onClick={runFromKeyboard}
      aria-label={label}
      aria-pressed={active === true}
      title={label}
      data-testid={testId}
    />
  );
}

/**
 * The 自定义 row, docs anatomy: the custom-color trigger swatch chip hosting
 * the native picker, plus a recents swatch row (session-scoped, like docs).
 * Same classes (`__custom-color`, `__swatch-chip`, `__color-input`) so the
 * shared skin dresses it identically.
 */
export function PresentationCustomColorItem({
  label,
  onPick,
  testId,
  value,
  variant = "text",
}: {
  label: string;
  onPick: (color: string) => void;
  testId: string;
  value: string;
  variant?: "highlight" | "text";
}) {
  const t = useTranslations("console-notebooks");
  const [recent, setRecent] = useState<string[]>([]);
  const commit = (color: string) => {
    // The same normalize gate docs runs: only canonical #rrggbb passes on.
    const normalized = /^#[0-9a-fA-F]{6}$/.test(color)
      ? color.toLowerCase()
      : null;
    if (!normalized) return;
    setRecent((prev) =>
      [normalized, ...prev.filter((item) => item !== normalized)].slice(0, 6),
    );
    onPick(normalized);
  };
  return (
    <div className="note-editor-office-toolbar__custom-color" data-testid={testId}>
      <label
        className="note-editor-office-toolbar__swatch note-editor-office-toolbar__custom-color-trigger"
        title={label}
      >
        <span
          className={`note-editor-office-toolbar__swatch-chip note-editor-office-toolbar__swatch-chip--${variant}`}
          style={{ backgroundColor: value }}
          aria-hidden
        />
        {label}
        <input
          type="color"
          className="note-editor-office-toolbar__color-input"
          value={value}
          onChange={(event) => commit(event.target.value)}
          aria-label={label}
        />
      </label>
      {recent.length > 0 ? (
        <div
          className="note-editor-office-toolbar__swatches"
          aria-label={t("office.colorMenu.recentColors")}
        >
          {recent.map((color) => (
            <button
              key={`recent-${color}`}
              type="button"
              className={`note-editor-office-toolbar__swatch note-editor-office-toolbar__swatch--${variant}`}
              style={{ backgroundColor: color }}
              onClick={() => onPick(color)}
              aria-label={`${label} ${color}`}
              title={color}
              data-testid={`${testId}-recent-${color.slice(1)}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ColorMenuClearItem({
  label,
  onClear,
  testId,
}: {
  label: string;
  onClear: () => void;
  testId: string;
}) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-testid={testId} onSelect={onClear}>
        {label}
      </DropdownMenuItem>
    </>
  );
}
