// Phase 28A — verifiable credential wallet.
//
// Read-only aggregation of every signed / verifiable achievement a
// user has earned, in one place an employer or grad school can
// check. Capstone + track completions already expose signed
// transcripts at their own URLs; hackathon prizes, verified
// reproductions, and completed bounties are signed on the fly via
// the generic signCredential() helper (deterministic canonical
// JSON → re-verifiable offline against the public key).

import { Hono } from "hono";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  bountyClaims,
  capstoneEnrollments,
  capstones,
  capstoneTrackCompletions,
  capstoneTracks,
  examAttempts,
  exams,
  getDb,
  hackathonPrizeAwards,
  hackathonPrizes,
  hackathonTeamMembers,
  hackathonTeams,
  hackathons,
  reproductions,
  researchBounties,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { signCredential } from "../lib/signing";
import type { Env } from "../env";

export const credentialsRouter = new Hono<Env>();

interface WalletItem {
  kind:
    | "capstone"
    | "capstone_track"
    | "hackathon_prize"
    | "exam"
    | "reproduction"
    | "bounty";
  title: string;
  earnedAt: string;
  signed: boolean;
  // Where a human goes to see the achievement.
  detailUrl: string;
  // Where a verifier fetches the signed transcript (capstone/track
  // have dedicated transcript endpoints).
  verifyUrl: string | null;
  // Inlined signed credential for kinds without a transcript URL.
  credential: ReturnType<typeof signCredential> | null;
}

function buildWallet(userId: string, username: string): WalletItem[] {
  const db = getDb();
  const items: WalletItem[] = [];

  // 1. Capstone completions — signed transcript already lives at
  //    /capstones/c/:artifactSlug/transcript.
  const caps = db
    .select({
      completedAt: capstoneEnrollments.completedAt,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
      title: capstones.title,
    })
    .from(capstoneEnrollments)
    .innerJoin(capstones, eq(capstoneEnrollments.capstoneId, capstones.id))
    .where(
      and(
        eq(capstoneEnrollments.userId, userId),
        isNotNull(capstoneEnrollments.completedAt),
        isNotNull(capstoneEnrollments.artifactPageSlug),
      ),
    )
    .all();
  for (const cap of caps) {
    if (!cap.artifactPageSlug || !cap.completedAt) continue;
    items.push({
      kind: "capstone",
      title: cap.title,
      earnedAt: cap.completedAt,
      signed: true,
      detailUrl: `/capstones/c/${cap.artifactPageSlug}`,
      verifyUrl: `/api/v1/capstones/c/${cap.artifactPageSlug}/transcript`,
      credential: null,
    });
  }

  // 2. Capstone-track completions — signed transcript stored on the
  //    row; the public artifact is /tracks/c/:artifactPageSlug.
  const tracks = db
    .select({
      completedAt: capstoneTrackCompletions.completedAt,
      artifactPageSlug: capstoneTrackCompletions.artifactPageSlug,
      title: capstoneTracks.title,
    })
    .from(capstoneTrackCompletions)
    .innerJoin(
      capstoneTracks,
      eq(capstoneTrackCompletions.trackId, capstoneTracks.id),
    )
    .where(eq(capstoneTrackCompletions.userId, userId))
    .all();
  for (const t of tracks) {
    items.push({
      kind: "capstone_track",
      title: `Track: ${t.title}`,
      earnedAt: t.completedAt,
      signed: true,
      detailUrl: `/tracks/c/${t.artifactPageSlug}`,
      verifyUrl: `/api/v1/tracks/c/${t.artifactPageSlug}`,
      credential: null,
    });
  }

  // 3. Hackathon prize awards — sign on the fly.
  const myTeams = db
    .select({ teamId: hackathonTeamMembers.teamId })
    .from(hackathonTeamMembers)
    .where(eq(hackathonTeamMembers.userId, userId))
    .all()
    .map((r) => r.teamId);
  if (myTeams.length > 0) {
    const wins = db
      .select({
        awardId: hackathonPrizeAwards.id,
        awardedAt: hackathonPrizeAwards.awardedAt,
        prizeTitle: hackathonPrizes.title,
        hackathonTitle: hackathons.title,
        hackathonSlug: hackathons.slug,
        prizeId: hackathonPrizes.id,
        teamId: hackathonPrizeAwards.teamId,
      })
      .from(hackathonPrizeAwards)
      .innerJoin(
        hackathonPrizes,
        eq(hackathonPrizeAwards.prizeId, hackathonPrizes.id),
      )
      .innerJoin(
        hackathons,
        eq(hackathonPrizes.hackathonId, hackathons.id),
      )
      .where(inArray(hackathonPrizeAwards.teamId, myTeams))
      .all();
    for (const w of wins) {
      items.push({
        kind: "hackathon_prize",
        title: `${w.hackathonTitle}: ${w.prizeTitle}`,
        earnedAt: w.awardedAt,
        signed: true,
        detailUrl: `/hackathons/${w.hackathonSlug}`,
        verifyUrl: null,
        credential: signCredential("hackathon_prize", {
          username,
          userId,
          hackathonSlug: w.hackathonSlug,
          hackathonTitle: w.hackathonTitle,
          prizeId: w.prizeId,
          prizeTitle: w.prizeTitle,
          awardedAt: w.awardedAt,
        }),
      });
    }
  }

  // 4. Completed exams — a finalized attempt with a scaled score.
  const attempts = db
    .select({
      completedAt: examAttempts.completedAt,
      scoreScaled: examAttempts.scoreScaled,
      scorePercentile: examAttempts.scorePercentile,
      examTitle: exams.title,
      examSlug: exams.slug,
      attemptId: examAttempts.id,
    })
    .from(examAttempts)
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(
      and(
        eq(examAttempts.userId, userId),
        isNotNull(examAttempts.completedAt),
        isNotNull(examAttempts.scoreScaled),
      ),
    )
    .all();
  for (const a of attempts) {
    if (!a.completedAt) continue;
    items.push({
      kind: "exam",
      title: `${a.examTitle} — scaled ${a.scoreScaled}${
        a.scorePercentile != null ? ` (${a.scorePercentile}th pct)` : ""
      }`,
      earnedAt: a.completedAt,
      signed: true,
      detailUrl: `/exams/${a.examSlug}`,
      verifyUrl: null,
      credential: signCredential("exam", {
        username,
        userId,
        examSlug: a.examSlug,
        examTitle: a.examTitle,
        scoreScaled: a.scoreScaled,
        scorePercentile: a.scorePercentile,
        completedAt: a.completedAt,
      }),
    });
  }

  // 5. Verified reproductions (Phase 28B mint).
  const repros = db
    .select({
      id: reproductions.id,
      targetKind: reproductions.targetKind,
      targetId: reproductions.targetId,
      credentialMintedAt: reproductions.credentialMintedAt,
    })
    .from(reproductions)
    .where(
      and(
        eq(reproductions.reproducerId, userId),
        isNotNull(reproductions.credentialMintedAt),
      ),
    )
    .all();
  for (const r of repros) {
    if (!r.credentialMintedAt) continue;
    items.push({
      kind: "reproduction",
      title: `Verified reproduction (${r.targetKind})`,
      earnedAt: r.credentialMintedAt,
      signed: true,
      detailUrl: "/me/credentials",
      verifyUrl: null,
      credential: signCredential("reproduction", {
        username,
        userId,
        reproductionId: r.id,
        targetKind: r.targetKind,
        targetId: r.targetId,
        mintedAt: r.credentialMintedAt,
      }),
    });
  }

  // 6. Completed bounties (claim accepted).
  const accepted = db
    .select({
      claimId: bountyClaims.id,
      claimedAt: bountyClaims.claimedAt,
      bountySlug: researchBounties.slug,
      bountyTitle: researchBounties.title,
      bountyId: researchBounties.id,
    })
    .from(bountyClaims)
    .innerJoin(
      researchBounties,
      eq(bountyClaims.bountyId, researchBounties.id),
    )
    .where(
      and(
        eq(bountyClaims.userId, userId),
        eq(bountyClaims.status, "accepted"),
      ),
    )
    .all();
  for (const b of accepted) {
    items.push({
      kind: "bounty",
      title: `Bounty: ${b.bountyTitle}`,
      earnedAt: b.claimedAt,
      signed: true,
      detailUrl: `/bounties/${b.bountySlug}`,
      verifyUrl: null,
      credential: signCredential("bounty", {
        username,
        userId,
        bountyId: b.bountyId,
        bountySlug: b.bountySlug,
        bountyTitle: b.bountyTitle,
        claimId: b.claimId,
      }),
    });
  }

  items.sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1));
  return items;
}

