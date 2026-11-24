"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

/**
 * "Drop a file to import" for an editor surface: the Docs editor's drag
 * state, shared. While a drag the editor accepts is over its target, the
 * target is lit (officeFileDropClassNames.activeTarget) and the
 * OfficeFileDropOverlay says what a drop does; the drop itself stays with the
 * editor, which reads the files and runs its own import path, then calls
 * `end`. A drag that leaves for a descendant keeps the target lit, as it
 * stays over it.
 */

export type OfficeFileDropAccepts = (types: readonly string[]) => boolean;

/** The default: a drag that carries files. */
export const officeFileDropCarriesFiles: OfficeFileDropAccepts = (types) =>
  types.includes("Files");

export interface OfficeFileDrop {
  /** A drag the editor accepts is over the target. */
  readonly active: boolean;
  /** For the target's onDragOver, once the editor may start an import: lights
   * the target and allows the drop. Returns whether the drag was accepted. */
  readonly onDragOver: (event: DragEvent<HTMLElement>) => boolean;
  /** For the target's onDragLeave. */
  readonly onDragLeave: (event: DragEvent<HTMLElement>) => void;
  /** The drop was taken, or the editor may no longer import. */
  readonly end: () => void;
}

export function useOfficeFileDrop(
  accepts: OfficeFileDropAccepts = officeFileDropCarriesFiles,
): OfficeFileDrop {
  const [active, setActive] = useState(false);
  // The latest filter, read at event time, so an inline one keeps the
  // handlers stable.
  const acceptsRef = useRef(accepts);
  useEffect(() => {
    acceptsRef.current = accepts;
  });
  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (!acceptsRef.current(types)) return false;
    event.preventDefault();
    setActive(true);
    return true;
  }, []);
  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setActive(false);
  }, []);
  const end = useCallback(() => setActive(false), []);
  return { active, onDragOver, onDragLeave, end };
}
