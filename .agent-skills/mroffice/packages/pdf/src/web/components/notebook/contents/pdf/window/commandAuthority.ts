/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type {
  PdfCommandAuthority,
  PdfCommandAuthorityOwner,
  PdfCommandAuthoritySet,
  PdfCommandAuthoritySetOwner,
  PdfCommandInvocation,
} from "../commandRegistry";

/** Publish receipt-bearing command handlers only after React commits. */
export function useCommittedPdfCommandAuthoritySet(
  owner: PdfCommandAuthoritySetOwner,
  bindings: Parameters<PdfCommandAuthoritySetOwner["bind"]>[0],
  recoveryEpoch: number,
): PdfCommandAuthoritySet | null {
  const bindingsRef = useRef(bindings);
  const [binding, setBinding] = useState<{
    owner: PdfCommandAuthoritySetOwner;
    authority: PdfCommandAuthoritySet;
  } | null>(null);

  useLayoutEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);
  useLayoutEffect(() => {
    setBinding({ owner, authority: owner.bind(bindingsRef.current) });
  }, [owner, recoveryEpoch]);

  return binding?.owner === owner ? binding.authority : null;
}

/** Publish one exact-action authority only after React commits the owner. */
export function useCommittedPdfCommandAuthority<
  Invocation extends PdfCommandInvocation,
>(
  owner: PdfCommandAuthorityOwner<Invocation>,
  execute: Parameters<PdfCommandAuthorityOwner<Invocation>["bind"]>[0],
  recoveryEpoch: number,
): PdfCommandAuthority<Invocation> | null {
  const executeRef = useRef(execute);
  const [binding, setBinding] = useState<{
    owner: PdfCommandAuthorityOwner<Invocation>;
    authority: PdfCommandAuthority<Invocation>;
  } | null>(null);

  useLayoutEffect(() => {
    executeRef.current = execute;
  }, [execute]);
  useLayoutEffect(() => {
    setBinding({
      owner,
      authority: owner.bind(() => executeRef.current()),
    });
  }, [owner, recoveryEpoch]);

  return binding?.owner === owner ? binding.authority : null;
}
