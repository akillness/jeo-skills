/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import numberStyles from "../../office-ribbon/OfficeRibbonNumberField.module.css";

import homeStyles from "./DocumentHomeRibbon.module.css";

function classes(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/**
 * Docs-wide physical value input skin.
 *
 * It deliberately carries the same shared Office input class and the same
 * `layoutValueInput` adapter class used by Layout > Paragraph. Callers keep
 * their existing state, validation and labels; this helper changes only the
 * visual face and its roomy dialog geometry.
 */
export function documentValueInputClassName(
  existing?: string,
  options?: { inline?: boolean },
): string {
  return classes(
    numberStyles.input,
    homeStyles.layoutValueInput,
    homeStyles.layoutValueInputDialog,
    options?.inline ? homeStyles.layoutValueInputInline : undefined,
    existing,
  );
}
