"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState, type CSSProperties } from "react";

import { WorkspaceSidebarIcon } from "./WorkspaceSidebarIcons";
import { identityColorFor } from "../../lib/identity-colors";
import { AVATAR_DOODLE_ART } from "./avatarDoodleArt";
import {
  avatarInitials,
  isAvatarDoodle,
  isProductAvatarDoodle,
  normalizeAccentHex,
  safeAvatarUrl,
  type UserAvatarSource,
} from "../../lib/user-avatar";

import styles from "./UserAvatar.module.css";

export type UserAvatarSize =
  | 18
  | 20
  | 24
  | 28
  | 32
  | 40
  | 56
  | 72
  | 96
  // the profile home (its dialog) and the settings card
  | 124
  | 152;

export interface UserAvatarProps {
  name: string;
  email?: string | null;
  /** The person's identity colour (`#rrggbb`); absent = a stable pick from
   *  the identity palette by email or name, never the viewer's theme. */
  accentColor?: string | null;
  avatar?: UserAvatarSource | null;
  size: UserAvatarSize;
  /** The accent ring the presence roster draws around a participant. */
  ring?: boolean;
  className?: string;
  title?: string;
  /** Doodle picker state: draws the selected outline. */
  selected?: boolean;
  "data-testid"?: string;
}

type AvatarTier = "photo" | "doodle" | "initials";

const TIER_CLASS: Record<AvatarTier, string> = {
  photo: styles.tierPhoto,
  doodle: styles.tierDoodle,
  initials: styles.tierInitials,
};

/**
 * One person, drawn the same way on every surface.
 *
 * Tiers, first usable wins: the uploaded photo (and if it fails to load, the
 * next tier), the chosen product doodle on a disc tinted with the person's
 * colour, then initials on a gradient of that colour. Decorative by default
 * (`aria-hidden`): every caller already prints the name beside it; pass
 * `title` when the avatar stands alone.
 */
export default function UserAvatar({
  name,
  email,
  accentColor,
  avatar,
  size,
  ring = false,
  className,
  title,
  selected = false,
  "data-testid": testId,
}: UserAvatarProps) {
  const photoUrl =
    avatar?.kind === "photo" ? safeAvatarUrl(avatar.url ?? null) : null;
  const doodle =
    avatar && isAvatarDoodle(avatar.doodle) && avatar.kind !== null
      ? avatar.doodle
      : null;
  // The URL that failed, not a boolean: a new photo must get its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photoUsable = Boolean(photoUrl) && failedUrl !== photoUrl;

  // A photo that failed falls back to the doodle when one is on record.
  const tier: AvatarTier = photoUsable
    ? "photo"
    : doodle
      ? "doodle"
      : "initials";

  const accent =
    normalizeAccentHex(accentColor) ?? identityColorFor(email || name);
  // A drawn doodle brings its own colours; a workspace glyph wears the
  // person's.
  const art =
    tier === "doodle" && doodle && !isProductAvatarDoodle(doodle)
      ? (AVATAR_DOODLE_ART[doodle] ?? null)
      : null;
  const style = {
    "--ua-size": `${size}px`,
    "--ua-accent": accent,
    ...(art ? { "--ua-art-from": art.from, "--ua-art-to": art.to } : {}),
  } as CSSProperties;
  const classes = [
    styles.avatar,
    TIER_CLASS[tier],
    art ? styles.tierArt : "",
    styles.custom,
    ring ? styles.ring : "",
    selected ? styles.selected : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={style}
      data-avatar-tier={tier}
      data-avatar-size={size}
      data-testid={testId}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {tier === "photo" && photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 64/256px avatar served by the API; next/image would proxy and re-encode it
        <img
          className={styles.photo}
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : art ? (
        <art.Icon
          className={styles.art}
          size={Math.max(10, Math.round(size * 0.54))}
          strokeWidth={size >= 40 ? 1.9 : 2.2}
          aria-hidden="true"
        />
      ) : tier === "doodle" && doodle && isProductAvatarDoodle(doodle) ? (
        <WorkspaceSidebarIcon
          kind={doodle}
          size={Math.max(12, Math.round(size * 0.74))}
        />
      ) : (
        <span className={styles.letters}>
          {avatarInitials(name, email, size >= 40 ? 2 : 1)}
        </span>
      )}
    </span>
  );
}
