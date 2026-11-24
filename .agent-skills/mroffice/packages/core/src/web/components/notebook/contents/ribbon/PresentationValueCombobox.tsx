/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * THIN ADAPTER over the shared RibbonValueCombobox
 * (office-ribbon/RibbonValueCombobox — the audit's positive example:
 * "抽出来就是为了让…是同一个控件而不是仿品"). This file used to be a
 * simplified parallel implementation; it now renders the one shared control,
 * holding the draft/focus state the deck ribbon has no editor selection to
 * coordinate with. Props and testids unchanged for every call site.
 */

import { useState } from "react";

import { RibbonValueCombobox } from "../../../office-ribbon/RibbonValueCombobox";

export function PresentationValueCombobox({
  testId,
  label,
  placeholder,
  value,
  options,
  disabled,
  onCommit,
}: {
  testId: string;
  label: string;
  placeholder: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [, setFocused] = useState(false);
  return (
    <RibbonValueCombobox
      testId={testId}
      label={label}
      placeholder={placeholder}
      inputMode="decimal"
      value={draft ?? value}
      options={options.map((option) => ({ value: option, label: option }))}
      disabled={disabled}
      onDraftChange={setDraft}
      onFocusChange={(focused) => {
        setFocused(focused);
        if (!focused) setDraft(null);
      }}
      onRememberSelection={() => {}}
      onCommit={(next) => {
        setDraft(null);
        onCommit(next);
        return true;
      }}
    />
  );
}
