/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, type AnchorHTMLAttributes } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, prefetch: _p, replace: _r, scroll: _s, ...rest }, ref) {
  return <a ref={ref} href={typeof href === "string" ? href : href.pathname ?? "#"} {...rest} />;
});
export default Link;
