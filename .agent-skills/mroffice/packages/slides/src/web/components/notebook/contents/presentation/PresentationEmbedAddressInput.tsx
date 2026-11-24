"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState } from "react";

import { normalizeEmbedKind, sanitizeEmbedUrl } from "@mrnote/core/web/lib/presentation-embed.ts";








export function PresentationEmbedAddressInput({
  kind,
  url,
  disabled,
  placeholder,
  onCommit,
}: {
  kind: unknown;
  url: string | undefined;
  disabled?: boolean;
  placeholder: string;
  onCommit: (url: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const addressFor = (typed: string) =>
    sanitizeEmbedUrl(typed, { kind: normalizeEmbedKind(kind), allowGenericIframe: true });
  const invalid = draft !== null && addressFor(draft) === null;
  return (
    <input
      value={draft ?? url ?? ""}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const typed = event.target.value;
        setDraft(typed);
        const address = addressFor(typed);
        if (address !== null && address !== url) onCommit(address);
      }}
      onBlur={() => setDraft(null)}
      placeholder={placeholder}
      data-testid="presentation-embed-url"
    />
  );
}
