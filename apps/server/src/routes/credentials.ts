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
  credentialShareTokens,
  users,
} from "@axiomic/db";
import { createHash, randomBytes, randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { publicKeyHex, signCredential } from "../lib/signing";
import {
  computeAxiomicScore,
  signAxiomicScore,
} from "../lib/compositeScore";
import {
  type Skill,
  fetchTargetTags,
  parseSlugList,
  refreshUserSkillIndex,
  resolvePathTitles,
  resolveWikiTitles,
  toSkills,
} from "../lib/credentialSkills";
import {
  getRevocation,
  revocationKey,
  revokedKeySet,
} from "../lib/revocation";
import { ageDays, freshnessBand, type Freshness } from "../lib/freshness";
import { toVerifiableCredential, toOpenBadge3 } from "../lib/vc";
import { endorsementsForUser } from "../lib/endorsements";
import { orgAttestationsForUser } from "../lib/orgs";
import type { Env } from "../env";

// Phase 33A — re-serialize the inline-signed wallet items into a
// standards bundle (W3C VC 2.0 / Open Badges 3.0). Items without
// an inline credential (capstone/track/exam carry a transcript
// URL instead) are skipped here — their transcript endpoint is
// the canonical signed artifact.
export function serializeVcBundle(
  items: ReturnType<typeof buildWallet>,
  username: string,
  host: string,
  fmt: "vc" | "ob3",
): Record<string, unknown> {
  const creds = items
    .filter((i) => i.credential)
    .map((i) =>
      fmt === "ob3"
        ? toOpenBadge3(i.credential!, { host, subjectUsername: username })
        : toVerifiableCredential(i.credential!, {
            host,
            subjectUsername: username,
          }),
    );
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiablePresentation"],
    holder: `urn:axiomic:user:${username}`,
    format: fmt,
    count: creds.length,
    verifiableCredential: creds,
  };
}

export const credentialsRouter = new Hono<Env>();

interface WalletItem {
  kind:
    | "capstone"
    | "capstone_track"
    | "hackathon_prize"
    | "exam"
    | "reproduction"
    | "bounty"
    | "org_attestation";
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
  // Phase 29C — concepts/skills this credential demonstrates.
  // Default []; populated best-effort by annotateSkills().
  skills: Skill[];
  // Phase 32A — issuer-asserted revocation (signature still valid).
  revoked?: boolean;
  revocationReason?: string | null;
  // Phase 32B — derived freshness over earnedAt (no re-sign).
  ageDays?: number | null;
  freshness?: Freshness | null;
  // Internal staging fields (deleted before serialization).
  _wikiSlugs?: string[];
  _pathSlugs?: string[];
  _target?: { kind: string; id: string };
  _revKind?: string;
  _revRef?: string;
}

export function buildWallet(
  userId: string,
  username: string,
): WalletItem[] {
  const db = getDb();
  const items: WalletItem[] = [];

  // 1. Capstone completions — signed transcript already lives at
  //    /capstones/c/:artifactSlug/transcript.
  const caps = db
    .select({
      completedAt: capstoneEnrollments.completedAt,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
      title: capstones.title,
      tags: capstones.tags,
      prereqWikiSlugs: capstones.prerequisiteWikiSlugs,
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
      skills: [],
      _wikiSlugs: [
        ...parseSlugList(cap.tags),
        ...parseSlugList(cap.prereqWikiSlugs),
      ],
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
      skills: [],
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
        skills: [],
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
      pathSlug: exams.pathSlug,
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
      skills: [],
      _pathSlugs: a.pathSlug ? [a.pathSlug] : [],
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
      skills: [],
      _target: { kind: r.targetKind, id: r.targetId },
      _revKind: "reproduction",
      _revRef: r.id,
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
      skills: [],
      _revKind: "bounty",
      _revRef: b.bountyId,
    });
  }

  // Phase 34B — org attestations OF this user (a separate
  // institution-signed band; the signed credential names the org
  // as issuer).
  for (const a of orgAttestationsForUser(userId)) {
    items.push({
      kind: "org_attestation",
      title: `${a.orgName} attested your ${a.attestKind}`,
      earnedAt: a.createdAt,
      signed: true,
      detailUrl: `/orgs/${a.orgSlug}`,
      verifyUrl: null,
      credential: a.signed,
      skills: [],
    });
  }

  // Phase 32A/32B — annotate the issuer revocation registry + a
  // derived freshness band. Neither touches the signed bytes: the
  // signature still verifies; this is presentation/trust metadata.
  const revokedKeys = revokedKeySet();
  for (const it of items) {
    const hasRef = Boolean(it._revKind && it._revRef);
    it.revoked =
      hasRef && revokedKeys.has(revocationKey(it._revKind!, it._revRef!));
    it.revocationReason = it.revoked
      ? getRevocation(it._revKind!, it._revRef!)?.reason ?? "Revoked."
      : null;
    it.ageDays = ageDays(it.earnedAt);
    it.freshness = freshnessBand(it.earnedAt);
  }

  annotateSkills(items);
  // Phase 30C — self-heal the recruiter search index from this
  // wallet view (best-effort; must never break a wallet render).
  try {
    refreshUserSkillIndex(userId, buildSkillsSummary(items));
  } catch {
    // index refresh is non-critical
  }
  items.sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1));
  return items;
}

