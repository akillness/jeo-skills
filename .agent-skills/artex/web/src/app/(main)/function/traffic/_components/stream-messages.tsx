"use client";

import * as React from "react";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { intlLocale, t } from "@/i18n";
import { api } from "@/lib/api";
import { createTrafficStreamPager, emptyTrafficStreamState } from "@/lib/traffic-stream";
import type { TrafficStreamDirection, TrafficStreamMessage } from "@/lib/types";

// Binary payloads loaded in full are shown as hex of their first 64 KiB.
const HEX_PREVIEW_BYTES = 64 * 1024;

function fmtBytes(n: number) {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

function fmtDirection(direction: string) {
  if (direction === "c2s") return t("client -> server");
  if (direction === "s2c") return t("server -> client");
  return direction;
}

// Hex dump: 16 bytes per line, offset first.
function hexDump(bytes: Uint8Array) {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const row = Array.from(bytes.subarray(i, i + 16), (b) => b.toString(16).padStart(2, "0")).join(" ");
    lines.push(`${i.toString(16).padStart(8, "0")}  ${row}`);
  }
  return lines.join("\n");
}

type FullPayload = { loading: boolean; text?: string; error?: string };

const payloadClass =
  "max-h-64 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-xs break-all whitespace-pre-wrap";

function StreamMessageRow({ message }: { message: TrafficStreamMessage }) {
  const [full, setFull] = React.useState<FullPayload | null>(null);
  const binary = message.type === "binary";

  const loadFull = () => {
    if (!message.blob) return;
    setFull({ loading: true });
    api
      .trafficBlob(message.blob)
      .then((bytes) => {
        const text = binary
          ? `${hexDump(bytes.subarray(0, HEX_PREVIEW_BYTES))}\n${t("({count} bytes total)", { count: bytes.length })}`
          : new TextDecoder().decode(bytes);
        setFull({ loading: false, text });
      })
      .catch((e: Error) => setFull({ loading: false, error: e.message }));
  };

  if (message.type === "meta") {
    return (
      <div className="mx-5 my-3 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
        <div className="font-medium text-amber-700 text-xs dark:text-amber-400">
          {t("#{seq} Recording limit reached: later messages were not stored", { seq: message.seq })}
        </div>
        <pre className={payloadClass}>{message.payload}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 border-b px-5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground tabular-nums">#{message.seq}</span>
        <Badge variant="outline">{fmtDirection(message.direction)}</Badge>
        <Badge variant="secondary">{t(message.type)}</Badge>
        {binary && message.encoding === "base64" && <Badge variant="outline">base64</Badge>}
        {message.truncated && <Badge variant="destructive">{t("truncated")}</Badge>}
        {message.event && <span className="font-mono">event: {message.event}</span>}
        {message.event_id && <span className="font-mono">id: {message.event_id}</span>}
        {message.retry ? <span className="font-mono">retry: {message.retry}</span> : null}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {fmtBytes(message.size)} · {new Date(message.ts * 1000).toLocaleTimeString(intlLocale)}
        </span>
      </div>
      <pre className={payloadClass}>{full?.text ?? message.payload}</pre>
      {message.blob && (
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span className="break-all font-mono">blob {message.blob}</span>
          {!full?.text && (
            <Button variant="outline" size="xs" disabled={full?.loading} onClick={loadFull}>
              {full?.loading && <Loader2Icon className="animate-spin" />}
              {t("Load full payload")}
            </Button>
          )}
          {full?.error && <span className="text-destructive">{full.error}</span>}
        </div>
      )}
    </div>
  );
}

// StreamMessagesPanel lists the messages of one WebSocket or SSE exchange, a
// page at a time. It does not poll: Refresh reloads from the start.
type StreamMessagesProps = { exchangeId: string; kind: "websocket" | "sse" };

export function StreamMessagesPanel(props: StreamMessagesProps) {
  // A different exchange starts with All directions and its own request state.
  return <StreamMessages key={props.exchangeId} {...props} />;
}

function StreamMessages({ exchangeId, kind }: StreamMessagesProps) {
  const [direction, setDirection] = React.useState<TrafficStreamDirection>("");
  const [{ items, total, messageTotal, loading, loadingMore, error }, setPage] =
    React.useState(emptyTrafficStreamState);
  const pager = React.useMemo(() => createTrafficStreamPager(api.trafficStream, setPage), []);
  const messageCount = items.filter((message) => message.type !== "meta").length;

  React.useEffect(() => {
    pager.select(exchangeId, direction);
    return pager.cancel;
  }, [exchangeId, direction, pager]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-muted-foreground text-xs">
        <span>
          {t("{kind} · {count} of {total} messages", {
            kind: kind === "websocket" ? "WebSocket" : "Server-Sent Events",
            count: messageCount,
            total: messageTotal,
          })}
        </span>
        <Select
          value={direction || "all"}
          onValueChange={(value) => {
            const next = value === "all" ? "" : (value as TrafficStreamDirection);
            if (next === direction) return;
            // Invalidate before the next effect, so an old page cannot land
            // between the selection event and the new filter's first request.
            pager.cancel();
            setDirection(next);
          }}
        >
          <SelectTrigger size="sm" className="ml-auto" aria-label={t("Message direction")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All directions")}</SelectItem>
            <SelectItem value="c2s">{t("client -> server")}</SelectItem>
            <SelectItem value="s2c">{t("server -> client")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="xs" disabled={loading} onClick={pager.refresh}>
          <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          {t("Refresh")}
        </Button>
      </div>
      {renderBody()}
    </div>
  );

  function renderBody() {
    if (loading) {
      return (
        <div className="flex items-center gap-2 p-5 text-muted-foreground text-xs">
          <Loader2Icon className="size-3.5 animate-spin" />
          {t("Loading messages…")}
        </div>
      );
    }
    if (error) {
      return <div className="p-5 text-destructive text-xs">{t("Failed to load messages: {error}", { error })}</div>;
    }
    return (
      <>
        {messageTotal === 0 && (
          <div className="p-5 text-muted-foreground text-xs">
            {direction ? t("No messages recorded in this direction.") : t("No messages recorded for this stream.")}
          </div>
        )}
        {items.length > 0 && (
          <div className="border-t">
            {items.map((m) => (
              <StreamMessageRow key={`${exchangeId}:${m.seq}`} message={m} />
            ))}
          </div>
        )}
        {items.length < total && (
          <div className="flex justify-center p-4">
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={pager.loadMore}>
              {loadingMore && <Loader2Icon className="animate-spin" />}
              {t("Load more")}
            </Button>
          </div>
        )}
      </>
    );
  }
}
