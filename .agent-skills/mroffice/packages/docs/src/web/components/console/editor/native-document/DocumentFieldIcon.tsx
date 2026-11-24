/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { SVGProps } from "react";

import type { DocumentFieldType } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";

/**
 * One picture per field, in the Insert ribbon's two-tone language (the
 * `docs-home-icon__*` paints): what the field shows, not its code -- a
 * calendar for DATE, a numbered page for PAGE, a bookmark and its arrow
 * for REF. Every field used to wear the same bracketed F.
 */

const PAGE = "M5 2.8h9.3L19 7.5v13.7H5z";
const PAGE_FOLD = "M14.3 2.8v4.7H19";

function Page() {
  return (
    <>
      <path className="docs-home-icon__paper" d={PAGE} />
      <path className="docs-home-icon__ink-soft" d={PAGE_FOLD} />
    </>
  );
}

function Label({ x, y, size = 4.6, children }: { x: number; y: number; size?: number; children: string }) {
  return (
    <text
      className="docs-home-icon__accent-text"
      x={x}
      y={y}
      fontFamily="Arial, sans-serif"
      fontSize={size}
      fontWeight="700"
      textAnchor="middle"
    >
      {children}
    </text>
  );
}

function glyph(type: DocumentFieldType) {
  switch (type) {
    case "DATE":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3.5" y="5" width="17" height="15.5" rx="1.5" />
          <path className="docs-home-icon__accent-fill" d="M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5V9.2h-17z" />
          <path className="docs-home-icon__ink-soft docs-insert-icon__emphasis" d="M8 3.2v3.6M16 3.2v3.6" />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M7.4 12.6h1.2M11.4 12.6h1.2M15.4 12.6h1.2M7.4 16.4h1.2M11.4 16.4h1.2"
          />
        </>
      );
    case "TIME":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="12" cy="12.4" r="8.6" />
          <path className="docs-home-icon__ink-soft" d="M12 3.8v1.5M20.6 12.4h-1.5M12 21v-1.5M3.4 12.4h1.5" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M12 7.6v4.8l3.2 2.1" />
        </>
      );
    case "PAGE":
      return (
        <>
          <Page />
          <path className="docs-home-icon__ink-soft" d="M8 9.6h6.5M8 12.2h8" />
          <rect className="docs-home-icon__accent-soft-fill" x="9.2" y="14.6" width="5.6" height="5" rx="0.8" />
          <Label x={12} y={18.6} size={4.4}>
            1
          </Label>
        </>
      );
    case "NUMPAGES":
      return (
        <>
          <rect className="docs-home-icon__paper" x="8.3" y="2.8" width="11.7" height="14.2" rx="1" />
          <rect className="docs-home-icon__paper" x="4" y="6.6" width="11.7" height="14.6" rx="1" />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M8.4 11.2v6.6M11.4 11.2v6.6M6.6 13.2h6.6M6.6 15.9h6.6"
          />
        </>
      );
    case "AUTHOR":
      return (
        <>
          <circle className="docs-home-icon__paper" cx="12" cy="8" r="3.7" />
          <path className="docs-home-icon__paper" d="M4.6 20.6c.6-4.1 3.5-6.4 7.4-6.4s6.8 2.3 7.4 6.4z" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M9.6 17.8h4.8" />
        </>
      );
    case "FILENAME":
      return (
        <>
          <Page />
          <path className="docs-home-icon__ink-soft" d="M8 9.6h6" />
          <rect className="docs-home-icon__accent-soft-fill" x="6.6" y="12.6" width="10.8" height="5.2" rx="1" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M8.6 15.2h6.8" />
        </>
      );
    case "TITLE":
      return (
        <>
          <Page />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M7.6 9.6h7.2M11.2 9.6v6.2" />
          <path className="docs-home-icon__ink-soft" d="M8 18.4h8" />
        </>
      );
    case "REF":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M3.8 6h8.2M3.8 9.6h8.2M3.8 13.2h5" />
          <path className="docs-home-icon__warm-fill" d="M14.4 3.2h5.4v8.6l-2.7-1.9-2.7 1.9z" />
          <path
            className="docs-home-icon__accent docs-insert-icon__emphasis"
            d="M4.2 19.2c5.4 0 10.6-1.6 12.7-6.4M14.9 13.2l2-.6.7 2"
          />
        </>
      );
    case "PAGEREF":
      return (
        <>
          <Page />
          <path className="docs-home-icon__ink-soft" d="M8 9.6h6.5M8 12.4h8" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M7.4 17.6h4.6M10.6 16.1l1.5 1.5-1.5 1.5" />
          <rect className="docs-home-icon__accent-soft-fill" x="13.4" y="15.6" width="3.6" height="4" rx="0.6" />
          <Label x={15.2} y={19} size={3.6}>
            7
          </Label>
        </>
      );
    case "NOTEREF":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M3.6 8.6h10.6" />
          <Label x={17.4} y={7.6} size={5.4}>
            1
          </Label>
          <path className="docs-home-icon__ink-soft" d="M3.6 14.6h6.4" />
          <Label x={5} y={19.8} size={3.8}>
            1
          </Label>
          <path className="docs-home-icon__accent" d="M7.4 18.6h12.8" />
        </>
      );
    case "STYLEREF":
      return (
        <>
          <rect className="docs-home-icon__paper" x="3" y="3.2" width="18" height="4.6" rx="0.8" />
          <path className="docs-home-icon__accent-soft" d="M5.4 5.5h6.4" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M4.8 13.2h8.4" />
          <path className="docs-home-icon__ink-soft" d="M4.8 16.6h14.4M4.8 19.8h10.4" />
          <path className="docs-home-icon__accent" d="M15.4 13.2c2.4 0 3.6-1.4 3.6-3.9M17.6 10.4l1.4-1.4 1.4 1.4" />
        </>
      );
    case "SEQ":
      return (
        <>
          {[0, 1, 2].map((row) => (
            <g key={row}>
              <rect className="docs-home-icon__accent-soft-fill" x="3" y={3.4 + row * 6.2} width="5.6" height="5" rx="0.8" />
              <Label x={5.8} y={7.4 + row * 6.2} size={4.4}>
                {String(row + 1)}
              </Label>
              <path className="docs-home-icon__ink-soft" d={`M11 ${5.9 + row * 6.2}h${row === 2 ? 7 : 9.6}`} />
            </g>
          ))}
        </>
      );
    case "TOC":
      return (
        <>
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M3.6 5.4h7.2" />
          <path className="docs-home-icon__ink-soft" d="M3.6 10h5.4M6 14.4h4.6M3.6 18.8h6" />
          <path className="docs-home-icon__muted" strokeDasharray="0.1 1.6" d="M12.4 5.4h5M10.4 10h7M12 14.4h5.4M11.2 18.8h6.2" />
          <path className="docs-home-icon__accent" d="M19.6 4.6v1.6M19.6 9.2v1.6M19.6 13.6v1.6M19.6 18v1.6" />
        </>
      );
    case "CITATION":
      return (
        <>
          <path className="docs-home-icon__paper" d="M4 4.4h6.6a1.6 1.6 0 0 1 1.4.9 1.6 1.6 0 0 1 1.4-.9H20v13.4h-6.6a1.4 1.4 0 0 0-1.4 1.4 1.4 1.4 0 0 0-1.4-1.4H4z" />
          <path className="docs-home-icon__ink-soft" d="M12 5.3v13.9" />
          <Label x={8} y={15.6} size={10}>
            {"“"}
          </Label>
          <path className="docs-home-icon__ink-soft" d="M14.4 8.6h3.8M14.4 11.4h3.8M14.4 14.2h2.6" />
        </>
      );
    case "INDEX":
      return (
        <>
          <Label x={5.6} y={8.2} size={6}>
            A
          </Label>
          <path className="docs-home-icon__ink-soft" d="M10 4.6h10.2M10 8h7.4M12.4 11.4h7.8" />
          <Label x={5.6} y={19.4} size={6}>
            Z
          </Label>
          <path className="docs-home-icon__ink-soft" d="M10 15.8h8.6M10 19.2h6.2" />
        </>
      );
    case "TOA":
      return (
        <>
          <path className="docs-home-icon__ink-soft docs-insert-icon__emphasis" d="M12 3.8v15.6M7.6 20.2h8.8M5.4 6.6h13.2" />
          <path className="docs-home-icon__accent" d="M5.4 6.6 2.8 12.8M5.4 6.6 8 12.8M18.6 6.6 16 12.8M18.6 6.6l2.6 6.2" />
          <path className="docs-home-icon__accent-soft-fill" d="M2.6 12.8h5.6a2.8 2.8 0 0 1-5.6 0zM15.8 12.8h5.6a2.8 2.8 0 0 1-5.6 0z" />
          <path className="docs-home-icon__accent" d="M2.6 12.8h5.6a2.8 2.8 0 0 1-5.6 0zM15.8 12.8h5.6a2.8 2.8 0 0 1-5.6 0z" />
        </>
      );
    case "MERGEFIELD":
      return (
        <>
          <rect className="docs-home-icon__paper" x="2.8" y="7" width="18.4" height="10" rx="1.4" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M7.6 9.6 5.2 12l2.4 2.4M9.8 9.6 7.4 12l2.4 2.4M14.2 9.6l2.4 2.4-2.4 2.4M16.4 9.6l2.4 2.4-2.4 2.4" />
          <path className="docs-home-icon__ink-soft" d="M10.8 12h2.4" />
        </>
      );
    case "IF":
      return (
        <>
          <path className="docs-home-icon__warm-fill" d="M12 2.8 17.4 8.2 12 13.6 6.6 8.2z" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M6.6 8.2H4.4v7.2M17.4 8.2h2.2v7.2" />
          <rect className="docs-home-icon__accent-soft-fill" x="2" y="16.2" width="4.8" height="4.4" rx="0.8" />
          <rect className="docs-home-icon__accent-soft-fill" x="17.2" y="16.2" width="4.8" height="4.4" rx="0.8" />
          <Label x={12} y={9.8} size={4.4}>
            ?
          </Label>
        </>
      );
    case "NATIVE":
      return (
        <>
          <path className="docs-home-icon__ink-soft" d="M8 3.6c-1.8 0-2.6.8-2.6 2.4v3.4c0 1.4-.7 2.2-2 2.6 1.3.4 2 1.2 2 2.6V18c0 1.6.8 2.4 2.6 2.4M16 3.6c1.8 0 2.6.8 2.6 2.4v3.4c0 1.4.7 2.2 2 2.6-1.3.4-2 1.2-2 2.6V18c0 1.6-.8 2.4-2.6 2.4" />
          <path className="docs-home-icon__accent docs-insert-icon__emphasis" d="M9.2 12h5.6" />
        </>
      );
  }
}

export interface DocumentFieldIconProps extends Omit<SVGProps<SVGSVGElement>, "children" | "type"> {
  type: DocumentFieldType;
  size?: number;
}

export function DocumentFieldIcon({ type, size = 24, className, ...props }: DocumentFieldIconProps) {
  return (
    <svg
      {...props}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={["docs-home-icon", "docs-insert-icon", "docs-field-icon", className].filter(Boolean).join(" ")}
      data-field-icon={type}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {glyph(type)}
    </svg>
  );
}
