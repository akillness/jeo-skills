/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Bullet-list extension carrying a Word/WPS bullet GLYPH style.
 *
 * It extends TipTap's stock `BulletList` (StarterKit's is disabled in the plugin
 * registry, exactly as the ordered list is) with one persisted attribute —
 * `bulletStyle` — that picks the marker glyph (see {@link bulletListStyle}). The
 * attribute round-trips as a `data-bullet-style` HTML attribute on the `<ul>`;
 * the extension supplies the matching closed CSS glyph variable, so the
 * on-screen `::before` marker matches the exporter's numbering.xml.
 *
 * ADDITIVE: a bullet list with no `data-bullet-style` (or the default "disc")
 * behaves exactly as the plain native bullet list always has — byte-for-byte.
 */

import { toggleListInSelectedCells } from "@mrnote/core/web/components/console/editor/native-document/cellSelectionLists.ts";
import type { CommandProps } from "@tiptap/core";
import { toggleListOffAtAnyLevel, togglePartOfOtherList } from "./partialListToggle";
import { BulletList } from "@tiptap/extension-list";

import {
  type BulletStyleType,
  DEFAULT_BULLET_STYLE,
  bulletGlyph,
  normalizeBulletStyle,
} from "@mrnote/core/web/components/console/editor/native-document/bulletListStyle.ts";
import {
  bulletListDefinition,
  type ListLevelAlignment,
} from "@mrnote/core/web/components/console/editor/native-document/listLevelDefinition.ts";
import { selectedHeadings, toggleListAroundHeadings } from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import {
  listParagraphSpacingInputRules,
  withListParagraphSpacing,
} from "@mrnote/core/web/components/console/editor/native-document/listParagraphSpacing.ts";
import { gateInputRulesByAutoCorrect } from "./autoCorrectSettings";

const BULLET_ALIGNMENTS = new Set(["center", "right"]);
/** Word's bullet alignment (`w:lvlJc`); null is the default left. */
export function normalizeBulletAlign(value: unknown): "center" | "right" | null {
  return typeof value === "string" && BULLET_ALIGNMENTS.has(value)
    ? (value as "center" | "right")
    : null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bulletListGlyph: {
      /** Set the bullet glyph style of the bullet list at the selection. */
      setBulletListStyle: (style: BulletStyleType) => ReturnType;
      /**
       * Word's Define New Bullet with Symbol…: any character of any font as
       * the bullet, at an alignment (Left / Centered / Right).
       */
      setBulletListGlyph: (
        glyph: string,
        font: string | null,
        align: ListLevelAlignment,
      ) => ReturnType;
    };
  }
}

/** A CSS string literal for a marker glyph the user never typed here. */
function cssStringLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;
}

/** The custom marker attrs of a bullet list, or null when it uses a gallery style. */
function customBulletOf(attributes: Record<string, unknown>): {
  glyph: string;
  font: string | null;
} | null {
  const glyph = attributes.bulletGlyph;
  if (typeof glyph !== "string" || !glyph) return null;
  const font = attributes.bulletFont;
  return { glyph, font: typeof font === "string" && font ? font : null };
}

