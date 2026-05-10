// Sprint 72 — BlueSky client unit tests with mocked fetch.

import { describe, test, expect } from "bun:test";
import { fetchResearcherPosts } from "./blueskyClient";
import { _resetHostBucketsForTests } from "./httpClient";

const FIXTURE = {
  feed: [
    {
      post: {
        uri: "at://did:plc:abc/app.bsky.feed.post/3kabcrkey",
        cid: "bafy",
        author: {
          did: "did:plc:abc",
          handle: "alice.bsky.social",
          displayName: "Alice",
        },
        record: {
          text: "Cool paper just out: arxiv:2501.12345 and also 10.1038/test",
          createdAt: "2025-04-01T12:00:00.000Z",
        },
        indexedAt: "2025-04-01T12:00:01.000Z",
      },
    },
    {
      post: {
        uri: "at://did:plc:abc/app.bsky.feed.post/3kunrkey",
        author: { handle: "alice.bsky.social", did: "did:plc:abc" },
        record: { text: "Just chatting about my dog.", createdAt: "2025-04-02T00:00:00Z" },
      },
    },
    {
      // Edge case: empty record/text — should be skipped without
      // throwing.
      post: { uri: "at://did:plc:abc/app.bsky.feed.post/3kemptyrkey" },
    },
  ],
};

function jsonMock(
  body: object,
  status = 200,
): (input: string | URL | Request) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("blueskyClient (Sprint 72)", () => {
  test("returns only posts with paper references", async () => {
    _resetHostBucketsForTests();
    const posts = await fetchResearcherPosts("alice.bsky.social", {
      fetchImpl: jsonMock(FIXTURE),
    });
    expect(posts.length).toBe(1);
    expect(posts[0].postId).toBe("3kabcrkey");
    expect(posts[0].authorHandle).toBe("alice.bsky.social");
    expect(posts[0].text).toContain("arxiv");
    expect(posts[0].url).toBe(
      "https://bsky.app/profile/alice.bsky.social/post/3kabcrkey",
    );
    expect(posts[0].references.length).toBe(2);
    const sources = posts[0].references.map((r) => r.source);
    expect(sources).toContain("arxiv");
    expect(sources).toContain("doi");
  });

  test("non-retryable 4xx response throws without long backoff", async () => {
    _resetHostBucketsForTests();
    // 400 is not in the retry set (429 + 5xx); only one attempt.
    const fetchImpl = async (): Promise<Response> =>
      new Response("nope", { status: 400 });
    await expect(
      fetchResearcherPosts("x", { fetchImpl }),
    ).rejects.toThrow();
  });

  test("empty feed returns empty list", async () => {
    _resetHostBucketsForTests();
    const posts = await fetchResearcherPosts("nobody", {
      fetchImpl: jsonMock({ feed: [] }),
    });
    expect(posts).toEqual([]);
  });
});