// Phase 29C — resolve every item's staged slug/target refs into
// displayable skills in a few batched queries, then strip the
// internal staging fields so the response stays clean.
function annotateSkills(items: WalletItem[]): void {
  const wikiSlugs: string[] = [];
  const pathSlugs: string[] = [];
  const targets: Array<{ kind: string; id: string }> = [];
  for (const it of items) {
    if (it._wikiSlugs) wikiSlugs.push(...it._wikiSlugs);
    if (it._pathSlugs) pathSlugs.push(...it._pathSlugs);
    if (it._target) targets.push(it._target);
  }
  const wikiTitles = resolveWikiTitles(wikiSlugs);
  const pathTitles = resolvePathTitles(pathSlugs);
  const targetTags = fetchTargetTags(targets);
  for (const it of items) {
    const slugs: string[] = [];
    const titleMap = new Map<string, string>();
    if (it._wikiSlugs) {
      slugs.push(...it._wikiSlugs);
      for (const [k, v] of wikiTitles) titleMap.set(k, v);
    }
    if (it._pathSlugs) {
      slugs.push(...it._pathSlugs);
      for (const [k, v] of pathTitles) titleMap.set(k, v);
    }
    if (it._target) {
      const tags = targetTags.get(`${it._target.kind}:${it._target.id}`) ?? [];
      slugs.push(...tags);
    }
    it.skills = toSkills(slugs, titleMap);
    delete it._wikiSlugs;
    delete it._pathSlugs;
    delete it._target;
    delete it._revKind;
    delete it._revRef;
  }
}

// Phase 29C — invert the annotated wallet into a recruiter-facing
// "skills proven, and by which credentials" rollup.
export function buildSkillsSummary(items: WalletItem[]): Array<{
  skill: string;
  slug: string;
  provenBy: Array<{ kind: string; title: string; earnedAt: string }>;
}> {
  const bySlug = new Map<
    string,
    {
      skill: string;
      slug: string;
      provenBy: Array<{ kind: string; title: string; earnedAt: string }>;
    }
  >();
  for (const it of items) {
    for (const s of it.skills) {
      let row = bySlug.get(s.slug);
      if (!row) {
        row = { skill: s.title, slug: s.slug, provenBy: [] };
        bySlug.set(s.slug, row);
      }
      row.provenBy.push({
        kind: it.kind,
        title: it.title,
        earnedAt: it.earnedAt,
      });
    }
  }
  return [...bySlug.values()].sort(
    (a, b) => b.provenBy.length - a.provenBy.length,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const fmt = c.req.query("format");
  if (fmt === "vc" || fmt === "ob3") {
    return c.json(
      serializeVcBundle(items, u.username, new URL(c.req.url).host, fmt),
    );
  }
  return c.json({
    user: {
      username: u.username,
      displayName: u.displayName,
    },
    credentials: items,
  });
});

// Phase 33C — public peer skill-endorsement web-of-trust band
// (same privacy gate as the wallet). Separate from signed proof.
credentialsRouter.get("/:username/endorsements", async (c) => {
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
    const session = await getSessionUser(c);
    if (session?.id !== u.id) {
      return c.json({ error: "This portfolio is private" }, 403);
    }
  }
  return c.json({
    user: { username: u.username, displayName: u.displayName },
    endorsements: endorsementsForUser(u.id),
  });
});

// Phase 31C — public signed Axiomic Score (same privacy gate as
// the wallet). Re-verifiable through /api/v1/keys/verify.
credentialsRouter.get("/:username/composite-score", async (c) => {
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
    const session = await getSessionUser(c);
    if (session?.id !== u.id) {
      return c.json({ error: "This portfolio is private" }, 403);
    }
  }
  const s = await computeAxiomicScore(u.id, u.username);
  return c.json({
    user: { username: u.username, displayName: u.displayName },
    ...s,
    credential: signAxiomicScore(u.id, u.username, s),
  });
});

