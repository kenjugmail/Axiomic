// Sprint 63f — model picker plumbing: GET /ai/models + per-request
// model override on /ai/chat.

import { describe, test, expect, afterEach } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

describe("Sprint 63f — /ai/models", () => {
  afterEach(() => {
    delete process.env.AI_AVAILABLE_MODELS;
  });

  test("returns the mock provider's sentinel models by default", async () => {
    const res = await req("/ai/models");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      available: { id: string }[];
      default: string;
      provider: string;
    };
    expect(data.provider).toBe("mock");
    const ids = data.available.map((m) => m.id);
    expect(ids).toContain("mock-fast");
    expect(ids).toContain("mock-thoughtful");
    expect(data.default).toBe("mock-fast");
  });

  test("AI_AVAILABLE_MODELS env override replaces the provider's list", async () => {
    process.env.AI_AVAILABLE_MODELS = "ops-curated-a, ops-curated-b";
    // The cache key folds in the override value, so changing it busts
    // the cache automatically.
    const res = await req("/ai/models");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { available: { id: string }[] };
    const ids = data.available.map((m) => m.id);
    expect(ids).toEqual(["ops-curated-a", "ops-curated-b"]);
  });
});
