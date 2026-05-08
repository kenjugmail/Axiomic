// Sprint 37 — Capstone transcript endpoints + signing integration.
//
// Cover: manifest endpoint returns canonical-keyed JSON for a
// completed enrollment, transcript endpoint signs that exact byte
// string, /keys/verify accepts the bundle, and tampering invalidates
// it. Also: incomplete enrollments / unknown slugs are 404.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  capstoneEnrollments,
  capstoneMilestones,
  capstoneSubmissions,
  capstones,
  getDb,
  users,
} from "@axiomic/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { canonicalJson, publicKeyHex } from "../lib/signing";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function ensureUser(suffix: string) {
  const db = getDb();
  const username = `tx_${suffix}_${testId}`.slice(0, 30);
  const id = randomUUID();
  db.insert(users).values({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$xx$yy",
    displayName: `Tx ${suffix}`,
    bio: "test",
  }).run();
  return { id, username };
}

function ensurePublishedCapstone(authorId: string, slugSuffix: string) {
  const db = getDb();
  const slug = `tx-cap-${slugSuffix}-${testId}`;
  const id = randomUUID();
  db.insert(capstones).values({
    id,
    slug,
    title: "Build a Transformer",
    summary: "A short summary.",
    contentIntro: "intro",
    contentUndergrad: "undergrad",
    contentGrad: "grad",
    canonicalTier: "undergrad",
    estimatedWeeks: 6,
    prerequisiteWikiSlugs: "[]",
    prerequisiteNodeIds: "[]",
    tags: "[]",
    coverEmoji: "🎓",
    accentColor: "violet",
    status: "published",
    currentVersion: 2,
    authorId,
  }).run();
  // Two milestones.
  const m1 = randomUUID();
  const m2 = randomUUID();
  db.insert(capstoneMilestones).values({
    id: m1,
    capstoneId: id,
    order: 1,
    title: "Tokenize",
    description: "",
    rubricJson: "{}",
    requiredArtifactKinds: "[]",
    estimatedDays: 3,
  }).run();
  db.insert(capstoneMilestones).values({
    id: m2,
    capstoneId: id,
    order: 2,
    title: "Train",
    description: "",
    rubricJson: "{}",
    requiredArtifactKinds: "[]",
    estimatedDays: 7,
  }).run();
  return { capstoneId: id, slug, milestones: [m1, m2] };
}

function completeEnrollment(opts: {
  capstoneId: string;
  userId: string;
  milestones: string[];
  artifactSlug: string;
}) {
  const db = getDb();
  const enrollmentId = randomUUID();
  const now = new Date().toISOString();
  db.insert(capstoneEnrollments).values({
    id: enrollmentId,
    capstoneId: opts.capstoneId,
    userId: opts.userId,
    startedAt: now,
    completedAt: now,
    artifactPageSlug: opts.artifactSlug,
  }).run();
  for (const milestoneId of opts.milestones) {
    db.insert(capstoneSubmissions).values({
      id: randomUUID(),
      enrollmentId,
      milestoneId,
      artifactsJson: "[]",
      writeup: "",
      status: "passed",
      aiGradeJson: JSON.stringify({ totalScore: 0.92 }),
      submittedAt: now,
      gradedAt: now,
    }).run();
  }
  return enrollmentId;
}

