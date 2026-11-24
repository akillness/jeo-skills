/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import {
  BarChart3,
  Paperclip,
  Pin,
  Tag,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type {
  PdfNativeFileAttachmentIcon,
} from "../../../../../lib/pdf/native-file-attachment-roundtrip";

export function pdfFileAttachmentIcon(icon: PdfNativeFileAttachmentIcon): ReactNode {
  const props = {
    "aria-hidden": true,
    "data-pdf-attachment-icon": icon,
    size: 14,
  } as const;
  if (icon === "PushPin") return <Pin {...props} />;
  if (icon === "Graph") return <BarChart3 {...props} />;
  if (icon === "Tag") return <Tag {...props} />;
  return <Paperclip {...props} />;
}
