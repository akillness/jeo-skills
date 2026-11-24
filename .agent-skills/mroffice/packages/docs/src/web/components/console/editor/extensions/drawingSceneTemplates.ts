/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { contentLocaleOf, type ContentLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";

export type DrawingSceneKind = "canvas" | "shapes" | "flowchart" | "mindmap";

export interface DrawingSceneElement {
  [key: string]: unknown;
}

let sceneSequence = 0;

function nextScenePrefix(kind: DrawingSceneKind): string {
  sceneSequence += 1;
  return `mrnote-${kind}-${sceneSequence}`;
}

function baseElement(
  prefix: string,
  id: string,
  type: "rectangle" | "ellipse" | "diamond" | "arrow" | "text",
  x: number,
  y: number,
  width: number,
  height: number,
  index: string,
): DrawingSceneElement {
  return {
    id: `${prefix}-${id}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e3a5f",
    backgroundColor:
      type === "arrow" || type === "text" ? "transparent" : "#dbeafe",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: sceneSequence * 101 + index.charCodeAt(index.length - 1),
    version: 1,
    versionNonce: sceneSequence * 1009 + index.charCodeAt(index.length - 1),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
  };
}

function shape(
  prefix: string,
  id: string,
  type: "rectangle" | "ellipse" | "diamond",
  x: number,
  y: number,
  width: number,
  height: number,
  index: string,
  backgroundColor: string,
): DrawingSceneElement {
  return {
    ...baseElement(prefix, id, type, x, y, width, height, index),
    backgroundColor,
  };
}

/** A 20px Excalidraw label's width: a full-width glyph is about 20px, any
 * other about 11px. */
function estimatedLabelWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const fullWidth =
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    width += fullWidth ? 20 : 11;
  }
  return width;
}

/**
 * The words a template's labels are written in, per content language
 * (`contentLocaleOf`). MRAI's own templates: Word has no equivalent, so the
 * words are plain translations of the Chinese ones the templates were born
 * with, which stay exactly as they were.
 */
interface DrawingTemplateWords {
  readonly shapes: string;
  readonly start: string;
  readonly process: string;
  readonly decision: string;
  readonly topic: string;
  readonly branches: readonly [string, string, string];
}

const DRAWING_TEMPLATE_WORDS: Readonly<Record<ContentLocale, DrawingTemplateWords>> = {
  en: { shapes: "Editable shapes", start: "Start", process: "Process step", decision: "Condition?", topic: "Main topic", branches: ["Branch 1", "Branch 2", "Branch 3"] },
  zh: { shapes: "可编辑形状", start: "开始", process: "处理步骤", decision: "条件？", topic: "中心主题", branches: ["分支一", "分支二", "分支三"] },
  "zh-TW": { shapes: "可編輯圖形", start: "開始", process: "處理步驟", decision: "條件？", topic: "中心主題", branches: ["分支一", "分支二", "分支三"] },
  ja: { shapes: "編集できる図形", start: "開始", process: "処理", decision: "条件？", topic: "中心テーマ", branches: ["ブランチ 1", "ブランチ 2", "ブランチ 3"] },
  ko: { shapes: "편집 가능한 도형", start: "시작", process: "처리 단계", decision: "조건?", topic: "중심 주제", branches: ["가지 1", "가지 2", "가지 3"] },
  de: { shapes: "Bearbeitbare Formen", start: "Start", process: "Prozessschritt", decision: "Bedingung?", topic: "Hauptthema", branches: ["Zweig 1", "Zweig 2", "Zweig 3"] },
  fr: { shapes: "Formes modifiables", start: "Début", process: "Étape", decision: "Condition ?", topic: "Sujet central", branches: ["Branche 1", "Branche 2", "Branche 3"] },
  es: { shapes: "Formas editables", start: "Inicio", process: "Paso del proceso", decision: "¿Condición?", topic: "Tema central", branches: ["Rama 1", "Rama 2", "Rama 3"] },
  it: { shapes: "Forme modificabili", start: "Inizio", process: "Fase", decision: "Condizione?", topic: "Tema centrale", branches: ["Ramo 1", "Ramo 2", "Ramo 3"] },
  nl: { shapes: "Bewerkbare vormen", start: "Start", process: "Processtap", decision: "Voorwaarde?", topic: "Hoofdonderwerp", branches: ["Tak 1", "Tak 2", "Tak 3"] },
  "pt-BR": { shapes: "Formas editáveis", start: "Início", process: "Etapa", decision: "Condição?", topic: "Tema central", branches: ["Ramo 1", "Ramo 2", "Ramo 3"] },
  da: { shapes: "Redigerbare figurer", start: "Start", process: "Procestrin", decision: "Betingelse?", topic: "Hovedemne", branches: ["Gren 1", "Gren 2", "Gren 3"] },
  no: { shapes: "Redigerbare figurer", start: "Start", process: "Prosesstrinn", decision: "Betingelse?", topic: "Hovedemne", branches: ["Gren 1", "Gren 2", "Gren 3"] },
  sv: { shapes: "Redigerbara former", start: "Start", process: "Processteg", decision: "Villkor?", topic: "Huvudämne", branches: ["Gren 1", "Gren 2", "Gren 3"] },
  fi: { shapes: "Muokattavat muodot", start: "Alku", process: "Vaihe", decision: "Ehto?", topic: "Pääaihe", branches: ["Haara 1", "Haara 2", "Haara 3"] },
  id: { shapes: "Bentuk yang dapat diedit", start: "Mulai", process: "Langkah", decision: "Kondisi?", topic: "Topik utama", branches: ["Cabang 1", "Cabang 2", "Cabang 3"] },
  th: { shapes: "รูปร่างที่แก้ไขได้", start: "เริ่ม", process: "ขั้นตอน", decision: "เงื่อนไข?", topic: "หัวข้อหลัก", branches: ["สาขา 1", "สาขา 2", "สาขา 3"] },
  vi: { shapes: "Hình có thể chỉnh sửa", start: "Bắt đầu", process: "Bước xử lý", decision: "Điều kiện?", topic: "Chủ đề chính", branches: ["Nhánh 1", "Nhánh 2", "Nhánh 3"] },
};

function label(
  prefix: string,
  id: string,
  text: string,
  x: number,
  y: number,
  width: number,
  index: string,
): DrawingSceneElement {
  // A label longer than its slot (a translated word) widens about the same
  // centre, so it still sits on its shape; one that fits keeps the slot.
  const fitted = Math.max(width, estimatedLabelWidth(text));
  return {
    ...baseElement(prefix, id, "text", x - (fitted - width) / 2, y, fitted, 25, index),
    strokeColor: "#0f172a",
    fontSize: 20,
    fontFamily: 1,
    text,
    rawText: text,
    originalText: text,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
  };
}

function arrow(
  prefix: string,
  id: string,
  x: number,
  y: number,
  dx: number,
  dy: number,
  index: string,
): DrawingSceneElement {
  return {
    ...baseElement(
      prefix,
      id,
      "arrow",
      x,
      y,
      Math.abs(dx),
      Math.abs(dy),
      index,
    ),
    points: [
      [0, 0],
      [dx, dy],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  };
}

/**
 * Seed each named drawing command with a distinct, editable Excalidraw scene.
 * The shared renderer is an implementation detail; the persisted `sceneKind`
 * plus different element graphs are the document semantics. The labels are
 * written in the viewer's interface language (`locale`); without one, in the
 * Chinese the templates were born with.
 */
export function createDrawingSceneTemplate(
  kind: DrawingSceneKind,
  locale?: string | null,
): DrawingSceneElement[] {
  if (kind === "canvas") return [];
  const prefix = nextScenePrefix(kind);
  const words = DRAWING_TEMPLATE_WORDS[contentLocaleOf(locale, "zh")];

  if (kind === "shapes") {
    return [
      shape(prefix, "rectangle", "rectangle", 40, 55, 150, 90, "a0", "#dbeafe"),
      shape(prefix, "ellipse", "ellipse", 240, 55, 150, 90, "a1", "#dcfce7"),
      shape(prefix, "diamond", "diamond", 455, 45, 110, 110, "a2", "#fef3c7"),
      label(prefix, "label", words.shapes, 215, 185, 200, "a3"),
    ];
  }

  if (kind === "flowchart") {
    return [
      shape(prefix, "start", "ellipse", 210, 20, 180, 70, "a0", "#dcfce7"),
      label(prefix, "start-label", words.start, 270, 42, 60, "a1"),
      arrow(prefix, "start-process", 300, 90, 0, 55, "a2"),
      shape(prefix, "process", "rectangle", 205, 145, 190, 80, "a3", "#dbeafe"),
      label(prefix, "process-label", words.process, 250, 170, 100, "a4"),
      arrow(prefix, "process-decision", 300, 225, 0, 55, "a5"),
      shape(prefix, "decision", "diamond", 235, 280, 130, 110, "a6", "#fef3c7"),
      label(prefix, "decision-label", words.decision, 270, 323, 60, "a7"),
    ];
  }

  return [
    shape(prefix, "root", "rectangle", 225, 145, 170, 80, "a0", "#dbeafe"),
    label(prefix, "root-label", words.topic, 260, 170, 100, "a1"),
    arrow(prefix, "left-link", 225, 185, -120, -95, "a2"),
    shape(prefix, "left", "rectangle", 15, 35, 130, 65, "a3", "#dcfce7"),
    label(prefix, "left-label", words.branches[0], 50, 55, 60, "a4"),
    arrow(prefix, "right-link", 395, 185, 120, -95, "a5"),
    shape(prefix, "right", "rectangle", 475, 35, 130, 65, "a6", "#fef3c7"),
    label(prefix, "right-label", words.branches[1], 510, 55, 60, "a7"),
    arrow(prefix, "bottom-link", 310, 225, 0, 95, "a8"),
    shape(prefix, "bottom", "rectangle", 245, 320, 130, 65, "a9", "#fae8ff"),
    label(prefix, "bottom-label", words.branches[2], 280, 340, 60, "b0"),
  ];
}
