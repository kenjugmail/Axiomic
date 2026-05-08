// Sprint 52 — Content approval gate.
//
// When CONTENT_APPROVAL_ENABLED=1, write paths for lessons / wiki
// edits route through this library instead of writing directly:
//
//   route handler -> createProposal(...) -> content_proposals
//
// An admin approves at /admin/approvals; the per-kind apply function
// then performs the actual write. Reject does nothing for "private"
// kinds (lesson_publish, news_publish — the proposal payload is
// discarded) and reverts a snapshot for "live" kinds (wiki_edit —
// the change applied immediately, so reject must roll it back).
//
// Author bypass: a proposer who is also an admin auto-approves their
// own proposal. This keeps admins productive while still funneling
// all writes through the audit table.

import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  contentProposals,
  getDb,
  lessonVersions,
  masteryNodes,
  pageVersions,
  wikiPages,
  newsArticles,
  users,
} from "@axiomic/db";
import { env } from "./envConfig";
import { invalidateSearchIndex } from "./searchIndex";
import { notifyProposalDecision } from "./notifications";

export type ProposalKind =
  | "lesson_publish"
  | "news_publish"
  | "news_edit"
  | "wiki_edit";

export function isApprovalGateEnabled(): boolean {
  return env.CONTENT_APPROVAL_ENABLED === "1";
}

interface CreateArgs {
  kind: ProposalKind;
  targetId: string | null;
  proposerId: string;
  payloadJson: string;
  priorSnapshotJson?: string | null;
}

export interface CreatedProposal {
  id: string;
  status: "pending" | "approved";
}

// Insert a content_proposal. If the proposer is an admin, the proposal
// auto-approves and the apply function fires synchronously, so this
// helper transparently turns into "publish immediately" for them.
export function createProposal(args: CreateArgs): CreatedProposal {
  const db = getDb();
  const id = randomUUID();
  db.insert(contentProposals)
    .values({
      id,
      kind: args.kind,
      targetId: args.targetId,
      proposerId: args.proposerId,
      payloadJson: args.payloadJson,
      priorSnapshotJson: args.priorSnapshotJson ?? null,
      status: "pending",
    })
    .run();

  // Author-bypass for admins.
  const proposer = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, args.proposerId))
    .get();
  if (proposer?.role === "admin") {
    approveProposal(id, args.proposerId);
    return { id, status: "approved" };
  }

  return { id, status: "pending" };
}

export interface DecideResult {
  ok: boolean;
  error?: string;
}

