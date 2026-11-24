/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Which files the app opens, and where a save goes (src/editors/files.ts).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { editorExtension, isOpenablePath, openablePathsFromArgv, readOpenedFiles, safeFileName, saveTarget, writeFileAtomically } = require("../dist/editors/files.js");

test("the editors' files are opened, others are not", () => {
  for (const name of ["a.mrdoc", "b.MRSHEET", "c.mrslides", "e.csv", "f.tsv", "g.html", "h.md", "i.pdf", "j.mrdoc.json", "k.py"]) {
    assert.equal(isOpenablePath(`/tmp/${name}`), true, name);
  }
  for (const name of ["a.docx", "b.xlsx", "c.pptx", "d.exe", "noextension"]) assert.equal(isOpenablePath(`/tmp/${name}`), false, name);
  assert.equal(editorExtension("Report.MRDOC.json"), ".mrdoc.json");
});

test("documents among a process's arguments, resolved against its folder", () => {
  assert.deepEqual(openablePathsFromArgv(["--user-data-dir=/x", "notes.mrdoc", "/abs/table.csv", "-psn_0_1", "app.exe"], "/home/me"), [
    path.resolve("/home/me", "notes.mrdoc"),
    path.resolve("/abs/table.csv"),
  ]);
});

test("a save goes back into the file when the editor saves the same kind", () => {
  const docs = "/home/me/Documents";
  assert.deepEqual(saveTarget("/f/table.csv", "table.csv", { documentsFolder: docs }), { kind: "write", path: "/f/table.csv" });
  assert.deepEqual(saveTarget("/f/notes.mrdoc.json", "notes.mrdoc", { documentsFolder: docs }), { kind: "write", path: "/f/notes.mrdoc.json" });
  // the document editor opens HTML and saves its own format: never over the HTML
  assert.deepEqual(saveTarget("/f/page.html", "page.mrdoc", { documentsFolder: docs }), { kind: "ask", defaultPath: path.join("/f", "page.mrdoc") });
  // Save As, and a new file
  assert.deepEqual(saveTarget("/f/table.csv", "table.csv", { saveAs: true, documentsFolder: docs }), { kind: "ask", defaultPath: path.join("/f", "table.csv") });
  assert.deepEqual(saveTarget(null, "Workbook.mrsheet", { documentsFolder: docs }), { kind: "ask", defaultPath: path.join(docs, "Workbook.mrsheet") });
  // a name with folders in it is only a name
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName(".."), "Untitled");
});

test("files are read whole, and written whole or not at all", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "mroffice-editors-files-"));
  try {
    const file = path.join(folder, "t.csv");
    fs.writeFileSync(file, "a,b\n1,2\n");
    const { files, refused } = await readOpenedFiles([file, path.join(folder, "missing.csv"), path.join(folder, "x.docx")], () => "h1");
    assert.equal(files.length, 1);
    assert.equal(files[0].handle, "h1");
    assert.equal(Buffer.from(files[0].bytes).toString(), "a,b\n1,2\n");
    assert.deepEqual(refused.map((entry) => entry.reason), ["unreadable", "not-openable"]);

    assert.equal(await writeFileAtomically(file, new TextEncoder().encode("a,b\n1,2\n")), false, "the same bytes are not written again");
    assert.equal(await writeFileAtomically(file, new TextEncoder().encode("a,b\n3,4\n")), true);
    assert.equal(fs.readFileSync(file, "utf8"), "a,b\n3,4\n");
    assert.deepEqual(fs.readdirSync(folder), ["t.csv"], "no temporary file left");
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
