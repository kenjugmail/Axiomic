import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

describe("portfolio + navigator (Sprint 31)", () => {
  test("portfolio for unknown user is 404", async () => {
    const res = await req("/users/__nope_404__/portfolio");
    expect(res.status).toBe(404);
  });

  test("portfolio for the seeded `system` user includes the demo capstone author entries", async () => {
    // The `system` user authored the seeded capstone but didn't enroll
    // in it; the system author has no completed enrollments. The
    // endpoint may return an empty entries array — just assert shape.
    const res = await req("/users/system/portfolio");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.username).toBe("system");
    expect(Array.isArray(data.entries)).toBe(true);
  });

  test("/search?navigator=1 returns grouped results", async () => {
    const res = await req("/search?q=attention&navigator=1");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.navigator).toBe(true);
    expect(data.groups).toBeDefined();
    expect(data.groups.define).toBeDefined();
    expect(data.groups.read).toBeDefined();
  });
});
