// Sprint 35 — Version snapshot helpers.
//
// Snapshot a published research paper or capstone into its history
// table. Bumps `currentVersion` on the parent row and inserts the
// matching `*_versions` row in the same transaction-ish flow. We do
// NOT take snapshots on draft saves — only on transitions to or
// re-publishes of `published` status.

import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneMilestones,
  capstoneVersions,
  capstones,
  getDb,
  researchPaperVersions,
  researchPapers,
} from "@axiomic/db";

export interface SnapshotOptions {
  editedBy?: string | null;
  editMessage?: string | null;
}

// Snapshot the current state of a research paper. Bumps the parent
// `currentVersion` and inserts a versions row. Returns the new version
// number, or null when the paper isn't found.
export function snapshotResearchPaper(
  paperId: string,
  opts: SnapshotOptions = {},
): number | null {
  const db = getDb();
  const row = db
    .select()
    .from(researchPapers)
    .where(eq(researchPapers.id, paperId))
    .get();
  if (!row) return null;
  // Only snapshot published papers — draft saves are part of normal
  // editing and shouldn't pollute the version history.
  if (row.status !== "published") return null;

  const nextVersion = row.currentVersion + 1;
  // The very first publish of a paper still gets a version-1 row so
  // future diffs have something to compare against. We detect that by
  // checking for an existing version-1 row.
  const existingV1 = db
    .select({ id: researchPaperVersions.id })
    .from(researchPaperVersions)
    .where(eq(researchPaperVersions.paperId, paperId))
    .get();
  const targetVersion = existingV1 ? nextVersion : 1;

  db.insert(researchPaperVersions).values({
    id: randomUUID(),
    paperId: row.id,
    version: targetVersion,
    title: row.title,
    summary: row.summary,
    abstract: row.abstract,
    contentIntro: row.contentIntro,
    contentUndergrad: row.contentUndergrad,
    contentGrad: row.contentGrad,
    paperStructureJson: row.paperStructureJson,
    referencesJson: row.referencesJson,
    editedBy: opts.editedBy ?? null,
    editMessage: opts.editMessage ?? null,
  }).run();

  if (targetVersion !== row.currentVersion) {
    db.update(researchPapers)
      .set({ currentVersion: targetVersion })
      .where(eq(researchPapers.id, paperId))
      .run();
  }
  return targetVersion;
}

export function snapshotCapstone(
  capstoneId: string,
  opts: SnapshotOptions = {},
): number | null {
  const db = getDb();
  const row = db
    .select()
    .from(capstones)
    .where(eq(capstones.id, capstoneId))
    .get();
  if (!row) return null;
  if (row.status !== "published") return null;

  const milestones = db
    .select({
      id: capstoneMilestones.id,
      order: capstoneMilestones.order,
      title: capstoneMilestones.title,
      description: capstoneMilestones.description,
      rubricJson: capstoneMilestones.rubricJson,
      requiredArtifactKinds: capstoneMilestones.requiredArtifactKinds,
    })
    .from(capstoneMilestones)
    .where(eq(capstoneMilestones.capstoneId, capstoneId))
    .all();

  const existing = db
    .select({ id: capstoneVersions.id })
    .from(capstoneVersions)
    .where(eq(capstoneVersions.capstoneId, capstoneId))
    .get();
  const nextVersion = row.currentVersion + 1;
  const targetVersion = existing ? nextVersion : 1;

  db.insert(capstoneVersions).values({
    id: randomUUID(),
    capstoneId: row.id,
    version: targetVersion,
    title: row.title,
    summary: row.summary,
    contentIntro: row.contentIntro,
    contentUndergrad: row.contentUndergrad,
    contentGrad: row.contentGrad,
    milestonesJson: JSON.stringify(milestones),
    editedBy: opts.editedBy ?? null,
    editMessage: opts.editMessage ?? null,
  }).run();

  if (targetVersion !== row.currentVersion) {
    db.update(capstones)
      .set({ currentVersion: targetVersion })
      .where(eq(capstones.id, capstoneId))
      .run();
  }
  return targetVersion;
}
