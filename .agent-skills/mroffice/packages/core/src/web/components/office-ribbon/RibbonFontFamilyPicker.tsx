"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { RibbonDropdownMenuContent, RibbonDropdownMenuSubContent } from "./CupertinoRibbonMenu";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import {
  officeFormatPreviewHandlers,
  useOfficeFormatPreview,
} from "./officeFormatPreview";
import { useOfficeRibbonCommandGate } from "./officeRibbonCommandGate";
import {
  OFFICE_FONT_PINNED_LIMIT,
  OFFICE_FONT_PREFERENCES_VERSION,
  OFFICE_FONT_RECENT_LIMIT,
  isOfficeSymbolFontFamily,
  officePrimaryFontFamily,
  officeVerifiedFontVariant,
  type OfficeFontVariant,
  type OfficeLocalFontRecord,
} from "./officeTypographyCatalog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import styles from "./RibbonFontFamilyPicker.module.css";
import { officeFontFaceFamily, registerOfficeFontFace } from "./officeFontFace";
import {
  ensureOfficeFontFaces,
  officeFontDeclared,
  officeFontFamilies,
  officeFontSubstitutes,
} from "../../lib/office-fonts/substitutes";
import { compareFontLabelsEastAsianFirst, officeFamilyLocalizedName } from "../../lib/office-fonts/localized-names";
import type { OfficeFontFace } from "./officeFontFace";
import { fontAssetStatus, setOfficeFontAssetCatalog, subscribeFontAssetStatus } from "./officeFontAssets";
import {
  officeFontVariantOrder,
  resolveOfficeLocalFontVariant,
} from "./officeFontMetadata";

export type RibbonFontAvailability =
  | "available"
  | "missing"
  | "unverified";

export interface RibbonFontFamilyOption {
  id: string;
  label: string;
  value: string | null;
  previewFamily?: string;
  selected?: boolean;
  testId?: string;
  availability?: RibbonFontAvailability;
  verifiedVariants?: readonly OfficeFontVariant[];
}

export interface RibbonFontFamilySection {
  id: string;
  label?: string;
  options: readonly RibbonFontFamilyOption[];
}

/** A theme font row: the document theme's heading (major) or body (minor) font. */
export interface RibbonThemeFontOption extends RibbonFontFamilyOption {
  role: "heading" | "body";
}

/**
 * The Theme Fonts section Office lists first ("Aptos Narrow (Headings)",
 * "Aptos Narrow (Body)"). Each editor supplies its own document theme's fonts
 * and decides what choosing one writes: a theme font is a binding to the
 * theme, not the family name.
 */
export interface RibbonThemeFontsSection {
  label: string;
  options: readonly RibbonThemeFontOption[];
  onSelect: (role: RibbonThemeFontOption["role"]) => void;
}

export interface RibbonFontPickerLabels {
  browse: string;
  search: string;
  searchPlaceholder: string;
  recent: string;
  pinned: string;
  officeFonts: string;
  allFonts: string;
  pin: string;
  unpin: string;
  available: string;
  missing: string;
  unverified: string;
  browseUnsupported: string;
  browseDenied: string;
  browseFailed: string;
  noResults: string;
  variants: string;
  mixed: string;
}

export type RibbonFontEntryKind =
  | "trigger"
  | "search"
  | "browse"
  | "section"
  | "variants"
  | "pin"
  | "unpin";

export interface RibbonFontFamilyPickerProps {
  label: string;
  /** Semantic font-family command shared by parameterized portal entries. */
  controlId?: string;
  /** Physical ribbon surface used with occurrence IDs to distinguish aliases. */
  controlSurface?: string;
  optionOccurrenceId?: (
    option: RibbonFontFamilyOption,
    sectionId: string,
  ) => string;
  optionControlId?: (
    option: RibbonFontFamilyOption,
    sectionId: string,
  ) => string | undefined;
  variantOccurrenceId?: (
    option: RibbonFontFamilyOption,
    variant: OfficeFontVariant,
    sectionId: string,
  ) => string;
  variantControlId?: (
    option: RibbonFontFamilyOption,
    variant: OfficeFontVariant,
    sectionId: string,
  ) => string | undefined;
  entryOccurrenceId?: (kind: RibbonFontEntryKind, id?: string) => string;
  auxiliaryControlId?: (
    kind: RibbonFontEntryKind,
    id?: string,
  ) => string | undefined;
  activeLabel: string;
  activeFontFamily?: string;
  activeFontFace?: OfficeFontFace | null;
  sections: readonly RibbonFontFamilySection[];
  onSelect: (value: string | null) => void;
  onSelectVariant?: (variant: OfficeFontVariant) => void;
  /** Adapter explicitly supports portable legacy-family weighted faces. */
  allowNamedWeightVariants?: boolean;
  onRememberSelection?: () => void;
  /** Marks the portalled menu as owned by an active object-selection surface. */
  retainObjectSelection?: boolean;
  testId: string;
  className?: string;
  disabled?: boolean;
  mixed?: boolean;
  /** Opts into the modern picker and isolates recent/pinned state per editor. */
  preferenceScope?: string;
  labels?: RibbonFontPickerLabels;
  /** Theme/current/document-used families placed before behavioral MRU. */
  priorityFamilies?: readonly string[];
  /**
   * The document theme's fonts, listed first. When given, the picker follows
   * Office's layout: Theme Fonts, Recently Used Fonts, then All Fonts (the
   * host's catalog merged into All Fonts rather than listed again).
   */
  themeFonts?: RibbonThemeFontsSection;
  /** Names the list shows for families (宋体 for SimSun in a Chinese
   * interface); the value chosen is still the family. */
  familyLabels?: Readonly<Record<string, string>>;
  /** WPS's All Fonts order for a Chinese interface: families named in
   * Chinese first, in pinyin order, then the rest. */
  eastAsianFirst?: boolean;
  /** Where the browser cannot read installed fonts (Safari, Firefox):
   * families Browse looks for by drawing them, listing those this computer
   * has (the host sets text in them as it can). */
  systemFamilyCandidates?: readonly string[];
}

