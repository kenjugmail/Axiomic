// Sprint 73 — Exam framework integration tests.

import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { exams, getDb } from "@axiomic/db";

describe("/exams (Sprint 73)", () => {
  let satExists = false;
  beforeAll(() => {
    const row = getDb()
      .select({ id: exams.id })
      .from(exams)
      .where(eq(exams.slug, "sat"))
      .get();
    satExists = Boolean(row);
  });

  test("GET / returns the seeded exams list", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ slug: string }> };
    if (satExists) {
      expect(body.items.find((e) => e.slug === "sat")).toBeDefined();
    } else {
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  test("GET /:slug returns sections + scoring config", async () => {
    if (!satExists) return;
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/sat"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      exam: {
        slug: string;
        sections: Array<{ slug: string; questionCount: number }>;
        scoring: { sections?: Record<string, unknown> };
      };
    };
    expect(body.exam.slug).toBe("sat");
    expect(body.exam.sections.length).toBeGreaterThan(0);
    expect(body.exam.scoring.sections).toBeDefined();
  });

  test("GET unknown slug returns 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/nope-zzz"),
    );
    expect(res.status).toBe(404);
  });

  test("POST start attempt without auth returns 401", async () => {
    if (!satExists) return;
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/sat/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full_mock" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("PUT answer without auth returns 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/attempts/some-id/answer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: "x".repeat(10), selectedIndex: 0 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("GET history without auth returns 401", async () => {
    if (!satExists) return;
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/sat/history"),
    );
    expect(res.status).toBe(401);
  });
});
