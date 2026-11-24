/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The first-page picture an Office file carries (src/classic/document-thumbnail.ts),
// read straight from its zip for the window's instant view.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { documentThumbnail, readZipMember, instantDocument, quickLookThumbnail } = require("../dist/classic/document-thumbnail.js");

/** A zip of these members, each stored or deflated (crc left 0: the reader does not check it). */
function zip(members) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data, deflate } of members) {
    const body = deflate ? zlib.deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("a deck's first-slide picture is read from its zip, stored or deflated; none when it has none", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mrai-thumb-"));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from("not really a jpeg").values(), 0xff, 0xd9]);
  const deck = path.join(dir, "deck.pptx");
  fs.writeFileSync(deck, zip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>"), deflate: true },
    { name: "ppt/slides/slide1.xml", data: Buffer.alloc(5000, 65), deflate: true },
    { name: "docProps/thumbnail.jpeg", data: jpeg, deflate: true },
  ]));
  assert.deepEqual(documentThumbnail(deck), { bytes: jpeg, type: "image/jpeg" });
  const stored = path.join(dir, "stored.pptx");
  fs.writeFileSync(stored, zip([{ name: "docProps/thumbnail.jpeg", data: jpeg }]));
  assert.deepEqual(readZipMember(stored, "docProps/thumbnail.jpeg"), jpeg);
  const plain = path.join(dir, "plain.pptx");
  fs.writeFileSync(plain, zip([{ name: "ppt/presentation.xml", data: Buffer.from("<p/>"), deflate: true }]));
  assert.equal(documentThumbnail(plain), null);
  const pdf = path.join(dir, "a.pdf");
  fs.writeFileSync(pdf, "%PDF-1.7");
  assert.equal(documentThumbnail(pdf), null);
  const broken = path.join(dir, "broken.pptx");
  fs.writeFileSync(broken, Buffer.from("PK not a zip at all"));
  assert.equal(documentThumbnail(broken), null);
  const huge = path.join(dir, "huge.pptx");
  fs.writeFileSync(huge, zip([{ name: "docProps/thumbnail.jpeg", data: Buffer.alloc(64), deflate: true }]));
  assert.equal(readZipMember(huge, "docProps/thumbnail.jpeg", 16), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the instant first page is offered only for the kinds the app opens", () => {
  for (const name of ["a.docx", "b.XLSX", "c.pptx", "d.pdf", "e.ppsx"]) assert.equal(instantDocument(`/x/${name}`), true, name);
  for (const name of ["a.doc", "b.key", "c.txt", "d.zip", "e"]) assert.equal(instantDocument(`/x/${name}`), false, name);
});

test("Quick Look's first page is read back from what qlmanage writes, and nothing on failure", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ql-"));
  const fake = path.join(dir, "qlmanage");
  // Writes <out>/<name>.png as qlmanage -t -s N -o out file does.
  fs.writeFileSync(fake, '#!/bin/sh\nprintf PNGDATA > "$5/$(basename "$6").png"\n', { mode: 0o755 });
  const picture = await quickLookThumbnail("/docs/report.docx", path.join(dir, "out"), { qlmanage: fake });
  assert.equal(picture.type, "image/png");
  assert.equal(picture.bytes.toString(), "PNGDATA");
  assert.equal(fs.existsSync(path.join(dir, "out", "report.docx.png")), false);
  const broken = path.join(dir, "broken");
  fs.writeFileSync(broken, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.equal(await quickLookThumbnail("/docs/report.docx", path.join(dir, "out"), { qlmanage: broken }), null);
});