/** The candidates this computer draws in a face of their own: a text drawn
 * in the family falling back to a generic family measures otherwise than in
 * the generic family alone. */
function drawnSystemFamilies(candidates: readonly string[]): string[] {
  if (typeof document === "undefined") return [];
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [];
  const sample = "mmmmmmmmmmlli永和中文WwQ@";
  const width = (font: string) => { context.font = font; return context.measureText(sample).width; };
  const generics = ["monospace", "serif", "sans-serif"];
  const base = generics.map((generic) => width(`72px ${generic}`));
  return candidates.filter((family) =>
    generics.some((generic, index) => Math.abs(width(`72px ${JSON.stringify(family)}, ${generic}`) - base[index]) > 0.5));
}

interface FontPreferences {
  version: typeof OFFICE_FONT_PREFERENCES_VERSION;
  recent: string[];
  pinned: string[];
}

type BrowseState = "idle" | "unsupported" | "denied" | "failed";

interface LocalFontAccessWindow extends Window {
  queryLocalFonts?: () => Promise<OfficeLocalFontRecord[]>;
}

const NO_FAMILY_LABELS: Readonly<Record<string, string>> = Object.freeze({});

const EMPTY_PREFERENCES: FontPreferences = {
  version: OFFICE_FONT_PREFERENCES_VERSION,
  recent: [],
  pinned: [],
};

/**
 * The menu's body, built only while Radix has the content mounted. As plain
 * JSX children the hundreds of family rows were built on every render of the
 * picker — every selection move of the host editor — and discarded unread.
 */
function RenderWhenMounted({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function fontPreferenceKey(scope: string) {
  return `mrnote:office-font-picker:${scope}:v${OFFICE_FONT_PREFERENCES_VERSION}`;
}

function boundedStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0 && entry.length <= 256,
      ),
    ),
  ).slice(0, limit);
}

function readFontPreferences(scope?: string): FontPreferences {
  if (!scope || typeof window === "undefined") return EMPTY_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(fontPreferenceKey(scope));
    if (!raw) return EMPTY_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<FontPreferences>;
    if (parsed.version !== OFFICE_FONT_PREFERENCES_VERSION) {
      return EMPTY_PREFERENCES;
    }
    return {
      version: OFFICE_FONT_PREFERENCES_VERSION,
      recent: boundedStrings(parsed.recent, OFFICE_FONT_RECENT_LIMIT),
      pinned: boundedStrings(parsed.pinned, OFFICE_FONT_PINNED_LIMIT).filter(
        (entry) =>
          entry.startsWith("family:") || entry.startsWith("variant:"),
      ),
    };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

// True only once the component is past hydration. The server has no document
// to probe, so it renders "unverified"; the client's FIRST render must say the
// same, or the trigger's data-font-availability, title and label font differ
// from the server HTML and React reports a hydration mismatch. After
// hydration the store's client snapshot takes over and the real probe runs.
const subscribeToNothing = () => () => {};
function useFontProbeReady(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function availabilityFor(
  option: RibbonFontFamilyOption,
  verifiedFamilies: ReadonlySet<string> | null,
  probeReady: boolean,
): RibbonFontAvailability {
  if (option.availability) return option.availability;
  const stack = option.previewFamily ?? option.value;
  if (!stack) return "available";
  const family = officePrimaryFontFamily(stack);
  // A family the product serves itself, or names a served stand-in for,
  // renders here whatever the machine has installed.
  if (probeReady && officeFontSubstitutes(family).length > 0) {
    ensureOfficeFontFaces(family);
    return "available";
  }
  if (probeReady && officeFontDeclared(family)) return "available";
  if (verifiedFamilies) {
    return verifiedFamilies.has(family.toLocaleLowerCase())
      ? "available"
      : "missing";
  }
  if (
    !probeReady ||
    typeof document === "undefined" ||
    !document.fonts?.check
  ) {
    return "unverified";
  }
  try {
    return document.fonts.check(`12px ${JSON.stringify(family)}`)
      ? "available"
      : "unverified";
  } catch {
    return "unverified";
  }
}

function variantPinId(variant: OfficeFontVariant) {
  return `variant:${variant.id}`;
}

function familyPinId(value: string) {
  return `family:${value}`;
}

/** The last "All Fonts" list built, by what it was built from. A host passes
 * its sections inline (new on every ribbon repaint), and this list is a
 * collation sort over every Office family: rows equal by content reuse it. */
let allFontOptionsCache: { key: string; options: RibbonFontFamilyOption[] } | null = null;

function mergedAllFontOptions(
  catalogOptions: readonly RibbonFontFamilyOption[],
  localFonts: readonly OfficeLocalFontRecord[] | null,
  hasThemeFonts: boolean,
  familyLabels: Readonly<Record<string, string>> = {},
  eastAsianFirst = false,
): RibbonFontFamilyOption[] {
  // Installed fonts only arrive after the explicit Browse action; that list
  // is built as before, uncached.
  const cacheKey = localFonts
    ? null
    : `${hasThemeFonts ? 1 : 0}${eastAsianFirst ? 1 : 0}${JSON.stringify(familyLabels)}${JSON.stringify(catalogOptions)}`;
  if (cacheKey !== null && allFontOptionsCache?.key === cacheKey) return allFontOptionsCache.options;
  const seen = new Set<string>();
  const options: RibbonFontFamilyOption[] = [];

  // "All fonts" must remain useful before the browser grants local-font
  // access. Seed it with the shared Office catalog, then merge any additional
  // installed families discovered through the explicit Browse action.
  // A family the catalog lists twice -- as itself and under a set's name
  // (Docs' 字体集 "现代" is the Arial stack) -- is listed as itself: All
  // Fonts named Arial "现代" and the box showed it so (the set keeps its own
  // row in its own section).
  const named = new Map<string, RibbonFontFamilyOption>();
  for (const option of catalogOptions) {
    const stack = option.previewFamily ?? option.value;
    if (!stack || typeof option.value !== "string") continue;
    const family = officePrimaryFontFamily(stack);
    const key = family.toLocaleLowerCase();
    const known = named.get(key);
    const ownName = (candidate: RibbonFontFamilyOption) =>
      candidate.label === family ||
      (typeof candidate.value === "string" && familyLabels[candidate.value] === candidate.label);
    if (!known || (!ownName(known) && ownName(option))) named.set(key, option);
  }
  for (const option of catalogOptions) {
    const stack = option.previewFamily ?? option.value;
    if (!stack || typeof option.value !== "string") continue;
    const key = officePrimaryFontFamily(stack).toLocaleLowerCase();
    if (seen.has(key) || named.get(key) !== option) continue;
    seen.add(key);
    options.push({
      ...option,
      ...(typeof option.value === "string" && familyLabels[option.value] ? { label: familyLabels[option.value] } : {}),
      id: `catalog-${option.id}`,
      // With theme fonts the catalog is listed only here, so its rows keep
      // the host's test ids; otherwise the catalog section owns them.
      testId: hasThemeFonts ? option.testId : undefined,
    });
  }

  for (const font of localFonts ?? []) {
    const key = font.family.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      id: `local-${font.family}`,
      label: font.family,
      value: font.family,
      previewFamily: font.family,
      availability: "available",
    });
  }
  // Office's own families render everywhere through the served stand-ins
  // (lib/office-fonts), so All Fonts lists them like Office does.
  for (const family of officeFontFamilies()) {
    const key = family.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      id: `office-${family}`,
      label: familyLabels[family] ?? family,
      value: family,
      previewFamily: family,
      availability: "available",
    });
  }
  options.sort(eastAsianFirst
    ? (left, right) => compareFontLabelsEastAsianFirst(left.label, right.label)
    : (left, right) => left.label.localeCompare(right.label));
  if (cacheKey !== null) allFontOptionsCache = { key: cacheKey, options };
  return options;
}

