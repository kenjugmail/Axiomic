import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Copy, Image as ImageIcon, Film, FileText } from "lucide-react";
import {
  listAttachments,
  deleteAttachment,
  type AttachmentRow,
} from "../lib/uploads";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

const QUOTA_BYTES = 200 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function markdownFor(a: AttachmentRow): string {
  if (a.kind === "image") return `![${a.originalName}](${a.url})`;
  if (a.kind === "video") return `:::video[id=${a.id}]`;
  return `[${a.originalName}](${a.url})`;
}

export function AttachmentsPage() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttachmentRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    listAttachments()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast.error(e?.message ?? "Failed to load attachments");
      });
  }, [user, authLoading, navigate]);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this attachment? Markdown links pointing to it will break.")) return;
    setBusyId(id);
    try {
      await deleteAttachment(id);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== id));
      toast.success("Attachment deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const onCopy = async (a: AttachmentRow) => {
    try {
      await navigator.clipboard.writeText(markdownFor(a));
      setCopiedId(a.id);
      setTimeout(() => setCopiedId((id) => (id === a.id ? null : id)), 1500);
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  const used = (rows ?? []).reduce((acc, r) => acc + r.sizeBytes, 0);
  const pct = Math.min(100, Math.round((used / QUOTA_BYTES) * 100));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link
          to="/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Settings
        </Link>
        <h1 className="text-2xl font-bold mt-1">Attachments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Files you've uploaded across articles, lessons, posts, and comments.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">Storage used</span>
          <span className="font-mono">
            {formatBytes(used)} / {formatBytes(QUOTA_BYTES)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${pct >= 90 ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          You haven't uploaded any attachments yet.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {rows.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors"
            >
              <div className="w-12 h-12 flex-shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                {a.kind === "image" ? (
                  <img
                    src={a.url}
                    alt={a.originalName}
                    className="w-full h-full object-cover"
                  />
                ) : a.kind === "video" ? (
                  <Film className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
                ) : (
                  <FileText className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={a.originalName}>
                  {a.originalName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(a.sizeBytes)} ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()} ·{" "}
                  <span className="font-mono">{a.mimeType}</span>
                </div>
              </div>
              <button
                onClick={() => onCopy(a)}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 inline-flex items-center gap-1"
                title="Copy markdown"
              >
                <Copy className="w-3.5 h-3.5" strokeWidth={2} />
                {copiedId === a.id ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => onDelete(a.id)}
                disabled={busyId === a.id}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 disabled:opacity-50"
                title="Delete attachment"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        <ImageIcon className="w-3 h-3 inline mr-1" strokeWidth={2} />
        Images, videos, and PDFs only. 10 MB per file, 200 MB total.
      </p>
    </div>
  );
}
