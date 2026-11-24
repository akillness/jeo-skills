/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Mark, Node as PmNode } from "@tiptap/pm/model";
import {
  officeFontFaceFamily,
  type OfficeFontFace,
} from "../../../office-ribbon/officeFontFace";
import { officePrimaryFontFamily } from "../../../office-ribbon/officeTypographyCatalog";
import { localWordLineMetricReference } from "./documentLocalWordLineMetrics";
import {
  resolveDocumentWordLineMetricContext,
  type DocumentWordLineMetricInput,
} from "./documentWordLineMetrics";
import type ControlsTable from "./wordSyntheticBoldAdvanceControls.json";
import { officeData } from "../../../../lib/office-data/store";

type Role = "bold" | "regular";
const family = "arial unicode ms";
const measuredQuantumPx = 0.0001;
const forbidden = new Set([
  "charSpacing",
  "charScale",
  "textEffects",
  "characterStyle",
  "superscript",
  "subscript",
  "kerningThreshold",
  "fontLigatures",
]);
const supportedMarks = new Set([
  "bold",
  "italic",
  "fontFamily",
  "fontCjkFamily",
  "fontComplexFamily",
  "fontSize",
  "textColor",
  "highlight",
  "proofingLanguage",
  "underline",
  "strike",
]);
type Controls = typeof ControlsTable;
interface ControlTables {
  readonly controls: Controls;
  readonly widths: Readonly<Record<string, number>>;
  readonly hanClasses: Readonly<
    Record<
      string,
      { rangePx: number[]; representativeCount: number; sampleCount: number; eligibleFollowingCharacters?: string }
    >
  >;
  readonly compatibleHan: ReadonlySet<string>;
  readonly targets: Readonly<
    Record<string, { rangePx: number[]; requiresCompatibleHanFollowing?: boolean; eligibleFollowingCharacters?: string }>
  >;
}
let servedTables: ControlTables | null = null;

/**
 * Word's measured advances (`wordSyntheticBoldAdvanceControls.json`), served
 * by the API to a signed-in page (`lib/office-data/store.ts`); null until
 * they arrive, and on a guest page, where no projection is made (the
 * browser's own advances stand). The display-font plan asks for them before
 * it measures (`documentDisplayFonts.ts`), so a document needing them waits
 * behind its font gate instead of laying out twice.
 */
function syntheticBoldTables(): ControlTables | null {
  const controls = officeData("word-synthetic-bold-advance") as Controls | undefined;
  if (!controls || typeof controls !== "object" || !controls.regularWidths || !controls.targets) return null;
  if (servedTables?.controls !== controls) {
    servedTables = {
      controls,
      widths: controls.regularWidths as Readonly<Record<string, number>>,
      hanClasses: controls.compatibleHanClasses as ControlTables["hanClasses"],
      compatibleHan: new Set(Array.from(controls.compatibleHanCharacters)),
      targets: controls.targets as ControlTables["targets"],
    };
  }
  return servedTables;
}

/** A measured runtime token, never a promise that arbitrary local font bytes
 * have the reference SHA. The existing validator supplies metric authority. */
export interface SyntheticBoldAdvanceMeasurement {
  /** Only present when independent inline probes prove upward box rounding. */
  readonly inlineBoxQuantumPx?: number;
  readonly referenceFamily: string;
  readonly referenceSha256: string;
  readonly fontSizePx: 12;
  readonly kerningAuthority:
    "canvas-api" | "reference-tables-and-runtime-additivity";
  readonly syntheticGainRangePx: readonly [number, number];
  readonly stringAdvanceModel: "glyph-additive" | "aggregate-f32-synthetic-gain";
}

