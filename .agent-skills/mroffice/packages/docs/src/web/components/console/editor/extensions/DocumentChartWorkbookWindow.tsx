"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  publishChartWorkbookWindow,
  releaseChartWorkbookWindow,
} from "@mrnote/sheets/web/lib/spreadsheet/chart-workbook-window-session.ts";
import {
  WindowManagerProvider,
  useWindowManagerActionsOptional,
  useWindows,
  type WindowState,
} from "@mrnote/core/web/components/notebook/WindowManager.tsx";
import { WindowCloseGuardProvider } from "@mrnote/core/web/components/notebook/WindowCloseGuard.tsx";
import { PortalLayerProvider } from "@mrnote/core/web/components/ui/portal-host.tsx";
import Window from "@mrnote/core/web/components/notebook/Window.tsx";
import MinimizedTray from "@mrnote/core/web/components/notebook/MinimizedTray.tsx";
import ChartWorkbookWindow from "@mrnote/core/web/components/notebook/windows/ChartWorkbookWindow.tsx";
import "@mrnote/core/web/styles/window-manager.css";

function StandaloneWindows({title}:{title:string}) {
  const windows = useWindows();
  const manager=useWindowManagerActionsOptional();
  useEffect(()=>{for(const item of windows)if(item.title!==title)manager?.renameWindow(item.id,title);},[windows,title,manager]);
  return (
    <>
      {windows.map((item) => (
        <Window key={item.id} windowState={item}>
          <ChartWorkbookWindow
            sessionId={item.meta.sessionId}
            windowId={item.id}
          />
        </Window>
      ))}
      <MinimizedTray />
    </>
  );
}

/** Uses exactly the same shell as ordinary notebook editors. The standalone
 * provider is only for embedded/guest Docs surfaces that have no canvas. */
export function DocumentChartWorkbookWindow({
  id,
  title,
  inCanvas,
  children,
  beforeClose,
  onClose,
  hostWindowId,
}: {
  id: string;
  title: string;
  inCanvas: boolean;
  children: (windowId: string) => ReactNode;
  beforeClose: () => boolean;
  onClose: () => void;
  /** The canvas window this editor is in: kept mounted while minimized so
   * the data window it opened stays open. */
  hostWindowId?: string;
}) {
  const manager = useWindowManagerActionsOptional();
  const owner = useRef(Symbol("chart-workbook-owner"));
  // The session whose window was asked for: another chart's Edit Data hands
  
  const openRequestedRef = useRef<string | null>(null);
  const global = Boolean(inCanvas && manager);
  // The layer's own popup host: the workbook's menus, dialogs and palettes
  // open in here, above its window, instead of on <body> under the layer.
  const [popupLayer, setPopupLayer] = useState<HTMLDivElement | null>(null);
  const [fallback] = useState<WindowState>(
    () => ({
      id: `workbook-${id}`,
      type: "chart_workbook",
      title,
      x: 32,
      y: 32,
      width: Math.min(
        1360,
        typeof window === "undefined" ? 1360 : window.innerWidth - 64,
      ),
      height: Math.min(
        840,
        typeof window === "undefined" ? 840 : window.innerHeight - 96,
      ),
      zIndex: 1,
      minimized: false,
      maximized: false,
      meta: { sessionId: id },
    }),
  );
  const initialWindows = useMemo(() => [fallback], [fallback]);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
    // Publish before the normal Canvas can mount its window body.
    publishChartWorkbookWindow(id, owner.current, {
      content: children,
      beforeClose,
      close: () => closeRef.current(),
      ...(global && hostWindowId ? { hostWindowId } : {}),
    });
    if (global && manager && openRequestedRef.current !== id) {
      openRequestedRef.current=id;
      manager.openWindow({
        type: "chart_workbook",
        title,
        meta: { sessionId: id },
        beside_type: "note",
      });
    }
    if(global&&manager){
      const item=manager.readWindows().find(item=>item.type==="chart_workbook"&&item.meta.sessionId===id);
      if(item&&item.title!==title)manager.renameWindow(item.id,title);
    }
  }, [id, title, children, beforeClose, fallback.id, global, manager, onClose, hostWindowId]);
  useEffect(() => {
    const token = owner.current;
    return () => {
      releaseChartWorkbookWindow(id, token);
      if (global && manager) {
        for (const item of manager.readWindows())
          if (item.type === "chart_workbook" && item.meta.sessionId === id)
            manager.closeWindow(item.id);
      }
    };
  }, [id, global, manager]);
  if (global || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="chart-workbook-standalone wm-canvas-viewport"
      data-theme="console"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 7000,
        pointerEvents: "none",
      }}
    >
      <style>{`.chart-workbook-standalone .wm-window, .chart-workbook-standalone .wm-minimized-tray { pointer-events: auto; }`}</style>
      <PortalLayerProvider layer={popupLayer}>
        <WindowManagerProvider
          notebookId={`chart-workbook-${id}`}
          ephemeral
          initialWindows={initialWindows}
        >
          <WindowCloseGuardProvider>
            <StandaloneWindows title={title}/>
          </WindowCloseGuardProvider>
        </WindowManagerProvider>
      </PortalLayerProvider>
      {/* Zero-size and after the windows: its fixed-position popups paint
          over them, inside this layer's stacking level. */}
      <div
        ref={setPopupLayer}
        className="chart-workbook-standalone__popups"
        style={{ pointerEvents: "auto" }}
      />
    </div>,
    document.body,
  );
}
