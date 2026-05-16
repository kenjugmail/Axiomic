// Phase 32C — curated target-role catalog.
//
// A role names a set of skill slugs the skill-gap analyzer diffs a
// learner's signed proof + mastery against. Seeded idempotently on
// first read (mirrors ensurePetCosmeticsCatalog) so the feature
// works with zero ops setup; ad-hoc skill lists also work with no
// catalog rows at all. Curated rows are upsert-by-slug so editing
// the seed list below + a restart re-syncs.

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, roleProfiles } from "@axiomic/db";

interface SeedRole {
  slug: string;
  title: string;
  descriptionMd: string;
  requiredSkillSlugs: string[];
}

// Skill slugs are concept/wiki slugs. They need not all exist —
// unmatched ones simply surface as "missing" in the gap.
const SEED_ROLES: SeedRole[] = [
  {
    slug: "ml-engineer",
    title: "Machine Learning Engineer",
    descriptionMd:
      "Builds, trains, and ships ML systems end to end.",
    requiredSkillSlugs: [
      "linear-algebra",
      "probability",
      "gradient-descent",
      "backpropagation",
      "transformer-architecture",
      "softmax",
      "attention",
      "regularization",
    ],
  },
  {
    slug: "research-scientist",
    title: "Research Scientist",
    descriptionMd:
      "Designs experiments, proves results, publishes reproducibly.",
    requiredSkillSlugs: [
      "probability",
      "statistical-inference",
      "experimental-design",
      "information-theory",
      "optimization",
      "scientific-writing",
    ],
  },
  {
    slug: "data-analyst",
    title: "Data Analyst",
    descriptionMd:
      "Turns data into decisions with rigorous statistics.",
    requiredSkillSlugs: [
      "descriptive-statistics",
      "probability",
      "hypothesis-testing",
      "regression",
      "data-visualization",
      "sql",
    ],
  },
  {
    slug: "backend-engineer",
    title: "Backend Engineer",
    descriptionMd:
      "Designs reliable services, data models, and APIs.",
    requiredSkillSlugs: [
      "data-structures",
      "algorithms",
      "databases",
      "concurrency",
      "api-design",
      "system-design",
    ],
  },
  {
    slug: "research-engineer",
    title: "Research Engineer",
    descriptionMd:
      "Bridges research and production: reproduces papers, scales them.",
    requiredSkillSlugs: [
      "linear-algebra",
      "optimization",
      "transformer-architecture",
      "distributed-training",
      "algorithms",
      "experimental-design",
    ],
  },
  {
    slug: "quant-researcher",
    title: "Quantitative Researcher",
    descriptionMd:
      "Models markets with probability, statistics, and optimization.",
    requiredSkillSlugs: [
      "probability",
      "stochastic-processes",
      "statistical-inference",
      "optimization",
      "time-series",
      "linear-algebra",
    ],
  },
];

let synced = false;

export function ensureRoleCatalog(force = false): void {
  if (synced && !force) return;
  const db = getDb();
  for (const r of SEED_ROLES) {
    const existing = db
      .select({ id: roleProfiles.id })
      .from(roleProfiles)
      .where(eq(roleProfiles.slug, r.slug))
      .get();
    const requiredSkillSlugsJson = JSON.stringify(r.requiredSkillSlugs);
    if (existing) {
      db.update(roleProfiles)
        .set({
          title: r.title,
          descriptionMd: r.descriptionMd,
          requiredSkillSlugsJson,
          source: "curated",
        })
        .where(eq(roleProfiles.id, existing.id))
        .run();
    } else {
      db.insert(roleProfiles)
        .values({
          id: randomUUID(),
          slug: r.slug,
          title: r.title,
          descriptionMd: r.descriptionMd,
          requiredSkillSlugsJson,
          source: "curated",
        })
        .run();
    }
  }
  synced = true;
}

export interface RoleProfile {
  slug: string;
  title: string;
  descriptionMd: string;
  requiredSkillSlugs: string[];
}

function parseSkills(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function listRoles(): RoleProfile[] {
  ensureRoleCatalog();
  return getDb()
    .select()
    .from(roleProfiles)
    .all()
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      descriptionMd: r.descriptionMd,
      requiredSkillSlugs: parseSkills(r.requiredSkillSlugsJson),
    }));
}

export function getRole(slug: string): RoleProfile | null {
  ensureRoleCatalog();
  const r = getDb()
    .select()
    .from(roleProfiles)
    .where(eq(roleProfiles.slug, slug))
    .get();
  if (!r) return null;
  return {
    slug: r.slug,
    title: r.title,
    descriptionMd: r.descriptionMd,
    requiredSkillSlugs: parseSkills(r.requiredSkillSlugsJson),
  };
}

// Test-only — re-run the idempotent seed.
export function __resetRoleCatalogForTesting(): void {
  synced = false;
}
