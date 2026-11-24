"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPageFontBindings } from "@mrnote/core/web/lib/notebook-sdk.ts";
import { pageDocumentJsonEquals } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import {
  captureSavedPageHotCacheScope,
  isSavedPageHotCacheScopeCurrent,
} from "@mrnote/core/web/lib/saved-page-hot-cache.ts";
import { subscribeAuthState } from "@mrnote/core/web/lib/auth-state.ts";
import {
  loadPresentationEmbeddedFonts,
  type PresentationEmbeddedFontAliases,
} from "../../../../lib/presentation-embedded-fonts";
import {
  fontAssetStatus,
  retainOfficeFontAssets,
  subscribeFontAssetStatus,
} from "@mrnote/core/web/components/office-ribbon/officeFontAssets.ts";
import {
  officeFontFaceFamily,
  type OfficeFontFace,
} from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import {
  EMPTY_PRESENTATION_FONT_ALIASES,
  normalizePresentationFontFaces,
  readPresentationFontRequirements,
  readPresentationLayoutUpdateState,
  readPresentationVerifiedFontAliases,
  presentationVerifiedFontAliasFace,
  type PresentationVerifiedFontAlias,
  type PresentationFontAliases,
  type PresentationFontRequirement,
} from "@mrnote/core/web/lib/presentation-font-face-reads.ts";

export const PresentationFontAliasesContext =
  createContext<PresentationFontAliases>(EMPTY_PRESENTATION_FONT_ALIASES);

/** PPT adapter over the established page binding proof and shared font leases.
 * Recovered/peer drafts cannot grant access to an attachment or install a font. */