describe("Sprint 37 — capstone transcripts", () => {
  test("/keys/signing returns ed25519 public key", async () => {
    const res = await req("/keys/signing");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.algorithm).toBe("ed25519");
    expect(typeof data.publicKey).toBe("string");
    expect(data.publicKey.length).toBe(64); // 32 bytes hex
    expect(data.publicKey).toBe(publicKeyHex());
  });

  test("manifest endpoint returns canonical JSON for a completed enrollment", async () => {
    const author = ensureUser("m-auth");
    const learner = ensureUser("m-learner");
    const { capstoneId, slug, milestones } = ensurePublishedCapstone(
      author.id,
      "m",
    );
    const artifactSlug = `${learner.username}-${slug}`;
    completeEnrollment({
      capstoneId,
      userId: learner.id,
      milestones,
      artifactSlug,
    });

    const res = await req(`/capstones/c/${artifactSlug}/manifest`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // canonicalJson sorts keys — first key should be 'artifactPageSlug'
    // (a-prefixed) before 'capstone' / 'completedAt'.
    expect(text.startsWith('{"artifactPageSlug":')).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.capstone.version).toBe(2);
    expect(parsed.learner.username).toBe(learner.username);
    expect(parsed.milestones.length).toBe(2);
    expect(parsed.milestones[0].status).toBe("passed");
    expect(parsed.milestones[0].score).toBe(0.92);
  });

  test("transcript endpoint signs the canonical manifest", async () => {
    const author = ensureUser("t-auth");
    const learner = ensureUser("t-learner");
    const { capstoneId, slug, milestones } = ensurePublishedCapstone(
      author.id,
      "t",
    );
    const artifactSlug = `${learner.username}-${slug}`;
    completeEnrollment({
      capstoneId,
      userId: learner.id,
      milestones,
      artifactSlug,
    });

    const res = await req(`/capstones/c/${artifactSlug}/transcript`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.algorithm).toBe("ed25519");
    expect(data.publicKey).toBe(publicKeyHex());
    expect(typeof data.signature).toBe("string");
    expect(data.signature.length).toBe(128);
    // canonicalPayload === canonicalJson(manifest).
    expect(data.canonicalPayload).toBe(canonicalJson(data.manifest));
  });

  test("/keys/verify accepts an issued transcript bundle", async () => {
    const author = ensureUser("v-auth");
    const learner = ensureUser("v-learner");
    const { capstoneId, slug, milestones } = ensurePublishedCapstone(
      author.id,
      "v",
    );
    const artifactSlug = `${learner.username}-${slug}`;
    completeEnrollment({
      capstoneId,
      userId: learner.id,
      milestones,
      artifactSlug,
    });

    const issued = await (
      await req(`/capstones/c/${artifactSlug}/transcript`)
    ).json() as any;

    const verifyRes = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifest: issued.manifest,
        signature: issued.signature,
        publicKey: issued.publicKey,
      }),
    });
    expect(verifyRes.status).toBe(200);
    const result = (await verifyRes.json()) as any;
    expect(result.valid).toBe(true);
  });

  test("/keys/verify rejects a tampered manifest", async () => {
    const author = ensureUser("tamper-auth");
    const learner = ensureUser("tamper-learner");
    const { capstoneId, slug, milestones } = ensurePublishedCapstone(
      author.id,
      "tamper",
    );
    const artifactSlug = `${learner.username}-${slug}`;
    completeEnrollment({
      capstoneId,
      userId: learner.id,
      milestones,
      artifactSlug,
    });

    const issued = await (
      await req(`/capstones/c/${artifactSlug}/transcript`)
    ).json() as any;

    // Pretend to be a different learner.
    const tamperedManifest = {
      ...issued.manifest,
      learner: { ...issued.manifest.learner, username: "imposter" },
    };
    const verifyRes = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifest: tamperedManifest,
        signature: issued.signature,
        publicKey: issued.publicKey,
      }),
    });
    const result = (await verifyRes.json()) as any;
    expect(result.valid).toBe(false);
  });

  test("manifest endpoint 404s on unknown / incomplete slug", async () => {
    const res = await req("/capstones/c/__nope__/manifest");
    expect(res.status).toBe(404);

    const learner = ensureUser("inc-learner");
    const author = ensureUser("inc-auth");
    const { capstoneId, slug, milestones } = ensurePublishedCapstone(
      author.id,
      "inc",
    );
    // Insert an incomplete enrollment (no completedAt) and assert 404.
    const db = getDb();
    db.insert(capstoneEnrollments).values({
      id: randomUUID(),
      capstoneId,
      userId: learner.id,
      artifactPageSlug: `${learner.username}-${slug}`,
    }).run();
    void milestones;
    const res2 = await req(
      `/capstones/c/${learner.username}-${slug}/manifest`,
    );
    expect(res2.status).toBe(404);
  });
});

void eq;