// GET /credentials/:username — public portfolio. Honors the
// per-user credentialsPublic toggle.
credentialsRouter.get("/:username", async (c) => {
  const username = c.req.param("username")!;
  const db = getDb();
  const u = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      credentialsPublic: users.credentialsPublic,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!u) return c.json({ error: "User not found" }, 404);
  if (!u.credentialsPublic) {
    // Allow the owner to view their own even when private.
    const session = await getSessionUser(c);
    if (session?.id !== u.id) {
      return c.json({ error: "This portfolio is private" }, 403);
    }
  }
  const items = buildWallet(u.id, u.username);
  return c.json({
    user: {
      username: u.username,
      displayName: u.displayName,
    },
    credentials: items,
  });
});

export const meCredentialsRouter = new Hono<Env>();

// GET /me/credentials — caller's own. ?format=json returns just
// the signed-credential bundle for offline batch verification.
meCredentialsRouter.get("/", requireAuth, async (c) => {
  const me = c.get("user")!;
  const items = buildWallet(me.id, me.username);
  if (c.req.query("format") === "json") {
    return c.json({
      issuer: "axiomic",
      generatedAt: new Date().toISOString(),
      subject: me.username,
      credentials: items
        .filter((i) => i.credential)
        .map((i) => i.credential),
    });
  }
  const db = getDb();
  const pref = db
    .select({ credentialsPublic: users.credentialsPublic })
    .from(users)
    .where(eq(users.id, me.id))
    .get();
  return c.json({
    credentialsPublic: pref?.credentialsPublic ?? true,
    credentials: items,
  });
});

// PUT /me/credentials/visibility — toggle the public portfolio.
meCredentialsRouter.put("/visibility", requireAuth, async (c) => {
  const me = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as {
    public?: boolean;
  };
  if (typeof body.public !== "boolean") {
    return c.json({ error: "public boolean required" }, 400);
  }
  getDb()
    .update(users)
    .set({ credentialsPublic: body.public })
    .where(eq(users.id, me.id))
    .run();
  return c.json({ ok: true });
});

// suppress unused import lint when desc isn't used in some builds
void desc;
