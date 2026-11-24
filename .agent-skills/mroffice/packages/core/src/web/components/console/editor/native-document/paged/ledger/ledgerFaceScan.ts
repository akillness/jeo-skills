/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
let looks = 0;
const unloadedAt = new WeakMap<FontFace, number>();

/** A look at the document's faces right after a measurement: its number. */
export function noteFacesAfterMeasure(doc: Document): number {
  looks += 1;
  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && typeof fonts.forEach === "function") {
    fonts.forEach((face) => {
      if (face.status === "unloaded") unloadedAt.set(face, looks);
    });
  }
  return looks;
}

/**
 * What a face arrival can have changed. `through`: the last look before any
 * of `faces` seen unloaded was asked for (a measurement numbered at most this
 * was made without them; Infinity when none was seen unloaded). `fresh`: the
 * faces never seen unloaded: added already loading (an asset registered with
 * its data, a subset asked for before the first look), which text of their
 * family measured before was drawn without, whenever it was measured.
 */
export function faceArrivalBound(faces: ReadonlyArray<object>): { through: number; fresh: object[] } {
  let through = Number.POSITIVE_INFINITY;
  const fresh: object[] = [];
  for (const face of faces) {
    const at = unloadedAt.get(face as FontFace);
    if (at === undefined) fresh.push(face);
    else through = Math.min(through, at);
  }
  return { through, fresh };
}

/** `window.__docsFaceArrivalSince = false`: a face's arrival voids as before
 * (every page drawing its characters; a whole face, everything). */
export function faceArrivalSince(win: Window | null | undefined): boolean {
  return (win as (Window & { __docsFaceArrivalSince?: boolean }) | null | undefined)?.__docsFaceArrivalSince !== false;
}
