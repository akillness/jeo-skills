/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * MR Office Editors' entry: with the MR Office component installed
 * (src/component.ts), the MR Office desktop app's own shell (src/classic/);
 * without it, the open-source editors on their own (src/editors/), which say
 * where the free component is. Decided before either is loaded.
 */

import path from "node:path";
import { app } from "electron";

import { CHECKER_PROCESS_FLAG } from "./classic/vibe-checker-process";
import { componentCandidates, findComponent, setComponentState, shellContract } from "./component";

// --user-data-dir=<folder>: another data folder (and so another single
// instance), for trying a build beside one in use.
const dataArgument = process.argv.find((argument) => argument.startsWith("--user-data-dir="));
if (dataArgument) app.setPath("userData", path.resolve(dataArgument.slice("--user-data-dir=".length)));

// The shell's own helper process (the AI's window checker, src/classic/
// vibe-checker-process.ts) starts this executable again with a flag of its
// own: it is the component's, whatever this process would find.
const checkerProcess = process.argv.includes(CHECKER_PROCESS_FLAG);

const state = findComponent({
  candidates: componentCandidates({
    env: process.env.MROFFICE_COMPONENT_DIR,
    resourcesPath: app.isPackaged ? process.resourcesPath : null,
    userData: app.getPath("userData"),
  }),
  contract: shellContract(path.join(__dirname, "..")),
});
setComponentState(state);
if (state.kind !== "ready" && !checkerProcess) console.log(`[entry] the MR Office component is ${state.kind === "absent" ? "not installed" : `not usable: ${state.reason}`}; the open-source editors run on their own`);

if (state.kind === "ready" || checkerProcess) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./classic/entry");
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./editors/main");
}
