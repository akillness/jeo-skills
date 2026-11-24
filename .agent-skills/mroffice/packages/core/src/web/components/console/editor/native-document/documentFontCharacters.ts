/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Warm the CSS faces needed by every rendered source character, including
 * unicode-range subsets in pages that have not been painted yet. This only
 * asks the browser to match existing CSS font rules; it never creates a URL,
 * changes a family, or establishes a font's native identity. */
import { createBackgroundLane } from "../../../../lib/background-work";

export interface DocumentFontCharacters { font: string; characters: string }
const stretchKeywords: Record<string, string> = {
  "50%":"ultra-condensed", "62.5%":"extra-condensed", "75%":"condensed",
  "87.5%":"semi-condensed", "100%":"normal", "112.5%":"semi-expanded",
  "125%":"expanded", "150%":"extra-expanded", "200%":"ultra-expanded",
};
type FontKeys = WeakMap<Element, string | null>;
/** paged/pageRebalanceExtension's INITIAL_PAGINATION_SETTLING_ATTR (the
 * editor root's flag while its first layout settles, its pages hidden). */
const INITIAL_SETTLE_ATTR = "data-pagination-initial-settling";

/** The CSS font a text node under `parent` is drawn in, or null when its
 * characters are not collected (script/style/widget, or no font). One
 * getComputedStyle per element: the same parent always answers the same. */
function fontOf(win: Window, parent: Element, keys: FontKeys): string | null {
  const known=keys.get(parent);
  if (known!==undefined) return known;
  let font: string | null=null;
  if (!parent.closest("script,style,.ProseMirror-widget")) {
    const css=win.getComputedStyle(parent);
    if (css.fontSize && css.fontFamily) {
      const stretch=stretchKeywords[css.fontStretch] ?? css.fontStretch;
      font=[css.fontStyle || "normal",css.fontWeight || "400",
        stretch && stretch!=="normal" ? stretch : "",css.fontSize,css.fontFamily].filter(Boolean).join(" ");
    }
  }
  keys.set(parent,font);
  return font;
}

export function collectDocumentFontCharacters(root: HTMLElement, keys: FontKeys=new WeakMap()): DocumentFontCharacters[] {
  const doc=root.ownerDocument, win=doc.defaultView;
  if (!win) return [];
  const groups=new Map<string,Set<string>>();
  const walker=doc.createTreeWalker(root,4 /* SHOW_TEXT */);
  while(walker.nextNode()) {
    const node=walker.currentNode, parent=node.parentElement;
    if (!parent || !node.textContent) continue;
    const font=fontOf(win,parent,keys);
    if (font===null) continue;
    let characters=groups.get(font);
    if (!characters) {
      if(groups.size>=512) throw new Error("document_font_character_style_budget");
      characters=new Set();groups.set(font,characters);
    }
    for(const character of node.textContent) characters.add(character);
  }
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([font,characters])=>({font,characters:[...characters].sort().join("")}));
}

/**
 * collectDocumentFontCharacters without the long task. Its cost is one
 * getComputedStyle per text-bearing element, and after a font load has
 * invalidated style that forces the style of every page not drawn yet: two
 * seconds in one task on a 693k-character book. The fonts are read here in
 * slices that yield between them; the characters are then collected in one
 * short synchronous walk over the DOM as it is at the end, with those fonts,
 * so a run added, removed or retyped meanwhile is counted exactly as the
 * one-task read would count it. An element whose own attributes change
 * meanwhile is read again in that walk; a font changed meanwhile through an
 * ancestor is caught by the read after the warm-up, as a change made during
 * the warm-up always was.
 */