export const DocumentBulletList = BulletList.extend({
  // Ctrl+Shift+8 is Word's show/hide formatting marks (wordKeyboardShortcuts.ts).
  addKeyboardShortcuts() {
    const shortcuts = { ...this.parent?.() };
    delete shortcuts["Mod-Shift-8"];
    return shortcuts;
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      /**
       * The numbering level (Word's `w:ilvl`, 0-8) whose gallery bullet this
       * list draws, when its nesting does not say it: Word's List Bullet 2 is
       * a level-0 bullet set further in by its style, and keeps the solid
       * dot. Null: the bullet its nesting gives it.
       */
      listLevel: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-list-level");
          const value = raw === null ? Number.NaN : Number(raw);
          return Number.isInteger(value) && value >= 0 && value <= 8 ? value : null;
        },
        renderHTML: (attributes) => {
          const value = attributes.listLevel;
          return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8
            ? { "data-list-level": String(value) }
            : {};
        },
      },
      bulletStyle: {
        default: DEFAULT_BULLET_STYLE,
        parseHTML: (element) =>
          normalizeBulletStyle(element.getAttribute("data-bullet-style")),
        renderHTML: (attributes) => {
          // A marker the gallery cannot name (Word's "Define New Bullet":
          // any character of any font) is drawn as itself, in its own font.
          const custom = customBulletOf(attributes);
          if (custom) {
            return {
              "data-bullet-style": "custom",
              "data-bullet-glyph": custom.glyph,
              ...(custom.font ? { "data-bullet-font": custom.font } : {}),
              style:
                `--docs-bullet-glyph: ${cssStringLiteral(custom.glyph)}` +
                (custom.font
                  ? `; --docs-bullet-font: ${cssStringLiteral(custom.font)}`
                  : ""),
            };
          }
          const style = normalizeBulletStyle(attributes.bulletStyle);
          // Keep the native disc bullet byte-for-byte: no extra attribute.
          if (style === DEFAULT_BULLET_STYLE) return {};
          return {
            "data-bullet-style": style,
            style: `--docs-bullet-glyph: "${bulletGlyph(style)}"`,
          };
        },
      },
      /**
       * The exact marker character of a bullet outside the gallery, with the
       * font it belongs to. Only an import states these; choosing a gallery
       * style clears them, which is the one edit a save can write back.
       */
      bulletGlyph: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-bullet-glyph"),
        renderHTML: () => ({}),
      },
      bulletFont: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-bullet-font"),
        renderHTML: () => ({}),
      },
      /**
       * A Word picture bullet (`w:lvlPicBulletId`). `"missing"`: the package
       * holds no picture for it, and Word then paints no marker at all (the
       * picture replaces every `w:lvlText` character, ISO/IEC 29500-1
       * §17.9.10, so Word never paints that glyph). Only an import states
       * this; choosing a gallery style replaces the picture, exactly as it
       * clears a custom glyph.
       */
      /** Define New Bullet > Alignment (`w:lvlJc`), null = left. */
      bulletAlign: {
        default: null,
        parseHTML: (element) =>
          normalizeBulletAlign(element.getAttribute("data-bullet-align")),
        renderHTML: (attributes) => {
          const align = normalizeBulletAlign(attributes.bulletAlign);
          return align ? { "data-bullet-align": align } : {};
        },
      },
      bulletPicture: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-bullet-picture") === "missing"
            ? "missing"
            : null,
        renderHTML: (attributes) =>
          attributes.bulletPicture === "missing"
            ? { "data-bullet-picture": "missing" }
            : {},
      },
    };
  },

  addInputRules() {
    return gateInputRulesByAutoCorrect(listParagraphSpacingInputRules(this.parent?.() ?? []), "automaticBulletedLists");
  },

  addCommands() {
    const parent = this.parent?.() as Record<
      string,
      (...args: unknown[]) => (props: CommandProps) => boolean
    >;
    const name = this.name;
    return {
      ...parent,
      // Word keeps a heading a heading when Bullets is applied to it, and
      // gives a paragraph List Paragraph's spacing.
      toggleBulletList:
        () =>
        (props: CommandProps) => {
          const one = () =>
            props.commands.toggleHeadingList("bullet") ||
            toggleListAroundHeadings(props, "bullet", () =>
              withListParagraphSpacing(props, () => parent.toggleBulletList()(props)),
            ) ||
            // Some items of a list of the other kind: only they change (Word).
            togglePartOfOtherList(props, "bulletList") ||
            // Items of a list of this kind leave it, at any level (WUA 036).
            withListParagraphSpacing(props, () => toggleListOffAtAnyLevel(props, "bulletList")) ||
            withListParagraphSpacing(props, () => parent.toggleBulletList()(props));
          // Cells selected as cells each take the list (WUA 243).
          return toggleListInSelectedCells(props, "bulletList", one) ?? one();
        },
      setBulletListStyle:
        (style: BulletStyleType) =>
        ({ commands, state }: CommandProps) => {
          if (selectedHeadings(state))
            return commands.setHeadingListStyle("bullet", normalizeBulletStyle(style));
          return commands.updateAttributes(name, {
            bulletStyle: normalizeBulletStyle(style),
            bulletGlyph: null,
            bulletFont: null,
            bulletAlign: null,
            bulletPicture: null,
          });
        },
      setBulletListGlyph:
        (glyph: string, font: string | null, align: ListLevelAlignment) =>
        ({ commands, state }: CommandProps) => {
          const glyphs = Array.from(glyph);
          if (glyphs.length < 1 || glyphs.length > 4 || /[\u0000-\u001f%]/u.test(glyph))
            return false;
          if (selectedHeadings(state)) {
            return commands.setHeadingListDefinition(
              bulletListDefinition(glyph, font, align),
            );
          }
          return commands.updateAttributes(name, {
            bulletStyle: DEFAULT_BULLET_STYLE,
            bulletGlyph: glyph,
            bulletFont: font,
            bulletAlign: align === "left" ? null : align,
            bulletPicture: null,
          });
        },
    };
  },
});

export default DocumentBulletList;
