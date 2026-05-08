// Sprint 52 — When a capstone enrollment completes, check whether the
// learner has now satisfied any track's completion threshold and mint
// a track-completion row + signed manifest if so.
//
// Idempotent: skips tracks the learner has already completed; only
// fires when *all required* sub-capstones have a completed enrollment
// (optional ones don't gate; v1 scope).

import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneEnrollments,
  capstoneTrackCapstones,
  capstoneTrackCompletions,
  capstoneTracks,
  capstones,
  getDb,
  users,
} from "@axiomic/db";
import { canonicalJson, sign } from "./signing";

export interface TrackCompletionManifest {
  issuer: string;
  kind: "capstone_track_completion";
  trackSlug: string;
  trackTitle: string;
  learnerUsername: string;
  capstones: Array<{
    slug: string;
    optional: boolean;
    artifactPageSlug: string | null;
    completedAt: string | null;
  }>;
  completedAt: string;
}

const ISSUER = "axiomic.app";

export interface MintedTrackCompletion {
  trackId: string;
  trackSlug: string;
  artifactPageSlug: string;
}

export function maybeMintTrackCompletions(userId: string): MintedTrackCompletion[] {
  const db = getDb();
  const minted: MintedTrackCompletion[] = [];

  // Pull every published track and its capstone list.
  const trackRows = db
    .select()
    .from(capstoneTracks)
    .where(eq(capstoneTracks.status, "published"))
    .all();
  if (trackRows.length === 0) return minted;

  const trackIds = trackRows.map((t) => t.id);
  const links = db
    .select()
    .from(capstoneTrackCapstones)
    .where(inArray(capstoneTrackCapstones.trackId, trackIds))
    .all();
  if (links.length === 0) return minted;

  const learner = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!learner) return minted;

  // Already-completed tracks for this user.
  const existing = new Set(
    db
      .select({ trackId: capstoneTrackCompletions.trackId })
      .from(capstoneTrackCompletions)
      .where(eq(capstoneTrackCompletions.userId, userId))
      .all()
      .map((r) => r.trackId),
  );

  // Pre-load the learner's completed enrollments by capstoneId.
  const allCapstoneIds = Array.from(new Set(links.map((l) => l.capstoneId)));
  const enrollmentRows = db
    .select({
      capstoneId: capstoneEnrollments.capstoneId,
      completedAt: capstoneEnrollments.completedAt,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
    })
    .from(capstoneEnrollments)
    .where(
      and(
        eq(capstoneEnrollments.userId, userId),
        inArray(capstoneEnrollments.capstoneId, allCapstoneIds),
      ),
    )
    .all();
  const enrollByCapstone = new Map(
    enrollmentRows.map((e) => [e.capstoneId, e]),
  );

  // Pre-load capstone slugs so we can build the manifest.
  const capRows = db
    .select({ id: capstones.id, slug: capstones.slug })
    .from(capstones)
    .where(inArray(capstones.id, allCapstoneIds))
    .all();
  const slugByCapstone = new Map(capRows.map((c) => [c.id, c.slug]));

  for (const track of trackRows) {
    if (existing.has(track.id)) continue;
    const trackLinks = links
      .filter((l) => l.trackId === track.id)
      .sort((a, b) => a.order - b.order);
    if (trackLinks.length === 0) continue;

    // Required gate: every required capstone has a completed enrollment.
    const requiredLinks = trackLinks.filter((l) => l.optional === 0);
    const allRequiredDone = requiredLinks.every((l) => {
      const enr = enrollByCapstone.get(l.capstoneId);
      return enr && enr.completedAt;
    });
    if (!allRequiredDone) continue;

    const artifactSlug = `${learner.username}-${track.slug}`;
    const completedAt = new Date().toISOString();

    const manifest: TrackCompletionManifest = {
      issuer: ISSUER,
      kind: "capstone_track_completion",
      trackSlug: track.slug,
      trackTitle: track.title,
      learnerUsername: learner.username,
      capstones: trackLinks.map((l) => {
        const enr = enrollByCapstone.get(l.capstoneId);
        return {
          slug: slugByCapstone.get(l.capstoneId) ?? "",
          optional: l.optional === 1,
          artifactPageSlug: enr?.artifactPageSlug ?? null,
          completedAt: enr?.completedAt ?? null,
        };
      }),
      completedAt,
    };

    const canonical = canonicalJson(manifest);
    const signature = sign(canonical);
    const signedTranscriptJson = JSON.stringify({ manifest, signature });

    db.insert(capstoneTrackCompletions)
      .values({
        id: randomUUID(),
        trackId: track.id,
        userId,
        completedAt,
        artifactPageSlug: artifactSlug,
        signedTranscriptJson,
      })
      .run();

    minted.push({
      trackId: track.id,
      trackSlug: track.slug,
      artifactPageSlug: artifactSlug,
    });
  }

  return minted;
}
