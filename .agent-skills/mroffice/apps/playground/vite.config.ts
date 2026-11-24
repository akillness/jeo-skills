/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV === "development" ? "development" : "production"),
    // The editors read their settings from process.env at run time; the page
    // sets them (index.html), so they are not replaced at build time. A Web
    // Worker has no page script: there the object is made on first read.
    "process.env": '(globalThis.process ??= { env: { NODE_ENV: "production" } }).env',
  },
  resolve: {
    // One copy of each of these, whichever package imports it.
    dedupe: ["react", "react-dom", "yjs", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@tiptap/pm", "@tiptap/core", "pdfjs-dist"],
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 20_000,
    reportCompressedSize: false,
    sourcemap: false,
  },
  // On 127.0.0.1: the page is opened as http://localhost:5178 and Python's
  // sandbox page is served from http://127.0.0.1:5178, another origin.
  server: { host: "127.0.0.1", port: 5178 },
  preview: { host: "127.0.0.1", port: 5178 },
});
