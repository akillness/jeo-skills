/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import * as React from "react";

import {
  EditorLoadingState,
  type EditorLoadingKind,
} from "./editor-loading-state";
import { cn } from "../../lib/utils";

/**
 * The surfaces a route `loading.tsx` can stand in for.
 *
 *   - `splash`    → anything under `[locale]` without a nearer boundary
 *                   (sign-in, legal, the first paint of the app): no
 *                   console chrome.
 *   - `console`   → the workspace's content region, inside its shell.
 *   - `dashboard` → a figures-and-charts page.
 *   - `reader`    → a reading page.
 */
export type RouteSkeletonVariant = "splash" | "console" | "dashboard" | "reader";

/** Default SR label when a caller does not pass a localized string. */
const DEFAULT_LOADING_LABEL = "Loading…";

/** Which card each variant shows. */
const VARIANT_KIND: Readonly<Record<RouteSkeletonVariant, EditorLoadingKind>> = {
  splash: "app",
  console: "app",
  dashboard: "dashboard",
  reader: "document",
};

/**
 * A single decorative shimmer block, for rows held open beside content
 * that is already on screen.
 *
 * Always `aria-hidden` (its surface owns the announcement). The shimmer is
 * gated behind `motion-safe:` and additionally neutralised by the global
 * reduced-motion kill-switch in `globals.css`.
 */
export function Skeleton({
  className,
  style,
}: {
  readonly className?: string;
  readonly style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton-block"
      className={cn(
        "rounded-md bg-raised/70 motion-safe:animate-pulse",
        className,
      )}
      style={style}
    />
  );
}

/**
 * Accessible route loading: one `role="status"` live region with an
 * `sr-only` label, and the shared loading card for the `variant`.
 */
export function RouteLoadingSkeleton({
  variant,
  label = DEFAULT_LOADING_LABEL,
  className,
  testId,
}: {
  readonly variant: RouteSkeletonVariant;
  /** Localized "Loading…": announced once, and the card's caption. */
  readonly label?: string;
  readonly className?: string;
  readonly testId?: string;
}): React.JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid={testId ?? `route-loading-${variant}`}
      data-loading-variant={variant}
      className={cn("route-loading-appear w-full", className)}
    >
      {/* The single announced string. Visually hidden; SR reads it once. */}
      <span className="sr-only" data-testid="route-loading-label">
        {label}
      </span>
      <div
        aria-hidden="true"
        data-testid={`route-loading-${variant}-body`}
        // A height, not a minimum: the card centres itself in a box whose
        // height is known (a percentage of a min-height resolves to auto,
        // and the card would sit at the top at its smallest size).
        className={cn(
          "flex w-full",
          variant === "console"
            ? // the content region of the mounted console shell
              "h-[calc(var(--viewport-h,100vh)-var(--console-shell-offset-top,56px)-var(--console-shell-offset-bottom,28px))]"
            : variant === "splash"
              ? "h-[72vh]"
              : "h-[100dvh]",
        )}
      >
        <EditorLoadingState
          kind={VARIANT_KIND[variant]}
          label={label}
          announce={false}
          testId={`route-loading-${variant}-card`}
        />
      </div>
    </div>
  );
}

export default RouteLoadingSkeleton;
