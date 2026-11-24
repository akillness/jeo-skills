"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import type { DocumentInkPreset, DocumentInkTool } from "@mrnote/core/web/lib/document-ink.ts";
import type { OfficeInkPenPatch } from "@mrnote/core/web/components/office-ribbon/OfficeInkRibbon.tsx";
import {
  officeInkPenById,
  officeInkPenProfileFromStorage,
  serializeOfficeInkPenProfile,
  withOfficeInkPen,
  withOfficeInkPenAdded,
  withOfficeInkPenRemoved,
  type OfficeInkPenProfile,
} from "@mrnote/core/web/lib/office-ink-pens.ts";
import {
  PDF_INK_PEN_PROFILE_STORAGE_KEY,
  PDF_INK_PEN_SPEC,
} from "../../../../../lib/pdf/ink-pens";

/**
 * The page window's pen gallery: the pens (kept in this browser) and which
 * one is picked. It lives with the window, not with the Annotate tab's
 * groups, so the picked pen survives a tab switch; the window's ink colour,
 * width and stroke kind start from the picked pen.
 */
export interface PdfInkPenGallery {
  profile: OfficeInkPenProfile;
  selectedId: string;
  selected: DocumentInkPreset;
  /** Replace the gallery and keep it in this browser. */
  persistProfile: (next: OfficeInkPenProfile) => void;
  setSelectedId: Dispatch<SetStateAction<string>>;
}

function readStoredProfile(): OfficeInkPenProfile {
  try {
    return officeInkPenProfileFromStorage(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(PDF_INK_PEN_PROFILE_STORAGE_KEY),
      PDF_INK_PEN_SPEC,
    );
  } catch {
    return officeInkPenProfileFromStorage(null, PDF_INK_PEN_SPEC);
  }
}

export function usePdfInkPens(): PdfInkPenGallery {
  const [profile, setProfile] = useState<OfficeInkPenProfile>(readStoredProfile);
  const [selectedId, setSelectedId] = useState(() => profile.pens[0].id);
  const persistProfile = useCallback((next: OfficeInkPenProfile) => {
    setProfile(next);
    try {
      window.localStorage.setItem(
        PDF_INK_PEN_PROFILE_STORAGE_KEY,
        serializeOfficeInkPenProfile(next, PDF_INK_PEN_SPEC),
      );
    } catch {
      // A private window keeps the gallery for this session only.
    }
  }, []);
  return {
    profile,
    selectedId,
    selected: officeInkPenById(profile, selectedId),
    persistProfile,
    setSelectedId,
  };
}

/**
 * The Draw tab's pen commands over a gallery (Word: choosing a pen turns
 * Draw on with it; a pen's menu edits the pen in place; Add Pen appends a
 * pen at its tool's defaults and picks it; Delete drops it, the last one
 * stays). `applyPen` hands the picked pen's kind, colour and width to the
 * host's ink state; `armDraw` turns its draw mode on; `canWrite` is asked
 * before a pick arms anything.
 */
export interface PdfInkPenCommands {
  readonly profile: OfficeInkPenProfile;
  readonly selectedId: string;
  readonly choosePen: (pen: DocumentInkPreset) => void;
  readonly updatePen: (id: string, patch: OfficeInkPenPatch) => void;
  readonly removePen: (id: string) => void;
  readonly addPen: (tool: DocumentInkTool) => void;
}

export function usePdfInkPenCommands(
  gallery: PdfInkPenGallery,
  host: {
    readonly applyPen: (pen: DocumentInkPreset) => void;
    readonly armDraw: () => void;
    readonly canWrite: () => boolean;
  },
): PdfInkPenCommands {
  const { profile, selectedId, persistProfile, setSelectedId } = gallery;
  const { applyPen, armDraw, canWrite } = host;
  const choosePen = useCallback(
    (pen: DocumentInkPreset) => {
      if (!canWrite()) return;
      setSelectedId(pen.id);
      applyPen(pen);
      armDraw();
    },
    [applyPen, armDraw, canWrite, setSelectedId],
  );
  const updatePen = useCallback(
    (id: string, patch: OfficeInkPenPatch) => {
      const next = withOfficeInkPen(profile, id, patch, PDF_INK_PEN_SPEC);
      persistProfile(next);
      if (id === selectedId) applyPen(officeInkPenById(next, id));
    },
    [applyPen, persistProfile, profile, selectedId],
  );
  const removePen = useCallback(
    (id: string) => {
      const next = withOfficeInkPenRemoved(profile, id, PDF_INK_PEN_SPEC);
      if (next === profile) return;
      persistProfile(next);
      if (id === selectedId) {
        const first = next.pens[0];
        setSelectedId(first.id);
        applyPen(first);
      }
    },
    [applyPen, persistProfile, profile, selectedId, setSelectedId],
  );
  const addPen = useCallback(
    (tool: DocumentInkTool) => {
      const added = withOfficeInkPenAdded(profile, tool, PDF_INK_PEN_SPEC);
      persistProfile(added.profile);
      choosePen(officeInkPenById(added.profile, added.id));
    },
    [choosePen, persistProfile, profile],
  );
  return { profile, selectedId, choosePen, updatePen, removePen, addPen };
}
