// Sprint 42 — Kernel files panel.
//
// Shows the caller's mounted files for a kernel scope and lets them
// upload new ones / unmount existing ones. Upload uses the existing
// /uploads endpoint, then registers the attachment as a kernel file.
// The panel pre-loads each file's bytes into both kernels (Pyodide
// at /files/<name>, JS at axiomicFiles['<name>']) so cells can read
// them without any network call.

import { useEffect, useState } from "react";
import { Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { uploadFile } from "../../lib/uploads";
import { getKernel } from "../../lib/pyodideKernel";
import { mountJsFile } from "../../lib/jsKernel";

interface KernelFile {
  id: string;
  kernelKey: string;
  attachmentId: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
}

interface Props {
  kernelKey: string;
}

export function KernelFilesPanel({ kernelKey }: Props) {
  const user = useAuthStore((s) => s.user);
  const [files, setFiles] = useState<KernelFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/v1/kernel-files?kernelKey=${encodeURIComponent(kernelKey)}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load");
      const data = (await r.json()) as { files: KernelFile[] };
      setFiles(data.files);
      // Mount each into both kernels for immediate use.
      await Promise.all(
        data.files.map(async (f) => {
          try {
            const buf = await fetch(f.url, { credentials: "include" }).then(
              (rr) => rr.arrayBuffer(),
            );
            const bytes = new Uint8Array(buf);
            await getKernel(kernelKey).mountFile(f.name, bytes);
            mountJsFile(`js:${kernelKey}`, f.name, bytes);
          } catch {
            // ignore individual file failures
          }
        }),
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernelKey, user?.id]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      const res = await fetch("/api/v1/kernel-files", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kernelKey,
          attachmentId: uploaded.id,
          name: file.name.replace(/[^A-Za-z0-9._-]/g, "_"),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error ?? "Failed to attach");
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const onRemove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/v1/kernel-files/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
          <Paperclip className="w-3 h-3" strokeWidth={2} />
          Kernel files
          {files.length > 0 && (
            <span className="text-muted-foreground/70 ml-1">
              ({files.length})
            </span>
          )}
        </h4>
        <label className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/40 cursor-pointer">
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
          ) : (
            <Upload className="w-3 h-3" strokeWidth={2} />
          )}
          Upload
          <input
            type="file"
            className="sr-only"
            disabled={busy}
            onChange={onUpload}
          />
        </label>
      </div>
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 mb-2">
          {error}
        </p>
      )}
      {loading && files.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Loading…</p>
      )}
      {!loading && files.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Drop a CSV, image, or any file here. Python cells read it from{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-[10px]">
            /files/&lt;name&gt;
          </code>
          ; JS cells via{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-[10px]">
            axiomicFiles
          </code>
          .
        </p>
      )}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <code className="px-1.5 py-0.5 rounded bg-muted text-[11px] truncate">
                /files/{f.name}
              </code>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {prettyBytes(f.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                disabled={busy}
                className="shrink-0 text-muted-foreground hover:text-rose-500 disabled:opacity-50"
                aria-label={`Remove ${f.name}`}
              >
                <Trash2 className="w-3 h-3" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
