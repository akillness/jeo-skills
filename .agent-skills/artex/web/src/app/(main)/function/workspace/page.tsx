"use client";

import * as React from "react";
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  HardDriveIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { WorkspaceEntry, WorkspaceFile } from "@/lib/types";
import { intlLocale, t } from "@/i18n";

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type EditState = {
  file: WorkspaceFile;
  content: string;
  dirty: boolean;
  saving: boolean;
};

export default function WorkspacePage() {
  const [path, setPath] = React.useState("");
  const [entries, setEntries] = React.useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState<EditState | null>(null);
  const [mkdirOpen, setMkdirOpen] = React.useState(false);
  const [mkdirName, setMkdirName] = React.useState("");
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(
    (p: string) => {
      setLoading(true);
      api
        .workspaceList(p)
        .then((r) => {
          setEntries(r.entries);
          setPath(r.path);
        })
        .catch((e) => toast.error(t("Failed to read directory: {error}", { error: (e as Error).message })))
        .finally(() => setLoading(false));
    },
    [],
  );

  React.useEffect(() => {
    load("");
  }, [load]);

  const crumbs = React.useMemo(() => {
    const parts = path ? path.split("/") : [];
    const acc: { name: string; path: string }[] = [{ name: t("Workspace"), path: "" }];
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      acc.push({ name: part, path: cur });
    }
    return acc;
  }, [path]);

  const openFile = (e: WorkspaceEntry) => {
    api
      .workspaceRead(e.path)
      .then((f) => setEdit({ file: f, content: f.content ?? "", dirty: false, saving: false }))
      .catch((err) => toast.error(t("Failed to open file: {error}", { error: (err as Error).message })));
  };

  const saveFile = () => {
    if (!edit) return;
    setEdit({ ...edit, saving: true });
    api
      .workspaceWrite(edit.file.path, edit.content)
      .then(() => {
        toast.success(t("Saved"));
        setEdit((cur) => (cur ? { ...cur, dirty: false, saving: false } : cur));
        load(path);
      })
      .catch((err) => {
        toast.error(t("Save failed: {error}", { error: (err as Error).message }));
        setEdit((cur) => (cur ? { ...cur, saving: false } : cur));
      });
  };

  const del = (e: WorkspaceEntry) => {
    const question = e.dir
      ? t('Confirm deleting directory "{name}"? (including everything inside)', { name: e.name })
      : t('Confirm deleting file "{name}"?', { name: e.name });
    if (!window.confirm(question)) return;
    api
      .workspaceDelete(e.path)
      .then(() => {
        toast.success(t("Deleted"));
        load(path);
      })
      .catch((err) => toast.error(t("Delete failed: {error}", { error: (err as Error).message })));
  };

  const doUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    api
      .workspaceUpload(path, Array.from(files))
      .then((r) => {
        toast.success(t("Uploaded {count} files", { count: r.uploaded }));
        load(path);
      })
      .catch((err) => toast.error(t("Upload failed: {error}", { error: (err as Error).message })))
      .finally(() => {
        if (uploadRef.current) uploadRef.current.value = "";
      });
  };

  const doMkdir = () => {
    const name = mkdirName.trim();
    if (!name) return;
    const target = path ? `${path}/${name}` : name;
    api
      .workspaceMkdir(target)
      .then(() => {
        toast.success(t("Directory created"));
        setMkdirOpen(false);
        setMkdirName("");
        load(path);
      })
      .catch((err) => toast.error(t("Create failed: {error}", { error: (err as Error).message })));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header: breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 text-sm">
          <HardDriveIcon className="text-muted-foreground mr-1 size-4 shrink-0" />
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <button
                type="button"
                onClick={() => load(c.path)}
                className={cn(
                  "max-w-[160px] truncate rounded px-1.5 py-0.5 hover:bg-accent",
                  i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {c.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMkdirOpen(true)}>
            <FolderPlusIcon /> {t("New folder")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()}>
            <UploadIcon /> {t("Upload")}
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => load(path)} title={t("Refresh")}>
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => doUpload(e.target.files)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Name")}</TableHead>
                <TableHead className="w-28 text-right">{t("Size")}</TableHead>
                <TableHead className="w-40">{t("Modified")}</TableHead>
                <TableHead className="w-24 text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                    {loading ? t("Loading…") : t("Empty directory")}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.path}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => (e.dir ? load(e.path) : openFile(e))}
                      className="flex items-center gap-2 text-left hover:underline"
                    >
                      {e.dir ? (
                        <FolderIcon className="size-4 shrink-0 text-blue-500" />
                      ) : (
                        <FileIcon className="text-muted-foreground size-4 shrink-0" />
                      )}
                      <span className="truncate font-mono text-sm">{e.name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right font-mono text-xs">
                    {e.dir ? "—" : fmtSize(e.size)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmtTime(e.mtime)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!e.dir && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title={t("Download")}
                          onClick={() =>
                            api
                              .workspaceDownload(e.path)
                              .catch((err) =>
                                toast.error(t("Download failed: {error}", { error: (err as Error).message })),
                              )
                          }
                        >
                          <DownloadIcon className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive size-7"
                        title={t("Delete")}
                        onClick={() => del(e)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* File view / edit */}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          {edit && (
            <>
              <SheetHeader className="border-b p-4">
                <SheetTitle className="flex items-center gap-2 truncate font-mono text-sm">
                  <FileIcon className="size-4 shrink-0" />
                  <span className="truncate" title={edit.file.path}>
                    {edit.file.path}
                  </span>
                </SheetTitle>
                <span className="text-muted-foreground text-xs">{fmtSize(edit.file.size)}</span>
              </SheetHeader>

              {edit.file.binary || edit.file.too_large ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    {edit.file.too_large
                      ? t("File too large for online preview/editing.")
                      : t("Binary file; online preview/editing is not supported.")}
                  </p>
                  <Button variant="outline" onClick={() => api.workspaceDownload(edit.file.path)}>
                    <DownloadIcon /> {t("Download file")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 p-3">
                    <Textarea
                      value={edit.content}
                      onChange={(ev) => setEdit({ ...edit, content: ev.target.value, dirty: true })}
                      spellCheck={false}
                      className="h-full min-h-[50vh] resize-none font-mono text-xs leading-relaxed"
                    />
                  </div>
                  <SheetFooter className="flex-row items-center justify-between border-t p-3">
                    <span className="text-muted-foreground text-xs">
                      {edit.dirty ? t("Unsaved changes") : t("In sync")}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => api.workspaceDownload(edit.file.path)}
                      >
                        <DownloadIcon /> {t("Download")}
                      </Button>
                      <Button onClick={saveFile} disabled={!edit.dirty || edit.saving}>
                        <SaveIcon /> {edit.saving ? t("Saving…") : t("Save")}
                      </Button>
                    </div>
                  </SheetFooter>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* New folder */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("New folder")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doMkdir()}
            placeholder={t("Folder name")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMkdirOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={doMkdir} disabled={!mkdirName.trim()}>
              {t("Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
