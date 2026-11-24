/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { officeDialogClassName } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import outputStyles from "./CodeOutputContent.module.css";

/**
 * The class list of a run output's root (CellOutput, a compiled PDF, a
 * compile's timeout note): the shared dialog chrome's tokens and parts in the
 * Code tone, without its card or its open/close motion
 * (CodeOutputContent.module.css `.chrome`).
 */
export const CODE_OUTPUT_CHROME_CLASS = `${officeDialogClassName({
  tone: "code",
})} office-dialog--embedded ${outputStyles.chrome}`;

export { outputStyles };
