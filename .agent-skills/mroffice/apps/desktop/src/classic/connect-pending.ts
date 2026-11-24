/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** How long a started sign-in waits for its link. */
export const CONNECT_TTL_MS = 30 * 60_000;

export interface ConnectBegin {
  /** The challenge to open the connect page with. */
  readonly challenge: string;
  /** Joined a sign-in that was already waiting (no new verifier). */
  readonly joined: boolean;
  /** true once signed in; false when this wait ended without it (lapsed, or a redeem failed). */
  readonly done: Promise<boolean>;
}

export type ConnectTake =
  | { readonly kind: "redeem"; readonly verifier: string }
  /** A redeem of this sign-in is already running (the link was opened twice). */
  | { readonly kind: "busy" }
  /** Nothing waits: never started here, finished, or lapsed. */
  | { readonly kind: "none" };

interface Attempt {
  readonly verifier: string;
  readonly challenge: string;
  readonly startedAt: number;
  redeeming: boolean;
}

export class PendingConnect {
  private attempt: Attempt | null = null;
  private waiters: Array<(done: boolean) => void> = [];

  constructor(
    private readonly newVerifier: () => string,
    private readonly challengeFor: (verifier: string) => string,
    private readonly now: () => number = Date.now,
  ) {}

  private live(): Attempt | null {
    const attempt = this.attempt;
    if (attempt && this.now() - attempt.startedAt > CONNECT_TTL_MS) {
      this.end(false);
      return null;
    }
    return attempt;
  }

  private end(done: boolean): void {
    this.attempt = null;
    this.settle(done);
  }

  private settle(done: boolean): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve(done);
  }

  /** Whether a sign-in is waiting now. */
  waiting(): boolean {
    return this.live() !== null;
  }

  /** Start a sign-in, or join the one already waiting. */
  begin(): ConnectBegin {
    let attempt = this.live();
    const joined = attempt !== null;
    if (!attempt) {
      const verifier = this.newVerifier();
      attempt = { verifier, challenge: this.challengeFor(verifier), startedAt: this.now(), redeeming: false };
      this.attempt = attempt;
    }
    const done = new Promise<boolean>((resolve) => this.waiters.push(resolve));
    return { challenge: attempt.challenge, joined, done };
  }

  /** A link came back: the verifier to redeem its code with. */
  take(): ConnectTake {
    const attempt = this.live();
    if (!attempt) return { kind: "none" };
    if (attempt.redeeming) return { kind: "busy" };
    attempt.redeeming = true;
    return { kind: "redeem", verifier: attempt.verifier };
  }

  /** The redeem of a taken link ended. A failure keeps the sign-in waiting
   * (its page can be allowed again), but answers whoever waited now. */
  finish(signedIn: boolean): void {
    const attempt = this.attempt;
    if (!attempt) return;
    if (signedIn) {
      this.end(true);
      return;
    }
    attempt.redeeming = false;
    this.settle(false);
  }

  /** Time is up for the waiting sign-in (the app's timer): end it if it lapsed. */
  sweep(): void {
    this.live();
  }
}
