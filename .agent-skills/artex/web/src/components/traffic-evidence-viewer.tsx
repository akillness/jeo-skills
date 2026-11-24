"use client";

import * as React from "react";

import { toast } from "sonner";

import { HttpCodeBlock } from "@/components/http-code-block";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { FindingTrafficDetail, TrafficDetail } from "@/lib/types";
import { intlLocale, t } from "@/i18n";

export function TrafficEvidenceViewer({
  findingId,
  bindingId,
  contextTask,
  onClose,
}: {
  findingId: string;
  bindingId: string | null;
  contextTask?: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<FindingTrafficDetail | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!bindingId) return;
    let active = true;
    setDetail(null);
    setError("");
    api
      .findingTrafficDetail(findingId, bindingId, contextTask)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [findingId, bindingId, contextTask]);

  async function more(side: "request" | "response") {
    if (!detail || !bindingId) return;
    setBusy(true);
    try {
      const next = await api.findingTrafficBody(findingId, bindingId, side, detail[side].next_offset, contextTask);
      setDetail((current) =>
        current?.binding.id === bindingId
          ? { ...current, [side]: { ...next, content: current[side].content + next.content } }
          : current,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={bindingId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("Traffic evidence #{id}", { id: bindingId ?? "" })}</DialogTitle>
          <DialogDescription className="break-all">
            {detail?.binding.snapshot.url ?? t("View the request and response saved at binding time")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : detail ? (
          <>
            {detail.binding.snapshot.rewritten ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {detail.binding.snapshot.rewrite_rule_ids?.length
                  ? t("Rewritten by capture rules: {ids}", {
                      ids: detail.binding.snapshot.rewrite_rule_ids.map((id) => `#${id}`).join(", "),
                    })
                  : t("Rewritten by capture rules")}
              </p>
            ) : null}
            <Tabs defaultValue="request">
              <TabsList>
                <TabsTrigger value="request">{t("Request")}</TabsTrigger>
                <TabsTrigger value="response">{t("Response")}</TabsTrigger>
              </TabsList>
              {(["request", "response"] as const).map((side) => (
                <TabsContent key={side} value={side}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("Body {size} bytes", { size: detail[side].total.toLocaleString(intlLocale) })}
                      {detail[side].truncated ? ` · ${t("preview")}` : ""}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void api
                          .downloadFindingTrafficBody(findingId, detail.binding.id, side, contextTask)
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      {side === "request" ? t("Download full request body") : t("Download full response body")}
                    </Button>
                  </div>
                  <HttpCodeBlock
                    raw={`${(side === "request" ? detail.binding.snapshot.req_head : detail.binding.snapshot.resp_head)?.trimEnd() ?? ""}\n\n${detail[side].content}`}
                  />
                  {detail[side].truncated && !detail[side].binary ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void more(side)}>
                      {t("Load more body")}
                    </Button>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
          </>
        ) : (
          <Skeleton className="h-56 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CapturedTrafficViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [detail, setDetail] = React.useState<TrafficDetail | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!id) return;
    let active = true;
    setDetail(null);
    setError("");
    api
      .trafficExchange(id)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("Traffic preview")}</DialogTitle>
          <DialogDescription>{t("Traffic ID: {id}. The full body is saved when binding.", { id: id ?? "" })}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : detail ? (
          <Tabs defaultValue="request">
            <TabsList>
              <TabsTrigger value="request">{t("Request")}</TabsTrigger>
              <TabsTrigger value="response">{t("Response")}</TabsTrigger>
            </TabsList>
            <TabsContent value="request">
              <HttpCodeBlock raw={detail.req} />
            </TabsContent>
            <TabsContent value="response">
              <HttpCodeBlock raw={detail.resp} />
            </TabsContent>
          </Tabs>
        ) : (
          <Skeleton className="h-56 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
