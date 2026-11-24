/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  officeVerifiedFontVariant,
  type OfficeFontVariant,
  type OfficeLegacyFontFace,
  type OfficeLocalFontRecord,
} from "./officeTypographyCatalog";
import { normalizeOfficeFontFace, type OfficeFontFace } from "./officeFontFace";

type ParsedFace = OfficeLegacyFontFace & {
  fullName: string;
  basePostscriptName: string;
  axes: Record<string, number>;
};
const styleKey = (value: string) =>
  value.toLowerCase().replace(/[\s_-]+/gu, "");

/** Bounded OpenType name/fvar reads. Supports Unicode and legacy Mac names,
 * TTC faces and named variable instances; never reads or persists glyph bytes.
 * Microsoft OpenType name IDs 1/2 retain four-style linking. Named instances
 * instead retain their native identity AND fvar coordinates, not guessed B/I. */
async function readNativeFace(
  blob: Blob,
  postscriptName: string,
  local?: OfficeLocalFontRecord,
  discoverStatic = false,
): Promise<ParsedFace | null> {
  try {
    const read = async (offset: number, length: number) => {
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        offset + length > blob.size
      )
        throw new Error("Font table bounds");
      return new DataView(
        await blob.slice(offset, offset + length).arrayBuffer(),
      );
    };
    const header = await read(0, 12);
    let offsets = [0];
    if (header.getUint32(0) === 0x74746366) {
      const count = header.getUint32(8);
      if (count < 1 || count > 128) return null;
      const directory = await read(12, count * 4);
      offsets = Array.from({ length: count }, (_, i) =>
        directory.getUint32(i * 4),
      );
    }
    if (discoverStatic && offsets.length !== 1) return null;
    for (const offset of offsets) {
      const face = await read(offset, 12);
      if (![0x00010000, 0x4f54544f, 0x74727565].includes(face.getUint32(0)))
        continue;
      const count = face.getUint16(4);
      if (count < 1 || count > 256) return null;
      const directory = await read(offset + 12, count * 16);
      const tables = new Map<number, { offset: number; length: number }>();
      for (let i = 0; i < count; i++) {
        const tag = directory.getUint32(i * 16);
        if (tables.has(tag)) return null;
        tables.set(tag, {
          offset: directory.getUint32(i * 16 + 8),
          length: directory.getUint32(i * 16 + 12),
        });
      }
      const nameTable = tables.get(0x6e616d65);
      if (!nameTable || nameTable.length < 6 || nameTable.length > 1_048_576)
        return null;
      const names = await read(nameTable.offset, nameTable.length);
      if (names.getUint16(0) > 1) return null;
      const records = names.getUint16(2),
        strings = names.getUint16(4);
      if (
        records > 2048 ||
        strings < 6 + records * 12 ||
        strings > nameTable.length
      )
        return null;
      const selected = new Map<
        number,
        { score: number; value: string; ambiguous: boolean }
      >();
      for (let i = 0; i < records; i++) {
        const start = 6 + i * 12,
          platform = names.getUint16(start),
          encoding = names.getUint16(start + 2),
          language = names.getUint16(start + 4),
          id = names.getUint16(start + 6);
        if (
          ![1, 2, 4, 6, 16, 17].includes(id) &&
          !(tables.has(0x66766172) && id >= 256)
        )
          continue;
        const mac = platform === 1 && encoding === 0 && language === 0;
        if (!(
          mac ||
          platform === 0 ||
          (platform === 3 && [0, 1, 10].includes(encoding))
        ))
          continue;
        const size = names.getUint16(start + 8),
          position = strings + names.getUint16(start + 10);
        if (
          size < 1 ||
          size > 1024 ||
          (!mac && size % 2) ||
          position + size > nameTable.length
        )
          return null;
        const value = new TextDecoder(mac ? "macintosh" : "utf-16be", {
          fatal: true,
        })
          .decode(new Uint8Array(names.buffer, position, size))
          .trim();
        const score =
          platform === 3 && language === 0x0409
            ? 4
            : platform === 0
              ? 3
              : mac
                ? 2
                : 1;
        const previous = selected.get(id);
        if (!previous || score > previous.score)
          selected.set(id, { score, value, ambiguous: false });
        else if (previous.score === score && previous.value !== value)
          previous.ambiguous = true;
      }
      const name = (id: number) => {
        const record = selected.get(id);
        return record &&
          !record.ambiguous &&
          record.value &&
          !/[\u0000-\u001f\u007f<>;{}\\"']/u.test(record.value)
          ? record.value
          : null;
      };
      const family = name(1),
        style = name(2),
        basePostscriptName = name(6);
      if (!family || !style || !basePostscriptName) continue;
      let axes: Record<string, number> = {};
      const fvarTable = tables.get(0x66766172);
      if (discoverStatic) {
        if (fvarTable) return null;
        postscriptName = basePostscriptName;
      }
      if (fvarTable) {
        if (!local || fvarTable.length < 16 || fvarTable.length > 1_048_576)
          continue;
        const fvar = await read(fvarTable.offset, fvarTable.length);
        if (fvar.getUint16(0) !== 1) return null;
        const start = fvar.getUint16(4),
          axisCount = fvar.getUint16(8),
          axisSize = fvar.getUint16(10),
          instanceCount = fvar.getUint16(12),
          instanceSize = fvar.getUint16(14);
        if (
          axisCount < 1 ||
          axisCount > 16 ||
          axisSize < 20 ||
          instanceCount > 1024 ||
          instanceSize < 4 + axisCount * 4 ||
          start < 16 ||
          start + axisCount * axisSize + instanceCount * instanceSize >
            fvar.byteLength
        )
          return null;
        const definitions = Array.from({ length: axisCount }, (_, i) => {
          const pos = start + i * axisSize;
          return {
            tag: String.fromCharCode(...new Uint8Array(fvar.buffer, pos, 4)),
            min: fvar.getInt32(pos + 4) / 65536,
            initial: fvar.getInt32(pos + 8) / 65536,
            max: fvar.getInt32(pos + 12) / 65536,
          };
        });
        if (
          new Set(definitions.map((axis) => axis.tag)).size !== axisCount ||
          definitions.some(
            (axis) => axis.min > axis.initial || axis.initial > axis.max,
          )
        )
          return null;
        const candidates: Array<Record<string, number>> = [];
        if (
          postscriptName === basePostscriptName &&
          [style, name(17)].some(
            (value) => value && styleKey(value) === styleKey(local.style),
          )
        ) {
          candidates.push(
            Object.fromEntries(
              definitions.map((axis) => [axis.tag, axis.initial]),
            ),
          );
        } else {
          for (let i = 0; i < instanceCount; i++) {
            const pos = start + axisCount * axisSize + i * instanceSize;
            const subfamily = name(fvar.getUint16(pos));
            const instancePostscript =
              instanceSize >= 6 + axisCount * 4
                ? name(fvar.getUint16(pos + 4 + axisCount * 4))
                : null;
            // System enumerators may synthesize an instance's PostScript name.
            // In that case match its unique fvar subfamily; never invent axes.
            if (
              instancePostscript
                ? instancePostscript !== postscriptName
                : !subfamily || styleKey(subfamily) !== styleKey(local.style)
            )
              continue;
            const coordinates = definitions.map((axis, j) => ({
              ...axis,
              value: fvar.getInt32(pos + 4 + j * 4) / 65536,
            }));
            if (
              coordinates.some(
                (axis) => axis.value < axis.min || axis.value > axis.max,
              )
            )
              return null;
            candidates.push(
              Object.fromEntries(
                coordinates.map((axis) => [axis.tag, axis.value]),
              ),
            );
          }
        }
        if (candidates.length !== 1) continue;
        axes = candidates[0];
      } else if (postscriptName !== basePostscriptName) continue;
      return {
        family,
        style,
        fullName: name(4) ?? local?.fullName ?? family,
        postscriptName,
        basePostscriptName,
        axes,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function readOfficeLegacyFontFace(
  blob: Blob,
  postscriptName: string,
): Promise<OfficeLegacyFontFace | null> {
  const face = await readNativeFace(blob, postscriptName);
  return face
    ? {
        family: face.family,
        style: face.style,
        postscriptName: face.postscriptName,
      }
    : null;
}

/** User-selected static font file; the normal upload path rechecks its bytes. */
export async function readOfficeFontFile(blob: Blob): Promise<OfficeLocalFontRecord | null> {
  if (blob.size < 12 || blob.size > 64 * 1024 * 1024) return null;
  const face = await readNativeFace(blob,"",undefined,true);
  return face ? {family:face.family,style:face.style,fullName:face.fullName,
    postscriptName:face.postscriptName,blob:async()=>blob} : null;
}

export async function resolveOfficeLocalFontVariant(
  font: OfficeLocalFontRecord,
  options: { inspectSource?: boolean } = {},
): Promise<OfficeFontVariant | null> {
  const basic = officeVerifiedFontVariant(font);
  // Four-style native records already have a portable family+B/I identity.
  // Avoid materialising hundreds of large CJK font blobs merely to restate it.
  if (basic && !options.inspectSource) {
    const fontFace = normalizeOfficeFontFace({
      version: 1,
      family: font.family,
      style: font.style,
      fullName: font.fullName,
      postscriptName: font.postscriptName,
      basePostscriptName: font.postscriptName,
      axes: {},
    });
    return fontFace ? { ...basic, sourceFamily: font.family, fontFace } : null;
  }
  if (typeof font.blob !== "function") return null;
  let parsed: ParsedFace | null;
  try {
    parsed = await readNativeFace(await font.blob(), font.postscriptName, font);
  } catch {
    return options.inspectSource ? null : basic;
  }
  if (!parsed) return options.inspectSource ? null : basic;
  const variable = Object.keys(parsed.axes).length > 0;
  if (!variable) {
    const linked = officeVerifiedFontVariant(font, parsed);
    if (linked) {
      const fontFace = normalizeOfficeFontFace({
        version: 1,
        family: linked.family,
        style: font.style,
        fullName: parsed.fullName,
        postscriptName: font.postscriptName,
        basePostscriptName: parsed.basePostscriptName,
        axes: {},
      });
      return fontFace
        ? { ...linked, sourceFamily: font.family, fontFace }
        : null;
    }
  }
  const fontFace: OfficeFontFace | null = normalizeOfficeFontFace({
    version: 1,
    family: font.family,
    style: font.style,
    fullName: parsed.fullName,
    postscriptName: font.postscriptName,
    basePostscriptName: parsed.basePostscriptName,
    axes: parsed.axes,
  });
  if (!fontFace) return null;
  return {
    id: font.postscriptName,
    label: font.style,
    family: font.family,
    sourceFamily: font.family,
    face: font.fullName,
    postscriptName: font.postscriptName,
    bold: false,
    italic: false,
    fontFace,
  };
}

export function officeFontVariantOrder(variant: OfficeFontVariant): number {
  const style = variant.label.toLowerCase().replace(/[\s-]+/gu, "");
  const weight = /thin/.test(style)
    ? 100
    : /extralight|ultralight/.test(style)
      ? 200
      : /semilight/.test(style)
        ? 350
        : /light/.test(style)
          ? 300
          : /medium/.test(style)
            ? 500
            : /semibold|demibold/.test(style)
              ? 600
              : /extrabold|ultrabold/.test(style)
                ? 800
                : /black|heavy/.test(style)
                  ? 900
                  : variant.bold || /bold/.test(style)
                    ? 700
                    : 400;
  return weight * 2 + Number(variant.italic);
}
