/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mrnote/core/web/styles/globals.css";
import "@mrnote/core/web/styles/surface-motion.css";
import "@mrnote/core/web/styles/press-feedback.css";
// the editors' window layout (ribbon, canvas, rails, status bar), which MR
// Note's workspace imports beside them
import "@mrnote/core/web/styles/native-page-window.css";
import "./playground.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
