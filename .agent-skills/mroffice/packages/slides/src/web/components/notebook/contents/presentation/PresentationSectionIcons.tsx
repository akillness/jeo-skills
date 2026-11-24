"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactElement } from "react";

/**
 * The Section commands' icons (Home ▸ Section ▾ and a section header's
 * right-click menu), drawn for this editor in the vocabulary PowerPoint's
 * own Section menu reads by: a section is a coloured header bar over its
 * slides, a name is a field with a text cursor, removing is a red cross,
 * moving is a blue arrow, collapsing and expanding are the outline's
 * disclosure triangles. Outlines take the menu's text colour, so a disabled
 * row greys them as it greys its label; the accents keep theirs.
 *
 * A menu row forces every icon inside it to 16 px (`[&_svg]:size-4`); these
 * keep the size they are drawn at, as PowerPoint's menu draws them.
 */

const SECTION_GREEN = "#3a9a5b";
const NAME_BLUE = "#3b7fd0";
const NAME_FILL = "rgba(59, 127, 208, 0.16)";
const REMOVE_RED = "#d8453b";

export type PresentationSectionIconName =
  | "add"
  | "rename"
  | "remove"
  | "removeWithSlides"
  | "removeAll"
  | "moveUp"
  | "moveDown"
  | "collapseAll"
  | "expandAll";

/** The red cross of a Remove command, in the corner it leaves clear. */
function RemoveCross({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 2.1} ${y - 2.1}l4.2 4.2M${x + 2.1} ${y - 2.1}l-4.2 4.2`}
      stroke={REMOVE_RED}
      strokeWidth="1.7"
    />
  );
}

/** A section: its header bar over the frame of its slides. */
function SectionBlock({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <>
      <rect x={x - 0.75} y={y} width={width + 1.5} height="2.4" rx="0.9" fill={SECTION_GREEN} stroke="none" />
      <rect x={x} y={y + 3.6} width={width} height={height - 3.6} rx="1.4" />
    </>
  );
}

const DRAWINGS: Record<PresentationSectionIconName, () => ReactElement> = {
  // A new section header over a slide, a plus inside it.
  add: () => (
    <>
      <SectionBlock x={3.5} y={2} width={13} height={15.5} />
      <path d="M10 9v5.5M7.25 11.75h5.5" stroke={SECTION_GREEN} strokeWidth="1.6" />
    </>
  ),
  // The section's name field, the text cursor at its end.
  rename: () => (
    <>
      <rect x="1.75" y="6.25" width="12.5" height="7.5" rx="1.6" fill={NAME_FILL} stroke={NAME_BLUE} />
      <path d="M4.5 10h5.5" stroke={NAME_BLUE} strokeWidth="1.5" />
      <path d="M16.75 4v12M15 4h3.5M15 16h3.5" />
    </>
  ),
  // The section, crossed out: its slides stay (they go to the one above).
  remove: () => (
    <>
      <rect x="2" y="3.5" width="12.5" height="2.4" rx="0.9" fill={SECTION_GREEN} stroke="none" />
      <path d="M3 9h7.5M3 12.5h5.5" />
      <RemoveCross x={14.75} y={14.25} />
    </>
  ),
  // The section and its slides, crossed out.
  removeWithSlides: () => (
    <>
      <SectionBlock x={2.75} y={2} width={10} height={12.5} />
      <path d="M5.25 9.25h5M5.25 11.75h3.5" opacity="0.7" />
      <RemoveCross x={15.6} y={15.6} />
    </>
  ),
  // Every section header in the outline, crossed out.
  removeAll: () => (
    <>
      <rect x="2" y="2.75" width="3.4" height="2.4" rx="0.8" fill={SECTION_GREEN} stroke="none" />
      <path d="M7.25 4h7.75" />
      <rect x="2" y="7.75" width="3.4" height="2.4" rx="0.8" fill={SECTION_GREEN} stroke="none" />
      <path d="M7.25 9h5" />
      <rect x="2" y="12.75" width="3.4" height="2.4" rx="0.8" fill={SECTION_GREEN} stroke="none" />
      <path d="M7.25 14h2.5" />
      <RemoveCross x={14.75} y={14.25} />
    </>
  ),
  // The section, and the way it goes past its neighbour.
  moveUp: () => (
    <>
      <SectionBlock x={2.25} y={6} width={9.5} height={11} />
      <path d="M15.75 16.5V3.5M12.75 6.5l3-3 3 3" stroke={NAME_BLUE} strokeWidth="1.6" />
    </>
  ),
  moveDown: () => (
    <>
      <SectionBlock x={2.25} y={3} width={9.5} height={11} />
      <path d="M15.75 3.5v13M12.75 13.5l3 3 3-3" stroke={NAME_BLUE} strokeWidth="1.6" />
    </>
  ),
  // Every header closed: its triangle points at its name, no slides under it.
  collapseAll: () => (
    <>
      <path d="M2.75 3.25 6.75 6l-4 2.75Z" fill={NAME_BLUE} stroke={NAME_BLUE} strokeWidth="0.8" />
      <path d="M9 6h8.5" />
      <path d="M2.75 11.25 6.75 14l-4 2.75Z" fill={NAME_BLUE} stroke={NAME_BLUE} strokeWidth="0.8" />
      <path d="M9 14h8.5" />
    </>
  ),
  // Every header open: its triangle points down at the slides under it.
  expandAll: () => (
    <>
      <path d="M2.25 3.25h5.5L5 7Z" fill={NAME_BLUE} stroke={NAME_BLUE} strokeWidth="0.8" />
      <path d="M9.5 4.25h8M9.5 7.25h6" />
      <path d="M2.25 11.25h5.5L5 15Z" fill={NAME_BLUE} stroke={NAME_BLUE} strokeWidth="0.8" />
      <path d="M9.5 12.25h8M9.5 15.25h6" />
    </>
  ),
};

export function PresentationSectionIcon({
  name,
  size = 20,
}: {
  name: PresentationSectionIconName;
  size?: number;
}) {
  const Drawing = DRAWINGS[name];
  return (
    <svg
      width={size}
      height={size}
      style={{ width: size, height: size, flexShrink: 0 }}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-presentation-section-icon={name}
    >
      <Drawing />
    </svg>
  );
}