export function approveProposal(
  proposalId: string,
  reviewerId: string,
  note?: string,
): DecideResult {
  const db = getDb();
  const proposal = db
    .select()
    .from(contentProposals)
    .where(eq(contentProposals.id, proposalId))
    .get();
  if (!proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.status !== "pending") {
    return { ok: false, error: `Proposal already ${proposal.status}` };
  }

  try {
    applyProposal(proposal);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Apply failed: ${msg}` };
  }

  db.update(contentProposals)
    .set({
      status: "approved",
      reviewerId,
      reviewNote: note ?? null,
      decidedAt: new Date().toISOString(),
    })
    .where(eq(contentProposals.id, proposalId))
    .run();

  if (proposal.proposerId !== reviewerId) {
    notifyProposalDecision(
      proposal.proposerId,
      reviewerId,
      proposalId,
      true,
      `Your ${proposal.kind} proposal was approved`,
    );
  }

  invalidateSearchIndex();
  return { ok: true };
}

export function rejectProposal(
  proposalId: string,
  reviewerId: string,
  note?: string,
): DecideResult {
  const db = getDb();
  const proposal = db
    .select()
    .from(contentProposals)
    .where(eq(contentProposals.id, proposalId))
    .get();
  if (!proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.status !== "pending") {
    return { ok: false, error: `Proposal already ${proposal.status}` };
  }

  // For revertable kinds (wiki_edit), restore the prior snapshot.
  if (proposal.kind === "wiki_edit" && proposal.priorSnapshotJson) {
    try {
      revertWikiEdit(proposal.targetId!, proposal.priorSnapshotJson, reviewerId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `Revert failed: ${msg}` };
    }
  }

  db.update(contentProposals)
    .set({
      status: "rejected",
      reviewerId,
      reviewNote: note ?? null,
      decidedAt: new Date().toISOString(),
    })
    .where(eq(contentProposals.id, proposalId))
    .run();

  notifyProposalDecision(
    proposal.proposerId,
    reviewerId,
    proposalId,
    false,
    note
      ? `Your ${proposal.kind} proposal was rejected: ${note.slice(0, 100)}`
      : `Your ${proposal.kind} proposal was rejected`,
  );

  invalidateSearchIndex();
  return { ok: true };
}

// --- per-kind apply --------------------------------------------------

function applyProposal(proposal: {
  id: string;
  kind: string;
  targetId: string | null;
  proposerId: string;
  payloadJson: string;
}): void {
  switch (proposal.kind as ProposalKind) {
    case "lesson_publish":
      applyLessonPublish(proposal);
      break;
    case "news_publish":
      applyNewsPublish(proposal);
      break;
    case "news_edit":
      applyNewsEdit(proposal);
      break;
    case "wiki_edit":
      // wiki_edit applies at proposal-creation time (so readers see
      // pending content immediately); the approval is just a flip.
      break;
    default:
      throw new Error(`Unknown proposal kind: ${proposal.kind}`);
  }
}

function applyLessonPublish(proposal: {
  targetId: string | null;
  proposerId: string;
  payloadJson: string;
}): void {
  if (!proposal.targetId) throw new Error("lesson_publish: missing targetId");
  const db = getDb();
  const node = db
    .select({
      id: masteryNodes.id,
      currentLessonVersion: masteryNodes.currentLessonVersion,
    })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, proposal.targetId))
    .get();
  if (!node) throw new Error("lesson_publish: node not found");

  const nextVersion = node.currentLessonVersion + 1;
  db.insert(lessonVersions)
    .values({
      id: randomUUID(),
      nodeId: proposal.targetId,
      version: nextVersion,
      lessonData: proposal.payloadJson,
      editedBy: proposal.proposerId,
      editMessage: "Published via approval",
      createdAt: new Date().toISOString(),
    })
    .run();

  db.update(masteryNodes)
    .set({
      lessonData: proposal.payloadJson,
      currentLessonVersion: nextVersion,
      draftLessonData: null,
      draftUpdatedAt: null,
      draftEditorId: null,
    })
    .where(eq(masteryNodes.id, proposal.targetId))
    .run();
}

function applyNewsPublish(proposal: {
  proposerId: string;
  payloadJson: string;
}): void {
  const db = getDb();
  const data = JSON.parse(proposal.payloadJson);
  if (!data?.slug || !data?.title) {
    throw new Error("news_publish: missing slug or title");
  }
  const dup = db
    .select({ id: newsArticles.id })
    .from(newsArticles)
    .where(eq(newsArticles.slug, data.slug))
    .get();
  if (dup) {
    throw new Error("news_publish: slug already exists");
  }
  db.insert(newsArticles)
    .values({
      id: randomUUID(),
      slug: data.slug,
      title: data.title,
      summary: data.summary ?? "",
      body: data.body ?? "",
      abstract: data.abstract ?? "",
      referencesJson: data.referencesJson ?? "[]",
      coauthorsJson: data.coauthorsJson ?? "[]",
      coverEmoji: data.coverEmoji ?? "📰",
      accentColor: data.accentColor ?? "indigo",
      status: "published",
      tags: data.tags ?? "[]",
      authorId: proposal.proposerId,
    })
    .run();
}

function applyNewsEdit(proposal: {
  targetId: string | null;
  proposerId: string;
  payloadJson: string;
}): void {
  if (!proposal.targetId) throw new Error("news_edit: missing targetId");
  const db = getDb();
  const data = JSON.parse(proposal.payloadJson);
  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.summary !== undefined) updates.summary = data.summary;
  if (data.body !== undefined) updates.body = data.body;
  if (data.abstract !== undefined) updates.abstract = data.abstract;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.coverEmoji !== undefined) updates.coverEmoji = data.coverEmoji;
  if (data.accentColor !== undefined) updates.accentColor = data.accentColor;
  if (Object.keys(updates).length === 0) return;
  updates.updatedAt = new Date().toISOString();
  updates.lastEditorId = proposal.proposerId;
  db.update(newsArticles)
    .set(updates as typeof newsArticles.$inferInsert)
    .where(eq(newsArticles.id, proposal.targetId))
    .run();
}

// Wiki edit applies at proposal *creation* time (so readers see
// pending content with a "Pending review" badge). On reject, restore
// from the snapshot. The snapshot is the prior {intro, undergrad,
// grad} content tuple.
export function applyWikiEditOptimistically(
  pageId: string,
  proposerId: string,
  payload: { contentIntro: string; contentUndergrad: string; contentGrad: string },
  editMessage: string,
): { newVersion: number; priorSnapshotJson: string } {
  const db = getDb();
  const page = db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).get();
  if (!page) throw new Error("wiki_edit: page not found");

  // Snapshot the current latest version so reject can revert.
  const currentVer = db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.pageId, pageId))
    .all()
    .find((v) => v.version === page.currentVersion);
  const priorSnapshot = {
    contentIntro: currentVer?.contentIntro ?? "",
    contentUndergrad: currentVer?.contentUndergrad ?? "",
    contentGrad: currentVer?.contentGrad ?? "",
    version: page.currentVersion,
  };

  const newVersion = page.currentVersion + 1;
  db.insert(pageVersions)
    .values({
      id: randomUUID(),
      pageId,
      version: newVersion,
      contentIntro: payload.contentIntro,
      contentUndergrad: payload.contentUndergrad,
      contentGrad: payload.contentGrad,
      editedBy: proposerId,
      editMessage,
    })
    .run();

  db.update(wikiPages)
    .set({ currentVersion: newVersion, updatedAt: new Date().toISOString() })
    .where(eq(wikiPages.id, pageId))
    .run();

  return { newVersion, priorSnapshotJson: JSON.stringify(priorSnapshot) };
}

function revertWikiEdit(
  pageId: string,
  priorSnapshotJson: string,
  reviewerId: string,
): void {
  const snap = JSON.parse(priorSnapshotJson) as {
    contentIntro: string;
    contentUndergrad: string;
    contentGrad: string;
    version: number;
  };
  const db = getDb();
  const page = db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).get();
  if (!page) throw new Error("revert: page not found");

  const newVersion = page.currentVersion + 1;
  db.insert(pageVersions)
    .values({
      id: randomUUID(),
      pageId,
      version: newVersion,
      contentIntro: snap.contentIntro,
      contentUndergrad: snap.contentUndergrad,
      contentGrad: snap.contentGrad,
      editedBy: reviewerId,
      editMessage: "Reverted from pending proposal",
    })
    .run();
  db.update(wikiPages)
    .set({ currentVersion: newVersion, updatedAt: new Date().toISOString() })
    .where(eq(wikiPages.id, pageId))
    .run();
}