// Phase 29C — recruiter-facing "skills proven, by which
// credentials" rollup. Same privacy gate as the wallet.
credentialsRouter.get("/:username/skills-summary", async (c) => {
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
    const session = await getSessionUser(c);
    if (session?.id !== u.id) {
      return c.json({ error: "This portfolio is private" }, 403);
    }
  }
  const items = buildWallet(u.id, u.username);
  return c.json({
    user: { username: u.username, displayName: u.displayName },
    skills: buildSkillsSummary(items),
  });
});

// Phase 29C — a self-contained, print-friendly public portfolio
// (HTML + @media print = a clean PDF via the browser, no PDF
// dependency). Same privacy gate.
credentialsRouter.get("/:username/portfolio.html", async (c) => {
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
  if (!u) return c.text("User not found", 404);
  if (!u.credentialsPublic) {
    const session = await getSessionUser(c);
    if (session?.id !== u.id) {
      return c.text("This portfolio is private", 403);
    }
  }
  const items = buildWallet(u.id, u.username);
  const skills = buildSkillsSummary(items);
  const name = escapeHtml(u.displayName || u.username);
  const pubKey = publicKeyHex();
  const skillRows = skills
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.skill)}</td><td>${s.provenBy
          .map((p) => escapeHtml(p.title))
          .join("; ")}</td></tr>`,
    )
    .join("");
  const credRows = items
    .map(
      (it) =>
        `<li><strong>${escapeHtml(it.title)}</strong> ` +
        `<span class="muted">· ${escapeHtml(it.kind)} · earned ${escapeHtml(
          new Date(it.earnedAt).toLocaleDateString(),
        )}</span>${
          it.skills.length
            ? `<div class="skills">${it.skills
                .map((sk) => `<span>${escapeHtml(sk.title)}</span>`)
                .join("")}</div>`
            : ""
        }</li>`,
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — Verifiable credentials</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; max-width: 760px;
         margin: 2rem auto; padding: 0 1.25rem; color: #1a1a1a; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; border-bottom: 1px solid #ddd;
       padding-bottom: .25rem; }
  .muted { color: #666; font-weight: 400; font-size: .85em; }
  table { width: 100%; border-collapse: collapse; font-size: .92em; }
  td { padding: .35rem .5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  td:first-child { font-weight: 600; white-space: nowrap; }
  ul { list-style: none; padding: 0; }
  li { padding: .55rem 0; border-bottom: 1px solid #eee; }
  .skills { margin-top: .3rem; }
  .skills span { display: inline-block; font-size: .78em; background: #eef;
    color: #224; border-radius: 999px; padding: .1rem .55rem; margin: .15rem .25rem .15rem 0; }
  footer { margin-top: 2.5rem; font-size: .78em; color: #888; word-break: break-all; }
  @media print { body { margin: 0; max-width: none; } a { color: inherit; } }
</style></head><body>
<h1>${name}</h1>
<div class="muted">Verifiable credential portfolio · @${escapeHtml(
    u.username,
  )} · ${items.length} credential(s)</div>
<h2>Skills proven</h2>
${
  skills.length
    ? `<table><tr><td>Skill</td><td>Demonstrated by</td></tr>${skillRows}</table>`
    : `<p class="muted">No mapped skills yet.</p>`
}
<h2>Credentials</h2>
${credRows ? `<ul>${credRows}</ul>` : `<p class="muted">No credentials yet.</p>`}
<footer>Every credential is Ed25519-signed and re-verifiable offline
against this platform public key:<br>${escapeHtml(pubKey)}<br>
Verify at /verify or fetch the signed bundle at
/api/v1/me/credentials?format=json.</footer>
</body></html>`;
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(html);
});

export const meCredentialsRouter = new Hono<Env>();

// Phase 31C — the caller's own signed Axiomic Score.
meCredentialsRouter.get("/composite-score", requireAuth, async (c) => {
  const me = c.get("user")!;
  const s = await computeAxiomicScore(me.id, me.username);
  return c.json({
    ...s,
    credential: signAxiomicScore(me.id, me.username, s),
  });
});

