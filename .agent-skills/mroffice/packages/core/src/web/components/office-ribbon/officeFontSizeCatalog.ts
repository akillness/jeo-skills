/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { RibbonValueOption } from "./RibbonValueCombobox";
import { OFFICE_FONT_SIZE_POINTS } from "./officeTypographyCatalog";

export type OfficeFontSizeHost = "word" | "excel" | "powerpoint" | "pdf";

export interface OfficeFontSizeLimits {
  readonly min: number;
  readonly max: number;
  /** The grid typed sizes snap to (points). */
  readonly step: number;
}

export const OFFICE_FONT_SIZE_LIMITS: Readonly<Record<OfficeFontSizeHost, OfficeFontSizeLimits>> = {
  word: { min: 1, max: 1638, step: 0.5 },
  excel: { min: 1, max: 409, step: 0.5 },
  powerpoint: { min: 1, max: 3600, step: 0.1 },
  pdf: { min: 1, max: 1638, step: 0.5 },
};

export const POWERPOINT_FONT_SIZE_POINTS = [
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60,
  66, 72, 80, 88, 96,
] as const;

/** Excel's Font Size list (XLS-A006). */
export const EXCEL_FONT_SIZE_POINTS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
] as const;

export const OFFICE_FONT_SIZE_PRESETS: Readonly<Record<OfficeFontSizeHost, readonly number[]>> = {
  word: OFFICE_FONT_SIZE_POINTS,
  excel: EXCEL_FONT_SIZE_POINTS,
  powerpoint: POWERPOINT_FONT_SIZE_POINTS,
  pdf: OFFICE_FONT_SIZE_POINTS,
};

/** "10.5", "12": the box's spelling of a point size. */
export function formatOfficeFontSize(points: number): string {
  return String(Math.round(points * 100) / 100);
}

export type ChineseFontSizePreset = Readonly<{
  id: string;
  points: number;
  zhLabel: string;
}>;

/** The Chinese size names (字号) Word and WPS list before the point sizes in
 * their Chinese builds, largest first. */
export const CHINESE_FONT_SIZE_PRESETS: readonly ChineseFontSizePreset[] = [
  { id: "chuhao", points: 42, zhLabel: "初号" },
  { id: "xiaochu", points: 36, zhLabel: "小初" },
  { id: "yihao", points: 26, zhLabel: "一号" },
  { id: "xiaoyi", points: 24, zhLabel: "小一" },
  { id: "erhao", points: 22, zhLabel: "二号" },
  { id: "xiaoer", points: 18, zhLabel: "小二" },
  { id: "sanhao", points: 16, zhLabel: "三号" },
  { id: "xiaosan", points: 15, zhLabel: "小三" },
  { id: "sihao", points: 14, zhLabel: "四号" },
  { id: "xiaosi", points: 12, zhLabel: "小四" },
  { id: "wuhao", points: 10.5, zhLabel: "五号" },
  { id: "xiaowu", points: 9, zhLabel: "小五" },
  { id: "liuhao", points: 7.5, zhLabel: "六号" },
  { id: "xiaoliu", points: 6.5, zhLabel: "小六" },
  { id: "qihao", points: 5.5, zhLabel: "七号" },
  { id: "bahao", points: 5, zhLabel: "八号" },
] as const;

/** The Chinese name of a point size, when it has one (12 -> 小四). */
export function chineseFontSizeName(points: number | null | undefined): string | undefined {
  if (typeof points !== "number" || !Number.isFinite(points)) return undefined;
  return CHINESE_FONT_SIZE_PRESETS.find((preset) => Math.abs(preset.points - points) < 0.001)?.zhLabel;
}

/** The point size a Chinese size name stands for ("小四" -> 12). */
export function chineseFontSizePoints(raw: string): number | undefined {
  const name = typeof raw === "string" ? raw.trim() : "";
  return CHINESE_FONT_SIZE_PRESETS.find((preset) => preset.zhLabel === name)?.points;
}

/** The Font Size dropdown of one host, as the shared value box lists it. */
export function officeFontSizeOptions(host: OfficeFontSizeHost): readonly RibbonValueOption[] {
  return OFFICE_FONT_SIZE_PRESETS[host].map((points) => {
    const value = formatOfficeFontSize(points);
    return { value, label: value };
  });
}

const FULLWIDTH_DIGIT_BASE = 0xff10;

/** Full-width digits and the full-width point become their ASCII forms. */
function asciiDigits(raw: string): string {
  return raw.replace(/[０-９．]/g, (ch) =>
    ch === "．" ? "." : String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_DIGIT_BASE + 0x30),
  );
}

/**
 * The size a host's Font Size box commits for what was typed, in points, or
 * undefined for input the box refuses (Office keeps the old size then).
 * "12", "12pt", "12 磅" and full-width digits all read as 12; the result is
 * clamped to the host's range and snapped to its grid (Excel and Word half
 * points, PowerPoint tenths).
 */
export function parseOfficeFontSizeInput(raw: string, host: OfficeFontSizeHost): number | undefined {
  if (typeof raw !== "string") return undefined;
  const token = asciiDigits(raw)
    .trim()
    .toLowerCase()
    .replace(/\s*(pt|磅|點|点|ポイント|포인트)$/u, "")
    .trim();
  if (!/^(\d+(?:\.\d*)?|\.\d+)$/.test(token)) return undefined;
  const value = Number(token);
  if (!Number.isFinite(value)) return undefined;
  return clampOfficeFontSize(value, host);
}

/** A numeric size brought into the host's range and onto its grid. */
export function clampOfficeFontSize(value: number, host: OfficeFontSizeHost): number {
  const { min, max, step } = OFFICE_FONT_SIZE_LIMITS[host];
  const clamped = Math.min(max, Math.max(min, value));
  const scale = Math.round(1 / step);
  return Math.round(clamped * scale) / scale;
}

/**
 * Increase / Decrease Font Size: the next list size above or below the
 * current one; past the list's ends the size moves by one step of the
 * list's last interval, as Office does, and never leaves the host's range.
 */
export function stepOfficeFontSize(current: number, direction: 1 | -1, host: OfficeFontSizeHost): number {
  const presets = OFFICE_FONT_SIZE_PRESETS[host];
  const { min, max } = OFFICE_FONT_SIZE_LIMITS[host];
  if (direction > 0) {
    const next = presets.find((size) => size > current);
    if (next !== undefined) return next;
    const tail = presets[presets.length - 1] - presets[presets.length - 2];
    return clampOfficeFontSize(Math.min(max, current + tail), host);
  }
  // Past the top of the list, Shrink comes down by the same steps Grow went
  
  // to the list's last size).
  const top = presets[presets.length - 1];
  if (current > top) {
    const tail = top - presets[presets.length - 2];
    return clampOfficeFontSize(Math.max(top, current - tail), host);
  }
  const previous = [...presets].reverse().find((size) => size < current);
  if (previous !== undefined) return previous;
  return clampOfficeFontSize(Math.max(min, current - 1), host);
}