export function usePresentationFontFaces(
  raw: unknown,
  pageId: string,
  notebookId: string,
  scopeKey: string,
  contentVersion: number,
  enabled: boolean,
) {
  const key = JSON.stringify(raw ?? []);
  const parsed = useMemo(
    () => normalizePresentationFontFaces(JSON.parse(key)),
    [key],
  );
  type Proof = {
    key: string;
    pageId: string;
    notebookId: string;
    scopeKey: string;
    version: number;
    auth: ReturnType<typeof captureSavedPageHotCacheScope>;
    faces: OfficeFontFace[];
    requirements: PresentationFontRequirement[];
    complete: boolean;
    verifiedAliases: PresentationVerifiedFontAlias[];
    layoutUpdateRequired: boolean | undefined;
  };
  const [proof, setProof] = useState<Proof>();
  const proofRef = useRef<Proof | undefined>(undefined);
  const [bindingRevision, setBindingRevision] = useState(0);
  const refreshBindings = useCallback(() => setBindingRevision(value => value + 1), []);
  const [revision, setRevision] = useState(0),
    [authRevision, setAuthRevision] = useState(0);
  useEffect(
    () => subscribeAuthState(() => setAuthRevision((value) => value + 1)),
    [],
  );
  useEffect(() => {
    // No proof already: nothing to ask React for (a deck without bound
    // fonts re-runs this after every save).
    const dropProof = () => {
      if (proofRef.current === undefined) return;
      proofRef.current = undefined;
      setProof(undefined);
    };
    if (!enabled || !pageId || !notebookId || contentVersion < 1) {
      dropProof();
      return;
    }
    const auth = captureSavedPageHotCacheScope(),
      controller = new AbortController();
    void getPageFontBindings(pageId, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted || !isSavedPageHotCacheScopeCurrent(auth))
          return;
        if (
          page.page_id !== pageId ||
          page.notebook_id !== notebookId ||
          page.content_version !== contentVersion
        ) {
          dropProof();
          return;
        }
        const checked = normalizePresentationFontFaces(page.font_faces);
        const complete = Boolean(
          parsed && checked && pageDocumentJsonEquals(parsed, checked),
        );
        const previous = proofRef.current;
        const nextFaces = complete ? checked! : [];
        const faces =
          previous?.scopeKey === scopeKey &&
          pageDocumentJsonEquals(previous.faces, nextFaces)
            ? previous.faces
            : nextFaces;
        const next = {
          key,
          pageId,
          notebookId,
          scopeKey,
          version: contentVersion,
          auth,
          faces,
          requirements: readPresentationFontRequirements(page.required_fonts),
          complete,
          verifiedAliases: readPresentationVerifiedFontAliases(page.verified_font_aliases),
          layoutUpdateRequired: readPresentationLayoutUpdateState(page, {
            pageId, notebookId, contentVersion, fontFaces: parsed,
          }),
        };
        proofRef.current = next;
        setProof(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) dropProof();
      });
    return () => controller.abort();
  }, [
    key,
    parsed,
    pageId,
    notebookId,
    scopeKey,
    contentVersion,
    enabled,
    authRevision,
    bindingRevision,
  ]);
  const current =
    proof?.key === key &&
    proof.pageId === pageId &&
    proof.notebookId === notebookId &&
    proof.scopeKey === scopeKey &&
    proof.version <= contentVersion &&
    isSavedPageHotCacheScopeCurrent(proof.auth) &&
    enabled;
  const faces = useMemo(() => (current ? proof!.faces : []), [current, proof]);
  // The deck's own embedded faces (p:embeddedFontLst), drawn as PowerPoint
  // draws them; a face the user bound below still wins.
  const [embedded, setEmbedded] = useState<{ pageId: string; aliases: PresentationEmbeddedFontAliases }>();
  useEffect(() => {
    if (!enabled || !pageId) return;
    let live = true;
    void loadPresentationEmbeddedFonts(pageId)
      .then((aliases) => {
        if (live && Object.keys(aliases).length) setEmbedded({ pageId, aliases });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, pageId]);
  const embeddedAliases = embedded?.pageId === pageId ? embedded.aliases : undefined;
  useEffect(() => {
    if (!enabled || !faces.length) return;
    const stop = subscribeFontAssetStatus(() =>
      setRevision((value) => value + 1),
    );
    const release = retainOfficeFontAssets(
      faces.flatMap((face) => (face.asset ? [face.asset] : [])),
      document,
    );
    return () => {
      stop();
      release();
    };
  }, [faces, scopeKey, enabled]);
  return useMemo(() => {
    const aliases: Record<string, string> = Object.create(null);
    if (enabled && embeddedAliases) Object.assign(aliases, embeddedAliases);
    let unavailable =
      enabled &&
      (!current ||
        !proof?.complete ||
        proof.requirements.some((need) => need.status === "missing"));
    for (const face of faces) {
      if (face.asset && fontAssetStatus(face.asset) === "available")
        aliases[face.family.toLowerCase()] = officeFontFaceFamily(face);
      else unavailable = true;
    }
    // Original PostScript names are valid only for this exact checked page version.
    if (current && proof?.complete && proof.version === contentVersion) {
      const candidates = new Map<string, Set<string>>();
      for (const alias of proof.verifiedAliases) {
        const face = presentationVerifiedFontAliasFace(alias, faces);
        if (!face?.asset || fontAssetStatus(face.asset) !== "available") continue;
        const key = alias.name.toLowerCase(), css = officeFontFaceFamily(face);
        const values = candidates.get(key) ?? new Set(aliases[key] ? [aliases[key]] : []);
        values.add(css);
        candidates.set(key, values);
      }
      for (const [key, values] of candidates)
        if (values.size === 1) aliases[key] = [...values][0];
    }
    return {
      aliases,
      faces,
      unavailable,
      revision,
      requirements:
        current && proof?.version === contentVersion ? proof.requirements : [],
      verifiedVersion: current && proof?.complete ? proof.version : undefined,
      layoutUpdateRequired: current && proof?.complete && proof.version === contentVersion
        ? proof.layoutUpdateRequired : undefined,
      refreshBindings,
    };
  }, [faces, current, proof, contentVersion, enabled, revision, refreshBindings, embeddedAliases]);
}
