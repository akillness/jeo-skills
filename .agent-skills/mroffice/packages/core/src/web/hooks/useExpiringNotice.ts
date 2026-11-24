"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";



















export interface ExpiringNoticeOptions {
  /** A standing state, not a passing event: no countdown, typing keeps it. */
  lasting?: boolean;
  /** Who said it. A clear naming an owner removes only that owner's notice, so
   *  a control taking back its own line cannot take away someone else's. */
  owner?: string;
}

/** Say a notice, or with `null` take it away. Shaped so a plain
 *  `Dispatch<SetStateAction<string | null>>` caller keeps working. */
export type ExpiringNoticeSetter<T = string> = (message: T | null, options?: ExpiringNoticeOptions) => void;

/** What a notice says: its words, or (the attachment tray's) a reason the
 *  line renders in its own words. */
export interface ExpiringNotice<T = string> {
  message: T;
  lasting: boolean;
  owner: string | null;
  /** Every notice said is a new one, even with the same words. */
  serial: number;
}

/** Long enough to read a two-line notice in any of the languages twice. */
export const NOTICE_TTL_MS = 10_000;

export interface UseExpiringNoticeOptions {
  /** The conversation the notice belongs to: leaving it (for another, or for a
   *  new one) takes the notice away, as it was about the place left. A null key
   *  becoming one is the first send creating its conversation, and keeps it. */
  contextKey?: string | null;
  ttlMs?: number;
}

export interface ExpiringNoticeHoldProps {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface ExpiringNoticeControl<T = string> {
  notice: ExpiringNotice<T> | null;
  message: T | null;
  setNotice: ExpiringNoticeSetter<T>;
  /** The close button: any notice, lasting or not. */
  dismiss: () => void;
  /** The person typed: a passing notice has been read; a lasting one stays. */
  dismissPassing: () => void;
  /** Spread on the notice's element: the countdown waits while it is read. */
  holdProps: ExpiringNoticeHoldProps;
}

/**
 * For a notice kept in a state of its own, with other state deciding whether it
 * has any other way out: while `notice` is given it is cleared after `ttlMs`, and
 * a different notice counts from when it appears.
 */
export function useNoticeExpiry<T>(
  notice: T | null | undefined,
  clear: () => void,
  ttlMs: number = NOTICE_TTL_MS,
): void {
  const clearRef = useRef(clear);
  useEffect(() => {
    clearRef.current = clear;
  });
  useEffect(() => {
    if (notice === null || notice === undefined) return;
    const timer = setTimeout(() => clearRef.current(), ttlMs);
    return () => clearTimeout(timer);
  }, [notice, ttlMs]);
}

export function useExpiringNotice<T = string>({
  contextKey = null,
  ttlMs = NOTICE_TTL_MS,
}: UseExpiringNoticeOptions = {}): ExpiringNoticeControl<T> {
  const [notice, setNoticeState] = useState<ExpiringNotice<T> | null>(null);
  const [pointerHold, setPointerHold] = useState(false);
  const [focusHold, setFocusHold] = useState(false);
  const serialRef = useRef(0);

  const clearAll = useCallback(() => setNoticeState(null), []);

  const setNotice = useCallback<ExpiringNoticeSetter<T>>(
    (message, options) => {
      if (message === null || message === undefined || (message as unknown) === "") {
        const owner = options?.owner;
        if (!owner) {
          clearAll();
          return;
        }
        setNoticeState((current) => (current && current.owner === owner ? null : current));
        return;
      }
      serialRef.current += 1;
      setNoticeState({
        message,
        lasting: Boolean(options?.lasting),
        owner: options?.owner ?? null,
        serial: serialRef.current,
      });
    },
    [clearAll],
  );

  const dismissPassing = useCallback(() => {
    setNoticeState((current) => (current && !current.lasting ? null : current));
  }, []);

  // The line's element goes with its notice, however that ended, and no leave
  // or blur will follow: the next notice must not start out held.
  if (!notice && (pointerHold || focusHold)) {
    setPointerHold(false);
    setFocusHold(false);
  }

  const held = pointerHold || focusHold;
  useEffect(() => {
    if (!notice || notice.lasting || held) return;
    const serial = notice.serial;
    const timer = setTimeout(() => {
      setNoticeState((current) => (current?.serial === serial ? null : current));
    }, ttlMs);
    return () => clearTimeout(timer);
  }, [held, notice, ttlMs]);

  const [context, setContext] = useState(contextKey);
  if (context !== contextKey) {
    setContext(contextKey);
    // A first send creates its conversation: the composer has not moved, and
    // what that send went on to say (a file that would not upload) stays.
    if (context !== null) setNoticeState(null);
  }

  const holdProps = useMemo<ExpiringNoticeHoldProps>(
    () => ({
      onPointerEnter: () => setPointerHold(true),
      onPointerLeave: () => setPointerHold(false),
      onFocus: () => setFocusHold(true),
      onBlur: () => setFocusHold(false),
    }),
    [],
  );

  return {
    notice,
    message: notice?.message ?? null,
    setNotice,
    dismiss: clearAll,
    dismissPassing,
    holdProps,
  };
}
