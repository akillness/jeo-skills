/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export interface OfficeRibbonKeyTipSource {
  id: string;
  label: string;
}

export interface OfficeRibbonKeyTipAssignment extends OfficeRibbonKeyTipSource {
  keyTip: string;
}

const TAB_KEY_TIPS: Readonly<Record<string, string>> = Object.freeze({
  file: "F",
  home: "H",
  insert: "N",
  draw: "I",
  design: "G",
  layout: "P",
  pageLayout: "P",
  references: "S",
  mailings: "M",
  formulas: "M",
  data: "A",
  review: "R",
  view: "W",
  help: "Y",
  share: "Z",
  automate: "U",
  picture: "JP",
  pictureFormat: "JP",
  "image-format": "JP",
  objectFormat: "JO",
  shape: "JS",
  shapeFormat: "JS",
  "shape-format": "JS",
  tableDesign: "JT",
  "table-design": "JT",
  tableLayout: "JL",
  "table-layout": "JL",
  chartDesign: "JC",
  "chart-design": "JC",
  "chart-format": "JF",
  pivotTable: "JA",
  sparklineDesign: "JK",
  "media-format": "JM",
  "media-playback": "JY",
  "smartart-design": "JN",
  "smartart-format": "JQ",
  equation: "JE",
  link: "LK",
  field: "FD",
});

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function alphanumericCharacters(value: string): string[] {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const result: string[] = [];
  for (const character of normalized) {
    if (!/[A-Z0-9]/.test(character) || result.includes(character)) continue;
    result.push(character);
  }
  return result;
}

function isPrefixFree(candidate: string, used: ReadonlySet<string>): boolean {
  for (const existing of used) {
    if (candidate.startsWith(existing) || existing.startsWith(candidate)) {
      return false;
    }
  }
  return true;
}

function fallbackPair(index: number): string {
  const bounded = Math.max(0, index) % (BASE36.length * BASE36.length);
  return `${BASE36[Math.floor(bounded / BASE36.length)]}${
    BASE36[bounded % BASE36.length]
  }`;
}

/**
 * Assigns prefix-free tab access keys from the tabs that are actually mounted.
 * Contextual tabs therefore never reserve keys while their object is absent.
 */
export function assignOfficeRibbonTabKeyTips(
  tabs: readonly OfficeRibbonKeyTipSource[],
): OfficeRibbonKeyTipAssignment[] {
  const used = new Set<string>();
  return tabs.map((tab, index) => {
    const preferred = TAB_KEY_TIPS[tab.id];
    const characters = alphanumericCharacters(`${tab.id} ${tab.label}`);
    const candidates = [
      preferred,
      ...characters,
      ...characters.flatMap((first) =>
        characters
          .filter((second) => second !== first)
          .map((second) => `${first}${second}`),
      ),
    ].filter((candidate): candidate is string => Boolean(candidate));
    let keyTip = candidates.find((candidate) => isPrefixFree(candidate, used));
    if (!keyTip) {
      let offset = index;
      do {
        keyTip = fallbackPair(offset);
        offset += 1;
      } while (!isPrefixFree(keyTip, used));
    }
    used.add(keyTip);
    return { ...tab, keyTip };
  });
}

function commandCandidates(source: OfficeRibbonKeyTipSource): string[] {
  const words = `${source.id} ${source.label}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const characters = alphanumericCharacters(words.join(""));
  const candidates: string[] = [];
  if (words.length > 1) candidates.push(`${words[0][0]}${words[1][0]}`);
  for (const word of words) {
    if (word.length > 1) candidates.push(word.slice(0, 2));
  }
  for (const first of characters) {
    for (const second of characters) {
      if (first !== second) candidates.push(`${first}${second}`);
    }
  }
  return candidates;
}

/** Commands always receive two-character sequences, keeping the set prefix-free. */
export function assignOfficeRibbonCommandKeyTips(
  commands: readonly OfficeRibbonKeyTipSource[],
): OfficeRibbonKeyTipAssignment[] {
  const used = new Set<string>();
  return commands.map((command, index) => {
    const candidates = commandCandidates(command);
    let keyTip = candidates.find(
      (candidate) => candidate.length === 2 && !used.has(candidate),
    );
    if (!keyTip) {
      let offset = index;
      do {
        keyTip = fallbackPair(offset);
        offset += 1;
      } while (used.has(keyTip));
    }
    used.add(keyTip);
    return { ...command, keyTip };
  });
}

export function isOfficeRibbonKeyTipCharacter(key: string): boolean {
  return key.length === 1 && /^[a-z0-9]$/i.test(key);
}

export function isMacOfficeRibbonPlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}
