"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ExplorationGraph } from "@/components/exploration-graph";
import { api } from "@/lib/api";
import type { Edge, TaskNode } from "@/lib/types";
import { setVisibleInterval } from "@/lib/polling";

export function GraphTab({ taskId }: { taskId: string }) {
  const [nodes, setNodes] = React.useState<TaskNode[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  // Signature of the previous graph data: polling skips setState on identical data to avoid
  // rebuilding the whole graph (so dragging is not jarred by the 20s poll). Only render-affecting fields count.
  const sigRef = React.useRef("");

  React.useEffect(() => {
    let cancelled = false;
    sigRef.current = ""; // task switch: force the next refresh
    const load = () => {
      api
        .explorationGraph(taskId)
        .then((g) => {
          if (cancelled) return;
          const ns = g.nodes ?? [];
          const es = g.edges ?? [];
          const sig = JSON.stringify([
            ns.map((n) => [n.id, n.type, n.state, n.priority, n.payload]),
            es.map((e) => [e.src, e.dst, e.rel]),
          ]);
          if (sig === sigRef.current) return; // unchanged → do not rebuild
          sigRef.current = sig;
          setNodes(ns);
          setEdges(es);
        })
        .catch(() => {
          /* keep last good data */
        });
    };
    load();
    const stopPolling = setVisibleInterval(load, 20000);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [taskId]);

  return (
    <Card>
      <CardContent className="p-0">
        <ExplorationGraph nodes={nodes} edges={edges} className="h-[72vh]" />
      </CardContent>
    </Card>
  );
}
