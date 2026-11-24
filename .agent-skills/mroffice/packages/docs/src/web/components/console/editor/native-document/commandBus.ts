/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export type NativeDocumentCommandHandler<Payload = unknown> = (
  payload: Payload,
) => void | Promise<void>;

export interface NativeDocumentCommandBus {
  register: <Payload = unknown>(
    commandId: string,
    handler: NativeDocumentCommandHandler<Payload>,
  ) => () => void;
  execute: <Payload = unknown>(commandId: string, payload?: Payload) => Promise<boolean>;
  has: (commandId: string) => boolean;
  clear: () => void;
}

export function createNativeDocumentCommandBus(): NativeDocumentCommandBus {
  const handlers = new Map<string, NativeDocumentCommandHandler>();

  return {
    register(commandId, handler) {
      handlers.set(commandId, handler as NativeDocumentCommandHandler);
      return () => {
        if (handlers.get(commandId) === handler) {
          handlers.delete(commandId);
        }
      };
    },
    async execute(commandId, payload) {
      const handler = handlers.get(commandId);
      if (!handler) {
        return false;
      }
      await handler(payload);
      return true;
    },
    has(commandId) {
      return handlers.has(commandId);
    },
    clear() {
      handlers.clear();
    },
  };
}