function inlineBoxQuantum(doc:Document,canvas:CanvasRenderingContext2D,alias:string):number|undefined {
  if(!doc.body)return undefined;
  const samples=[['田',.240256],['田田田',.240256],['ABxy/',.237916],[' ',.000224],['MMMMMMMM',.240224]] as const;
  const host=doc.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;white-space:pre;contain:layout style paint;width:10000px';
  const spans=samples.map(([text,spacing])=>{const span=doc.createElement('span');span.textContent=text;span.style.font=`700 12px "${alias}"`;span.style.fontKerning='none';span.style.position='relative';span.style.letterSpacing=`${spacing}px`;const row=doc.createElement('div');row.append(span);host.append(row);return span;});
  canvas.font=`700 12px "${alias}"`;
  try {
    doc.body.append(host);
    let differs=false;
    for(let i=0;i<samples.length;i++){
      const [text,spacing]=samples[i],ideal=canvas.measureText(text).width+spacing*text.length;
      const actual=spans[i].getBoundingClientRect().width;
      if(!(actual>0)||Math.abs(actual-Math.ceil(ideal*64)/64)>.0001)return undefined;
      differs ||= Math.abs(actual-ideal)>.001;
    }
    return differs?1/64:undefined;
  } finally {host.remove();}
}
interface MeasurementState {
  doc: Document;
  face: OfficeFontFace;
  fontState: SyntheticBoldAdvanceFontStateSnapshot;
  canvas: CanvasRenderingContext2D;
  supportsCanvasKerning: boolean;
  advances: Map<string, number>;
}

// Independent typography probes, never document text or desired line endings.
// The doubled final probe rejects models that happen to agree at short lengths.
const stringAdvanceProbes = [
  "A".repeat(8), "A".repeat(32), "A".repeat(86), "A".repeat(128),
  "W".repeat(86), "甲".repeat(86),
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789。",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 甲乙丙丁 ".repeat(2),
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 甲乙丙丁 ".repeat(4),
];

function aggregateSyntheticGain(regular: number, characters: number): number {
  let width = regular;
  for (let index = 0; index < characters; index++)
    width = Math.fround(width + 1 / 3);
  return width;
}

function identifyStringAdvanceModel(
  canvas: CanvasRenderingContext2D,
  alias: string,
  advances: ReadonlyMap<string, number>,
  gain: number,
): SyntheticBoldAdvanceMeasurement["stringAdvanceModel"] | null {
  const widths = syntheticBoldTables()?.widths;
  if (!widths) return null;
  let additive = true, aggregate = gain === 1 / 3;
  for (const text of stringAdvanceProbes) {
    const characters = Array.from(text);
    const expectedRegular = characters.reduce((sum, char) => sum + widths[char], 0);
    canvas.font = `400 12px "${alias}"`;
    const regular = canvas.measureText(text).width;
    canvas.font = `700 12px "${alias}"`;
    const bold = canvas.measureText(text).width;
    if (![expectedRegular, regular, bold].every(Number.isFinite) ||
        Math.abs(regular - expectedRegular) > measuredQuantumPx) return null;
    const glyphSum = characters.reduce((sum, char) => sum + (advances.get(char) ?? NaN), 0);
    additive &&= Number.isFinite(glyphSum) && Math.abs(bold - glyphSum) <= measuredQuantumPx;
    aggregate &&= Math.abs(bold - aggregateSyntheticGain(regular, characters.length)) <= measuredQuantumPx;
  }
  // These long probes distinguish the two accepted models. Ambiguous or changed
  // runtime behavior is not authority to project document glyph advances.
  if (additive === aggregate) return null;
  return additive ? "glyph-additive" : "aggregate-f32-synthetic-gain";
}
const measurements = new WeakMap<
  SyntheticBoldAdvanceMeasurement,
  MeasurementState
>();

/** Whether a face could be the reference face (its family alone): the
 * display-font plan asks for Word's measured advances only then. */
export function documentSyntheticBoldAdvanceCandidateFace(face: OfficeFontFace): boolean {
  return face.family.toLowerCase() === family && !Object.keys(face.axes).length;
}

