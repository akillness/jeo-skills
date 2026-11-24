/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
  placeholder?: string;
};

export default function Image({ src, fill, priority: _priority, unoptimized: _unoptimized, quality: _quality, placeholder: _placeholder, style, ...rest }: ImageProps) {
  const url = typeof src === "string" ? src : src.src;
  return <img src={url} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style} {...rest} />;
}
