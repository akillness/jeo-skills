/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// next/dynamic for a plain React host: the module loads when the component
// first renders, with the loading element meanwhile.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;
interface DynamicOptions {
  ssr?: boolean;
  loading?: (props: { error?: unknown; isLoading?: boolean; pastDelay?: boolean }) => ReactNode;
}

export default function dynamic<P = Record<string, unknown>>(loader: Loader<P>, options: DynamicOptions = {}): ComponentType<P> {
  const Lazy = lazy(async () => {
    const loaded = await loader();
    const component = (loaded as { default?: ComponentType<P> }).default ?? (loaded as ComponentType<P>);
    return { default: component };
  });
  const Loading = options.loading;
  function Dynamic(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading isLoading pastDelay /> : null}>
        {/* @ts-expect-error props pass through */}
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Dynamic as ComponentType<P>;
}
