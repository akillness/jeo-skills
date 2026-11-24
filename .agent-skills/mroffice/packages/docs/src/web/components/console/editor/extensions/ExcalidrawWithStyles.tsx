"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Excalidraw with its stylesheet, loaded together only where a whiteboard
// shows (WhiteboardBlock imports this module dynamically). A plain import
// here, not import() of the .css: Turbopack cannot resolve a stylesheet
// imported as a dynamic module.
import "@excalidraw/excalidraw/index.css";

export { Excalidraw } from "@excalidraw/excalidraw";