// GET /me/credentials — caller's own. ?format=json returns just
// the signed-credential bundle for offline batch verification.
meCredentialsRouter.get("/", requireAuth, async (c) => {
  const me = c.get("user")!;
  const items = buildWallet(me.id, me.username);
  const fmt = c.req.query("format");
  if (fmt === "json") {
    return c.json({
      issuer: "axiomic",
      generatedAt: new Date().toISOString(),
      subject: me.username,
      credentials: items
        .filter((i) => i.credential)
        .map((i) => i.credential),
    });
  }
  if (fmt === "vc" || fmt === "ob3") {
    return c.json(
      serializeVcBundle(items, me.username, new URL(c.req.url).host, fmt),
    );
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

// Phase 33D — selective-disclosure share links. A learner mints a
// scoped, optionally-expiring token exposing only chosen
// credential kinds, bypassing the all-or-nothing credentialsPublic
// gate ONLY for that subset. The raw token is shown once; only its
// sha256 is stored at rest.
export interface ShareScope {
  mode: "all" | "kinds";
  kinds?: string[];
}

export function parseShareScope(raw: unknown): ShareScope {
  if (
    raw &&
    typeof raw === "object" &&
    (raw as { mode?: string }).mode === "kinds" &&
    Array.isArray((raw as { kinds?: unknown }).kinds)
  ) {
    return {
      mode: "kinds",
      kinds: (raw as { kinds: unknown[] }).kinds
        .filter((k): k is string => typeof k === "string")
        .slice(0, 12),
    };
  }
  return { mode: "all" };
}

export function filterWalletByScope(
  items: ReturnType<typeof buildWallet>,
  scope: ShareScope,
): ReturnType<typeof buildWallet> {
  if (scope.mode === "kinds" && scope.kinds) {
    const set = new Set(scope.kinds);
    return items.filter((i) => set.has(i.kind));
  }
  return items;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Phase 34A reuse — mint a scoped share token for any user. Used
// by the owner route below and by an accepted recruiter offer.
export function mintShareToken(
  userId: string,
  scope: ShareScope,
  label: string,
  days: number | null,
): { id: string; token: string; shareUrl: string; expiresAt: string | null } {
  const token = randomBytes(32).toString("hex");
  const expiresAt =
    days && days > 0 && days <= 365
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;
  const id = randomUUID();
  getDb()
    .insert(credentialShareTokens)
    .values({
      id,
      userId,
      tokenHash: sha256Hex(token),
      scopeJson: JSON.stringify(scope),
      label: label.slice(0, 120),
      expiresAt,
    })
    .run();
  return { id, token, shareUrl: `/api/v1/public/share/${token}`, expiresAt };
}

meCredentialsRouter.post("/share-tokens", requireAuth, async (c) => {
  const me = c.get("user")!;
  if (
    env.NODE_ENV !== "test" &&
    !checkRateLimit(`share-token:${me.id}`, 20, 60_000)
  ) {
    return c.json({ error: "Rate limited. Slow down." }, 429);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    scope?: unknown;
    label?: string;
    expiresInDays?: number;
  };
  const scope = parseShareScope(body.scope);
  const days =
    typeof body.expiresInDays === "number" ? body.expiresInDays : null;
  const t = mintShareToken(me.id, scope, body.label ?? "", days);
  return c.json({ ...t, scope }, 201);
});

meCredentialsRouter.get("/share-tokens", requireAuth, (c) => {
  const me = c.get("user")!;
  const rows = getDb()
    .select({
      id: credentialShareTokens.id,
      scopeJson: credentialShareTokens.scopeJson,
      label: credentialShareTokens.label,
      expiresAt: credentialShareTokens.expiresAt,
      revokedAt: credentialShareTokens.revokedAt,
      accessCount: credentialShareTokens.accessCount,
      lastAccessedAt: credentialShareTokens.lastAccessedAt,
      createdAt: credentialShareTokens.createdAt,
    })
    .from(credentialShareTokens)
    .where(eq(credentialShareTokens.userId, me.id))
    .orderBy(desc(credentialShareTokens.createdAt))
    .all()
    .map((r) => ({ ...r, scope: JSON.parse(r.scopeJson) }));
  return c.json({ tokens: rows });
});

meCredentialsRouter.delete("/share-tokens/:id", requireAuth, (c) => {
  const me = c.get("user")!;
  const r = getDb()
    .update(credentialShareTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(credentialShareTokens.id, c.req.param("id")!),
        eq(credentialShareTokens.userId, me.id),
      ),
    )
    .run();
  if (((r as unknown as { changes?: number }).changes ?? 0) === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});

// Resolve + consume a share token (used by the public endpoint).
// Returns the scoped wallet or null (missing/revoked/expired).
export function resolveShareToken(token: string):
  | { username: string; displayName: string | null; scope: ShareScope; items: ReturnType<typeof buildWallet> }
  | null {
  const db = getDb();
  const row = db
    .select()
    .from(credentialShareTokens)
    .where(eq(credentialShareTokens.tokenHash, sha256Hex(token)))
    .get();
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) return null;
  const u = db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.userId))
    .get();
  if (!u) return null;
  db.update(credentialShareTokens)
    .set({
      accessCount: row.accessCount + 1,
      lastAccessedAt: new Date().toISOString(),
    })
    .where(eq(credentialShareTokens.id, row.id))
    .run();
  const scope = parseShareScope(JSON.parse(row.scopeJson));
  return {
    username: u.username,
    displayName: u.displayName,
    scope,
    items: filterWalletByScope(buildWallet(u.id, u.username), scope),
  };
}

// suppress unused import lint when desc isn't used in some builds
void desc;
