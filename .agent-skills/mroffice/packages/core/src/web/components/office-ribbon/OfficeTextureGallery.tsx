"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Shape > Fill > Picture or texture fill > Texture: Office's 24
 * textures as a grid of swatches (lib/office-textures draws each); picking
 * one fills the shape with it, tiled.
 */

import { useEffect, useState } from "react";

import { OFFICE_TEXTURES, officeTextureDataUrl } from "../../lib/office-textures";

const SWATCH = 28;

export function OfficeTextureGallery({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const chinese = typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
  useEffect(() => {
    // Drawn once on the client (a canvas each); the server draws none.
    const next: Record<string, string> = {};
    for (const texture of OFFICE_TEXTURES) {
      const url = officeTextureDataUrl(texture.id, 48);
      if (url) next[texture.id] = url;
    }
    setPreviews(next);
  }, []);
  return (
    <div data-testid="office-texture-gallery" style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12 }}>{chinese ? "纹理" : "Texture"}</span>
      <div role="listbox" aria-label={chinese ? "纹理" : "Texture"} style={{ display: "grid", gridTemplateColumns: `repeat(6, ${SWATCH}px)`, gap: 4 }}>
        {OFFICE_TEXTURES.map((texture) => {
          const name = chinese ? texture.zh : texture.en;
          return (
            <button
              key={texture.id}
              type="button"
              role="option"
              aria-selected={false}
              title={name}
              aria-label={name}
              disabled={disabled}
              data-testid={`office-texture-${texture.id}`}
              onClick={() => onPick(texture.id)}
              style={{
                width: SWATCH,
                height: SWATCH,
                padding: 0,
                border: "1px solid var(--office-control-border, #c8c8c8)",
                borderRadius: 3,
                cursor: disabled ? "default" : "pointer",
                backgroundColor: `rgb(${texture.light.join(" ")})`,
                backgroundImage: previews[texture.id] ? `url("${previews[texture.id]}")` : undefined,
                backgroundSize: "cover",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
