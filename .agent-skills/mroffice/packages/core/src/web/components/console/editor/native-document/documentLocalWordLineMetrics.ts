/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import controls from "./wordLineMetricControls.json";
import monoControls from "./wordMonoLineMetricControls.json";
import {
  registerOfficeFontFace,
  officeFontFaceFamily,
  type OfficeFontFace,
} from "../../../office-ribbon/officeFontFace";

// This is metric equivalence to the independently measured native control,
// never a claim that browser-local font bytes have a particular SHA256.
const verified = new WeakMap<OfficeFontFace, string>();
const pending = new WeakMap<Document, Map<string, Promise<OfficeFontFace | null>>>();
export function localWordLineMetricReference(
  face: OfficeFontFace,
): string | null {
  return verified.get(face) ?? null;
}
export function prepareLocalWordLineMetricFace(
  doc: Document,
  requestedFamily = controls.localMetricProbe.family,
): Promise<OfficeFontFace | null> {
  const profile = [controls, monoControls].find(row => row.localMetricProbe.family.toLowerCase() === requestedFamily.toLowerCase());
  if (!profile) return Promise.resolve(null);
  const familyKey = profile.localMetricProbe.family;
  let requests = pending.get(doc);
  if (!requests) { requests = new Map(); pending.set(doc, requests); }
  const previous = requests.get(familyKey);
  if (previous) return previous;
  const task = (async () => {
    if (!doc.fonts || !doc.defaultView) return null;
    const probe = profile.localMetricProbe;
    const face: OfficeFontFace = {
      version: 1,
      family: probe.family,
      style: "Regular",
      fullName: probe.family,
      postscriptName: probe.postscriptName,
      basePostscriptName: probe.postscriptName,
      axes: {},
    };
    registerOfficeFontFace(face, doc);
    const family = officeFontFaceFamily(face),
      font = `400 ${probe.fontSizePx}px "${family}"`;
    let loaded: FontFace[];
    try {
      loaded = await doc.fonts.load(font);
    } catch {
      return null;
    }
    if (
      !loaded.some(
        (f) =>
          f.status === "loaded" &&
          f.family.replace(/^["']|["']$/g, "") === family,
      )
    )
      return null;
    const canvas = doc.createElement("canvas").getContext("2d");
    if (!canvas) return null;
    canvas.font = font;
    const metrics = canvas.measureText("Hg"),
      scale = probe.fontSizePx / profile.unitsPerEm;
    if (
      !Number.isFinite(metrics.fontBoundingBoxAscent) ||
      !Number.isFinite(metrics.fontBoundingBoxDescent) ||
      Math.abs(
        metrics.fontBoundingBoxAscent - profile.intrinsicAscentUnits * scale,
      ) > probe.metricRoundingTolerancePx ||
      Math.abs(
        metrics.fontBoundingBoxDescent - profile.intrinsicDescentUnits * scale,
      ) > probe.metricRoundingTolerancePx
    )
      return null;
    if (
      probe.advances.some((p) => {
        const width = canvas.measureText(p.text).width;
        return (
          !Number.isFinite(width) ||
          Math.abs(width - p.px) > probe.advanceTolerancePx
        );
      })
    )
      return null;
    verified.set(face, profile.canonicalFontSha256);
    return face;
  })();
  requests.set(familyKey, task);
  const clear = () => { if (requests.get(familyKey) === task) requests.delete(familyKey); };
  void task.then(face => { if (!face) clear(); }, clear);
  return task;
}