/**
 * Shared modern font picker. Without `labels` + `preferenceScope` it keeps the
 * compact legacy menu used by adapters that have not yet adopted rich font
 * discovery. Rich adapters gain isolated MRU/pins, fail-closed local-font
 * discovery and executable, verified variants without changing edit authority.
 */
export function RibbonFontFamilyPicker({
  label,
  controlId,
  controlSurface,
  optionOccurrenceId,
  optionControlId,
  variantOccurrenceId,
  variantControlId,
  entryOccurrenceId,
  auxiliaryControlId,
  activeLabel,
  activeFontFamily,
  activeFontFace,
  sections,
  onSelect,
  onSelectVariant,
  allowNamedWeightVariants = false,
  onRememberSelection,
  retainObjectSelection = false,
  testId,
  className,
  disabled: disabledProp = false,
  mixed = false,
  preferenceScope: preferenceScopeProp,
  labels,
  priorityFamilies = [],
  themeFonts,
  familyLabels = NO_FAMILY_LABELS,
  eastAsianFirst = false,
  systemFamilyCandidates,
}: RibbonFontFamilyPickerProps) {
  // The host's selection gate, by the picker's test id: a font the selected
  // object cannot take greys the picker like any other ribbon control.
  const gate = useOfficeRibbonCommandGate(testId, disabledProp, undefined);
  const disabled = gate.disabled ?? false;
  // Live Preview: a family under the pointer or the keyboard focus shows on
  // the host's selection until it leaves, the menu closes or one is chosen.
  const formatPreview = useOfficeFormatPreview();
  // Set false the moment the menu closes: its rows animate out under the
  // pointer and must not preview any more.
  const menuOpenRef = useRef(false);
  const menuIsOpen = useCallback(() => menuOpenRef.current, []);
  // Every editor gets the same picker: labels turn on the Office layout
  // (Theme Fonts, Recently Used Fonts, Pinned, All Fonts, search, Browse),
  // and recent / pinned state lives per editor, or in a shared scope.
  const rich = Boolean(labels);
  const preferenceScope = preferenceScopeProp ?? (labels ? "office" : undefined);
  const assetStatus = useSyncExternalStore(subscribeFontAssetStatus, () => fontAssetStatus(activeFontFace?.asset), () => "unverified");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [browseState, setBrowseState] = useState<BrowseState>("idle");
  const [localFonts, setLocalFonts] = useState<OfficeLocalFontRecord[] | null>(
    null,
  );
  const [namedVariants, setNamedVariants] = useState<
    ReadonlyMap<string, OfficeFontVariant>
  >(new Map());
  const fontDiscoveryGeneration = useRef(0);
  useEffect(
    () => () => {
      fontDiscoveryGeneration.current += 1;
    },
    [],
  );
  const [preferences, setPreferences] = useState<FontPreferences>(() =>
    readFontPreferences(preferenceScope),
  );
  const [collapsedSections, setCollapsedSections] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const restoreTriggerOnCloseRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuId = `${testId}-menu`;

  useEffect(() => {
    if (!preferenceScope || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        fontPreferenceKey(preferenceScope),
        JSON.stringify(preferences),
      );
    } catch {
      // Storage can be unavailable in private/restricted contexts. The picker
      // remains functional for the current session without claiming persistence.
    }
  }, [preferenceScope, preferences]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open || !rich) return;
    const frame = window.requestAnimationFrame(() =>
      searchInputRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open, rich]);

  const catalogOptions = useMemo(() => {
    // One row per value, and a value two sections list -- the family as
    // itself and under a set's name (Docs' 字体集 "现代" is the Arial stack)
    // -- is the family's own row: the Office list named Arial "现代", and
    // searching Arial found only "现代".
    const preferred = new Map<string, RibbonFontFamilyOption>();
    const ownName = (option: RibbonFontFamilyOption) =>
      typeof option.value === "string" &&
      (option.label === officePrimaryFontFamily(option.value) || familyLabels[option.value] === option.label);
    for (const section of sections) {
      for (const option of section.options) {
        const key = option.value ?? `null:${option.id}`;
        const known = preferred.get(key);
        if (!known || (!ownName(known) && ownName(option))) preferred.set(key, option);
      }
    }
    const seen = new Set<string>();
    const result: RibbonFontFamilyOption[] = [];
    for (const section of sections) {
      for (const option of section.options) {
        const key = option.value ?? `null:${option.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(preferred.get(key) ?? option);
      }
    }
    return result;
  }, [familyLabels, sections]);
  const hasThemeFonts = Boolean(themeFonts);

  const fontProbeReady = useFontProbeReady();
  const verifiedFamilies = useMemo<ReadonlySet<string> | null>(() => {
    if (!localFonts) return null;
    return new Set(localFonts.map((font) => font.family.toLocaleLowerCase()));
  }, [localFonts]);

  const discoveredVariants = useMemo(() => {
    const variants = new Map<string, OfficeFontVariant[]>();
    if (!localFonts) return variants;
    for (const font of localFonts) {
      const variant =
        (allowNamedWeightVariants
          ? namedVariants.get(font.postscriptName)
          : undefined) ?? officeVerifiedFontVariant(font);
      if (!variant) continue;
      const key = font.family.toLocaleLowerCase();
      const familyVariants = variants.get(key) ?? [];
      if (!familyVariants.some((entry) => entry.id === variant.id)) {
        familyVariants.push(variant);
      }
      variants.set(key, familyVariants);
    }
    for (const entries of variants.values())
      entries.sort(
        (left, right) =>
          officeFontVariantOrder(left) - officeFontVariantOrder(right) ||
          left.label.localeCompare(right.label),
      );
    return variants;
  }, [allowNamedWeightVariants, localFonts, namedVariants]);

  const allFontOptions = useMemo(
    () => mergedAllFontOptions(catalogOptions, localFonts, hasThemeFonts, familyLabels, eastAsianFirst),
    [catalogOptions, localFonts, hasThemeFonts, familyLabels, eastAsianFirst],
  );

  const optionByValue = useMemo(
    () =>
      new Map(
        [...catalogOptions, ...allFontOptions]
          .filter(
            (option): option is RibbonFontFamilyOption & { value: string } =>
              typeof option.value === "string",
          )
          .map((option) => [option.value, option]),
      ),
    [allFontOptions, catalogOptions],
  );

  const variantsFor = useCallback(
    (option: RibbonFontFamilyOption): readonly OfficeFontVariant[] => {
      if (option.verifiedVariants) return option.verifiedVariants;
      const stack = option.previewFamily ?? option.value;
      if (!stack) return [];
      return (
        discoveredVariants.get(
          officePrimaryFontFamily(stack).toLocaleLowerCase(),
        ) ?? []
      );
    },
    [discoveredVariants],
  );

  const persistRecent = useCallback((value: string) => {
    setPreferences((current) => ({
      ...current,
      recent: [value, ...current.recent.filter((entry) => entry !== value)].slice(
        0,
        OFFICE_FONT_RECENT_LIMIT,
      ),
    }));
  }, []);

  const togglePinned = useCallback((id: string) => {
    setPreferences((current) => ({
      ...current,
      pinned: current.pinned.includes(id)
        ? current.pinned.filter((entry) => entry !== id)
        : [id, ...current.pinned].slice(0, OFFICE_FONT_PINNED_LIMIT),
    }));
  }, []);

  const selectFamily = useCallback(
    (option: RibbonFontFamilyOption) => {
      formatPreview.clearPreview();
      menuOpenRef.current = false;
      if (typeof option.value === "string") persistRecent(option.value);
      onSelect(option.value);
    },
    [formatPreview, onSelect, persistRecent],
  );

  const selectVariant = useCallback(
    (variant: OfficeFontVariant) => {
      formatPreview.clearPreview();
      menuOpenRef.current = false;
      persistRecent(variant.sourceFamily ?? variant.family);
      onSelectVariant?.(variant);
    },
    [formatPreview, onSelectVariant, persistRecent],
  );

  const browseLocalFonts = useCallback(async () => {
    const generation = ++fontDiscoveryGeneration.current;
    const queryLocalFonts = (window as LocalFontAccessWindow).queryLocalFonts;
    if (!queryLocalFonts) {
      // The families this computer draws, found by drawing them; the
      // reader is still told the browser cannot read its fonts.
      const drawn = systemFamilyCandidates?.length ? drawnSystemFamilies(systemFamilyCandidates) : [];
      if (drawn.length) {
        setLocalFonts(drawn.map((family) => ({ family, fullName: family, postscriptName: "", style: "Regular" })));
      }
      setBrowseState("unsupported");
      return;
    }
    try {
      const fonts = await queryLocalFonts();
      const accepted = fonts
        .filter(
          (font) =>
            typeof font.family === "string" &&
            font.family.length > 0 &&
            font.family.length <= 256 &&
            typeof font.fullName === "string" &&
            font.fullName.length > 0 &&
            font.fullName.length <= 256 &&
            typeof font.postscriptName === "string" &&
            font.postscriptName.length <= 256 &&
            typeof font.style === "string" &&
            font.style.length <= 80,
        );
      if (generation !== fontDiscoveryGeneration.current) return;
      // FontData may retain a materialised native font blob. State needs only
      // names; release processed FontData records instead of retaining binaries.
      setLocalFonts(accepted.map(({ family, fullName, postscriptName, style }) => ({ family, fullName, postscriptName, style })));
      fonts.length = 0;
      setNamedVariants(new Map());
      setBrowseState("idle");
      if (allowNamedWeightVariants) {
        const resolved = new Map<string, OfficeFontVariant>();
        while (accepted.length) {
          const font = accepted.shift()!;
          if (generation !== fontDiscoveryGeneration.current) return;
          const variant = await resolveOfficeLocalFontVariant(font);
          if (variant) {
            resolved.set(font.postscriptName, variant);
          }
        }
        if (generation === fontDiscoveryGeneration.current) {
          setOfficeFontAssetCatalog(resolved.values());
          setNamedVariants(resolved);
        }
      }
    } catch (error) {
      if (generation !== fontDiscoveryGeneration.current) return;
      setBrowseState(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "denied"
          : "failed",
      );
    }
  }, [allowNamedWeightVariants, systemFamilyCandidates]);

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  // Office filters the list from the first character typed.
  const searchActive = normalizedQuery.length >= 1;
  // The name shown, and the font's own name: a localized or descriptive
  // label ("经典" for Times New Roman) must not hide the font from someone
  
  // the font; its fallbacks would match unrelated entries.
  const matchesSearch = useCallback(
    (option: RibbonFontFamilyOption) => {
      if (!searchActive) return true;
      if (option.label.toLocaleLowerCase().includes(normalizedQuery)) return true;
      const family = option.value ?? option.previewFamily;
      if (typeof family !== "string") return false;
      const primary = officePrimaryFontFamily(family);
      // …and the name a Chinese system gives it (黑体 is SimHei), whatever
      // the interface's language, as Word and WPS find it by either name.
      const localized = officeFamilyLocalizedName(primary);
      return (
        primary.toLocaleLowerCase().includes(normalizedQuery) ||
        (localized !== null && localized.toLocaleLowerCase().includes(normalizedQuery))
      );
    },
    [normalizedQuery, searchActive],
  );

  const recentOptions = Array.from(
    new Set([...priorityFamilies, ...preferences.recent]),
  )
    .slice(0, OFFICE_FONT_RECENT_LIMIT)
    .map((value) => {
      const known = optionByValue.get(value);
      return known
        ? { ...known, testId: undefined }
        : {
            id: `priority-${value}`,
            label: ribbonFontFamilyLabel(value, familyLabels),
            value,
            previewFamily: value,
          };
    });
  const pinnedFamilies = preferences.pinned
    .filter((id) => id.startsWith("family:"))
    .map((id) => {
      const value = id.slice("family:".length);
      const known = optionByValue.get(value);
      return known
        ? { ...known, testId: undefined }
        : {
            id: `pinned-${value}`,
            label: ribbonFontFamilyLabel(value, familyLabels),
            value,
            previewFamily: value,
          };
    });
  const pinnedVariants = preferences.pinned
    .filter((id) => id.startsWith("variant:"))
    .flatMap((id) => {
      const variantId = id.slice("variant:".length);
      for (const option of optionByValue.values()) {
        const variant = variantsFor(option).find(
          (entry) => entry.id === variantId,
        );
        if (variant) return [{ option, variant }];
      }
      return [];
    });

  const browseMessage = labels
    ? browseState === "unsupported"
      ? labels.browseUnsupported
      : browseState === "denied"
        ? labels.browseDenied
        : browseState === "failed"
          ? labels.browseFailed
          : null
    : null;
  const activeAvailability =
    !mixed && (assetStatus === "available" || assetStatus === "missing") ? assetStatus : mixed || !activeFontFamily
      ? "unverified"
      : availabilityFor(
          {
            id: "active",
            label: activeLabel,
            value: activeFontFamily,
            previewFamily: activeFontFamily,
          },
          verifiedFamilies,
          fontProbeReady,
        );
  const resolvedActiveLabel = mixed && labels ? labels.mixed : activeLabel;

  const pinKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    pinId: string,
  ) => {
    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    togglePinned(pinId);
  };

  const availabilityLabel = (availability: RibbonFontAvailability) => {
    if (!labels) return "";
    return availability === "available"
      ? labels.available
      : availability === "missing"
        ? labels.missing
        : labels.unverified;
  };

  const renderPinButton = (
    pinId: string,
    itemLabel: string,
    occurrenceContext: string,
  ) => {
    if (!labels) return null;
    const pinned = preferences.pinned.includes(pinId);
    const action = pinned ? labels.unpin : labels.pin;
    return (
      <button
        type="button"
        className={styles.pinButton}
        data-pinned={pinned || undefined}
        aria-label={`${action}: ${itemLabel}`}
        title={`${action}: ${itemLabel}`}
        data-control-id={
          controlSurface
            ? auxiliaryControlId?.(
                pinned ? "unpin" : "pin",
                occurrenceContext,
              )
            : undefined
        }
        data-control-role={controlSurface ? "auxiliary-session" : undefined}
        data-control-occurrence-id={
          controlSurface
            ? (entryOccurrenceId?.(
                pinned ? "unpin" : "pin",
                occurrenceContext,
              ) ?? `${pinned ? "unpin" : "pin"}:${occurrenceContext}`)
            : undefined
        }
        data-control-surface={controlSurface}
        data-testid={`${testId}-${pinned ? "unpin" : "pin"}-${pinId.replace(/[^a-z0-9]+/gi, "-")}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          togglePinned(pinId);
        }}
      >
        <OfficeSemanticIcon
          semanticId={pinned ? "font.unpin" : "font.pin"}
          size={15}
        />
      </button>
    );
  };

  const renderVariant = (
    option: RibbonFontFamilyOption,
    variant: OfficeFontVariant,
    sectionId: string,
  ) => {
    const pinId = variantPinId(variant);
    if (variant.fontFace) registerOfficeFontFace(variant.fontFace);
    return (
      <div className={styles.variantRow} key={variant.id}>
        <DropdownMenuItem
          className={styles.variantItem}
          data-control-id={
            controlSurface
              ? variantControlId?.(option, variant, sectionId)
              : undefined
          }
          data-control-occurrence-id={
            controlSurface
              ? (variantOccurrenceId?.(option, variant, sectionId) ??
                `variant:${sectionId}:${option.id}:${variant.id}`)
              : undefined
          }
          data-control-surface={controlSurface}
          onKeyDown={(event) => pinKeyDown(event, pinId)}
          onSelect={() => selectVariant(variant)}
          data-testid={`${testId}-variant-${variant.id}`}
        >
          <span
            className={styles.variantName}
            style={{
              fontFamily: variant.fontFace ? `"${variant.postscriptName}", "${officeFontFaceFamily(variant.fontFace)}"` : variant.family,
              fontWeight: variant.bold ? 700 : 400,
              fontStyle: variant.italic ? "italic" : "normal",
            }}
          >
            {variant.label}
          </span>
          <span className={styles.variantMeta}>
            {variant.bold ? "B" : ""}
            {variant.italic ? "I" : ""}
          </span>
        </DropdownMenuItem>
        {renderPinButton(
          pinId,
          `${option.label} ${variant.label}`,
          `${sectionId}:${option.id}:${pinId}`,
        )}
      </div>
    );
  };

  // An option the host did not mark (a recent, pinned or browsed family) is
  // checked when it is the font the selection actually shows.
  const activePrimaryFamily =
    !mixed && activeFontFamily
      ? officePrimaryFontFamily(activeFontFamily).toLocaleLowerCase()
      : null;
  const optionSelected = (option: RibbonFontFamilyOption) =>
    option.selected ??
    (activePrimaryFamily !== null &&
      typeof option.value === "string" &&
      officePrimaryFontFamily(option.value).toLocaleLowerCase() ===
        activePrimaryFamily);

  const renderFamily = (
    option: RibbonFontFamilyOption,
    keyPrefix: string,
    themeRole?: RibbonThemeFontOption["role"],
  ) => {
    const familyValue = typeof option.value === "string" ? option.value : null;
    const pinId = familyValue && !themeRole ? familyPinId(familyValue) : null;
    const availability = availabilityFor(option, verifiedFamilies, fontProbeReady);
    const variants = themeRole ? [] : variantsFor(option);
    // A symbol face (Wingdings, Webdings) would set its own name as
    // pictograms, so its row keeps the UI face, as Office's list does.
    const previewFamily =
      availability === "available" && !isOfficeSymbolFontFamily(option.previewFamily ?? familyValue)
        ? (option.previewFamily ?? familyValue ?? undefined)
        : undefined;
    return (
      <div className={styles.fontRow} key={`${keyPrefix}-${option.id}`}>
        <DropdownMenuItem
          className={styles.fontItem}
          data-control-id={
            controlSurface ? optionControlId?.(option, keyPrefix) : undefined
          }
          data-control-occurrence-id={
            controlSurface
              ? (optionOccurrenceId?.(option, keyPrefix) ??
                `option:${keyPrefix}:${option.id}`)
              : undefined
          }
          data-control-surface={controlSurface}
          data-testid={option.testId}
          {...officeFormatPreviewHandlers(
            formatPreview,
            (themeRole ? (option.previewFamily ?? familyValue) : familyValue)
              ? {
                  fontFamily: (themeRole
                    ? (option.previewFamily ?? familyValue)
                    : familyValue)!,
                }
              : null,
            menuIsOpen,
          )}
          onKeyDown={(event) => {
            if (pinId) pinKeyDown(event, pinId);
          }}
          onSelect={() => {
            if (themeRole && themeFonts) {
              formatPreview.clearPreview();
              menuOpenRef.current = false;
              themeFonts.onSelect(themeRole);
            } else {
              selectFamily(option);
            }
          }}
        >
          <span className={styles.check}>
            {optionSelected(option) ? (
              <OfficeSemanticIcon semanticId="selection.check" size={13} />
            ) : null}
          </span>
          <span className={styles.fontIdentity}>
            <span className={styles.fontName} style={{ fontFamily: previewFamily }}>
              {option.label}
            </span>
            {rich && availability !== "available" ? (
              <span
                className={classes(styles.availability, styles.availabilityWarning)}
                title={availabilityLabel(availability)}
              >
                {`⚠ ${availabilityLabel(availability)}`}
              </span>
            ) : null}
          </span>
        </DropdownMenuItem>
        {pinId
          ? renderPinButton(
              pinId,
              option.label,
              `${keyPrefix}:${option.id}:${pinId}`,
            )
          : null}
        {variants.length > 0 && labels ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className={styles.variantTrigger}
              aria-label={`${labels.variants}: ${option.label}`}
              title={`${labels.variants}: ${option.label}`}
              data-control-id={
                controlSurface
                  ? auxiliaryControlId?.("variants", option.id)
                  : undefined
              }
              data-control-role={
                controlSurface ? "auxiliary-session" : undefined
              }
              data-control-occurrence-id={
                controlSurface
                  ? (entryOccurrenceId?.(
                      "variants",
                      `${keyPrefix}:${option.id}`,
                    ) ?? `variants:${keyPrefix}:${option.id}`)
                  : undefined
              }
              data-control-surface={controlSurface}
              data-testid={`${testId}-variants-${option.id}`}
            >
              <OfficeSemanticIcon
                semanticId="font.variant.chevron"
                size={14}
              />
            </DropdownMenuSubTrigger>
            <RibbonDropdownMenuSubContent className={styles.variantMenu}>
              {variants.map((variant) =>
                renderVariant(option, variant, keyPrefix),
              )}
            </RibbonDropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
      </div>
    );
  };

  const renderSection = (
    id: string,
    sectionLabel: string,
    options: readonly RibbonFontFamilyOption[],
    variants: readonly { option: RibbonFontFamilyOption; variant: OfficeFontVariant }[] = [],
  ) => {
    const themeRoleOf = (option: RibbonFontFamilyOption) =>
      id === "theme" ? (option as RibbonThemeFontOption).role : undefined;
    if (!labels) return null;
    const visibleOptions = options.filter(matchesSearch);
    const visibleVariants = variants.filter(({ option, variant }) =>
      !searchActive
        ? true
        : `${option.label} ${variant.label}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
    );
    if (searchActive && visibleOptions.length === 0 && visibleVariants.length === 0) {
      return null;
    }
    const collapsed = collapsedSections.has(id) && !searchActive;
    return (
      <section className={styles.section} key={id} data-testid={`${testId}-section-${id}`}>
        <DropdownMenuItem
          className={styles.sectionHeader}
          data-control-id={
            controlSurface ? auxiliaryControlId?.("section", id) : undefined
          }
          data-control-role={
            controlSurface ? "auxiliary-session" : undefined
          }
          data-control-occurrence-id={
            controlSurface
              ? (entryOccurrenceId?.("section", id) ?? `section:${id}`)
              : undefined
          }
          data-control-surface={controlSurface}
          aria-expanded={!collapsed}
          onSelect={(event) => {
            event.preventDefault();
            toggleSection(id);
          }}
        >
          <OfficeSemanticIcon
            semanticId="menu.chevron.down"
            size={12}
            className={classes(styles.sectionChevron, collapsed && styles.sectionChevronCollapsed)}
          />
          <span>{sectionLabel}</span>
        </DropdownMenuItem>
        {collapsed ? null : (
          <div className={styles.sectionBody}>
            {visibleOptions.map((option) =>
              renderFamily(option, id, themeRoleOf(option)),
            )}
            {visibleVariants.map(({ option, variant }) =>
              renderVariant(option, variant, id),
            )}
          </div>
        )}
      </section>
    );
  };

  // Built when the menu's content mounts (RenderWhenMounted), as the rich
  // list is: each row asks for its family's faces (availabilityFor), and a
  // closed menu's rows built at every render of the ribbon declared every
  // listed family -- a table cell's font list holds six East Asian families,
  // hundreds of faces each, whose arrival laid out the whole page again while
  
  const legacyContent = () => !rich
    ? [
        ...(themeFonts
          ? [
              <div key="theme" className={styles.legacySection}>
                <div className={styles.legacySectionLabel}>
                  {themeFonts.label}
                </div>
                {themeFonts.options.map((option) =>
                  renderFamily(option, "theme", option.role),
                )}
              </div>,
            ]
          : []),
        ...sections.map((section) => (
        <div key={section.id} className={styles.legacySection}>
          {section.label ? (
            <div className={styles.legacySectionLabel}>{section.label}</div>
          ) : null}
          {section.options.map((option) => renderFamily(option, section.id))}
        </div>
      )),
      ]
    : null;

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          restoreTriggerOnCloseRef.current = false;
          onRememberSelection?.();
        } else {
          formatPreview.clearPreview();
        }
        menuOpenRef.current = nextOpen;
        setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={label}
          aria-invalid={mixed || undefined}
          disabled={disabled}
          className={`office-ribbon-control ${(classes(
            "note-editor-office-toolbar__select",
            "docs-home-font-trigger",
            styles.trigger,
            mixed && styles.triggerMixed,
            className,
          ))}`} data-office-control-part="field"
          data-office-text-format-control="true"
          data-control-id={controlSurface ? controlId : undefined}
          data-control-occurrence-id={
            controlSurface
              ? (entryOccurrenceId?.("trigger") ?? "trigger")
              : undefined
          }
          data-control-surface={controlSurface}
          data-testid={testId}
          data-font-availability={activeAvailability}
          data-disabled-reason={gate.disabledReason || undefined}
          title={
            gate.disabledReason
              ? gate.disabledReason
              : rich && labels && activeAvailability !== "available"
                ? `${resolvedActiveLabel} — ${availabilityLabel(activeAvailability)}`
                : resolvedActiveLabel
          }
          onPointerDown={onRememberSelection}
        >
          <span
            className={classes("docs-home-font-trigger__label", styles.triggerLabel)}
            style={{
              fontFamily:
                !mixed && activeAvailability === "available" && !isOfficeSymbolFontFamily(activeFontFamily)
                  ? activeFontFamily
                  : undefined,
            }}
          >
            {resolvedActiveLabel}
          </span>
          {assetStatus === "missing" && labels ? <span className={styles.availabilityWarning} role="status" data-testid={`${testId}-missing-font`} title={labels.missing}>!</span> : null}
          <OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />
        </button>
      </DropdownMenuTrigger>
      <RibbonDropdownMenuContent
        ref={menuRef}
        id={menuId}
        align="start"
        sideOffset={5}
        className={classes("docs-home-font-menu", styles.menu)}
        data-office-text-format-control="true"
        data-ribbon-object-selection-retain={
          retainObjectSelection ? "true" : undefined
        }
        onEscapeKeyDown={() => {
          restoreTriggerOnCloseRef.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (!restoreTriggerOnCloseRef.current) event.preventDefault();
          restoreTriggerOnCloseRef.current = false;
        }}
      >
        <RenderWhenMounted render={() => rich && labels ? (
          <>
            <div className={styles.menuTools}>
              <label className={styles.searchField}>
                <OfficeSemanticIcon semanticId="font.search" size={16} />
                <span className={styles.srOnly}>{labels.search}</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  maxLength={80}
                  value={query}
                  placeholder={labels.searchPlaceholder}
                  aria-label={labels.search}
                  data-control-id={
                    controlSurface
                      ? auxiliaryControlId?.("search")
                      : undefined
                  }
                  data-control-role={
                    controlSurface ? "auxiliary-session" : undefined
                  }
                  data-control-occurrence-id={
                    controlSurface
                      ? (entryOccurrenceId?.("search") ?? "search")
                      : undefined
                  }
                  data-control-surface={controlSurface}
                  data-testid={`${testId}-search`}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      event.stopPropagation();
                      menuRef.current
                        ?.querySelector<HTMLElement>(
                          '[role="menuitem"]:not([data-disabled])',
                        )
                        ?.focus();
                    } else if (event.key === "Enter") {
                      // Excel's font box: Enter takes the first font the typed
                      // text matches.
                      event.preventDefault();
                      event.stopPropagation();
                      const first = Array.from(
                        menuRef.current?.querySelectorAll<HTMLElement>(
                          '[role="menuitem"]:not([data-disabled])[data-testid]',
                        ) ?? [],
                      ).find((item) => {
                        const id = item.getAttribute("data-testid") ?? "";
                        return (
                          !id.endsWith("-browse") &&
                          !id.endsWith("-search") &&
                          (item.textContent ?? "").trim() !== ""
                        );
                      });
                      first?.click();
                    } else if (event.key !== "Escape") {
                      event.stopPropagation();
                    }
                  }}
                />
              </label>
              <DropdownMenuItem
                className={styles.browseButton}
                data-control-id={
                  controlSurface
                    ? auxiliaryControlId?.("browse")
                    : undefined
                }
                data-control-role={
                  controlSurface ? "auxiliary-session" : undefined
                }
                data-control-occurrence-id={
                  controlSurface
                    ? (entryOccurrenceId?.("browse") ?? "browse")
                    : undefined
                }
                data-control-surface={controlSurface}
                data-testid={`${testId}-browse`}
                onSelect={(event) => {
                  event.preventDefault();
                  void browseLocalFonts();
                }}
              >
                <OfficeSemanticIcon semanticId="font.browse" size={16} />
                <span>{labels.browse}</span>
              </DropdownMenuItem>
              {browseMessage ? (
                <p className={styles.browseMessage} role="status">
                  {browseMessage}
                </p>
              ) : null}
            </div>
            {themeFonts
              ? renderSection("theme", themeFonts.label, themeFonts.options)
              : null}
            {renderSection("recent", labels.recent, recentOptions)}
            {renderSection(
              "pinned",
              labels.pinned,
              pinnedFamilies,
              pinnedVariants,
            )}
            {themeFonts
              ? null
              : renderSection("office", labels.officeFonts, catalogOptions)}
            {renderSection("all", labels.allFonts, allFontOptions)}
            {searchActive &&
            [
              ...(themeFonts?.options ?? []),
              ...catalogOptions,
              ...allFontOptions,
            ].every(
              (option) => !matchesSearch(option),
            ) &&
            pinnedVariants.every(({ option, variant }) =>
              !`${option.label} ${variant.label}`
                .toLocaleLowerCase()
                .includes(normalizedQuery),
            ) ? (
              <p className={styles.noResults}>{labels.noResults}</p>
            ) : null}
          </>
        ) : (
          legacyContent()
        )} />
      </RibbonDropdownMenuContent>
    </DropdownMenu>
  );
}

/** Display the primary face of a CSS font stack when no curated label exists. */
export function ribbonFontFamilyLabel(
  family: string,
  labels: Readonly<Record<string, string>> = {},
): string {
  return labels[family] ?? officePrimaryFontFamily(family);
}
