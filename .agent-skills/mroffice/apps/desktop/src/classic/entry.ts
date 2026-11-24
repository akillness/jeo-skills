/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The desktop apps' entry: the app itself (./main), or, when the app starts
 * its own executable again for it, the window checker's process
 * (./vibe-checker-process): one or the other, never both, decided before
 * either is loaded.
 */

import { CHECKER_PROCESS_FLAG } from "./vibe-checker-process";

if (process.argv.includes(CHECKER_PROCESS_FLAG)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("./vibe-checker-process") as typeof import("./vibe-checker-process")).runVibeCheckerProcess();
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main");
}
