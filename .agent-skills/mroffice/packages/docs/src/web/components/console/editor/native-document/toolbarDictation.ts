/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Thin, browser-owned speech-recognition boundary for the Docs Home ribbon.
 *
 * The Web Speech API is still vendor-prefixed in Safari/Chromium typings, so
 * keep its deliberately small runtime surface here instead of leaking `any`
 * through DocumentToolbar. Audio never passes through the editor: the browser
 * owns permission/capture and we receive final transcript strings only.
 */

export type ToolbarDictationErrorReason =
  "permission-denied" | "no-microphone" | "no-speech" | "failed";

export interface ToolbarSpeechRecognitionAlternative {
  transcript: string;
}

export interface ToolbarSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: ToolbarSpeechRecognitionAlternative;
}

export interface ToolbarSpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: ToolbarSpeechRecognitionResult;
}

export interface ToolbarSpeechRecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: ToolbarSpeechRecognitionResultList;
}

export interface ToolbarSpeechRecognitionErrorEvent {
  readonly error: string;
}

export interface ToolbarSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: ToolbarSpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: ToolbarSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export type ToolbarSpeechRecognitionConstructor =
  new () => ToolbarSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: ToolbarSpeechRecognitionConstructor;
  webkitSpeechRecognition?: ToolbarSpeechRecognitionConstructor;
};

export function toolbarSpeechRecognitionConstructor(
  source: Window | undefined = typeof window === "undefined"
    ? undefined
    : window,
): ToolbarSpeechRecognitionConstructor | null {
  if (!source) return null;
  const speechWindow = source as SpeechRecognitionWindow;
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

/** Return only NEW final segments; interim hypotheses must never hit history. */
export function finalToolbarDictationText(
  event: ToolbarSpeechRecognitionResultEvent,
): string {
  const segments: string[] = [];
  const start = Math.max(0, event.resultIndex || 0);
  for (let index = start; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (!result?.isFinal) continue;
    const transcript = result[0]?.transcript?.trim();
    if (transcript) segments.push(transcript);
  }
  return segments.join(" ");
}

/** Add a word boundary for adjacent Latin/digit runs, never for CJK text. */
export function toolbarDictationInsertionText(
  previousCharacter: string,
  transcript: string,
): string {
  const normalized = transcript.trim();
  if (!normalized) return "";
  return /[A-Za-z0-9]$/.test(previousCharacter) &&
    /^[A-Za-z0-9]/.test(normalized)
    ? ` ${normalized}`
    : normalized;
}

export function toolbarDictationErrorReason(
  error: string,
): ToolbarDictationErrorReason {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "permission-denied";
  }
  if (error === "audio-capture") return "no-microphone";
  if (error === "no-speech") return "no-speech";
  return "failed";
}
