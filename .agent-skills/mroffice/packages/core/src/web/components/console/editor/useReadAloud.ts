/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { splitIntoSpeechChunks } from "../../../lib/document-read-aloud";

/**
 * "Read Aloud" controller for the document editor (Word Review ▸ Read Aloud),
 * built on the Web Speech API (`window.speechSynthesis`). Feature-detected with
 * graceful degradation — `supported` is false where the API is absent (SSR,
 * jsdom, locked-down browsers) so the toolbar can hide the control rather than
 * offer a dead button. The player queues one short utterance per
 * {@link splitIntoSpeechChunks} chunk, advancing on each `onend`; any error or a
 * `stop()` halts the queue. Speech is always cancelled on unmount so a dangling
 * utterance can never keep reading after the editor is gone.
 */
export interface ReadAloudController {
  /** Whether the Web Speech API is available (else the control should hide). */
  supported: boolean;
  /** Whether a read-through is currently in progress. */
  playing: boolean;
  /** Start reading `text`, or stop if already reading (idempotent per click). */
  toggle: (text: string) => void;
  /** Cancel any in-progress read-through. Never throws. */
  stop: () => void;
}

function speechSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return "speechSynthesis" in window ? window.speechSynthesis : null;
}

/** Whether the Web Speech API is usable in the current (client) environment. */
function detectSupported(): boolean {
  return (
    speechSynth() !== null &&
    typeof window !== "undefined" &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

// `supported` is a CLIENT-only fact; resolve it through useSyncExternalStore so
// the server snapshot is a stable `false` (no hydration mismatch) and the client
// reads the real capability — without a setState-in-effect.
const NO_SUBSCRIBE = () => () => {};

export function useReadAloud(): ReadAloudController {
  const supported = useSyncExternalStore(
    NO_SUBSCRIBE,
    detectSupported,
    () => false,
  );
  const [playing, setPlaying] = useState(false);
  // Mirrors `playing` for use inside utterance callbacks without stale closures.
  const playingRef = useRef(false);
  // Each start is a session. A start cancels the queue before it, and the
  // cancelled utterance's onend / onerror arrive afterwards: they belong to
  // the old session and must not mark the new one idle while the engine is
  
  const sessionRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    playingRef.current = false;
    setPlaying(false);
    const synth = speechSynth();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      /* a failed cancel must never throw out of a stop */
    }
  }, []);

  const start = useCallback((text: string) => {
    const synth = speechSynth();
    if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return;
    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) return;
    try {
      synth.cancel(); // clear any prior queue before starting fresh
    } catch {
      return;
    }
    const session = ++sessionRef.current;
    const current = () => sessionRef.current === session;
    playingRef.current = true;
    setPlaying(true);
    let index = 0;
    const speakNext = () => {
      if (!current()) return;
      if (!playingRef.current || index >= chunks.length) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      const utterance = new window.SpeechSynthesisUtterance(chunks[index]);
      index += 1;
      utterance.onend = speakNext;
      utterance.onerror = () => {
        if (!current()) return;
        playingRef.current = false;
        setPlaying(false);
      };
      try {
        synth.speak(utterance);
      } catch {
        if (!current()) return;
        playingRef.current = false;
        setPlaying(false);
      }
    };
    speakNext();
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (playingRef.current) stop();
      else start(text);
    },
    [start, stop],
  );

  // Cancel speech when the editor unmounts (resource cleanup).
  useEffect(() => stop, [stop]);

  return { supported, playing, toggle, stop };
}