function referenceFace(face: OfficeFontFace): boolean {
  const controls = syntheticBoldTables()?.controls;
  if (!controls) return false;
  return (
    face.family.toLowerCase() === family &&
    !Object.keys(face.axes).length &&
    !face.asset?.files.some(
      (file) => file.role === "bold" || file.role === "boldItalic",
    ) &&
    (face.asset?.files.find((file) => file.role === "regular")?.sha256 ===
      controls.referenceSha256 ||
      localWordLineMetricReference(face) === controls.referenceSha256)
  );
}
export interface SyntheticBoldAdvanceFontStateSnapshot {
  readonly document: Document;
  readonly referenceFamily: string;
  readonly faces: readonly {
    readonly identity: FontFace;
    readonly descriptors: Readonly<Record<string, string | null>>;
  }[];
}
const descriptorKeys = [
  "family",
  "status",
  "weight",
  "style",
  "stretch",
  "unicodeRange",
  "featureSettings",
  "variationSettings",
  "display",
  "ascentOverride",
  "descentOverride",
  "lineGapOverride",
  "sizeAdjust",
] as const;

/** No metric reads: capture only this alias's identity and descriptor values.
 * Values are copied because FontFace descriptors can change on the same object. */
export function documentSyntheticBoldAdvanceFontStateSnapshot(
  doc: Document,
  referenceFamily: string,
): SyntheticBoldAdvanceFontStateSnapshot {
  const faces = doc.fonts
    ? [...doc.fonts].filter(
        (font) => font.family.replace(/^["']|["']$/g, "") === referenceFamily,
      )
    : [];
  return Object.freeze({
    document: doc,
    referenceFamily,
    faces: Object.freeze(
      faces.map((font) => {
        const raw = font as unknown as Record<string, unknown>;
        const descriptors = Object.fromEntries(
          descriptorKeys.map((key) => [
            key,
            typeof raw[key] === "string" ? raw[key] : null,
          ]),
        ) as Record<string, string | null>;
        return Object.freeze({
          identity: font,
          descriptors: Object.freeze(descriptors),
        });
      }),
    ),
  });
}

export function documentSyntheticBoldAdvanceFontStatesEqual(
  left: SyntheticBoldAdvanceFontStateSnapshot,
  right: SyntheticBoldAdvanceFontStateSnapshot,
): boolean {
  return (
    left.document === right.document &&
    left.referenceFamily === right.referenceFamily &&
    left.faces.length === right.faces.length &&
    left.faces.every((face, index) => {
      const other = right.faces[index];
      return (
        face.identity === other.identity &&
        descriptorKeys.every(
          (key) => face.descriptors[key] === other.descriptors[key],
        )
      );
    })
  );
}

function loadedRegularFontState(
  snapshot: SyntheticBoldAdvanceFontStateSnapshot,
): boolean {
  return (
    snapshot.faces.length > 0 &&
    snapshot.faces.every(
      ({ descriptors }) =>
        descriptors.status === "loaded" &&
        ["normal", "400"].includes(descriptors.weight ?? "") &&
        descriptors.style === "normal" &&
        descriptors.stretch === "normal" &&
        ["featureSettings","variationSettings","ascentOverride","descentOverride","lineGapOverride"].every(key=>
          descriptors[key]==null || descriptors[key]==="normal" || descriptors[key]==="") &&
        (descriptors.sizeAdjust==null || descriptors.sizeAdjust==="100%") &&
        (descriptors.unicodeRange==null || descriptors.unicodeRange.toUpperCase().replace(/\s/g,"")==="U+0-10FFFF"),
    )
  );
}

/**
 * Whether each measurement is current, for the length of one synchronous
 * pass over the document.
 *
 * The answer reads every face of the document's font set (well over a
 * hundred on a page with Office fonts). The decoration pass asks it once per
 * bold run, on every transaction that changes the document: a page with a
 * few dozen bold runs spent most of each keystroke's state update listing
 * the same fonts again. No face loads or changes while one pass runs, so
 * inside a scope the first answer for a measurement is the answer.
 */
let measurementCurrentScope: Map<SyntheticBoldAdvanceMeasurement, boolean> | null = null;

/** Run `fn` with each measurement's currency worked out once (nested scopes
 * share the outermost). `fn` must be synchronous. */
export function withSyntheticBoldAdvanceMeasurementScope<T>(fn: () => T): T {
  if (measurementCurrentScope) return fn();
  measurementCurrentScope = new Map();
  try {
    return fn();
  } finally {
    measurementCurrentScope = null;
  }
}

/** An unrelated font load cannot revoke a reference measurement. */
export function isDocumentSyntheticBoldAdvanceMeasurementCurrent(
  token: SyntheticBoldAdvanceMeasurement | null | undefined,
): boolean {
  if (!token) return false;
  const scope = measurementCurrentScope;
  const known = scope?.get(token);
  if (known !== undefined) return known;
  const current = measurementIsCurrent(token);
  scope?.set(token, current);
  return current;
}

function measurementIsCurrent(token: SyntheticBoldAdvanceMeasurement): boolean {
  const measured = measurements.get(token);
  if (
    !measured ||
    !referenceFace(measured.face) ||
    officeFontFaceFamily(measured.face) !== token.referenceFamily
  )
    return false;
  const current = documentSyntheticBoldAdvanceFontStateSnapshot(
    measured.doc,
    token.referenceFamily,
  );
  return (
    loadedRegularFontState(current) &&
    documentSyntheticBoldAdvanceFontStatesEqual(measured.fontState, current)
  );
}

/** Canvas does not see our render residuals, so remeasurement cannot accumulate
 * a prior correction. Only independently measured 0 or 1/3px gains are accepted. */
export function prepareDocumentSyntheticBoldAdvanceMeasurement(
  doc: Document,
  face: OfficeFontFace,
): SyntheticBoldAdvanceMeasurement | null {
  const tables = syntheticBoldTables();
  if (!tables) return null;
  const { controls, widths } = tables;
  if (!referenceFace(face) || !doc.fonts) return null;
  const alias = officeFontFaceFamily(face);
  const fontState = documentSyntheticBoldAdvanceFontStateSnapshot(doc, alias);
  if (!loadedRegularFontState(fontState)) return null;
  const canvas = doc.createElement("canvas").getContext("2d");
  if (!canvas) return null;
  const supportsCanvasKerning = "fontKerning" in canvas;
  canvas.direction = "ltr";
  if (supportsCanvasKerning) canvas.fontKerning = "none";
  const advances = new Map<string, number>(),
    gains: number[] = [];
  for (const [char, expected] of Object.entries(widths)) {
    canvas.font = `400 12px "${alias}"`;
    const regular = canvas.measureText(char).width;
    canvas.font = `700 12px "${alias}"`;
    const bold = canvas.measureText(char).width;
    if (
      !Number.isFinite(regular) ||
      !Number.isFinite(bold) ||
      Math.abs(regular - expected) > measuredQuantumPx
    )
      return null;
    gains.push(bold - regular);
    advances.set(char, bold);
  }
  const min = Math.min(...gains),
    max = Math.max(...gains);
  if (
    max - min > measuredQuantumPx ||
    ![0, 1 / 3].some(
      (gain) =>
        Math.max(Math.abs(min - gain), Math.abs(max - gain)) <=
        measuredQuantumPx,
    )
  )
    return null;
  const gain = Math.abs(max) <= measuredQuantumPx ? 0 : 1 / 3;
  const stringAdvanceModel = identifyStringAdvanceModel(canvas, alias, advances, gain);
  if (!stringAdvanceModel) return null;
  const token: SyntheticBoldAdvanceMeasurement = Object.freeze({
    inlineBoxQuantumPx: inlineBoxQuantum(doc,canvas,alias),
    referenceFamily: alias,
    referenceSha256: controls.referenceSha256,
    fontSizePx: 12,
    kerningAuthority: supportsCanvasKerning
      ? "canvas-api"
      : "reference-tables-and-runtime-additivity",
    syntheticGainRangePx: [min, max] as const,
    stringAdvanceModel,
  });
  measurements.set(token, {
    doc,
    face,
    fontState,
    canvas,
    supportsCanvasKerning,
    advances,
  });
  return isDocumentSyntheticBoldAdvanceMeasurementCurrent(token) ? token : null;
}

function charClass(char: string | undefined): string {
  if (char === " ") return "space";
  if (!char) return "missing";
  if (/^[\u4e00-\u9fff]$/.test(char)) return "han";
  if (/^[“”]$/.test(char)) return "quote";
  if (/^[，、。：；！？]$/.test(char)) return "full-punctuation";
  if (/^[A-Za-z0-9]$/.test(char)) return "latin-digit";
  if (/^[\x21-\x7e]$/.test(char)) return "ascii-punctuation";
  return "unknown";
}
export interface SyntheticBoldAdvanceGlyph {
  readonly from: number;
  readonly char: string;
  readonly role: Role;
}
export interface SyntheticBoldGlyphResidual {
  readonly from: number;
  readonly to: number;
  readonly char: string;
  readonly boundaryKey: string;
  readonly classWitness?: {
    readonly classKey: string;
    readonly representativeCount: number;
    readonly sampleCount: number;
  };
  readonly nativeTargetRangePx: readonly [number, number];
  readonly browserAdvancePx: number;
  readonly residualRangePx: readonly [number, number];
}
export type SyntheticBoldAdvanceTargets =
  | {
      readonly ok: true;
      readonly residuals: readonly SyntheticBoldGlyphResidual[];
      readonly originQuantumPx: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly at?: number;
      readonly boundaryKey?: string;
    };

/** Pure target lookup. No scalar midpoint is invented for a native interval.
 * The whole requested interval is refused when even one boundary is unknown. */
export function planSyntheticBoldAdvanceTargets(
  glyphs: readonly SyntheticBoldAdvanceGlyph[],
  from: number,
  to: number,
  measuredBold: ReadonlyMap<string, number>,
): SyntheticBoldAdvanceTargets {
  const tables = syntheticBoldTables();
  if (!tables) return { ok: false, reason: "reference-tables-unavailable" };
  const { controls, widths, hanClasses, compatibleHan, targets } = tables;
  const selected = glyphs.filter(
    (glyph) => glyph.from >= from && glyph.from < to,
  );
  if (
    !selected.length ||
    selected.some((glyph, index) => glyph.from !== from + index) ||
    selected[0].from !== from ||
    selected[selected.length - 1].from + 1 !== to
  )
    return { ok: false, reason: "unmapped-source-interval" };
  const residuals: SyntheticBoldGlyphResidual[] = [];
  for (const glyph of selected) {
    const index = glyphs.indexOf(glyph),
      previous = glyphs[index - 1],
      next = glyphs[index + 1];
    if (
      glyph.char.length !== 1 ||
      !(glyph.char in widths) ||
      glyph.role !== "bold"
    )
      return { ok: false, reason: "unsupported-glyph-or-role", at: glyph.from };
    if (!next || next.from !== glyph.from + 1)
      return { ok: false, reason: "unmeasured-paragraph-end", at: glyph.from };
    if (!(next.char in widths))
      return { ok: false, reason: "unsupported-next-glyph", at: glyph.from };
    const own = charClass(glyph.char),
      following = charClass(next.char);
    if (
      previous &&
      ((charClass(previous.char) === "han" && own === "latin-digit") ||
        (charClass(previous.char) === "latin-digit" && own === "han"))
    )
      return {
        ok: false,
        reason: "interscript-spacing-owned-elsewhere",
        at: glyph.from,
      };
    if (
      (own === "han" && following === "latin-digit") ||
      (own === "latin-digit" && following === "han")
    )
      return {
        ok: false,
        reason: "interscript-spacing-owned-elsewhere",
        at: glyph.from,
      };
    if (
      own === "space" &&
      (!previous || previous.char === " " || next.char === " ")
    )
      return { ok: false, reason: "unsupported-space-context", at: glyph.from };
    const key = [
      glyph.char,
      following,
      next.role,
      ...(own === "space"
        ? [charClass(previous?.char), previous?.role ?? "unknown"]
        : []),
    ].join("|");
    const classKey = `${following}|${next.role}`;
    const candidateClassWitness =
      !targets[key] &&
      own === "han" &&
      compatibleHan.has(glyph.char) &&
      widths[glyph.char] === 12
        ? hanClasses[classKey]
        : undefined;
    const classWitness = candidateClassWitness &&
      (candidateClassWitness.eligibleFollowingCharacters === undefined ||
        candidateClassWitness.eligibleFollowingCharacters.includes(next.char))
      ? candidateClassWitness : undefined;
    const directTarget=targets[key];
    const directEligible=(!directTarget?.requiresCompatibleHanFollowing ||
      (compatibleHan.has(next.char) && widths[next.char]===12)) &&
      (!directTarget?.eligibleFollowingCharacters || directTarget.eligibleFollowingCharacters.includes(next.char));
    const target = directEligible ? directTarget ?? classWitness : undefined,
      measured = measuredBold.get(glyph.char);
    if (!target)
      return {
        ok: false,
        reason: "missing-native-boundary-target",
        at: glyph.from,
        boundaryKey: key,
      };
    if (measured === undefined || !Number.isFinite(measured))
      return { ok: false, reason: "unmeasured-browser-glyph", at: glyph.from };
    const [low, high] = target.rangePx;
    residuals.push({
      from: glyph.from,
      to: glyph.from + 1,
      char: glyph.char,
      boundaryKey: key,
      ...(classWitness
        ? {
            classWitness: {
              classKey,
              representativeCount: classWitness.representativeCount,
              sampleCount: classWitness.sampleCount,
            },
          }
        : {}),
      nativeTargetRangePx: [low, high],
      browserAdvancePx: measured,
      residualRangePx: [low - measured, high - measured],
    });
  }
  return { ok: true, residuals, originQuantumPx: controls.originQuantumPx };
}

function directRole(marks: readonly Mark[]): Role | null {
  const mark = marks.find((mark) => mark.type.name === "bold");
  return mark?.attrs.value === true
    ? "bold"
    : mark?.attrs.value === false
      ? "regular"
      : null;
}
function plainReferenceRun(node: PmNode): boolean {
  if (
    !node.isText ||
    node.marks.some(
      (mark) =>
        !supportedMarks.has(mark.type.name) ||
        forbidden.has(mark.type.name) ||
        (mark.type.name === "italic" && mark.attrs.value !== false),
    )
  )
    return false;
  if (
    node.marks.find((mark) => mark.type.name === "fontSize")?.attrs.size !==
    "12px"
  )
    return false;
  const fonts = node.marks.filter((mark) =>
    ["fontFamily", "fontCjkFamily"].includes(mark.type.name),
  );
  return (
    fonts.length > 0 &&
    fonts.every(
      (mark) =>
        !mark.attrs.face &&
        typeof mark.attrs.family === "string" &&
        officePrimaryFontFamily(mark.attrs.family)?.toLowerCase() === family,
    )
  );
}
function unmodifiedStyleFeatures(
  input: DocumentWordLineMetricInput,
  block: PmNode,
): boolean {
  const definitions = input.state.doc.attrs.styleDefinitions;
  if (!definitions || !Array.isArray(definitions.styles)) return false;
  const styles = new Map<string, Record<string, unknown>>(
    definitions.styles.map((row: Record<string, unknown>) => [
      String(row.styleId),
      row,
    ]),
  );
  const forbiddenProperties = [
    "spacing",
    "spacingTwips",
    "scalePercent",
    "caps",
    "smallCaps",
    "rtl",
    "vertAlign",
    "kernHalfPoints",
    "charSpacing",
    "charScale",
    "scale",
    "position",
    "ligatures",
    "fontFeatures",
    "characterStyle",
  ];
  const safe = (raw: unknown) =>
    raw == null ||
    (typeof raw === "object" &&
      !Array.isArray(raw) &&
      forbiddenProperties.every(
        // A style's `w:kern w:val="0"` states that kerning is off (style
        // extractor 2): the same advances as a style that states none.
        (key) =>
          (raw as Record<string, unknown>)[key] == null ||
          (key === "kernHalfPoints" && (raw as Record<string, unknown>)[key] === 0),
      ));
  if (!safe(definitions.docDefaults?.rPr)) return false;
  const defaultStyles = [...styles.values()].filter(
    (row) => row.type === "paragraph" && row.default === true,
  );
  let current: unknown =
    block.attrs.docxStyleId ??
    block.attrs.customStyleId ??
    (defaultStyles.length === 1 ? defaultStyles[0].styleId : null);
  if (typeof current !== "string") return false;
  const visited = new Set<string>();
  while (typeof current === "string") {
    if (visited.has(current)) return false;
    visited.add(current);
    const row = styles.get(current);
    if (!row || !safe(row.rPr)) return false;
    current = row.basedOn;
  }
  return true;
}

/** Rendering caller must preserve this source interval and its native ranges.
 * This function does not add decorations, touch source attrs, or own line boxes. */
export function resolveDocumentSyntheticBoldAdvance(
  input: DocumentWordLineMetricInput & {
    to: number;
    measurement: SyntheticBoldAdvanceMeasurement;
    kerning: "none";
    /** Keep a real paragraph-final U+3002 outside the residual projection.
     * Full source/font/shaping validation still includes that source glyph. */
    allowUnprojectedTerminalFullStop?: boolean;
  },
): SyntheticBoldAdvanceTargets & {
  referenceFamily?: string;
  metadata?: Readonly<Record<string, unknown>>;
} {
  const tables = syntheticBoldTables();
  if (!tables) return { ok: false, reason: "reference-tables-unavailable" };
  const { controls, widths } = tables;
  const measured = measurements.get(input.measurement);
  if (!measured || measured.face !== input.face || !referenceFace(input.face))
    return { ok: false, reason: "stale-reference-measurement" };
  if (!isDocumentSyntheticBoldAdvanceMeasurementCurrent(input.measurement))
    return { ok: false, reason: "font-plan-changed" };
  if (
    !Number.isInteger(input.from) ||
    !Number.isInteger(input.to) ||
    input.from < 0 ||
    input.to <= input.from ||
    input.to > input.state.doc.content.size
  )
    return { ok: false, reason: "invalid-source-interval" };
  const context = resolveDocumentWordLineMetricContext(input);
  if (
    !context ||
    context.inTable ||
    input.role !== "bold" ||
    context.block.attrs.source?.adapter !== "docx" ||
    input.kerning !== "none"
  )
    return { ok: false, reason: "unsupported-source-context" };
  const block = context.block;
  const rawLine =
    block.attrs.lineHeight ?? input.state.doc.attrs.defaultLineHeight;
  const line =
    typeof rawLine === "number" || typeof rawLine === "string"
      ? Number(rawLine)
      : NaN;
  if (
    !Number.isFinite(line) ||
    !controls.linePitchEquivalence.autoLine240ths.some(pitch => Math.abs(line * 240 - pitch) <= 0.001) ||
    !unmodifiedStyleFeatures(input, block)
  )
    return { ok: false, reason: "unsupported-source-typography" };
  const start = input.state.doc.resolve(input.from).start(),
    glyphs: SyntheticBoldAdvanceGlyph[] = [];
  if (input.to > start + block.content.size)
    return { ok: false, reason: "cross-paragraph-source-interval" };
  let invalid = false;
  block.forEach((node, offset) => {
    const role = directRole(node.marks);
    if (!node.isText || !role) {
      invalid = true;
      return;
    }
    const overlaps =
      start + offset < input.to && start + offset + node.nodeSize > input.from;
    const touchesBoundary =
      start + offset <= input.to &&
      start + offset + node.nodeSize >= input.from;
    if ((overlaps || touchesBoundary) && !plainReferenceRun(node)) {
      invalid = true;
      return;
    }
    for (let i = 0; i < node.textContent.length; i++)
      glyphs.push({
        from: start + offset + i,
        char: node.textContent[i],
        role,
      });
  });
  if (
    invalid ||
    input.state.doc.textBetween(input.from, input.to, "", "") !== input.text
  )
    return { ok: false, reason: "unsupported-source-run" };
  const canvas = measured.canvas;
  canvas.font = `400 12px "${input.measurement.referenceFamily}"`;
  if (measured.supportsCanvasKerning) canvas.fontKerning = "none";
  const regularNone = canvas.measureText(input.text).width;
  if (measured.supportsCanvasKerning) canvas.fontKerning = "normal";
  const regularNormal = canvas.measureText(input.text).width;
  canvas.font = `700 12px "${input.measurement.referenceFamily}"`;
  if (measured.supportsCanvasKerning) canvas.fontKerning = "none";
  const none = canvas.measureText(input.text).width;
  if (measured.supportsCanvasKerning) canvas.fontKerning = "normal";
  const normal = canvas.measureText(input.text).width;
  if (measured.supportsCanvasKerning) canvas.fontKerning = "none";
  const textCharacters = Array.from(input.text);
  for (let i = 0; i + 1 < textCharacters.length; i++) {
    const pair = textCharacters[i] + textCharacters[i + 1];
    const sum =
      (measured.advances.get(textCharacters[i]) ?? NaN) +
      (measured.advances.get(textCharacters[i + 1]) ?? NaN);
    if (
      !Number.isFinite(sum) ||
      Math.abs(canvas.measureText(pair).width - sum) > measuredQuantumPx
    )
      return {
        ok: false,
        reason: "unverified-pair-shaping",
        at: input.from + i,
      };
  }
  const sum = Array.from(input.text).reduce(
    (total, char) => total + (measured.advances.get(char) ?? NaN),
    0,
  );
  const regularSum = textCharacters.reduce((total, char) => total + (widths[char] ?? NaN), 0);
  const predicted = input.measurement.stringAdvanceModel === "aggregate-f32-synthetic-gain"
    ? aggregateSyntheticGain(regularNone, textCharacters.length)
    : sum;
  if (
    ![none, normal, sum, regularNone, regularNormal, regularSum, predicted].every(Number.isFinite) ||
    Math.abs(regularNormal - regularNone) > 0.001 ||
    Math.abs(regularNone - regularSum) > 0.001 ||
    Math.abs(normal - none) > 0.001 ||
    Math.abs(none - predicted) > 0.001
  )
    return { ok: false, reason: "unverified-kerning-or-shaping" };
  // A paragraph-final glyph has no source successor and therefore no measured
  // outgoing target. Excluding only its residual does not exclude it from any
  // of the complete source/font/string/pair checks above. Hanging remains owned
  // by the source paragraph renderer, including when overflowPunct is false.
  const finalGlyph = glyphs[glyphs.length - 1];
  const unprojectedTerminal = input.allowUnprojectedTerminalFullStop === true &&
    input.text.length > 1 && input.text.endsWith("。") &&
    input.to === start + block.content.size &&
    finalGlyph?.from === input.to - 1 && finalGlyph.char === "。" &&
    finalGlyph.role === "bold"
      ? { from: input.to - 1, to: input.to, char: "。", reason: "no-source-successor" }
      : null;
  const result = planSyntheticBoldAdvanceTargets(
    glyphs,
    input.from,
    unprojectedTerminal?.from ?? input.to,
    measured.advances,
  );
  return result.ok
    ? {
        ...result,
        referenceFamily: input.measurement.referenceFamily,
        metadata: {
          referenceSha256: controls.referenceSha256,
          controlDocxSha256: controls.controlDocxSha256,
          nativePdfSha256: controls.nativePdfSha256,
          fontSizePx: 12,
          autoLine240ths: Math.round(line * 240),
          linePitchAuthority: controls.linePitchEquivalence,
          kerningAuthority: input.measurement.kerningAuthority,
          referenceKerningAudit: controls.referenceKerningAudit,
          sourceContext: input.sourceContext,
          sourceDocument: input.state.doc,
          measurement: input.measurement,
          ...(unprojectedTerminal ? {
            validatedSourceRange: { from: input.from, to: input.to },
            unprojectedTerminal,
          } : {}),
        },
      }
    : result;
}
