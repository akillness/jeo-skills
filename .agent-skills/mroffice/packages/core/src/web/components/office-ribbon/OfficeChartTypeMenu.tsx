"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Chart Design > Type > Change Chart Type: every chart type, each with its
 * subtypes, in all three editors.
 *
 * Word, Excel and PowerPoint open one Change Chart Type list (the type on the
 * left, its subtypes beside it). MRAI drew it three ways: Docs listed the
 * families only and always switched to the first subtype, the deck listed the
 * 49 classic subtypes and no chartEx type, and the worksheet grouped families
 * the way Excel's Insert tab does. This is the one list; a host supplies:
 *
 * - `groups` -- which families sit under which entry. The default is one entry
 *   per family in the catalog's order (Office's Change Chart Type list). The
 *   worksheet passes Excel's Insert-tab grouping, which it has always shown.
 * - `choice(family, subtype)` -- whether its writer can make the chart that
 *   type, why not, and whether it already is that type.
 * - `onChoose(family, subtype)` -- the commit, in the host's own transaction.
 * - the test ids, so each editor's suites keep addressing their own names.
 */
import type { ReactNode } from "react";

import { RibbonDropdownMenuSubContent } from "./CupertinoRibbonMenu";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import type { OfficeSemanticIconId } from "./icons/officeIconRegistry";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu";
import {
  CHART_SUBTYPES_BY_FAMILY,
  chartFamilyIcon,
  type ChartFamily,
  type ChartSubtype,
} from "../console/editor/extensions/chartBlockShared";
import { OFFICE_CHART_FAMILY_ORDER } from "../../lib/office-charts/catalog";

export interface OfficeChartTypeGroup {
  id: string;
  label: string;
  icon: OfficeSemanticIconId;
  families: readonly ChartFamily[];
}

export interface OfficeChartTypeChoice {
  enabled: boolean;
  /** Why the host cannot make the chart this type (shown as the tooltip). */
  reason?: string;
  /** The chart already is this type and subtype. */
  checked: boolean;
}

/** Office's Change Chart Type list: one entry per family, in catalog order. */
export function officeChartTypeFamilyGroups(
  familyLabel: (family: ChartFamily) => string,
  families: readonly ChartFamily[] = OFFICE_CHART_FAMILY_ORDER,
): OfficeChartTypeGroup[] {
  return families.map((family) => ({
    id: family,
    label: familyLabel(family),
    icon: chartFamilyIcon(family),
    families: [family],
  }));
}

export interface OfficeChartTypeMenuItemsProps {
  groups: readonly OfficeChartTypeGroup[];
  choice: (family: ChartFamily, subtype: ChartSubtype) => OfficeChartTypeChoice;
  subtypeLabel: (family: ChartFamily, subtype: ChartSubtype) => string;
  onChoose: (family: ChartFamily, subtype: ChartSubtype) => void;
  groupTestId: (group: OfficeChartTypeGroup) => string;
  itemTestId: (family: ChartFamily, subtype: ChartSubtype) => string;
  /** Why a whole entry is unavailable (every subtype refused). */
  groupUnavailableReason?: string;
  /**
   * Grey an entry out when every subtype under it is refused (default). The
   * worksheet keeps its entries open so each row can say why it is refused.
   */
  disableUnavailableGroups?: boolean;
}

export function OfficeChartTypeMenuItems(
  props: OfficeChartTypeMenuItemsProps,
): ReactNode {
  return props.groups.map((group) => {
    const rows = group.families.flatMap((family) =>
      (CHART_SUBTYPES_BY_FAMILY[family] as readonly ChartSubtype[]).map(
        (subtype) => ({ family, subtype, choice: props.choice(family, subtype) }),
      ),
    );
    const available =
      props.disableUnavailableGroups === false ||
      rows.some((row) => row.choice.enabled);
    const current = rows.some((row) => row.choice.checked);
    return (
      <DropdownMenuSub key={group.id}>
        <DropdownMenuSubTrigger
          data-testid={props.groupTestId(group)}
          data-current={current ? "true" : undefined}
          disabled={!available}
          title={available ? undefined : props.groupUnavailableReason}
        >
          <OfficeSemanticIcon semanticId={group.icon} size={18} />
          <span>{group.label}</span>
        </DropdownMenuSubTrigger>
        <RibbonDropdownMenuSubContent
          style={{
            maxHeight:
              "min(520px, var(--radix-dropdown-menu-content-available-height))",
            overflowY: "auto",
            minWidth: 240,
          }}
        >
          {rows.map(({ family, subtype, choice }) => (
            <DropdownMenuItem
              key={`${family}:${subtype}`}
              disabled={!choice.enabled}
              title={choice.reason}
              data-testid={props.itemTestId(family, subtype)}
              role="menuitemradio"
              aria-checked={choice.checked}
              onSelect={() => props.onChoose(family, subtype)}
            >
              <OfficeSemanticIcon semanticId={group.icon} size={18} />
              {props.subtypeLabel(family, subtype)}
            </DropdownMenuItem>
          ))}
        </RibbonDropdownMenuSubContent>
      </DropdownMenuSub>
    );
  });
}
