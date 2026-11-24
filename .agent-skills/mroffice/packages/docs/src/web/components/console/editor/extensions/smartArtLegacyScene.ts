/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Store the server's drawing on every legacy `smartArt` block of an editable
 * document, once (lib/office-smartart/legacy-scene.ts).
 *
 * The write is derived data, not authoring, and follows the editor's other
 * representation upgrades (the whiteboard scene upgrade, the chart V1 lift,
 * block ids): ONE `setNodeMarkup` transaction marked `addToHistory: false`.
 * Undo never walks into it, `isUserAuthoredDocumentMutation` does not count it
 * as the member's edit, the page autosave carries it like any other change,
 * and a canonical collaborative page publishes it outside history with the
 * next authored gesture. A read-only, destroyed or offline editor changes
 * nothing.
 */

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { callEngine } from "@mrnote/core/web/lib/engine-host/client.ts";
import {
  LEGACY_SMARTART_SCENE_VERSION,
  legacySmartArtSceneRequest,
  storedLegacySmartArtScene,
  type LegacySmartArtScene,
} from "@mrnote/core/web/lib/office-smartart/legacy-scene.ts";
import type { SmartArtPreviewRequest } from "@mrnote/core/web/lib/engine-host/smartart-types.ts";
import { legacySmartArtSceneSource } from "./SmartArtBlock";

const LEGACY_SMARTART_NODE = "smartArt";
/** The `previews` method's own bound (engine-host/engines/smartart.ts). */
const MAX_SCENES_PER_REQUEST = 160;

interface StaleBlock {
  key: string;
  request: SmartArtPreviewRequest["previews"][number];
}

/** The legacy blocks of `doc` whose stored drawing is missing or stale, by key. */
export function staleLegacySmartArtScenes(doc: ProseMirrorNode): Map<string, StaleBlock> {
  const stale = new Map<string, StaleBlock>();
  doc.descendants((node) => {
    if (node.type.name !== LEGACY_SMARTART_NODE) return true;
    const source = legacySmartArtSceneSource(node.attrs.layout, node.attrs.items);
    if (source.kind && source.key && !storedLegacySmartArtScene(node.attrs.scene, source.key)) {
      stale.set(source.key, {
        key: source.key,
        request: legacySmartArtSceneRequest(source.kind, source.texts, source.levels),
      });
    }
    return false;
  });
  return stale;
}

/**
 * Ask the server for every stale drawing and store the answers. Resolves how
 * many blocks were written, or `null` when the server could not be asked
 * (offline, busy, failed) so the host may try again later.
 */
export async function materializeLegacySmartArtScenes(editor: Editor): Promise<number | null> {
  if (editor.isDestroyed || !editor.isEditable) return 0;
  const stale = [...staleLegacySmartArtScenes(editor.state.doc).values()];
  if (stale.length === 0) return 0;
  const answered = new Map<string, LegacySmartArtScene>();
  try {
    for (let start = 0; start < stale.length; start += MAX_SCENES_PER_REQUEST) {
      const batch = stale.slice(start, start + MAX_SCENES_PER_REQUEST);
      const answer = await callEngine("smartart", "previews", {
        previews: batch.map((entry) => entry.request),
      });
      batch.forEach((entry, index) => {
        const nodes = answer.previews[index];
        if (Array.isArray(nodes) && nodes.length > 0) {
          answered.set(entry.key, { v: LEGACY_SMARTART_SCENE_VERSION, key: entry.key, nodes });
        }
      });
    }
  } catch {
    return null;
  }
  if (editor.isDestroyed || !editor.isEditable || answered.size === 0) return 0;
  // Written onto the document as it is NOW: a block edited while the server
  // answered has a new key and simply waits for its own drawing.
  const transaction = editor.state.tr;
  let written = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== LEGACY_SMARTART_NODE) return true;
    const { key } = legacySmartArtSceneSource(node.attrs.layout, node.attrs.items);
    const scene = key ? answered.get(key) : undefined;
    if (scene && !storedLegacySmartArtScene(node.attrs.scene, scene.key)) {
      transaction.setNodeMarkup(pos, undefined, { ...node.attrs, scene }, node.marks);
      written += 1;
    }
    return false;
  });
  if (!transaction.docChanged) return 0;
  editor.view.dispatch(transaction.setMeta("addToHistory", false));
  return written;
}