export async function collectDocumentFontCharactersInSlices(root: HTMLElement, options: {
  signal: AbortSignal;
  check: () => void;
}): Promise<DocumentFontCharacters[]> {
  const doc=root.ownerDocument, win=doc.defaultView;
  if (!win) return [];
  const keys: FontKeys=new WeakMap();
  const forget=(records: MutationRecord[])=>{
    for(const record of records) if(record.type==="attributes") keys.delete(record.target as Element);
  };
  const observer=typeof win.MutationObserver==="function" ? new win.MutationObserver(forget) : null;
  observer?.observe(root,{subtree:true,attributes:true});
  // Background work (lib/background-work): slices of reads that give way to
  // input elsewhere in the app and run first while this window is in use.
  // While the document's first layout waits for these faces (its pages are
  // hidden under the initial settle, and its first pass holds for the font
  
  
  // reads took 49 turns of 8 ms, each waiting up to a second behind the
  // ledger's and the readiness probe's). The slices and what they read are
  // the same either way.
  const firstScreen=root.getAttribute(INITIAL_SETTLE_ATTR)==="true";
  const lane=createBackgroundLane({label:"docs-font-characters",owner:()=>root.closest(".wm-window") ?? root,
    ...(firstScreen ? {priority:"first-screen" as const} : {})});
  try {
    const parents: Element[]=[];
    const walker=doc.createTreeWalker(root,4 /* SHOW_TEXT */);
    while(walker.nextNode()) {
      const parent=walker.currentNode.parentElement;
      if (parent && parent!==parents[parents.length-1]) parents.push(parent);
    }
    await abortable(lane.turn(),options.signal);
    options.check();
    for(const parent of parents) {
      if (parent.isConnected) fontOf(win,parent,keys);
      if (!lane.shouldYield()) continue;
      await abortable(lane.turn(),options.signal);
      options.check();
    }
    if (observer) forget(observer.takeRecords());
  } finally {
    observer?.disconnect();
    lane.dispose();
  }
  return collectDocumentFontCharacters(root,keys);
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if(signal.aborted) return Promise.reject(new DOMException("Aborted","AbortError"));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException("Aborted","AbortError"));
    signal.addEventListener("abort",abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
  });
}

export async function warmDocumentFontCharacters(root: HTMLElement, options: {
  signal: AbortSignal;
  current: () => boolean;
}): Promise<void> {
  const doc=root.ownerDocument, fonts=doc.fonts, win=doc.defaultView;
  if(!fonts || !win || !doc.body) return;
  const check=()=>{if(options.signal.aborted || !options.current()) throw new Error("document_font_character_source_changed");};
  check();
  // An abort during the read is an abort, not a changed source.
  const collect=async()=>{
    const read=await collectDocumentFontCharactersInSlices(root,{signal:options.signal,check});
    if(options.signal.aborted) throw new DOMException("Aborted","AbortError");
    return read;
  };
  let groups=await collect();
  // A font plan or document edit can replace DOM runs during font loading.
  // Re-read once against the applied plan; repeated changes fail for retry.
  for(let pass=0;pass<2;pass++) {
    check();
    const probes: HTMLElement[]=[];
    let frame:number | undefined;
    try {
      const fragment=doc.createDocumentFragment();
      for(const group of groups) {
        const probe=doc.createElement("span");
        probe.setAttribute("data-document-font-character-probe","");
        probe.setAttribute("inert","");
        probe.setAttribute("aria-hidden","true");
        // Opacity keeps real font matching/layout active. display:none and
        // visibility-based shortcuts can skip an unpainted Unicode subset.
        probe.style.cssText="position:absolute;left:0;top:0;opacity:0;pointer-events:none;white-space:pre";
        probe.style.font=group.font;
        probe.textContent=group.characters;
        probes.push(probe);fragment.append(probe);
      }
      // Stay outside the live ProseMirror DOM and its source/save observers.
      doc.body.append(fragment);
      for(const probe of probes) {probe.getBoundingClientRect();void probe.offsetHeight;}
      await abortable(new Promise<void>(resolve=>{
        frame=win.requestAnimationFrame(()=>{frame=undefined;resolve();});
      }),options.signal);
      check();
      // FontFaceSet.load on a whole family list also requests fallback faces
      // that an available system primary does not need. Join only loads that
      // the actual layout started. WebKit's fonts.ready can resolve while an
      // individual subset is still loading, so the face promises come first.
      const started=[...fonts].filter(face=>face.status==="loading");
      await abortable(Promise.allSettled(started.map(face=>face.loaded)),options.signal);
      await abortable(fonts.ready,options.signal);
      check();
    } finally {
      if(frame!==undefined) win.cancelAnimationFrame(frame);
      for(const probe of probes) probe.remove();
    }
    const next=await collect();
    if(JSON.stringify(next)===JSON.stringify(groups)) return;
    groups=next;
  }
  throw new Error("document_font_character_source_unstable");
}
