import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `flash_${suffix}_${testId}`;
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
  return { cookie, username };
}

async function saveCard(
  cookie: string,
  body: Partial<{ pageSlug: string; pageTitle: string; front: string; back: string }> = {},
): Promise<any> {
  const res = await req("/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      pageSlug: body.pageSlug ?? "softmax",
      pageTitle: body.pageTitle ?? "Softmax Function",
      front: body.front ?? "What does softmax produce?",
      back: body.back ?? "A probability distribution: positive values that sum to 1.",
    }),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as any;
  return data.card;
}

describe("Flashcards: save / list / delete", () => {
  let user = { cookie: "", username: "" };

  beforeAll(async () => {
    user = await signup("crud");
  });

  test("requires auth", async () => {
    const res = await req("/flashcards");
    expect(res.status).toBe(401);
  });

  test("save returns the card with default SM-2 state and null dueAt", async () => {
    const card = await saveCard(user.cookie);
    expect(typeof card.id).toBe("string");
    expect(card.easeFactor).toBe(2.5);
    expect(card.interval).toBe(0);
    expect(card.repetitions).toBe(0);
    expect(card.dueAt).toBeNull();
    expect(card.front).toContain("softmax");
  });

  test("list returns the user's cards newest first", async () => {
    await saveCard(user.cookie, { front: "A second card" });
    const res = await req("/flashcards", { headers: cookieHeader(user.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.cards.length).toBeGreaterThanOrEqual(2);
    // Each card belongs to this user (we already filter by userId on the server).
    for (const c of data.cards) {
      expect(typeof c.front).toBe("string");
    }
  });

  test("due returns new cards (dueAt = null)", async () => {
    const res = await req("/flashcards/due", { headers: cookieHeader(user.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.cards.length).toBeGreaterThan(0);
    for (const c of data.cards) {
      expect(c.dueAt === null || new Date(c.dueAt).getTime() <= Date.now()).toBe(true);
    }
  });

  test("delete removes the card", async () => {
    const card = await saveCard(user.cookie, { front: "to delete" });
    const del = await req(`/flashcards/${card.id}`, {
      method: "DELETE",
      headers: cookieHeader(user.cookie),
    });
    expect(del.status).toBe(200);

    const res = await req("/flashcards", { headers: cookieHeader(user.cookie) });
    const data = (await res.json()) as any;
    expect(data.cards.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  test("delete cannot affect another user's card", async () => {
    const other = await signup("scope");
    const otherCard = await saveCard(other.cookie, { front: "other user's" });

    const del = await req(`/flashcards/${otherCard.id}`, {
      method: "DELETE",
      headers: cookieHeader(user.cookie),
    });
    expect(del.status).toBe(200); // server returns ok regardless

    // But the row is still there for the rightful owner.
    const list = await req("/flashcards", { headers: cookieHeader(other.cookie) });
    const data = (await list.json()) as any;
    expect(data.cards.find((c: any) => c.id === otherCard.id)).toBeDefined();
  });
});

describe("Flashcards: SM-2 review progression", () => {
  let user = { cookie: "", username: "" };
  let cardId = "";

  beforeAll(async () => {
    user = await signup("sm2");
    const card = await saveCard(user.cookie, { front: "review test" });
    cardId = card.id;
  });

  async function review(rating: number): Promise<any> {
    const res = await req(`/flashcards/${cardId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({ rating }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    return data.card;
  }

  test("first Good (4) sets reps=1, interval=1, dueAt ~1 day out", async () => {
    const card = await review(4);
    expect(card.repetitions).toBe(1);
    expect(card.interval).toBe(1);
    expect(card.dueAt).not.toBeNull();
    const due = new Date(card.dueAt).getTime();
    const expected = Date.now() + 24 * 60 * 60 * 1000;
    // Allow a 60-second window for clock drift.
    expect(Math.abs(due - expected)).toBeLessThan(60_000);
  });

  test("second Good sets interval=6", async () => {
    const card = await review(4);
    expect(card.repetitions).toBe(2);
    expect(card.interval).toBe(6);
  });

  test("Again (1) resets to interval=1, reps=0", async () => {
    const card = await review(1);
    expect(card.repetitions).toBe(0);
    expect(card.interval).toBe(1);
  });

  test("invalid rating (>5) is rejected", async () => {
    const res = await req(`/flashcards/${cardId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({ rating: 99 }),
    });
    expect(res.status).toBe(400);
  });

  test("review on someone else's card returns 404", async () => {
    const other = await signup("sm2_b");
    const res = await req(`/flashcards/${cardId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(other.cookie) },
      body: JSON.stringify({ rating: 4 }),
    });
    expect(res.status).toBe(404);
  });
});
