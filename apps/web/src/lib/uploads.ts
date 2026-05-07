// Thin wrapper around POST /api/v1/uploads. Returns the metadata the
// server emits — the URL is what most callers want to drop straight
// into markdown.

export interface UploadResult {
  id: string;
  url: string;
  kind: "image" | "video" | "file";
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/v1/uploads", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as any).error ?? "Upload failed");
  }
  return (await res.json()) as UploadResult;
}

export interface AttachmentRow {
  id: string;
  url: string;
  kind: "image" | "video" | "file";
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
}

export async function listAttachments(): Promise<AttachmentRow[]> {
  const res = await fetch("/api/v1/uploads", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as any).error ?? "Failed to load");
  }
  const data = (await res.json()) as { attachments: AttachmentRow[] };
  return data.attachments;
}

export async function deleteAttachment(id: string): Promise<void> {
  const res = await fetch(`/api/v1/uploads/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as any).error ?? "Delete failed");
  }
}
