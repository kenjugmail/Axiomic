// Sprint 42 — kernel files endpoint tests.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { attachments, getDb } from "@axiomic/db";
import { randomUUID } from "crypto";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `kf_${suffix}_${testId}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  const data = (await res.json()) as any;
  return { cookie, userId: data?.user?.id as string };
}

function makeAttachment(ownerId: string, suffix: string): string {
  const db = getDb();
  const id = randomUUID();
  db.insert(attachments).values({
    id,
    ownerId,
    kind: "image",
    originalName: `data-${suffix}.csv`,
    mimeType: "text/csv",
    sizeBytes: 1024,
    storagePath: `2026/05/${id}.csv`,
  }).run();
  return id;
}

describe("Sprint 42 — kernel files", () => {
  test("anon GET is 401", async () => {
    const res = await req(
      "/kernel-files?kernelKey=" + encodeURIComponent("paper:test"),
    );
    expect(res.status).toBe(401);
  });

  test("attach + list + delete cycle", async () => {
    const me = await signup("ok");
    const aId = makeAttachment(me.userId, "ok");
    const kernelKey = `paper:kf-ok-${testId}`;

    // Attach.
    const attach = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        kernelKey,
        attachmentId: aId,
        name: "data.csv",
      }),
    });
    expect(attach.status).toBe(201);
    const attachData = (await attach.json()) as any;
    expect(typeof attachData.id).toBe("string");
    expect(attachData.replaced).toBe(false);

    // List.
    const list = await req(
      `/kernel-files?kernelKey=${encodeURIComponent(kernelKey)}`,
      { headers: cookieHeader(me.cookie) },
    );
    expect(list.status).toBe(200);
    const data = (await list.json()) as any;
    expect(data.files.length).toBe(1);
    expect(data.files[0].name).toBe("data.csv");
    expect(data.files[0].url).toBe(`/api/v1/uploads/${aId}`);

    // Replace under same name.
    const aId2 = makeAttachment(me.userId, "ok2");
    const replace = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        kernelKey,
        attachmentId: aId2,
        name: "data.csv",
      }),
    });
    expect(replace.status).toBe(200);
    const replaceData = (await replace.json()) as any;
    expect(replaceData.replaced).toBe(true);
    expect(replaceData.id).toBe(attachData.id);

    // Delete.
    const del = await req(`/kernel-files/${attachData.id}`, {
      method: "DELETE",
      headers: cookieHeader(me.cookie),
    });
    expect(del.status).toBe(200);

    const list2 = await req(
      `/kernel-files?kernelKey=${encodeURIComponent(kernelKey)}`,
      { headers: cookieHeader(me.cookie) },
    );
    expect((await list2.json() as any).files.length).toBe(0);
  });

  test("cannot attach someone else's attachment", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const aId = makeAttachment(a.userId, "other");
    const res = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({
        kernelKey: `paper:kf-other-${testId}`,
        attachmentId: aId,
        name: "stolen.csv",
      }),
    });
    expect(res.status).toBe(403);
  });

  test("name validation rejects path traversal", async () => {
    const me = await signup("traverse");
    const aId = makeAttachment(me.userId, "tr");
    const res = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        kernelKey: `paper:kf-traverse-${testId}`,
        attachmentId: aId,
        name: "../escape.csv",
      }),
    });
    // Zod regex rejects with 400 on the request schema.
    expect(res.status).toBe(400);
  });
});
