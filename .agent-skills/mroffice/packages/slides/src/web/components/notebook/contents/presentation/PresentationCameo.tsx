"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Cameo (live camera on a slide): its style presets and shape gallery, the
 * camera border control, the camera/microphone device lists and menu, the live
 * camera surface and the slide graphic that frames it.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import { CSS_PX_PER_POINT, lineWeightPointsToDesignPx } from "@mrnote/core/web/lib/presentation/text-units.ts";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Camera, Check, Mic, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  ColorMenuClearItem,
  PresentationCustomColorItem,
  PresentationSwatchGrid,
} from "@mrnote/core/web/components/notebook/contents/ribbon/ColorMenu.tsx";
import {
  PresentationOutlinePreview,
  PRESENTATION_HOME_SHAPE_CATEGORIES,
  PresentationShapePreview,
} from "@mrnote/core/web/components/notebook/contents/ribbon/PresentationHomeShapeGallery.tsx";
import { TEXT_COLOR_VALUES } from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import {
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeSplitLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  SHAPE_KINDS,
  defaultShapeGeometry,
  normalizeShapeColor,
  normalizeShapeKind,
  normalizeStrokeStyle,
  resolveShapeStyle,
  type ShapeKind,
  type StrokeStyle,
} from "@mrnote/core/web/lib/presentation-shapes.ts";
import { isPresentationCameoBlock, slideBounds } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { cropToCss, isIdentityCrop, type CropRect } from "@mrnote/core/web/lib/presentation-crop-group.ts";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  RibbonDropdownMenuContent,
  RibbonDropdownMenuSubContent as DropdownMenuSubContent,
} from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import type {
  PresentationBlock,
  PresentationShapeBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { MAX_PRESENTATION_BLOCKS_PER_SLIDE, type SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { PresentationShapeGraphic } from "./PresentationShapeGraphic";

type PresentationCameoStylePreset = Readonly<{
  id: string;
  patch: Partial<PresentationShapeBlock>;
}>;

export const PRESENTATION_CAMEO_STYLE_PRESETS = [
  // PowerPoint for the web's nine Camera Styles, as its own files state them
  // (Office Web sample, Desktop/编辑器tab/ppt/PPT-Web-Cameo-Native-Sample):
  // a "Simple Frame" is a 1.5 pt #404040 line; a "Center Shadow" an outer
  // shadow with no offset, 15 pt blur, black at 30 %; a "Soft Edge" 10 pt;
  // the hexagon's adjustment is 29 000 (the Insert Shapes hexagon's is
  // 25 000). No effect takes the soft edge off too (PPT-B245).
  { id: "none", patch: { shape: "rectangle", stroke: "none", shadow: false, softEdge: false } },
  {
    id: "simple-frame-rectangle",
    patch: { shape: "rectangle", stroke: "#404040", strokeWidth: 2, strokeStyle: "solid", shadow: false, softEdge: false },
  },
  {
    id: "center-shadow-rectangle",
    patch: { shape: "rectangle", stroke: "none", shadow: true, softEdge: false },
  },
  {
    id: "soft-edge-rectangle",
    patch: { shape: "rectangle", stroke: "none", shadow: false, softEdge: true },
  },
  {
    id: "simple-frame-circle",
    patch: { shape: "ellipse", stroke: "#404040", strokeWidth: 2, strokeStyle: "solid", shadow: false, softEdge: false },
  },
  {
    id: "center-shadow-circle",
    patch: { shape: "ellipse", stroke: "none", shadow: true, softEdge: false },
  },
  {
    id: "soft-edge-circle",
    patch: { shape: "ellipse", stroke: "none", shadow: false, softEdge: true },
  },
  {
    id: "center-shadow-diamond",
    patch: { shape: "diamond", stroke: "none", shadow: true, softEdge: false },
  },
  {
    id: "center-shadow-hexagon",
    patch: {
      shape: "hexagon",
      stroke: "none",
      shadow: true,
      softEdge: false,
      adjustments: { adj: 29000, vf: 115470 },
    },
  },
] as const satisfies readonly PresentationCameoStylePreset[];

export type PresentationCameoStyleId = (typeof PRESENTATION_CAMEO_STYLE_PRESETS)[number]["id"];

export function presentationCameoStyleSignature(
  block: Partial<PresentationShapeBlock>,
): string {
  const stroke = String(block.stroke ?? "none").toLowerCase();
  const outlined = stroke !== "none";
  // A line's width and dash only count while there is a line: a style
  // without one leaves the last frame's numbers behind harmlessly.
  return [
    normalizeShapeKind(block.shape),
    stroke,
    outlined ? block.strokeWidth ?? "" : "",
    outlined ? block.strokeStyle ?? "solid" : "",
    block.shadow === true,
    block.softEdge === true,
  ].join("|");
}

const PRESENTATION_CAMEO_EXCLUDED_SHAPES = new Set<ShapeKind>([
  "flowchart-summing-junction",
  "line",
  "arrow",
  "double-arrow",
  "elbow-connector",
  "elbow-arrow-connector",
  "elbow-double-arrow-connector",
  "curved-connector",
  "curved-arrow-connector",
  "curved-double-arrow-connector",
  "ink",
  "custom-geometry",
]);

function isPresentationCameoShapeKind(value: unknown): value is ShapeKind {
  if (typeof value !== "string" || !SHAPE_KINDS.includes(value as ShapeKind)) {
    return false;
  }
  const kind = normalizeShapeKind(value);
  return (
    !PRESENTATION_CAMEO_EXCLUDED_SHAPES.has(kind) &&
    !kind.startsWith("action-button-")
  );
}

/** One Camera Style tile: the camera's stand-in person in the style's shape,
 * with its frame, centred shadow or soft edge, as PowerPoint draws them. */
export function PresentationCameoStylePreview({
  preset,
}: {
  preset: PresentationCameoStylePreset;
}) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const { patch } = preset;
  const kind = normalizeShapeKind(patch.shape);
  const framed = String(patch.stroke ?? "none") !== "none";
  // A 16:9 frame for the rectangle, a square for the rest (the gallery's).
  const box =
    kind === "rectangle"
      ? { x: 6, y: 6, w: 40, h: 24 }
      : { x: 14, y: 4, w: 26, h: 28 };
  const shape = cameoShapeSvg(kind, box, (patch as { adjustments?: unknown }).adjustments);
  return (
    <svg
      aria-hidden="true"
      data-cameo-style-tile=""
      width={54}
      height={36}
      viewBox="0 0 54 36"
      // Inline, so no host's ribbon rule (`button svg { width: 24px }`)
      // shrinks the tile's picture.
      style={{ display: "block", overflow: "visible", width: 54, height: 36, maxWidth: "none", maxHeight: "none" }}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>{shape}</clipPath>
        <filter id={`${uid}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#000" floodOpacity="0.3" />
        </filter>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="54" height="36">
          <g
            filter={`url(#${uid}-soft)`}
            transform={`translate(${box.x + box.w / 2} ${box.y + box.h / 2}) scale(0.84) translate(${-(box.x + box.w / 2)} ${-(box.y + box.h / 2)})`}
          >
            {cameoShapeSvg(kind, box, (patch as { adjustments?: unknown }).adjustments, "#fff")}
          </g>
        </mask>
      </defs>
      <g
        filter={patch.shadow ? `url(#${uid}-shadow)` : undefined}
        mask={patch.softEdge ? `url(#${uid}-mask)` : undefined}
      >
        <g clipPath={`url(#${uid}-clip)`}>
          <PresentationCameoPersonArt x={box.x} y={box.y} width={box.w} height={box.h} idPrefix={uid} />
        </g>
      </g>
      {framed ? (
        <g fill="none" stroke={String(patch.stroke)} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
          {shape}
        </g>
      ) : null}
    </svg>
  );
}

type CameoShapeGeometry =
  | { tag: "rect"; attrs: { x: number; y: number; width: number; height: number } }
  | { tag: "ellipse"; attrs: { cx: number; cy: number; rx: number; ry: number } }
  | { tag: "polygon"; attrs: { points: string; transform?: string } }
  | { tag: "path"; attrs: { d: string; transform?: string; fillRule: "evenodd" } };

/** The geometry of a Camera Shape inside `box`: the exact rectangle,
 * ellipse, diamond and hexagon (with its adjustment, DrawingML's `hexagon`
 * guide formulas), else the shared preset outline scaled into the box. */
function cameoShapeGeometry(
  kind: ShapeKind,
  box: { x: number; y: number; w: number; h: number },
  adjustments: unknown,
): CameoShapeGeometry {
  const { x, y, w, h } = box;
  if (kind === "ellipse") return { tag: "ellipse", attrs: { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 } };
  if (kind === "diamond") {
    return { tag: "polygon", attrs: { points: `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}` } };
  }
  if (kind === "hexagon") {
    const record = adjustments && typeof adjustments === "object" ? (adjustments as Record<string, unknown>) : {};
    const ss = Math.min(w, h);
    const maxAdj = (50000 * w) / ss;
    const adj = Math.min(Math.max(Number(record.adj ?? 25000) || 0, 0), maxAdj);
    const vf = Number(record.vf ?? 115470) || 115470;
    const x1 = (ss * adj) / 100000;
    const dy = Math.min((((h / 2) * vf) / 100000) * Math.sin(Math.PI / 3), h / 2);
    const vc = y + h / 2;
    return {
      tag: "polygon",
      attrs: { points: `${x},${vc} ${x + x1},${vc - dy} ${x + w - x1},${vc - dy} ${x + w},${vc} ${x + w - x1},${vc + dy} ${x + x1},${vc + dy}` },
    };
  }
  if (kind !== "rectangle") {
    const appearance = resolveShapeStyle({ shape: kind, fill: "none", stroke: "none" });
    const bodyPart = appearance.multiParts?.find((part) => part.role === "body");
    const transform = `translate(${x} ${y}) scale(${w / 100} ${h / 100})`;
    if (appearance.polygonPoints) return { tag: "polygon", attrs: { points: appearance.polygonPoints, transform } };
    const d = appearance.pathD ?? bodyPart?.d;
    if (d) return { tag: "path", attrs: { d, transform, fillRule: "evenodd" } };
  }
  return { tag: "rect", attrs: { x, y, width: w, height: h } };
}

/** {@link cameoShapeGeometry} as SVG, for a clip, a mask or a frame. */
export function cameoShapeSvg(
  kind: ShapeKind,
  box: { x: number; y: number; w: number; h: number },
  adjustments: unknown,
  fill?: string,
) {
  const geometry = cameoShapeGeometry(kind, box, adjustments);
  const paint = fill ? { fill } : {};
  switch (geometry.tag) {
    case "rect": return <rect {...geometry.attrs} {...paint} />;
    case "ellipse": return <ellipse {...geometry.attrs} {...paint} />;
    case "polygon": return <polygon {...geometry.attrs} {...paint} />;
    case "path": return <path {...geometry.attrs} {...paint} />;
  }
}

/** {@link cameoShapeGeometry} as SVG markup text (for a CSS mask image). */
function cameoShapeMarkup(
  kind: ShapeKind,
  box: { x: number; y: number; w: number; h: number },
  adjustments: unknown,
): string {
  const geometry = cameoShapeGeometry(kind, box, adjustments);
  const attrs = Object.entries(geometry.attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name === "fillRule" ? "fill-rule" : name}="${String(value).replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<${geometry.tag} ${attrs} fill="#fff"/>`;
}

/**
 * The camera's stand-in before it is live: a soft blue field with a person's
 * head and shoulders, drawn here (not PowerPoint's artwork) in the same
 * spirit as PowerPoint's own Cameo placeholder. Fills its box; the person
 * keeps its proportions and stands on the box's lower edge.
 */
export function PresentationCameoPersonArt({
  x = 0,
  y = 0,
  width,
  height,
  idPrefix,
}: {
  x?: number;
  y?: number;
  width: number;
  height: number;
  idPrefix: string;
}) {
  const side = Math.min(width, height);
  const px = x + (width - side) / 2;
  const py = y + height - side;
  return (
    <g>
      <defs>
        <linearGradient id={`${idPrefix}-field`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#97a9d6" />
          <stop offset="1" stopColor="#d4dcf1" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-person`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f9fe" />
          <stop offset="1" stopColor="#dbe2f4" />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${idPrefix}-field)`} />
      <g transform={`translate(${px} ${py}) scale(${side / 100})`} fill={`url(#${idPrefix}-person)`}>
        <ellipse cx="50" cy="40" rx="15" ry="17" />
        <path d="M17 100 C17 75 32 63 50 63 C68 63 83 75 83 100 Z" />
      </g>
    </g>
  );
}

export function PresentationCameoShapeGallery({ current, labelFor, onSelect, testPrefix, t }: {
  current: ShapeKind;
  labelFor: (kind: ShapeKind) => string;
  onSelect: (kind: ShapeKind) => void;
  testPrefix: string;
  t: (key: string) => string;
}) {
  return (
    <div role="group" aria-label={t("presentation.cameo.shape")} data-testid={`${testPrefix}-gallery`}
      style={{ width: "min(520px, calc(100vw - 48px))", padding: 6 }}
    >
      {PRESENTATION_HOME_SHAPE_CATEGORIES.map((category) => {
        const kinds = category.kinds.filter((selection): selection is ShapeKind =>
          typeof selection === "string" && isPresentationCameoShapeKind(selection));
        if (!kinds.length) return null;
        return (
          <div key={category.id} style={{ marginBottom: 7 }}>
            <div style={{ padding: "3px 5px", fontSize: 12, fontWeight: 600, color: "#475569" }}>
              {t(`presentation.shapeGallery.category.${category.id}`)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 44px)", gap: 3 }}>
              {kinds.map((kind) => (
                <DropdownMenuItem
                  key={kind} onSelect={() => onSelect(kind)} aria-label={labelFor(kind)}
                  title={labelFor(kind)} data-testid={`${testPrefix}-${kind}`}
                  data-state={current === kind ? "checked" : "unchecked"}
                  style={{
                    width: 44, height: 44, minWidth: 44, padding: 5,
                    justifyContent: "center", borderRadius: 5,
                    border: current === kind ? "2px solid var(--console-accent, #2d7f74)" : "1px solid transparent",
                  }}
                >
                  <PresentationShapePreview kind={kind} />
                </DropdownMenuItem>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PRESENTATION_CAMERA_BORDER_WEIGHTS = [0.5, 1, 2.25, 4.5] as const;

const PRESENTATION_CAMERA_BORDER_STYLES = [
  "solid",
  "dotted",
  "dashed",
] as const;

export function PresentationCameraBorderControl({ accentColor, block, onPatch, t }: {
  accentColor?: string;
  block: PresentationShapeBlock;
  onPatch: (patch: Partial<PresentationShapeBlock>) => void;
  t: (key: string) => string;
}) {
  const current = normalizeShapeColor(block.stroke, null);
  const color = current && current !== "none" ? current : (accentColor ?? "#2d7f74");
  const width =
    typeof block.strokeWidth === "number" && block.strokeWidth > 0
      ? block.strokeWidth
      : CSS_PX_PER_POINT;
  const style = normalizeStrokeStyle(block.strokeStyle);
  const apply = (patch: { color?: string; width?: number; style?: StrokeStyle | "none" }) => {
    const nextStyle = patch.style ?? style;
    onPatch({
      stroke: nextStyle === "none" ? "none" : (patch.color ?? color),
      strokeWidth: nextStyle === "none" ? undefined : (patch.width ?? width),
      strokeStyle: nextStyle === "none" ? undefined : nextStyle,
    });
  };
  const glyph = (
    <span className="note-editor-office-toolbar__color-glyph">
      <OfficeSemanticIcon semanticId="image.border" size={16} />
      <span className="note-editor-office-toolbar__color-underline" style={{ background: color }} />
    </span>
  );
  return (
    <DropdownMenu>
      <OfficeHomeSplitLayout
        testId="presentation-ribbon-camera-border-split"
        primary={
          <OfficeHomeCommand
            variant="compact" icon={glyph} label={t("presentation.cameo.border")} onClick={() => apply({})}
            testId="presentation-ribbon-camera-border-primary"
          />
        }
        trigger={
          <DropdownMenuTrigger asChild>
            <OfficeHomeMenuTrigger
              variant="icon"
              icon={
                <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
              }
              label={t("presentation.cameo.border")}
              testId="presentation-ribbon-camera-border-menu"
            />
          </DropdownMenuTrigger>
        }
      />
      <RibbonDropdownMenuContent align="start" className="note-editor-color-menu" data-testid="presentation-ribbon-camera-border-menu-content">
        <PresentationSwatchGrid
          colors={TEXT_COLOR_VALUES} current={current && current !== "none" ? color : undefined}
          label={t("presentation.cameo.border")} variant="text"
          onPick={(nextColor) => apply({ color: nextColor })}
          testPrefix="presentation-camera-border"
        />
        <DropdownMenuSeparator />
        <ColorMenuClearItem
          label={t("presentation.runTextOutlineClear")} onClear={() => apply({ style: "none" })}
          testId="presentation-camera-border-none"
        />
        <PresentationCustomColorItem
          label={t("presentation.cameo.otherBorderColors")} value={color}
          onPick={(nextColor) => apply({ color: nextColor })}
          testId="presentation-camera-border-custom"
        />
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("presentation.cameo.borderWeight")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {PRESENTATION_CAMERA_BORDER_WEIGHTS.map((points) => (
              <DropdownMenuItem
                key={points} onSelect={() => apply({ width: lineWeightPointsToDesignPx(points) })}
                data-testid={`presentation-camera-border-width-${points}`}
              >
                <PresentationOutlinePreview style="solid" />
                {points} pt
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("presentation.cameo.borderDashes")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {PRESENTATION_CAMERA_BORDER_STYLES.map((nextStyle) => (
              <DropdownMenuItem
                key={nextStyle} onSelect={() => apply({ style: nextStyle })}
                data-testid={`presentation-camera-border-style-${nextStyle}`}
              >
                <PresentationOutlinePreview style={nextStyle} />
                {t(
                  `presentation.shapeOutlineStyle.${nextStyle}` as "presentation.shapeOutlineStyle.solid",
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

export function createPresentationCameoBlock(
  blockId: string,
  slide: SlideModel,
  blocks: readonly PresentationBlock[],
): PresentationShapeBlock {
  return {
    id: blockId,
    type: "shape",
    shape: "rectangle",
    cameo: true,
    ...defaultShapeGeometry("rectangle", slideBounds(slide), blocks),
  };
}

export function canResetPresentationSlideToCameo(slide: SlideModel): boolean {
  return (
    typeof slide.narration === "string" &&
    (slide.blocks.some(isPresentationCameoBlock) ||
      slide.blocks.length < MAX_PRESENTATION_BLOCKS_PER_SLIDE)
  );
}

export type PresentationMediaInputDevice = Readonly<{
  deviceId: string;
  label: string;
}>;

/**
 * Bound and de-duplicate browser media inputs after permission has been
 * granted. Device ids and labels remain session-only and never enter the deck.
 */
export function presentationMediaInputDevices(
  candidates: readonly MediaDeviceInfo[],
  kind: "audioinput" | "videoinput",
  fallbackLabel: string,
): readonly PresentationMediaInputDevice[] {
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (
      candidate.kind !== kind ||
      !candidate.deviceId ||
      seen.has(candidate.deviceId) ||
      seen.size >= 16
    ) {
      return [];
    }
    seen.add(candidate.deviceId);
    return [
      {
        deviceId: candidate.deviceId,
        label:
          candidate.label.trim().slice(0, 120) ||
          `${fallbackLabel} ${seen.size}`,
      },
    ];
  });
}

export function PresentationMicrophoneDeviceMenu({
  className,
  controlId,
  currentLabel,
  defaultLabel,
  devices,
  disabled,
  disabledReason,
  label,
  onSelect,
  selectedId,
  testId,
}: {
  className?: string;
  controlId: string;
  currentLabel: string;
  defaultLabel: string;
  devices: readonly PresentationMediaInputDevice[];
  disabled: boolean;
  disabledReason?: string;
  label: string;
  onSelect: (deviceId: string) => void;
  selectedId: string;
  testId: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <OfficeHomeMenuTrigger
          className={className}
          controlId={controlId}
          disabled={disabled}
          disabledReason={disabledReason}
          displayLabel={currentLabel}
          hasMenuIndicator
          icon={<Mic size={20} />}
          label={`${label}: ${currentLabel}`}
          testId={testId}
        />
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => onSelect("")}
          data-control-id={`${controlId}.DEFAULT`}
          data-selected={!selectedId || undefined}
          data-testid={`${testId}-default`}
        >
          {!selectedId ? <Check size={14} aria-hidden="true" /> : null}
          {defaultLabel}
        </DropdownMenuItem>
        {devices.map((device, index) => (
          <DropdownMenuItem
            key={device.deviceId}
            onSelect={() => onSelect(device.deviceId)}
            data-control-id={`${controlId}.DEVICE`}
            data-selected={selectedId === device.deviceId || undefined}
            data-testid={`${testId}-option-${index}`}
          >
            {selectedId === device.deviceId ? (
              <Check size={14} aria-hidden="true" />
            ) : null}
            {device.label}
          </DropdownMenuItem>
        ))}
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Local-only Cameo preview. The MediaStream never enters page state, history,
 * autosave, collaboration, thumbnails, or export; closing/unmounting stops all
 * tracks. A permission rejection leaves the native placeholder intact.
 */
const CAMEO_PILL_STYLE: CSSProperties = {
  margin: "0 0 8px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: "calc(100% - 16px)",
  minHeight: 28,
  borderRadius: 999,
  border: 0,
  background: "rgba(15,23,42,.62)",
  color: "#fff",
  font: "500 12px/1.2 system-ui, sans-serif",
  padding: "5px 12px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "pointer",
  position: "relative",
};

function CameoPersonFill() {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  // An inner viewBox keeps the person's proportions on any frame.
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#97a9d6" />
          <stop offset="1" stopColor="#d4dcf1" />
        </linearGradient>
        <linearGradient id={`${uid}-person`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f9fe" />
          <stop offset="1" stopColor="#dbe2f4" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${uid}-field)`} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" width="100%" height="100%">
        <g fill={`url(#${uid}-person)`}>
          <ellipse cx="50" cy="40" rx="15" ry="17" />
          <path d="M17 100 C17 75 32 63 50 63 C68 63 83 75 83 100 Z" />
        </g>
      </svg>
    </>
  );
}

export function PresentationCameoSurface({
  interactive,
  requestToken,
  scope = "cameo",
  t,
}: {
  interactive: boolean;
  requestToken?: number;
  scope?: "cameo" | "record-studio";
  t: (key: string) => string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledRequestTokenRef = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "live" | "error"
  >("idle");
  const [cameraDevices, setCameraDevices] = useState<
    ReadonlyArray<{ deviceId: string; label: string }>
  >([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState("");
  const cameraAvailable =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const isRecordStudio = scope === "record-studio";
  const rootTestId = isRecordStudio
    ? "presentation-record-studio-camera"
    : "presentation-cameo";
  const permissionTestId = isRecordStudio
    ? "presentation-record-studio-camera-permission"
    : "presentation-cameo-preview";
  const deviceTestId = isRecordStudio
    ? "presentation-record-studio-camera-options"
    : "presentation-cameo-camera-device";
  const stopTestId = isRecordStudio
    ? "presentation-record-studio-camera-stop"
    : "presentation-cameo-stop";
  const previewLabel = t(
    isRecordStudio
      ? "presentation.record.cameraPermission"
      : "presentation.cameo.preview",
  );

  const stopTracks = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  const release = useCallback(() => {
    stopTracks();
    setCameraDevices([]);
    setSelectedCameraDeviceId("");
    setStatus("idle");
  }, [stopTracks]);

  useEffect(() => stopTracks, [stopTracks]);
  useEffect(() => {
    if (!interactive && status === "live") release();
  }, [interactive, release, status]);

  const preview = useCallback(async (deviceId?: string) => {
    if (
      status === "requesting" ||
      !cameraAvailable
    ) {
      setStatus("error");
      return;
    }
    const hadLiveStream = streamRef.current !== null;
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      if (!videoRef.current) {
        for (const track of stream.getTracks()) track.stop();
        setStatus("idle");
        return;
      }
      stopTracks();
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      const enumerated = navigator.mediaDevices.enumerateDevices
        ? await navigator.mediaDevices.enumerateDevices().catch(() => [])
        : [];
      const cameras = presentationMediaInputDevices(
        enumerated,
        "videoinput",
        t(
          isRecordStudio
            ? "presentation.record.cameraDevice"
            : "presentation.cameo.cameraDevice",
        ),
      );
      const activeDeviceId =
        deviceId ??
        stream.getVideoTracks?.()[0]?.getSettings?.().deviceId ??
        cameras[0]?.deviceId ??
        "";
      setCameraDevices(cameras);
      setSelectedCameraDeviceId(activeDeviceId);
      setStatus("live");
    } catch {
      setStatus(hadLiveStream ? "live" : "error");
    }
  }, [cameraAvailable, isRecordStudio, status, stopTracks, t]);

  useEffect(() => {
    if (
      interactive &&
      requestToken !== undefined &&
      handledRequestTokenRef.current !== requestToken
    ) {
      handledRequestTokenRef.current = requestToken;
      void preview();
    }
  }, [interactive, preview, requestToken]);

  return (
    <div
      className="presentation-cameo"
      data-testid={rootTestId}
      data-camera-status={status}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        display: "grid",
        // The Cameo's stand-in person fills the frame; its controls sit on
        // the lower edge, at the pointer's size whatever the frame's.
        placeItems: isRecordStudio ? "center" : "end center",
        background: isRecordStudio
          ? "linear-gradient(135deg, rgba(15,23,42,.96), rgba(51,65,85,.92))"
          : "#c5d0ea",
        color: "#fff",
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {!isRecordStudio && status !== "live" ? (
        <svg
          aria-hidden="true"
          data-testid="presentation-cameo-placeholder-art"
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
        >
          <CameoPersonFill />
        </svg>
      ) : null}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label={t(
          isRecordStudio
            ? "presentation.record.cameraPreview"
            : "presentation.cameo.preview",
        )}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: status === "live" ? "block" : "none",
        }}
      />
      {status !== "live" && interactive ? (
        <button
          type="button"
          data-control-id={
            isRecordStudio
              ? "PPTCTL.RECORD_STUDIO.CAMERA.PERMISSION"
              : undefined
          }
          data-testid={permissionTestId}
          aria-label={previewLabel}
          disabled={
            !interactive || !cameraAvailable || status === "requesting"
          }
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void preview();
          }}
          style={
            isRecordStudio
              ? {
                  minWidth: 44,
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.7)",
                  background: "rgba(15,23,42,.72)",
                  color: "inherit",
                  padding: "8px 14px",
                  cursor: interactive ? "pointer" : "default",
                }
              : CAMEO_PILL_STYLE
          }
        >
          <Camera size={18} aria-hidden="true" />
          <span>
            {!cameraAvailable
              ? t(
                  isRecordStudio
                    ? "presentation.record.cameraBrowserUnavailable"
                    : "presentation.cameo.unavailable",
                )
              : status === "requesting"
              ? t(
                  isRecordStudio
                    ? "presentation.record.cameraRequesting"
                    : "presentation.cameo.requesting",
                )
              : status === "error"
                ? t(
                    isRecordStudio
                      ? "presentation.record.cameraPermissionDenied"
                      : "presentation.cameo.permissionDenied",
                  )
                : t(
                    isRecordStudio
                      ? "presentation.record.cameraPermission"
                      : "presentation.cameo.preview",
                  )}
          </span>
        </button>
      ) : status !== "live" && isRecordStudio ? (
        <span
          data-testid={`${permissionTestId}-thumbnail`}
          aria-hidden="true"
          style={{
            minWidth: 44,
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.7)",
            background: "rgba(15,23,42,.72)",
            color: "inherit",
            padding: "8px 14px",
          }}
        >
          <Camera size={18} aria-hidden="true" />
          <span>{previewLabel}</span>
        </span>
      ) : status !== "live" ? (
        // A Cameo that is not selected shows only its stand-in, as
        // PowerPoint's does (no button drawn on the slide or thumbnail).
        <span data-testid={`${permissionTestId}-thumbnail`} aria-hidden="true" hidden />
      ) : interactive ? (
        <>
          {cameraDevices.length > 1 ? (
            <label
              style={{
                position: "absolute",
                left: 8,
                bottom: 8,
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.7)",
                background: "rgba(15,23,42,.72)",
                color: "#fff",
                padding: "0 8px",
              }}
            >
              <Camera size={16} aria-hidden="true" />
              <select
                value={selectedCameraDeviceId}
                data-control-id={
                  isRecordStudio
                    ? "PPTCTL.RECORD_STUDIO.CAMERA.OPTIONS"
                    : undefined
                }
                data-testid={deviceTestId}
                aria-label={t(
                  isRecordStudio
                    ? "presentation.record.cameraDevice"
                    : "presentation.cameo.cameraDevice",
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  void preview(event.currentTarget.value);
                }}
                style={{
                  minHeight: 44,
                  maxWidth: isRecordStudio ? 92 : 190,
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                }}
              >
                {cameraDevices.map((device) => (
                  <option
                    key={device.deviceId}
                    value={device.deviceId}
                    style={{ color: "#0f172a" }}
                  >
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            data-testid={stopTestId}
            aria-label={t(
              isRecordStudio
                ? "presentation.record.cameraStop"
                : "presentation.cameo.stop",
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              release();
            }}
            style={
              isRecordStudio
                ? {
                    position: "absolute",
                    right: 8,
                    bottom: 8,
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.7)",
                    background: "rgba(15,23,42,.72)",
                    color: "#fff",
                    cursor: "pointer",
                  }
                : {
                    position: "absolute",
                    right: 6,
                    top: 6,
                    width: 24,
                    height: 24,
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                    borderRadius: 999,
                    border: 0,
                    background: "rgba(15,23,42,.55)",
                    color: "#fff",
                    cursor: "pointer",
                  }
            }
          >
            <X size={isRecordStudio ? 18 : 14} aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}

/** EMU per CSS pixel at 100 % (96 dpi). */
const CAMEO_EMU_PER_PX = 9525;
/** PowerPoint's Camera Style effects: a 15 pt centred shadow at 30 %, a 10 pt
 * soft edge (DrawingML blurRad 190500, softEdge rad 127000). */
const CAMEO_SHADOW_BLUR_PX = 190500 / CAMEO_EMU_PER_PX;
const CAMEO_SOFT_EDGE_PX = 127000 / CAMEO_EMU_PER_PX;

/** The camera's frame shape as a CSS mask: sharp, or with PowerPoint's soft
 * edge -- transparent on the outline, opaque the radius inside it. */
function cameoMaskImage(
  block: PresentationShapeBlock,
  designWidth: number,
  designHeight: number,
): string {
  const kind = normalizeShapeKind(block.shape);
  const box = { x: 0, y: 0, w: 100, h: 100 };
  // Hexagon guides use the frame's own proportions.
  const shapeBox =
    kind === "hexagon" ? { x: 0, y: 0, w: designWidth, h: designHeight } : box;
  const soft = block.softEdge === true;
  const r = CAMEO_SOFT_EDGE_PX;
  const markup = cameoShapeMarkup(kind, shapeBox, (block as { adjustments?: unknown }).adjustments);
  const viewBox = kind === "hexagon" ? `0 0 ${designWidth} ${designHeight}` : "0 0 100 100";
  const vw = kind === "hexagon" ? designWidth : 100;
  const vh = kind === "hexagon" ? designHeight : 100;
  const body = soft
    ? `<defs><filter id="s" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="${((r / 4) / designWidth) * vw} ${((r / 4) / designHeight) * vh}"/></filter></defs><g filter="url(#s)"><g transform="translate(${vw / 2} ${vh / 2}) scale(${Math.max(0, 1 - r / designWidth)} ${Math.max(0, 1 - r / designHeight)}) translate(${-vw / 2} ${-vh / 2})">${markup}</g></g>`
    : markup;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function PresentationCameoGraphic({ block, cropOverride, interactive, t }: {
  block: PresentationShapeBlock;
  cropOverride?: CropRect | null;
  interactive: boolean;
  t: (key: string) => string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const designWidth = Math.max(1, Number(block.width) / CAMEO_EMU_PER_PX || 1);
  const designHeight = Math.max(1, Number(block.height) / CAMEO_EMU_PER_PX || 1);
  // Local pixels per design pixel: the shadow's blur scales with the slide.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const local = root.offsetWidth;
      if (local > 0) setScale(local / designWidth);
    };
    measure();
    const Observer = root.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [designWidth]);
  const crop = cropOverride ?? (block.cropRect as CropRect | undefined);
  const croppedStyle =
    crop && !isIdentityCrop(crop)
      ? (cropToCss(crop) as CSSProperties)
      : ({ position: "absolute", inset: 0 } satisfies CSSProperties);
  const mask = cameoMaskImage(block, designWidth, designHeight);
  const kind = normalizeShapeKind(block.shape);
  // The frame line is drawn by the shared shape renderer over the camera;
  // the camera's own shadow is the Camera Style's centred one, below.
  const outlineBlock = { ...block, shadow: false, softEdge: false } as PresentationShapeBlock;
  const outlined = String(block.stroke ?? "none").toLowerCase() !== "none";

  return (
    <div
      ref={rootRef}
      data-testid="presentation-cameo-graphic"
      data-cameo-shape={kind}
      data-cameo-soft-edge={block.softEdge === true ? "true" : undefined}
      data-cameo-shadow={block.shadow === true ? "true" : undefined}
      style={{ position: "absolute", inset: 0 }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter:
            block.shadow === true
              ? `drop-shadow(0 0 ${(CAMEO_SHADOW_BLUR_PX / 2) * scale}px rgba(0,0,0,0.3))`
              : undefined,
        }}
      >
        <div
          data-testid="presentation-cameo-mask"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
        >
          <div style={croppedStyle}>
            <PresentationCameoSurface interactive={interactive} t={t} />
          </div>
        </div>
      </div>
      {outlined ? (
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <PresentationShapeGraphic block={outlineBlock} suppressFill />
        </span>
      ) : null}
    </div>
  );
}
