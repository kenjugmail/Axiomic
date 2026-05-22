import {
  getDb,
  wikiPages,
  pageVersions,
  masteryPaths,
  masteryNodes,
  users,
  domains,
  forumTopics,
  forumPosts,
  forumVotes,
  newsArticles,
  capstones,
  capstoneMilestones,
  capstoneEnrollments,
  capstoneSubmissions,
  capstoneTracks,
  capstoneTrackCapstones,
  misconceptionCatalog,
  researchPapers,
  exams,
  examSections,
  examQuestions,
  // Sprint 84 — lab content tables (S79/S80).
  protocols,
  protocolSteps,
  equipment,
  equipmentOperations,
  safetyCertifications,
  // S86 — pet cosmetic catalog.
  petCosmetics,
  petSkins,
  pets,
  petSkinInventory,
  // S108 — demo cohort seed for college / investor pitches.
  classes,
  classEnrollments,
  classTasks,
  classTaskCompletions,
  // Phase 41 — gated demo seed (SEED_DEMO=1): missions / orgs /
  // bounties / hackathons / activity so every surface is testable.
  missions,
  missionMembers,
  missionSubproblems,
  missionContributions,
  missionContributionReviews,
  missionOrgBackers,
  orgs,
  orgMembers,
  researchBounties,
  bountyClaims,
  hackathons,
  hackathonPrizes,
  hackathonTeams,
  hackathonTeamMembers,
  activityEvents,
  xpGrants,
} from "./index";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const db = getDb();

// bcrypt is provided via Bun.password.hash; this seed-side import keeps the
// dependency local to seeding so we don't pull bun-only APIs into the schema.
const FORUM_SEED_PASSWORD_HASH = Bun.password.hashSync("axiomic-seed");

// Phase 41 — comprehensive pre-beta demo content (Missions, Orgs,
// Research Bounties, Hackathons, demo-user activity) is gated behind
// SEED_DEMO=1 so a real public beta deploy can stay clean of fake
// content. The existing always-on seeders (incl. seedDemoCohort /
// DEMO2026) are unaffected. Also gates `demo-*` forum/track fixtures.
const SEED_DEMO = process.env.SEED_DEMO === "1";

// Verbatim duplicate of the private helper inside seedDemoCohort so
// that function stays byte-unchanged. Idempotent on username; demo
// password "demo"; pre-verified so the demo flows skip email gating.
const DEMO_PASSWORD_HASH = Bun.password.hashSync("demo");
function ensureDemoUser(
  username: string,
  displayName: string,
  bio: string,
): string {
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(users)
    .values({
      id,
      username,
      email: `${username}@axiomic.local`,
      passwordHash: DEMO_PASSWORD_HASH,
      displayName,
      bio,
      emailVerifiedAt: new Date().toISOString(),
    })
    .run();
  return id;
}

async function seed() {
  console.log("Seeding database...");

  const seedDir = path.join(import.meta.dir, "../../../seed-content/pages");
  if (!fs.existsSync(seedDir)) {
    console.log("No seed content directory found. Skipping wiki page seeding.");
    return;
  }

  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} seed pages.`);

  for (const file of files) {
    const slug = file.replace(".md", "");
    const content = fs.readFileSync(path.join(seedDir, file), "utf-8");

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.warn(`Skipping ${file}: no frontmatter found.`);
      continue;
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    const title = frontmatter.match(/title:\s*(.+)/)?.[1]?.trim() || slug;
    const category = frontmatter.match(/category:\s*(.+)/)?.[1]?.trim() || "uncategorized";

    // Split body into tiers by markers
    const tiers = parseTiers(body);

    const pageId = randomUUID();
    const versionId = randomUUID();

    // Check if page already exists
    const existing = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();

    if (existing) {
      console.log(`  Page "${slug}" already exists, skipping.`);
      continue;
    }

    db.insert(wikiPages).values({
      id: pageId,
      slug,
      title,
      category,
      currentVersion: 1,
    }).run();

    db.insert(pageVersions).values({
      id: versionId,
      pageId,
      version: 1,
      contentIntro: tiers.intro,
      contentUndergrad: tiers.undergrad,
      contentGrad: tiers.grad,
      editMessage: "Initial seed content",
    }).run();

    console.log(`  Seeded: ${title}`);
  }

  // Seed mastery paths
  seedMasteryPaths();

  // Seed forum (domains, demo users, topics, replies, votes)
  await seedForum();

  // Seed news (article-style posts with covers + viz embeds)
  seedNews();

  // Sprint 28 — load capstones from seed-content/capstones/*.json.
  await seedCapstones();

  // Sprint 29 — load misconception catalog.
  seedMisconceptionCatalog();

  // Sprint 49 — load research papers from seed-content/research/*.json.
  seedResearchPapers();

  // Sprint 52 — load capstone tracks (depend on capstones existing).
  await seedCapstoneTracks();

  // Sprint 73 — exam mastery framework.
  seedExams();

  // Sprint 84 — lab protocol + equipment + safety-cert library +
  // onboarding playbook. Idempotent on slug.
  seedLabContent();

  // S86 — pet cosmetic catalog. Idempotent on slug.
  seedPetCosmetics();

  // Phase L — pet skin catalog. Idempotent on slug.
  seedPetSkins();

  // Phase 41 — gated demo content (SEED_DEMO=1) so every user-facing
  // surface is non-empty for beta testing. Orgs first (missions
  // back-reference them as backers). The grants feed is an external
  // aggregator — not seedable here; covered by the deploy checklist.
  seedDemoOrgs();
  seedDemoMissions();
  seedDemoBounties();
  seedDemoHackathons();

  // S108 — demo cohort + signed-capstone artifact for the pitch demo
  // path. Depends on capstones (clip-style-retriever) being seeded.
  await seedDemoCohort();

  // Phase 41 — demo-user activity. After seedDemoCohort so the
  // demo-student accounts exist; makes the leaderboard + heatmap
  // render instead of being empty.
  seedDemoActivity();

  console.log("Seeding complete.");
}

// Sprint 84 — Idempotent loader for the lab content corpus. Reads
// from seed-content/lab/{safety-certs,equipment,protocols,playbooks}
// and inserts rows keyed on slug. Existing rows are left alone — to
// re-import after edits, drop the affected rows by hand. (We can
// version-bump like seedExams later if content edit cycles need it.)
function seedLabContent() {
  const root = path.join(import.meta.dir, "../../../seed-content/lab");
  if (!fs.existsSync(root)) {
    console.log("  No seed-content/lab dir, skipping lab seed.");
    return;
  }
  const author = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "alice"))
    .get();
  if (!author) {
    console.log("  No alice user; cannot attribute lab content. Skipping.");
    return;
  }

  // --- Safety certs -----------------------------------------------
  const certsDir = path.join(root, "safety-certs");
  if (fs.existsSync(certsDir)) {
    let n = 0;
    for (const file of fs
      .readdirSync(certsDir)
      .filter((f) => f.endsWith(".json"))) {
      let parsed: any;
      try {
        parsed = JSON.parse(
          fs.readFileSync(path.join(certsDir, file), "utf-8"),
        );
      } catch (e) {
        console.warn(`  cert ${file}: parse error`, e);
        continue;
      }
      if (!parsed?.slug || !parsed?.title) continue;
      const exists = db
        .select({ id: safetyCertifications.id })
        .from(safetyCertifications)
        .where(eq(safetyCertifications.slug, parsed.slug))
        .get();
      if (exists) continue;
      db.insert(safetyCertifications)
        .values({
          id: randomUUID(),
          slug: parsed.slug,
          title: parsed.title,
          discipline: parsed.discipline ?? "biology",
          description: parsed.description ?? null,
          quizDataJson: JSON.stringify(parsed.quizData ?? []),
          passingScore: Number(parsed.passingScore) || 0.7,
          validityDays:
            parsed.validityDays === null ||
            parsed.validityDays === undefined
              ? null
              : Number(parsed.validityDays),
          authorId: author.id,
        })
        .run();
      n++;
    }
    console.log(`  seeded ${n} safety cert(s)`);
  }

  // --- Equipment + operations -------------------------------------
  const eqDir = path.join(root, "equipment");
  if (fs.existsSync(eqDir)) {
    let n = 0;
    for (const file of fs
      .readdirSync(eqDir)
      .filter((f) => f.endsWith(".json"))) {
      let parsed: any;
      try {
        parsed = JSON.parse(
          fs.readFileSync(path.join(eqDir, file), "utf-8"),
        );
      } catch (e) {
        console.warn(`  equipment ${file}: parse error`, e);
        continue;
      }
      if (!parsed?.slug || !parsed?.title) continue;
      const exists = db
        .select({ id: equipment.id })
        .from(equipment)
        .where(eq(equipment.slug, parsed.slug))
        .get();
      if (exists) continue;
      const id = randomUUID();
      db.insert(equipment)
        .values({
          id,
          slug: parsed.slug,
          title: parsed.title,
          discipline: parsed.discipline ?? "biology",
          manufacturer: parsed.manufacturer ?? null,
          model: parsed.model ?? null,
          manualMd: parsed.manualMd ?? "",
          locationHint: parsed.locationHint ?? null,
          trainingCertSlug: parsed.trainingCertSlug ?? null,
          hazardsMd: parsed.hazardsMd ?? "",
          attachmentRefsJson: JSON.stringify(
            parsed.attachmentRefs ?? [],
          ),
          bookingPolicy: parsed.bookingPolicy ?? "open",
          status: parsed.status ?? "active",
          authorId: author.id,
        })
        .run();
      const ops: any[] = Array.isArray(parsed.operations)
        ? parsed.operations
        : [];
      ops.forEach((op, i) => {
        if (!op?.title || !op?.bodyMd || !op?.kind) return;
        db.insert(equipmentOperations)
          .values({
            id: randomUUID(),
            equipmentId: id,
            ordinal: i + 1,
            title: op.title,
            bodyMd: op.bodyMd,
            kind: op.kind,
          })
          .run();
      });
      n++;
    }
    console.log(`  seeded ${n} equipment manual(s)`);
  }

  // --- Protocols + steps ------------------------------------------
  const protoDir = path.join(root, "protocols");
  if (fs.existsSync(protoDir)) {
    let n = 0;
    for (const file of fs
      .readdirSync(protoDir)
      .filter((f) => f.endsWith(".json"))) {
      let parsed: any;
      try {
        parsed = JSON.parse(
          fs.readFileSync(path.join(protoDir, file), "utf-8"),
        );
      } catch (e) {
        console.warn(`  protocol ${file}: parse error`, e);
        continue;
      }
      if (!parsed?.slug || !parsed?.title) continue;
      const exists = db
        .select({ id: protocols.id })
        .from(protocols)
        .where(eq(protocols.slug, parsed.slug))
        .get();
      if (exists) continue;
      const id = randomUUID();
      db.insert(protocols)
        .values({
          id,
          slug: parsed.slug,
          title: parsed.title,
          discipline: parsed.discipline ?? "biology",
          category: parsed.category ?? null,
          summary: parsed.summary ?? "",
          contentIntro: parsed.contentIntro ?? "",
          contentUndergrad: parsed.contentUndergrad ?? "",
          contentGrad: parsed.contentGrad ?? "",
          biosafetyLevel:
            parsed.biosafetyLevel === null ||
            parsed.biosafetyLevel === undefined
              ? null
              : Number(parsed.biosafetyLevel),
          hazardsMd: parsed.hazardsMd ?? "",
          equipmentRequiredJson: JSON.stringify(
            parsed.equipmentRequired ?? [],
          ),
          reagentsJson: JSON.stringify(parsed.reagents ?? []),
          estimatedMinutes:
            parsed.estimatedMinutes === null ||
            parsed.estimatedMinutes === undefined
              ? null
              : Number(parsed.estimatedMinutes),
          requiredCertsJson: JSON.stringify(parsed.requiredCerts ?? []),
          status: parsed.status ?? "published",
          version: 1,
          authorId: author.id,
        })
        .run();
      const steps: any[] = Array.isArray(parsed.steps) ? parsed.steps : [];
      steps.forEach((s, i) => {
        if (!s?.title || !s?.instructionMd) return;
        db.insert(protocolSteps)
          .values({
            id: randomUUID(),
            protocolId: id,
            ordinal: i + 1,
            title: s.title,
            instructionMd: s.instructionMd,
            safetyNotesMd: s.safetyNotesMd ?? "",
            verificationMd: s.verificationMd ?? "",
            inlineQuizJson: s.inlineQuizJson ?? null,
            attachmentRefsJson: JSON.stringify(s.attachmentRefs ?? []),
          })
          .run();
      });
      n++;
    }
    console.log(`  seeded ${n} protocol(s)`);
  }

  // --- Playbooks (mastery paths with mixed-kind nodes) ------------
  const pbDir = path.join(root, "playbooks");
  if (fs.existsSync(pbDir)) {
    let n = 0;
    for (const file of fs
      .readdirSync(pbDir)
      .filter((f) => f.endsWith(".json"))) {
      let parsed: any;
      try {
        parsed = JSON.parse(
          fs.readFileSync(path.join(pbDir, file), "utf-8"),
        );
      } catch (e) {
        console.warn(`  playbook ${file}: parse error`, e);
        continue;
      }
      if (!parsed?.slug || !parsed?.title) continue;
      const exists = db
        .select({ id: masteryPaths.id })
        .from(masteryPaths)
        .where(eq(masteryPaths.slug, parsed.slug))
        .get();
      if (exists) continue;
      const pathId = randomUUID();
      db.insert(masteryPaths)
        .values({
          id: pathId,
          slug: parsed.slug,
          title: parsed.title,
          description: parsed.description ?? "",
        })
        .run();
      const nodes: any[] = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      // Build a slug→nodeId map first so prereq references resolve.
      const nodeIds = new Map<string, string>();
      nodes.forEach((node) => {
        if (!node?.slug) return;
        nodeIds.set(node.slug, randomUUID());
      });
      nodes.forEach((node, i) => {
        if (!node?.slug || !node?.title) return;
        const id = nodeIds.get(node.slug)!;
        const prereqIds = (node.prerequisites ?? [])
          .map((s: string) => nodeIds.get(s))
          .filter(Boolean);
        db.insert(masteryNodes)
          .values({
            id,
            pathId,
            slug: node.slug,
            title: node.title,
            description: node.description ?? "",
            order: i + 1,
            level: node.level ?? "apprentice",
            pageIds: JSON.stringify([]),
            prerequisiteNodeIds: JSON.stringify(prereqIds),
            quizData: null,
            lessonData: null,
            nodeKind: node.kind ?? "lesson",
            protocolSlug: node.protocolSlug ?? null,
            certSlug: node.certSlug ?? null,
            equipmentSlug: node.equipmentSlug ?? null,
          })
          .run();
      });
      n++;
    }
    console.log(`  seeded ${n} lab playbook(s)`);
  }
}

// Sprint 73 — load exams from seed-content/exams/*.json.
//
// Sprint 74 — version-aware: each JSON carries a `contentVersion`
// integer. When the stored version is below the file's, we wipe the
// exam (cascade deletes sections + questions + past attempts) and
// re-import. When versions match, we skip. Question ids are
// generated deterministically as `${examSlug}:${sectionSlug}:q${i}`
// so any code that holds onto a question-id reference across a
// re-import keeps working as long as the question still exists in
// the new bank.
function seedExams() {
  const dir = path.join(import.meta.dir, "../../../seed-content/exams");
  if (!fs.existsSync(dir)) {
    console.log("  No exams directory found, skipping.");
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let loaded = 0;
  for (const file of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch (e) {
      console.warn(`  exam ${file}: failed to parse JSON`, e);
      continue;
    }
    if (!parsed?.slug || !parsed?.title) continue;
    const fileVersion = Number(parsed.contentVersion) || 1;
    const existing = db
      .select({ id: exams.id, contentVersion: exams.contentVersion })
      .from(exams)
      .where(eq(exams.slug, parsed.slug))
      .get();
    if (existing && existing.contentVersion >= fileVersion) {
      console.log(
        `  exam ${parsed.slug}: v${existing.contentVersion} already seeded (file v${fileVersion}), skipping.`,
      );
      continue;
    }
    if (existing) {
      // Version bump — cascade-delete the old exam so we can
      // re-import. Past attempts are wiped too; that's the
      // accepted seed-time tradeoff.
      db.delete(exams).where(eq(exams.id, existing.id)).run();
      console.log(
        `  exam ${parsed.slug}: bumping v${existing.contentVersion} → v${fileVersion}, re-importing.`,
      );
    }

    const examId = randomUUID();
    db.insert(exams)
      .values({
        id: examId,
        slug: parsed.slug,
        title: parsed.title,
        shortName: parsed.shortName ?? parsed.slug.toUpperCase(),
        pathSlug: parsed.pathSlug ?? null,
        totalDurationMinutes: Number(parsed.totalDurationMinutes) || 0,
        scoringJson: JSON.stringify(parsed.scoring ?? {}),
        description: parsed.description ?? "",
        contentVersion: fileVersion,
      })
      .run();

    const sections: any[] = Array.isArray(parsed.sections) ? parsed.sections : [];
    for (const sec of sections) {
      if (!sec?.slug || !sec?.title) continue;
      const sectionId = `exam:${parsed.slug}:${sec.slug}`;
      db.insert(examSections)
        .values({
          id: sectionId,
          examId,
          slug: sec.slug,
          title: sec.title,
          ordinal: Number(sec.ordinal) || 0,
          durationMinutes: Number(sec.durationMinutes) || 0,
          questionCount: Number(sec.questionCount) || 0,
        })
        .run();

      const questions: any[] = Array.isArray(sec.questions) ? sec.questions : [];
      const ALLOWED_TYPES = new Set([
        "multiple_choice",
        "essay",
        "grid_in",
        "multi_select",
      ]);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q?.promptMd) continue;
        const type: string = ALLOWED_TYPES.has(q.type) ? q.type : "multiple_choice";
        if (type === "essay") {
          if (typeof q.rubricMd !== "string" || q.rubricMd.length === 0)
            continue;
        } else if (type === "grid_in") {
          if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0)
            continue;
        } else if (type === "multi_select") {
          if (
            !Array.isArray(q.options) ||
            !Array.isArray(q.correctIndexes) ||
            q.correctIndexes.length < 1
          )
            continue;
        } else {
          if (!Array.isArray(q?.options) || typeof q.correctIndex !== "number")
            continue;
        }
        const questionId = `q:${parsed.slug}:${sec.slug}:${i}`;
        db.insert(examQuestions)
          .values({
            id: questionId,
            sectionId,
            type,
            difficulty: Number(q.difficulty) || 3,
            promptMd: String(q.promptMd),
            passageMd: typeof q.passageMd === "string" ? q.passageMd : null,
            optionsJson: JSON.stringify(q.options ?? []),
            correctIndex:
              typeof q.correctIndex === "number" ? q.correctIndex : 0,
            rubricMd: type === "essay" ? String(q.rubricMd) : null,
            maxEssayScore:
              type === "essay" ? Number(q.maxEssayScore) || 6 : null,
            acceptedAnswersJson:
              type === "grid_in"
                ? JSON.stringify(q.acceptedAnswers.map((s: unknown) => String(s)))
                : null,
            tolerance:
              type === "grid_in" && typeof q.tolerance === "number"
                ? q.tolerance
                : null,
            correctIndexesJson:
              type === "multi_select"
                ? JSON.stringify(
                    (q.correctIndexes as number[]).map((n) => Number(n)),
                  )
                : null,
            imageUrl: typeof q.imageUrl === "string" ? q.imageUrl : null,
            metaJson:
              q.meta && typeof q.meta === "object"
                ? JSON.stringify(q.meta)
                : null,
            explanationMd: q.explanationMd ?? "",
            topicTagsJson: JSON.stringify(
              Array.isArray(q.topicTags) ? q.topicTags : [],
            ),
          })
          .run();
      }
    }
    loaded++;
    console.log(`  Seeded exam: ${parsed.slug} (v${fileVersion})`);
  }
  console.log(`  Seeded ${loaded} exam${loaded === 1 ? "" : "s"}.`);
}

function seedNews() {
  const anyArticle = db.select().from(newsArticles).get();
  if (anyArticle) {
    console.log("  News already seeded, skipping.");
    return;
  }

  // Reuse the forum demo users so articles have real authors.
  const aliceId = db.select({ id: users.id }).from(users).where(eq(users.username, "alice")).get()?.id;
  const carolId = db.select({ id: users.id }).from(users).where(eq(users.username, "carol")).get()?.id;
  if (!aliceId || !carolId) {
    console.log("  Forum users missing; skipping news seed.");
    return;
  }

  const articles = [
    {
      slug: "transformers-are-not-magic",
      title: "Transformers are not magic",
      summary: "A demystifying tour of attention, told one viz at a time.",
      coverEmoji: "🪄",
      accentColor: "violet",
      authorId: aliceId,
      body: `The first time I saw self-attention written out, I thought it was a hack. *"You take three copies of the input, multiply two of them, softmax the result, and weight the third — and that's it?"*

Years later it still works that way, but I no longer think it's a hack. I think it's the simplest possible content-based router. Here's why.

::viz[attention-heatmap]

## What attention actually computes

For each token, attention asks two questions: *who else in this sequence should I look at?*, and *what should I take from them?* The first is the **score** matrix, the second is the **value** matrix. The split is so clean that you can swap one out and the other still makes sense.

When the model is well-trained, you'll see structure pop out of the heatmap above: an induction head learning to copy the previous occurrence of a token, a positional head pinned to the diagonal, a syntactic head that lights up on subjects when looking at verbs.

## Why it scales

The thing that *isn't* obvious from the formula is that attention is **embarrassingly parallel** along the sequence axis. RNNs forced you to wait for token $t-1$ before computing token $t$. Attention computes them all at once.

That's the whole story. Everything since — multi-head attention, RoPE, GQA, FlashAttention — is a refinement. Read [the attention page](/wiki/attention) for the math, or open the lesson on the ml-engineer path to play with it.`,
    },
    {
      slug: "what-tokenizers-actually-see",
      title: "What tokenizers actually see (and why it matters)",
      summary: "Tokens aren't words, and that bites you in surprising places.",
      coverEmoji: "🔤",
      accentColor: "emerald",
      authorId: carolId,
      body: `Most tutorials hand-wave past tokenization — *"the model splits the text into tokens, you don't really need to think about it"* — and then you spend the next three weeks debugging why your model can't count letters.

::viz[tokenizer-playground]

Try the playground above. Two facts that surprise people:

1. **\`" the"\` and \`"the"\` are usually different tokens.** The leading space is part of the token. This is why models occasionally misalign words at sentence boundaries.

2. **Numbers are split into chunks of 1-3 digits**, often inconsistently. \`"3.14159"\` might tokenize as \`["3", ".", "14", "159"]\` or any number of other splits. This is part of why arithmetic is hard for LLMs.

## Why subword

The naive alternatives — one token per word, or one per character — both lose. Word-level vocabularies blow up combinatorially and can't handle out-of-vocabulary words. Character-level models work but are *much* slower; you spend most of your compute predicting whitespace.

Subword tokenization (BPE, WordPiece, Unigram, SentencePiece) is the compromise: a fixed-size vocabulary where common words get a single token and rare words get split into pieces that the model has seen many times in other contexts.

## The takeaway

If your model is failing on something that involves *characters as a unit* — counting letters, reversing strings, syllable rhyming — your first hypothesis should be **the tokenization is the bug**, not the model.`,
    },
    {
      slug: "induction-heads-the-circuit-behind-in-context-learning",
      title: "Induction heads: the circuit behind in-context learning",
      summary:
        "A short paper-style walk-through of the two-attention-head circuit that drives copy-and-complete behavior in transformers.",
      coverEmoji: "🧠",
      accentColor: "indigo",
      authorId: aliceId,
      abstract:
        "**Induction heads** are a small two-layer attention circuit that explains a surprisingly large fraction of in-context learning in transformer language models. We motivate the construction, walk through the canonical (previous-token-head, induction-head) decomposition, and connect the result to the broader mechanistic-interpretability program. The aim is to give a working ML engineer a concrete circuit they can find in their own model with two probe runs.",
      coauthors: ["bob", "carol"],
      references: [
        {
          text: "Olsson et al., In-context Learning and Induction Heads (Anthropic, 2022).",
          url: "https://transformer-circuits.pub/2022/in-context-learning-and-induction-heads/index.html",
        },
        {
          text: "Elhage et al., A Mathematical Framework for Transformer Circuits (2021).",
          url: "https://transformer-circuits.pub/2021/framework/index.html",
        },
        {
          text: "Vaswani et al., Attention Is All You Need (2017).",
          url: "https://arxiv.org/abs/1706.03762",
        },
      ],
      body: `## The behavior

Show a transformer the prefix \`A B C ... A\` and it tends to predict \`B\` next [1]. The model isn't fine-tuned on this; the pattern emerges during pretraining and accounts for much of what we call *in-context learning*. The circuit responsible turns out to be small enough to draw on a napkin.

::viz[attention-heatmap]

## The two-head decomposition

The canonical induction circuit lives across two attention heads in two consecutive layers [1, 2]:

1. A **previous-token head** in layer $L$ writes \`(token at position t-1)\` into the residual stream at position $t$. This is just a lookup; you can find these heads by the diagonal-shifted-by-one attention pattern.

2. An **induction head** in layer $L+1$ then attends from the current position to *prior occurrences of the same token* — and crucially, it reads the value from one step *after* that prior occurrence, courtesy of the layer-$L$ head's left-shifted writeback.

Composed: at the second \`A\`, the induction head attends to the first \`A\`, but the value it pulls is *the thing that came after the first* \`A\` — namely \`B\`. The model has, in effect, looked up "what followed the last time I saw this?" and put the answer in the residual stream.

## Why this matters

If the residual stream is the highway and attention heads are the on-ramps, induction heads are the simplest interesting *content-based* on-ramp the model learns. Once you start looking for them, you find them in nearly every reasonably-sized pretrained transformer [1].

The broader bet of the mechanistic-interpretability program [2] is that *most* of what large models do can be similarly decomposed — that there is no fundamental obstruction to reading off the circuits, only an engineering problem of finding them. Induction heads were the first concrete piece of evidence in that direction.

## What to try next

- Probe your favourite small open model (1-3B params is plenty) for previous-token heads in early layers. Look for the off-by-one diagonal.
- Layer above those, look for heads whose attention pattern is roughly diagonal in *content space* (each row attends to the column where the same token last appeared).
- The transformer architecture introduced in [3] is the substrate for all of this; the circuit we're describing is a *learned* program, not a hard-coded operation.

The point is that "in-context learning" stops being a mysterious property of scale once you see the circuit. It's just a specific composition of two lookups.`,
    },
    {
      slug: "why-we-built-the-knowledge-mri",
      title: "Why we built the Knowledge MRI",
      summary:
        "A concept-level diagnostic that tells learners where they're strong, where they're broken, and what to do next — across every mastery path at once.",
      coverEmoji: "🧠",
      accentColor: "violet",
      authorId: carolId,
      body: `Most learning platforms tell you what *percent* of a course you've finished. That's the wrong unit. You don't care about percentages; you care about what you can do, what you can't, and where the next 30 minutes of your time should go.

The [Knowledge MRI](/me/mri) is our answer. It's a single page that aggregates everything we know about your relationship with every concept in the platform: quiz scores, completion state, active misconceptions detected by the [misconception detector](/me/weak-concepts), unresolved mistakes, flashcard retention, prerequisite gaps. One per-path heatmap and a radial summary at the top.

## What the colors mean

- **Green** — you've shown mastery (quiz score ≥ 70%).
- **Amber** — you've started but haven't crossed the bar.
- **Slate** — you haven't touched it yet.
- **Red dot** — there's an active [[misconception]] detected on this concept. Click through to be coached on it.

The drill panel on every cell tells you why that color, and picks one specific next action: coach me on this misconception, bridge from a prereq, review flashcards, start the lesson, or revisit the missed questions. It's never a list of options — it's the single most useful jump given your current state.

## What it doesn't do

The MRI doesn't grade you. It doesn't show a leaderboard. It doesn't gamify the gaps. It's a diagnostic, not a portfolio — that's why it's owner-only and lives at \`/me/mri\` rather than on your public profile.

## How it composes

Every existing surface feeds it: lesson quizzes update the per-node quiz score, the [misconception detector](https://github.com/anthropics/axiomic) writes diagnoses on wrong-answer patterns, [[flashcard]] reviews update retention. The MRI is a thin aggregator on top — there's no new schema, just new ways to look at signal that was already there.

The community-curated [misconception marketplace](/misconceptions) feeds back into the same loop: the more entries get merged, the denser the heatmap and the sharper the diagnostic.`,
    },
    {
      slug: "capstone-transcripts-are-now-signed",
      title: "Capstone transcripts are now cryptographically signed",
      summary:
        "Every capstone artifact page now ships with an ed25519-signed transcript. Anyone with our public key can verify a completion didn't get tampered with — independently of us.",
      coverEmoji: "🛡️",
      accentColor: "emerald",
      authorId: aliceId,
      body: `When a learner ships a capstone here, the artifact page becomes their public proof: who they are, what they built, which milestones they passed, what the AI grader said, what peer reviewers endorsed. As of this week, that proof is also cryptographically signed.

## What's signed

Every capstone artifact at \`/capstones/c/<slug>\` exposes a [signed transcript](/verify) you can download. The bundle contains:

1. A canonical-JSON **manifest** of the completion: capstone slug + version (we [version capstones](/capstones), so external citations can pin to a specific revision), learner username, milestones with status + score, peer-review summary, completion timestamp.
2. An **ed25519 signature** over the canonical bytes.
3. The **issuer's public key**, which is also published at \`/api/v1/keys/signing\`.

You can verify a transcript independently of us. Paste the JSON at [/verify](/verify), or run the verification yourself with any ed25519 library and our published public key. The signature covers the bytes; tampering with the manifest invalidates it.

## Why this matters

Most "verified profile" claims on learning platforms aren't verifiable. They're a database flag the platform sets, and you have to take their word for it. If the platform goes away or wants to change history, the claim doesn't survive.

A signed transcript survives both. The bytes are public; anyone can re-host them; anyone can check the signature. The capstone artifact at \`/capstones/c/<learner>-<capstone>\` becomes a portable credential.

## What's next

[Peer review](/capstones/review-queue) counts already fold into the signed manifest, so the credibility claim covers both AI grading and community endorsement. We're considering DOI-style permalinks for the artifact pages themselves so academic citation flows just work.

If you completed a capstone before this week, your existing artifact page has been retroactively signed under our current key. The signature surface is now part of the platform's contract: we can rotate the key, but old transcripts under the old key keep verifying as long as the public key is preserved.`,
    },
    {
      slug: "five-new-capstones-for-ml-engineers",
      title: "Five new capstones for ML engineers",
      summary:
        "RAG pipelines, fine-tuning, training stability, mechanistic interpretability, inference optimization. The capstone library just expanded for ML engineers ramping up on modern systems.",
      coverEmoji: "🚢",
      accentColor: "indigo",
      authorId: aliceId,
      body: `If you're an ML engineer trying to level up — or hiring one and wondering what they should be able to do — the capstone library just got a lot more useful.

Five new capstones, each ~4-6 weeks, each producing a public artifact page with a signed transcript at the end:

## [RAG pipeline from scratch](/capstones/rag-pipeline-from-scratch) (6 weeks)

Build the entire stack: chunking, embeddings, vector search, cross-encoder reranking, generation with citations, and an end-to-end evaluation harness. Five milestones. By the end, you'll have shipped a real RAG system over a corpus of your choice with a defended decision about which components mattered.

The point isn't to recreate LangChain. It's to make every architectural choice yourself so you understand the failure modes when (not if) your production RAG system breaks.

[[rag]] · [[retrieval-evaluation]] · [[function-calling]]

## [Fine-tuning and LoRA at scale](/capstones/fine-tuning-and-lora) (4 weeks)

Take a 7B-class open model. Fine-tune it three ways: full (or QLoRA), LoRA at one rank, LoRA at three ranks. Compare empirically. Decide what to ship.

The most common mistake in fine-tuning is treating it as a single-knob problem. Different ranks, different layers to adapt, different data quantities all matter. After this capstone you'll have made all those choices once and have an empirical eval table to defend each.

[[fine-tuning]] · [[lora]]

## Three more on the way

- **Training stability at scale** — diagnose and fix real training failures (NaN gradients, dead activations, learning-rate thrashing). Reproduce a small scaling-law experiment.
- **Mechanistic interpretability: induction heads** — reverse-engineer the actual circuit in a small transformer that implements in-context learning.
- **Inference optimization: KV cache + INT8 quantization** — take a small open model and make it fast enough to serve. Measure the quality-vs-speed tradeoff.

Each new capstone is wired into the [Knowledge MRI](/me/mri) — completing one updates your concept-level mastery across the prerequisite topics. And each completed capstone produces a [signed transcript](/verify) anyone can verify with our public key.

## Why these specifically

Pick 1-2 from this list and you'll see real ML engineering judgment land. RAG is the dominant LLM application pattern; fine-tuning is the dominant adaptation pattern; mech-interp is the credibility frontier. The other two are systems-level work that ML engineers running production deployments do every week.

Browse the [full capstone catalog](/capstones) or jump straight into one. Each capstone has a tiered brief — pick the depth that matches where you are.`,
    },
    {
      slug: "the-misconception-catalog-learned-about-rag-and-lora",
      title: "The misconception catalog learned about RAG, LoRA, and KV-cache",
      summary:
        "Six new entries in the misconception catalog, each on a frontier topic where engineer intuitions reliably go wrong.",
      coverEmoji: "🛠️",
      accentColor: "amber",
      authorId: aliceId,
      body: `Most of what makes a good ML engineer isn't knowing a long list of facts — it's knowing which of your intuitions are wrong. The [misconception catalog](/misconceptions) tracks the second category.

Six new entries this week, all on frontier topics:

## LoRA rank → unbounded capacity

The intuition: more rank = better adaptation. The reality: empirically, LoRA's quality curve saturates around r=16-64 for most tasks. Higher rank doesn't proportionally help. The whole point of LoRA is the low-rank assumption — that task-specific weight updates lie in a low-dimensional subspace. If you find yourself reaching for r=256 by default, you've missed the design intent.

## RAG: perfect retrieval → perfect output

The intuition: if you fix retrieval, RAG works. The reality: even with perfect retrieval, the generator can ignore retrieved context, misread it, or hallucinate beyond it. End-to-end RAG quality is the joint of retrieval AND generation. Fixing one without measuring the other is the classic 'I improved retrieval and the system still hallucinates' debugging story.

## KV-cache eliminates quadratic memory

The intuition: KV cache makes attention O(N), so long context is cheap. The reality: KV cache eliminates redundant *computation* (O(N²) → O(N) per generation step), not *memory* (still O(context × layers × heads)). At 32K context the cache can be tens of GB per request. This is why GQA and PagedAttention exist.

## FlashAttention is approximate

The intuition: FlashAttention drops some computation for speed. The reality: it computes *exact* attention. The speedup comes from IO-aware tiling that avoids materializing the full N×N attention matrix in HBM, not from any approximation.

## Chinchilla's 20:1 ratio is universal

The intuition: 20 tokens per parameter is the optimal training data ratio for any model. The reality: the ratio depends on the LR schedule and on whether you're optimizing training-only or inference-amortized cost. LLaMA-3 8B was trained on 15T tokens (~1900:1) — deliberately over-trained because the inference economics favor it.

## Mech-interp circuits are clean subgraphs

The intuition: a circuit is a small, identifiable group of attention heads + MLP neurons. The reality: superposition means individual neurons carry many features. Most circuits are distributed across many heads and layers, with each contributing partially. This is why sparse autoencoders have become the workhorse of modern mech-interp.

## How they got here

Each of these entries followed the same path: someone proposed it in the [marketplace](/misconceptions), it accumulated five upvotes, and it auto-merged into the production catalog. From there, the [misconception detector](/me/weak-concepts) starts firing on quiz mistakes that match the pattern, and the AI tutor's misconception mode probes them when learners hit them.

The catalog grows by community input. If you're confident a misconception trips up engineers and isn't yet in the catalog, [propose it](/misconceptions). Five votes from peers and it's in.`,
    },
    {
      slug: "frontier-topic-wiki-seven-new-pages",
      title: "Frontier-topic wiki: seven new pages, all with labs where they earn one",
      summary:
        "Prompt injection, retrieval evaluation, function calling, preference optimization, speculative decoding, quantization, distillation. The wiki just got the topics ML engineers actually work with daily.",
      coverEmoji: "📚",
      accentColor: "indigo",
      authorId: carolId,
      body: `When you're building production LLM systems, you don't need another transformer-architecture explainer. You need the topics nobody covers cleanly: prompt injection defenses, RAG evaluation methodology, the actual difference between DPO and PPO, what FP8 quantization gets you on H100s.

Seven new wiki pages, all three-tier (intro / undergrad / grad):

## [[prompt-injection]]

Direct vs indirect attacks; defenses (input filtering, output monitoring, sandboxing tool calls, privilege separation); why this is currently unsolvable in the strong sense and what 'defense in depth' looks like in practice. The class of bug that doesn't have a clean fix.

## [[retrieval-evaluation]]

Hit rate, MRR, nDCG, BEIR, MTEB. How to build an evaluation set without leakage. Why LLM-as-judge has biases and how to validate against human ones. The metric layer that bounds [[rag]] system quality.

## [[function-calling]]

Schema design (the description fields are the most important part). Multi-step planning loops. Error recovery. Trained vs prompted function calling. The MCP ecosystem. Where the security perimeter actually lives.

## [[preference-optimization]]

DPO, IPO, KTO, ORPO, SimPO. Why the field has largely migrated off PPO except at frontier scale. The implementation cost difference. When each variant is worth the complexity.

## [[speculative-decoding]]

The trick: small fast model proposes K tokens; big model verifies all K in parallel. The math: produces a sample from the target model's distribution exactly (not approximately). Variants: Medusa, Lookahead, EAGLE, tree-based. 2-3× speedup at zero quality cost.

## [[quantization]]

INT8 weights are nearly free. INT4 with AWQ is the production sweet spot. FP8 on H100 hardware. QLoRA for memory-constrained fine-tuning. Where the quality cost actually lands.

## [[distillation]]

Soft labels, temperature, the Hinton recipe. Modern variants: on-policy distillation, MiniLLM, Distill-Step-by-Step. What distillation transfers and what it doesn't.

## Why these specifically

Each of these is a topic where the median engineer's intuition is wrong about something specific. The wiki pages encode the things that aren't obvious. Pair them with the [misconception marketplace](/misconceptions) — every wiki page now has corresponding misconception catalog entries — and you get the negative-knowledge half of the curriculum.`,
    },
    {
      slug: "ml-engineer-ramp-up-end-to-end",
      title: "ML engineer ramp-up, end-to-end: a 12-week path through Axiomic",
      summary:
        "If you're an engineer learning modern ML systems, here's a curated 12-week path through the platform. Lessons + capstones + wiki pages, ordered. The fastest way from 'I've heard of attention' to 'I can ship a production inference stack.'",
      coverEmoji: "🗺️",
      accentColor: "emerald",
      authorId: carolId,
      body: `The platform now has enough content for a complete ML-engineer ramp-up. This article is the curated map: which lessons in which order, when to drop into a wiki page for depth, when to start which capstone.

Twelve weeks, three phases. Each phase ends with a capstone that turns the conceptual content into a defensible artifact. The whole path produces three signed transcripts at \`/verify\` and a [Knowledge MRI](/me/mri) that shows your concept-level coverage.

## Weeks 1-4: Foundations + the transformer

The goal of phase one is to understand what's actually happening inside a transformer at the math level. Not 'attention attends'; rather 'this matmul produces these gradients which update these weights.'

Lessons (in order):

1. [Tokens & embeddings](/paths/ml-engineer/lessons/tokens-basics) — what the model actually sees
2. [BPE tokenization](/paths/ml-engineer/lessons/bpe-tokenization) — the merge-pair algorithm
3. [Softmax basics](/paths/ml-engineer/lessons/softmax-basics) — the universal classifier head
4. [Self-attention intro](/paths/ml-engineer/lessons/self-attention) and [scaled dot-product](/paths/ml-engineer/lessons/attention-intro)
5. [Multi-head attention](/paths/ml-engineer/lessons/multi-head-attention) and [positional encoding](/paths/ml-engineer/lessons/positional-encoding)
6. [FFN](/paths/ml-engineer/lessons/ffn), [layer norm](/paths/ml-engineer/lessons/layer-norm), [residual connections](/paths/ml-engineer/lessons/residual-connections)
7. [Transformer block](/paths/ml-engineer/lessons/transformer-block) — putting it together

Wiki side trips: [[attention]], [[softmax]], [[layer-normalization]] for depth. Hover the [[concept-cards]] inline for previews.

**Capstone**: [Build a transformer from scratch](/capstones/transformer-from-scratch) (8 weeks if you take it slow; 4 if you focus). Output: a 2-layer transformer in numpy that trains on a copy task. You'll know exactly what each weight does.

## Weeks 5-8: Modern systems + training

Phase two: the modern recipe. RoPE, grouped-query attention, SwiGLU, AdamW, LoRA, RLHF. The lessons cover *what changed since the original transformer paper* and *why*.

Lessons:

1. [Modern architectures](/paths/ml-engineer/lessons/modern-architectures) — RoPE + GQA + SwiGLU
2. [Training objectives](/paths/ml-engineer/lessons/training-objectives) and [sampling-decoding](/paths/ml-engineer/lessons/sampling-decoding)
3. [Scaling laws](/paths/ml-engineer/lessons/scaling-laws) — Kaplan vs Chinchilla; tokens-per-parameter
4. [Fine-tuning + LoRA](/paths/ml-engineer/lessons/fine-tuning-lora) — full vs LoRA vs adapters
5. [RLHF](/paths/ml-engineer/lessons/rlhf) — the 3-stage pipeline; reward hacking; the move to DPO
6. [RAG](/paths/ml-engineer/lessons/rag) — retrieval, generation, evaluation

Wiki side trips: [[lora]], [[rlhf]], [[preference-optimization]], [[retrieval-evaluation]]. The [misconception catalog](/misconceptions) entries on LoRA rank, RAG perfect-retrieval, and Chinchilla universality are worth reading explicitly — these are the gotchas that trip up the median engineer.

**Capstone choice** (pick one): [RAG pipeline from scratch](/capstones/rag-pipeline-from-scratch) (6 weeks) if you're heading into retrieval-system territory; [Fine-tuning + LoRA](/capstones/fine-tuning-and-lora) (4 weeks) if you're heading into model adaptation; [Training stability at scale](/capstones/training-stability-at-scale) (4 weeks) if you're heading into pretraining ops.

## Weeks 9-12: Production inference + frontier topics

Phase three: shipping. The lessons here are about what runs in production — KV-caching, FlashAttention, quantization, serving. Plus the frontier-topic primers (mech interp, alignment) so you can read papers at the level they're written.

Lessons:

1. [KV-cache](/paths/ml-engineer/lessons/kv-cache) and the [flash-attention] wiki
2. [Mechanistic interpretability](/paths/ml-engineer/lessons/mechanistic-interp) — induction heads + superposition + SAEs
3. (For ai-researcher path) [Interpretability](/paths/ai-researcher/lessons/interpretability), [Alignment frontier](/paths/ai-researcher/lessons/alignment-frontier), [Emergent capabilities](/paths/ai-researcher/lessons/emergent-capabilities)

Wiki side trips: [[quantization]], [[speculative-decoding]], [[function-calling]], [[prompt-injection]]. These are the topics most production engineers operate on without ever reading a coherent treatment of.

**Capstone choice**: [Inference optimization: KV-cache + quantization](/capstones/inference-optimization-kvcache-quant) (5 weeks) is the production-systems capstone. End state: a single-GPU inference server with measured tokens-per-second, peak memory, and held-out quality across baseline → KV-cache → INT8 → both. If you're heading into a research direction instead, [Mech-interp induction heads](/capstones/mech-interp-induction-heads) (5 weeks) is the alternative.

## What you'll have at the end

Three signed transcripts. A [portfolio page](/profile) that surfaces all three. A Knowledge MRI heatmap that's emerald across the ML-engineer path. And — assuming you defended a few claim threads on your artifact pages — a public discussion record that prospective employers can read.

The platform's [coach](/me/weak-concepts) will keep flagging misconceptions as they surface. The [argument maps](/forum) will keep showing where your peers are stuck. And the [research papers](/research) keep arriving — same authoring loop, same tier toggle, same runnable cells if the paper has them.

Ship the path, then write a paper about something you noticed along the way. That's the loop.`,
    },
    {
      slug: "systems-engineer-path-launch",
      title: "Systems engineer path: from a single GPU to a serving stack",
      summary:
        "The infrastructure half of ML now has a path. Eight lessons + 16 wiki pages + two capstones covering distributed training, FSDP, vLLM, monitoring, and the production failure modes that bite teams in their first quarter at scale.",
      coverEmoji: "⚙️",
      accentColor: "sky",
      authorId: carolId,
      body: `When we started Axiomic, we wrote about the math of transformers, the architecture of attention, and the dynamics of training. Necessary content; not sufficient. About 80% of production ML practitioners spend the bulk of their time on **systems** — distributed training, GPU memory accounting, serving infrastructure, monitoring, the rollback playbook for the day everything breaks.

That content didn't exist on the platform. As of today it does.

## What landed

The new [systems engineer path](/paths/systems-engineer) covers the production-engineering stack end-to-end:

1. [GPU architecture](/paths/systems-engineer/lessons/gpu-architecture) — tensor cores, HBM, the memory-vs-compute roofline.
2. [Mixed precision](/paths/systems-engineer/lessons/mixed-precision-training) — bf16, fp16, fp8 + when each is the right call.
3. [Data parallelism](/paths/systems-engineer/lessons/data-parallelism) — DDP, NCCL, scaling efficiency.
4. [Model parallelism + FSDP](/paths/systems-engineer/lessons/model-parallelism) — when DDP isn't enough.
5. [MLOps + experiment tracking](/paths/systems-engineer/lessons/mlops-experiment-tracking) — the discipline that turns research-style runs into a reproducible lineage.
6. [Inference serving](/paths/systems-engineer/lessons/inference-serving) — vLLM, PagedAttention, continuous batching.
7. [Monitoring + observability](/paths/systems-engineer/lessons/monitoring-observability) — drift, online eval, SLOs.
8. [Production failure modes](/paths/systems-engineer/lessons/production-failure-modes) — the playbook for when reality hits.

Plus 16 new wiki pages covering each subsystem in three-tier depth, six new misconceptions catching the median engineer's wrong intuitions, a survey paper on the [serving-stack frontier](/research/serving-stack-frontier-2026), and a new [systems forum domain](/forum/systems) for discussion.

## Two capstones

[Build a serving stack](/capstones/build-a-serving-stack) (5 weeks): implement a production-grade LLM inference server with KV cache management + continuous batching + monitoring. Benchmark against vLLM. Output: a public artifact showing where you matched it, where you didn't, and which optimizations account for the gaps.

[Distributed training experiment](/capstones/distributed-training-experiment) (4 weeks): scale the same training run from one GPU through DDP, FSDP, and FSDP+offload on multi-GPU hardware. Measure the throughput-vs-memory Pareto frontier. Recommend a strategy for hypothetical 1B / 7B / 70B models.

Both produce signed transcripts that paint a defensible picture of "this engineer can run a production ML system" — exactly the credential that's hard to demonstrate from a degree alone.

## Why it matters

Hiring managers tell us this is the gap they have the hardest time filling. There's no shortage of candidates who can train a transformer. There's a real shortage of candidates who can keep one running in production: diagnose an OOM at scale, recover from a NaN training spike at step 47000, design a rollback procedure that takes minutes instead of hours.

The systems-engineer path is built around exactly those scenarios. The capstones produce the receipts. The misconceptions surface the wrong intuitions before they bite.

For ML engineers ramping up: pair this path with the existing [ML engineer ramp-up](/news/ml-engineer-ramp-up-end-to-end) content. Foundation + frontier topics + production engineering — the stack that gets you from "I trained a model" to "I shipped one and kept it running."`,
    },
    {
      slug: "rl-foundations-path-launch",
      title: "RL foundations: from MDPs to PPO, then onward to RLHF",
      summary:
        "The missing ladder for understanding modern RL. Ten lessons + 15 wiki pages walk you from MDP fundamentals through value functions, TD learning, policy gradients, actor-critic, PPO, exploration, and model-based RL — ending at RLHF for language model alignment.",
      coverEmoji: "🎯",
      accentColor: "rose",
      authorId: carolId,
      body: `RLHF is famous; the foundations that make it work are not. Most ML engineers can recite "PPO + reward model + KL penalty" without being clear on what the policy gradient theorem says, why GAE matters, or what TRPO solved that PPO simplified. The new [reinforcement-learner path](/paths/reinforcement-learner) supplies that ladder.

## What landed

Ten lessons covering the full RL conceptual stack:

1. [MDP foundations](/paths/reinforcement-learner/lessons/mdp-foundations) — states, actions, rewards, the discount factor.
2. [Value functions](/paths/reinforcement-learner/lessons/value-functions) — V, Q, the Bellman equation.
3. [Dynamic programming](/paths/reinforcement-learner/lessons/dynamic-programming-rl) — value iteration, policy iteration when you know the model.
4. [Temporal difference learning](/paths/reinforcement-learner/lessons/temporal-difference) — Q-learning, SARSA, DQN.
5. [Policy gradients](/paths/reinforcement-learner/lessons/policy-gradients) — REINFORCE and GAE.
6. [Actor-critic](/paths/reinforcement-learner/lessons/actor-critic) — combining the two.
7. [PPO and TRPO](/paths/reinforcement-learner/lessons/ppo-trpo) — the trust-region family.
8. [Exploration vs exploitation](/paths/reinforcement-learner/lessons/exploration-exploitation) — the practical wall.
9. [Model-based RL](/paths/reinforcement-learner/lessons/model-based-rl) — Dreamer, MuZero, sample efficiency.
10. [RLHF and beyond](/paths/reinforcement-learner/lessons/rl-from-human-feedback) — bringing it back to LLMs.

Plus 15 new wiki pages covering each subsystem, 5 new misconceptions, a survey paper on the [policy-optimization frontier in 2026](/research/pg-vs-trust-region-2026), and a new [RL forum domain](/forum/rl).

## The capstone

[Solve CartPole and LunarLander from scratch](/capstones/solve-cartpole-from-scratch) (4 weeks): implement REINFORCE → REINFORCE+baseline → A2C → PPO from numpy + PyTorch. End with a working PPO that solves CartPole in <30k steps and LunarLander in <1M. Compare against \`stable-baselines3\` on the same hyperparameters.

The capstone produces a public artifact showing your PPO matched (or didn't quite match) the reference implementation, with a defensible analysis of which engineering details account for any gap. The signed transcript is the credential — you've built the modern RL workhorse from scratch and understand exactly why each component is there.

## Why it matters now

RLHF training compute is one of the largest deployment classes of RL today. ChatGPT, Claude, Gemini all run modified PPO in their alignment loops. Without the foundations — what's a value function, why does the policy gradient theorem work, what does GAE buy you — RLHF is folklore.

This path supplies the foundations. Combined with the existing ml-engineer path's RLHF lesson, you've got the full ladder from MDPs through frontier-scale alignment.

For learners on the [AI Researcher path](/paths/ai-researcher): this is the missing prereq. Read the RL foundations alongside the alignment-frontier lesson; pair the capstone with the ai-researcher's evaluation-rigor and interpretability lessons.`,
    },
    {
      slug: "multimodal-path-launch",
      title: "Multimodal path: ViTs, CLIP, diffusion, and the modern VLM stack",
      summary:
        "Widening the platform from text-only LLMs to vision, audio, and multimodal. Nine lessons + 13 wiki pages cover ViTs, CLIP, diffusion, classifier-free guidance, audio + Whisper, and the multimodal-fusion design space.",
      coverEmoji: "🖼️",
      accentColor: "violet",
      authorId: carolId,
      body: `Modern ML is no longer text-only. ViTs, CLIP, Stable Diffusion, GPT-4V — the multimodal frontier is where most production AI work happens. The new [multimodal-engineer path](/paths/multimodal-engineer) covers it.

## What landed

Nine lessons covering the full multimodal stack:

1. [Image foundations](/paths/multimodal-engineer/lessons/image-foundations) — pixels, channels, convolutions.
2. [Vision Transformers](/paths/multimodal-engineer/lessons/vision-transformers) — ViT, patch embeddings.
3. [Contrastive learning](/paths/multimodal-engineer/lessons/contrastive-learning) — InfoNCE, SimCLR, MoCo.
4. [CLIP and VLMs](/paths/multimodal-engineer/lessons/clip-and-vlms) — joint embedding spaces, modern VLMs.
5. [Diffusion models](/paths/multimodal-engineer/lessons/diffusion-models) — forward + reverse, score matching.
6. [Text-to-image](/paths/multimodal-engineer/lessons/text-to-image) — Stable Diffusion + classifier-free guidance.
7. [Audio + speech](/paths/multimodal-engineer/lessons/audio-and-speech) — spectrograms, Whisper, modern TTS.
8. [Multimodal fusion](/paths/multimodal-engineer/lessons/multimodal-fusion) — early vs late vs cross-attention.
9. [Multimodal evaluation](/paths/multimodal-engineer/lessons/multimodal-evaluation) — benchmarks + hallucination probes.

Plus 13 new wiki pages, 6 new misconceptions, a survey paper on the [multimodal-fusion frontier in 2026](/research/multimodal-fusion-frontier-2026), and a new [multimodal forum domain](/forum/multimodal).

## Two capstones

[Train a Vision Transformer from scratch](/capstones/train-a-vit-from-scratch) (5 weeks): implement ViT-Tiny on CIFAR-10, compare against CNN, do MAE pretraining, scale to ImageNet-100. Output: an empirical analysis of when each architecture wins.

[Build a CLIP-style image-text retriever](/capstones/clip-style-retriever) (4 weeks): dual-encoder + InfoNCE on COCO Captions. Hard-negative mining, retrieval eval at scale (Recall@K, MRR), working similarity-search demo.

## Why it matters now

Vision and multimodal are no longer optional for the modern ML engineer. Every team eventually has to handle images, screenshots, documents, charts, video frames. Understanding the architecture (ViT + CLIP + VLMs + diffusion) is the foundation for shipping any multimodal application.

For learners on the ml-engineer path: this is the natural extension. Multimodal is built on the transformer + attention foundations you already know; the vision-specific concepts (patches, contrastive pretraining, latent diffusion) layer on top.

For learners on the [Reinforcement Learner path](/paths/reinforcement-learner): VLMs and RLHF combine — modern multimodal alignment uses RLHF with image conditioning. The two paths complement.`,
    },
    {
      slug: "comp-bio-path-launch",
      title: "Computational biology path: from sequence alignment to AlphaFold",
      summary:
        "ML × biology gets its own path. Nine lessons + 13 wiki pages cover DNA/RNA/protein, sequence alignment, AlphaFold, protein language models, single-cell genomics, and molecular dynamics. The most differentiated cross-domain on the platform.",
      coverEmoji: "🧬",
      accentColor: "emerald",
      authorId: carolId,
      body: `The 2020 AlphaFold breakthrough opened a new era for biology. Protein structure prediction — open for 50 years — was effectively solved. Since then, the field has expanded: ESM-3 generates novel functional proteins; single-cell foundation models embed millions of cells; AlphaFold 3 extends to multi-molecule complexes. The new [comp-biologist path](/paths/comp-biologist) covers it.

## What landed

Nine lessons covering the modern bio-ML stack:

1. [DNA, RNA, Protein](/paths/comp-biologist/lessons/dna-rna-protein) — the central dogma + computational representation.
2. [Sequence alignment](/paths/comp-biologist/lessons/sequence-alignment) — Smith-Waterman, BLAST, MSA.
3. [Phylogenetics](/paths/comp-biologist/lessons/phylogenetics) — distance methods, ML phylogenetics, evolutionary trees.
4. [Protein structure](/paths/comp-biologist/lessons/protein-structure) — primary, secondary, tertiary, quaternary.
5. [AlphaFold](/paths/comp-biologist/lessons/alphafold) — Evoformer, structure module, MSA.
6. [Protein language models](/paths/comp-biologist/lessons/protein-language-models) — ESM, masked-residue pretraining.
7. [Single-cell RNA-seq](/paths/comp-biologist/lessons/single-cell-rna-seq) — scRNA-seq, dimensionality reduction, foundation models.
8. [Molecular dynamics](/paths/comp-biologist/lessons/molecular-dynamics) — force fields, ML potentials.
9. [Bio-ML evaluation](/paths/comp-biologist/lessons/bio-ml-evaluation) — CASP, contamination, leakage.

Plus 13 new wiki pages, 6 new misconceptions, a survey paper on the [bio-ML state of the art in 2026](/research/bio-ml-state-of-art-2026), and a new [bio forum domain](/forum/bio).

## The capstone

[Build a protein language model from scratch](/capstones/build-a-protein-language-model) (6 weeks): train a small ESM-style protein LM via masked-residue prediction. Use it for variant effect prediction + functional embedding extraction. Compare against ESM-2.

The output is a public artifact showing your protein LM matched (or didn't quite match) ESM-2 on specific tasks, with engineering analysis of the gaps. Defensible bio-ML credential.

## Why this path is different

Compared to the other six paths (ml-engineer, ai-researcher, mathematician, physicist, systems-engineer, reinforcement-learner, multimodal-engineer), comp-bio is the most domain-specific. Concepts like sequence alignment, phylogenetics, and protein structure are biology-specific; methods like AlphaFold are bio-ML-specific.

But the ML substrate is the same: transformers, attention, contrastive learning, foundation models, careful evaluation. Bio-ML is what happens when modern ML methods meet biology's specific data structures + biological priors.

For learners interested in cross-domain ML: comp-bio is one of the highest-leverage application areas. Frontier-class progress (AlphaFold, ESM-3, scGPT) happens at the intersection of ML scaling laws + biological data + biology-specific adaptations.

## What this completes

This is the fourth and final new mastery path of the S55-S58 batch. From [systems engineer](/news/systems-engineer-path-launch) through [RL foundations](/news/rl-foundations-path-launch) to [multimodal](/news/multimodal-path-launch) and now comp-bio, the platform has 7 mastery paths covering the modern ML practitioner's toolkit end-to-end.`,
    },
    {
      slug: "applied-stats-path-launch",
      title: "Applied Statistics path: the substrate ML evaluation actually needs",
      summary:
        "A new mastery path covering the production-statistics toolkit: hypothesis testing, A/B experiments, sequential analysis, calibration, fairness. The discipline that separates ML papers that replicate from those that don't.",
      coverEmoji: "📊",
      accentColor: "sky",
      authorId: aliceId,
      body: `Most ML failures in production aren't from bad models. They're from sloppy evaluation. The new [applied-statistician path](/paths/applied-statistician) covers the production-statistics toolkit that makes ML decisions defensible.

## What landed

Eight lessons spanning the frequentist + Bayesian + experiment-design + uncertainty + fairness toolkit:

1. [Frequentist foundations](/paths/applied-statistician/lessons/frequentist-foundations) — sampling distributions, MLE, the bootstrap.
2. [Hypothesis testing](/paths/applied-statistician/lessons/hypothesis-testing) — p-values, Type I / II errors, multiple-testing correction.
3. [Bayesian inference](/paths/applied-statistician/lessons/bayesian-inference) — priors, posteriors, MCMC, when to go Bayesian.
4. [Experiment design](/paths/applied-statistician/lessons/experiment-design) — power analysis, randomization, blocking, stratification.
5. [A/B testing](/paths/applied-statistician/lessons/ab-testing) — sequential testing, peeking bias, HTE, OEC.
6. [Causal inference basics](/paths/applied-statistician/lessons/causal-inference-basics) — counterfactuals, RCTs, observational methods.
7. [Uncertainty quantification](/paths/applied-statistician/lessons/uncertainty-quantification) — calibration, conformal prediction, Bayesian deep learning.
8. [Bias & fairness](/paths/applied-statistician/lessons/bias-and-fairness) — demographic parity, equalized odds, the impossibility theorem.

Plus 22 new wiki pages — [p-value](/wiki/p-value), [bootstrap](/wiki/bootstrap), [MCMC](/wiki/mcmc), [power analysis](/wiki/power-analysis), [sequential testing](/wiki/sequential-testing), [conformal prediction](/wiki/conformal-prediction), [demographic parity](/wiki/demographic-parity), and 15 more — providing the densest reference cluster on the platform. Six new misconceptions cover the high-impact mistakes (p-value as P(null | data), peeking with Bonferroni, calibration ≠ accuracy, …). A new [applied-statistics forum domain](/forum/stats) gives discussion a home.

## The capstone

[Design and Run a Real A/B Test](/capstones/design-and-run-an-ab-test) (5 weeks): one full A/B-test artifact, defensible against a senior statistician's review.

Five milestones — hypothesis + power analysis → randomization design → sequential-testing protocol → analysis with multiple-testing protection → final decision report. By the end you have a single portfolio piece that demonstrates you can frame a hypothesis, choose an MDE, design randomization, run sequential testing without inflating Type I error, interpret confidence intervals correctly, and defend a production decision.

## Why this path is different

Compared to the seven other paths (ml-engineer, ai-researcher, mathematician, physicist, systems-engineer, reinforcement-learner, multimodal-engineer, comp-biologist), applied-statistician is the most universally applicable. Every ML team needs it. Most teams don't have it.

The mathematician path covers theory; this path covers the production-flavored applications: how to run an A/B test that won't reverse when run longer, how to report calibration alongside accuracy, how to audit fairness without falling for the impossibility theorem. It's where applied stats meets ML evaluation in the wild.

## The evaluation rigor frontier

For the broader picture of where the field is heading, see the new survey paper: [The Evaluation Rigor Frontier 2026](/research/evaluation-rigor-frontier-2026). Where sequential testing, calibration, and fairness have converged, where they haven't, and where the next decade probably lands.`,
    },
    {
      slug: "causality-path-launch",
      title: "Causality path: from correlation-vs-causation to do-calculus and causal forests",
      summary:
        "A new mastery path covering Pearl-style causal inference end-to-end: DAGs, d-separation, do-calculus, RCTs, instrumental variables, mediation, heterogeneous treatment effects, causal discovery. The discipline that turns observational correlations into actionable claims.",
      coverEmoji: "🔗",
      accentColor: "violet",
      authorId: aliceId,
      body: `Most ML predictions answer the wrong question. \`P(Y | X)\` is correlational; \`P(Y | do(X))\` is causal. They differ whenever there's confounding — almost always in observational data. The new [causal-scientist path](/paths/causal-scientist) covers the discipline that distinguishes them.

## What landed

Nine lessons spanning the modern causal-inference toolkit:

1. [Correlation vs Causation](/paths/causal-scientist/lessons/correlation-vs-causation) — why the slogan matters in production ML.
2. [Potential Outcomes](/paths/causal-scientist/lessons/potential-outcomes) — Rubin's framework, ATE/ATT, the fundamental problem.
3. [DAGs and d-Separation](/paths/causal-scientist/lessons/dags-and-d-separation) — Pearl's framework, conditional independencies, the backdoor criterion.
4. [Do-Calculus](/paths/causal-scientist/lessons/do-calculus) — the do-operator, the three rules, identifiability.
5. [RCTs and Quasi-Experiments](/paths/causal-scientist/lessons/rcts-and-quasi-experiments) — when to randomize and when you can't.
6. [Instrumental Variables](/paths/causal-scientist/lessons/instrumental-variables) — 2SLS, the exclusion restriction, LATE.
7. [Mediation Analysis](/paths/causal-scientist/lessons/mediation-analysis) — direct + indirect effects, identifiability assumptions.
8. [Heterogeneous Treatment Effects](/paths/causal-scientist/lessons/heterogeneous-treatment-effects) — meta-learners, causal forests, uplift modeling.
9. [Causal Discovery](/paths/causal-scientist/lessons/causal-discovery) — PC, FCI, NOTEARS, LiNGAM. What can and can't be learned.

Plus 22 new wiki pages — [DAG](/wiki/dag), [d-separation](/wiki/d-separation), [backdoor criterion](/wiki/backdoor-criterion), [do-operator](/wiki/do-operator), [identifiability](/wiki/identifiability), [instrumental variable](/wiki/instrumental-variable), [exclusion restriction](/wiki/exclusion-restriction), [HTE](/wiki/hte), [causal forests](/wiki/causal-forests), [PC algorithm](/wiki/pc-algorithm), [FCI algorithm](/wiki/fci-algorithm), and 11 more — providing dense reference coverage for every concept in the path. Six new misconceptions cover the high-impact mistakes (regression-with-controls is causal, DAG must fit data, IV estimates ATE, randomization fixes everything, mediation is just controlling for the mediator, causal discovery finds truth). A new [causal forum domain](/forum/causal) gives discussion a home.

## The capstone

[Run a Defensible Causal Analysis on Observational Data](/capstones/run-a-causal-analysis) (7 weeks): one full observational causal analysis, defensible against a senior epidemiologist's review.

Six milestones: research question + data audit → DAG + identifying expression → multiple-estimator analysis (regression + IPW + doubly-robust + causal forest) → HTE analysis with multiple-testing protection → sensitivity analysis (E-values, placebo tests) → final defense report. By the end you have one portfolio piece demonstrating you can do real causal inference, not just regression-with-controls.

## Why this path is different

Compared to the [applied-statistician path](/paths/applied-statistician), this path goes deeper into causal-specific methodology. Applied stats has a 'causal inference basics' node; the causal-scientist path is for practitioners who actually need to identify causal effects from observational data and defend the result.

For ML practitioners specifically: the gap between 'my model predicts well' and 'this prediction is causally meaningful' is the entire content of this path. ML accuracy metrics are silent on causality. Causal-aware ML methods (DML, causal forests, meta-learners, causal-aware mech-interp) are what bridge the two. This path covers the foundations + the modern frontier.

## Where the field is going

For the broader picture, see the new survey: [Causal Inference and ML in 2026: The Two Disciplines That Have Started Talking](/research/causal-inference-and-ml-2026). Three convergence trends (DML, causal forests + meta-learners, mech-interp + causal-discovery), 2035 predictions, recommended reading.`,
    },
    {
      slug: "robotics-path-launch",
      title: "Robotics + Control path: from PID to embodied AI",
      summary:
        "A new mastery path covering classical control through modern ML-driven robotics: PID, state-space, Kalman filters, SLAM, motion planning, manipulation, sim-to-real, and end-to-end VLA policies. The other half of the embodied-AI stack.",
      coverEmoji: "🤖",
      accentColor: "emerald",
      authorId: carolId,
      body: `LLMs handle language; vision models handle images; robotics handles the messy intersection of perception + reasoning + action in the physical world. The 2022-2026 stretch saw foundation models (RT-2, OpenVLA, π-0) bring transformer-scale generalization to robotics. The new [roboticist path](/paths/roboticist) covers everything from PID through the embodied-AI frontier.

## What landed

Nine lessons spanning the modern robotics stack:

1. [Control Foundations](/paths/roboticist/lessons/control-foundations) — PID, feedback loops, stability.
2. [State-Space Control](/paths/roboticist/lessons/state-space-control) — state-space, linear systems, LQR.
3. [Estimation & Filtering](/paths/roboticist/lessons/estimation-and-filtering) — Kalman, EKF, particle filters.
4. [SLAM](/paths/roboticist/lessons/slam) — simultaneous localization + mapping; factor graphs; loop closure.
5. [Motion Planning](/paths/roboticist/lessons/motion-planning) — RRT, A*, trajectory optimization.
6. [Manipulation](/paths/roboticist/lessons/manipulation) — forward + inverse kinematics, grasp planning, dexterous manipulation.
7. [Sim-to-Real](/paths/roboticist/lessons/sim-to-real) — domain randomization, system ID, real-world fine-tuning.
8. [Learning-Based Control](/paths/roboticist/lessons/learning-based-control) — imitation learning, model-based RL, diffusion policies, VLAs.
9. [Embodied AI Frontier](/paths/roboticist/lessons/embodied-ai-frontier) — RT-X, OpenVLA, π-0, the foundation-models-for-robotics era.

Plus 22 new wiki pages — [PID control](/wiki/pid-control), [Kalman filter](/wiki/kalman-filter), [SLAM](/wiki/slam), [factor graphs](/wiki/factor-graphs), [RRT](/wiki/rrt), [forward kinematics](/wiki/forward-kinematics), [domain randomization](/wiki/domain-randomization), [diffusion policy](/wiki/diffusion-policy), [VLAs](/wiki/vision-language-action), and 13 more — providing dense reference coverage for every concept in the path. Six new misconceptions cover the high-impact mistakes (PID tuning is just art, Kalman handles everything, SLAM is solved, sim-to-real = wide DR, IL is just supervised learning, VLAs replace classical control). A new [robotics forum domain](/forum/robotics) gives discussion a home.

## The capstone

[Build a Mobile Manipulator](/capstones/build-a-mobile-manipulator) (10 weeks): end-to-end robot system, simulation through hardware (or hardware-in-the-loop).

Seven milestones: robot design + simulation → low-level control + IK → SLAM + estimation → motion planning → perception + grasping → sim-to-real protocol → end-to-end task. By the end you have one full mobile-manipulator artifact: working code, simulation videos, real (or HIL) hardware demos, defended report. Portfolio-worthy.

## Why this path is different

Robotics is the discipline where control + estimation + planning + ML + hardware all interact. Most ML practitioners never touch this — but the embodied-AI revolution (foundation-model VLAs, humanoid platforms, dexterous manipulation) makes it increasingly important.

This path doesn't replace dedicated robotics curricula. It bridges the ML practitioner's perspective with classical robotics: enough theory to read papers + understand systems, enough practice to build something real.

For ML practitioners specifically: this is where 'foundation models do everything' meets 'physics, hardware, and real-time constraints don't care about your transformer.' The hybrid stack (classical control + ML perception + ML high-level reasoning) is the production reality.

## The frontier

For where the field is heading, see the new survey: [The Robotics Frontier in 2026: Foundation Models Meet Classical Control](/research/robotics-frontier-2026). Scaling laws for robotics, hybrid production stacks, persistent gaps in dexterous + long-horizon manipulation, 2030 forecast.

## What's next on the platform

This is the last new mastery path in the S55-S61 batch. The platform now has 11 mastery paths covering ml-engineer, ai-researcher, mathematician, physicist, systems-engineer, reinforcement-learner, multimodal-engineer, comp-biologist, applied-statistician, causal-scientist, and roboticist. End-to-end coverage from foundations through frontier across the modern ML + applied-stats + robotics practitioner's toolkit.`,
    },
    {
      slug: "quantum-engineer-path-launch",
      title: "Quantum Engineer path: from qubits to NISQ + variational + QML",
      summary:
        "A new mastery path covering quantum computing end-to-end: qubits, gates, entanglement, Grover, Shor, error correction, NISQ-era variational methods, and quantum machine learning.",
      coverEmoji: "⚛️",
      accentColor: "violet",
      authorId: aliceId,
      body: `Quantum computing has been '10 years away' for 50 years. The 2022-2026 stretch may finally be the breakthrough — or another false dawn. Quantum supremacy demonstrated multiple times; fault-tolerant logical qubits emerging; cryptanalytic Shor remains decades away but drives PQC migration NOW. The new [quantum-engineer path](/paths/quantum-engineer) covers the discipline that handles 'when does this become real'.

## What landed

Nine lessons spanning qubits through quantum machine learning:

1. [Quantum Foundations](/paths/quantum-engineer/lessons/quantum-foundations) — qubits, superposition, measurement.
2. [Quantum Gates](/paths/quantum-engineer/lessons/quantum-gates) — Hadamard, CNOT, universal gate sets, circuits.
3. [Entanglement](/paths/quantum-engineer/lessons/entanglement) — Bell states, no-cloning theorem, the resource powering advantage.
4. [Quantum Algorithms](/paths/quantum-engineer/lessons/quantum-algorithms) — Deutsch-Jozsa, QFT, phase estimation.
5. [Grover's Algorithm](/paths/quantum-engineer/lessons/grover-search) — quadratic speedup for unstructured search.
6. [Shor's Algorithm](/paths/quantum-engineer/lessons/shor-factoring) — polynomial-time factoring, the cryptanalytic threat.
7. [Quantum Error Correction](/paths/quantum-engineer/lessons/quantum-error-correction) — surface code, fault-tolerance, magic state distillation.
8. [NISQ Era + Mitigation](/paths/quantum-engineer/lessons/nisq-era) — current hardware noise, error mitigation, what's possible today.
9. [Variational Algorithms + QML](/paths/quantum-engineer/lessons/variational-and-qml) — VQE, QAOA, quantum machine learning, the frontier.

Plus 22 new wiki pages — [qubit](/wiki/qubit), [Bloch sphere](/wiki/bloch-sphere), [Hadamard gate](/wiki/hadamard-gate), [CNOT gate](/wiki/cnot-gate), [QFT](/wiki/quantum-fourier-transform), [phase estimation](/wiki/phase-estimation), [Grover's algorithm](/wiki/grover-algorithm), [Shor's algorithm](/wiki/shor-algorithm), [post-quantum cryptography](/wiki/post-quantum-cryptography), [surface code](/wiki/surface-code), [VQE](/wiki/vqe), [QAOA](/wiki/qaoa), and 10 more. Six misconceptions cover the high-impact mistakes (qubit is just a probabilistic bit; quantum tries all paths in parallel; entanglement allows FTL; quantum breaks all cryptography; more qubits = more powerful; QML revolutionizes ML). A new [quantum forum domain](/forum/quantum) gives discussion a home.

## The capstone

[Build and Benchmark a Quantum Algorithm](/capstones/build-and-benchmark-a-quantum-algorithm) (6 weeks): one quantum algorithm taken end-to-end through theory, simulator, real hardware (free tiers available), noise characterization, error mitigation, and honest classical comparison.

Six milestones: theoretical analysis → simulator scaling → real-hardware execution → noise characterization → error mitigation → defended report with classical baseline. The output is a portfolio-worthy artifact demonstrating real quantum-computing engineering, not just textbook knowledge.

## Why this path is different

Compared to the 11 prior paths, the quantum path bridges physics + computer science + complexity theory. The most distinct cross-domain on the platform.

For ML practitioners: quantum machine learning is mostly hype today, but understanding the framework matters. Cryptanalysis (Shor) drives post-quantum-cryptography migration NOW.

For researchers: quantum is one of the few computing frontiers where genuine new physics + algorithms keep emerging.

## The honest 2026 message

For where the field is heading, see the new survey: [The Quantum Computing Frontier in 2026: NISQ to Fault-Tolerance](/research/quantum-frontier-2026). Quantum supremacy demonstrated; quantum advantage on useful problems still elusive; fault-tolerance approaching but not yet here. Realistic 2030-2040 forecast.

## What this completes

The platform now has 12 mastery paths covering ML, foundations, systems, and cross-domain frontiers. End-to-end coverage from first principles through cutting-edge research across the modern computational practitioner's toolkit.`,
    },
    {
      slug: "game-theorist-path-launch",
      title: "Game Theorist path: from Nash to multi-agent RL + alignment",
      summary:
        "A new mastery path covering game theory end-to-end: zero-sum + Nash, sequential + Bayesian games, cooperative + Shapley, mechanism design + auctions, multi-agent RL, and alignment-as-game-theory.",
      coverEmoji: "♟️",
      accentColor: "violet",
      authorId: aliceId,
      body: `Game theory is the missing connector between three existing paths: reinforcement-learner, ai-researcher, and applied-statistician. Multi-agent RL converges to *what* exactly? Reward hacking is which kind of equilibrium? Alignment is a principal-agent problem at scale. The new [game-theorist path](/paths/game-theorist) supplies the connecting language.

## What landed

Nine lessons spanning zero-sum games through alignment-as-game-theory:

1. [Zero-sum games](/paths/game-theorist/lessons/zero-sum-games) — payoff matrices, minimax theorem, the cleanest case.
2. [Nash equilibrium](/paths/game-theorist/lessons/nash-equilibrium) — best responses, mixed strategies, Nash's existence theorem.
3. [Sequential games](/paths/game-theorist/lessons/sequential-games) — extensive form, backward induction, subgame perfection.
4. [Bayesian games](/paths/game-theorist/lessons/bayesian-games) — incomplete information, types, Harsanyi's transformation.
5. [Cooperative games](/paths/game-theorist/lessons/cooperative-games) — coalitions, the core, Shapley value (= SHAP for ML).
6. [Mechanism design](/paths/game-theorist/lessons/mechanism-design) — designing rules so equilibria produce desired outcomes.
7. [Auction theory](/paths/game-theorist/lessons/auction-theory) — VCG, second-price, online ad auctions.
8. [Multi-agent RL](/paths/game-theorist/lessons/multi-agent-rl) — self-play, PSRO, league play, and where convergence guarantees apply.
9. [Alignment as game theory](/paths/game-theorist/lessons/alignment-game-theory) — principal-agent problems, mesa-optimization, mechanism design for AI training.

Plus 13 new wiki pages — [zero-sum](/wiki/zero-sum), [minimax](/wiki/minimax), [Nash equilibrium](/wiki/nash-equilibrium), [mixed strategy](/wiki/mixed-strategy), [extensive form](/wiki/extensive-form), [subgame perfect](/wiki/subgame-perfect), [Bayesian game](/wiki/bayesian-game), [Shapley value](/wiki/shapley-value), [the core](/wiki/core-solution), [mechanism design](/wiki/mechanism-design), [revelation principle](/wiki/revelation-principle), [auction theory](/wiki/auction-theory), [VCG auction](/wiki/vcg-auction), [multi-agent RL](/wiki/multi-agent-rl), [self-play](/wiki/self-play), [principal-agent](/wiki/principal-agent), [incomplete info](/wiki/incomplete-info). Five misconceptions cover the high-impact gaps (Nash ≠ Pareto, dominance is the exception not the rule, VCG ≠ revenue-optimal, MARL self-play ≠ Nash convergence, truthful ≠ collusion-proof). A new [game-theory forum domain](/forum/game-theory) gives discussion a home.

## The capstone

[Build a Multi-Agent RL Tournament](/capstones/build-a-multi-agent-rl-tournament) (4 weeks): a structured progression from tabular Nash + LP solver through REINFORCE self-play, A2C on a stochastic game, and PPO + opponent modeling on a Bayesian game. Each milestone produces working code + a quantitative convergence + cycling diagnostic + a tournament report.

## Why this matters

Compared to the 12 prior paths, the game-theorist path is the **incentives layer** that the rest assume exists. Multi-agent RL makes no sense without [[nash-equilibrium]]. Alignment is a [[mechanism-design]] problem. RLHF is implicit Bayesian persuasion. Reward hacking is Goodhart's law in equilibrium form.

For ML practitioners: this is the missing 5% of theory that makes the rest of the work cohere.

For researchers: the intersection of game theory + alignment is one of the most active areas of AI safety theory.

## The honest 2026 message

For the deep dive on multi-agent RL convergence: [Multi-Agent RL in 2026: Self-Play, PSRO, and the Convergence Question](/research/multi-agent-rl-frontier-2026). Two-player zero-sum is solved; general-sum is engineering-heavy without convergence guarantees; cooperative MARL has strong empirical results via CTDE. Theoretical convergence for general-sum remains open.

## What this completes

The platform now has 13 mastery paths. The game-theorist path is the connector — it bridges reinforcement-learner (multi-agent), ai-researcher (alignment), comp-biologist (evolutionary games), and applied-statistician (mechanism design). End-to-end coverage from first principles through cutting-edge research across the modern computational practitioner's toolkit, including the strategic-interaction half that the rest assume exists.`,
    },
    {
      slug: "algorithms-engineer-path-launch",
      title: "Algorithms Engineer path: from asymptotic analysis to NP-completeness",
      summary:
        "A new mastery path covering CS foundations end-to-end: Big-O, hashing, sorting, trees, graph algorithms, dynamic programming, P vs NP, approximation + randomized algorithms.",
      coverEmoji: "🧮",
      accentColor: "amber",
      authorId: aliceId,
      body: `Every other path on Axiomic implicitly assumes you can read a complexity bound + know what a hash table is. The new [algorithms-engineer path](/paths/algorithms-engineer) makes that foundation explicit. Universal CS spine for ML engineers, researchers, mathematicians, systems engineers, and anyone else who needs to ship code that scales.

## What landed

Nine lessons spanning asymptotic analysis through approximation algorithms:

1. [Asymptotic analysis](/paths/algorithms-engineer/lessons/asymptotic-analysis) — Big-O, Big-Theta, Big-Omega; the language of scalability.
2. [Arrays & hashing](/paths/algorithms-engineer/lessons/arrays-and-hashing) — hash tables, collisions, why O(1) is conditional.
3. [Sorting algorithms](/paths/algorithms-engineer/lessons/sorting-algorithms) — quicksort, mergesort, heapsort, the n log n lower bound.
4. [Trees & linked structures](/paths/algorithms-engineer/lessons/linked-structures) — BSTs, AVL/red-black, B-trees, tries.
5. [Graph algorithms](/paths/algorithms-engineer/lessons/graph-algorithms) — BFS, DFS, Dijkstra, A*, MST. The patterns behind GPS + dependency resolvers.
6. [Dynamic programming](/paths/algorithms-engineer/lessons/dynamic-programming) — optimal substructure, memoization vs tabulation, the algorithm-design pattern that solves what brute-force can't.
7. [Greedy + divide & conquer](/paths/algorithms-engineer/lessons/greedy-and-divide-conquer) — when greedy works, when divide-and-conquer is the right framing.
8. [P, NP, and NP-completeness](/paths/algorithms-engineer/lessons/np-complete) — polynomial time, nondeterminism, reductions, intractability.
9. [Approximation + randomized algorithms](/paths/algorithms-engineer/lessons/approximation-randomized) — when exact is out of reach, what's still provably good.

Plus 14 new wiki pages — [Big-O notation](/wiki/big-o-notation), [hash table](/wiki/hash-table), [hash collisions](/wiki/hash-collisions), [sorting algorithms](/wiki/sorting-algorithms), [quicksort](/wiki/quicksort), [mergesort](/wiki/mergesort), [binary search tree](/wiki/binary-search-tree), [balanced tree](/wiki/balanced-tree), [graph traversal](/wiki/graph-traversal), [shortest path](/wiki/shortest-path), [dynamic programming](/wiki/dynamic-programming), [P vs NP](/wiki/p-vs-np), [NP-completeness](/wiki/np-completeness), [approximation algorithms](/wiki/approximation-algorithms), [randomized algorithms](/wiki/randomized-algorithms). Five misconceptions cover the high-impact gaps (Big-O is exact, hash tables are always O(1), greedy always works, NP means non-polynomial, randomized is just heuristic). A new [algorithms forum domain](/forum/algorithms) gives discussion a home.

## The capstone

[Build a Production Search Engine](/capstones/build-a-production-search-engine) (4 weeks): from inverted index + tokenizer through ranking + caching + scaling — exercising every algorithmic primitive. Deliverables: working search engine, latency benchmarks, ablation report.

## Why this matters

Compared to the 13 prior paths, the algorithms-engineer path is the **CS foundations** layer that the rest assume. ML engineers tune hyperparameters on algorithms they don't understand the complexity of; systems engineers design distributed systems on top of network protocols whose graph-algorithm core they've forgotten; mathematicians prove convergence rates without grounding them in computational complexity.

For interview prep: this path covers ~85% of what a typical algorithms interview assesses.

For practitioners: this path is the difference between "my code works" and "my code works at scale."

## What this completes

The platform now has 14 mastery paths. End-to-end coverage from first principles (algorithms, math, physics) through specialized engineering (ML, systems, multimodal, robotics, quantum, comp-bio) through emerging domains (game theory, causality, applied statistics, RL). The CS-foundations spine is now in place.`,
    },
  ];

  for (const a of articles) {
    db.insert(newsArticles).values({
      id: randomUUID(),
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      body: a.body,
      abstract: (a as any).abstract ?? "",
      referencesJson: JSON.stringify(
        ((a as any).references as Array<{ text: string; url?: string }> | undefined)?.map(
          (r, i) => ({ label: String(i + 1), text: r.text, url: r.url }),
        ) ?? [],
      ),
      coauthorsJson: JSON.stringify((a as any).coauthors ?? []),
      coverEmoji: a.coverEmoji,
      accentColor: a.accentColor,
      authorId: a.authorId,
    }).run();
  }
  console.log(`  Seeded news: ${articles.length} articles.`);
}

function parseTiers(body: string): { intro: string; undergrad: string; grad: string } {
  const introMarker = "<!-- tier:intro -->";
  const undergradMarker = "<!-- tier:undergrad -->";
  const gradMarker = "<!-- tier:grad -->";

  const introStart = body.indexOf(introMarker);
  const undergradStart = body.indexOf(undergradMarker);
  const gradStart = body.indexOf(gradMarker);

  if (introStart === -1 || undergradStart === -1 || gradStart === -1) {
    // If no tier markers, use the whole body for all tiers
    return { intro: body.trim(), undergrad: body.trim(), grad: body.trim() };
  }

  return {
    intro: body.slice(introStart + introMarker.length, undergradStart).trim(),
    undergrad: body.slice(undergradStart + undergradMarker.length, gradStart).trim(),
    grad: body.slice(gradStart + gradMarker.length).trim(),
  };
}

interface MasteryNodeSpec {
  slug: string;
  title: string;
  level: "apprentice" | "practitioner" | "specialist" | "expert" | "researcher";
  order: number;
  pages: string[];
  prereqs: string[];
  description?: string;
  // When set, the node deep-links to non-lesson content instead of
  // slides (mirrors the Sprint-82 lab pattern). "exam" → /exams/:examSlug.
  nodeKind?: "lesson" | "exam";
  examSlug?: string;
}

function loadJsonForNode(folder: string, nodeSlug: string): string | null {
  // Resolve from this module's location (cwd-independent), matching
  // every other seeder in this file — e.g. the wiki-pages loader's
  // `path.join(import.meta.dir, "../../../seed-content/pages")`. The
  // prior process.cwd() walk silently no-op'd under an unexpected cwd.
  const file = path.join(
    import.meta.dir,
    "../../../seed-content",
    folder,
    `${nodeSlug}.json`,
  );
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return JSON.stringify(parsed);
  } catch (e) {
    console.error(`  Failed to parse ${folder} file ${file}:`, e);
    return null;
  }
}

// Look up hand-authored quiz JSON for a node by slug, if present.
function loadQuizData(nodeSlug: string): string | null {
  return loadJsonForNode("quizzes", nodeSlug);
}

// Look up hand-authored lesson JSON for a node by slug, if present.
function loadLessonData(nodeSlug: string): string | null {
  return loadJsonForNode("lessons", nodeSlug);
}

function seedMasteryPath(spec: {
  slug: string;
  title: string;
  description: string;
  nodes: MasteryNodeSpec[];
}) {
  const existing = db
    .select()
    .from(masteryPaths)
    .where(eq(masteryPaths.slug, spec.slug))
    .get();
  if (existing) {
    // Path already exists, but author may have added quiz data for nodes
    // since the last seed. Update quizData on existing nodes with a
    // matching JSON file; leave everything else untouched.
    let quizUpdated = 0;
    let lessonUpdated = 0;
    const existingNodes = db
      .select({ id: masteryNodes.id, slug: masteryNodes.slug })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, existing.id))
      .all();
    for (const node of existingNodes) {
      const quiz = loadQuizData(node.slug);
      const lesson = loadLessonData(node.slug);
      const set: Record<string, unknown> = {};
      if (quiz) {
        set.quizData = quiz;
        quizUpdated++;
      }
      if (lesson) {
        set.lessonData = lesson;
        lessonUpdated++;
      }
      if (Object.keys(set).length > 0) {
        db.update(masteryNodes)
          .set(set)
          .where(eq(masteryNodes.id, node.id))
          .run();
      }
    }
    console.log(
      `  Mastery path "${spec.slug}" already exists, refreshed quiz on ${quizUpdated} nodes, lessons on ${lessonUpdated}.`,
    );
    return;
  }

  const pathId = randomUUID();
  db.insert(masteryPaths).values({
    id: pathId,
    slug: spec.slug,
    title: spec.title,
    description: spec.description,
  }).run();

  const nodeIdMap = new Map<string, string>();
  for (const node of spec.nodes) nodeIdMap.set(node.slug, randomUUID());

  for (const node of spec.nodes) {
    const nodeId = nodeIdMap.get(node.slug)!;
    const prereqIds = node.prereqs.map((p) => nodeIdMap.get(p)!).filter(Boolean);

    db.insert(masteryNodes).values({
      id: nodeId,
      pathId,
      slug: node.slug,
      title: node.title,
      description: node.description || `Master ${node.title.toLowerCase()} concepts.`,
      order: node.order,
      level: node.level,
      pageIds: JSON.stringify(node.pages),
      prerequisiteNodeIds: JSON.stringify(prereqIds),
      quizData: loadQuizData(node.slug),
      lessonData: loadLessonData(node.slug),
      nodeKind: node.nodeKind ?? "lesson",
      examSlug: node.examSlug ?? null,
    }).run();
  }

  console.log(`  Seeded "${spec.slug}" mastery path with ${spec.nodes.length} nodes.`);
}

function seedMasteryPaths() {
  seedMasteryPath({
    slug: "ml-engineer",
    title: "ML Engineer",
    description:
      "From fundamentals to modern transformer architectures. Master the theory and practice of machine learning.",
    nodes: [
      { slug: "tokens-basics", title: "Tokens & Text Representation", level: "apprentice", order: 1, pages: ["tokens"], prereqs: [] },
      { slug: "embeddings-basics", title: "Word Embeddings", level: "apprentice", order: 2, pages: ["embeddings"], prereqs: ["tokens-basics"] },
      { slug: "bpe-tokenization", title: "BPE Tokenization", level: "apprentice", order: 3, pages: ["bpe-tokenization"], prereqs: ["tokens-basics"] },
      { slug: "positional-encoding", title: "Positional Encoding", level: "apprentice", order: 4, pages: ["positional-encoding"], prereqs: ["embeddings-basics"] },
      { slug: "softmax-basics", title: "Softmax Function", level: "apprentice", order: 5, pages: ["softmax"], prereqs: [] },
      { slug: "attention-intro", title: "Attention Mechanism", level: "practitioner", order: 6, pages: ["attention"], prereqs: ["embeddings-basics", "softmax-basics"] },
      { slug: "self-attention", title: "Self-Attention", level: "practitioner", order: 7, pages: ["self-attention"], prereqs: ["attention-intro"] },
      { slug: "multi-head-attention", title: "Multi-Head Attention", level: "practitioner", order: 8, pages: ["multi-head-attention"], prereqs: ["self-attention"] },
      { slug: "ffn", title: "Feed-Forward Networks", level: "practitioner", order: 9, pages: ["feed-forward-networks"], prereqs: ["multi-head-attention"] },
      { slug: "layer-norm", title: "Layer Normalization", level: "practitioner", order: 10, pages: ["layer-normalization"], prereqs: [] },
      { slug: "residual-connections", title: "Residual Connections", level: "practitioner", order: 11, pages: ["residual-connections"], prereqs: ["layer-norm"] },
      { slug: "transformer-block", title: "The Transformer Block", level: "practitioner", order: 12, pages: ["transformer-block"], prereqs: ["multi-head-attention", "ffn", "residual-connections"] },
      { slug: "encoder-decoder", title: "Encoder-Decoder Architecture", level: "specialist", order: 13, pages: ["encoder-decoder"], prereqs: ["transformer-block"] },
      { slug: "masked-attention", title: "Masked Self-Attention", level: "specialist", order: 14, pages: ["masked-self-attention"], prereqs: ["self-attention", "encoder-decoder"] },
      { slug: "cross-attention", title: "Cross-Attention", level: "specialist", order: 15, pages: ["cross-attention"], prereqs: ["masked-attention"] },
      { slug: "training-objectives", title: "Training Objectives", level: "specialist", order: 16, pages: ["training-objectives"], prereqs: ["encoder-decoder"] },
      { slug: "sampling-decoding", title: "Sampling & Decoding", level: "specialist", order: 17, pages: ["sampling-strategies", "temperature", "top-k-top-p", "beam-search"], prereqs: ["training-objectives"] },
      { slug: "kv-cache", title: "KV Cache Optimization", level: "expert", order: 18, pages: ["kv-cache"], prereqs: ["self-attention", "sampling-decoding"] },
      { slug: "scaling-laws", title: "Scaling Laws", level: "expert", order: 19, pages: ["scaling-laws"], prereqs: ["training-objectives"] },
      { slug: "modern-architectures", title: "Modern Architecture Innovations", level: "expert", order: 20, pages: ["rope", "grouped-query-attention", "swiglu"], prereqs: ["kv-cache", "scaling-laws"] },
      { slug: "fine-tuning-lora", title: "Fine-Tuning & LoRA", level: "expert", order: 21, pages: ["fine-tuning", "lora"], prereqs: ["training-objectives"] },
      { slug: "rlhf", title: "RLHF", level: "expert", order: 22, pages: ["rlhf"], prereqs: ["fine-tuning-lora"] },
      { slug: "rag", title: "Retrieval-Augmented Generation", level: "expert", order: 23, pages: ["rag"], prereqs: ["fine-tuning-lora"] },
      { slug: "mechanistic-interp", title: "Mechanistic Interpretability", level: "researcher", order: 24, pages: ["mechanistic-interpretability", "induction-heads", "superposition"], prereqs: ["modern-architectures"] },
    ],
  });

  seedMasteryPath({
    slug: "ai-researcher",
    title: "AI Researcher",
    description:
      "From mathematical fluency to original research contributions. Builds the foundations and frontier knowledge needed to read papers critically and contribute to ML research.",
    nodes: [
      { slug: "math-foundations", title: "Mathematical Foundations", level: "practitioner", order: 1, pages: ["linear-algebra-foundations", "calculus-foundations", "probability-foundations"], prereqs: [], description: "Linear algebra, calculus, and probability fluency — the language of every ML paper." },
      { slug: "info-theory-basics", title: "Information Theory for ML", level: "practitioner", order: 2, pages: ["information-theory"], prereqs: ["math-foundations"], description: "Entropy, KL, mutual information — the formal vocabulary of ML losses." },
      { slug: "optimization-fundamentals", title: "Optimization Fundamentals", level: "practitioner", order: 3, pages: ["optimization-theory", "gradient-descent", "backpropagation"], prereqs: ["math-foundations"], description: "Gradient descent, convexity, and the geometry of training." },
      { slug: "statistics-for-ml", title: "Statistics for ML", level: "practitioner", order: 4, pages: ["statistics-foundations", "loss-functions"], prereqs: ["math-foundations"], description: "Estimation, MLE, hypothesis testing, and proper evaluation." },
      { slug: "transformer-deep-dive", title: "Transformer Deep Dive", level: "specialist", order: 5, pages: ["attention", "self-attention", "multi-head-attention", "transformer-block"], prereqs: ["optimization-fundamentals", "info-theory-basics"], description: "Read the architecture end-to-end, with mathematical fluency." },
      { slug: "training-dynamics", title: "Training Dynamics & Scaling", level: "specialist", order: 6, pages: ["scaling-laws", "training-objectives"], prereqs: ["optimization-fundamentals", "statistics-for-ml"], description: "How loss curves behave, what scaling laws predict, and where they break." },
      { slug: "evaluation-rigor", title: "Evaluation & Statistical Rigor", level: "specialist", order: 7, pages: ["statistics-foundations", "loss-functions"], prereqs: ["statistics-for-ml"], description: "Calibration, significance testing, the meta-science of benchmarks." },
      { slug: "interpretability", title: "Mechanistic Interpretability", level: "expert", order: 8, pages: ["mechanistic-interpretability", "induction-heads", "superposition"], prereqs: ["transformer-deep-dive"], description: "Reverse-engineer circuits inside trained models." },
      { slug: "alignment-frontier", title: "Alignment Frontier", level: "expert", order: 9, pages: ["rlhf", "fine-tuning", "lora"], prereqs: ["transformer-deep-dive", "training-dynamics"], description: "RLHF, value alignment, and the engineering practice around frontier models." },
      { slug: "emergent-capabilities", title: "Emergent Capabilities & ICL", level: "expert", order: 10, pages: ["in-context-learning", "scaling-laws"], prereqs: ["transformer-deep-dive", "training-dynamics"], description: "What appears with scale, what doesn't, and how to tell the difference." },
      { slug: "research-frontiers", title: "Reading & Critiquing Frontier Work", level: "researcher", order: 11, pages: ["mechanistic-interpretability", "induction-heads", "scaling-laws"], prereqs: ["interpretability", "alignment-frontier", "emergent-capabilities"], description: "Read three major papers per week, identify the load-bearing claim, find the weakest link." },
      { slug: "novel-contributions", title: "Original Research Contributions", level: "researcher", order: 12, pages: ["mechanistic-interpretability"], prereqs: ["research-frontiers"], description: "Pose a question no one has answered. Run an experiment. Write it up." },
    ],
  });

  seedMasteryPath({
    slug: "mathematician",
    title: "Mathematician",
    description:
      "The math behind ML, learned in the order it actually shows up: linear algebra, calculus, probability, statistics, info theory, and optimization.",
    nodes: [
      { slug: "linear-algebra-foundations", title: "Linear Algebra Foundations", level: "apprentice", order: 1, pages: ["linear-algebra-foundations"], prereqs: [], description: "Vectors, matrices, dot products, and the geometry that drives every ML operation." },
      { slug: "calculus-foundations", title: "Calculus Foundations", level: "apprentice", order: 2, pages: ["calculus-foundations"], prereqs: [], description: "Derivatives, gradients, and the chain rule — the language of training." },
      { slug: "probability-foundations", title: "Probability Foundations", level: "apprentice", order: 3, pages: ["probability-foundations"], prereqs: [], description: "Random variables, distributions, expectations, and Bayes' rule." },
      { slug: "statistics-foundations", title: "Statistics Foundations", level: "practitioner", order: 4, pages: ["statistics-foundations"], prereqs: ["probability-foundations"], description: "Estimation, MLE, and hypothesis testing — turning data into claims." },
      { slug: "info-theory-basics", title: "Information Theory", level: "practitioner", order: 5, pages: ["information-theory"], prereqs: ["probability-foundations"], description: "Entropy, KL divergence, and mutual information — the formal vocabulary of ML losses." },
      { slug: "loss-functions", title: "Loss Functions", level: "practitioner", order: 6, pages: ["loss-functions"], prereqs: ["statistics-foundations", "info-theory-basics"], description: "Cross-entropy, MSE, and the rest — and why each one is the right tool for its job." },
      { slug: "gradient-descent", title: "Gradient Descent", level: "practitioner", order: 7, pages: ["gradient-descent", "optimization-theory"], prereqs: ["calculus-foundations"], description: "Vanilla GD, SGD, momentum, and the geometry of loss landscapes." },
      { slug: "backpropagation", title: "Backpropagation", level: "specialist", order: 8, pages: ["backpropagation"], prereqs: ["gradient-descent", "linear-algebra-foundations"], description: "How gradients actually flow through a deep network. The chain rule, vectorized." },
    ],
  });

  seedMasteryPath({
    slug: "physicist",
    title: "Physicist",
    description:
      "From Newton to chaos: the language of dynamical systems, learned with live simulations.",
    nodes: [
      { slug: "mechanics-foundations", title: "Mechanics Foundations", level: "apprentice", order: 1, pages: ["mechanics-foundations"], prereqs: [], description: "Newton's laws, conservation, energy — the spine of classical mechanics." },
      { slug: "oscillations", title: "Oscillations", level: "apprentice", order: 2, pages: ["oscillations"], prereqs: ["mechanics-foundations"], description: "Simple harmonic motion, damped + driven oscillators, resonance." },
      { slug: "phase-space", title: "Phase Space & Fixed Points", level: "practitioner", order: 3, pages: ["phase-space"], prereqs: ["oscillations"], description: "Read a 1D system off its phase portrait. Stability without solving." },
      { slug: "chaos-and-sensitivity", title: "Chaos & Sensitivity", level: "practitioner", order: 4, pages: ["chaos-and-sensitivity"], prereqs: ["phase-space"], description: "The Lorenz system. Why deterministic ≠ predictable in the long run." },
      { slug: "lagrangian-mechanics", title: "Lagrangian Mechanics", level: "practitioner", order: 5, pages: ["lagrangian-mechanics"], prereqs: ["mechanics-foundations"], description: "Least action, generalized coordinates, Euler-Lagrange equations." },
      { slug: "nonlinear-dynamics", title: "Nonlinear Dynamics", level: "specialist", order: 6, pages: ["nonlinear-dynamics"], prereqs: ["chaos-and-sensitivity", "lagrangian-mechanics"], description: "Bifurcations, limit cycles, the double pendulum as a chaos lab." },
      { slug: "statistical-mechanics", title: "Statistical Mechanics", level: "specialist", order: 7, pages: ["statistical-mechanics"], prereqs: ["mechanics-foundations"], description: "Ensembles, the partition function, free energy. Entropy as counting." },
      { slug: "entropy-and-information", title: "Entropy ↔ Information", level: "expert", order: 8, pages: ["information-theory"], prereqs: ["statistical-mechanics"], description: "Boltzmann's H meets Shannon's H — the bridge between the two." },
    ],
  });

  // Sprint 55 — Systems engineer path. Distributed training, serving,
  // monitoring. Closest sibling to ml-engineer; assumes transformer
  // familiarity (cross-path prereqs link back where relevant in the
  // lesson bodies).
  seedMasteryPath({
    slug: "systems-engineer",
    title: "Systems Engineer",
    description:
      "Distributed training, GPU memory accounting, production serving, monitoring. The infrastructure half of modern ML.",
    nodes: [
      { slug: "gpu-architecture", title: "GPU Architecture", level: "apprentice", order: 1, pages: ["gpu-architecture", "tensor-cores", "hbm-memory"], prereqs: [], description: "Tensor cores, HBM bandwidth, memory hierarchy — the substrate everything else runs on." },
      { slug: "mixed-precision-training", title: "Mixed Precision", level: "apprentice", order: 2, pages: ["mixed-precision", "loss-scaling"], prereqs: ["gpu-architecture"], description: "fp16 vs bf16 vs fp8, loss scaling, gradient stability." },
      { slug: "data-parallelism", title: "Data Parallelism", level: "practitioner", order: 3, pages: ["data-parallelism", "nccl-collective"], prereqs: ["mixed-precision-training"], description: "DDP, gradient sync, NCCL — the workhorse of multi-GPU training." },
      { slug: "model-parallelism", title: "Model Parallelism & FSDP", level: "practitioner", order: 4, pages: ["tensor-parallelism", "pipeline-parallelism", "fsdp"], prereqs: ["data-parallelism"], description: "Tensor + pipeline parallelism, FSDP. When the model doesn't fit on one GPU." },
      { slug: "mlops-experiment-tracking", title: "MLOps & Experiment Tracking", level: "specialist", order: 5, pages: ["mlflow", "experiment-tracking"], prereqs: ["data-parallelism"], description: "Reproducibility, hyperparameter sweeps, the discipline of remembering what you ran." },
      { slug: "inference-serving", title: "Inference Serving", level: "specialist", order: 6, pages: ["vllm", "paged-attention", "dynamic-batching"], prereqs: ["model-parallelism"], description: "vLLM, PagedAttention, dynamic batching — turning a checkpoint into a service." },
      { slug: "monitoring-observability", title: "Monitoring & Observability", level: "expert", order: 7, pages: ["model-monitoring", "drift-detection", "slo-budget"], prereqs: ["inference-serving"], description: "Drift, online evaluation, latency SLOs. What 'shipped' actually means." },
      { slug: "production-failure-modes", title: "Production Failure Modes", level: "expert", order: 8, pages: ["production-failures", "rollback-playbooks"], prereqs: ["monitoring-observability", "mlops-experiment-tracking"], description: "OOM, NaN gradients, silent corruption, rollback playbooks. The list of things that break in production." },
    ],
  });

  // Sprint 56 — Reinforcement Learning path. RLHF in ml-engineer is
  // covered as a depth-jump; this path supplies the missing ladder of
  // foundations from MDPs through PPO.
  seedMasteryPath({
    slug: "reinforcement-learner",
    title: "Reinforcement Learner",
    description:
      "From MDPs to PPO and onward to RLHF. The RL foundations the rest of modern AI assumes you have.",
    nodes: [
      { slug: "mdp-foundations", title: "MDP Foundations", level: "apprentice", order: 1, pages: ["mdp", "markov-property"], prereqs: [], description: "States, actions, rewards, transitions — the formal substrate of every RL algorithm." },
      { slug: "value-functions", title: "Value Functions", level: "apprentice", order: 2, pages: ["value-function", "bellman-equation"], prereqs: ["mdp-foundations"], description: "V(s), Q(s,a), and the Bellman equation that ties them together." },
      { slug: "dynamic-programming-rl", title: "Dynamic Programming", level: "practitioner", order: 3, pages: ["value-iteration", "policy-iteration"], prereqs: ["value-functions"], description: "Value iteration, policy iteration. Solving small MDPs exactly." },
      { slug: "temporal-difference", title: "Temporal Difference Learning", level: "practitioner", order: 4, pages: ["td-learning", "q-learning"], prereqs: ["value-functions"], description: "TD(0), SARSA, Q-learning. Learning value functions from samples." },
      { slug: "policy-gradients", title: "Policy Gradients", level: "practitioner", order: 5, pages: ["policy-gradient", "reinforce", "gae"], prereqs: ["value-functions"], description: "REINFORCE, baselines, GAE — optimizing the policy directly via gradient ascent on expected return." },
      { slug: "actor-critic", title: "Actor-Critic Methods", level: "specialist", order: 6, pages: ["actor-critic"], prereqs: ["policy-gradients", "temporal-difference"], description: "A2C, A3C — combining policy gradients with a learned value baseline." },
      { slug: "ppo-trpo", title: "PPO & TRPO", level: "specialist", order: 7, pages: ["ppo", "trpo"], prereqs: ["actor-critic"], description: "Trust regions, clipped surrogate objectives. The workhorse algorithms of modern RL." },
      { slug: "exploration-exploitation", title: "Exploration vs Exploitation", level: "specialist", order: 8, pages: ["exploration-strategies", "intrinsic-rewards"], prereqs: ["temporal-difference"], description: "ε-greedy, UCB, intrinsic motivation, curiosity. Why pure exploitation gets stuck." },
      { slug: "model-based-rl", title: "Model-Based RL", level: "expert", order: 9, pages: ["model-based-rl", "world-models"], prereqs: ["ppo-trpo"], description: "Learn a world model; plan with it. Dreamer, MuZero, the sample-efficiency frontier." },
      { slug: "rl-from-human-feedback", title: "RLHF & Beyond", level: "expert", order: 10, pages: ["rlhf"], prereqs: ["ppo-trpo"], description: "Bridge to ml-engineer's RLHF lesson. Why it's PPO with a learned reward model, where DPO simplifies, where the alignment problem actually lives." },
    ],
  });

  // Sprint 57 — Multimodal / Vision path. Widens the platform from
  // text-only LLMs to ViTs, CLIP, diffusion, audio, and modern VLMs.
  // Assumes transformer familiarity (cross-path prereqs link to
  // ml-engineer's multi-head-attention lesson).
  seedMasteryPath({
    slug: "multimodal-engineer",
    title: "Multimodal Engineer",
    description:
      "From pixels to vision transformers, CLIP, diffusion, audio, and modern VLMs. The non-text half of the modern ML stack.",
    nodes: [
      { slug: "image-foundations", title: "Image Foundations", level: "apprentice", order: 1, pages: ["convolutions", "image-tensors"], prereqs: [], description: "Pixels, channels, convolutions — the substrate every vision model builds on." },
      { slug: "vision-transformers", title: "Vision Transformers", level: "apprentice", order: 2, pages: ["vit", "patch-embeddings"], prereqs: ["image-foundations"], description: "ViT, patch embeddings, position. The architecture that brought transformers to vision." },
      { slug: "contrastive-learning", title: "Contrastive Learning", level: "practitioner", order: 3, pages: ["contrastive-loss", "infonce"], prereqs: [], description: "InfoNCE, SimCLR, hard negatives — the loss that powers self-supervised representation learning." },
      { slug: "clip-and-vlms", title: "CLIP & Vision-Language Models", level: "practitioner", order: 4, pages: ["clip", "vision-language-models"], prereqs: ["vision-transformers", "contrastive-learning"], description: "Joint embedding spaces, CLIP's contrastive pretraining, modern VLMs (GPT-4V, LLaVA)." },
      { slug: "diffusion-models", title: "Diffusion Models", level: "specialist", order: 5, pages: ["diffusion", "ddpm", "score-matching"], prereqs: ["image-foundations"], description: "Forward and reverse process, DDPM, score matching. The architecture behind Stable Diffusion + DALL-E." },
      { slug: "text-to-image", title: "Text-to-Image", level: "specialist", order: 6, pages: ["stable-diffusion", "classifier-free-guidance"], prereqs: ["diffusion-models", "clip-and-vlms"], description: "Stable Diffusion's latent diffusion + CLIP conditioning + classifier-free guidance." },
      { slug: "audio-and-speech", title: "Audio & Speech", level: "specialist", order: 7, pages: ["mel-spectrogram", "whisper"], prereqs: [], description: "Spectrograms, Whisper, modern TTS. Audio as another modality." },
      { slug: "multimodal-fusion", title: "Multimodal Fusion", level: "expert", order: 8, pages: ["multimodal-fusion"], prereqs: ["clip-and-vlms"], description: "Early vs late vs attention-based fusion. How modern VLMs actually combine modalities." },
      { slug: "multimodal-evaluation", title: "Multimodal Evaluation", level: "expert", order: 9, pages: ["mmlu-multimodal"], prereqs: ["multimodal-fusion"], description: "VQA benchmarks, hallucination detection, eval methodology when there's no single ground truth." },
    ],
  });

  // Sprint 58 — Computational Biology path. The most differentiated
  // cross-domain: ML × biology. AlphaFold, protein language models,
  // sequence modeling. Cross-references ml-engineer's attention work
  // explicitly (AlphaFold's evoformer is attention-based).
  seedMasteryPath({
    slug: "comp-biologist",
    title: "Computational Biologist",
    description:
      "ML × biology: from DNA/RNA/protein to AlphaFold, protein language models, and the bio-ML frontier.",
    nodes: [
      { slug: "dna-rna-protein", title: "DNA, RNA, Protein", level: "apprentice", order: 1, pages: ["central-dogma", "protein-sequence"], prereqs: [], description: "The central dogma, sequence representations, and what 'biological data' actually means computationally." },
      { slug: "sequence-alignment", title: "Sequence Alignment", level: "apprentice", order: 2, pages: ["sequence-alignment", "blast"], prereqs: ["dna-rna-protein"], description: "Smith-Waterman, BLAST, multiple sequence alignment. The classical bioinformatics that ML built on." },
      { slug: "phylogenetics", title: "Phylogenetics", level: "practitioner", order: 3, pages: ["phylogenetic-tree"], prereqs: ["sequence-alignment"], description: "Distance methods, maximum likelihood, evolutionary trees. How relatedness is inferred from sequence." },
      { slug: "protein-structure", title: "Protein Structure", level: "practitioner", order: 4, pages: ["protein-structure", "secondary-structure"], prereqs: ["dna-rna-protein"], description: "Primary → secondary → tertiary → quaternary. The folding problem and why it took until 2020 to crack." },
      { slug: "alphafold", title: "AlphaFold", level: "specialist", order: 5, pages: ["alphafold", "evoformer", "msa-attention"], prereqs: ["protein-structure", "sequence-alignment"], description: "Evoformer, structure module, MSA. Why attention + co-evolution gave us protein structure prediction." },
      { slug: "protein-language-models", title: "Protein Language Models", level: "specialist", order: 6, pages: ["esm", "protein-lms"], prereqs: ["protein-structure"], description: "ESM, masked-residue pretraining. Transformer LMs adapted to protein sequences." },
      { slug: "single-cell-rna-seq", title: "Single-Cell RNA-Seq", level: "specialist", order: 7, pages: ["scrna-seq", "umap-tsne"], prereqs: ["dna-rna-protein"], description: "Sequencing individual cells. Dimensionality reduction, cell-type clustering, the geneticist's microscope." },
      { slug: "molecular-dynamics", title: "Molecular Dynamics", level: "expert", order: 8, pages: ["molecular-dynamics"], prereqs: ["protein-structure"], description: "Force fields, Langevin sampling, simulating biomolecules at the atomic level." },
      { slug: "bio-ml-evaluation", title: "Bio-ML Evaluation", level: "expert", order: 9, pages: ["casp"], prereqs: ["alphafold", "protein-language-models"], description: "CASP, contamination, leakage. How bio-ML benchmarks stay (or fail to stay) honest." },
    ],
  });

  // Sprint 59 — Applied Statistics. Distinct from the mathematician
  // path: production-flavored statistics, A/B testing, evaluation
  // rigor, fairness. The substrate every ML team eventually needs.
  seedMasteryPath({
    slug: "applied-statistician",
    title: "Applied Statistician",
    description:
      "Production-flavored statistics: hypothesis testing, A/B experiments, uncertainty quantification, fairness. The substrate ML evaluation actually needs.",
    nodes: [
      { slug: "frequentist-foundations", title: "Frequentist Foundations", level: "apprentice", order: 1, pages: ["sampling-distribution", "bootstrap", "mle"], prereqs: [], description: "Sampling distributions, MLE, the bootstrap. The frequentist worldview." },
      { slug: "hypothesis-testing", title: "Hypothesis Testing", level: "apprentice", order: 2, pages: ["p-value", "type-i-ii-errors", "multiple-testing"], prereqs: ["frequentist-foundations"], description: "Null hypotheses, p-values, multiple testing correction. The standard inferential toolkit." },
      { slug: "bayesian-inference", title: "Bayesian Inference", level: "practitioner", order: 3, pages: ["prior-likelihood-posterior", "mcmc", "credible-interval"], prereqs: ["frequentist-foundations"], description: "Priors, posteriors, credible intervals, MCMC. When and why to go Bayesian." },
      { slug: "experiment-design", title: "Experiment Design", level: "practitioner", order: 4, pages: ["power-analysis", "randomization", "blocking-stratification"], prereqs: ["hypothesis-testing"], description: "Power analysis, randomization, blocking. Designing experiments that actually answer the question." },
      { slug: "ab-testing", title: "A/B Testing", level: "specialist", order: 5, pages: ["ab-test", "sequential-testing", "peeking-bias"], prereqs: ["experiment-design"], description: "Online experiments, sequential testing, the peeking problem. Production A/B at scale." },
      { slug: "causal-inference-basics", title: "Causal Inference Basics", level: "specialist", order: 6, pages: ["counterfactual", "rct"], prereqs: ["experiment-design"], description: "Counterfactuals, RCTs, the gap between correlation and cause. Bridges to the causality path." },
      { slug: "uncertainty-quantification", title: "Uncertainty Quantification", level: "expert", order: 7, pages: ["calibration", "conformal-prediction", "prediction-interval"], prereqs: ["bayesian-inference"], description: "Calibration, conformal prediction, prediction intervals. ML systems that know what they don't know." },
      { slug: "bias-and-fairness", title: "Bias & Fairness", level: "expert", order: 8, pages: ["demographic-parity", "fairness-accuracy-frontier"], prereqs: ["uncertainty-quantification"], description: "Demographic parity, equalized odds, the fairness-accuracy trade-off. The applied side of ML ethics." },
    ],
  });

  // Sprint 60 — Causality. Pearl-style structural causal models, DAGs,
  // do-calculus, instrumental variables. Goes deeper than the
  // applied-stats causal-inference-basics node, which is intentional —
  // most ML practitioners hit causal-inference once and bounce; this
  // path is for the ones who need to actually do it.
  seedMasteryPath({
    slug: "causal-scientist",
    title: "Causal Scientist",
    description:
      "Pearl-style causal inference: DAGs, do-calculus, counterfactuals, instrumental variables, mediation, heterogeneous effects. The discipline that turns correlations into actionable claims.",
    nodes: [
      { slug: "correlation-vs-causation", title: "Correlation vs Causation", level: "apprentice", order: 1, pages: ["correlation-vs-causation", "spurious-correlation", "simpson-paradox"], prereqs: [], description: "Why 'correlation does not imply causation' is more than a slogan. Simpson's paradox, confounders, the failure modes of naive prediction." },
      { slug: "potential-outcomes", title: "Potential Outcomes Framework", level: "apprentice", order: 2, pages: ["potential-outcomes", "ate-att", "treatment-assignment"], prereqs: ["correlation-vs-causation"], description: "Rubin's Y(0)/Y(1) framework, ATE, ATT, the fundamental problem of causal inference. The vocabulary every causal-inference paper uses." },
      { slug: "dags-and-d-separation", title: "DAGs and d-Separation", level: "practitioner", order: 3, pages: ["dag", "d-separation", "backdoor-criterion"], prereqs: ["correlation-vs-causation"], description: "Directed acyclic graphs as causal models. d-separation, backdoor paths, and how DAGs let you read off conditional independencies." },
      { slug: "do-calculus", title: "Do-Calculus", level: "practitioner", order: 4, pages: ["do-operator", "do-calculus-rules", "identifiability"], prereqs: ["dags-and-d-separation"], description: "Pearl's do-operator, the three rules of do-calculus, identifiability. Going from observational data to interventional claims." },
      { slug: "rcts-and-quasi-experiments", title: "RCTs & Quasi-Experiments", level: "practitioner", order: 5, pages: ["rct-design", "natural-experiment", "regression-discontinuity"], prereqs: ["potential-outcomes"], description: "Randomization as the gold standard. When you can't randomize: regression discontinuity, difference-in-differences, natural experiments." },
      { slug: "instrumental-variables", title: "Instrumental Variables", level: "specialist", order: 6, pages: ["instrumental-variable", "two-stage-least-squares", "exclusion-restriction"], prereqs: ["do-calculus", "rcts-and-quasi-experiments"], description: "Estimating causal effects when the treatment is endogenous. 2SLS, exclusion restriction, the LATE." },
      { slug: "mediation-analysis", title: "Mediation Analysis", level: "specialist", order: 7, pages: ["mediation", "direct-indirect-effects", "mediation-assumptions"], prereqs: ["do-calculus"], description: "Decomposing a causal effect into direct + indirect paths. The natural-direct/natural-indirect framework." },
      { slug: "heterogeneous-treatment-effects", title: "Heterogeneous Treatment Effects", level: "specialist", order: 8, pages: ["hte", "causal-forests", "uplift-modeling"], prereqs: ["potential-outcomes"], description: "Effects that vary across the population. Causal forests, meta-learners, uplift modeling. Where ML and causal inference meet." },
      { slug: "causal-discovery", title: "Causal Discovery", level: "expert", order: 9, pages: ["causal-discovery", "pc-algorithm", "fci-algorithm"], prereqs: ["dags-and-d-separation"], description: "Learning causal structure from data. PC, FCI, score-based methods. The hardest problem in the field; how far it can go and where it can't." },
    ],
  });

  // Sprint 61 — Robotics + Control. Classical control through modern
  // ML-driven robotics. The other half of the embodied-AI stack.
  // Cross-references RL via cross-path prereqs.
  seedMasteryPath({
    slug: "roboticist",
    title: "Roboticist",
    description:
      "From classical control to modern ML-driven robotics: PID, state-space, Kalman filters, SLAM, motion planning, manipulation, sim-to-real, and end-to-end policies.",
    nodes: [
      { slug: "control-foundations", title: "Control Foundations", level: "apprentice", order: 1, pages: ["pid-control", "feedback-loops", "stability"], prereqs: [], description: "PID controllers, feedback loops, stability analysis. The substrate of every control system." },
      { slug: "state-space-control", title: "State-Space Control", level: "apprentice", order: 2, pages: ["state-space", "linear-systems", "lqr"], prereqs: ["control-foundations"], description: "State-space representations, linear systems, LQR. The modern formalism for control." },
      { slug: "estimation-and-filtering", title: "Estimation & Filtering", level: "practitioner", order: 3, pages: ["kalman-filter", "extended-kalman-filter", "particle-filter"], prereqs: ["state-space-control"], description: "Kalman, EKF, particle filters. How robots reason about state under sensor noise." },
      { slug: "slam", title: "SLAM", level: "practitioner", order: 4, pages: ["slam", "loop-closure", "factor-graphs"], prereqs: ["estimation-and-filtering"], description: "Simultaneous localization and mapping. From EKF-SLAM to factor-graph methods to ORB-SLAM." },
      { slug: "motion-planning", title: "Motion Planning", level: "specialist", order: 5, pages: ["motion-planning", "rrt", "a-star"], prereqs: ["state-space-control"], description: "Sampling-based (RRT, RRT*), search-based (A*), trajectory optimization. Getting from A to B without hitting things." },
      { slug: "manipulation", title: "Manipulation", level: "specialist", order: 6, pages: ["forward-kinematics", "inverse-kinematics", "grasp-planning"], prereqs: ["motion-planning"], description: "Forward / inverse kinematics, grasp planning, dexterous manipulation. The hand-eye coordination problem." },
      { slug: "sim-to-real", title: "Sim-to-Real", level: "specialist", order: 7, pages: ["sim-to-real", "domain-randomization", "system-identification"], prereqs: ["motion-planning"], description: "Training in simulation; deploying on hardware. Domain randomization, system ID, the reality gap." },
      { slug: "learning-based-control", title: "Learning-Based Control", level: "expert", order: 8, pages: ["model-based-rl-robotics", "imitation-learning", "diffusion-policy"], prereqs: ["sim-to-real"], description: "Model-based RL, behavior cloning, diffusion policies, transformer policies. Where ML meets control." },
      { slug: "embodied-ai-frontier", title: "Embodied AI Frontier", level: "expert", order: 9, pages: ["foundation-models-robotics", "vision-language-action", "real-world-deployment"], prereqs: ["learning-based-control"], description: "RT-2, OpenVLA, π-0, the foundation-models-for-robotics era. End-to-end policies + the deployment realities." },
    ],
  });

  // Sprint 62 — Quantum Engineer. Qubits through variational
  // algorithms + QML. Differentiated cross-domain: ML × quantum.
  seedMasteryPath({
    slug: "quantum-engineer",
    title: "Quantum Engineer",
    description:
      "From qubits + superposition to Shor's algorithm, error correction, NISQ-era variational methods, and quantum machine learning. The other side of the computational frontier.",
    nodes: [
      { slug: "quantum-foundations", title: "Quantum Foundations", level: "apprentice", order: 1, pages: ["qubit", "quantum-superposition", "bloch-sphere"], prereqs: [], description: "Qubits, superposition, measurement. The quantum substrate every algorithm builds on." },
      { slug: "quantum-gates", title: "Quantum Gates and Circuits", level: "apprentice", order: 2, pages: ["quantum-gates", "hadamard-gate", "cnot-gate"], prereqs: ["quantum-foundations"], description: "Single-qubit + two-qubit gates, universal gate sets, quantum circuits. The lego pieces of quantum computation." },
      { slug: "entanglement", title: "Entanglement and Bell States", level: "practitioner", order: 3, pages: ["entanglement", "bell-states", "no-cloning-theorem"], prereqs: ["quantum-gates"], description: "Bell states, entanglement, the no-cloning theorem. The non-classical resource powering quantum advantage." },
      { slug: "quantum-algorithms", title: "Quantum Algorithms (Foundations)", level: "practitioner", order: 4, pages: ["deutsch-jozsa", "quantum-fourier-transform", "phase-estimation"], prereqs: ["entanglement"], description: "Deutsch-Jozsa, QFT, phase estimation. The building blocks behind every famous quantum algorithm." },
      { slug: "grover-search", title: "Grover's Algorithm", level: "specialist", order: 5, pages: ["grover-algorithm", "amplitude-amplification"], prereqs: ["quantum-algorithms"], description: "Quadratic speedup for unstructured search. Amplitude amplification as the underlying primitive." },
      { slug: "shor-factoring", title: "Shor's Algorithm", level: "specialist", order: 6, pages: ["shor-algorithm", "post-quantum-cryptography"], prereqs: ["quantum-algorithms"], description: "Polynomial-time factoring on a quantum computer. The result that motivated post-quantum cryptography." },
      { slug: "quantum-error-correction", title: "Quantum Error Correction", level: "specialist", order: 7, pages: ["quantum-error-correction", "surface-code"], prereqs: ["entanglement"], description: "Stabilizer codes, surface code, fault-tolerant computation. How to compute despite noise." },
      { slug: "nisq-era", title: "NISQ Era + Error Mitigation", level: "expert", order: 8, pages: ["nisq", "decoherence", "error-mitigation"], prereqs: ["quantum-error-correction"], description: "Noisy intermediate-scale quantum: hardware noise, decoherence, mitigation techniques. The current reality." },
      { slug: "variational-and-qml", title: "Variational Algorithms + QML", level: "expert", order: 9, pages: ["vqe", "qaoa", "quantum-machine-learning", "quantum-advantage"], prereqs: ["nisq-era"], description: "VQE, QAOA, parameterized circuits, quantum machine learning. The frontier of useful quantum computation." },
    ],
  });

  // Sprint 67e — Algorithms & Data Structures path. The CS-foundations
  // layer that every other path implicitly assumes. Universally useful;
  // missing from the platform until S67.
  seedMasteryPath({
    slug: "algorithms-engineer",
    title: "Algorithms Engineer",
    description:
      "From asymptotic analysis through P vs NP. The CS-foundations spine of every engineering discipline — sorting, hashing, graphs, dynamic programming, complexity theory, and the algorithms that ship in real production systems.",
    nodes: [
      { slug: "asymptotic-analysis", title: "Asymptotic Analysis", level: "apprentice", order: 1, pages: ["big-o-notation", "complexity-classes"], prereqs: [], description: "Big-O, Big-Theta, Big-Omega. The vocabulary for talking about algorithm scalability." },
      { slug: "arrays-and-hashing", title: "Arrays & Hashing", level: "apprentice", order: 2, pages: ["hash-table", "hash-collisions"], prereqs: ["asymptotic-analysis"], description: "Hash tables, collisions, load factors. Why O(1) lookups are conditional." },
      { slug: "sorting-algorithms", title: "Sorting Algorithms", level: "practitioner", order: 3, pages: ["sorting-algorithms", "quicksort", "mergesort"], prereqs: ["asymptotic-analysis"], description: "Quicksort, mergesort, heapsort, the n log n lower bound for comparison sorts. When linear-time radix sort applies." },
      { slug: "linked-structures", title: "Trees & Linked Structures", level: "practitioner", order: 4, pages: ["binary-search-tree", "balanced-tree", "trie"], prereqs: ["sorting-algorithms"], description: "BSTs, AVL/red-black, B-trees, tries. Why balance matters for guaranteed log-n operations." },
      { slug: "graph-algorithms", title: "Graph Algorithms", level: "practitioner", order: 5, pages: ["graph-traversal", "shortest-path", "minimum-spanning-tree"], prereqs: ["linked-structures"], description: "BFS, DFS, Dijkstra, A*, Kruskal/Prim. The patterns behind GPS, network protocols, dependency resolvers." },
      { slug: "dynamic-programming", title: "Dynamic Programming", level: "specialist", order: 6, pages: ["dynamic-programming", "memoization-vs-tabulation", "bellman-ford"], prereqs: ["graph-algorithms"], description: "Optimal substructure, overlapping subproblems, memoization vs tabulation. The algorithm-design pattern that solves problems brute-force search can't." },
      { slug: "greedy-and-divide-conquer", title: "Greedy + Divide & Conquer", level: "specialist", order: 7, pages: ["greedy-algorithms", "divide-and-conquer"], prereqs: ["dynamic-programming"], description: "When greedy works (matroids, exchange arguments) and when it doesn't. When divide-and-conquer is the right framing (Strassen, Karatsuba)." },
      { slug: "np-complete", title: "P, NP, and NP-Completeness", level: "expert", order: 8, pages: ["p-vs-np", "np-completeness", "reductions"], prereqs: ["dynamic-programming"], description: "Polynomial-time, nondeterminism, reductions, NP-completeness. Why some problems are intractable and what that means in practice." },
      { slug: "approximation-randomized", title: "Approximation + Randomized Algorithms", level: "expert", order: 9, pages: ["approximation-algorithms", "randomized-algorithms"], prereqs: ["np-complete"], description: "When exact solutions are out of reach: approximation algorithms with provable bounds + randomized algorithms (Las Vegas, Monte Carlo) that trade certainty for speed." },
    ],
  });

  // Sprint 66e — Game Theory + Mechanism Design path. Bridges
  // reinforcement-learner (multi-agent, self-play), ai-researcher
  // (alignment, mesa-optimization), and comp-biologist (evolutionary
  // games). The "incentives" half of modern AI.
  seedMasteryPath({
    slug: "game-theorist",
    title: "Game Theorist",
    description:
      "From Nash equilibria + auctions through multi-agent RL + alignment. The strategic-interaction half of modern AI.",
    nodes: [
      { slug: "zero-sum-games", title: "Zero-Sum Games & Minimax", level: "apprentice", order: 1, pages: ["zero-sum", "minimax"], prereqs: [], description: "Two-player zero-sum, payoff matrices, the minimax theorem. Where game theory historically starts." },
      { slug: "nash-equilibrium", title: "Nash Equilibrium", level: "apprentice", order: 2, pages: ["nash-equilibrium", "mixed-strategy"], prereqs: ["zero-sum-games"], description: "Best response, mixed strategies, the existence theorem. The central solution concept." },
      { slug: "sequential-games", title: "Sequential Games", level: "practitioner", order: 3, pages: ["extensive-form", "subgame-perfect"], prereqs: ["nash-equilibrium"], description: "Game trees, backward induction, subgame perfection. When timing matters." },
      { slug: "bayesian-games", title: "Bayesian Games", level: "practitioner", order: 4, pages: ["bayesian-game", "incomplete-info"], prereqs: ["nash-equilibrium"], description: "Type spaces, Bayesian Nash equilibrium. Strategic interaction under uncertainty about opponents." },
      { slug: "cooperative-games", title: "Cooperative Games & Shapley", level: "specialist", order: 5, pages: ["shapley-value", "core-solution"], prereqs: ["nash-equilibrium"], description: "Coalitions, the core, Shapley value. Fair division when binding agreements are possible." },
      { slug: "mechanism-design", title: "Mechanism Design", level: "specialist", order: 6, pages: ["mechanism-design", "revelation-principle"], prereqs: ["bayesian-games"], description: "Truthful mechanisms, the revelation principle, incentive compatibility. Designing rules so equilibria produce what you want." },
      { slug: "auction-theory", title: "Auction Theory", level: "specialist", order: 7, pages: ["auction-theory", "vcg-auction"], prereqs: ["mechanism-design"], description: "First-price, second-price, VCG. The most-deployed application of mechanism design." },
      { slug: "multi-agent-rl", title: "Multi-Agent Reinforcement Learning", level: "expert", order: 8, pages: ["multi-agent-rl", "self-play"], prereqs: ["nash-equilibrium"], description: "Self-play, opponent modeling, population-based training. Bridge to the reinforcement-learner path." },
      { slug: "alignment-game-theory", title: "Alignment as Game Theory", level: "expert", order: 9, pages: ["principal-agent"], prereqs: ["mechanism-design", "multi-agent-rl"], description: "Mesa-optimization, principal-agent problems, why incentive structures determine outcomes more than capabilities. The frontier connection." },
    ],
  });

  // P89 — Choreographer path.
  seedMasteryPath({
    slug: "choreographer",
    title: "Choreographer",
    description:
      "From Louis XIV Académie Royale de Danse 1661 + Noverre Letters on Dancing 1760 + Petipa Mariinsky + Isadora Duncan + Diaghilev Ballets Russes through Martha Graham + Cunningham + Balanchine + Pina Bausch + Bill T. Jones + Crystal Pite to viral TikTok choreography; movement vocabulary (ballet positions + barre + Graham contraction + Cunningham release + jazz + hip-hop locking/popping + contemporary + Forsythe technologies); choreographic process (Doris Humphrey The Art of Making Dances 1959 + theme/variation + canon + retrograde + space/time/dynamics/effort + Smith-Autard — interactive beat-grid viz with 4/4 vs 3/4 vs polyrhythm); notation (Feuillet 1700 + Stepanov + Laban 1928 Labanotation + Benesh 1955 + Eshkol-Wachman + Sutton + DanceForms + motion capture); dance + music (counts + phrasing + Stravinsky Rite of Spring + Reich Drumming + click track); genres (Balanchine neoclassical + Forsythe contemporary + Yvonne Rainer No Manifesto 1965 + Trisha Brown + Paxton contact improv + Fosse + Skeeter Rabbit popping + Savion Glover tap + Bharatanatyam + flamenco); production + staging (Tharp + Bob Fosse Chicago/Cabaret + Susan Stroman + Andy Blankenbuehler Hamilton + film dance Astaire-Kelly + La La Land Hurwitz); and modern frontier — TikTok viral Renegade Charli D'Amelio + Olympic breaking 2024 Paris + Wayne McGregor + Random International motion capture + AI choreography Google Living Archive + generative dance.",
    nodes: [
      { slug: "dance-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["court-romantic-ballet", "modern-graham-cunningham", "contemporary-pite"], prereqs: [], description: "Louis XIV Académie Royale 1661 + Noverre 1760 + Petipa Mariinsky + Isadora Duncan + Diaghilev Ballets Russes + Martha Graham + Merce Cunningham + Balanchine + Pina Bausch + Bill T. Jones + Crystal Pite." },
      { slug: "movement-vocabulary-and-technique", title: "Movement Vocabulary + Technique", level: "practitioner", order: 2, pages: ["ballet-modern", "jazz-hip-hop", "contemporary-improv"], prereqs: ["dance-foundations-and-history"], description: "Ballet positions + barre + adagio + allegro + pointe; Graham contraction + Cunningham + release; jazz + hip-hop locking/popping + b-boying; contemporary + improvisation + Forsythe." },
      { slug: "choreographic-process-and-composition", title: "Process + Composition", level: "specialist", order: 3, pages: ["humphrey-art-of-making", "theme-variation-canon", "space-time-dynamics"], prereqs: ["movement-vocabulary-and-technique"], description: "Doris Humphrey 1959 + theme + variation + repetition + canon + retrograde + space/time/dynamics/effort + Smith-Autard (interactive beat-grid viz)." },
      { slug: "dance-notation-and-documentation", title: "Notation + Documentation", level: "specialist", order: 4, pages: ["feuillet-laban", "benesh-eshkol-wachman", "video-mocap"], prereqs: ["movement-vocabulary-and-technique"], description: "Feuillet 1700 + Stepanov + Laban Labanotation 1928 + Effort-Shape + Benesh 1955 + Eshkol-Wachman + Sutton DanceWriting + DanceForms + motion capture." },
      { slug: "dance-music-rhythm-and-meter", title: "Music + Rhythm + Meter", level: "expert", order: 5, pages: ["meter-counts-phrasing", "stravinsky-reich", "click-track"], prereqs: ["choreographic-process-and-composition"], description: "Meter + counts 5-6-7-8 + phrasing + musicality + accompanist + Stravinsky Rite of Spring + Reich Drumming + score-following + body percussion." },
      { slug: "genres-and-styles", title: "Genres + Styles", level: "expert", order: 6, pages: ["ballet-postmodern", "jazz-hip-hop-tap", "global-folk"], prereqs: ["dance-foundations-and-history"], description: "Petipa classical + Balanchine + Forsythe + Yvonne Rainer No Manifesto 1965 + Trisha Brown + Paxton contact improv + Fosse + Don Campbell locking + Skeeter Rabbit + Crazy Legs + Savion Glover + Bharatanatyam + flamenco." },
      { slug: "production-and-staging", title: "Production + Staging", level: "expert", order: 7, pages: ["stagecraft-lighting", "broadway-fosse-stroman", "film-dance"], prereqs: ["choreographic-process-and-composition"], description: "Stagecraft + Tharp + Fosse Chicago/Cabaret + Stroman + Blankenbuehler Hamilton + film dance Astaire-Kelly + La La Land Hurwitz." },
      { slug: "modern-frontier-choreography", title: "Modern Frontier", level: "expert", order: 8, pages: ["viral-tiktok", "olympic-breaking", "ai-choreography"], prereqs: ["dance-notation-and-documentation", "genres-and-styles", "production-and-staging"], description: "Renegade Charli D'Amelio + WAP + algorithmic visibility + Olympic breaking Paris 2024 + Wayne McGregor Random International motion capture + Google Living Archive AI + Dance Diffuser." },
    ],
  });

  // P88 — Veterinarian path.
  seedMasteryPath({
    slug: "veterinarian",
    title: "Veterinarian",
    description:
      "From Bourgelat École Vétérinaire Lyon 1761 + James Herriot All Creatures Great and Small + AVMA 1863 + WSAVA + WOAH + Calvin Schwabe One Health 1984 through comparative anatomy + Romer skeletal homology (interactive comparative-anatomy viz with 6 species), small-animal medicine (Ettinger + parvo + FIV/FeLV + Cushing's + CKD), large-animal + production (Radostits + equine colic/laminitis + bovine mastitis/ketosis + Temple Grandin welfare), zoonoses + One Health (rabies + Lyme + H5N1 + COVID + Daszak EcoHealth + Karesh + WHO/WOAH/FAO Tripartite), surgery + anesthesia (Halsted + Slatter + isoflurane + radiography + ultrasound + CT + MRI), wildlife + exotic + laboratory (WCS + AALAS + 3Rs Russell-Burch + Guide for Care 8e), and modern frontier — telemedicine Vetster + Mars Petcare AI + ZoetisAI + precision livestock + dairy robotic milking + Mellor Five Domains animal welfare + climate-animal disease.",
    nodes: [
      { slug: "veterinary-medicine-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["bourgelat-herriot-avma", "one-health", "scope"], prereqs: [], description: "Bourgelat 1761 + James Herriot + AVMA 1863 + WSAVA + WOAH + Calvin Schwabe Veterinary Medicine and Human Health 1984 One Health." },
      { slug: "comparative-anatomy-and-physiology", title: "Comparative Anatomy + Physiology", level: "practitioner", order: 2, pages: ["vertebrate-bauplan-romer", "species-differences", "ruminant-avian-reptile"], prereqs: ["veterinary-medicine-foundations-and-history"], description: "Romer skeletal homology + Sinclair-Andersen + species differences (dog/cat/horse/cow/bird/exotic) + ruminant 4-chamber stomach + avian respiratory (interactive comparative-anatomy viz)." },
      { slug: "small-animal-medicine", title: "Small-Animal Medicine", level: "specialist", order: 3, pages: ["clinical-exam-soap", "common-conditions", "ettinger"], prereqs: ["comparative-anatomy-and-physiology"], description: "SOAP + dog + cat + parvo + distemper + FIV/FeLV + hyperthyroid cats + diabetes + Cushing's + CKD cats + Ettinger Textbook of Veterinary Internal Medicine + breed-specific." },
      { slug: "large-animal-and-production-medicine", title: "Large-Animal + Production", level: "specialist", order: 4, pages: ["equine-bovine-conditions", "swine-sheep-goat", "welfare-temple-grandin"], prereqs: ["comparative-anatomy-and-physiology"], description: "Equine colic + laminitis + EHV + bovine mastitis + ketosis + brucellosis + Radostits + dairy + feedlot + Temple Grandin handling + welfare." },
      { slug: "zoonoses-and-one-health", title: "Zoonoses + One Health", level: "expert", order: 5, pages: ["rabies-lyme-leptospirosis", "h5n1-covid-spillover", "tripartite-daszak"], prereqs: ["small-animal-medicine", "large-animal-and-production-medicine"], description: "Rabies + Lyme + brucellosis + leptospirosis + toxoplasmosis + H5N1 + COVID-19 spillover + One Health WHO/WOAH/FAO Tripartite + Daszak EcoHealth + Karesh WCS + emerging." },
      { slug: "surgery-anesthesia-and-imaging", title: "Surgery + Anesthesia + Imaging", level: "expert", order: 6, pages: ["halsted-asepsis", "anesthesia-asa", "radiography-ct-mri"], prereqs: ["small-animal-medicine"], description: "Halsted principles + asepsis + Tobias Veterinary Surgery + ASA classification + isoflurane + xylazine + radiography + ultrasound + CT + MRI veterinary + endoscopy + Slatter." },
      { slug: "wildlife-exotic-and-laboratory-animals", title: "Wildlife + Exotic + Lab Animals", level: "expert", order: 7, pages: ["wildlife-wcs", "exotic-pets", "laboratory-3rs"], prereqs: ["comparative-anatomy-and-physiology"], description: "Deer + raptors + sea turtles + IUCN + WCS + zoo medicine + reptiles + parrots + small mammals + AALAS + 3Rs Russell-Burch reduce-replace-refine + Guide for Care 8e." },
      { slug: "modern-frontier-veterinary-medicine", title: "Modern Frontier", level: "expert", order: 8, pages: ["telemedicine-vetster", "ai-radiology", "precision-livestock-welfare-mellor"], prereqs: ["zoonoses-and-one-health", "surgery-anesthesia-and-imaging", "wildlife-exotic-and-laboratory-animals"], description: "Telemedicine Vetster + Mars Petcare AI + ZoetisAI + radiology AI + precision livestock + dairy robotic milking + Mellor Five Domains animal welfare + climate-animal disease." },
    ],
  });

  // P87 — Forensic Scientist path.
  seedMasteryPath({
    slug: "forensic-scientist",
    title: "Forensic Scientist",
    description:
      "From Sherlock Holmes inspiration + Locard 1910 exchange principle + Vidocq + Conan Doyle + Hans Gross Criminal Investigation 1893 + Daubert standard 1993 through crime scene + chain of custody + DNA Jeffreys 1984 + CODIS 13-loci (interactive electropherogram viz), fingerprints Galton 1892 + Henry classification + AFIS + Brandon Mayfield 2004 misidentification, trace evidence + GSR + GC-MS + FT-IR microspectroscopy, ballistics + IBIS NIBIN + AFTE comparison microscope + Goddard, forensic pathology + Bernard Spilsbury + algor/livor/rigor mortis + Henssge nomogram + Bass Body Farm Tennessee, and modern frontier — investigative genetic genealogy Golden State Killer 2018 + GEDmatch + Dror cognitive bias + NAS 2009 Strengthening Forensic Science + PCAST 2016 + AI in forensics + Innocence Project DNA exonerations 375+.",
    nodes: [
      { slug: "forensic-science-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["sherlock-locard", "hans-gross-csi", "daubert-innocence"], prereqs: [], description: "Sherlock Holmes inspiration + Locard 1910 exchange + Vidocq + Doyle + Hans Gross Criminal Investigation 1893 + CSI modern + Daubert standard 1993 + Innocence Project." },
      { slug: "crime-scene-and-evidence-collection", title: "Crime Scene + Evidence", level: "practitioner", order: 2, pages: ["locard-exchange-applied", "chain-of-custody", "photography-sketching"], prereqs: ["forensic-science-foundations-and-history"], description: "Locard exchange + chain of custody + collection + photography + sketching + biological hazards + first responder + contamination prevention." },
      { slug: "dna-and-biological-evidence", title: "DNA + Biological Evidence", level: "specialist", order: 3, pages: ["jeffreys-fingerprinting", "codis-str-y-mtdna", "innocence-project"], prereqs: ["crime-scene-and-evidence-collection"], description: "Jeffreys 1984 + STR + CODIS 13-loci + Y-STR + mitochondrial + Innocence Project + Brandon Mayfield + low-template + touch DNA (interactive electropherogram viz)." },
      { slug: "fingerprints-and-pattern-evidence", title: "Fingerprints + Pattern Evidence", level: "specialist", order: 4, pages: ["galton-henry-afis", "minutiae-recovery", "mayfield-bite-marks"], prereqs: ["crime-scene-and-evidence-collection"], description: "Galton 1892 + Henry classification + AFIS + ridge characteristics + minutiae + latent print recovery + Brandon Mayfield 2004 Madrid + ENFSI + bite marks discredited." },
      { slug: "trace-evidence-and-instrumental-analysis", title: "Trace Evidence + Instruments", level: "expert", order: 5, pages: ["hair-fiber-glass-paint", "gsr", "ft-ir-gc-ms-microscopy"], prereqs: ["crime-scene-and-evidence-collection"], description: "Hair + fiber + glass + paint + GSR + FT-IR + GC-MS + microscopy + Locard exchange applied + microspectroscopy." },
      { slug: "ballistics-and-firearms", title: "Ballistics + Firearms", level: "expert", order: 6, pages: ["rifling-tool-marks", "ibis-nibin", "afte-goddard"], prereqs: ["trace-evidence-and-instrumental-analysis"], description: "Rifling + lands + grooves + tool marks + IBIS NIBIN + cartridge cases + bullet trajectory + GSR + AFTE Association Firearm + comparison microscope + Goddard." },
      { slug: "forensic-pathology-and-time-of-death", title: "Pathology + Time of Death", level: "expert", order: 7, pages: ["spilsbury-autopsy", "algor-livor-rigor", "entomology-body-farm"], prereqs: ["crime-scene-and-evidence-collection"], description: "Bernard Spilsbury + autopsy + algor mortis + livor mortis + rigor mortis + Henssge nomogram + entomology + Bass Body Farm Tennessee + decomposition stages + manner of death." },
      { slug: "modern-frontier-forensic-science", title: "Modern Frontier", level: "expert", order: 8, pages: ["igg-golden-state-gedmatch", "cognitive-bias-dror", "ai-forensics-pcast"], prereqs: ["dna-and-biological-evidence", "fingerprints-and-pattern-evidence", "forensic-pathology-and-time-of-death"], description: "Investigative genetic genealogy Golden State Killer 2018 + GEDmatch + cognitive bias Dror + NAS 2009 + PCAST 2016 + AI bloodstain ML + Brady disclosure + Innocence Project 375+ exonerations." },
    ],
  });

  // P86 — Toxicologist path. From Paracelsus 1538 + Orfila + Marsh
  // through Casarett-Doull canon + dose-response Hill + LD50/ED50
  // (the viz anchor) + ADME + organ toxicity + environmental POPs +
  // occupational exposure + forensic + clinical + Tox21 + AI for
  // toxicology.
  seedMasteryPath({
    slug: "toxicologist",
    title: "Toxicologist",
    description:
      "From Paracelsus 1538 'the dose makes the poison' + Mathieu Orfila 1813 Traité des poisons + James Marsh arsenic test 1836 + Magendie + Claude Bernard + Wormley through Sax + Casarett-Doull canonical textbook + Klaassen + WHO IPCS + EPA TSCA + ECHA REACH; dose-response (Hill function E/Emax + LD50 + ED50 + therapeutic index TI=LD50/ED50 + Trevan 1927 + probit + Bliss — interactive dose-response curve viz with acetaminophen/benzodiazepine/ricin); mechanisms (receptor binding + enzyme inhibition + bioactivation NAPQI + reactive metabolite + oxidative stress + protein adducts + DNA damage + hormesis Calabrese + non-monotonic endocrine disruptors Vandenberg); toxicokinetics + ADME (oral/dermal/inhalation + Vd + protein binding + BBB + Phase I CYP450 + Phase II conjugation + induction + polymorphisms + PBPK Krishnan-Andersen); organ toxicology (acetaminophen NAPQI + NAC antidote + Rumack-Matthew nomogram + aminoglycoside/cisplatin nephrotoxicity + heavy metals Pb/Hg/Mn + organophosphate + MPTP Langston + anthracycline cardiotoxicity + paraquat lung); environmental (POPs Stockholm 2001 + DDT Carson Silent Spring 1962 + dioxins + PCBs + PFAS forever chemicals + Grandjean + microplastics + PM2.5 Pope-Dockery + lead Reuben + arsenic Smith + Flint + asbestos + glyphosate IARC 2A); occupational (silica/silicosis + Selikoff asbestos + lead + mercury + TLV-TWA ACGIH + PEL OSHA + Bradford Hill + Rana Plaza); forensic + clinical (postmortem redistribution + GC-MS + LC-MS-MS + Litvinenko Po-210 + poison centers AAPCC + ethylene glycol fomepizole + opioid naloxone + organophosphate atropine + pralidoxime + activated charcoal + Doll-Hill + envenomation antivenom); and modern frontier — Tox21 + ToxCast EPA + organ-on-chip Ingber + 3D bioprinting + Ames test + read-across QSAR + DeepTox + Mansouri OPERA + DeepChem + exposome Wild 2005 + LLM-augmented toxicology + Brown-Strasburger pharmacovigilance. The toxicology stack end-to-end.",
    nodes: [
      { slug: "toxicology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-paracelsus-orfila", "modern-casarett-doull", "classification"], prereqs: [], description: "Paracelsus 1538 + Orfila 1813 + Marsh 1836 + Magendie + Claude Bernard + Wormley; Sax + ATSDR + Casarett-Doull + Klaassen + WHO IPCS + EPA TSCA + ECHA REACH; xenobiotics + acute vs chronic + reversible vs irreversible + endogenous vs exogenous." },
      { slug: "dose-response-and-mechanisms", title: "Dose-Response + Mechanisms", level: "practitioner", order: 2, pages: ["hill-ld50-ed50-ti", "mechanisms-bioactivation", "hormesis-non-monotonic"], prereqs: ["toxicology-foundations-and-history"], description: "Hill function E/Emax + LD50 + ED50 + TI + Trevan 1927 + probit + Bliss (interactive dose-response viz); receptor + enzyme inhibition + bioactivation + reactive metabolite + oxidative stress + protein adducts + DNA damage; hormesis Calabrese + endocrine disruptors Vandenberg non-monotonic." },
      { slug: "toxicokinetics-and-adme", title: "Toxicokinetics + ADME", level: "specialist", order: 3, pages: ["absorption-distribution", "metabolism-cyp450", "excretion-pbpk"], prereqs: ["dose-response-and-mechanisms"], description: "Oral + dermal + inhalation + first-pass + lipophilicity; Vd + protein binding + BBB + placental; Phase I CYP450 3A4/2D6/2C9/2C19/1A2 + Phase II conjugation + induction + polymorphisms; renal + hepatic + biliary + enterohepatic + Bauer-Aach + PBPK Krishnan-Andersen." },
      { slug: "organ-toxicology", title: "Organ Toxicology", level: "specialist", order: 4, pages: ["hepatotoxicity-acetaminophen", "nephrotoxicity-neurotox", "cardiac-pulmonary-reproductive"], prereqs: ["toxicokinetics-and-adme"], description: "Acetaminophen NAPQI + NAC + Rumack-Matthew + Halothane + DILI; aminoglycoside + cisplatin + contrast + analgesic nephropathy; Pb + Hg + Mn + organophosphate + sarin + tetrodotoxin + MPTP Langston Parkinsonism; anthracycline cardiotoxicity + paraquat lung + phthalates BPA Vandenberg." },
      { slug: "environmental-toxicology", title: "Environmental Toxicology", level: "expert", order: 5, pages: ["persistent-pops-pfas", "ecotoxicology", "ambient-pollutants"], prereqs: ["toxicology-foundations-and-history"], description: "POPs Stockholm 2001 + DDT Carson Silent Spring 1962 + dioxins TCDD + PCBs + PFAS forever chemicals + Grandjean + microplastics; bioaccumulation + biomagnification + LC50 fish + Daphnia + neonicotinoid bee CCD; PM2.5 Pope-Dockery + lead Reuben + arsenic Bangladesh Smith + Flint + asbestos mesothelioma + glyphosate IARC 2A." },
      { slug: "occupational-toxicology", title: "Occupational Toxicology", level: "expert", order: 6, pages: ["workplace-exposures-silica-asbestos", "exposure-assessment-tlv-pel", "hazard-controls-niosh"], prereqs: ["organ-toxicology"], description: "Silica silicosis + Hawks Nest + asbestos mesothelioma Selikoff + lead + Mad Hatter mercury; TLV-TWA ACGIH + PEL OSHA + REL NIOSH + biomonitoring + Bradford Hill; NIOSH hierarchy elimination > substitution > engineering > administrative > PPE + Rana Plaza 2013." },
      { slug: "forensic-and-clinical-toxicology", title: "Forensic + Clinical Toxicology", level: "expert", order: 7, pages: ["forensic-postmortem-gc-ms", "clinical-poison-centers", "envenomation-antivenom"], prereqs: ["organ-toxicology"], description: "Postmortem redistribution + blood + vitreous + hair + GC-MS + LC-MS-MS + Litvinenko Po-210 + Markov; AAPCC + Rumack-Matthew + ethanol + ethylene glycol fomepizole + opioid naloxone + benzo flumazenil + organophosphate atropine + pralidoxime + activated charcoal; snake + scorpion + spider + Sutherland pressure-immobilization." },
      { slug: "modern-frontier-toxicology", title: "Modern Frontier", level: "expert", order: 8, pages: ["in-vitro-tox21-organ-on-chip", "computational-deeptox-qsar", "exposome-llm"], prereqs: ["environmental-toxicology", "occupational-toxicology", "forensic-and-clinical-toxicology"], description: "Tox21 + ToxCast EPA + organ-on-chip Ingber + 3D bioprinting + Ames mutagenicity + 3R reduce-refine-replace; read-across QSAR + DeepTox + Mansouri OPERA + DeepChem + TIMES + Bayer in silico; exposome Wild 2005 + Vermeulen + GeneXpose + PFAS regulation + LLM-augmented toxicology + Brown-Strasburger pharmacovigilance." },
    ],
  });

  // P85 — Pediatrician path. From Abraham Jacobi + Soranus + Bela
  // Schick through Apgar score + WHO growth standards (the viz
  // anchor) + neonatology + vaccines + common illnesses + adolescent
  // mental health + social determinants + Felitti-Anda ACEs +
  // modern frontier rapid WGS NICU + GLP-1 adolescents.
  seedMasteryPath({
    slug: "pediatrician",
    title: "Pediatrician",
    description:
      "From Abraham Jacobi 'father of American pediatrics' 1860s + Soranus Gynaecology ~100 CE + Pierre Budin newborn care + Bela Schick test 1913 + Robert Debré + Henry Kempe battered child 1962 through first US pediatric residency Boston 1882 + AAP 1930 + ORS + Salk-Sabin polio + measles vaccine + childhood obesity rise; growth + development (WHO Child Growth Standards 2006 + CDC charts + percentiles + Z-scores + stunting/wasting/underweight + Bayley Scales + ASQ + Marshall-Tanner staging — interactive growth-chart viz with WHO/CDC overlays); neonatology (Apgar Virginia Apgar 1953 + NRP + jaundice + bilirubin Bhutani nomogram + phototherapy + GBS sepsis + RDS + surfactant + ELBW prematurity + NEC + ROP + IVH); vaccines + preventive (CDC/AAP/ACIP 2024 + DTaP + MMR + Hib + HepB + PCV13 + rotavirus + HPV Gardasil + influenza + COVID-19 + Wakefield retracted 1998 + Larson Vaccine Confidence + Bright Futures Anticipatory + autism M-CHAT screening); common illnesses (RSV nirsevimab 2023 + croup + asthma GINA + cystic fibrosis CFTR modulators + ORS + iron-deficiency + otitis media + GAS strep + Kawasaki + Lyme); adolescent + mental health (HEEADSSS Goldenring 1988 + PHQ-9-A + DSM-5 + ADHD + autism + CRAFFT + ASSIST + vaping + eating disorders Levenkron); social pediatrics (Marmot + ACEs Felitti-Anda 1998 + Shonkoff toxic stress + Center on Developing Child + Kempe child protection + IMNCI WHO + UNICEF + Black Lancet 2003); and modern frontier — newborn screening RUSP expansion + rapid WGS NICU Project Baby Bear + gene therapy Zolgensma SMA + exa-cel sickle cell + Rajkomar EHR DL + DeepMind retinal + climate-health Lancet Countdown + Surgeon General Murthy 2023 + GLP-1 adolescents. The pediatrics stack end-to-end.",
    nodes: [
      { slug: "pediatrics-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-jacobi-budin-schick", "modern-milestones-aap", "scope-subspecialties"], prereqs: [], description: "Jacobi 1860s + Soranus + Budin + Schick 1913 + Debré + Kempe 1962; first pediatric residency Boston 1882 + AAP 1930 + ORS + Salk-Sabin polio + measles vaccine + UNICEF child mortality decline; neonatology + adolescent + developmental-behavioral + critical care + subspecialties." },
      { slug: "growth-development-and-milestones", title: "Growth + Development + Milestones", level: "practitioner", order: 2, pages: ["who-cdc-percentiles", "developmental-milestones-bayley", "puberty-tanner"], prereqs: ["pediatrics-foundations-and-history"], description: "WHO 2006 + CDC 2000 + percentiles + Z-scores + stunting + wasting (interactive growth-chart viz); gross/fine motor + language + social + cognitive Piaget + CDC milestone tracker + Bayley + ASQ + red flags; Marshall-Tanner 1969-70 + precocious + delayed puberty Hayes-Foster." },
      { slug: "neonatology-and-the-newborn", title: "Neonatology + Newborn", level: "specialist", order: 3, pages: ["birth-apgar-nrp", "common-conditions-jaundice", "preterm-nicu"], prereqs: ["growth-development-and-milestones"], description: "Apgar Virginia Apgar 1953 + meconium + NRP + cord clamping; jaundice + bilirubin Bhutani nomogram + phototherapy + sepsis GBS + RDS + surfactant + congenital heart pulse-ox; Liley + ELBW + NEC + ROP + IVH + Soll-Pfister." },
      { slug: "vaccines-and-preventive-care", title: "Vaccines + Preventive Care", level: "specialist", order: 4, pages: ["immunization-schedule-cdc-aap", "vaccine-hesitancy-larson", "well-child-bright-futures"], prereqs: ["growth-development-and-milestones"], description: "CDC + AAP + ACIP 2024 + DTaP + MMR + Hib + HepB + PCV13 + rotavirus + IPV + varicella + HPV Gardasil 9 + influenza + COVID-19; Wakefield retracted 1998 + Larson Vaccine Confidence + VAERS + Disneyland 2014 measles; Bright Futures 4e + Anticipatory + lead + vision + hearing + M-CHAT." },
      { slug: "common-childhood-illnesses", title: "Common Childhood Illnesses", level: "expert", order: 5, pages: ["respiratory-rsv-asthma-cf", "gi-nutrition-failure-to-thrive", "infectious-otitis-strep-kawasaki"], prereqs: ["pediatrics-foundations-and-history"], description: "Common cold + bronchiolitis RSV nirsevimab 2023 + croup + asthma GINA + CF CFTR modulators; gastroenteritis ORS + breastfeeding LATCH + iron-deficiency + failure to thrive + functional constipation; otitis media + GAS strep + scarlet fever + Kawasaki + impetigo + Lyme." },
      { slug: "adolescent-medicine-and-mental-health", title: "Adolescent + Mental Health", level: "expert", order: 6, pages: ["adolescent-heeadsss", "mental-health-dsm5", "substance-eating-disorders"], prereqs: ["growth-development-and-milestones"], description: "HEEADSSS Goldenring 1988 + confidentiality + minor consent + LGBTQ-affirming + Mautone; depression PHQ-9-A + anxiety + ADHD + autism DSM-5 + M-CHAT; CRAFFT + ASSIST + vaping epidemic + naloxone + Mootha + anorexia/bulimia/ARFID + Levenkron + Steiner refeeding." },
      { slug: "social-pediatrics-and-determinants", title: "Social Pediatrics + Determinants", level: "expert", order: 7, pages: ["social-determinants-aces", "child-protection-kempe", "global-imnci"], prereqs: ["common-childhood-illnesses"], description: "Marmot social gradient + poverty + food insecurity + ACEs Felitti-Anda 1998 + Shonkoff toxic stress + Center Developing Child Harvard; Kempe battered child 1962 + Munchausen by proxy + mandatory reporting + Wood UK; IMNCI WHO + child mortality decline 1990-2020 + GAVI + UNICEF + Pinto + Black Lancet 2003." },
      { slug: "modern-frontier-pediatrics", title: "Modern Frontier", level: "expert", order: 8, pages: ["precision-genomics-rapid-wgs", "ai-pediatrics-deepmind", "climate-mental-health-glp1"], prereqs: ["neonatology-and-the-newborn", "vaccines-and-preventive-care", "adolescent-medicine-and-mental-health"], description: "Newborn screening RUSP + rapid WGS NICU Project Baby Bear + Zolgensma SMA + exa-cel sickle cell Vertex; Rajkomar deep-learning EHR + DeepMind retinal + skin imaging + seizure detection + pediatric AI ethics; Lancet Countdown climate-child + AAP screen time + Surgeon General Murthy 2023 mental health + GLP-1 adolescents + obesity." },
    ],
  });

  // P84 — Diplomat path. From Vienna Congress 1815 + Westphalia 1648
  // through Vienna Convention 1961 + bilateral embassies + Fisher-Ury
  // BATNA (the viz anchor — alliance network) + multilateral UN +
  // international law Geneva ICC + trade WTO + crisis Holbrooke
  // Dayton + consular + protocol + Nye soft power + modern digital
  // diplomacy + AI chip controls.
  seedMasteryPath({
    slug: "diplomat",
    title: "Diplomat",
    description:
      "From ancient diplomatic protocols + Italian Renaissance resident embassies + Richelieu permanent missions + Westphalia 1648 + Vienna Congress 1815 Metternich + Bismarck Realpolitik through Concert of Europe + Hague Conventions 1899/1907 + League of Nations 1920 + UN 1945 Charter + Bretton Woods + Kissinger shuttle diplomacy + Vienna Convention on Diplomatic Relations 1961; bilateral diplomacy + negotiation (embassy + chancery + diplomatic ranks + Fisher-Ury Getting to Yes 1981 BATNA + ZOPA + Putnam two-level games 1988 + Lax-Sebenius 3D negotiation — interactive alliance-network viz with NATO/EU/ASEAN/BRICS/OAS/AU/GCC); multilateral institutions (UN Charter + Security Council P5 + General Assembly + ICJ + ICC + WHO + UNESCO + IAEA + IMF + World Bank + WTO + Annan In Larger Freedom 2005 + Brahimi peacekeeping + R2P doctrine); international law + treaties (Vienna Convention on Treaties 1969 + jus cogens + Geneva Conventions 1949 + Pictet four principles + ICC Rome Statute 1998 + Eichmann + Pinochet + Lubanga); economic + trade diplomacy (GATT 1947 → WTO 1995 + MFN + Doha stalemate + Appellate Body crisis + IMF Bretton Woods + sanctions OFAC + Wassenaar + Hufbauer-Schott-Elliott); crisis + conflict resolution (Schelling escalation + Allison 3 models + EXCOMM Cuban missile + back-channels Kissinger + Pearson Suez 1956 + Holbrooke Dayton + Mitchell GFA 1998 + UN DPKO Blue Helmets + Brahimi 2000 + UNSC 1325 women peace security); consular affairs + protocol (Vienna Consular Convention 1963 + visa + emergency response + LaGrand + state visits + Nye soft power + Voice of America + RT + Confucius Institutes + British Council + DAAD + Fulbright); and modern frontier — Westcott digital diplomacy + Twitter diplomacy + Manor + Bjola + Tallinn Manual cyber norms + Paris Agreement 2015 + COP28 + AI race + chip export controls 2022 + Bletchley 2023 + Allison Thucydides Trap + Mearsheimer + Brzezinski + Bremmer technopolar. The diplomacy stack end-to-end.",
    nodes: [
      { slug: "diplomacy-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-vienna-era", "20c-un-bretton-woods", "modern-principles"], prereqs: [], description: "Italian Renaissance + Richelieu + Westphalia 1648 + Vienna Congress 1815 Metternich + Bismarck; Concert of Europe + Hague 1899/1907 + League 1920 + UN 1945 + Bretton Woods + Kissinger; sovereign equality + non-interference + Vienna Convention 1961." },
      { slug: "bilateral-diplomacy-and-negotiation", title: "Bilateral Diplomacy + Negotiation", level: "practitioner", order: 2, pages: ["embassies-ranks", "negotiation-fisher-ury-putnam", "alliance-treaty-mapping"], prereqs: ["diplomacy-foundations-and-history"], description: "Embassy + chancery + chargé + Vienna 1961 + ambassador/minister/counselor/attaché ranks; Fisher-Ury BATNA + ZOPA + Putnam two-level + Lax-Sebenius 3D; interactive alliance-network viz (NATO + EU + ASEAN + BRICS + OAS + AU + GCC + bilateral defense pacts)." },
      { slug: "multilateral-institutions-and-un", title: "Multilateral Institutions + UN", level: "specialist", order: 3, pages: ["un-system-sc-ga", "agencies-who-imf-wto", "reform-r2p"], prereqs: ["diplomacy-foundations-and-history"], description: "Charter + SC P5 veto + GA + ECOSOC + Secretariat + ICJ + ICC; WHO + UNESCO + UNICEF + UNHCR + IAEA + IMO + IMF + World Bank + WTO + ILO; UNSC enlargement + Annan In Larger Freedom 2005 + Brahimi + R2P + Bolton critique + Wallensteen." },
      { slug: "international-law-treaties", title: "International Law + Treaties", level: "specialist", order: 4, pages: ["sources-vienna-1969-jus-cogens", "ihl-geneva-pictet", "icc-rome-statute"], prereqs: ["multilateral-institutions-and-un"], description: "Vienna Convention on Treaties 1969 + signature/ratification + reservations + jus cogens + erga omnes; Geneva 1949 + Additional Protocols + protected persons + grave breaches + Henckaerts customary IHL + Pictet four principles; ICC Rome Statute 1998 + universal jurisdiction + Eichmann + Pinochet + ICTY + ICTR + Lubanga + Bashir." },
      { slug: "economic-and-trade-diplomacy", title: "Economic + Trade Diplomacy", level: "expert", order: 5, pages: ["trade-gatt-wto-doha", "finance-imf-wb", "sanctions-export-control"], prereqs: ["multilateral-institutions-and-un"], description: "GATT 1947 → WTO 1995 + MFN + national treatment + Doha + Appellate Body + USMCA + RCEP + CPTPP; IMF Bretton Woods + SDR + Article IV + World Bank IBRD + IDA; UN sanctions + OFAC + secondary + Wassenaar + Iran/Russia/DPRK + Hufbauer-Schott-Elliott." },
      { slug: "crisis-and-conflict-resolution", title: "Crisis + Conflict Resolution", level: "expert", order: 6, pages: ["crisis-schelling-allison-excomm", "peacekeeping-pearson-brahimi", "mediation-norway-vatican"], prereqs: ["bilateral-diplomacy-and-negotiation"], description: "Schelling escalation + Allison 3 models + George coercive diplomacy + EXCOMM Cuban + back-channels Kissinger + Track II + Holbrooke Dayton + Mitchell GFA 1998; Pearson Suez 1956 + UN DPKO Blue Helmets + Brahimi 2000 + Rwanda + Srebrenica + UNSC 1325; Norway + Vatican + India-Pakistan + Syria mediation." },
      { slug: "consular-affairs-and-protocol", title: "Consular Affairs + Protocol", level: "expert", order: 7, pages: ["consular-vienna-1963", "protocol-ceremonial", "public-cultural-diplomacy-nye"], prereqs: ["diplomacy-foundations-and-history"], description: "Vienna Consular Convention 1963 + visa + American Citizen Services + emergency + LaGrand case; credentials presentation + precedence + national-day + 21-gun salute + state visits; Nye soft power + VOA + BBC + RT + Confucius Institutes + Goethe-Institut + British Council + DAAD + Fulbright + Cull + Cha + Cohen." },
      { slug: "modern-frontier-diplomacy", title: "Modern Frontier", level: "expert", order: 8, pages: ["digital-diplomacy-westcott", "climate-paris-cop", "great-power-ai-chips"], prereqs: ["multilateral-institutions-and-un", "crisis-and-conflict-resolution", "economic-and-trade-diplomacy"], description: "Westcott digital diplomacy + Twitter diplomacy + Manor + Bjola + cyber norms Tallinn Manual + UNGGE; Paris Agreement 2015 + UNFCCC COPs + Glasgow + UAE COP28 + Loss and Damage Fund; Allison Thucydides Trap + Mearsheimer + Brzezinski + Kissinger + AI chip controls 2022 + Bletchley 2023 + Bremmer technopolar + decolonial AU/ASEAN." },
    ],
  });

  // P83 — Geographer path. From Eratosthenes + Humboldt + Ritter +
  // Vidal de la Blache through Sauer + Harvey + Massey to physical
  // geography (Köppen + biomes — viz anchor), human geography +
  // Anderson Imagined Communities, political geography Mackinder +
  // Spykman, regional geography, environment + Brundtland +
  // Rockström planetary boundaries, and modern frontier — Google
  // Earth + GeoBERT + critical geographies.
  seedMasteryPath({
    slug: "geographer",
    title: "Geographer",
    description:
      "From Eratosthenes' Earth circumference 240 BCE + al-Idrisi 1154 + Alexander von Humboldt 1799-1804 South America + Cosmos 1845 + Ritter through Ratzel/Huntington environmental determinism + Vidal de la Blache possibilism + Sauer Berkeley school cultural landscape + Schaefer-Bunge quantitative revolution + Harvey/Massey critical/feminist geography; physical geography + climate + biomes (Hadley + Ferrel + Polar cells + ITCZ + Coriolis + ENSO + Gulf Stream + Köppen-Geiger classification with interactive climograph viz + Trewartha + Holdridge life zones + Whittaker biome plot + Wallace 1876 zoogeographic regions); hydrology + geomorphology (Horton-Strahler stream order + Shields sediment + fluvial/glacial/aeolian/coastal/karst + Dokuchaev + Hans Jenny soils + Milankovitch Quaternary glaciation); human geography (Sauer cultural landscape + diffusion + language families + von Thünen + Weber industrial + Christaller central place + Wallerstein world-systems + Gereffi GVCs); political geography (Westphalia 1648 + Mackinder Heartland + Spykman Rimland + Cohen shatterbelts + Anderson Imagined Communities + nationalism + Ó Tuathail critical geopolitics + Agnew territorial trap); regional geography (Europe + East Asia + Sub-Saharan + Latin America + Pacific Rim + de Blij + Cohen); environment + sustainability (Myers biodiversity hotspots + Crutzen Anthropocene + Brundtland 1987 + UN SDGs + Rockström planetary boundaries + Wackernagel footprint + Costanza ecosystem services + Hickel degrowth); and modern frontier — Google Earth + OpenStreetMap + Sentinel + Karra land cover + GeoBERT + Hays GeoCLIP + Manvi LLMs + Hunt indigenous + Sundberg decolonial + Robinson climate justice + Bullard environmental justice. The geography stack end-to-end.",
    nodes: [
      { slug: "geography-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-modern-humboldt", "determinism-possibilism", "modern-quantitative-critical"], prereqs: [], description: "Eratosthenes 240 BCE + al-Idrisi 1154 + Humboldt 1799-1804 + Cosmos 1845 + Ritter; Ratzel + Huntington determinism vs Vidal de la Blache possibilism + Sauer Berkeley school; Schaefer + Bunge quantitative + Harvey + Massey critical + Rose feminist + Thrift non-representational + Anthropocene." },
      { slug: "physical-geography-climate-and-biomes", title: "Physical Geography + Climate + Biomes", level: "practitioner", order: 2, pages: ["climate-drivers-itcz", "koppen-classification", "biomes-wallace"], prereqs: ["geography-foundations-and-history"], description: "Hadley + Ferrel + Polar + ITCZ + Coriolis + ENSO + Gulf Stream + thermohaline; Köppen-Geiger Af → Dfc (interactive climograph viz) + Trewartha + Holdridge; tropical rainforest + savanna + desert + Mediterranean + temperate + boreal + tundra + Whittaker + Wallace 1876 zoogeographic." },
      { slug: "hydrology-and-geomorphology", title: "Hydrology + Geomorphology", level: "specialist", order: 3, pages: ["water-cycle-stream-order", "landforms-processes", "earth-surface-systems"], prereqs: ["physical-geography-climate-and-biomes"], description: "Drainage basins + Horton-Strahler + meanders + Shields sediment; fluvial + glacial + aeolian + coastal + karst + Dokuchaev + Hans Jenny CLORPT soils; Amazon + Nile + Yangtze + Sahara + Greenland + Milankovitch Quaternary glaciation." },
      { slug: "human-geography-and-cultural-regions", title: "Human Geography + Cultural Regions", level: "specialist", order: 4, pages: ["cultural-sauer-diffusion", "population-distribution", "economic-von-thunen-wallerstein"], prereqs: ["geography-foundations-and-history"], description: "Sauer + cultural landscapes + diffusion (relocation + expansion + hierarchical) + language families; population distribution + density + age structure + migration; von Thünen agricultural + Weber industrial location + Christaller central place + Wallerstein world-systems + Gereffi global value chains." },
      { slug: "political-geography-and-borders", title: "Political Geography + Borders", level: "expert", order: 5, pages: ["state-mackinder-spykman", "nations-anderson-smith", "geopolitics-modern"], prereqs: ["human-geography-and-cultural-regions"], description: "Westphalia 1648 + Mackinder Heartland 1904 + Spykman Rimland + Cohen shatterbelts + enclaves/exclaves; Anderson Imagined Communities + Smith ethno-symbolism + nationalism + Kashmir + Catalunya; Ó Tuathail critical geopolitics + Agnew territorial trap + South China Sea + Russia-Ukraine." },
      { slug: "regional-geography", title: "Regional Geography", level: "expert", order: 6, pages: ["world-regions", "sub-continental", "region-methodology"], prereqs: ["physical-geography-climate-and-biomes", "human-geography-and-cultural-regions"], description: "Europe + Russia + East Asia + South Asia + SE Asia + Middle East + Africa + Latin America + Oceania + North America + Polar; Mediterranean + Sahel + Loess Plateau + Indo-Gangetic + Pacific Rim + Silicon Valley; formal/functional/perceptual regions + Cohen + de Blij." },
      { slug: "environment-and-sustainability", title: "Environment + Sustainability", level: "expert", order: 7, pages: ["biodiversity-hotspots", "climate-change-geography", "sustainable-development"], prereqs: ["physical-geography-climate-and-biomes", "regional-geography"], description: "Myers 1988 hotspots + Amazon deforestation + UNCCD + Montreal Protocol 1987 + ocean plastics; IPCC 6th + sea-level rise + Bangladesh + Tuvalu + Anthropocene Crutzen; Brundtland 1987 + UN SDGs 2030 + planetary boundaries Rockström + Wackernagel ecological footprint + Costanza + Hickel degrowth." },
      { slug: "modern-frontier-geography", title: "Modern Frontier", level: "expert", order: 8, pages: ["digital-geospatial", "ai-geography", "critical-future"], prereqs: ["political-geography-and-borders", "environment-and-sustainability"], description: "Google Earth + OpenStreetMap + Sentinel + Karra land cover + Microsoft Building Footprints + UN Habitat; GeoBERT + Stein anomaly + Tobler 1st law in ML + GeoCLIP Hays + LLMs for place description Manvi; Harvey + Massey + Hunt indigenous + Sundberg decolonial + Robinson climate justice + Bullard environmental justice." },
    ],
  });

  // P82 — Public Health Professional path. John Snow Broad Street
  // 1854 + Chadwick + WHO 1948 + Alma-Ata 1978 through epidemiology
  // essentials (Bradford Hill + DAGs Pearl-Hernán), infectious disease
  // + SIR/SEIR Kermack-McKendrick (the viz anchor), vaccines + EPI +
  // Gavi + COVAX, chronic disease + Rose population strategy + Thaler
  // nudges, environmental + occupational health + Pope-Dockery PM2.5
  // + IPCC climate-health, health systems Beveridge/Bismarck/Singapore
  // + QALY NICE, and modern frontier — wastewater + Biobot + Jha
  // pandemic preparedness + WHO pandemic accord 2024 + planetary
  // health Whitmee.
  seedMasteryPath({
    slug: "public-health-professional",
    title: "Public Health Professional",
    description:
      "From John Snow Broad Street pump 1854 + Edwin Chadwick Sanitary Report 1842 + Lemuel Shattuck 1850 + Pasteur germ theory + WHO 1948 founding + Alma-Ata 1978 primary health care through smallpox eradication 1980 + DOTS + ORS + ACT + ART + HPV vaccine; epidemiology essentials (incidence vs prevalence + RR + OR + DALYs/QALYs Murray-Lopez GBD + cohort + case-control + RCT + cluster + stepped-wedge + Bradford Hill criteria + Pearl DAGs + Hernán confounding + Wilson-Jungner screening); infectious disease + epidemic curves (Kermack-McKendrick 1927 SIR + SEIR + R₀ + Re + Anderson-May + herd immunity 1 - 1/R₀ + measles 95% — interactive epidemic-curve viz + Ferguson Imperial 2020 + Flaxman-Bhatt + 1918 flu + Ebola West Africa 2014 + COVID-19); vaccines + immunization programs (vaccine platforms + adjuvants + EPI WHO 1974 + DTP + measles + polio + cold chain + Gavi Alliance + Larson Vaccine Confidence + DHS + admin/serosurvey + AEFI VAERS + Brighton + SEP Henderson + GPEI + HPV Australia + COVID equity COVAX); chronic disease + behavioral (MPOWER tobacco + WHO FCTC + sugar tax + Friedan diabetes + Framingham + Health Belief + TPB Ajzen + Stages of Change Prochaska + Halpern + Thaler-Sunstein nudges + Rose population strategy + Mexico/UK sugar tax 2018); environmental + occupational health (PM2.5 Pope-Dockery + Harvard Six Cities + WHO AQ 2021 + climate-health IPCC 6th + Lancet Countdown + Klinenberg heat + vector-borne expanding + occupational silicosis + Bradford Hill + Rana Plaza 2013); health systems + economics (Beveridge UK + Bismarck Germany + Singapore mixed + Roemer + Akerlof + Medicare/Medicaid + ACA 2010 + QALYs + NICE £20-30k + WHO CHOICE + UHC + Rwanda mutuelles); and modern frontier — wastewater Biobot SARS-CoV-2 + syndromic + mobility Apple/Google + Jha pandemic preparedness + IHR 2005 + WHO pandemic accord 2024 + PEPFAR + GAVI + CEPI + Murray GBD 2024 + UN SDG 3 + Lancet Countdown + Whitmee planetary health. The public-health stack end-to-end.",
    nodes: [
      { slug: "public-health-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-snow-chadwick", "modern-milestones-smallpox", "key-concepts-rose-marmot"], prereqs: [], description: "Snow Broad Street 1854 + Chadwick 1842 + Shattuck 1850 + Pasteur + WHO 1948 + Alma-Ata 1978; smallpox 1980 + DOTS + ORS + ACT + ART + HPV; Rose prevention paradox + Marmot social gradient + primary/secondary/tertiary prevention + population vs individual." },
      { slug: "epidemiology-essentials-for-ph", title: "Epidemiology Essentials", level: "practitioner", order: 2, pages: ["measures-rr-or-dalys", "study-designs-rct-cohort", "biases-pearl-bradford-hill"], prereqs: ["public-health-foundations-and-history"], description: "Incidence + prevalence + RR + OR + NNT + DALYs/QALYs + Murray-Lopez GBD; cohort + case-control + RCT + cluster + stepped-wedge + Bradford Hill criteria; selection + information + confounding + Pearl DAGs + Hernán + Wilson-Jungner screening." },
      { slug: "infectious-disease-and-epidemic-curves", title: "Infectious Disease + Epidemic Curves", level: "specialist", order: 3, pages: ["sir-seir-models", "herd-immunity-threshold", "outbreak-response-history"], prereqs: ["epidemiology-essentials-for-ph"], description: "Kermack-McKendrick 1927 + R₀ + Re + Anderson-May (interactive epidemic-curve viz); herd immunity 1 - 1/R₀ + measles 95% + COVID + variants; contact tracing + NPIs + Ferguson Imperial 2020 + Flaxman-Bhatt + 1918 flu + HIV + Ebola West Africa 2014 + COVID-19." },
      { slug: "vaccines-and-immunization-programs", title: "Vaccines + Immunization Programs", level: "specialist", order: 4, pages: ["platforms-adjuvants", "epi-gavi-coverage", "major-programs"], prereqs: ["infectious-disease-and-epidemic-curves"], description: "Platforms + adjuvants + EPI WHO 1974 + DTP + measles + polio + cold chain + Gavi + Larson Vaccine Confidence + WHO SAGE; DHS + admin + serosurvey + AEFI VAERS + Brighton; SEP Henderson + GPEI + measles MR + HPV Australia + COVID COVAX." },
      { slug: "chronic-disease-and-behavioral-public-health", title: "Chronic Disease + Behavioral PH", level: "expert", order: 5, pages: ["ncds-tobacco-mpower", "behavioral-models", "population-rose-interventions"], prereqs: ["epidemiology-essentials-for-ph"], description: "MPOWER tobacco + WHO FCTC + Friedan Diabetes + Framingham; Health Belief Skinner-Champion + TPB Ajzen + Stages of Change Prochaska + Halpern behavioral insights + Thaler-Sunstein; Rose population vs high-risk + tobacco control + UK trans-fat ban + sugar tax Mexico/UK 2018." },
      { slug: "environmental-and-occupational-health", title: "Environmental + Occupational Health", level: "expert", order: 6, pages: ["air-water-housing", "climate-change-health", "occupational-hazards"], prereqs: ["public-health-foundations-and-history"], description: "PM2.5 Pope-Dockery + Harvard Six Cities + WHO AQ 2021 + lead Reuben + Legionella + radon + asbestos; heat Klinenberg + IPCC 6th + vector-borne malaria/dengue/Lyme + Lancet Countdown; silicosis + asbestosis + ergonomics + Bradford Hill + Rana Plaza 2013." },
      { slug: "health-systems-and-economics", title: "Health Systems + Economics", level: "expert", order: 7, pages: ["systems-comparison-beveridge-bismarck", "financing-qaly-nice", "lmic-uhc"], prereqs: ["public-health-foundations-and-history"], description: "Beveridge UK NHS + Bismarck Germany SHI + Canada + out-of-pocket + Singapore mixed; Roemer + Akerlof + Glied + Medicare/Medicaid + ACA 2010 + QALYs + NICE £20-30k + WHO CHOICE; UHC + China rural + Rwanda mutuelles + Mexico Seguro Popular + Atun-Khan reform." },
      { slug: "modern-frontier-public-health", title: "Modern Frontier", level: "expert", order: 8, pages: ["digital-ai-surveillance", "pandemic-preparedness", "global-planetary-health"], prereqs: ["vaccines-and-immunization-programs", "chronic-disease-and-behavioral-public-health", "health-systems-and-economics"], description: "Biobot wastewater SARS-CoV-2 + syndromic + Apple/Google mobility + ML outbreak detection + Jha pandemic preparedness; IHR 2005 + WHO pandemic accord 2024 + PEPFAR + GAVI + CEPI + 100 Days Mission; Murray GBD 2024 + UN SDG 3 + WHO Triple Billion + Lancet Countdown + Whitmee Rockefeller planetary health." },
    ],
  });

  // P81 — Astronomer path. From Hipparchus + Ptolemy + Copernicus +
  // Tycho + Kepler + Galileo + Newton through Hubble Cepheid distances
  // + Jansky radio + Leavitt period-luminosity; celestial mechanics +
  // Kepler orbits (the viz anchor), light + spectra + telescopes,
  // stars + HR diagram + Burbidge nucleosynthesis, galaxies + Hubble
  // tuning fork + Sagittarius A* Genzel-Ghez 2020 Nobel, planetary
  // science + exoplanets + Mayor-Queloz 2019 Nobel, time-domain +
  // gravitational waves + LIGO + GW170817, and modern frontier —
  // JWST + Euclid + Vera Rubin LSST + AI for astronomy + Galaxy Zoo.
  seedMasteryPath({
    slug: "astronomer",
    title: "Astronomer",
    description:
      "From Hipparchus precession 129 BCE + Ptolemy Almagest ~150 CE + Copernicus 1543 + Tycho Brahe naked-eye precision + Kepler three laws 1609/1619 + Galileo 1610 telescope (Jovian moons + Venus phases) + Newton Principia 1687 + Herschel discovers Uranus 1781 + Le Verrier predicts Neptune 1846 + Bessel parallax 1838 + Hubble 1924 galaxies external + 1929 redshift-distance + Leavitt 1908 Cepheid period-luminosity + Jansky 1932 radio; celestial mechanics + orbits (Kepler ellipses + equal-areas + T² ∝ a³ + orbital elements a/e/i/Ω/ω/ν + n-body Lagrange points + Hill sphere — interactive Kepler-orbits viz with Mercury/Earth/Mars/Halley); light + spectra + telescopes (Planck blackbody + Wien + Stefan-Boltzmann + Fraunhofer + Bunsen-Kirchhoff + Doppler radial velocity + 21-cm hydrogen + refractor/reflector + Hubble + JWST + Roman + Vera Rubin LSST 2025 + EHT interferometry); stars + stellar evolution (HR diagram Hertzsprung-Russell + spectral classes O-B-A-F-G-K-M + Bethe CNO + pp chain + Burbidge B²FH 1957 + triple-alpha + r-process + red giant + planetary nebula + white dwarf Chandrasekhar + neutron star + black hole + Type Ia + Type II supernovae); galaxies + large-scale structure (Milky Way + Sgr A* Genzel-Ghez Nobel 2020 + Hubble tuning fork + Sa-Sc + AGN + local group + Virgo + Laniakea Tully + cosmic web + SDSS); planetary science + exoplanets (terrestrial vs gas + Cassini Saturn + New Horizons Pluto + JUICE/Europa Clipper + Mayor-Queloz Nobel 2019 51 Peg b + Kepler/TESS transit + TRAPPIST-1 + JWST atmospheres + Drake equation); time-domain + multimessenger (GRBs Klebesadel 1973 + kilonovae + LIGO 2015 BBH + GW170817 BNS + LISA 2030s + pulsars + magnetars + FRBs Lorimer + Chime + Vera Rubin LSST alerts); and modern frontier — JWST 2022 + Euclid 2023 + Roman 2027 + Vera Rubin LSST + SKA + ELT 39m + AI Galaxy Zoo + Zoobot + Charnock Moss + Stein anomaly detection + AAVSO + Gaia DR3 + Starlink interference + dark sky preservation. The astronomy stack end-to-end.",
    nodes: [
      { slug: "astronomy-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-telescope-era", "newton-le-verrier-bessel", "20c-hubble-leavitt-jansky"], prereqs: [], description: "Hipparchus + Ptolemy + Copernicus 1543 + Tycho + Kepler 1609/1619 + Galileo 1610 + Newton Principia 1687; Herschel Uranus 1781 + Le Verrier Neptune 1846 + Bessel 61 Cygni 1838; Hubble 1924/1929 + Leavitt 1908 Cepheid + Shapley + Jansky radio 1932 + Reber." },
      { slug: "celestial-mechanics-and-kepler-orbits", title: "Celestial Mechanics + Kepler Orbits", level: "practitioner", order: 2, pages: ["kepler-laws-derivation", "orbital-elements", "n-body-lagrange-tidal"], prereqs: ["astronomy-foundations-and-history"], description: "(1) ellipses + Sun at focus (2) equal areas (3) T² ∝ a³ + Newton derivation; a + e + i + Ω + ω + ν + epoch (interactive Kepler-orbits viz); n-body Lagrange L1-L5 + Hill sphere + tidal locking + chaos Hyperion + Halley's comet." },
      { slug: "light-spectra-and-telescopes", title: "Light + Spectra + Telescopes", level: "specialist", order: 3, pages: ["em-spectrum-blackbody", "spectroscopy-doppler", "telescopes-jwst-vera-rubin"], prereqs: ["astronomy-foundations-and-history"], description: "Planck blackbody + Wien + Stefan-Boltzmann; Fraunhofer + Bunsen-Kirchhoff + emission/absorption + Doppler radial velocity + 21-cm H; refractor + reflector + Schmidt-Cassegrain + adaptive optics + Hubble + JWST + Roman + Vera Rubin LSST 2025 + EHT VLTI interferometry + CCD photometry." },
      { slug: "stars-and-stellar-evolution", title: "Stars + Stellar Evolution", level: "specialist", order: 4, pages: ["hr-diagram-spectral-classes", "nucleosynthesis-bethe-burbidge", "lifecycle-supernovae"], prereqs: ["celestial-mechanics-and-kepler-orbits"], description: "HR Hertzsprung 1911 + Russell 1913 + main sequence + giants + Morgan-Keenan O-B-A-F-G-K-M; Bethe 1939 CNO + pp + Burbidge B²FH 1957 + triple-alpha + r/s-process; protostars + main sequence + red giants + planetary nebulae + white dwarfs Chandrasekhar + neutron stars + Type Ia + Type II core collapse." },
      { slug: "galaxies-and-large-scale-structure", title: "Galaxies + Large-Scale Structure", level: "expert", order: 5, pages: ["milky-way-sgr-a", "galaxy-types-hubble", "large-scale-laniakea"], prereqs: ["stars-and-stellar-evolution"], description: "Milky Way disk + bulge + halo + bar + Sgr A* SMBH Genzel-Ghez Nobel 2020 + Oort + Kuiper + Reid Sgr stream; Hubble tuning fork (E + S + SB) + de Vaucouleurs + AGN; local group + Virgo + Laniakea Tully + cosmic web filaments + voids + Sloan Great Wall + 2dF + SDSS + BAO." },
      { slug: "planetary-science-and-exoplanets", title: "Planetary Science + Exoplanets", level: "expert", order: 6, pages: ["solar-system-terrestrial-gas", "detection-radial-transit", "habitability-drake"], prereqs: ["celestial-mechanics-and-kepler-orbits"], description: "Terrestrial vs gas + asteroid belt + Kuiper + Oort + Pluto + Cassini + New Horizons + JUICE/Europa Clipper; Mayor-Queloz Nobel 2019 51 Peg b + Kepler/TESS transit + microlensing + direct imaging; habitable zone + TRAPPIST-1 + Proxima b + JWST atmosphere + Drake + Fermi paradox." },
      { slug: "time-domain-and-multimessenger", title: "Time-Domain + Multimessenger", level: "expert", order: 7, pages: ["transients-supernovae-grbs", "gravitational-waves-ligo", "pulsars-frbs-chime"], prereqs: ["light-spectra-and-telescopes", "stars-and-stellar-evolution"], description: "Supernovae + GRBs Klebesadel 1973 + TDEs + kilonovae GW170817; LIGO 2015 BBH + GW170817 BNS + LISA 2030s + MMA multimessenger; pulsars + magnetars + FRBs Lorimer 2007 + Chime + FRB121102 + neutron star Will-Pretorius + Vera Rubin LSST alerts." },
      { slug: "modern-frontier-astronomy", title: "Modern Frontier", level: "expert", order: 8, pages: ["instruments-2020s-jwst-rubin", "ai-galaxy-zoo-zoobot", "open-data-amateur-ethics"], prereqs: ["galaxies-and-large-scale-structure", "planetary-science-and-exoplanets", "time-domain-and-multimessenger"], description: "JWST 2022 + Euclid 2023 + Roman 2027 + Vera Rubin LSST 2025 + SKA + EHT + LISA + DESI + Subaru HSC + ELT 39m + TMT + GMT; Galaxy Zoo + Zoobot + Charnock Moss transients + Stein anomaly + LIGO ML + Sloan Atlas; AAVSO + Pan-STARRS + Gaia DR3 + Starlink interference + light pollution + Antarctic + South Africa SKA." },
    ],
  });

  // P80 — Cinematographer path. From Lumière 1895 + Méliès + Griffith
  // through Toland Citizen Kane deep focus + classical Hollywood +
  // modern masters Storaro/Deakins/Lubezki/Hoyte van Hoytema; optics
  // + cameras + sensors + ARRI/RED/film; shot composition + aspect
  // ratios + thirds + golden ratio (the viz anchor); lighting +
  // 3-point + Kino Flo + ACES + DCI-P3; camera movement +
  // Steadicam Garrett Brown + virtual production StageCraft; editing
  // + Eisenstein montage + Murch + Avid/Resolve; cinematography
  // styles + film noir + New Wave Coutard + Dogme 95; and modern
  // frontier — Runway Gen-3 + Sora + Pika + LED volume + 1917
  // Mendes-Deakins long takes.
  seedMasteryPath({
    slug: "cinematographer",
    title: "Cinematographer",
    description:
      "From Edison Kinetoscope + Lumière 1895 + Méliès trick films + Griffith Birth of a Nation 1915 (close-up + cross-cutting) + Murnau Sunrise through Toland Citizen Kane 1941 deep focus + classical Hollywood + Wong + Howe + Cardiff; modern masters — Storaro Apocalypse Now + Khondji Se7en + Doyle In the Mood for Love + Lubezki Birdman/Revenant + Deakins Blade Runner 2049 + Hoyte van Hoytema Dunkirk/Interstellar; optics + cameras + sensors (lenses Cooke/Zeiss/Panavision/ARRI + anamorphic squeeze + film Eastman Kodak 5219 + digital ARRI Alexa + RED + Sony Venice + log gamma + ACES); shot composition (aspect ratios Academy 1.85 + anamorphic 2.39 + 16:9 + IMAX 1.43 + rule of thirds + golden ratio φ + dynamic symmetry + safe zones + Kuleshov + eyeline match — interactive frame viz); lighting + color (3-point + HMI + LED Aputure/SkyPanel + CRI/TLCI + Rec.709/Rec.2020/ACES/DCI-P3 + Hurlbut/Story DI); camera movement + rigging (Steadicam Garrett Brown + dolly + crane + DJI/Movi gimbals + virtual production StageCraft Mandalorian 2019 + Unreal Engine ICVFX); editing + continuity (Eisenstein Battleship Potemkin + Vertov + Walter Murch In the Blink of an Eye + 6 rules + Avid + Resolve + LUFS); cinematography styles + genre (German Expressionism + film noir + French New Wave Coutard + Dogme 95 + Almendros Days of Heaven + Müller Paris Texas); and modern frontier — Runway Gen-3 + Pika + Sora OpenAI + Veo Google + LED volume + 1917 Mendes-Deakins + Birdman + future of the DP role. The cinematography stack end-to-end.",
    nodes: [
      { slug: "cinematography-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["silents-classical", "toland-citizen-kane", "modern-masters-storaro-deakins"], prereqs: [], description: "Edison + Lumière 1895 + Méliès + Griffith 1915 + Murnau Sunrise + Sjöström; Toland Citizen Kane 1941 deep focus + Howe + Cardiff; Storaro + Khondji + Doyle + Lubezki + Deakins + Hoyte van Hoytema." },
      { slug: "optics-cameras-and-sensors", title: "Optics + Cameras + Sensors", level: "practitioner", order: 2, pages: ["lens-fundamentals", "sensors-recording", "resolution-frame-rate"], prereqs: ["cinematography-foundations-and-history"], description: "Focal length + aperture + DOF + Petzval + Cooke + Zeiss + Panavision Primo + ARRI anamorphic; film Eastman Kodak 5219 + digital ARRI Alexa + RED + Sony Venice + log gamma + ProRes/RAW; 2K-8K + 24/48 fps + Showscan Doug Trumbull." },
      { slug: "shot-composition-and-framing", title: "Shot Composition + Framing", level: "specialist", order: 3, pages: ["aspect-ratios", "composition-thirds-golden", "shot-scales-kuleshov"], prereqs: ["cinematography-foundations-and-history"], description: "Academy 1.37/1.85 + anamorphic 2.39 + 16:9 + 4:3 + IMAX 1.43; rule of thirds + golden ratio φ + leading lines + 180° rule (interactive frame viz with overlays); ECU/CU/MS/WS + Dutch tilt + Kuleshov + eyeline match." },
      { slug: "lighting-and-color", title: "Lighting + Color", level: "specialist", order: 4, pages: ["3-point-chiaroscuro", "fixtures-tungsten-led", "color-aces-rec709"], prereqs: ["optics-cameras-and-sensors"], description: "Key/fill/back + practical + high-key vs low-key + chiaroscuro Caravaggio; tungsten + HMI + Kino Flo + Aputure/ARRI SkyPanel + Litepanels + Astera; CCT + CRI/TLCI + sRGB/Rec.709/Rec.2020/ACES + DCI-P3 + Hurlbut + Story DI + LUT Resolve." },
      { slug: "camera-movement-and-rigging", title: "Camera Movement + Rigging", level: "expert", order: 5, pages: ["movement-vocabulary", "rigs-steadicam-gimbal", "virtual-production-stagecraft"], prereqs: ["optics-cameras-and-sensors"], description: "Pan + tilt + dolly + truck + crane + zoom + Steadicam Garrett Brown + handheld + Snorricam + dolly-zoom; fluid head + tripod + jib + technocrane + Russian arm + drones DJI Inspire + Movi/Ronin; LED walls StageCraft Mandalorian + Unreal Engine + ICVFX." },
      { slug: "editing-and-continuity", title: "Editing + Continuity", level: "expert", order: 6, pages: ["editing-theory-eisenstein", "continuity-match-cut", "software-avid-resolve"], prereqs: ["shot-composition-and-framing"], description: "Eisenstein Battleship Potemkin + montage + Kuleshov effect + Vertov + Walter Murch In the Blink of an Eye 6 rules; match cut + jump cut + L/J cut + cross-cutting + De Palma + Scorsese; Avid + Final Cut + Resolve + Premiere + LUFS EBU R128." },
      { slug: "cinematography-styles-and-genre", title: "Styles + Genres", level: "expert", order: 7, pages: ["schools-noir-new-wave", "genre-horror-doc", "influential-dps"], prereqs: ["lighting-and-color", "camera-movement-and-rigging"], description: "German Expressionism Caligari + French Poetic Realism + Italian Neorealism De Sica + noir + French New Wave Coutard Breathless + New Hollywood Willis + Dogme 95; Argento + Bava + Maysles + Pennebaker + Wiseman direct cinema; Storaro + Almendros + Müller + Khondji + Deakins + Lubezki + Yedlin." },
      { slug: "modern-frontier-cinematography", title: "Modern Frontier", level: "expert", order: 8, pages: ["virtual-production-stagecraft", "ai-runway-sora-pika", "trends-hdr-streaming"], prereqs: ["editing-and-continuity", "cinematography-styles-and-genre"], description: "Lucasfilm StageCraft Mandalorian 2019 + LED volume + Unreal Engine + virtual scouting + Yedlin VP + Maleficent 2; Runway Gen-3 + Pika + Sora OpenAI + Veo Google + diffusion video + ML rotoscoping + ML color grading; HDR + Dolby Vision + IMAX expansion + 1917 Mendes-Deakins + Birdman + future of the DP role." },
    ],
  });

  // P79 — Cartographer path. From Ptolemy + portolans + Waldseemüller +
  // Mercator 1569 through Beck London Tube + Tobler first law + GIScience
  // Goodchild; geodesy + WGS84 + projections + Tissot distortion (the
  // viz anchor); GIS fundamentals (Shapefile + GeoJSON + GDAL + PostGIS
  // + QGIS); thematic mapping + Jenks + ColorBrewer + Bertin + MAUP;
  // topography + DEMs + Imhof shading; web mapping + tiles + Leaflet
  // + Mapbox + deck.gl; geospatial analysis + Moran's I + kriging +
  // routing; and modern frontier — Sentinel + Planet + Google Earth
  // Engine + SegmentAnything + Overture Maps + critical cartography
  // Harley.
  seedMasteryPath({
    slug: "cartographer",
    title: "Cartographer",
    description:
      "From Anaximander 6th c BCE + Ptolemy Geographia ~150 CE + Tabula Rogeriana 1154 + Fra Mauro 1450 + Waldseemüller 1507 (first 'America') + Mercator 1569 through Ordnance Survey + Beck 1933 London Tube topological map + Tufte + Tobler first law + GIScience Goodchild; geodesy + coordinate systems + projections (geoid + ellipsoid WGS84 + EPSG codes + cylindrical Mercator/Web Mercator + conic Lambert/Albers + azimuthal stereographic + pseudo-cylindrical Mollweide/Robinson/Winkel-Tripel + Equal Earth Šavrič 2018 — interactive projections viz with Tissot indicatrix + Snyder USGS 1395); GIS fundamentals (Shapefile + GeoJSON + GeoPackage + GeoTIFF + spatial operations buffer/overlay + PostGIS + GDAL + QGIS + geopandas Pebesma sf + Egenhofer 9-intersection); thematic mapping (choropleth + Jenks natural breaks + Brewer ColorBrewer + Bertin visual variables + MacEachren How Maps Work + MAUP Openshaw); topography + relief (SRTM + Copernicus + USGS 3DEP + lidar + Imhof Cartographic Relief Presentation + Tom Patterson manual shading); web mapping + tiles (Google Maps 2005 + slippy map + XYZ + vector MVT + PMTiles Brandon Liu + Leaflet Agafonkin + Mapbox + MapLibre + deck.gl Uber + Cesium); geospatial analysis (Moran's I + LISA Anselin + kriging Matheron-Krige + GWR Fotheringham + Dijkstra + OSRM + Nominatim); and modern frontier — Landsat 1972 + Sentinel ESA + Planet daily + Google Earth Engine Gorelick + AWS Open Data + SegmentAnything + Microsoft AI for Earth + Overture Maps + critical cartography Wood Power of Maps + Harley Deconstructing the Map + Strava heatmap leaks 2018. The cartography stack end-to-end.",
    nodes: [
      { slug: "cartography-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-renaissance-mercator", "modern-beck-tobler-goodchild", "digital-cartography"], prereqs: [], description: "Anaximander + Ptolemy + Tabula Rogeriana 1154 + Fra Mauro + portolan charts + Waldseemüller 1507 + Mercator 1569; Ordnance Survey + USGS + Beck 1933 London Tube + Tufte + Tobler first law + Goodchild GIScience + McMaster." },
      { slug: "geodesy-coordinate-systems-and-projections", title: "Geodesy + Projections", level: "practitioner", order: 2, pages: ["geodesy-wgs84-epsg", "projection-families", "tissot-distortion"], prereqs: ["cartography-foundations-and-history"], description: "Geoid + ellipsoid WGS84 + ITRF + EPSG codes + NAD27→NAD83 + GPS WGS84-G2139; cylindrical Mercator + Web Mercator 3857 + conic Lambert/Albers + azimuthal + Mollweide/Robinson/Winkel-Tripel + Goode + Equal Earth Šavrič 2018 (interactive viz); Tissot indicatrix + Snyder USGS 1395." },
      { slug: "gis-fundamentals-and-spatial-data", title: "GIS Fundamentals", level: "practitioner", order: 3, pages: ["vector-raster-formats", "spatial-operations", "open-source-stack"], prereqs: ["geodesy-coordinate-systems-and-projections"], description: "Shapefile + GeoJSON + KML + GeoPackage + GeoTIFF + NetCDF + Zarr; buffer + overlay + dissolve + intersect + voronoi; PostGIS + Spatialite + GDAL/OGR + QGIS + ArcGIS + Python geopandas + R sf Pebesma + xarray + Pangeo + Egenhofer 9-intersection topology." },
      { slug: "thematic-mapping-and-symbolization", title: "Thematic Mapping + Symbolization", level: "specialist", order: 4, pages: ["thematic-types", "classification-colorbrewer", "design-bertin-maceachren"], prereqs: ["cartography-foundations-and-history"], description: "Choropleth + classed vs unclassed + proportional symbols + dot density + flow + cartogram Dorling/Gastner-Newman; Jenks natural breaks + quantiles + Brewer ColorBrewer + sequential/diverging/qualitative + colorblind-safe; Tufte data-ink + Bertin variables + MacEachren How Maps Work + MAUP Openshaw + ecological fallacy." },
      { slug: "topography-and-relief", title: "Topography + Relief", level: "specialist", order: 5, pages: ["dems-srtm-copernicus", "contours-hypsometric", "relief-shading-imhof"], prereqs: ["gis-fundamentals-and-spatial-data"], description: "SRTM + ASTER + Copernicus + USGS 3DEP + ArcticDEM + GEBCO bathymetry; contours + hypsometric tint + hillshade + slope + aspect + Yoëli analytical hillshade; Imhof Cartographic Relief Presentation + Tom Patterson natural earth + AI terrain dem-net." },
      { slug: "web-mapping-and-tiles", title: "Web Mapping + Tiles", level: "expert", order: 6, pages: ["tile-architecture-xyz-vector", "libraries-leaflet-mapbox", "sources-osm-natural-earth"], prereqs: ["gis-fundamentals-and-spatial-data"], description: "Google Maps 2005 + slippy + XYZ + raster vs vector tiles + Mapbox MVT + PMTiles Brandon Liu; Leaflet Volodymyr Agafonkin + OpenLayers + Mapbox GL JS + MapLibre + deck.gl Uber + Cesium 3D globe; Mapbox Style Spec + OSM + Natural Earth + Stamen + CARTO + ESRI." },
      { slug: "geospatial-analysis-and-modeling", title: "Geospatial Analysis", level: "expert", order: 7, pages: ["spatial-statistics-moran-kriging", "spatial-regression-gwr", "routing-geocoding"], prereqs: ["gis-fundamentals-and-spatial-data", "topography-and-relief"], description: "Moran's I global + local LISA Anselin + Geary + variogram + kriging Matheron + Krige; SAR + SEM + GWR Fotheringham-Brunsdon-Charlton + Tobler 1st law; Dijkstra + OSRM + GraphHopper + Valhalla + isochrones + Nominatim + Pelias geocoding." },
      { slug: "modern-frontier-cartography", title: "Modern Frontier", level: "expert", order: 8, pages: ["remote-sensing-sentinel-earth-engine", "ai-segment-anything-overture", "ethics-critical-cartography"], prereqs: ["thematic-mapping-and-symbolization", "web-mapping-and-tiles", "geospatial-analysis-and-modeling"], description: "Landsat 1972 + Sentinel ESA + Planet + Maxar/BlackSky + SAR + InSAR + Google Earth Engine Gorelick + AWS Open Data; SegmentAnything + Bing Maps footprints + Microsoft AI for Earth + Overture Maps + neural fields + 3D Gaussian Splatting; Wood Power of Maps + Harley Deconstructing + critical GIS + indigenous cartography + Strava heatmap leaks 2018." },
    ],
  });

  // P78 — Demographer path. From Graunt 1662 Bills of Mortality +
  // Malthus 1798 + Quetelet + Lotka 1925 + Notestein 1953 demographic
  // transition through Caldwell + Bongaarts + Cleland-Wilson + Lee-
  // Carter 1992 + Vaupel longevity; population structure + pyramids
  // (the viz anchor); fertility + Bongaarts proximate determinants +
  // Becker + Easterlin + Lesthaeghe-Van de Kaa SDT; mortality + life
  // tables + Halley/Gompertz + Lee-Carter + compression Fries +
  // longevity Oeppen-Vaupel; migration + Ravenstein laws + Lee push-
  // pull + Massey + Borjas + climate migration; population projection
  // + cohort-component Leslie + UN WPP + Raftery probabilistic; social
  // demography + family + Cherlin + Goldscheider gender revolution;
  // and modern frontier — aging populations + agent-based Billari +
  // ML for fertility + digital trace + ethics.
  seedMasteryPath({
    slug: "demographer",
    title: "Demographer",
    description:
      "From John Graunt 1662 Natural and Political Observations on London Bills of Mortality + Malthus 1798 Essay on Population + Quetelet l'homme moyen + Lotka 1925 stable population + Notestein 1953 demographic transition + Coale-Hoover 1958 through Caldwell wealth flows + Bongaarts proximate determinants + Cleland-Wilson fertility decline + Lee-Carter 1992 mortality forecast + Vaupel longevity research; population structure + pyramids (age × sex distribution + dependency ratios + Sundbärg expansive/stationary/regressive + demographic transition stages 1-5 + Van de Kaa 1987 second demographic transition + Italy/Japan/Niger case studies — interactive population-pyramid viz); fertility + reproduction (CBR + TFR + cohort vs period + Bongaarts proximate determinants + below-replacement + lowest-low Italy/Korea/Japan + Lutz low-fertility trap + Becker quantity-quality + Easterlin relative income + Lesthaeghe-Van de Kaa SDT); mortality + life tables (Halley 1693 + Gompertz 1825 law + Makeham + Lee-Carter 1992 + Heligman-Pollard + Fries 1980 compression + Oeppen-Vaupel 2002 broken limits + Calment supercentenarian + Olshansky); migration + mobility (Ravenstein 1885 laws + Lee push-pull + Sjaastad human capital + Massey new economics + Borjas selection + Hatton-Williamson + Black-Adger climate migration); population projection (cohort component Lewis-Leslie matrix + UN WPP 2022 medium variant + 9.7 B 2050 + 10.4 B peak 2086 + Raftery-Ševčíková probabilistic); social demography + family (Cherlin 2009 deinstitutionalization + Goldscheider gender revolution + McDonald gender equity + Mare 2011 + Pew family change); and modern frontier — aging Sweden NDC + Japan elder care + computational Billari-Prskawetz agent-based + Yang ML + microsimulation MicSim + Cesare digital trace + LLM-augmented + Reich-Tilcsik demographic surveillance ethics. The demography stack end-to-end.",
    nodes: [
      { slug: "demography-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-graunt-malthus", "modern-notestein-caldwell-vaupel", "data-sources-un-dhs"], prereqs: [], description: "Graunt 1662 + Malthus 1798 + Quetelet + Lotka 1925 + Notestein 1953 demographic transition + Coale-Hoover; Caldwell wealth flows + Bongaarts proximate determinants + Cleland-Wilson + Lee-Carter 1992 + Vaupel longevity; UN WPP + DHS + Census Bureau + Eurostat." },
      { slug: "population-structure-and-pyramids", title: "Population Structure + Pyramids", level: "practitioner", order: 2, pages: ["age-sex-pyramid-types", "demographic-transition-stages", "case-studies-italy-japan-niger"], prereqs: ["demography-foundations-and-history"], description: "Age × sex + dependency ratios + Sundbärg expansive/stationary/regressive; transition stages 1-5 + Van de Kaa 1987 SDT below-replacement; Japan super-aged + Niger youth-heavy + China one-child + India crossover 2023 (interactive viz)." },
      { slug: "fertility-and-reproduction", title: "Fertility + Reproduction", level: "specialist", order: 3, pages: ["measures-cbr-tfr", "bongaarts-proximate-determinants", "below-replacement-cultural-economic"], prereqs: ["population-structure-and-pyramids"], description: "CBR + GFR + ASFR + TFR + PPR + cohort vs period; replacement 2.1 + Bongaarts proximate (marriage + contraception + abortion + lactational amenorrhea); below-replacement + Italy/Korea + Lutz low-fertility trap + Becker quantity-quality + Easterlin + Lesthaeghe-Van de Kaa SDT." },
      { slug: "mortality-life-tables-and-longevity", title: "Mortality + Longevity", level: "specialist", order: 4, pages: ["life-tables-halley-gompertz", "forecast-lee-carter", "longevity-oeppen-vaupel"], prereqs: ["population-structure-and-pyramids"], description: "Halley 1693 Breslau + Gompertz 1825 law + Makeham + cohort vs period e0 + actuarial Lx qx ax; Lee-Carter 1992 + Heligman-Pollard + Fries compression of mortality + rectangularization; Vaupel + Oeppen-Vaupel 2002 + Calment + Olshansky + Lopez-Otin hallmarks-of-aging." },
      { slug: "migration-and-mobility", title: "Migration + Mobility", level: "expert", order: 5, pages: ["types-rates-ravenstein", "theories-lee-massey", "modern-climate-migration"], prereqs: ["population-structure-and-pyramids"], description: "Internal vs international + permanent vs temporary + Ravenstein 1885 laws + migration rates; Lee push-pull + Sjaastad human capital + Massey new economics + Stark relative deprivation + Borjas selection + Hatton-Williamson + Piore dual labor; UN WPP migration + IOM + UNHCR + Goldin Exceptional People + Black-Adger climate." },
      { slug: "population-projection", title: "Population Projection", level: "expert", order: 6, pages: ["cohort-component-leslie", "un-wpp-2022", "probabilistic-raftery"], prereqs: ["fertility-and-reproduction", "mortality-life-tables-and-longevity", "migration-and-mobility"], description: "Lewis-Leslie matrix + Whelpton + UN methodology; UN WPP 2022 medium variant + 9.7 B 2050 + 10.4 B peak 2086 + low/medium/high variants + Raftery-Ševčíková probabilistic + Wilson-Bell uncertainty; subnational Hamilton-Perry + IPUMS." },
      { slug: "social-demography-and-family", title: "Social Demography + Family", level: "expert", order: 7, pages: ["family-formation-cherlin", "gender-work-fertility", "intergenerational-assortative"], prereqs: ["fertility-and-reproduction"], description: "Marriage cohabitation + Goode World Revolution + Cherlin 2009 deinstitutionalization + Lillard-Waite; Goldscheider gender revolution + McDonald gender equity + dual-earner; Sweden register data + Mare 2011 + assortative mating + Pew family change." },
      { slug: "modern-frontier-demography", title: "Modern Frontier", level: "expert", order: 8, pages: ["aging-pensions-sweden-japan", "computational-billari-yang", "ai-digital-trace-ethics"], prereqs: ["population-projection", "social-demography-and-family"], description: "Old-age dependency + Sweden NDC + Japan elder care + Italy fertility crisis; agent-based Billari-Prskawetz + simulation Yang + Wang-Chi ML + microsimulation MicSim; digital trace Pew + Cesare + Bail polarization + LLM projection + Reich-Tilcsik surveillance ethics." },
    ],
  });

  // P77 — Architect path. From Vitruvius + Greek orders + Roman
  // concrete + Brunelleschi + Palladio + Wren through Sullivan +
  // Wright + Bauhaus + Le Corbusier + Mies + Kahn to Hadid +
  // parametric, structural systems + load flow (the viz anchor —
  // beam/cantilever/Pratt truss with live reactions), materials
  // (stone/timber/concrete/steel/CLT), design process (programming
  // → CDs + AIA), building systems (HVAC + Passivhaus + Sabine
  // acoustics), sustainability (LEED + Mazria 2030 + biophilia
  // Benyus + Pearce Eastgate), digital BIM + parametric Grasshopper
  // + AI Spacemaker, and modern frontier — 3D printing ICON + mass
  // timber Mjøstårnet + Gramazio-Kohler robotic + Midjourney.
  seedMasteryPath({
    slug: "architect",
    title: "Architect",
    description:
      "From Vitruvius Ten Books ~30 BCE (firmitas, utilitas, venustas) + Greek orders + Roman concrete + Pantheon Hadrian + Gothic flying buttresses Suger + Brunelleschi 1436 Florence Duomo + Alberti + Palladio Four Books + Wren St. Paul's through Sullivan form-follows-function 1896 + Wright + Bauhaus Gropius + Le Corbusier Five Points 1923 + Mies van der Rohe + Louis Kahn + Hadid parametric + Zumthor + BIG; structural systems + load flow (post-and-beam + trusses + Frei Otto tension + Candela shells + Buckminster Fuller space frames — interactive beam/cantilever/Pratt truss viz with live reactions + bending moment); materials (stone + CLT timber + Portland cement + Ransome-Hennebique reinforced concrete + Freyssinet prestressed + steel + glass + ETFE Eden Project + Hammond-Jones embodied carbon ICE); design process (AIA phases + Rowe Design Thinking + Schön reflective practice + Alexander pattern language + Frampton critical regionalism + Pallasmaa phenomenology); building systems (Lstiburek building science + WUFI + Passivhaus Feist 1991 + Sabine acoustics + LEED daylighting); sustainability (Mazria Architecture 2030 + LEED + WELL + Living Building Challenge + biophilia Kellert + biomimicry Benyus + Pearce Eastgate termite mound + McDonough-Braungart cradle-to-cradle); digital BIM + parametric (Revit + IFC + Eastman BIM Handbook + Grasshopper + Karamba + Ladybug + Galapagos GA optimization + Autodesk Spacemaker + LookX gen-AI); and modern frontier — ICON Vulcan 3D-printed + Apis Cor + Gramazio-Kohler ETH robotic + Mjøstårnet 18-story mass-timber + Brock Commons UBC + kinetic facades Calatrava + Lynn animate form + LLM-augmented Revit. The architecture stack end-to-end.",
    nodes: [
      { slug: "architecture-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-classical-vitruvius", "medieval-renaissance-palladio", "modern-contemporary-corbusier-hadid"], prereqs: [], description: "Vitruvius Ten Books ~30 BCE + Greek orders + Roman + Pantheon + Gothic Suger + Brunelleschi 1436 + Alberti + Palladio + Wren; Romanesque + flying buttresses + Renaissance domes; Sullivan + Wright + Bauhaus + Le Corbusier + Mies + Kahn + Venturi + Hadid + Zumthor + BIG + Toyo Ito." },
      { slug: "structural-systems-and-load-flow", title: "Structural Systems + Load Flow", level: "practitioner", order: 2, pages: ["loads-codes", "systems-trusses-frames-shells", "statics-bending-moment"], prereqs: ["architecture-foundations-and-history"], description: "Dead + live + wind + seismic + Eurocode/IBC; post-and-beam + trusses + frames + shear walls + Frei Otto tension + Candela shells + Buckminster Fuller; equilibrium ΣF=0 ΣM=0 + reactions + bending moment + shear force + Euler-Bernoulli (interactive beam/cantilever/truss viz)." },
      { slug: "materials-of-architecture", title: "Materials", level: "practitioner", order: 3, pages: ["traditional-stone-timber", "modern-concrete-steel-glass", "sustainable-clt-rammed-earth"], prereqs: ["structural-systems-and-load-flow"], description: "Stone + timber (anisotropic + CLT) + brick + lime; Portland cement + Ransome-Hennebique-Hyatt reinforced + Freyssinet prestressed + steel I-beams + glass + ETFE Eden Project; CLT Stora Enso + hempcrete + Bjørn Berge + Hammond-Jones embodied carbon ICE." },
      { slug: "architectural-design-process", title: "Design Process", level: "specialist", order: 4, pages: ["design-phases-aia", "design-thinking-rowe-schon", "theory-pattern-language"], prereqs: ["architecture-foundations-and-history"], description: "Programming + schematic + DD + CDs + CA AIA standard; Rowe Design Thinking 1987 + Cross Designerly Ways + Schön reflective practice + parti diagrams + sketch + model; Rossi typology + Krier urban morphology + Alexander pattern language 1977 + Frampton critical regionalism + Pallasmaa." },
      { slug: "building-systems-and-technology", title: "Building Systems", level: "specialist", order: 5, pages: ["envelope-thermal-bridging", "mep-passivhaus-acoustic", "integration-collision-detection"], prereqs: ["materials-of-architecture"], description: "Wall assemblies + thermal bridges + WUFI + Lstiburek + curtain walls + rain-screen; HVAC + radiant + VAV + Passivhaus Feist 1991 + Energy Star + LEED daylighting + Sabine acoustic + Beranek; structural integration + Navisworks clash detection + raised access floor." },
      { slug: "sustainability-and-performance", title: "Sustainability + Performance", level: "expert", order: 6, pages: ["carbon-aia-2030", "certifications-leed-passivhaus", "biophilic-biomimicry"], prereqs: ["building-systems-and-technology"], description: "Embodied + operational carbon + AIA 2030 + Mazria Architecture 2030; LEED USGBC + BREEAM + WELL + Living Building Challenge ILFI; Kellert biophilia + Benyus biomimicry + Pearce Eastgate termite mound + McDonough-Braungart cradle-to-cradle + circular." },
      { slug: "digital-bim-and-parametric", title: "BIM + Parametric Design", level: "expert", order: 7, pages: ["cad-bim-revit", "grasshopper-ladybug", "generative-spacemaker-lookx"], prereqs: ["architectural-design-process", "building-systems-and-technology"], description: "AutoCAD 1982 + Revit 2000 + ArchiCAD + IFC ISO 16739 + Eastman BIM Handbook + LOD + Navisworks + 4D/5D/6D; Grasshopper + Rhino + Dynamo + Galapagos GA + Karamba + Ladybug; Autodesk Spacemaker + Hypar + Midjourney + LookX + diffusion massing." },
      { slug: "modern-frontier-architecture", title: "Modern Frontier", level: "expert", order: 8, pages: ["3d-printing-robotics-icon", "mass-timber-tall-wood", "ai-in-practice"], prereqs: ["sustainability-and-performance", "digital-bim-and-parametric"], description: "ICON Vulcan + Tecla Cucinella earthen + Apis Cor + Mighty Buildings + ETH Gramazio-Kohler + bricklaying SAM; Brock Commons UBC 18 stories + Mjøstårnet Norway + Ascent Milwaukee + KPMB; LookX + Diagram + Spacemaker + LLM-augmented Revit + future of the architect role + climate adaptation." },
    ],
  });

  // P76 — Microeconomist path. From Adam Smith + Ricardo + Marshall +
  // Walras + Pareto through Hicks + Samuelson + Arrow-Debreu + Friedman
  // to Kahneman-Tversky + Card-Angrist-Imbens 2021; consumer theory
  // (the viz anchor — utility + indifference curves + budget line),
  // producer theory + Cobb-Douglas + Shephard, market structures +
  // Cournot-Bertrand-Stackelberg, market failures Pigou-Coase-Akerlof,
  // mechanism design VCG + Roth matching, behavioral Kahneman-Thaler-
  // Smith-Plott, and modern frontier — Card-Angrist-Imbens causal
  // inference + Athey ML + Acemoglu-Restrepo automation.
  seedMasteryPath({
    slug: "microeconomist",
    title: "Microeconomist",
    description:
      "From Adam Smith Wealth of Nations 1776 + Ricardo comparative advantage 1817 + Marshall Principles 1890 marginalist revolution + Walras 1874 GE + Pareto 1906 efficiency through Hicks-Allen 1934 ordinal utility + Samuelson Foundations 1947 + Arrow-Debreu 1954 GE existence + Friedman positive economics; consumer theory (preferences + utility + Debreu representation + MRS = price ratio + Slutsky decomposition + interactive indifference + budget viz + Hicksian vs Marshallian demand); producer theory (Cobb-Douglas 1928 + CES Solow + Leontief + isoquants + Shephard's lemma + cost min + Hotelling's lemma); market structures (perfect competition + monopoly Robinson-Chamberlin + price discrimination + Cournot 1838 + Bertrand 1883 + Stackelberg + Hotelling location); market failures (Pigou 1920 + Coase 1960 theorem + Buchanan public choice + Samuelson 1954 public goods + Akerlof 1970 lemons + Spence signaling + Stiglitz Nobel 2001 + Rothschild-Stiglitz separating/pooling); game theory + mechanism design (Nash + Selten subgame perfect + Harsanyi Bayesian + Vickrey-Clarke-Groves second-price + Myerson optimal auction Nobel + Roth-Shapley matching kidney exchange + school choice Roth-Sotomayor); behavioral + experimental (Kahneman-Tversky 1979 prospect theory + Thaler nudge + Simon bounded rationality + Smith-Plott induced value Nobel 2002 + Banerjee-Duflo-Kremer RCTs Nobel 2019); and modern frontier — Card-Angrist-Imbens Nobel 2021 + IV + RDD + DiD + Abadie synthetic control + Athey ML for causal inference + Chernozhukov double ML + BLP demand + Acemoglu-Restrepo automation + Brynjolfsson + Korinek AGI economics + Roth market design. The microeconomics stack end-to-end.",
    nodes: [
      { slug: "microeconomics-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["classical-neoclassical", "20c-arrow-debreu-friedman", "modern-card-imbens"], prereqs: [], description: "Adam Smith 1776 + Ricardo + Marshall 1890 + Walras 1874 + Pareto 1906; Hicks-Allen 1934 + Samuelson 1947 + Arrow-Debreu 1954 + Friedman; Hurwicz-Maskin-Myerson 2007 + Kahneman-Tversky-Thaler + Smith-Plott + Card-Angrist-Imbens 2021." },
      { slug: "consumer-theory-utility-and-demand", title: "Consumer Theory", level: "practitioner", order: 2, pages: ["preferences-utility-debreu", "indifference-mrs-budget", "slutsky-hicksian-marshallian"], prereqs: ["microeconomics-foundations-and-history"], description: "Completeness + transitivity + monotonicity + convexity + Debreu representation; indifference + MRS + budget p·x+p·y≤m + Lagrangian (interactive viz); Slutsky decomposition + Giffen + Veblen + Hicksian (compensated) vs Marshallian + duality." },
      { slug: "producer-theory-and-cost", title: "Producer Theory + Cost", level: "practitioner", order: 3, pages: ["production-cobb-douglas-ces", "cost-shephard-envelope", "profit-hotelling"], prereqs: ["consumer-theory-utility-and-demand"], description: "Cobb-Douglas 1928 + CES Solow + Leontief + returns to scale + isoquants + MRTS; Shephard's lemma + short vs long-run + AC + MC + envelope theorem; profit max + supply functions + Hotelling's lemma + LeChatelier-Samuelson." },
      { slug: "market-structures-and-equilibrium", title: "Market Structures", level: "specialist", order: 4, pages: ["competition-equilibrium", "monopoly-price-discrimination", "oligopoly-cournot-bertrand"], prereqs: ["consumer-theory-utility-and-demand", "producer-theory-and-cost"], description: "Marshallian scissors + Pareto + 1st welfare theorem; Robinson-Chamberlin + 1st/2nd/3rd-degree price discrimination; Cournot 1838 + Bertrand 1883 + Stackelberg + Hotelling location + Salop circle + Lerner index + cartels." },
      { slug: "market-failures-and-public-goods", title: "Market Failures + Public Goods", level: "specialist", order: 5, pages: ["externalities-pigou-coase", "public-goods-samuelson-tiebout", "asymmetric-info-akerlof-spence"], prereqs: ["market-structures-and-equilibrium"], description: "Pigou 1920 + Coase 1960 (zero transaction costs) + Buchanan public choice; Samuelson 1954 + Tiebout 1956 + free-rider; Akerlof 1970 lemons + adverse selection + moral hazard + Spence signaling + Stiglitz Nobel 2001 + Rothschild-Stiglitz." },
      { slug: "game-theory-and-mechanism-design", title: "Game Theory + Mechanism Design", level: "expert", order: 6, pages: ["nash-equilibrium-best-response", "info-sequential-bayesian", "mechanism-vcg-myerson-roth"], prereqs: ["market-structures-and-equilibrium"], description: "Nash + Cournot-Bertrand-Stackelberg + prisoner's dilemma; Selten 1965 subgame perfect + Harsanyi Bayesian Nash; Vickrey-Clarke-Groves second-price + Myerson optimal auction Nobel + Roth-Shapley matching + school choice Roth-Sotomayor + algorithmic mechanism design." },
      { slug: "behavioral-and-experimental-economics", title: "Behavioral + Experimental", level: "expert", order: 7, pages: ["prospect-theory-kahneman", "bounded-rationality-thaler", "experimental-smith-plott-rct"], prereqs: ["consumer-theory-utility-and-demand"], description: "Kahneman-Tversky 1979 + reference dependence + loss aversion + framing + endowment Knetsch-Sinden; Simon 1957 bounded rationality + Thaler nudge + Sunstein + hyperbolic Laibson + present bias; Smith-Plott Nobel 2002 + Banerjee-Duflo-Kremer Nobel 2019 + Levitt + Roth design." },
      { slug: "applied-microeconomics-frontier", title: "Applied + Frontier", level: "expert", order: 8, pages: ["identification-revolution", "industrial-organization-blp", "ai-economics"], prereqs: ["market-failures-and-public-goods", "behavioral-and-experimental-economics", "game-theory-and-mechanism-design"], description: "Card-Angrist-Imbens Nobel 2021 + Imbens-Rubin + IV + RDD + DiD + Abadie synthetic control + Athey ML for causal inference + Chernozhukov double ML; BLP demand + dynamic games + Heckman selection + Card-Krueger minimum wage; Acemoglu-Restrepo automation + Brynjolfsson + Korinek AGI economics + LLMs + Roth market design." },
    ],
  });

  // P75 — Paleontologist path. From William Smith faunal succession
  // 1815 + Cuvier + Owen 1842 Dinosauria + Cope-Marsh bone wars +
  // Walcott Burgess Shale through Simpson + Gould-Eldredge punctuated
  // equilibrium + Raup-Sepkoski Big Five to molecular paleobiology
  // Pääbo + Schweitzer; geologic time + stratigraphy + radiometric
  // (the viz anchor — Phanerozoic timeline with extinction markers),
  // taphonomy Efremov + Lagerstätten, paleobiology + EPB + Padian
  // histology + Seilacher ichnology, paleoecology + Bambach guild +
  // Wegener-Vine-Matthews biogeography + Quaternary megafauna,
  // mass extinctions Raup-Sepkoski + Alvarez K-Pg, vertebrate record
  // Tiktaalik Daeschler-Shubin + Archaeopteryx + Lucy Johanson +
  // hominin lineage Pääbo Nobel 2022, and modern frontier — CT
  // scanning + Schweitzer T. rex collagen + Pääbo ancient DNA +
  // AI fossil ID + Paleobiology Database.
  seedMasteryPath({
    slug: "paleontologist",
    title: "Paleontologist",
    description:
      "From William Smith principle of faunal succession 1815 + Cuvier comparative anatomy + Owen 1842 Dinosauria + Cope-Marsh bone wars 1870s + Walcott 1909 Burgess Shale + Andrews Mongolia 1920s through Simpson Tempo and Mode 1944 + Gould-Eldredge punctuated equilibrium 1972 + Raup-Sepkoski 1982 Big Five mass extinctions + Whittington-Conway Morris Cambrian to molecular paleobiology — Pääbo ancient DNA Nobel 2022 + Schweitzer T. rex collagen 2007 + Asara mass spec + Bailleul cellular preservation; geologic time + stratigraphy (eons + eras + periods + epochs Hadean → Holocene + ICS chart + radiometric U-Pb Patterson 1956 + Ar-Ar + Libby C-14 Nobel + GSSP — interactive Phanerozoic timeline viz with Big Five markers + diversity-recovery curves); taphonomy + preservation (Efremov 1940 + biostratinomy + diagenesis + amber + Lagerstätten Burgess + Chengjiang + Solnhofen + Jehol + Messel + Signor-Lipps bias); paleobiology + functional morphology (Witmer EPB + Alexander gait + Bates dinosaur mass + Hutchinson T. rex + Padian-Horner paleohistology + Erickson growth + Seilacher ichnology); paleoecology + biogeography (Bambach Bush Knoll guilds + Sepkoski 3 evolutionary faunas + Urey δ¹⁸O + Eiler clumped isotopes + Wegener-Vine-Matthews plate tectonics + Croizat panbiogeography + MacArthur-Wilson + Pleistocene megafauna + Zimov); mass extinctions + recoveries (Raup-Sepkoski 1982 + Erwin end-Permian Siberian Traps + Alvarez K-Pg Chicxulub Hildebrand 1991 + Schulte 2010 + Pimm-Brooks 6th extinction + Dirzo defaunation); vertebrate fossil record (Tiktaalik Daeschler-Shubin 2004 + Acanthostega Coates-Clack + Archaeopteryx 1861 + bird origins Norell-Xu + Pakicetus Thewissen + Lucy 1974 Johanson + hominin lineage); and modern frontier — CT scanning + Lautenschlager + 3D-printed fossils + Schweitzer + ancient DNA Pääbo + Krause-Reich + Cappellini paleoproteomics + Orlando 700-kya horse + AI fossil ID + Alroy Paleobiology Database. The paleontology stack end-to-end.",
    nodes: [
      { slug: "paleontology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-smith-cuvier-cope-marsh", "20c-simpson-gould-eldredge", "modern-paabo-schweitzer"], prereqs: [], description: "William Smith 1815 + Cuvier + Owen 1842 Dinosauria + Cope-Marsh bone wars + Sternberg + Walcott 1909 Burgess Shale + Andrews Mongolia; Simpson 1944 + Gould-Eldredge punctuated equilibrium 1972 + Raup-Sepkoski 1982 + Whittington-Conway Morris; Pääbo + Asara + Schweitzer + Bailleul molecular paleobiology + paleogenomics + CT." },
      { slug: "geologic-time-scale-and-stratigraphy", title: "Geologic Time + Stratigraphy", level: "practitioner", order: 2, pages: ["eons-eras-periods", "radiometric-dating", "stratigraphy-gssp"], prereqs: ["paleontology-foundations-and-history"], description: "Hadean → Archean → Proterozoic → Phanerozoic + Anthropocene + ICS chart Cohen et al.; U-Pb zircon Patterson 1956 + K-Ar + Ar-Ar + C-14 Libby Nobel + magnetostratigraphy; chronostratigraphy + GSSP + biostratigraphy + Walther's law (interactive Phanerozoic viz with Big Five)." },
      { slug: "taphonomy-and-preservation", title: "Taphonomy + Preservation", level: "specialist", order: 3, pages: ["taphonomy-efremov", "preservation-modes-amber-lagerstatten", "biases-signor-lipps"], prereqs: ["paleontology-foundations-and-history"], description: "Efremov 1940 + biostratinomy + diagenesis; permineralization + casts + molds + compressions + amber + ice + soft-tissue Lagerstätten (Burgess + Chengjiang + Solnhofen + Jehol + Messel + Las Hoyas + Mazon Creek); Signor-Lipps + sampling rate + facies + preservation by skeleton type." },
      { slug: "paleobiology-and-functional-morphology", title: "Paleobiology + Morphology", level: "specialist", order: 4, pages: ["reconstructing-biology-epb", "paleohistology-padian", "trace-fossils-seilacher"], prereqs: ["taphonomy-and-preservation"], description: "Bock-Wahlert paradigm + Lauder + Witmer EPB + Alexander gait + Bates dinosaur mass + Hutchinson T. rex; Padian-Horner + growth rings + endothermy + Erickson + Bailleul-Schweitzer cellular; Seilacher ichnology + tracks + burrows + ichnofacies + ethology." },
      { slug: "paleoecology-and-biogeography", title: "Paleoecology + Biogeography", level: "expert", order: 5, pages: ["paleoecology-bambach-sepkoski", "biogeography-wegener-plate-tectonics", "quaternary-megafauna"], prereqs: ["paleobiology-and-functional-morphology"], description: "Bambach Bush Knoll guilds + Sepkoski 3 evolutionary faunas + diversity through time + Urey δ¹⁸O + Eiler clumped isotopes; Wegener 1912 continental drift + Vine-Matthews 1963 + Gondwana + dispersal vs vicariance Croizat; megafaunal extinctions + MacArthur-Wilson 1967 + Pleistocene Park Zimov + de-extinction." },
      { slug: "mass-extinctions-and-recoveries", title: "Mass Extinctions + Recoveries", level: "expert", order: 6, pages: ["big-five-raup-sepkoski", "alvarez-chicxulub", "sixth-extinction"], prereqs: ["geologic-time-scale-and-stratigraphy"], description: "Raup-Sepkoski 1982 Big Five — Ordovician-Silurian + Late Devonian + Permian-Triassic Erwin Siberian Traps + Triassic-Jurassic CAMP + K-Pg Alvarez 1980 + Chicxulub Hildebrand 1991 + Schulte 2010; recovery dynamics + disaster faunas + dead clades + Erwin Myr-scale; Pimm-Brooks 6th + Dirzo + Zalasiewicz Anthropocene." },
      { slug: "vertebrate-fossil-record", title: "Vertebrate Fossil Record", level: "expert", order: 7, pages: ["origins-to-tetrapods", "mesozoic-dinosaurs-birds", "cenozoic-mammals-hominins"], prereqs: ["geologic-time-scale-and-stratigraphy"], description: "Pikaia + Haikouichthys + conodonts + Tiktaalik Daeschler-Shubin 2004 + Acanthostega Coates-Clack + amniote split; dinosaur origins Triassic + Saurischia/Ornithischia + Archaeopteryx 1861 + bird origins Norell-Xu + Yutyrannus feathers; Eocene mammals + Marsh horses + Pakicetus Thewissen + Lucy 1974 Johanson + Homo lineage." },
      { slug: "modern-frontier-paleontology", title: "Modern Frontier", level: "expert", order: 8, pages: ["digital-paleontology-ct", "molecular-paleobiology-ancient-dna", "ai-paleobiology-database"], prereqs: ["mass-extinctions-and-recoveries", "vertebrate-fossil-record", "paleoecology-and-biogeography"], description: "CT scanning + Lautenschlager + 3D printing + virtual prep + Witmer biology lab; Schweitzer T. rex collagen 2007 + Asara + Bailleul cell preservation + Pääbo ancient DNA Nobel 2022 + Krause-Reich + Cappellini paleoproteomics + Orlando 700-kya horse; ML fossil ID Hsiang-Pearson Foraminifera + Alroy Paleobiology Database + LLMs + future of the field." },
    ],
  });

  // P74 — Urban Planner path. From Hippodamian grid + Haussmann +
  // Howard Garden City + Le Corbusier + Mumford + Jacobs through
  // zoning + land use + density (the viz anchor), transportation
  // (transit + cycling + 15-minute city Moreno), urban economics +
  // real estate (von Thünen + Alonso + Glaeser), housing affordability
  // (LIHTC + Hsieh-Moretti misallocation + Vienna/Singapore/Tokyo
  // models), infrastructure + utilities + smart city, equity +
  // environment + resilience (Bullard + Rothstein + climate
  // adaptation), and modern frontier — Batty urban informatics +
  // Bettencourt scaling laws + autonomous vehicles + LLM planning.
  seedMasteryPath({
    slug: "urban-planner",
    title: "Urban Planner",
    description:
      "From Hippodamian grid + Roman castrum + Haussmann Paris 1853-70 + Cerdà Barcelona 1859 Eixample through Howard Garden City 1898 + Le Corbusier Radiant City + Mumford + Jacobs 1961 Death and Life + Duany-Plater-Zyberk New Urbanism + Calthorpe TOD; zoning + land use (Euclidean Euclid v. Ambler 1926 + form-based + FAR + missing middle Parolek + Shoup parking minimums + upzoning Minneapolis 2018 + California SB 9 — interactive zoning grid); transportation (induced demand Downs-Thomson + Braess paradox + BRT Curitiba + Walker Human Transit + Copenhagen + Vision Zero + 15-min city Moreno); urban economics (von Thünen + Alonso bid-rent + Marshall agglomeration + Glaeser Triumph + Moretti skills sorting + Hsieh-Moretti 2019 misallocation); housing affordability (Public Housing 1937 + LIHTC + Section 8 + Vienna social housing + Singapore HDB + Tokyo permissive); infrastructure + utilities + smart city; equity + environment (Bullard 1990 + Rothstein Color of Law 2017 + LEED + C40 + climate adaptation + managed retreat); and modern frontier — Batty New Science of Cities + Bettencourt scaling laws + autonomous vehicles + planetary urbanization Brenner + LLM-augmented planning. The urban-planning stack end-to-end.",
    nodes: [
      { slug: "urban-planning-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-industrial", "20c-howard-corbusier", "modern-new-urbanism"], prereqs: [], description: "Hippodamian grid + Roman castrum + medieval + Haussmann + Cerdà; Howard Garden City + Le Corbusier + Wright Broadacre + Mumford + Jacobs 1961; New Urbanism Duany-Plater-Zyberk + smart growth + Calthorpe TOD + sustainability + climate adaptation." },
      { slug: "zoning-land-use-and-density", title: "Zoning + Land Use", level: "practitioner", order: 2, pages: ["zoning-history-euclidean", "density-far", "reform-upzoning-shoup"], prereqs: ["urban-planning-foundations-and-history"], description: "Euclid v. Ambler 1926 + Euclidean vs form-based + R/C/M + PUDs (interactive zoning-grid viz); FAR + dwelling units/acre + missing middle Parolek; upzoning + ADU + Minneapolis 2018 + California SB 9 + Shoup The High Cost of Free Parking 2005." },
      { slug: "transportation-and-mobility", title: "Transportation + Mobility", level: "specialist", order: 3, pages: ["modes-induced-demand", "transit-brt-rail", "active-pedestrian-15min"], prereqs: ["zoning-land-use-and-density"], description: "Auto + transit + cycling + walking + micromobility + Downs-Thomson + Braess + Vickrey pricing; BRT + Curitiba + Bogotá + Walker Human Transit; Copenhagen + Dutch infrastructure + Vision Zero Sweden + Moreno 15-minute city." },
      { slug: "urban-economics-and-real-estate", title: "Urban Economics + Real Estate", level: "specialist", order: 4, pages: ["location-theory-von-thunen", "agglomeration-glaeser", "housing-elasticity"], prereqs: ["urban-planning-foundations-and-history"], description: "von Thünen 1826 + Alonso bid-rent + Mills + Muth monocentric; Marshall industrial districts + Jacobs externalities + Glaeser Triumph 2011 + Moretti skills sorting; Glaeser-Gyourko supply elasticity + filtering + Rosenthal + housing affordability crisis." },
      { slug: "housing-and-affordability", title: "Housing + Affordability", level: "expert", order: 5, pages: ["housing-policy-us", "affordability-crisis", "international-vienna-singapore"], prereqs: ["urban-economics-and-real-estate"], description: "Public Housing US 1937 + LIHTC 1986 + Section 8 + inclusionary zoning + housing first; Glaeser-Gyourko supply + Hsieh-Moretti 2019 misallocation + Bay Area; Vienna social housing + Singapore HDB + Tokyo permissive + Auckland 2016 + Helsinki housing first." },
      { slug: "infrastructure-and-utilities", title: "Infrastructure + Smart City", level: "expert", order: 6, pages: ["water-sewer-stormwater", "energy-waste-circular", "smart-city-sidewalk"], prereqs: ["urban-planning-foundations-and-history"], description: "Combined vs separate + Burnham Chicago + green infrastructure + SUDs LID; district heating + microgrids + Curitiba recycling + circular economy; Sidewalk Toronto + Songdo + Barcelona superblocks + digital twins + privacy Zuboff." },
      { slug: "equity-environment-and-resilience", title: "Equity + Environment + Resilience", level: "expert", order: 7, pages: ["environmental-justice-bullard", "sustainability-leed-c40", "climate-adaptation-resilience"], prereqs: ["zoning-land-use-and-density"], description: "Bullard Dumping in Dixie 1990 + redlining HOLC 1933-37 + Rothstein Color of Law 2017 + exposure inequity; LEED + WELL + 15-minute city + carbon-neutral C40; Holling 1973 resilience + Meerow-Newell + NYC Sandy + Klinenberg Chicago 1995 + managed retreat + Miami/Jakarta." },
      { slug: "modern-frontier-urban-planning", title: "Modern Frontier", level: "expert", order: 8, pages: ["computational-batty-bettencourt", "participatory-smart", "future-av-llm-harvey"], prereqs: ["transportation-and-mobility", "housing-and-affordability", "equity-environment-and-resilience"], description: "Batty New Science of Cities 2013 + Bettencourt scaling laws 2007 + GPS traces + cell phone mobility; Arnstein ladder 1969 + GIS + CityGML + crowdsourced + AI city assistants; autonomous vehicles + drone delivery + climate migration + planetary urbanization Brenner + LLM planning + Harvey right to the city." },
    ],
  });

  // P73 — Musicologist path. From Pythagoras + medieval modes +
  // Bach/Mozart/Beethoven through 20th c Schoenberg + Stravinsky +
  // minimalism, acoustics + harmonic series + Helmholtz (the viz
  // anchor), music theory + Rameau + Schenker + Schoenberg + jazz +
  // neo-Riemannian, rhythm + meter + form + Lerdahl-Jackendoff GTTM,
  // ethnomusicology + non-Western + popular music, performance + HIP
  // + recording + production, digital music + MIR + Shazam + Cuthbert
  // music21, and modern frontier — AI music generation + Magenta +
  // MusicLM + Suno + Krumhansl tonal cognition.
  seedMasteryPath({
    slug: "musicologist",
    title: "Musicologist",
    description:
      "From Pythagoras monochord + Boethius + medieval modes + Hildegard + Léonin-Pérotin Notre-Dame polyphony + Renaissance Josquin-Palestrina + Baroque Monteverdi-Bach-Vivaldi + Classical Haydn-Mozart-Beethoven through Romantic Wagner + 20th c Debussy-Schoenberg-Stravinsky-Cage + minimalism Reich-Glass-Riley; acoustics + harmonic series (Fourier + Helmholtz 1863 + Plomp-Levelt critical bandwidth + Sethares timbre-tuning — interactive overtone-series viz with timbre presets); music theory (Rameau 1722 + Riemann + Schenker 1935 + Forte set theory + Lewin transformational + neo-Riemannian + jazz Mehegan-Levine); rhythm + meter + form (Hepokoski-Darcy sonata + Lerdahl-Jackendoff GTTM 1983 + non-Western polyrhythm); ethnomusicology (Hornbostel-Sachs 1914 + Merriam + Blacking + Feld + Indian raga + Javanese gamelan + Arabic maqam); performance + production (HIP Harnoncourt + Pro Tools/Logic/Ableton + LUFS); digital music + MIR (FFT + MFCC + chroma + Ellis beat tracking + Cuthbert music21 + Shazam Wang 2003); and modern frontier — Magenta + MuseNet + Jukebox + MusicLM + Suno + Udio + Krumhansl-Kessler tonal hierarchy + Huron sweet anticipation + Saffran statistical learning. The musicology stack end-to-end.",
    nodes: [
      { slug: "music-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-medieval-pythagoras", "renaissance-baroque", "classical-romantic-20c"], prereqs: [], description: "Pythagoras monochord + Boethius + Greek modes + Gregorian chant + Hildegard + Léonin-Pérotin; Josquin + Palestrina + Monteverdi + Bach + Handel + Vivaldi; Haydn-Mozart-Beethoven + Wagner + Debussy + Schoenberg + Stravinsky + Cage + Reich-Glass-Riley minimalism." },
      { slug: "acoustics-and-harmonic-series", title: "Acoustics + Harmonic Series", level: "practitioner", order: 2, pages: ["physics-of-sound", "harmonic-overtone-series", "psychoacoustics-plomp-levelt"], prereqs: ["music-foundations-and-history"], description: "Frequency + amplitude + waveform + Fourier + Helmholtz On the Sensations of Tone 1863; integer-multiple partials + timbre + formants + just intonation vs equal temperament + Pythagorean comma (interactive harmonic-series viz); Plomp-Levelt critical bandwidth + Sethares + Stumpf fusion + consonance/dissonance." },
      { slug: "music-theory-and-harmony", title: "Music Theory + Harmony", level: "specialist", order: 3, pages: ["scales-intervals-chords", "tonal-rameau-schenker", "modern-forte-lewin-jazz"], prereqs: ["acoustics-and-harmonic-series"], description: "Major + minor + modes + circle of fifths + triads + 7ths + voice leading; Rameau Traité 1722 + Riemann functional + Schenker Free Composition 1935 + reductive analysis; Forte set theory + Lewin transformational + neo-Riemannian + jazz Mehegan-Levine." },
      { slug: "rhythm-meter-and-form", title: "Rhythm + Meter + Form", level: "specialist", order: 4, pages: ["rhythm-meter-polyrhythm", "form-sonata-fugue", "lerdahl-jackendoff-gttm"], prereqs: ["music-foundations-and-history"], description: "Beat + tactus + simple/compound/complex meter + polyrhythm + hemiola + clave + Indian tala + Balkan additive + African polyrhythm Ewe; binary/ternary/rondo + Hepokoski-Darcy sonata + fugue + concerto + symphony; Lerdahl-Jackendoff GTTM 1983 + grouping + metrical + prolongational." },
      { slug: "ethnomusicology-and-world-music", title: "Ethnomusicology + World Music", level: "expert", order: 5, pages: ["ethno-merriam-blacking", "non-western-raga-gamelan", "popular-musics"], prereqs: ["music-foundations-and-history"], description: "Hornbostel-Sachs 1914 + Merriam 1964 + Blacking 1973 + Feld + Seeger fieldwork; Indian raga + tala + Hindustani vs Carnatic + Arabic maqam + Javanese gamelan slendro/pelog + Chinese pentatonic + Ewe + Andean huayno; blues + jazz + rock + hip-hop + electronic + global music." },
      { slug: "performance-and-production", title: "Performance + Production", level: "expert", order: 6, pages: ["instruments-voice", "conducting-ensemble-hip", "recording-daw-mastering"], prereqs: ["music-theory-and-harmony"], description: "Strings + winds + brass + percussion + voice + vocal pedagogy + extended techniques; orchestral + choral + Furtwängler vs Toscanini + HIP Harnoncourt; Edison + Berliner + analog → digital + Pro Tools + Logic + Ableton + Loudness War + LUFS streaming." },
      { slug: "digital-music-and-mir", title: "Digital Music + MIR", level: "expert", order: 7, pages: ["dsp-fft-mfcc", "mir-beat-chord-key", "computational-musicology"], prereqs: ["acoustics-and-harmonic-series"], description: "Sampling theorem Nyquist + FFT + spectrogram + STFT + MFCC + chroma + filters + reverb + compression; Ellis beat tracking + chord recognition + key detection + cover song + MELODIA + structure segmentation; Cuthbert music21 + corpus analysis + Cope EMI + Shazam Wang 2003 audio fingerprinting." },
      { slug: "modern-frontier-music", title: "Modern Frontier", level: "expert", order: 8, pages: ["ai-music-generation", "music-cognition-krumhansl", "future-streaming-llm"], prereqs: ["digital-music-and-mir", "ethnomusicology-and-world-music"], description: "Magenta + MuseNet + Jukebox + MusicLM + Suno + Udio + diffusion-audio + Mubert + copyright RIAA; Krumhansl-Kessler tonal hierarchy + Huron sweet anticipation + ITPRA + Margulis on repeat + Saffran statistical learning; Spotify + algorithmic recommendation + creator economy + LLM-augmented musicology." },
    ],
  });

  // P72 — Evolutionary Biologist path. From Linnaeus + Lamarck +
  // Darwin 1859 + Wallace + Modern Synthesis Fisher-Haldane-Wright-
  // Dobzhansky-Mayr through natural selection + adaptation, population
  // genetics + Wright-Fisher drift (the viz anchor), speciation +
  // macroevolution + punctuated equilibrium + mass extinctions,
  // phylogenetics + tree-building + tree of life + Woese three-domain,
  // evo-devo + Hox + Sean Carroll, human evolution + Pääbo Nobel 2022
  // + admixture + recent selection, and modern frontier — phylogenomics
  // + Lenski LTEE + AlphaFold + Avida digital evolution.
  seedMasteryPath({
    slug: "evolutionary-biologist",
    title: "Evolutionary Biologist",
    description:
      "From Linnaeus + Buffon + Lamarck 1809 + Cuvier + Lyell through Darwin 1859 Origin + Wallace + four postulates + Modern Synthesis 1930s-40s Fisher 1930 + Haldane + Wright + Dobzhansky 1937 + Mayr 1942 + Simpson + Stebbins; natural selection + adaptation (directional/stabilizing/disruptive + Wright 1932 fitness landscapes + Lande quant genetics + peppered moth Kettlewell + Galápagos finches Grant + Lenski LTEE 70k generations); population genetics + drift (Hardy-Weinberg 1908 + Wright-Fisher binomial sampling + N_e + bottlenecks + cheetah — interactive drift viz; Kimura 1968 neutral theory + molecular clock + Kingman coalescent 1982); speciation + macroevolution (biological species concept + Coyne-Orr + Eldredge-Gould punctuated equilibrium 1972 + Cambrian + Big Five extinctions + Alvarez 1980 KT impact); phylogenetics + tree of life (UPGMA + NJ Saitou-Nei + MP + ML Felsenstein + Bayesian MrBayes + BEAST + Woese 1977 three-domain + Lokiarchaeota Asgard + Margulis endosymbiosis + Doolittle); evo-devo (Lewis bithorax Nobel 1995 + Nüsslein-Volhard Wieschaus + Sean Carroll Endless Forms + cis-regulatory + Wagner); human evolution (Lucy + Pääbo Nobel 2022 + Neanderthal/Denisovan admixture + Reich + lactase + EPAS1 Tibetan + Sabeti); and modern frontier — 1000 Genomes + UK Biobank + ancient DNA + GWAS evolution + polygenic adaptation Berg-Coop + Lenski + Avida + AlphaFold + extinction crisis. The evolution stack end-to-end.",
    nodes: [
      { slug: "evolution-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["pre-darwin-lyell", "darwin-origin", "modern-synthesis"], prereqs: [], description: "Linnaeus + Buffon + Lamarck 1809 + Cuvier catastrophism + Lyell uniformitarianism; Darwin 1859 + Wallace + four postulates + natural + sexual selection; Modern Synthesis Fisher 1930 + Haldane + Wright + Dobzhansky 1937 + Mayr 1942 + Simpson + Stebbins." },
      { slug: "natural-selection-and-adaptation", title: "Natural Selection + Adaptation", level: "practitioner", order: 2, pages: ["types-of-selection", "fitness-landscapes-lande", "case-studies-finches-lenski"], prereqs: ["evolution-foundations-and-history"], description: "Directional + stabilizing + disruptive + frequency-dependent + balancing; Wright 1932 + adaptive peaks + Lande quantitative genetics; peppered moth Kettlewell + Galápagos finches Grant + Anolis Losos + sticklebacks + Lenski LTEE + Drosophila." },
      { slug: "population-genetics-and-drift", title: "Population Genetics + Drift", level: "specialist", order: 3, pages: ["hardy-weinberg", "wright-fisher-drift", "neutral-theory-coalescent"], prereqs: ["natural-selection-and-adaptation"], description: "Hardy-Weinberg 1908 + chi-square test; Wright-Fisher binomial sampling + N_e + bottlenecks + founder + cheetah + Hawaiian honeycreepers (interactive drift viz); Kimura 1968 neutral theory + molecular clock + nearly-neutral Ohta + coalescent Kingman 1982 + Felsenstein." },
      { slug: "speciation-and-macroevolution", title: "Speciation + Macroevolution", level: "specialist", order: 4, pages: ["species-concepts", "modes-of-speciation", "punctuated-extinctions"], prereqs: ["natural-selection-and-adaptation"], description: "Biological Mayr + phylogenetic + ecological + recognition + Templeton; allopatric + peripatric + parapatric + sympatric + hybrid + ring species + Coyne-Orr Speciation 2004; Eldredge-Gould 1972 + Cambrian explosion + Raup-Sepkoski + Big Five + Alvarez 1980 KT impact + Vendian/Ediacaran." },
      { slug: "phylogenetics-and-tree-of-life", title: "Phylogenetics + Tree of Life", level: "expert", order: 5, pages: ["tree-methods-ml-bayes", "molecular-clock-beast", "tol-woese-asgard-margulis"], prereqs: ["evolution-foundations-and-history"], description: "UPGMA + neighbor-joining Saitou-Nei + parsimony Fitch + ML Felsenstein + Bayesian MrBayes Huelsenbeck-Ronquist; Sarich-Wilson + relaxed clocks + BEAST Drummond-Rambaut + divergence dating; Woese 1977 three-domain + Pace SSU rRNA + Lokiarchaeota + Asgard + endosymbiosis Margulis + Doolittle web of life." },
      { slug: "developmental-evolution-evo-devo", title: "Evo-Devo", level: "expert", order: 6, pages: ["hox-body-plan", "evo-devo-synthesis", "evolvability-modularity"], prereqs: ["natural-selection-and-adaptation"], description: "Lewis Drosophila bithorax 1978 Nobel 1995 + Nüsslein-Volhard Wieschaus + Hox + spatial colinearity + segment polarity; Carroll Endless Forms Most Beautiful 2005 + cis-regulatory + Wnt/Hedgehog/BMP signaling conserved; Wagner Robustness + Müller-Newman." },
      { slug: "human-evolution", title: "Human Evolution", level: "expert", order: 7, pages: ["hominin-lineage", "out-of-africa-admixture", "selection-on-humans"], prereqs: ["speciation-and-macroevolution", "phylogenetics-and-tree-of-life"], description: "Sahelanthropus + Ardipithecus + Lucy 1974 Johanson + Homo habilis/erectus/heidelbergensis/neanderthalensis + Denisova Pääbo Nobel 2022; out-of-Africa + Neanderthal 1-4% admixture + Cann-Stoneking mtDNA Eve 1987 + Reich; lactase persistence + SLC24A5 pigmentation + EPAS1 Tibetan + sickle-malaria + Sabeti + Pritchard." },
      { slug: "modern-frontier-evolution", title: "Modern Frontier", level: "expert", order: 8, pages: ["genomic-era-1000g-ukbb", "experimental-digital", "ai-evolution"], prereqs: ["population-genetics-and-drift", "phylogenetics-and-tree-of-life", "human-evolution"], description: "1000 Genomes + UK Biobank + gnomAD + ancient DNA Pääbo + Reich + phylogenomics + GWAS evolution + polygenic adaptation Berg-Coop; Lenski LTEE + Travisano + Cooper + digital evolution Avida Adami; AlphaFold + Brandes ESM + future + extinction crisis IUCN + de-extinction Colossal." },
    ],
  });

  // P71 — Microbiologist path. From van Leeuwenhoek + Pasteur + Koch
  // + Winogradsky through Avery 1944 DNA + Lederberg + Woese 1977
  // three-domain, prokaryote cell biology + Gram + biofilms + operons
  // Jacob-Monod + CRISPR Doudna-Charpentier 2020, bacterial growth +
  // Monod kinetics (the viz anchor), microbial diversity + biogeochem
  // + extremophiles, virology + Baltimore + phage therapy + SARS-CoV-2,
  // mycology + protists + Plasmodium, pathogenesis + antimicrobials +
  // Fleming + AMR + halicin, and modern frontier — microbiome HMP +
  // Knight + metagenomics + AlphaFold + synthetic biology.
  seedMasteryPath({
    slug: "microbiologist",
    title: "Microbiologist",
    description:
      "From van Leeuwenhoek 1670s + Pasteur germ theory + Koch postulates 1890 + Cohn + Winogradsky + Beijerinck through Avery-MacLeod-McCarty 1944 + Lederberg-Tatum + Watson-Crick + Woese 1977 three-domain + Pace molecular phylogeny; prokaryote cell biology (Gram + peptidoglycan + LPS + biofilms + quorum sensing Bassler-Greenberg + operons Jacob-Monod 1961 + horizontal gene transfer + CRISPR-Cas Doudna-Charpentier Nobel 2020); bacterial growth + metabolism (lag → exponential → stationary → death + Monod 1949 kinetics — interactive OD600 growth-curve viz; chemostat + heterotrophy/autotrophy + fermentation + chemolithotrophy + photosynthesis cyanobacteria); microbial diversity + ecology (Proteobacteria + Firmicutes + Bacteroidetes + Asgard archaea + nitrogen/sulfur/carbon cycles + anammox Strous + SAR11 Pelagibacter + extremophiles + Lost City vents); virology (Baltimore I-VII + lambda lytic/lysogenic + HIV Montagnier-Gallo + influenza + SARS-CoV-2 + phage therapy d'Hérelle + Eliava); mycology + protists (Saccharomyces + Aspergillus + Candida + Fleming penicillin + Plasmodium + Trypanosoma + Toxoplasma + apicomplexans + Dictyostelium); pathogenesis + antimicrobials (virulence + T3SS/T6SS + TB Koch + cholera + Helicobacter Marshall-Warren Nobel 2005 + Fleming + Florey-Chain Nobel 1945 + β-lactams + AMR crisis + halicin DNN Stokes-Collins); and modern frontier — HMP + Knight + Gordon microbiome + Tyson 2004 metagenomics + GTDB + Earth Microbiome + scRNA + Oxford Nanopore + AlphaFold + halicin + Voigt-Endy synthetic biology. The microbiology stack end-to-end.",
    nodes: [
      { slug: "microbiology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-leeuwenhoek-pasteur", "modern-avery-woese", "tree-of-life-diversity"], prereqs: [], description: "van Leeuwenhoek 1670s + Pasteur fermentation + germ theory + Koch postulates 1890 + Cohn + Winogradsky + Beijerinck virology; Avery-MacLeod-McCarty 1944 + Lederberg-Tatum + Watson-Crick + Woese 1977 archaea three-domain + Pace; ~10^30 microbial cells + uncultivated majority." },
      { slug: "prokaryote-cell-biology", title: "Prokaryote Cell Biology", level: "practitioner", order: 2, pages: ["gram-cell-wall", "biofilms-quorum-sensing", "genetics-operons-crispr"], prereqs: ["microbiology-foundations-and-history"], description: "Gram-positive vs Gram-negative + peptidoglycan + LPS + capsule + acid-fast Mycobacterium; flagella + chemotaxis Adler-Berg + biofilms + quorum sensing Bassler-Greenberg Las/Lux; Jacob-Monod 1961 operons + plasmids + transformation/conjugation/transduction + CRISPR-Cas Doudna-Charpentier Nobel 2020." },
      { slug: "bacterial-growth-and-metabolism", title: "Growth + Metabolism", level: "specialist", order: 3, pages: ["growth-phases", "monod-kinetics-chemostat", "metabolism-classes"], prereqs: ["prokaryote-cell-biology"], description: "Lag + exponential + stationary + death + VBNC; Monod 1949 μ = μ_max·S/(Ks+S) + chemostat + batch + Y_xs (interactive growth-curve viz); heterotrophy + autotrophy + fermentation + anaerobic respiration + chemolithotrophy + photosynthesis." },
      { slug: "microbial-diversity-and-ecology", title: "Diversity + Ecology", level: "specialist", order: 4, pages: ["bacterial-archaeal-phyla", "biogeochemistry", "environments-extremophiles"], prereqs: ["microbiology-foundations-and-history"], description: "Proteobacteria + Firmicutes + Bacteroidetes + Actinobacteria + Cyanobacteria + Crenarchaeota + Euryarchaeota + Asgard; N cycle (nitrification + denitrification + fixation + anammox Strous) + S + C + methane; soil + ocean SAR11 + Pyrococcus + Deinococcus + halophiles + Lost City vents." },
      { slug: "virology", title: "Virology", level: "expert", order: 5, pages: ["structure-baltimore-classification", "life-cycles-lambda", "human-viruses-phage-therapy"], prereqs: ["microbiology-foundations-and-history"], description: "Capsids + envelopes + Baltimore I-VII + giant Mimivirus + phages; attachment + entry + replication + assembly + release + lytic vs lysogenic lambda + reverse transcription HIV + influenza segmented; HIV Montagnier-Gallo + influenza + HBV/HCV + HPV + Ebola + SARS/MERS/SARS-CoV-2 + Zika + d'Hérelle phage." },
      { slug: "mycology-and-protists", title: "Mycology + Protists", level: "expert", order: 6, pages: ["fungi-yeasts-molds", "fleming-penicillin", "protists-plasmodium-apicomplexa"], prereqs: ["microbiology-foundations-and-history"], description: "Yeasts vs molds + hyphae + dimorphism + chitin + ergosterol + Saccharomyces + Aspergillus + Candida + Cryptococcus + Pneumocystis; mycoses + Fleming penicillin 1928 + statins + cyclosporin; Plasmodium malaria + Trypanosoma + Leishmania + Giardia + Toxoplasma + Dictyostelium." },
      { slug: "pathogenesis-and-antimicrobials", title: "Pathogenesis + Antimicrobials", level: "expert", order: 7, pages: ["virulence-secretion-systems", "major-bacterial-diseases", "antimicrobials-amr"], prereqs: ["prokaryote-cell-biology", "bacterial-growth-and-metabolism"], description: "Virulence factors + adhesins + exo/endo toxins + T3SS T6SS + colonization vs invasion + Mycobacterium granuloma + Listeria + Salmonella; TB Koch + cholera Vibrio + E. coli O157 + S. aureus + Helicobacter Marshall-Warren Nobel 2005; Fleming + Florey-Chain Nobel 1945 + β-lactams + macrolides + fluoroquinolones + MRSA + VRE + AMR O'Neill + teixobactin Lewis + halicin DNN MIT." },
      { slug: "modern-frontier-microbiology", title: "Modern Frontier", level: "expert", order: 8, pages: ["microbiome-hmp-knight", "metagenomics-tyson-banfield", "ai-microbiology-synbio"], prereqs: ["microbial-diversity-and-ecology", "pathogenesis-and-antimicrobials"], description: "HMP + Knight + Gordon gut/skin/oral + IBD + germ-free + FMT; 16S Pace + shotgun + Tyson 2004 + GTDB + Earth Microbiome + scRNA + Hi-C + Oxford Nanopore + Smith-Pevzner + Banfield CPR; AlphaFold + AMR prediction + halicin Stokes-Collins + LLM-augmented genomics + Voigt-Endy synthetic biology." },
    ],
  });

  // P70 — Educator path. From Socrates + Quintilian + Comenius +
  // Rousseau + Pestalozzi + Froebel + Dewey + Montessori + Freire
  // through learning theories + cognitive load Sweller, memory +
  // spaced repetition + Ebbinghaus + SM-2 (the viz anchor), assessment
  // + IRT/Rasch + Black-Wiliam + Koretz critique, instructional design
  // ADDIE/UbD/UDL + Rosenshine + Hattie + Mazur peer instruction,
  // curriculum + standards + Common Core + science of reading,
  // educational technology + MOOCs + ITS + Khan + Reich, and modern
  // frontier — AI tutors + Bloom 2-sigma + Khanmigo + Squirrel AI +
  // Hanushek + future of teaching.
  seedMasteryPath({
    slug: "educator",
    title: "Educator",
    description:
      "From Socrates dialogues + Quintilian + Comenius Didactica Magna 1657 + Rousseau Émile 1762 + Pestalozzi + Froebel kindergarten through Dewey Democracy and Education 1916 + Montessori + Vygotsky ZPD + Bruner spiral + Bloom taxonomy 1956 + Skinner + Gagné + Piaget-Papert constructivism + Freire Pedagogy of the Oppressed 1968; learning theories + cognition (Pavlov + Skinner + cognitive load Sweller 1988 + Mayer multimedia + Miller 7±2 + Lave-Wenger communities of practice + Dunlosky 2013 effective techniques); memory + spaced repetition (Ebbinghaus 1885 forgetting curve + Bjork desirable difficulties + Roediger-Karpicke testing effect 2006 + Leitner box + SuperMemo SM-2 Woźniak + Anki + Duolingo half-life regression — interactive forgetting-curve viz); assessment + evaluation (Black-Wiliam 1998 + CTT + IRT Rasch 1960 + Cronbach alpha + Lord-Novick + Flynn + Koretz critique); instructional design + pedagogy (ADDIE + Dick-Carey + Wiggins-McTighe UbD + UDL + Rosenshine + Mazur peer instruction + Bergmann-Sams flipped + Hattie visible learning); curriculum + standards (Tyler 1949 + Schwab + Eisner + Common Core + NGSS + science of reading Seidenberg); educational technology (Skinner teaching machine 1958 + PLATO + ITS Anderson-Corbett-Koedinger + Khan Academy 2006 + MOOCs + Reich Failure to Disrupt + adaptive Knewton + ALEKS + xAPI Caliper Siemens); and modern frontier — AI tutors + Bloom 2-sigma + ITS lineage + Khanmigo + Squirrel AI + Means-Toyama 2010 online + Hanushek economic returns + Tinto + PISA + LLM-augmented teachers. The education stack end-to-end.",
    nodes: [
      { slug: "education-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-enlightenment", "dewey-montessori-vygotsky", "modern-bloom-skinner-freire"], prereqs: [], description: "Socrates + Quintilian + Comenius 1657 + Rousseau Émile 1762 + Pestalozzi + Froebel kindergarten; Dewey 1916 + Montessori + Vygotsky ZPD + Bruner spiral; Bloom taxonomy 1956 + Skinner + Gagné + Piaget-Papert + Freire Pedagogy of the Oppressed 1968." },
      { slug: "learning-theories-and-cognition", title: "Learning Theories + Cognition", level: "practitioner", order: 2, pages: ["behaviorism-cognitivism", "constructivism-situated", "metacognition-self-regulation"], prereqs: ["education-foundations-and-history"], description: "Pavlov + Skinner + cognitive load Sweller 1988 + Mayer multimedia + Miller working memory; Piaget assimilation + Vygotsky social + Lave-Wenger communities of practice + Brown-Collins-Duguid 1989 situated; Zimmerman + Pintrich + Dunlosky 2013." },
      { slug: "memory-spaced-repetition-and-retrieval", title: "Memory + Spaced Repetition", level: "specialist", order: 3, pages: ["ebbinghaus-forgetting-curve", "spacing-testing-bjork-roediger", "srs-leitner-sm2-anki"], prereqs: ["learning-theories-and-cognition"], description: "Ebbinghaus 1885 R = exp(-t/S) + savings; Bjork desirable difficulties + Roediger-Karpicke testing effect 2006 + Rohrer interleaving; Leitner box + SuperMemo SM-2 Woźniak + Anki + Duolingo half-life regression (interactive forgetting-curve + spaced-review viz)." },
      { slug: "assessment-and-evaluation", title: "Assessment + Evaluation", level: "specialist", order: 4, pages: ["formative-summative", "psychometrics-irt", "standardized-critique"], prereqs: ["learning-theories-and-cognition"], description: "Formative vs summative + Black-Wiliam 1998 + rubrics + portfolio + authentic; CTT + reliability + validity + Cronbach + IRT Rasch 1960 + Lord-Novick 1968 + item analysis + DIF; IQ Flynn + SAT/ACT validity + Pearson VUE + Koretz high-stakes critique." },
      { slug: "instructional-design-and-pedagogy", title: "Instructional Design + Pedagogy", level: "expert", order: 5, pages: ["id-models-addie-ubd", "pedagogy-rosenshine-mazur", "differentiation-scaffolding"], prereqs: ["learning-theories-and-cognition"], description: "ADDIE + Dick-Carey + Wiggins-McTighe UbD + 5E + Merrill + UDL; Rosenshine direct + inquiry + PBL + flipped Bergmann-Sams + Mazur peer instruction + Hattie 2009; differentiation + scaffolding + ZPD applied." },
      { slug: "curriculum-and-standards", title: "Curriculum + Standards", level: "expert", order: 6, pages: ["curriculum-theory-tyler", "common-core-ngss", "subject-specific-reading"], prereqs: ["instructional-design-and-pedagogy"], description: "Tyler 1949 + Schwab + Eisner + null/explicit/hidden + Apple + Pinar; Common Core + NGSS + Singapore + Finland + Japan; NCTM math + reading wars + science of reading Seidenberg + Mayer." },
      { slug: "educational-technology-and-online", title: "Ed Tech + Online", level: "expert", order: 7, pages: ["history-skinner-plato-its", "moocs-blended-flipped", "adaptive-analytics"], prereqs: ["instructional-design-and-pedagogy"], description: "Skinner teaching machine 1958 + PLATO 1960s + ITS Anderson-Corbett-Koedinger + Khan 2006 + Bloom 2-sigma; Coursera/edX/Udacity 2012 + completion + Reich Failure to Disrupt + flipped/blended; Knewton + ALEKS + Dragonbox + xAPI + Caliper + Siemens learning analytics." },
      { slug: "modern-frontier-education", title: "Modern Frontier", level: "expert", order: 8, pages: ["ai-tutors-khanmigo", "learning-sciences-scale", "future-llm-ethics"], prereqs: ["memory-spaced-repetition-and-retrieval", "assessment-and-evaluation", "educational-technology-and-online"], description: "Bloom 2-sigma + ITS + GPT tutors + Khanmigo + Squirrel AI + bias + hallucination; Means-Toyama 2010 + Bowen + Tinto + PISA + TIMSS + Hanushek economic returns; universal access + LLM-augmented + ethical concerns + replication crisis ed research." },
    ],
  });

  // P69 — Lawyer path. From Hammurabi + Roman Justinian + Magna Carta
  // 1215 + common law Coke + Napoleonic Code through Holmes + Hart +
  // Dworkin + Posner, constitutional law (Marbury 1803 + Brown 1954 +
  // Roe + Obergefell + Dobbs 2022), precedent + judicial reasoning
  // (stare decisis + landmark case citation network — the viz anchor),
  // civil procedure + Federal Rules + jurisdiction International Shoe,
  // criminal law (Model Penal Code + Miranda + Gideon + Brady),
  // contracts-property-torts (Hadley + Palsgraf + Learned Hand BPL),
  // business law + securities + antitrust + IP, and modern frontier —
  // legal AI + EU AI Act 2024 + climate litigation + LLMs in practice.
  seedMasteryPath({
    slug: "lawyer",
    title: "Lawyer",
    description:
      "From Hammurabi 1754 BCE + Roman law Justinian Corpus Juris + Magna Carta 1215 + common law Coke + Napoleonic Code 1804 through Holmes The Common Law 1881 + Hart Concept of Law 1961 + Dworkin Law's Empire + Posner law and economics; constitutional law (US Constitution + Marbury v. Madison 1803 + Article III + Brown v. Board 1954 + Griswold + Roe + Obergefell + Dobbs 2022); precedent + judicial reasoning (stare decisis + binding vs persuasive + ratio decidendi vs obiter + originalism Scalia vs living constitution Brennan + textualism + Eskridge — interactive landmark-case citation network viz); civil procedure + litigation (International Shoe jurisdiction + Federal Rules + Celotex summary judgment + Class actions Rule 23 + MDL); criminal law + procedure (Model Penal Code + actus reus + mens rea + Mapp + Terry + Miranda + Gideon + Brady + Apprendi + Booker); contracts-property-torts (UCC + Hadley v. Baxendale + Pierson v. Post + Kelo + Lucas takings + Palsgraf + Learned Hand BPL + NYT v. Sullivan); business law + regulation (Berle-Means 1932 + business judgment rule + Delaware + Sarbanes-Oxley 2002 + Dodd-Frank 2010 + Sherman 1890 + Microsoft 2001 + IP); and modern frontier — Lex Machina + ROSS + Casetext + GPT-4 bar exam + EU AI Act 2024 + Section 230 + climate litigation Urgenda + Juliana + LLM-augmented practice. The law stack end-to-end.",
    nodes: [
      { slug: "legal-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-roman-magna-carta", "common-vs-civil", "modern-holmes-hart-dworkin"], prereqs: [], description: "Hammurabi 1754 BCE + Justinian Corpus Juris + Magna Carta 1215 + Coke common law + Napoleonic Code 1804; common law vs civil law traditions; Holmes 1881 + Hart 1961 + Dworkin Law's Empire + Posner law and economics." },
      { slug: "constitutional-law", title: "Constitutional Law", level: "practitioner", order: 2, pages: ["us-constitution-marbury", "federalism-commerce", "rights-brown-roe-obergefell-dobbs"], prereqs: ["legal-foundations-and-history"], description: "US Constitution + amendments + Marbury v. Madison 1803 + Article III + judicial review; federalism + commerce + necessary-and-proper + state sovereignty; due process + equal protection + 1st amendment + Brown 1954 + Griswold + Roe + Obergefell + Dobbs 2022." },
      { slug: "precedent-and-judicial-reasoning", title: "Precedent + Reasoning", level: "specialist", order: 3, pages: ["stare-decisis-originalism", "interpretation-textualism", "landmark-case-network"], prereqs: ["legal-foundations-and-history"], description: "Stare decisis + binding vs persuasive + ratio decidendi vs obiter dicta + originalism Scalia vs living Brennan; textualism vs purposivism + Eskridge dynamic statutory interpretation; landmark case citation networks Marbury → Brown → Loving → Obergefell + Roe → Casey → Dobbs (interactive viz)." },
      { slug: "civil-procedure-and-litigation", title: "Civil Procedure + Litigation", level: "specialist", order: 4, pages: ["jurisdiction-int-shoe", "pleadings-discovery-celotex", "trial-appeals-class"], prereqs: ["legal-foundations-and-history"], description: "Personal + subject matter + International Shoe + Burnham + Pennoyer; Federal Rules + summary judgment Celotex + Anderson v. Liberty Lobby; appellate standards de novo + clearly erroneous + class actions Rule 23 + MDL." },
      { slug: "criminal-law-and-procedure", title: "Criminal Law + Procedure", level: "expert", order: 5, pages: ["mpc-actus-mens", "constitutional-procedure", "sentencing-apprendi"], prereqs: ["constitutional-law"], description: "Model Penal Code + actus reus + mens rea (purposeful/knowing/reckless/negligent) + insanity M'Naghten + Durham + MPC; 4th Mapp + Terry + 5th Miranda + 6th Gideon + Brady + Confrontation; sentencing + Apprendi + Booker + Padilla v. Kentucky." },
      { slug: "contracts-property-and-torts", title: "Contracts, Property + Torts", level: "expert", order: 6, pages: ["contracts-formation-ucc", "property-pierson-kelo", "torts-palsgraf-hand"], prereqs: ["civil-procedure-and-litigation"], description: "Offer + acceptance + consideration + UCC Article 2 + Hadley v. Baxendale + specific performance; estates + Pierson + adverse possession + zoning Euclid v. Ambler 1926 + Kelo + Lucas takings; negligence Palsgraf + Learned Hand BPL + products liability + NYT v. Sullivan." },
      { slug: "business-law-and-regulation", title: "Business Law + Regulation", level: "expert", order: 7, pages: ["corporations-berle-means", "securities-sox-dodd-frank", "antitrust-ip"], prereqs: ["contracts-property-and-torts"], description: "Berle-Means 1932 + fiduciary duty + business judgment rule + Delaware General Corporation Law; 1933/34 Acts + SEC + Sarbanes-Oxley 2002 + Dodd-Frank 2010 + insider trading Texas Gulf Sulphur + Basic v. Levinson; Sherman 1890 + Clayton + Standard Oil 1911 + Microsoft 2001 + patents + copyright + DMCA." },
      { slug: "modern-frontier-law", title: "Modern Frontier", level: "expert", order: 8, pages: ["legal-ai-lex-machina-casetext", "ai-regulation-eu-act", "international-climate-litigation"], prereqs: ["precedent-and-judicial-reasoning", "business-law-and-regulation"], description: "Lex Machina + ROSS + Casetext + GPT-4 bar exam + ediscovery + algorithmic discrimination Sweeney + AI judges debate; EU AI Act 2024 + US executive orders + Section 230 reform; ICC + ICJ + Geneva + climate litigation Urgenda + Juliana + LLM-augmented practice." },
    ],
  });

  // P68 — Immunologist path. Jenner 1796 + Pasteur + Ehrlich + Burnet
  // clonal selection 1957 + Tonegawa V(D)J + Doherty-Zinkernagel MHC
  // restriction through innate (TLRs Beutler-Hoffmann 2011 + Steinman
  // DCs 2011), adaptive (the viz anchor — T/B cells + clonal selection
  // + somatic hypermutation), antibodies + MHC + Köhler-Milstein
  // hybridomas 1984, vaccines (Karikó-Weissman mRNA 2023 + COVID),
  // autoimmunity + tolerance + Coombs-Gell hypersensitivity, cancer
  // immunotherapy (Allison-Honjo checkpoint 2018 + CAR-T Sadelain-June),
  // and modern frontier — scRNA-seq + spatial + AI antibody design +
  // Human Cell Atlas Regev-Teichmann.
  seedMasteryPath({
    slug: "immunologist",
    title: "Immunologist",
    description:
      "From Jenner 1796 smallpox vaccine + Pasteur attenuation + Behring-Kitasato 1890 + Ehrlich side-chain + Metchnikoff phagocytosis through Burnet clonal selection 1957 + Medawar tolerance + Tonegawa V(D)J recombination 1987 Nobel + Doherty-Zinkernagel MHC restriction 1996, innate immunity (barriers + complement + TLRs Beutler-Hoffmann Nobel 2011 + Janeway pattern hypothesis + inflammasome + Steinman DCs Nobel 2011), adaptive + clonal selection (Th1/Th2/Th17/Treg + CD8 cytotoxic + B cells + class switching AID Honjo + germinal centers Nussenzweig + repertoire ~10^11 — interactive viz showing naive→expansion→contraction→memory), antibodies + MHC (IgG/IgA/IgM/IgE + class I/II + Köhler-Milstein hybridomas 1984 + phage display Winter 2018), vaccines + infection (live/inactivated/subunit/conjugate/mRNA Karikó-Weissman Nobel 2023 + COVID Pfizer-Moderna 2020-21 + adjuvants + smallpox eradication 1980 + HPV Frazer-zur Hausen), autoimmunity (RA/SLE/MS/T1D + AIRE/IPEX + Coombs-Gell hypersensitivity I-IV + Coffman-Mosmann Th2), cancer immunotherapy (Allison CTLA-4 + Honjo PD-1 Nobel 2018 + checkpoint inhibitors + CAR-T Sadelain-June + Rosenberg TIL + BiTEs), and modern frontier — scRNA-seq Tang-Macosko-10x + Visium + MERFISH + Human Cell Atlas Regev-Teichmann + AI antibody design + Adaptive Biotechnologies + AlphaFold + universal flu/HIV vaccines + cancer mRNA vaccines. The immunology stack end-to-end.",
    nodes: [
      { slug: "immunology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-jenner-pasteur", "modern-burnet-tonegawa", "cells-organs"], prereqs: [], description: "Jenner 1796 + Pasteur attenuation + Koch postulates + Behring-Kitasato 1890 Nobel 1901 + Ehrlich Nobel 1908 + Metchnikoff Nobel 1908; Burnet clonal selection 1957 + Medawar tolerance Nobel 1960 + Tonegawa V(D)J Nobel 1987 + Doherty-Zinkernagel MHC restriction Nobel 1996; bone marrow + thymus + spleen + lymph nodes + MALT/GALT." },
      { slug: "innate-immunity", title: "Innate Immunity", level: "practitioner", order: 2, pages: ["barriers-complement", "pattern-recognition-tlrs", "effector-cells-cytokines"], prereqs: ["immunology-foundations-and-history"], description: "Epithelial + AMPs (defensins, cathelicidins) + complement (classical/lectin/alternative) + opsonization + MAC; TLRs Beutler-Hoffmann 2011 Nobel + Akira + Janeway pattern hypothesis + NLRs + inflammasome Tschopp + RIG-I; neutrophils + macrophages + NK cells + ILCs + DCs Steinman Nobel 2011 + IL-1 + TNF + IFN-α/β/γ." },
      { slug: "adaptive-immunity-and-clonal-selection", title: "Adaptive + Clonal Selection", level: "specialist", order: 3, pages: ["t-cell-biology", "b-cell-antibody-biology", "clonal-selection-vdj"], prereqs: ["innate-immunity"], description: "CD4 helper (Th1/Th2/Th17/Treg) + CD8 cytotoxic + TCR + thymic selection; naive B → plasma + memory + class switching + somatic hypermutation Rajewsky + germinal centers Nussenzweig; Burnet 1957 + V(D)J Tonegawa + RAG1/2 Schatz-Baltimore + AID Honjo + repertoire ~10^11 (interactive clonal-selection viz)." },
      { slug: "antibodies-and-mhc", title: "Antibodies + MHC", level: "specialist", order: 4, pages: ["antibody-structure-classes", "mhc-antigen-presentation", "antibody-engineering"], prereqs: ["adaptive-immunity-and-clonal-selection"], description: "IgG (γ subclasses) + IgA dimer + IgM pentamer + IgE + Fc receptors + ADCC; MHC class I endogenous + class II exogenous + cross-presentation + thymic selection Doherty-Zinkernagel; hybridomas Köhler-Milstein Nobel 1984 + humanization Adair + Winter phage display Nobel 2018 + bispecifics + Carter." },
      { slug: "infection-and-vaccines", title: "Infection + Vaccines", level: "expert", order: 5, pages: ["pathogen-classes-evasion", "vaccine-platforms", "modern-vaccine-programs"], prereqs: ["adaptive-immunity-and-clonal-selection"], description: "Viruses + bacteria + fungi + parasites + immune evasion (HIV/influenza antigenic variation + Mtb dormancy); live attenuated + inactivated + subunit + conjugate + mRNA Karikó-Weissman Nobel 2023 + viral vector + adjuvants alum/MF59/AS01; smallpox eradication 1980 + polio + HPV Frazer-zur Hausen + RSV + COVID Pfizer-Moderna 2020-21." },
      { slug: "autoimmunity-and-immunopathology", title: "Autoimmunity + Immunopathology", level: "expert", order: 6, pages: ["tolerance-autoimmunity", "major-diseases-ra-sle-ms-t1d", "hypersensitivity-allergy"], prereqs: ["adaptive-immunity-and-clonal-selection"], description: "Central (negative selection) vs peripheral (Treg) + AIRE + APECED + IPEX; RA anti-CCP + SLE ANA + MS oligoclonal + T1D + psoriasis + Crohn's + Hashimoto's; Coombs-Gell Type I-IV + IgE mast cells + asthma + anaphylaxis + Th2 Coffman-Mosmann." },
      { slug: "cancer-immunotherapy", title: "Cancer Immunotherapy", level: "expert", order: 7, pages: ["immunosurveillance-editing", "checkpoint-inhibitors", "cellular-therapies-car-t"], prereqs: ["adaptive-immunity-and-clonal-selection"], description: "Burnet-Thomas + Schreiber immunoediting + neoantigens Rosenberg; Allison CTLA-4 + Honjo PD-1 Nobel 2018 + ipilimumab 2011 + nivolumab/pembrolizumab + TMB; adoptive T cell + Rosenberg TILs + CAR-T Sadelain-June-Brentjens + tisagenlecleucel 2017 + BiTEs + TCR therapy." },
      { slug: "modern-frontier-immunology", title: "Modern Frontier", level: "expert", order: 8, pages: ["single-cell-multi-omics", "spatial-organoids", "ai-for-immunology"], prereqs: ["antibodies-and-mhc", "autoimmunity-and-immunopathology", "cancer-immunotherapy"], description: "scRNA-seq Tang + Klein + Macosko Drop-seq + 10x + ATAC-seq + CITE-seq + Human Cell Atlas Regev-Teichmann; Visium + MERFISH + tumor microenvironment organoids; Adaptive Biotechnologies repertoire + AlphaFold antibody design + Nussenzweig BG505 mosaic HIV + universal flu + cancer mRNA + LLMs in immunology." },
    ],
  });

  // P67 — Political Scientist path. From Plato + Aristotle + Machiavelli
  // + Hobbes-Locke-Rousseau + Tocqueville through behavioral revolution
  // Easton-Almond-Verba-Dahl, political theory Rawls-Nozick-Walzer +
  // critique Pateman-Mills-Habermas, comparative politics Lijphart +
  // Acemoglu-Robinson, electoral systems + Arrow's impossibility (the
  // viz anchor), international relations Waltz-Mearsheimer-Keohane-Wendt,
  // American politics Federalist + Mayhew + Achen-Bartels, political
  // economy Olson + Ostrom + Piketty, and modern frontier — computational
  // Bonica + Grimmer + AI + democracy under pressure.
  seedMasteryPath({
    slug: "political-scientist",
    title: "Political Scientist",
    description:
      "From classical — Plato Republic + Aristotle Politics + Machiavelli 1513 The Prince + Hobbes Leviathan + Locke + Rousseau + Tocqueville Democracy in America — through behavioral revolution Easton-Almond-Verba-Dahl polyarchy + Lijphart consensus vs majoritarian; political theory (Rawls 1971 + Nozick + Dworkin + Walzer + Pateman Sexual Contract + Mills Racial Contract + Cohen + Habermas deliberative + Mouffe agonistic + Brown); comparative politics (regime types V-Dem + Levitsky-Way competitive authoritarianism + Linz + institutional design + Acemoglu-Robinson Why Nations Fail + Tilly + Fukuyama); electoral systems + voting (FPTP + IRV + Borda + Condorcet + approval — interactive viz with Arrow 1951 impossibility + Gibbard-Satterthwaite + Duverger + median voter Downs); international relations (realism Morgenthau + Waltz 1979 + Mearsheimer offensive + liberalism Keohane + Nye + democratic peace Doyle-Russett + constructivism Wendt + Finnemore-Sikkink); American politics (Federalist Madison-Hamilton-Jay + Schlesinger imperial presidency + Mayhew electoral connection + Converse + Achen-Bartels Democracy for Realists + Hacker-Pierson polarization); political economy (Olson 1965 + Hardin commons + Ostrom Nobel 2009 + Downs + Hotelling + Acemoglu + Hall-Soskice varieties of capitalism + Piketty); and modern frontier — computational Bonica DIME + Grimmer-Stewart text-as-data + Gerber-Green field experiments + Allcott-Gentzkow misinformation + Bail polarization. The political-science stack end-to-end.",
    nodes: [
      { slug: "political-science-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["classical-machiavelli-hobbes-locke", "behavioral-revolution", "modern-rational-choice"], prereqs: [], description: "Plato Republic + Aristotle Politics + Machiavelli 1513 + Hobbes Leviathan + Locke + Rousseau + Tocqueville; Easton political systems + Almond-Verba Civic Culture + Dahl polyarchy + Lijphart consensus vs majoritarian; rational choice + new institutionalism + Acemoglu-Robinson Why Nations Fail." },
      { slug: "political-theory", title: "Political Theory", level: "practitioner", order: 2, pages: ["liberal-rawls-nozick", "critique-walzer-pateman-mills", "deliberative-habermas-mouffe"], prereqs: ["political-science-foundations-and-history"], description: "Rawls 1971 + veil of ignorance + Nozick Anarchy State Utopia + Dworkin; Walzer Spheres of Justice + Sandel + Pateman Sexual Contract + Mills Racial Contract + Cohen Marxist; Habermas deliberative + Mouffe agonistic + Connolly + Brown undoing the demos." },
      { slug: "comparative-politics", title: "Comparative Politics", level: "practitioner", order: 3, pages: ["regime-types-v-dem", "institutional-design", "development-state-tilly"], prereqs: ["political-science-foundations-and-history"], description: "Democracy/autocracy/hybrid + Linz + Levitsky-Way competitive authoritarianism + V-Dem; Lijphart consensus vs majoritarian + Linz presidentialism + federalism + Duverger electoral rules; Acemoglu-Robinson inclusive vs extractive + Mahoney path dependence + Tilly state-building + Fukuyama." },
      { slug: "electoral-systems-and-voting", title: "Electoral Systems + Voting", level: "specialist", order: 4, pages: ["voting-methods", "arrow-gibbard-satterthwaite", "duverger-strategic"], prereqs: ["political-science-foundations-and-history"], description: "FPTP + IRV/RCV + Condorcet + approval + Borda + STAR + proportional (interactive comparison viz); Arrow 1951 impossibility + Gibbard-Satterthwaite + May's theorem + median voter Downs 1957; Duverger's law + strategic voting + gerrymandering + Norris electoral integrity." },
      { slug: "international-relations", title: "International Relations", level: "specialist", order: 5, pages: ["realism-waltz-mearsheimer", "liberalism-keohane-nye", "constructivism-wendt"], prereqs: ["political-science-foundations-and-history"], description: "Morgenthau classical realism + Waltz 1979 neorealism + Mearsheimer offensive realism + balance of power; Keohane After Hegemony + Nye soft power + democratic peace Doyle-Russett; Wendt anarchy + Finnemore-Sikkink norms + Buzan English school + critical security Booth." },
      { slug: "american-politics", title: "American Politics", level: "expert", order: 6, pages: ["foundations-federalist-madison", "behavior-converse-achen-bartels", "parties-polarization"], prereqs: ["comparative-politics"], description: "Federalist Papers Madison-Hamilton-Jay + Constitution + Schlesinger imperial presidency 1973 + Mayhew electoral connection 1974; Converse 1964 belief systems + Achen-Bartels Democracy for Realists + Fiorina retrospective + Campbell American Voter; Aldrich Why Parties + Hacker-Pierson asymmetric polarization." },
      { slug: "political-economy", title: "Political Economy", level: "expert", order: 7, pages: ["collective-action-olson-ostrom", "median-voter-downs-spatial", "new-institutional-piketty"], prereqs: ["political-theory", "comparative-politics"], description: "Olson 1965 Logic of Collective Action + Hardin commons + Ostrom Nobel 2009; Downs 1957 Economic Theory of Democracy + Hotelling + Romer-Rosenthal agenda control; Acemoglu-Robinson + Persson-Tabellini + Hall-Soskice varieties of capitalism + Piketty inequality." },
      { slug: "modern-frontier-political-science", title: "Modern Frontier", level: "expert", order: 8, pages: ["computational-bonica-grimmer", "experiments-gerber-green", "ai-democracy-2020s"], prereqs: ["electoral-systems-and-voting", "american-politics"], description: "Bonica DIME ideal points + Grimmer-Stewart text-as-data + Bisbee + social media analysis; Gerber-Green Get Out the Vote field experiments + lab + online; Allcott-Gentzkow misinformation + recommender amplification + AI-generated political content + Bail polarization + future of the discipline." },
    ],
  });

  // P66 — Philosopher path. From Socrates-Plato-Aristotle through
  // Descartes-Kant-Hegel + 20th c analytic/continental, logic + language
  // (the viz anchor — propositional truth tables + Frege-Russell-Tarski),
  // epistemology Gettier + reliabilism + Bayesian, metaphysics Kripke
  // modal + Lewis possible worlds, ethics virtue/deontology/
  // consequentialism + Parfit + Singer, mind + consciousness Nagel +
  // Chalmers hard problem + Searle Chinese Room, political philosophy
  // Hobbes/Locke/Rousseau/Rawls/Nozick/Sen, and modern frontier — AI
  // ethics Bostrom-Russell + experimental philosophy + LLM-philosophy.
  seedMasteryPath({
    slug: "philosopher",
    title: "Philosopher",
    description:
      "From ancient — Socrates + Plato Republic + Aristotle Nicomachean + Stoics + Epicurus — through Augustine + Aquinas + Descartes 1641 + Spinoza + Leibniz + Locke + Hume + Kant 1781 + Hegel + 20th c analytic (Frege + Russell + Wittgenstein + Quine) vs continental (Husserl + Heidegger + Sartre + Foucault + Derrida); logic + philosophy of language (propositional ¬ ∧ ∨ → ↔ + truth tables — interactive viz; predicate ∀ ∃ + Frege 1879 Begriffsschrift + Russell-Whitehead Principia + Tarski semantic truth + sense/reference + Kripke Naming and Necessity + Wittgenstein language games + Grice implicature); epistemology (JTB + Gettier 1963 + reliabilism Goldman + virtue Sosa + skepticism + Bayesian Howson-Urbach + IBE); metaphysics (universals + Kripke 1972 modality + Lewis 1986 modal realism + endurantism/perdurantism + presentism/eternalism + free will Frankfurt-Pereboom); ethics (virtue Aristotle-MacIntyre + deontology Kant + consequentialism Bentham-Mill-Singer + Parfit + metaethics Moore-Ayer-Mackie + Korsgaard + Williams + care Gilligan); mind + consciousness (dualism + Ryle + identity Place-Smart + functionalism Putnam-Fodor + Nagel 1974 + Jackson + Chalmers 1995 hard problem + Searle Chinese Room + Dennett + IIT Tononi); political philosophy (Hobbes 1651 + Locke + Rousseau + Rawls 1971 veil of ignorance + Nozick + Dworkin + Sen-Nussbaum capabilities + Habermas); and modern frontier — AI ethics Bostrom Superintelligence + Russell Human Compatible + Christiano alignment + Floridi + experimental philosophy Knobe-Stich-Machery + Chalmers LLMs and consciousness. The philosophy stack end-to-end.",
    nodes: [
      { slug: "philosophy-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["ancient-socrates-aristotle", "medieval-modern-descartes-kant", "20c-analytic-continental"], prereqs: [], description: "Socrates + Plato Republic + Aristotle Nicomachean + Stoics + Epicurus; Augustine + Aquinas + Descartes 1641 + Spinoza + Leibniz + Locke + Hume + Kant 1781 + Hegel; analytic Frege-Russell-Wittgenstein-Quine vs continental Husserl-Heidegger-Sartre-Foucault-Derrida." },
      { slug: "logic-and-language", title: "Logic + Philosophy of Language", level: "practitioner", order: 2, pages: ["propositional-logic", "predicate-frege-tarski", "philosophy-of-language"], prereqs: ["philosophy-foundations-and-history"], description: "Propositional connectives ¬ ∧ ∨ → ↔ + truth tables + tautologies + soundness/completeness (interactive viz); ∀ ∃ + Frege 1879 + Russell-Whitehead Principia + Tarski; Frege sense/reference + Russell descriptions + Kripke Naming and Necessity + Wittgenstein language games + Grice." },
      { slug: "epistemology", title: "Epistemology", level: "practitioner", order: 3, pages: ["knowledge-jtb-gettier", "skepticism-putnam-moore", "bayesian-formal"], prereqs: ["philosophy-foundations-and-history"], description: "JTB + Gettier 1963 + reliabilism Goldman + virtue Sosa-Zagzebski; Cartesian demon + brain-in-vat + Putnam externalism + Moore proof-of-external-world; Carnap + Hempel + Bayesian confirmation Howson-Urbach + IBE." },
      { slug: "metaphysics", title: "Metaphysics", level: "specialist", order: 4, pages: ["substance-universals", "modality-kripke-lewis", "time-free-will"], prereqs: ["philosophy-foundations-and-history"], description: "Plato realism + Aristotle moderate + nominalism Quine; Kripke 1972 + Lewis 1986 modal realism + necessity a posteriori; endurantism vs perdurantism + presentism vs eternalism + Frankfurt + Pereboom hard incompatibilism." },
      { slug: "ethics", title: "Ethics", level: "specialist", order: 5, pages: ["virtue-deontology-consequentialism", "metaethics-realism-non-cognitivism", "applied-parfit-singer"], prereqs: ["philosophy-foundations-and-history"], description: "Aristotle/MacIntyre virtue + Kant categorical imperative + Bentham-Mill-Singer; Moore + Ayer/Stevenson + Mackie error theory + Korsgaard; Parfit Reasons and Persons + population ethics + Singer animal liberation + Williams + care Gilligan." },
      { slug: "mind-and-consciousness", title: "Mind + Consciousness", level: "expert", order: 6, pages: ["dualism-physicalism", "hard-problem-nagel-chalmers", "searle-dennett-iit"], prereqs: ["philosophy-foundations-and-history"], description: "Descartes + Ryle + Place-Smart identity + Putnam-Fodor functionalism + Churchland eliminativism; Nagel 1974 + Jackson Mary's Room + Chalmers 1995 hard problem + zombies; Searle Chinese Room + Dennett illusionism + global workspace Baars + IIT Tononi." },
      { slug: "political-and-social-philosophy", title: "Political + Social Philosophy", level: "expert", order: 7, pages: ["social-contract-hobbes-locke-rousseau", "liberal-rawls-nozick", "capabilities-critique"], prereqs: ["ethics"], description: "Hobbes 1651 Leviathan + Locke + Rousseau; Rawls 1971 + veil of ignorance + Nozick Anarchy State Utopia + Dworkin; Sen + Nussbaum capabilities + Cohen + Pateman + Mills Racial Contract + Habermas deliberative." },
      { slug: "modern-frontier-philosophy", title: "Modern Frontier", level: "expert", order: 8, pages: ["ai-ethics-bostrom-russell", "experimental-philosophy", "llm-philosophy"], prereqs: ["mind-and-consciousness", "political-and-social-philosophy"], description: "Bostrom Superintelligence 2014 + Russell Human Compatible + Christiano alignment + Floridi; Knobe + Stich + Machery cross-cultural intuitions + xphi; Chalmers LLMs and consciousness + philosophy as engineering + future of the discipline." },
    ],
  });

  // P65 — Historian path. From Herodotus + Thucydides + Sima Qian +
  // Ibn Khaldun + Ranke + Annales + Braudel longue durée + microhistory
  // through ancient civilizations (the viz anchor — parallel
  // civilization timeline), medieval + early modern, industrial +
  // modern, social/economic history (Annales + Hobsbawm + Thompson +
  // Pomeranz Great Divergence), cultural/intellectual (Foucault +
  // Cambridge school + Kuhn), global + environmental (McNeill + Diamond
  // + Crosby Columbian Exchange + Chakrabarty), and modern frontier —
  // digital humanities + GIS + topic modeling + Moretti distant reading
  // + LLM-augmented history.
  seedMasteryPath({
    slug: "historian",
    title: "Historian",
    description:
      "From historiography — Herodotus + Thucydides + Sima Qian + Tacitus + Ibn Khaldun Muqaddimah 1377 + Ranke source criticism + Annales Bloch-Febvre-Braudel longue durée + Ginzburg microhistory — through ancient civilizations Mesopotamia + Egypt + Indus + China + Greco-Roman + Mesoamerica + Jaspers axial age 800-200 BCE (with interactive parallel-timeline viz), medieval + Islamic golden age + Mongol + Black Death + Renaissance + Columbian exchange, industrial + nationalism + WW1/2 + Cold War + decolonization + globalization, social/economic history (Thompson Making of English Working Class + Hobsbawm + Pomeranz Great Divergence + Beckert Empire of Cotton), cultural/intellectual (Foucault Discipline and Punish + Cambridge school Skinner + Kuhn Structure of Scientific Revolutions + Shapin-Schaffer), global + environmental history (McNeill plagues + Diamond GGS + Crosby Columbian Exchange + Chakrabarty climate of history + Anthropocene), and modern frontier — digital humanities + Moretti distant reading + GIS + topic modeling + AI-augmented history + future of the discipline. The history stack end-to-end.",
    nodes: [
      { slug: "historiography-and-methods", title: "Historiography + Methods", level: "apprentice", order: 1, pages: ["ancient-early-modern", "20c-schools-annales", "methods-sources"], prereqs: [], description: "Herodotus + Thucydides + Sima Qian + Tacitus + Ibn Khaldun 1377 + Ranke source criticism; Annales Bloch + Febvre + Braudel longue durée + Wallerstein + microhistory Ginzburg + Carlo Levi; primary/secondary + archives + oral history + cliometrics + counterfactuals." },
      { slug: "ancient-civilizations", title: "Ancient Civilizations", level: "practitioner", order: 2, pages: ["river-civilizations", "axial-age", "classical-empires"], prereqs: ["historiography-and-methods"], description: "Mesopotamia Sumer + Akkad + Babylon + Egypt Old/Middle/New Kingdoms + Indus Harappa-Mohenjo + Yellow River Shang-Zhou + Mesoamerica Olmec-Maya + Andes (interactive parallel-civilization timeline viz); Jaspers 800-200 BCE Confucius + Buddha + Hebrew prophets + Pre-Socratics + Zoroaster; Achaemenid + Greek city-states + Alexander + Roman + Han + Mauryan-Gupta." },
      { slug: "medieval-and-early-modern", title: "Medieval + Early Modern", level: "specialist", order: 3, pages: ["late-antique-medieval", "world-systems-early-modern"], prereqs: ["ancient-civilizations"], description: "Fall of Rome + Byzantine + Justinian + Islamic golden age 8th-13th c (Al-Khwarizmi + Avicenna + Averroes) + Tang-Song + Heian + feudalism; Mongol + Black Death 1347 + Ottoman + Ming + Mughal + Renaissance + Luther 1517 + Scientific Revolution + Columbian exchange Crosby 1972 + Atlantic slavery + Braudel capitalism." },
      { slug: "industrial-and-modern", title: "Industrial + Modern", level: "specialist", order: 4, pages: ["industrial-revolution", "20c-world-wars", "cold-war-globalization"], prereqs: ["medieval-and-early-modern"], description: "Industrial revolution Britain 1760-1840 + nation-states + 1848 + Marx + colonialism + scramble for Africa + WW1 + Russian Revolution 1917 + Great Depression + fascism + WW2 + Holocaust + Hiroshima 1945; Cold War + decolonization + 1968 + neoliberalism + 1989 + globalization." },
      { slug: "social-economic-history", title: "Social + Economic History", level: "expert", order: 5, pages: ["annales-thompson-hobsbawm", "cliometrics-pomeranz", "world-systems-allen"], prereqs: ["medieval-and-early-modern"], description: "Braudel three temporalities + E.P. Thompson 1963 Making of English Working Class + Hobsbawm age of revolution-capital-empire-extremes; Fogel-Engerman Time on the Cross + Le Roy Ladurie Montaillou + Pomeranz 2000 Great Divergence + Beckert Empire of Cotton + Rodney How Europe Underdeveloped Africa; Wallerstein world-systems + Allen economic history." },
      { slug: "cultural-and-intellectual-history", title: "Cultural + Intellectual History", level: "expert", order: 6, pages: ["foucault-genealogy", "cambridge-skinner", "cultural-turn-kuhn"], prereqs: ["historiography-and-methods"], description: "Foucault Discipline and Punish 1975 + History of Sexuality + biopolitics + genealogy; Cambridge school Skinner + Pocock + intellectual history contextual reading; Hunt + Darnton Great Cat Massacre + Joan Scott gender + Kuhn 1962 Structure of Scientific Revolutions + Shapin-Schaffer Leviathan and the Air Pump." },
      { slug: "global-and-environmental-history", title: "Global + Environmental History", level: "expert", order: 7, pages: ["global-mcneill-diamond", "environmental-crosby-anthropocene", "connected-subrahmanyam"], prereqs: ["industrial-and-modern"], description: "McNeill Plagues and Peoples 1976 + Diamond GGS 1997 + Bayly Birth of the Modern World + Conrad + entanglement; Crosby Columbian Exchange + Ecological Imperialism + Worster Dust Bowl + Little Ice Age + Anthropocene + Chakrabarty 2009 climate of history; Subrahmanyam connected histories." },
      { slug: "modern-frontier-digital-history", title: "Digital Humanities + Frontier", level: "expert", order: 8, pages: ["digital-humanities", "ai-for-history"], prereqs: ["cultural-and-intellectual-history", "global-and-environmental-history"], description: "Rosenzweig + GIS history + LDA topic modeling on archives + Moretti distant reading 2013 + network analysis history + Mapping Republic of Letters Stanford; OCR HTR Transkribus + NER + LLM-augmented research + Underwood + computational text analysis; future of the discipline." },
    ],
  });

  // P64 — Psychologist path. From Wundt 1879 Leipzig + James + Freud +
  // Watson + Skinner + Piaget + cognitive revolution Neisser-Chomsky
  // through cognitive (attention + memory + heuristics), social +
  // personality (the viz anchor — Big Five OCEAN radar), developmental
  // (Piaget + Vygotsky + Bowlby + Erikson + Kohlberg), clinical +
  // abnormal (DSM-5 + CBT + DBT + ACT), neuropsychology (Gage + HM +
  // split-brain + Damasio + fMRI), evolutionary + cross-cultural
  // (Tooby-Cosmides + Buss + Henrich WEIRD + Hofstede), and modern
  // frontier — replication crisis + Bayesian + computational + LLM
  // psychology.
  seedMasteryPath({
    slug: "psychologist",
    title: "Psychologist",
    description:
      "From Wundt 1879 Leipzig laboratory + James 1890 Principles + Hall + Titchener through Freud + Jung + Watson 1913 + Skinner operant + Pavlov + Tolman + Chomsky 1959 review + Neisser 1967 cognitive revolution + Piaget + Bandura + Mischel + Kahneman + Tversky, cognitive psychology (Broadbent + Treisman + Posner attention + Miller 7±2 + Baddeley working memory + Tulving episodic + heuristics + System 1/2 dual-process), social + personality (Asch + Milgram + Zimbardo + Festinger dissonance + Big Five OCEAN McCrae-Costa + HEXACO Ashton-Lee + Mischel — with interactive radar viz comparing archetypes), developmental (Piaget stages + Vygotsky ZPD + Bowlby + Ainsworth + Harlow + Erikson + Kohlberg), clinical + abnormal (DSM-5 + RDoC + Beck cognitive triad + Linehan DBT + Hayes ACT), neuropsychology (Phineas Gage 1848 + HM Scoville-Milner + Broca + Wernicke + Sperry split-brain + Damasio + fMRI), evolutionary + cross-cultural (Tooby-Cosmides + Buss + Trivers + Henrich WEIRD + Hofstede + Markus-Kitayama), and modern frontier — replication crisis OSC 2015 + Ioannidis + Bayesian + Tenenbaum + Friston + LLM psychology. The psychology stack end-to-end.",
    nodes: [
      { slug: "psychology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-wundt-james", "behaviorism-psychoanalysis", "cognitive-revolution"], prereqs: [], description: "Wundt 1879 Leipzig + James 1890 + Hall + Titchener; Freud + Jung + Adler + Watson 1913 + Skinner operant + Pavlov classical; Tolman + Chomsky 1959 Skinner critique + Neisser 1967 + Piaget + Bandura + Mischel + Kahneman-Tversky." },
      { slug: "cognitive-psychology", title: "Cognitive Psychology", level: "practitioner", order: 2, pages: ["attention-perception", "memory-systems", "heuristics-system1-2"], prereqs: ["psychology-foundations-and-history"], description: "Broadbent filter + Treisman feature integration + Rensink change blindness + Posner attention networks; Miller 7±2 + Baddeley working memory + Tulving episodic/semantic + Squire declarative/procedural + Schacter false memories; Wason + Tversky-Kahneman + System 1/2 Evans-Stanovich." },
      { slug: "social-and-personality-psychology", title: "Social + Personality", level: "specialist", order: 3, pages: ["classic-social-experiments", "big-five-ocean", "modern-attitudes"], prereqs: ["psychology-foundations-and-history"], description: "Asch 1951 + Milgram 1963 + Zimbardo 1971 + Festinger 1957 dissonance + Sherif + Latané-Darley; psychometrics + Big Five OCEAN McCrae-Costa NEO-PI-R + HEXACO Ashton-Lee + Mischel person-situation (interactive radar viz with archetype overlays); Greenwald-Banaji IAT + dual attitudes." },
      { slug: "developmental-psychology", title: "Developmental", level: "specialist", order: 4, pages: ["cognitive-piaget-vygotsky", "attachment-bowlby", "moral-erikson-kohlberg"], prereqs: ["psychology-foundations-and-history"], description: "Piaget sensorimotor/preoperational/concrete/formal + Vygotsky ZPD + scaffolding + Bruner; Bowlby + Ainsworth strange situation + Harlow + secure/anxious/avoidant + Hazan-Shaver adult; Kohlberg + Gilligan + Erikson 8 stages + Bronfenbrenner ecological + Steinberg." },
      { slug: "clinical-and-abnormal-psychology", title: "Clinical + Abnormal", level: "expert", order: 5, pages: ["dsm-rdoc-nosology", "cognitive-models-disorders", "treatments-cbt-dbt-act"], prereqs: ["psychology-foundations-and-history"], description: "DSM-5/5-TR + ICD-11 + RDoC NIMH; depression Beck cognitive triad + anxiety Clark + OCD Salkovskis + PTSD Ehlers-Clark + schizophrenia Bentall; CBT Beck + Ellis REBT + Linehan DBT 1993 + Hayes ACT + medications + RCT evidence." },
      { slug: "neuropsychology-and-biological", title: "Neuropsychology + Biological", level: "expert", order: 6, pages: ["classic-lesion-cases", "assessment-tools", "cognitive-neuroscience"], prereqs: ["cognitive-psychology"], description: "Phineas Gage 1848 + HM Scoville-Milner 1957 + Tan Broca 1861 + Wernicke 1874 + Sperry split-brain Nobel 1981; Wechsler WAIS + Halstead-Reitan + Boston Process; fMRI + ERP + TMS + Decety + Damasio somatic markers + Phelps emotion." },
      { slug: "evolutionary-and-cross-cultural", title: "Evolutionary + Cross-Cultural", level: "expert", order: 7, pages: ["evolutionary-psych", "cross-cultural-hofstede", "weird-henrich"], prereqs: ["social-and-personality-psychology"], description: "Tooby-Cosmides + Buss mate preferences + Pinker + Trivers reciprocal altruism + parental investment; Hofstede dimensions + Triandis + Markus-Kitayama self-construals + Henrich 2010 WEIRD + cultural neuroscience + Heine." },
      { slug: "modern-frontier-psychology", title: "Modern Frontier", level: "expert", order: 8, pages: ["replication-crisis", "bayesian-computational", "llm-psychology"], prereqs: ["clinical-and-abnormal-psychology", "evolutionary-and-cross-cultural"], description: "OSC 2015 + Ioannidis why most published research is false + ManyLabs + preregistration + Registered Reports + Bayesian Wagenmakers; Tenenbaum + Griffiths + free-energy Friston + RL models; Argyle + Bail LLM-as-test-subject + future of the field + Mischel marshmallow." },
    ],
  });

  // P63 — Sociologist path. From Comte + Marx + Durkheim + Weber +
  // Du Bois + Chicago school + Mills through classical + modern theory
  // (functionalism + conflict + interactionism + Bourdieu), methods
  // (quant + qual + Burawoy ethnography + Pearl in sociology), networks
  // + stratification + Schelling segregation (the viz anchor),
  // race-class-gender intersection (Crenshaw + Collins + Bonilla-Silva),
  // urban + environmental (Chicago + Jacobs + Sassen + Klinenberg),
  // computational social science (Lazer + Watts + Centola + Bakshy +
  // Macy + text-as-data Grimmer-Stewart), and modern frontier —
  // algorithmic society (Zuboff + Eubanks + Benjamin + O'Neil + LLM
  // synthetic populations).
  seedMasteryPath({
    slug: "sociologist",
    title: "Sociologist",
    description:
      "From founders — Comte 1838 (coined sociology) + Marx-Engels + Durkheim 1893/1897 + Weber 1905 Protestant Ethic + W.E.B. Du Bois 1899 Philadelphia Negro + Chicago school Park-Burgess + Mead + Mills 1959 Sociological Imagination + Parsons — through classical/modern theory (functionalism Durkheim-Parsons-Merton + conflict Marx-Mills-Frankfurt school + interactionism Goffman dramaturgy + Bourdieu habitus + capital + field), methods (Likert surveys + Lazarsfeld + Geertz thick description + Burawoy extended case + Morgan-Winship causal inference + Pearl in sociology), networks + stratification + Schelling 1971 segregation (with interactive 30×30 torus viz) + Granovetter weak ties + Blau-Duncan + Chetty Opportunity Atlas + Massey-Denton, race-class-gender intersection (Du Bois double consciousness + Crenshaw 1989 + Collins matrix of domination + Connell hegemonic masculinity + Butler + Bonilla-Silva), urban + environmental sociology (Chicago concentric zones + Jacobs 1961 + Lefebvre right to the city + Sassen global cities + Klinenberg heat wave + Bullard environmental justice), computational social science (Lazer 2009 manifesto + Watts + Centola + Bakshy Facebook + Bail polarization + Epstein-Axtell Sugarscape + Macy + Grimmer-Stewart text-as-data + Garg word2vec bias), and modern frontier — algorithmic society Zuboff Surveillance Capitalism 2019 + Eubanks + Benjamin + O'Neil + LLM synthetic populations Argyle. The sociology stack end-to-end.",
    nodes: [
      { slug: "sociology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["founders-comte-marx-durkheim-weber", "american-chicago-du-bois-mills", "modern-bourdieu-foucault"], prereqs: [], description: "Comte 1838 + Marx-Engels + Durkheim 1893 division of labor + 1897 Suicide + Weber 1905 Protestant Ethic + 1922 Economy and Society; W.E.B. Du Bois 1899 Philadelphia Negro + Chicago Park-Burgess + Mead + Mills 1959 + Parsons; Bourdieu + Foucault + Goffman + Coleman + Habermas + Bauman + Latour." },
      { slug: "social-theory-classical-and-modern", title: "Social Theory", level: "practitioner", order: 2, pages: ["functionalism", "conflict-critical", "interactionism-bourdieu"], prereqs: ["sociology-foundations-and-history"], description: "Durkheim → Parsons → Merton manifest/latent + dysfunctions; Marx → Wright + Dahrendorf + Mills power elite + Frankfurt school Adorno-Horkheimer; Mead + Blumer + Goffman dramaturgy + Bourdieu habitus + cultural/social/symbolic/economic capital + field." },
      { slug: "methods-quantitative-and-qualitative", title: "Methods (Quant + Qual)", level: "practitioner", order: 3, pages: ["surveys-lazarsfeld", "ethnography-geertz-burawoy", "causal-inference-sociology"], prereqs: ["sociology-foundations-and-history"], description: "Likert + sampling + Lazarsfeld; Geertz thick description + Burawoy extended case + autoethnography; regression + multilevel + Morgan-Winship + IV + DiD + RDD + Pearl in sociology + mixed methods Creswell." },
      { slug: "networks-stratification-and-segregation", title: "Networks + Stratification", level: "specialist", order: 4, pages: ["networks-granovetter-watts", "stratification-blau-duncan-chetty", "schelling-segregation"], prereqs: ["social-theory-classical-and-modern"], description: "Granovetter 1973 weak ties + Milgram 1967 small-world + Watts-Strogatz + Barabási + Coleman closure + Burt structural holes; Blau-Duncan 1967 + Wright class + Goldthorpe EGP + Chetty Opportunity Atlas; Schelling 1971 (interactive segregation viz) + Massey-Denton + tipping points." },
      { slug: "race-class-gender-intersection", title: "Race, Class, Gender + Intersection", level: "specialist", order: 5, pages: ["race-du-bois-omi-winant", "gender-connell-butler", "intersectionality-crenshaw"], prereqs: ["social-theory-classical-and-modern"], description: "Du Bois 1903 double-consciousness + color-line + Omi-Winant racial formation + Bonilla-Silva color-blind racism; Connell hegemonic masculinity + West-Zimmerman doing gender + Butler performativity + Hochschild emotional labor + second shift; Crenshaw 1989 + Collins matrix." },
      { slug: "urban-and-environmental-sociology", title: "Urban + Environmental", level: "expert", order: 6, pages: ["chicago-jacobs-lefebvre", "global-cities-sassen", "environmental-justice"], prereqs: ["networks-stratification-and-segregation"], description: "Park-Burgess concentric zones 1925 + Wirth urbanism + Jacobs 1961 Death and Life + Lefebvre right to the city; Sassen 1991 global cities + Castells network society + Florida creative class critique; Catton-Dunlap NEP 1978 + Schnaiberg treadmill + Klinenberg heat wave Chicago 1995 + Bullard." },
      { slug: "computational-social-science", title: "Computational Social Science", level: "expert", order: 7, pages: ["lazer-manifesto-2009", "networks-at-scale", "abm-and-text-as-data"], prereqs: ["methods-quantitative-and-qualitative", "networks-stratification-and-segregation"], description: "Lazer 2009 Science CSS manifesto + big data + digital trace; Watts + Centola + Bakshy Facebook 2015 echo chambers + Bail polarization; Schelling + Epstein-Axtell Sugarscape + Macy-Willer ABM; Grimmer-Stewart text-as-data + Garg word2vec gender bias + LLM-augmented research." },
      { slug: "modern-frontier-sociology", title: "Modern Frontier", level: "expert", order: 8, pages: ["algorithmic-society", "platform-sociology", "ai-and-sociology"], prereqs: ["race-class-gender-intersection", "computational-social-science"], description: "Zuboff 2019 Surveillance Capitalism + Eubanks Automating Inequality + Benjamin 2019 Race After Technology + O'Neil Weapons of Math Destruction; Vaidhyanathan + van Dijck + Gillespie content moderation + Sweeney algorithmic discrimination; synthetic populations + Argyle-Hewitt LLMs as research subjects + future of the discipline." },
    ],
  });

  // P62 — Cosmologist path. From Einstein 1917 + Friedmann 1922 +
  // Hubble 1929 + Penzias-Wilson 1964 CMB through GR essentials,
  // Friedmann equations (the viz anchor), CMB + recombination, inflation,
  // dark matter + dark energy, structure formation + BAO, and modern
  // tensions + JWST + DESI + Vera Rubin. Distinct from P28 astrophysicist
  // (this focuses on universe-as-whole + dark sector + cosmological GR).
  seedMasteryPath({
    slug: "cosmologist",
    title: "Cosmologist",
    description:
      "From Einstein 1917 cosmological constant + Friedmann 1922 + Lemaître 1927 + Hubble 1929 redshift-distance + Penzias-Wilson 1964 CMB Nobel 1978 through GR essentials + Einstein equations + FLRW metric, Friedmann equations + ΛCDM + critical density + Ω_m + Ω_Λ (with interactive a(t) viz showing Big Bang, age, and future fate), CMB + recombination + Sachs-Wolfe + acoustic peaks + Planck 2018 + B-mode polarization + BICEP, inflation + Guth 1981 + slow-roll + n_s + r + multiverse + Sakharov baryogenesis, dark matter — Zwicky 1933 + Rubin rotation curves + Bullet cluster + WIMPs/axions + DESI 2024 + dynamical DE, structure formation + Press-Schechter + Millennium + IllustrisTNG + BAO standard ruler, and modern frontier — H₀ tension + S8 + JWST early galaxies + LISA + Vera Rubin LSST + Euclid + AI cosmology. The cosmology stack end-to-end.",
    nodes: [
      { slug: "cosmology-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["einstein-friedmann-hubble", "big-bang-cmb-discovery", "cosmological-principle"], prereqs: [], description: "Einstein 1917 + Friedmann 1922 + Lemaître 1927 + Hubble 1929 redshift-distance; Gamow + Alpher + Herman 1948 BBN + Hoyle Big Bang coinage + Penzias-Wilson 1964 Nobel 1978; cosmological principle + isotropy + homogeneity + observational pillars." },
      { slug: "general-relativity-essentials", title: "General Relativity Essentials", level: "practitioner", order: 2, pages: ["equivalence-curvature", "einstein-equations", "metrics-tests"], prereqs: ["cosmology-foundations-and-history"], description: "Equivalence principle + Riemann tensor + Ricci + Einstein equations Gμν = 8πG/c⁴ Tμν + Λ; Schwarzschild + Kerr + FLRW + black holes; cosmological constant problem + de Sitter + perihelion + lensing + GW170817 + EHT M87/SgrA*." },
      { slug: "friedmann-equations-and-expansion", title: "Friedmann Equations + Expansion", level: "specialist", order: 3, pages: ["flrw-scale-factor", "friedmann-eqns-omegas", "lcdm-concordance-fate"], prereqs: ["general-relativity-essentials"], description: "FLRW metric + a(t) + Hubble param + critical density; Friedmann + acceleration + fluid equations + Ω_m + Ω_Λ + Ω_r + Ω_k (interactive a(t) viz); ΛCDM Planck 2018 + DES + DESI + future Big Rip vs heat death." },
      { slug: "cmb-and-recombination", title: "CMB + Recombination", level: "specialist", order: 4, pages: ["photon-baryon-plasma", "cmb-anisotropy", "polarization-b-modes"], prereqs: ["friedmann-equations-and-expansion"], description: "Saha + Peebles + recombination z=1100 T=3000K + last-scattering; Sachs-Wolfe + acoustic oscillations + sound horizon + WMAP 2003 + Planck 2018; E/B polarization + reionization τ + BICEP2 2014 + LiteBIRD + Simons Observatory + CMB-S4." },
      { slug: "inflation-and-early-universe", title: "Inflation + Early Universe", level: "expert", order: 5, pages: ["horizon-flatness-monopole", "guth-slow-roll", "perturbations-baryogenesis"], prereqs: ["friedmann-equations-and-expansion"], description: "Horizon + flatness + monopole problems + Kaluza-Klein; Guth 1981 + Linde + Albrecht-Steinhardt slow-roll + e-folds; quantum perturbations → scalar + tensor + n_s ≈ 0.965 + r BICEP/Planck; reheating + Sakharov + leptogenesis + multiverse + Linde eternal." },
      { slug: "dark-matter-and-dark-energy", title: "Dark Matter + Dark Energy", level: "expert", order: 6, pages: ["dark-matter-evidence", "candidates-direct-detection", "1998-supernova-de"], prereqs: ["friedmann-equations-and-expansion"], description: "Zwicky 1933 + Rubin rotation curves + bullet cluster 2006 + lensing + N-body + WIMPs/axions/sterile-ν + MOND + LZ + XENONnT + ADMX nulls; 1998 SNe Ia Perlmutter-Schmidt-Riess Nobel 2011 + w + quintessence + DESI 2024 dynamical-DE hint." },
      { slug: "structure-formation-and-bao", title: "Structure Formation + BAO", level: "expert", order: 7, pages: ["linear-perturbations", "n-body-millennium", "bao-standard-ruler"], prereqs: ["cmb-and-recombination", "dark-matter-and-dark-energy"], description: "Linear perturbation + Jeans + transfer function; spherical collapse + Press-Schechter + halo MF + N-body Millennium 2005 + Bolshoi + IllustrisTNG + EAGLE + AbacusSummit; BAO sound-horizon ruler + SDSS BOSS + eBOSS + DESI 2024 + RSD." },
      { slug: "modern-frontier-cosmology", title: "Modern Frontier + Tensions", level: "expert", order: 8, pages: ["h0-s8-tensions", "new-windows", "ai-cosmology"], prereqs: ["cmb-and-recombination", "structure-formation-and-bao"], description: "H₀ tension Planck 67.4 vs SH0ES 73.04 + JWST recalibration + S8 σ8 + early dark energy + ν mass; 21cm EDGES/HERA/SKA + LISA stochastic + LIGO O5 + CMB-S4 + Euclid 2023 + JWST early galaxies + Roman 2027 + Vera Rubin LSST 2025; simulation-based inference + emulators + LLMs for theory." },
    ],
  });

  // P61 — Mathematician path. From foundations + Hilbert + Gödel +
  // Bourbaki through algebra + groups (the viz anchor — group orbits),
  // analysis + topology + manifolds, number theory + Wiles + Mochizuki,
  // combinatorics + Ramsey + Erdős, category theory + Curry-Howard +
  // HoTT, probability + Kolmogorov + martingales + Itô, and modern
  // Fields-medal frontier + Langlands + AI for math (Lean + AlphaProof
  // IMO 2024).
  seedMasteryPath({
    slug: "pure-mathematician",
    title: "Pure Mathematician",
    description:
      "From Euclid + Newton + Gauss + Riemann + Cantor + Hilbert 23 problems through Russell + Gödel 1931 + Bourbaki, abstract algebra + groups + rings + fields + Galois (with interactive D4/Z6/S3 group-orbit viz showing orbit-stabilizer), analysis + Lebesgue measure + topology + manifolds + Milnor exotic spheres + Perelman Ricci-flow Poincaré 2003, number theory + Riemann zeta + Wiles-Taylor Fermat 1995 + Mochizuki abc, combinatorics + Ramsey + Erdős extremal + flag algebras, category theory + Yoneda + Kan + Lawvere + Curry-Howard-Lambek + HoTT Voevodsky + Lean/Coq formalized, probability + Kolmogorov 1933 + martingales + Itô + free probability Voiculescu + random matrices Tao-Vu, and modern frontier — Langlands + Fields medals Tao/Mirzakhani/Bhargava/Scholze/Viazovska + AI for math (Lean + AlphaProof IMO silver 2024). The mathematics stack end-to-end.",
    nodes: [
      { slug: "math-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["history-euclid-hilbert", "russell-godel-cohen", "bourbaki-modern-style"], prereqs: [], description: "Euclid Elements + Newton/Leibniz + Gauss + Riemann + Cantor + Hilbert 23 problems 1900; Russell paradox 1901 + Gödel incompleteness 1931 + Cohen continuum 1963; Bourbaki + von Neumann + Erdős + Grothendieck + Wiles 1995 + Perelman 2003." },
      { slug: "abstract-algebra-and-groups", title: "Abstract Algebra + Groups", level: "practitioner", order: 2, pages: ["groups-orbits-lagrange", "rings-fields-ideals", "galois-theory-quintic"], prereqs: ["math-foundations-and-history"], description: "Groups + axioms + cyclic + dihedral + symmetric + orbits + stabilizers + Lagrange (interactive viz); rings + fields + ideals + polynomial rings; Galois 1832 + solvability + quintic insolubility Abel-Ruffini + Klein icosahedral." },
      { slug: "analysis-and-topology", title: "Analysis + Topology", level: "practitioner", order: 3, pages: ["real-analysis-lebesgue", "metric-topological-spaces", "manifolds-perelman"], prereqs: ["math-foundations-and-history"], description: "Completeness + Cauchy + uniform convergence + Lebesgue measure + dominated convergence; metric + topological + Heine-Borel + Tychonoff + Urysohn; manifolds + de Rham + Stokes + Milnor exotic spheres + Smale h-cobordism + Perelman Ricci flow." },
      { slug: "number-theory", title: "Number Theory", level: "specialist", order: 4, pages: ["classical-primes-fermat", "analytic-riemann-zeta", "modern-wiles-mochizuki"], prereqs: ["abstract-algebra-and-groups"], description: "Primes + Euclid + Fermat + Euler totient + Gauss quadratic reciprocity + Dirichlet AP; Riemann zeta + PNT Hadamard-de la Vallée Poussin 1896 + RH + Bombieri + Selberg; class field theory + Wiles-Taylor Fermat 1995 + Mochizuki abc + Polymath." },
      { slug: "combinatorics-and-graph-theory-math", title: "Combinatorics + Graph Theory", level: "specialist", order: 5, pages: ["enumeration-generating-fns", "ramsey-extremal", "designs-algebraic-combo"], prereqs: ["math-foundations-and-history"], description: "Generating functions + binomial + Catalan + Stirling + Hardy-Ramanujan partitions; Ramsey 1930 + Schur + Erdős-Ko-Rado + Erdős-Stone-Simonovits + flag algebras Razborov; Steiner systems + Latin squares + Stanley-Reisner + characters." },
      { slug: "category-theory-and-foundations", title: "Category Theory + Foundations", level: "expert", order: 6, pages: ["categories-functors-yoneda", "limits-adjoints-monads", "topoi-curry-howard-hott"], prereqs: ["abstract-algebra-and-groups", "analysis-and-topology"], description: "Categories + functors + Eilenberg-Mac Lane 1945 + universal properties; limits + colimits + adjoint + Yoneda + monads + Kan extensions; topoi Grothendieck + Lawvere ETCS + Curry-Howard-Lambek + HoTT Voevodsky + Lean/Coq formalized." },
      { slug: "probability-and-measure", title: "Probability + Measure", level: "expert", order: 7, pages: ["kolmogorov-measure-theoretic", "martingales-brownian-ito", "modern-free-probability"], prereqs: ["analysis-and-topology"], description: "Kolmogorov 1933 + σ-algebras + Lebesgue integral + conditional expectation + Radon-Nikodym; martingales + Markov + Brownian + Itô + SDEs + Feynman-Kac; large deviations + concentration + free probability Voiculescu + random matrices Tao-Vu." },
      { slug: "modern-frontier-math", title: "Modern Frontier", level: "expert", order: 8, pages: ["langlands-program", "fields-medalists", "ai-for-math"], prereqs: ["number-theory", "category-theory-and-foundations", "probability-and-measure"], description: "Langlands automorphic forms + L-functions + Ngô fundamental lemma Fields 2010 + Geometric Langlands; Tao + Lurie + Scholze + Bhargava + Mirzakhani 2014 + Birkar + Avila + Figalli + Duminil-Copin + Viazovska 2022; Lean + Coq formalized + AlphaProof IMO silver 2024 + LLM-augmented + Maynard." },
    ],
  });

  // P60 — Roboticist path. From Devol/Engelberger Unimate 1961 + Shakey
  // 1969 through forward + inverse kinematics (the viz anchor), dynamics
  // + control, perception + sensors + SLAM, motion planning + RRT/PRM,
  // manipulation + grasping + Dex-Net + diffusion policy, mobile + legged
  // + ZMP + Boston Dynamics + RL policies, and modern AI robotics +
  // RT-1/RT-2 + Optimus/Figure 01 + π0 foundation models.
  seedMasteryPath({
    slug: "humanoid-robotics-engineer",
    title: "Humanoid Robotics Engineer",
    description:
      "From robotics history — Devol/Engelberger Unimate 1961 + Shakey 1969 + ASIMO + Boston Dynamics + Tesla Optimus + RT-2 — through forward + inverse kinematics + Denavit-Hartenberg + Jacobian + singularities (with interactive N-link arm viz), dynamics + Newton-Euler + Lagrangian + PID + computed torque + MPC, perception + IMU + LIDAR + RGB-D + Kalman + EKF-SLAM + ORB-SLAM + LOAM, motion planning + Minkowski + PRM Kavraki 1996 + RRT LaValle 1998 + RRT* + STOMP + CHOMP + iLQR, manipulation + grasp planning + Dex-Net 2017 + diffusion policy Chi 2023 + Mobile ALOHA Stanford, mobile + legged + ZMP Vukobratović 1972 + Pratt capture point + Boston Dynamics Atlas + Anymal RL Lee 2020 Nature, and modern AI robotics — RT-1/RT-2 Google + PaLM-E + OpenVLA + Octo + π0 Physical Intelligence + Optimus + Figure 01 + Agility Digit + Isaac Sim. The robotics stack end-to-end.",
    nodes: [
      { slug: "robotics-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["history-unimate-asimo-bd", "robot-anatomy", "isaacs-brooks-moravec"], prereqs: [], description: "Devol/Engelberger Unimate 1961 + Shakey 1969 + PUMA 560 + ASIMO 2000 + DARPA Grand Challenge + Boston Dynamics + Tesla Optimus + Figure 01 + RT-2 2023; links + joints (revolute, prismatic, spherical) + DOF + end-effectors + workspace; Asimov three laws + Brooks subsumption + Moravec paradox." },
      { slug: "forward-and-inverse-kinematics", title: "Kinematics + Jacobian", level: "practitioner", order: 2, pages: ["dh-transformations", "forward-jacobian", "inverse-kinematics"], prereqs: ["robotics-foundations-and-history"], description: "Denavit-Hartenberg + homogeneous transforms; forward kinematics chain + interactive N-link arm viz + Jacobian + manipulability + singularities; analytical Pieper vs numerical Newton-Raphson/damped least squares + redundancy resolution." },
      { slug: "dynamics-and-control", title: "Dynamics + Control", level: "practitioner", order: 3, pages: ["newton-euler-lagrange", "pid-computed-torque", "modern-mpc-impedance"], prereqs: ["forward-and-inverse-kinematics"], description: "Newton-Euler vs Lagrange equations of motion + mass matrix + Coriolis + gravity; PD/PID + computed torque + feedback linearization + impedance/admittance; MPC + adaptive + sliding mode + Khatib operational space + Boston Dynamics whole-body MPC." },
      { slug: "perception-and-sensors", title: "Perception + Sensors + SLAM", level: "specialist", order: 4, pages: ["sensors-imu-lidar-rgbd", "kalman-state-estimation", "slam-orb-loam"], prereqs: ["robotics-foundations-and-history"], description: "IMU + encoders + force/torque + LIDAR (Velodyne, Ouster) + RGB-D Kinect/RealSense + event + tactile (BioTac, GelSight); Kalman + EKF + particle + factor graphs; SLAM Smith-Self-Cheeseman 1990 + EKF-SLAM + FastSLAM + ORB-SLAM + LSD-SLAM + VINS-Mono + LOAM/LeGO-LOAM." },
      { slug: "motion-planning-and-trajectory", title: "Motion Planning + Trajectory Opt", level: "specialist", order: 5, pages: ["c-space-obstacles", "sampling-prm-rrt", "trajectory-stomp-iLQR"], prereqs: ["robotics-foundations-and-history"], description: "C-space + Minkowski sum; PRM Kavraki 1996 + RRT LaValle 1998 + RRT* + BIT* + KPIECE; STOMP + CHOMP + TrajOpt + iLQR + DDP + dynamic windows + MPC integration." },
      { slug: "manipulation-and-grasping", title: "Manipulation + Grasping", level: "expert", order: 6, pages: ["grasp-planning-force-closure", "tactile-compliance", "dexterous-modern"], prereqs: ["dynamics-and-control"], description: "Form + force closure + Nguyen 1988 + GraspIt! + Dex-Net 2017 Mahler; Shadow Hand + Allegro + Mimic tactile; OpenAI Rubik's cube 2019 + diffusion policy Chi 2023 + Mobile ALOHA Stanford." },
      { slug: "mobile-and-legged-robots", title: "Mobile + Legged Robots", level: "expert", order: 7, pages: ["mobile-drive-omnidirectional", "legged-zmp-capture", "rl-sim-to-real"], prereqs: ["dynamics-and-control"], description: "Differential drive + Ackermann + omnidirectional + Mecanum + odometry; ZMP Vukobratović 1972 + capture point Pratt + Atlas + Anymal + Cassie + Spot; CPG + whole-body MPC + sim-to-real + RL Lee 2020 Anymal Nature + Hwangbo + MIT Cheetah." },
      { slug: "ai-robotics-and-frontier", title: "AI Robotics + Frontier", level: "expert", order: 8, pages: ["imitation-diffusion", "foundation-models-rt2-pi0", "humanoids-optimus-figure"], prereqs: ["motion-planning-and-trajectory", "perception-and-sensors"], description: "DAGGER Ross-Gordon-Bagnell 2011 + behavior cloning + ALOHA Zhao 2023 + diffusion policy + ACT; RT-1/RT-2 Google + PaLM-E + OpenVLA + Octo + π0 Physical Intelligence; Tesla Optimus + Figure 01 + Agility Digit + Sanctuary Phoenix + 1X Neo + Isaac Sim + Habitat scaling." },
    ],
  });

  // P59 — Anthropologist path. Four-field anthropology (cultural,
  // biological, archaeological, linguistic) with depth on kinship +
  // ethnography + paleoanthro + medical anthro. Distinct from P43
  // archaeologist (focuses on material culture) and P37 linguist
  // (focuses on language structure).
  seedMasteryPath({
    slug: "anthropologist",
    title: "Anthropologist",
    description:
      "From the four-field discipline (Tylor + Boas) through human evolution + Lucy + Neanderthals/Denisovans + Pääbo Nobel 2022, classical ethnography (Malinowski, Mead, Geertz) + practice theory, linguistic anthropology + Sapir-Whorf, kinship + Eskimo/Iroquois/Sudanese/Hawaiian systems (with interactive viz) + Lévi-Strauss alliance, economic + political (Mauss gift, Polanyi, Graeber) + Service-Sahlins typology, religion + ritual (Durkheim, Turner, Geertz, Boyer), and medical + applied + frontier (Kleinman, Farmer, decolonizing, multi-species, Anthropocene). The anthropology stack end-to-end.",
    nodes: [
      { slug: "anthropology-foundations-and-four-fields", title: "Foundations + Four Fields", level: "apprentice", order: 1, pages: ["history-tylor-boas", "four-field-approach", "modern-reflexivity"], prereqs: [], description: "Tylor 1871 + Morgan 1877 + Boas anti-racism + four-field (cultural/biological/archaeological/linguistic); evolutionary vs cultural relativism + Mead + Benedict; modern reflexivity + Writing Culture 1986 + Latour + post-colonial critiques." },
      { slug: "human-evolution-and-paleoanthro", title: "Human Evolution + Paleoanthro", level: "practitioner", order: 2, pages: ["hominin-lineage", "homo-sapiens-emergence", "archaic-admixture"], prereqs: ["anthropology-foundations-and-four-fields"], description: "Sahelanthropus → Lucy → Homo erectus → sapiens; Out of Africa + Levallois + Jebel Irhoud 300 kya; Neanderthal + Denisovan admixture + Pääbo Nobel 2022 + Reich lab." },
      { slug: "cultural-anthropology-and-ethnography", title: "Cultural Anthropology + Ethnography", level: "practitioner", order: 3, pages: ["classic-ethnographies", "theoretical-schools", "modern-ethnography"], prereqs: ["anthropology-foundations-and-four-fields"], description: "Malinowski Trobriand + Evans-Pritchard + Mead Samoa + Benedict; functionalism + structuralism + symbolic + Bourdieu habitus + practice theory; multi-sited + digital + autoethnography + sensory + Anthropocene." },
      { slug: "linguistic-anthropology", title: "Linguistic Anthropology", level: "specialist", order: 4, pages: ["sapir-whorf", "ethnography-communication", "endangered-languages"], prereqs: ["cultural-anthropology-and-ethnography"], description: "Sapir-Whorf strong vs weak + Whorf Hopi + Boroditsky; Hymes SPEAKING + speech acts; sociolinguistics + endangered languages + revitalization (cross-ref P37 linguist)." },
      { slug: "kinship-and-social-organization", title: "Kinship + Social Organization", level: "specialist", order: 5, pages: ["terminology-systems", "descent-rules", "marriage-alliance"], prereqs: ["cultural-anthropology-and-ethnography"], description: "Morgan classificatory + Eskimo/Iroquois/Sudanese/Hawaiian/Crow/Omaha (interactive viz); patrilineal/matrilineal/cognatic + lineages + clans + moieties + Evans-Pritchard Nuer + Schneider critique; Lévi-Strauss exchange + endogamy/exogamy + cross/parallel cousin + cultural variation." },
      { slug: "economic-and-political-anthro", title: "Economic + Political Anthropology", level: "expert", order: 6, pages: ["mauss-polanyi", "modes-subsistence", "political-power"], prereqs: ["kinship-and-social-organization"], description: "Mauss gift + Polanyi great transformation + Bourdieu cultural capital + Graeber Debt 5000 yrs; foraging → horticulture → pastoralism → agriculture → industrial + Service-Sahlins typology; Foucault power + Clastres statelessness + Big Man + chiefdoms." },
      { slug: "religion-ritual-and-symbol", title: "Religion + Ritual + Symbol", level: "expert", order: 7, pages: ["classical-theories", "ritual-liminality", "symbolic-cognitive"], prereqs: ["cultural-anthropology-and-ethnography"], description: "Tylor animism + Frazer + Durkheim sacred-profane + Weber Protestant ethic; Van Gennep rites of passage + Turner liminality/communitas + Geertz + Asad; Lévi-Strauss myth + Douglas purity-danger + Boyer + Atran cognitive religion." },
      { slug: "medical-applied-and-frontier", title: "Medical + Applied + Frontier", level: "expert", order: 8, pages: ["medical-anthropology", "applied-development", "multispecies-anthropocene"], prereqs: ["cultural-anthropology-and-ethnography", "economic-and-political-anthro"], description: "Kleinman explanatory models + Farmer structural violence + Scheper-Hughes + Fadiman + Lock local biologies; development critique Escobar/Ferguson + design ethnography Suchman; Haraway multi-species + Tsing Mushroom + decolonizing Smith + AI ethnography + cross-ref P43 ethics." },
    ],
  });

  // P58 — Ecologist path. Quantitative + theoretical ecology distinct
  // from P42 marine-biologist (this one is general/terrestrial-anchored).
  // Population dynamics + MacArthur consumer-resource (the viz anchor)
  // + community + food webs + biogeochemistry + spatial + conservation.
  seedMasteryPath({
    slug: "ecologist",
    title: "Ecologist",
    description:
      "From ecology foundations + biomes + NPP through population dynamics + logistic + Leslie matrix + life tables, species interactions + MacArthur consumer-resource + R* rule + Tilman ZNGI (with interactive viz) + Gause exclusion, communities + Shannon + species-area + niche vs neutral Hubbell + Connell intermediate disturbance, food webs + Lindeman 10% + trophic cascades + Paine keystone + Yellowstone wolves, ecosystems + Costanza services + biogeochemistry + N+P limitation + Vitousek, spatial + metapopulations + Levins + Hanski, and global change + sixth extinction + climate ecology + restoration + rewilding + planetary boundaries. The ecology stack end-to-end.",
    nodes: [
      { slug: "ecology-foundations-and-levels", title: "Foundations + Levels", level: "apprentice", order: 1, pages: ["definition-organization", "biomes", "primary-productivity"], prereqs: [], description: "Haeckel 1866 + levels (individual → biosphere) + autecology vs synecology; biomes Whittaker T+precipitation; net primary productivity Lieth ~120 PgC/yr." },
      { slug: "population-ecology-and-leslie", title: "Population Ecology + Leslie", level: "practitioner", order: 2, pages: ["exponential-logistic", "allee-effect", "age-structured-leslie"], prereqs: ["ecology-foundations-and-levels"], description: "Malthus exponential + Verhulst logistic + carrying capacity K; Allee + density-dependence; Leslie matrix 1945 + λ + stable age + Type I/II/III survivorship." },
      { slug: "species-interactions-and-macarthur", title: "Species Interactions + MacArthur", level: "practitioner", order: 3, pages: ["competition-exclusion", "macarthur-tilman-r-star", "predation-mutualism"], prereqs: ["population-ecology-and-leslie"], description: "Gause 1934 competitive exclusion + Lotka-Volterra; MacArthur 1970 + Tilman R* rule + ZNGI (interactive viz); Holling functional responses + predator-prey + mutualism Bronstein." },
      { slug: "communities-and-biodiversity", title: "Communities + Biodiversity", level: "specialist", order: 4, pages: ["diversity-measures", "assembly-rules", "intermediate-disturbance"], prereqs: ["species-interactions-and-macarthur"], description: "S + Shannon H' + Simpson D + species-area + island biogeography MacArthur-Wilson 1967; niche vs neutral Hubbell 2001 + community phylogenetics; Connell intermediate disturbance + Hutchinson plankton paradox." },
      { slug: "food-webs-and-energy-flow", title: "Food Webs + Energy Flow", level: "specialist", order: 5, pages: ["trophic-pyramids", "food-web-topology", "trophic-cascades"], prereqs: ["species-interactions-and-macarthur"], description: "Lindeman 1942 + 10% rule + pyramids; Elton + connectance + omnivory; HSS 1960 + Yellowstone wolves + Paine keystone + Estes trophic downgrading 2011." },
      { slug: "ecosystem-and-biogeochemistry", title: "Ecosystems + Biogeochemistry", level: "expert", order: 6, pages: ["ecosystem-services", "biogeochemical-cycles", "nutrient-limitation"], prereqs: ["food-webs-and-energy-flow"], description: "Costanza 1997 + provisioning/regulating/cultural + MA 2005; C + N + P + S + water + Redfield + Vitousek 1997 human domination + Galloway; Liebig + ecosystem stoichiometry Elser-Sterner." },
      { slug: "spatial-ecology-and-metapopulations", title: "Spatial Ecology + Metapopulations", level: "expert", order: 7, pages: ["levins-metapopulation", "source-sink-landscape", "connectivity-corridors"], prereqs: ["population-ecology-and-leslie"], description: "Levins 1969 colonization-extinction + Hanski fritillary; Pulliam source-sink + Forman landscape ecology; corridors + reserve design + SLOSS." },
      { slug: "global-change-conservation-and-frontier", title: "Global Change + Conservation", level: "expert", order: 8, pages: ["sixth-extinction", "climate-ecology", "frontier-restoration"], prereqs: ["communities-and-biodiversity", "ecosystem-and-biogeochemistry"], description: "Ceballos-Ehrlich sixth extinction + IUCN + Living Planet + extinction debt + de-extinction; Parmesan phenology + range shifts + tropicalization; eDNA + camera traps + AI ecology + rewilding + Rockström planetary boundaries + 30x30." },
    ],
  });

  // P57 — Geneticist path. Mendelian foundations through molecular
  // genetics + population genetics + GWAS (the viz anchor) + CRISPR +
  // ethics. Distinct from P44 bioinformatician (data-analysis-centric)
  // and P39 cell-molecular-biologist (broader cell biology).
  seedMasteryPath({
    slug: "geneticist",
    title: "Geneticist",
    description:
      "From Mendel + Morgan classical genetics through Watson-Crick DNA + replication + central dogma, genome organization + mutations + chromatin + ENCODE, Mendelian + complex traits + h² + missing heritability, Hardy-Weinberg + Wright-Fisher + drift + selection + Kimura neutral, GWAS + UK Biobank + Manhattan plot (interactive viz) + polygenic risk scores + LD score regression, CRISPR + Doudna-Charpentier Nobel 2020 + base + prime editing + Casgevy 2023, and ethics + He Jiankui + GINA + ancient DNA Pääbo 2022 + biobanks + synthetic genomics. The genetics stack end-to-end.",
    nodes: [
      { slug: "genetics-foundations-mendel-morgan", title: "Foundations + Mendel + Morgan", level: "apprentice", order: 1, pages: ["mendel-laws", "rediscovery-morgan", "non-mendelian"], prereqs: [], description: "Mendel 1866 pea + segregation + independent assortment + 3:1, 9:3:3:1; Morgan Drosophila Nobel 1933 + linkage + Sturtevant cM; epistasis + polygenic + mitochondrial + incomplete dominance." },
      { slug: "molecular-genetics-dna-and-rna", title: "Molecular Genetics + DNA + RNA", level: "practitioner", order: 2, pages: ["dna-structure-replication", "central-dogma", "telomeres-ribosome"], prereqs: ["genetics-foundations-mendel-morgan"], description: "Watson-Crick 1953 + Franklin photo 51 + Wilkins Nobel 1962 + Chargaff; Meselson-Stahl semiconservative + central dogma + transcription + Sharp-Roberts Nobel 1993 splicing + ribosome Yonath-Steitz-Ramakrishnan Nobel 2009." },
      { slug: "genome-organization-and-mutations", title: "Genome Organization + Mutations", level: "practitioner", order: 3, pages: ["coding-vs-noncoding", "chromatin-encode", "mutational-signatures"], prereqs: ["molecular-genetics-dna-and-rna"], description: "Coding 1-2% + introns + repetitive + transposons McClintock Nobel 1983; chromatin + nucleosomes + methylation + ENCODE 2012; SNV + indel + CNV + SV + repeat expansion + Alexandrov mutational signatures." },
      { slug: "mendelian-and-complex-traits", title: "Mendelian + Complex Traits", level: "specialist", order: 4, pages: ["pedigree-analysis", "mendelian-diseases", "complex-traits-h2"], prereqs: ["molecular-genetics-dna-and-rna"], description: "Autosomal dominant/recessive + X-linked + penetrance + expressivity; cystic fibrosis + sickle cell + Huntington + BRCA + OMIM 7000+; heritability h² + twin studies + missing heritability + variance components." },
      { slug: "population-genetics-hwe-and-evolution", title: "Population Genetics + HWE", level: "specialist", order: 5, pages: ["hardy-weinberg", "drift-selection-migration", "coalescent-kimura"], prereqs: ["genome-organization-and-mutations"], description: "Hardy-Weinberg 1908 p²+2pq+q² + assumptions; mutation + selection + drift Wright + Wright-Fisher; Kingman coalescent + Kimura neutral 1968 + Ne + bottlenecks + selection scans iHS/FST/Tajima D." },
      { slug: "gwas-prs-and-statistical-genetics", title: "GWAS + PRS + Statistical Genetics", level: "expert", order: 6, pages: ["gwas-pipeline", "polygenic-scores", "fine-mapping"], prereqs: ["mendelian-and-complex-traits", "population-genetics-hwe-and-evolution"], description: "GWAS + imputation + LD + Manhattan plot 5×10⁻⁸ (interactive viz) + UK Biobank/FinnGen/MVP; PRS Khera 2018 + PRS-CS + LDpred + ancestry transferability; LD-score + MR + colocalization + CAVIAR/SuSIE fine-mapping." },
      { slug: "genetic-engineering-and-crispr", title: "Genetic Engineering + CRISPR", level: "expert", order: 7, pages: ["recombinant-pcr", "crispr-cas9", "base-prime-therapy"], prereqs: ["molecular-genetics-dna-and-rna"], description: "Berg-Boyer-Cohen 1972 + Asilomar 1975 + Genentech insulin 1982 + Mullis PCR Nobel 1993; Mojica + Doudna + Charpentier Nobel 2020 + Zhang eukaryotic 2013 + PAM; Liu base + prime editing + Casgevy sickle 2023 + CAR-T + Luxturna + Hemgenix." },
      { slug: "ethics-and-frontier-genomics", title: "Ethics + Frontier Genomics", level: "expert", order: 8, pages: ["history-controversies", "modern-debates", "synthetic-ancient-frontier"], prereqs: ["gwas-prs-and-statistical-genetics", "genetic-engineering-and-crispr"], description: "Eugenics history Galton + Buck v Bell + Henrietta Lacks + 23andMe; He Jiankui 2018 + GINA Act 2008 + gene drives Esvelt + biosecurity; Gibson synthetic genomes + JCVI-Syn3 + Pääbo aDNA Nobel 2022 + biobanks + Nagoya benefit sharing." },
    ],
  });

  // P56 — Distributed Systems Engineer path. From Lamport + FLP/CAP
  // through time/clocks + consistency + consensus Paxos/Raft (the viz
  // anchor) + replication + distributed databases + streaming +
  // Byzantine/blockchain + modern cloud. The distsys stack end-to-end.
  seedMasteryPath({
    slug: "distributed-systems-engineer",
    title: "Distributed Systems Engineer",
    description:
      "From Lamport 1978 + 8 fallacies + FLP impossibility + CAP/PACELC through physical/logical/vector/hybrid clocks + happens-before, linearizability + sequential + causal + eventual + CRDTs Shapiro 2011 + collaborative editing, Paxos 1998 + Multi-Paxos + Raft Ongaro-Ousterhout 2014 (with interactive log-replication viz) + view-stamped, replication strategies + Dynamo quorums + chain replication + gossip, NoSQL/NewSQL + Spanner + CockroachDB + sharding + consistent hashing, Kafka log + Flink streaming + exactly-once + event-driven CDC + saga + CQRS, Byzantine consensus PBFT + HotStuff + Tendermint + Nakamoto, and modern cloud Kubernetes + service mesh + serverless + WASM edge. The distsys stack end-to-end.",
    nodes: [
      { slug: "distsys-foundations-and-models", title: "Foundations + Models", level: "apprentice", order: 1, pages: ["definition-fallacies", "failure-models", "theoretical-limits"], prereqs: [], description: "Lamport 1978 + 8 fallacies of distsys; crash-stop vs crash-recovery vs Byzantine + sync/partial-sync/async; FLP impossibility 1985 + CAP Brewer 2000 + PACELC Abadi." },
      { slug: "time-clocks-and-ordering", title: "Time + Clocks + Ordering", level: "practitioner", order: 2, pages: ["physical-clocks-truetime", "logical-vector-clocks", "hybrid-logical"], prereqs: ["distsys-foundations-and-models"], description: "NTP + clock skew + Google TrueTime atomic + GPS; Lamport timestamps + happens-before + Mattern-Fidge vector clocks 1988 + version vectors; HLC Kulkarni 2014 + ITC." },
      { slug: "consistency-models", title: "Consistency Models", level: "practitioner", order: 3, pages: ["strong-models", "weak-models", "crdts"], prereqs: ["time-clocks-and-ordering"], description: "Linearizability Herlihy-Wing 1990 + sequential Lamport + strict serializable; causal + eventual + read-your-writes + monotonic + session + bounded staleness; CRDTs Shapiro 2011 + counters/sets/sequences + Yjs/Automerge." },
      { slug: "consensus-paxos-and-raft", title: "Consensus + Paxos + Raft", level: "specialist", order: 4, pages: ["paxos-variants", "raft-mechanics", "vsr-byzantine"], prereqs: ["consistency-models"], description: "Paxos Lamport 1998 + Multi/Fast/Cheap/Generalized; Raft Ongaro-Ousterhout 2014 + leader election + log replication + safety + interactive viz; view-stamped replication Oki-Liskov 1988." },
      { slug: "replication-and-quorums", title: "Replication + Quorums", level: "specialist", order: 5, pages: ["replication-strategies", "quorum-systems", "gossip"], prereqs: ["consensus-paxos-and-raft"], description: "Single-leader vs multi-leader vs leaderless vs chain replication; Gifford 1979 R+W>N + read repair + hinted handoff Dynamo-style; SWIM + epidemic + Plumtree gossip (Cassandra, Consul)." },
      { slug: "distributed-databases", title: "Distributed Databases", level: "expert", order: 6, pages: ["nosql-revolution", "newsql-spanner", "sharding-partitioning"], prereqs: ["replication-and-quorums"], description: "Dynamo 2007 + BigTable 2006 + Cassandra + DynamoDB + MongoDB; Spanner 2012 + CockroachDB + YugabyteDB + TiDB + global transactions + TrueTime; hash vs range sharding + Citus + Vitess + consistent hashing + Maglev." },
      { slug: "streaming-and-event-systems", title: "Streaming + Event Systems", level: "expert", order: 7, pages: ["log-abstraction-kafka", "stream-processing-flink", "event-driven-cdc"], prereqs: ["replication-and-quorums"], description: "Kreps 2014 The Log + Kafka + Pulsar + Kinesis + Redpanda; Flink + Spark Streaming + ksqlDB + watermarks + exactly-once + event time; CDC Debezium + outbox + saga + CQRS + event sourcing." },
      { slug: "blockchain-byzantine-and-modern", title: "Byzantine + Blockchain + Modern", level: "expert", order: 8, pages: ["byzantine-consensus", "nakamoto-bitcoin", "modern-cloud"], prereqs: ["consensus-paxos-and-raft"], description: "PBFT Castro-Liskov 1999 + Tendermint + HotStuff 2019 + Move/Aptos/Sui; Nakamoto 2008 + PoW + longest chain + selfish mining; Kubernetes + microservices + Istio/Linkerd + serverless cold starts + WASM edge + Fly.io." },
    ],
  });

  // P55 — Zero-Knowledge Engineer path. Foundations (GMR + GMW) through
  // sigma protocols + elliptic curves + SNARKs (groth16/PLONK) + STARKs
  // + MPC + applications (rollups, privacy) + frontier (Nova, zkML).
  // Distinct from the existing cryptographer path (this focuses on ZK
  // + advanced succinct proofs).
  seedMasteryPath({
    slug: "zero-knowledge-engineer",
    title: "Zero-Knowledge Engineer",
    description:
      "From the foundations of zero-knowledge (Goldwasser-Micali-Rackoff 1985 + GMW 1986 + Ali Baba cave) through commitment schemes + Pedersen + Schnorr sigma protocols + Fiat-Shamir, elliptic curves over finite fields + ECDSA + Curve25519/Ed25519 + BLS12-381 + pairings, ZK-SNARKs + Pinocchio + Groth16 + PLONK + R1CS/QAP/AIR/Plonkish + KZG/FRI/IPA (with interactive verification viz), STARKs + Ben-Sasson 2018 + transparent post-quantum + Cairo + StarkNet/RISC Zero zkVM, MPC + Shamir secret sharing + Yao garbled circuits + GMW + SPDZ + threshold ECDSA, applications — zkSync + Polygon zkEVM + Scroll + L2 rollups + Zcash privacy + Sismo identity, and frontier — Nova folding + recursive proofs + zkML + EZKL + universal zkVMs + hardware ZK acceleration. The ZK stack end-to-end.",
    nodes: [
      { slug: "zk-foundations-and-history", title: "Foundations + History", level: "apprentice", order: 1, pages: ["gmr-gmw-foundations", "completeness-soundness-zk", "interactive-vs-niz"], prereqs: [], description: "Goldwasser-Micali-Rackoff 1985 GMR + GMW 1986 NP in ZK + Babai 1985 + Ali Baba cave Quisquater 1989; completeness + soundness + zero-knowledge + simulator + HVZK vs malicious-verifier; interactive vs non-interactive + Fiat-Shamir 1986 + ROM." },
      { slug: "commitments-and-sigma-protocols", title: "Commitments + Sigma Protocols", level: "practitioner", order: 2, pages: ["commitment-schemes", "schnorr-sigma", "fiat-shamir"], prereqs: ["zk-foundations-and-history"], description: "Pedersen + hash + binding + hiding + homomorphic commitments; Σ-protocols + Schnorr ID 1989 + commit-challenge-response + special soundness; Fiat-Shamir → NIZK + transcript hashing + security in ROM." },
      { slug: "elliptic-curves-and-pairings", title: "Elliptic Curves + Pairings", level: "practitioner", order: 3, pages: ["ec-arithmetic-dlp", "named-curves", "bilinear-pairings"], prereqs: ["zk-foundations-and-history"], description: "y²=x³+ax+b + group law + scalar multiplication + Pollard-rho DLP; secp256k1 + Curve25519 + BLS12-381 + alt_bn128 + Edwards/Montgomery; Weil + Tate + optimal ate pairings + BLS signatures + KZG + groth16." },
      { slug: "zk-snarks-and-arithmetization", title: "ZK-SNARKs + Arithmetization", level: "specialist", order: 4, pages: ["snark-history-groth16", "arithmetization-r1cs-plonkish", "polynomial-commitments"], prereqs: ["commitments-and-sigma-protocols", "elliptic-curves-and-pairings"], description: "Pinocchio 2013 + Groth16 + PLONK + universal vs trusted setup (interactive viz); R1CS + QAP + AIR + Plonkish + Halo2 + ACIR; KZG (Kate-Zaverucha-Goldberg 2010) + FRI + IPA + bullet proofs." },
      { slug: "zk-starks-and-fri", title: "ZK-STARKs + FRI", level: "specialist", order: 5, pages: ["stark-foundations", "fri-low-degree-test", "production-starkware-riscz"], prereqs: ["zk-snarks-and-arithmetization"], description: "Ben-Sasson-Bentov-Horesh-Riabzev 2018 + transparent + post-quantum hash-based + larger proofs; FRI Fast Reed-Solomon IOP + low-degree testing + Merkle commitments + folding; StarkWare + Cairo + StarkNet + RISC Zero zkVM + Boojum." },
      { slug: "mpc-and-secret-sharing", title: "MPC + Secret Sharing", level: "expert", order: 6, pages: ["shamir-vss-dkg", "yao-gmw-bgw", "modern-mpc"], prereqs: ["commitments-and-sigma-protocols"], description: "Shamir 1979 (t,n) threshold + Lagrange + VSS Feldman/Pedersen + DKG; Yao 1986 garbled circuits + GMW 1987 + BGW 1988 + semi-honest vs malicious; SPDZ + ABY3 + SecureML + threshold ECDSA + Numerai privacy-preserving ML." },
      { slug: "applications-rollups-and-coins", title: "Applications + Rollups", level: "expert", order: 7, pages: ["zk-rollups", "privacy-coins-mixers", "zk-identity"], prereqs: ["zk-snarks-and-arithmetization"], description: "zkSync + Polygon zkEVM + Scroll + StarkNet + Linea + L2 scaling + DA + recursion; Zcash 2016 (Sapling, Halo, Orchard) + Tornado Cash + Monero RingCT + compliance tension; Sismo + Polygon ID + WorldID + Semaphore + anonymous voting." },
      { slug: "frontier-zkml-and-folding", title: "Frontier — Folding + zkML", level: "expert", order: 8, pages: ["folding-nova-supernova", "zkml-ezkl", "frontier-vms-hardware"], prereqs: ["zk-snarks-and-arithmetization", "mpc-and-secret-sharing"], description: "Nova 2021 Kothapalli-Setty-Tzialla + Halo accumulation + SuperNova + ProtoStar + IVC; zkML + EZKL + Modulus Labs + verifiable inference + costs; universal zk-VMs (RISC-Zero, SP1, Jolt) + FPGA/ASIC acceleration (Cysic, Ingonyama) + lattice-based PQ-ZK + MPC convergence." },
    ],
  });

  // P54 — Network Scientist path. From graph theory + Euler through
  // random/small-world/scale-free (the viz anchor: BA preferential
  // attachment) + community detection + spreading + dynamics + multilayer
  // + applications (social, biology, brain, GNNs). The network-science
  // stack end-to-end.
  seedMasteryPath({
    slug: "network-scientist",
    title: "Network Scientist",
    description:
      "From graph theory + Euler 1736 + adjacency + Laplacian through random Erdős-Rényi + small-world Watts-Strogatz + scale-free Barabási-Albert (with interactive preferential-attachment viz), community detection + Newman modularity + Girvan-Newman + Louvain + Leiden + Infomap, spreading on networks + Pastor-Satorras epidemic threshold + complex contagion + Watts cascades, dynamics — Kuramoto sync + opinion dynamics + Nowak game theory on networks, multilayer + temporal + higher-order simplicial + persistent homology Carlsson, and applications — social/biological/brain (FlyWire, MICrONS) + financial/infrastructure + GNNs (Bronstein geometric DL). The network-science stack end-to-end.",
    nodes: [
      { slug: "network-foundations-and-graph-theory", title: "Foundations + Graph Theory", level: "apprentice", order: 1, pages: ["euler-graphs", "basic-measures", "network-types"], prereqs: [], description: "Euler 1736 Königsberg + König + adjacency matrix + Laplacian; degree distribution + path length + clustering C + assortativity; directed/undirected/weighted/bipartite/multilayer/temporal." },
      { slug: "random-and-small-world-networks", title: "Random + Small World", level: "practitioner", order: 2, pages: ["erdos-renyi", "milgram-six-degrees", "watts-strogatz"], prereqs: ["network-foundations-and-graph-theory"], description: "Erdős-Rényi G(n,p) 1959 + giant component + p_c = 1/n + Poisson; Milgram 1967 + Travers-Milgram + Dodds-Watts email 2003; Watts-Strogatz 1998 + high C + low L + rewiring." },
      { slug: "scale-free-and-preferential-attachment", title: "Scale-Free + Preferential Attachment", level: "practitioner", order: 3, pages: ["ba-model", "scale-free-universality", "criticisms-corrections"], prereqs: ["random-and-small-world-networks"], description: "Barabási-Albert 1999 + preferential attachment + power law P(k) ~ k^-γ γ≈3 + hubs (interactive viz); WWW + citation + sex + airline + protein universality; Broido-Clauset 2019 critique + configuration + Chung-Lu + fitness + HRG." },
      { slug: "community-detection-and-modularity", title: "Community Detection + Modularity", level: "specialist", order: 4, pages: ["newman-modularity", "algorithms-louvain-leiden", "overlapping-temporal"], prereqs: ["random-and-small-world-networks"], description: "Newman modularity Q 2004 + greedy + spectral; Girvan-Newman + Louvain + Leiden + Infomap + label propagation; overlapping + temporal + hierarchical + benchmarking LFR + resolution limit." },
      { slug: "spreading-and-percolation", title: "Spreading + Percolation", level: "specialist", order: 5, pages: ["percolation-networks", "epidemics-on-networks", "cascades-threshold-models"], prereqs: ["scale-free-and-preferential-attachment"], description: "Site/bond percolation + threshold + scale-free p_c → 0; SIR/SIS R₀ on heterogeneous + Pastor-Satorras epidemic threshold + immunization; Granovetter 1978 + Watts cascades 2002 + complex contagion + influence max." },
      { slug: "dynamics-on-networks", title: "Dynamics on Networks", level: "expert", order: 6, pages: ["kuramoto-sync", "opinion-dynamics", "games-on-networks"], prereqs: ["random-and-small-world-networks"], description: "Kuramoto oscillators + sync transition + critical coupling; DeGroot averaging + voter + Deffuant bounded confidence + Galam + echo chambers; Nowak cooperation + structural balance Heider + evolutionary games." },
      { slug: "multilayer-temporal-and-higher-order", title: "Multilayer + Temporal + Higher-Order", level: "expert", order: 7, pages: ["multilayer-multiplex", "temporal-networks", "simplicial-complexes-tda"], prereqs: ["community-detection-and-modularity"], description: "Boccaletti multilayer + interlayer + tensor; Holme-Saramäki temporal + time-respecting + motifs; simplicial complexes + hypergraphs + topological data analysis + persistent homology Carlsson." },
      { slug: "network-applications-and-frontier", title: "Applications + Frontier", level: "expert", order: 8, pages: ["social-bio-brain", "graph-neural-networks", "control-frontier"], prereqs: ["spreading-and-percolation", "dynamics-on-networks"], description: "Social Twitter/Facebook + biological PPI/connectome FlyWire/MICrONS + infrastructure cascading + economic systemic risk Battiston; GNNs Bronstein geometric DL + message passing + GCN/GAT/GraphSAGE + AlphaFold pair representation; Liu-Slotine-Barabási 2011 controllability + quantum networks + LLM-as-network." },
    ],
  });

  // P53 — Electrochemist path. From foundations + Galvani/Volta/Faraday/
  // Nernst through electrode kinetics + Butler-Volmer (the viz anchor)
  // + cells + Li-ion + fuel cells + corrosion + sensors + frontier energy
  // storage. The electrochem stack end-to-end.
  seedMasteryPath({
    slug: "electrochemist",
    title: "Electrochemist",
    description:
      "From electrochemistry foundations + Galvani 1791 + Volta 1800 pile + Faraday 1834 laws + Nernst through electrode kinetics + Butler-Volmer 1924/1930 + Tafel + Marcus electron-transfer (with interactive I-η viz) + mass transport, electrochemical cells + galvanic vs electrolytic + battery metrics + Pb-acid/NiMH/alkaline, lithium-ion batteries + Goodenough/Whittingham/Yoshino Nobel 2019 + LCO/NMC/LFP/Si anode + SEI + degradation, fuel cells + PEM/SOFC + HER/OER + Pt catalysts + green hydrogen + electrolysis, corrosion + Pourbaix + galvanic series + cathodic protection + Statue of Liberty, analytical electrochem + CV/EIS + glucose biosensors + carbon electrodes + wearables, and frontier — solid-state + Na-ion + Li-S + flow + supercaps + AI catalyst discovery (Open Catalyst, A-Lab). The electrochem stack end-to-end.",
    nodes: [
      { slug: "electrochem-foundations", title: "Foundations + History", level: "apprentice", order: 1, pages: ["history-galvani-volta", "thermodynamics-nernst", "cell-notation"], prereqs: [], description: "Galvani 1791 + Volta 1800 pile + Faraday 1834 F = 96485 C/mol; thermodynamics ΔG=-nFE + Nernst + activities + SHE/Ag/AgCl/SCE references; cell notation + half-cells + standard reduction potentials + EMF." },
      { slug: "electrode-kinetics-butler-volmer", title: "Electrode Kinetics + Butler-Volmer", level: "practitioner", order: 2, pages: ["butler-volmer-tafel", "mass-transport", "marcus-theory"], prereqs: ["electrochem-foundations"], description: "Butler-Volmer 1924/1930 + exchange current i₀ + symmetry factor α + Tafel plots (interactive viz); Levich + RDE + Koutecky-Levich + Cottrell; adsorption Frumkin + Marcus 1956 electron-transfer Nobel 1992." },
      { slug: "electrochemical-cells-and-batteries", title: "Cells + Batteries", level: "practitioner", order: 3, pages: ["galvanic-electrolytic", "battery-metrics", "classical-chemistries"], prereqs: ["electrochem-foundations"], description: "Galvanic vs electrolytic + primary vs secondary; energy/power density + cycle life + C-rate + Coulombic efficiency + SOC; Pb-acid + NiCd + NiMH + primary Li + alkaline + Daniell + Leclanché history." },
      { slug: "lithium-ion-batteries", title: "Lithium-Ion Batteries", level: "specialist", order: 4, pages: ["history-goodenough-yoshino", "cathodes-anodes", "sei-degradation-safety"], prereqs: ["electrochemical-cells-and-batteries"], description: "Goodenough/Whittingham/Yoshino Nobel 2019 + Sony 1991 LiCoO₂; LCO/LMO/NMC/NCA/LFP cathodes + voltages + structural stability; graphite + Si + Li-metal anodes + LiPF₆ + SEI + thermal runaway + degradation modes." },
      { slug: "fuel-cells-and-hydrogen", title: "Fuel Cells + Hydrogen", level: "specialist", order: 5, pages: ["fuel-cell-types", "her-oer-catalysts", "electrolysis-green-h2"], prereqs: ["electrode-kinetics-butler-volmer"], description: "PEMFC + AFC + PAFC + MCFC + SOFC + DMFC; HER + OER kinetics + Pt + Pt-alt (NiFe, Mo₂C, SACs); alkaline + PEM + SOEC electrolysis + green H₂ economy + steel decarbonization." },
      { slug: "corrosion-and-protection", title: "Corrosion + Protection", level: "expert", order: 6, pages: ["thermodynamics-pourbaix", "kinetics-localized", "protection-cp-coatings"], prereqs: ["electrode-kinetics-butler-volmer"], description: "Pourbaix diagrams + galvanic series + driving force; mixed potential + Evans diagrams + uniform vs pitting/crevice/SCC/MIC; sacrificial Zn/Mg + impressed-current + coatings + passivation + Statue of Liberty + Titanic." },
      { slug: "analytical-electrochem-and-sensors", title: "Analytical + Sensors", level: "expert", order: 7, pages: ["cv-eis-stripping", "biosensors-clark-glucose", "wearables-modern"], prereqs: ["electrode-kinetics-butler-volmer"], description: "CV + chronoamperometry + EIS Nyquist/Bode + DPV/SWV + stripping; Clark oxygen 1956 + Updike-Hicks glucose 1967 + enzyme/aptamer biosensors; wearables + lab-on-chip + graphene/CNT/BDD electrodes." },
      { slug: "frontier-energy-storage-conversion", title: "Frontier — Storage + Conversion", level: "expert", order: 8, pages: ["solid-state-batteries", "beyond-li-ion", "ai-catalyst-discovery"], prereqs: ["lithium-ion-batteries", "fuel-cells-and-hydrogen"], description: "Solid-state sulfide/oxide/polymer electrolytes + QuantumScape + Toyota + dendrite suppression; Na-ion CATL/BYD + K + Mg/Zn + Li-S + Li-air; vanadium + organic flow + supercaps; ML for electrolyte/electrode discovery (Open Catalyst, A-Lab Berkeley)." },
    ],
  });

  // P52 — Inorganic Chemist path. From periodicity + Mendeleev/Moseley
  // through acid-base + redox, coordination + crystal-field + Tanabe-
  // Sugano (the viz anchor), organometallic + cross-coupling, solid-
  // state, main-group + lanthanide-actinide, and bioinorganic +
  // catalysis frontier.
  seedMasteryPath({
    slug: "inorganic-chemist",
    title: "Inorganic Chemist",
    description:
      "From periodicity + Mendeleev 1869 + Moseley X-ray Z + Pauling electronegativity through acid-base + Brønsted/Lewis/HSAB Pearson + redox + Nernst + Pourbaix, coordination complexes + Werner Nobel 1913 + chelate effect + crystal-field theory + Δ_oct + high-spin/low-spin + Jahn-Teller, spectroscopy + term symbols + Tanabe-Sugano 1954 + LMCT/MLCT + Mössbauer + EPR (with interactive diagram), organometallic + 18-electron + Wilkinson + cross-coupling + Grubbs metathesis Nobel 2005 + Ziegler-Natta, solid-state + close-packing + Madelung + perovskites + spinels + Zintl, main-group + noble-gas chemistry Bartlett 1962 + boron clusters Lipscomb + frustrated Lewis pairs + lanthanide/actinide + transuranic Seaborg, and bioinorganic + heme + nitrogenase + cisplatin + frontier — water splitting + Mn₄CaO₅ + MOFs + GNoME AI catalyst discovery. The inorganic stack end-to-end.",
    nodes: [
      { slug: "inorganic-foundations-and-periodicity", title: "Foundations + Periodicity", level: "apprentice", order: 1, pages: ["mendeleev-moseley", "periodic-trends", "oxidation-states"], prereqs: [], description: "Mendeleev 1869 + Moseley 1913 X-ray Z; Z_eff + atomic/ionic radii + IE + EA + electronegativity Pauling/Allred-Rochow; oxidation states + transition-metal vs main-group + lanthanide contraction + relativistic effects (gold's color, Hg liquid)." },
      { slug: "acids-bases-and-redox", title: "Acids + Bases + Redox", level: "practitioner", order: 2, pages: ["bronsted-lewis-hsab", "redox-pourbaix", "electrochem-ranking"], prereqs: ["inorganic-foundations-and-periodicity"], description: "Brønsted-Lowry + Lewis + Pearson HSAB hard-soft; Nernst + Latimer/Frost diagrams + Pourbaix E vs pH; galvanic vs electrolytic + SHE + metal ranking." },
      { slug: "coordination-complexes-and-d-orbitals", title: "Coordination + d-Orbitals", level: "practitioner", order: 3, pages: ["werner-ligands", "cft-jahn-teller", "lft-spectrochemical"], prereqs: ["inorganic-foundations-and-periodicity"], description: "Werner 1893 Nobel 1913 + ligands + denticity + chelate effect + coordination numbers + geometries; CFT + Δ_oct + Δ_tet + HS vs LS + CFSE + Jahn-Teller; LFT + spectrochemical series + π-donor/acceptor + isomerism." },
      { slug: "spectroscopy-and-tanabe-sugano", title: "Spectroscopy + Tanabe-Sugano", level: "specialist", order: 4, pages: ["term-symbols-rs", "uv-vis-ct", "tanabe-sugano-magnetic"], prereqs: ["coordination-complexes-and-d-orbitals"], description: "Russell-Saunders + microstates + Hund's rules + spin-orbit; UV-vis d-d + LMCT/MLCT/IVCT + Laporte + spin selection; Tanabe-Sugano 1954 + d¹-d⁹ + B Racah + crossover + magnetism + EPR + Mössbauer (interactive viz)." },
      { slug: "organometallic-and-catalysis", title: "Organometallic + Catalysis", level: "specialist", order: 5, pages: ["18e-rule-ferrocene", "homogeneous-catalysis", "heterogeneous-ziegler-natta"], prereqs: ["coordination-complexes-and-d-orbitals"], description: "18-electron + EAN + OA/RE + migratory insertion + β-H elimination + π-allyl + ferrocene Fischer-Wilkinson Nobel 1973; Wilkinson hydrogenation + Monsanto acetic acid + metathesis Grubbs-Schrock-Chauvin Nobel 2005 + asymmetric Knowles-Noyori 2001; Ziegler-Natta polymerization Nobel 1963 + Haber-Bosch Fe." },
      { slug: "solid-state-and-crystallography-ic", title: "Solid-State + Crystallography", level: "expert", order: 6, pages: ["close-packing-madelung", "intermetallics-alloys", "perovskites-spinels-mofs"], prereqs: ["inorganic-foundations-and-periodicity"], description: "Close-packing + interstitial + radius ratio + NaCl/CsCl/ZnS/CaF₂ + Madelung constant; intermetallics + Hume-Rothery + Laves phases; perovskites ABO₃ + spinels + Zintl + zeolites + MOFs (cross-ref P48 X-ray)." },
      { slug: "main-group-and-lanthanide-actinide", title: "Main Group + f-Block", level: "expert", order: 7, pages: ["main-group-chemistry", "f-block-lanthanide-actinide", "nuclear-transuranic"], prereqs: ["inorganic-foundations-and-periodicity"], description: "H₂/N₂/halogens + noble gases (XeF₂ Bartlett 1962) + boron clusters Lipscomb Nobel 1976 + carboranes + silicones + frustrated Lewis pairs Stephan-Erker; 4f vs 5f + lanthanide luminescence + actinide chemistry; radioactivity + neutron capture + fission/fusion + transuranic Seaborg." },
      { slug: "bioinorganic-and-frontier", title: "Bioinorganic + Frontier", level: "expert", order: 8, pages: ["heme-nitrogenase-zn", "metals-in-medicine", "water-splitting-mofs"], prereqs: ["organometallic-and-catalysis", "spectroscopy-and-tanabe-sugano"], description: "Heme + chlorophyll + B12 cobalt corrins + Mo/Fe nitrogenase + ZnF zinc fingers + cisplatin Rosenberg; Pt/Au + Gd MRI + Tc-99m + targeted alpha therapy; water splitting + Mn₄CaO₅ artificial photosynthesis + CO₂ reduction + MOFs H₂ storage + AI catalysis (Open Catalyst + GNoME)." },
    ],
  });

  // P51 — Organic Chemist path. From structure + Wöhler 1828 through
  // functional groups + reactivity + mechanisms + retrosynthesis (the
  // viz anchor) + spectroscopy + natural products + organometallic
  // cross-coupling + medicinal/modern frontier.
  seedMasteryPath({
    slug: "organic-chemist",
    title: "Organic Chemist",
    description:
      "From organic foundations + Wöhler 1828 urea + Kekulé benzene + Lewis structures + hybridization + Cahn-Ingold-Prelog stereochemistry through functional groups + reactivity drivers + IR/NMR/MS identification, reaction mechanisms + arrow-pushing + SN1/SN2 + E1/E2 + EAS, retrosynthesis + Corey Nobel 1990 + disconnection + protecting groups + total synthesis Woodward/Stork/Nicolaou (with interactive retro tree), spectroscopy + 1D/2D NMR Ernst Nobel 1991 + IR/Raman/SERS + LC-MS/MS, natural products + alkaloids/terpenoids/polyketides + total synthesis (strychnine, B12, taxol, brevetoxin) + asymmetric Sharpless/Noyori/Knowles Nobel 2001 + organocatalysis List-MacMillan Nobel 2021, organometallic + Grignard + 18e + cross-coupling Suzuki/Heck/Negishi Nobel 2010 + metathesis Grubbs/Schrock/Chauvin Nobel 2005, and medicinal chemistry + Lipinski + click chemistry Sharpless/Meldal/Bertozzi Nobel 2022 + C-H activation + photoredox + flow + AI for synthesis (IBM RXN, Coley/Jensen, Baran). The organic stack end-to-end.",
    nodes: [
      { slug: "organic-foundations-and-structure", title: "Foundations + Structure", level: "apprentice", order: 1, pages: ["history-wohler", "hybridization-geometry", "stereochemistry-cip"], prereqs: [], description: "Wöhler 1828 urea killed vitalism + Kekulé benzene + Lewis; sp/sp²/sp³ + VSEPR + Newman projections; constitutional + stereoisomers + R/S CIP + meso + atropisomerism + chirality + thalidomide." },
      { slug: "functional-groups-and-reactivity", title: "Functional Groups + Reactivity", level: "practitioner", order: 2, pages: ["functional-group-catalog", "reactivity-drivers-pka", "spectroscopic-id"], prereqs: ["organic-foundations-and-structure"], description: "Alkenes/alkynes/alcohols/ethers/aldehydes/ketones/carboxylic acids/amines/amides/nitriles/halides; electronegativity + electrophiles/nucleophiles + pKa + Hammett σ; IR group frequencies + NMR shifts + MS fragmentation." },
      { slug: "reaction-mechanisms-and-arrow-pushing", title: "Mechanisms + Arrow-Pushing", level: "practitioner", order: 3, pages: ["arrow-pushing-formalism", "sn1-sn2-e1-e2", "eas-directing"], prereqs: ["functional-groups-and-reactivity"], description: "Curly arrows + electron flow; SN1 vs SN2 + carbocation stability + Saytzeff vs Hofmann elimination; EAS + nitration/halogenation + activating vs deactivating substituents." },
      { slug: "retrosynthesis-and-synthesis-planning", title: "Retrosynthesis + Synthesis Planning", level: "specialist", order: 4, pages: ["corey-retrosynthetic", "protecting-groups", "total-synthesis-history"], prereqs: ["reaction-mechanisms-and-arrow-pushing"], description: "Corey 1969 + Nobel 1990 + disconnection + synthons + FGI (interactive viz); TBS/Boc/Fmoc/MOM/Bn + orthogonality + Wuts-Greene; Woodward strychnine + B12, Stork prostaglandins, Baran AI-retrosynthesis Chematica/ASKCOS." },
      { slug: "spectroscopy-nmr-ir-ms", title: "Spectroscopy NMR/IR/MS", level: "specialist", order: 5, pages: ["nmr-1d-2d", "ir-raman-sers", "mass-spec-lc-ms"], prereqs: ["functional-groups-and-reactivity"], description: "¹H + ¹³C + chemical shift + J coupling + Ernst FT-NMR Nobel 1991 + COSY/HSQC/HMBC/DOSY; IR + group frequencies + ATR-FTIR + SERS; ionization EI/ESI/MALDI + HRMS + LC-MS + MS/MS + ion mobility." },
      { slug: "natural-products-and-total-synthesis", title: "Natural Products + Total Synthesis", level: "expert", order: 6, pages: ["natural-product-classes", "total-synthesis-classics", "asymmetric-organocatalysis"], prereqs: ["retrosynthesis-and-synthesis-planning"], description: "Alkaloids + terpenoids + polyketides + peptides + glycosides + biosynthesis; strychnine (Woodward) + B12 (Woodward-Eschenmoser 100 PhDs) + taxol (Holton/Nicolaou) + brevetoxin/maitotoxin Nicolaou; Sharpless/Noyori/Knowles Nobel 2001 + List-MacMillan organocatalysis Nobel 2021." },
      { slug: "organometallics-and-cross-coupling", title: "Organometallics + Cross-Coupling", level: "expert", order: 7, pages: ["grignard-18e-oxidative-addition", "pd-cross-coupling", "metathesis-grubbs-schrock"], prereqs: ["reaction-mechanisms-and-arrow-pushing"], description: "Grignard + organolithium + cuprates + 18-electron + OA/RE; Suzuki + Heck + Negishi + Stille + Buchwald-Hartwig + Sonogashira Nobel 2010; metathesis Grubbs + Schrock + Chauvin Nobel 2005 + ROMP + RCM." },
      { slug: "medicinal-chemistry-and-modern-frontier", title: "Medicinal + Modern Frontier", level: "expert", order: 8, pages: ["lipinski-medchem", "click-bioconjugation", "ch-activation-photoredox-ai"], prereqs: ["retrosynthesis-and-synthesis-planning", "organometallics-and-cross-coupling"], description: "Lipinski Ro5 + bioisosteres + ADMET + crizotinib + vemurafenib + ibrutinib; click chemistry Sharpless/Meldal/Bertozzi Nobel 2022 + CuAAC + SPAAC + tetrazine; C-H activation + photoredox + electrochemistry + flow + AI for synthesis (IBM RXN, Coley/Jensen MIT, Baran Cernak)." },
    ],
  });

  // P50 — Glaciologist path. Ice physics + sheet dynamics (the viz
  // anchor) + ice cores + sea ice + permafrost + hydrology + remote
  // sensing + sea level. Distinct from P13 climate-scientist (broader
  // earth system) — this is a focused cryosphere path.
  seedMasteryPath({
    slug: "glaciologist",
    title: "Glaciologist",
    description:
      "From glaciology foundations + cryosphere overview + ice Ih + Glen's flow law n=3 through glacier + ice-sheet dynamics + Vialov-Nye shallow ice + MISI Marine Ice Sheet Instability + Thwaites (with interactive flowline viz), ice cores + δ¹⁸O + δD + Dansgaard 1964 + Vostok/EPICA/WAIS + Younger Dryas + 800 ky CO₂ record, sea ice + brine rejection + Arctic vs Antarctic + albedo feedback + PIOMAS, permafrost + active layer + thermokarst + carbon feedback + methane + Siberian craters, glacier hydrology + supraglacial/englacial/subglacial Röthlisberger + GLOFs + jökulhlaups, remote sensing + ICESat-2 + CryoSat-2 + GRACE-FO + InSAR + ITS_LIVE, and sea level + IPCC AR6 + ISMIP6 + MICI DeConto-Pollard + ITGC + adaptation NL Delta/Miami. The cryosphere stack end-to-end.",
    nodes: [
      { slug: "glaciology-foundations-and-ice-physics", title: "Foundations + Ice Physics", level: "apprentice", order: 1, pages: ["cryosphere-overview", "ice-ih-properties", "glen-flow-law"], prereqs: [], description: "Cryosphere — glaciers + ice sheets + sea ice + permafrost + snow; ice Ih hexagonal + phase diagram + density + impurities; Glen's flow law n=3 + Nye 1953 + creep mechanisms." },
      { slug: "glacier-and-ice-sheet-dynamics", title: "Glacier + Ice Sheet Dynamics", level: "practitioner", order: 2, pages: ["mass-balance-ela", "sia-ssa-misi", "ice-streams-thwaites"], prereqs: ["glaciology-foundations-and-ice-physics"], description: "Accumulation + ablation + ELA; Shallow-Ice + Shelfy-Stream + Marine Ice Sheet Instability MISI (interactive viz); basal sliding + subglacial hydrology + Pine Island + Thwaites 'Doomsday'." },
      { slug: "ice-cores-and-paleoclimate", title: "Ice Cores + Paleoclimate", level: "practitioner", order: 3, pages: ["ice-core-archives", "isotope-proxies-milankovitch", "co2-ch4-dust"], prereqs: ["glaciology-foundations-and-ice-physics"], description: "Greenland + Antarctica + Vostok + EPICA + WAIS Divide cores; δ¹⁸O + δD Dansgaard 1964 + Milankovitch + glacial-interglacial; trapped CO₂/CH₄ + 800 ky + Younger Dryas + 8.2 ka + dust." },
      { slug: "sea-ice-and-polar-oceans", title: "Sea Ice + Polar Oceans", level: "specialist", order: 4, pages: ["formation-brine-rejection", "arctic-vs-antarctic", "albedo-feedback-passage"], prereqs: ["glaciology-foundations-and-ice-physics"], description: "Sea-ice formation + brine rejection + thermohaline; Arctic vs Antarctic asymmetry + multi-year + PIOMAS volume; albedo feedback + polar amplification + Northwest Passage + biological productivity." },
      { slug: "permafrost-and-frozen-ground", title: "Permafrost + Frozen Ground", level: "specialist", order: 5, pages: ["permafrost-distribution", "carbon-cycle-feedback", "infrastructure-impacts"], prereqs: ["glaciology-foundations-and-ice-physics"], description: "Distribution + active layer + thermokarst + yedoma; carbon feedback + methane + abrupt thaw + Siberian craters; infrastructure + Arctic communities + Tibetan + alpine permafrost." },
      { slug: "glacier-hydrology-and-floods", title: "Glacier Hydrology + Floods", level: "expert", order: 6, pages: ["supra-en-subglacial-drainage", "glofs-jokulhlaups", "meltwater-sea-level"], prereqs: ["glacier-and-ice-sheet-dynamics"], description: "Supraglacial + englacial + subglacial + Röthlisberger channels; GLOFs + jökulhlaups + Iceland + Himalaya; meltwater → sea level + hydropower + Andes + HKH agriculture." },
      { slug: "remote-sensing-and-observations", title: "Remote Sensing + Observations", level: "expert", order: 7, pages: ["altimetry-icesat-cryosat", "grace-mass-balance", "insar-its-live"], prereqs: ["glacier-and-ice-sheet-dynamics"], description: "ICESat-2 + CryoSat-2 + ENVISAT altimetry; GRACE + GRACE-FO gravimetry → mass loss; InSAR velocity + ITS_LIVE + Operation IceBridge + airborne geophysics." },
      { slug: "sea-level-and-frontier", title: "Sea Level + Frontier", level: "expert", order: 8, pages: ["sea-level-budget", "ipcc-projections-mici", "ismip-itgc-adaptation"], prereqs: ["glacier-and-ice-sheet-dynamics", "ice-cores-and-paleoclimate"], description: "Thermal expansion + Greenland + Antarctica + glaciers; AR6 + tipping + MICI DeConto-Pollard; ISMIP6 ensembles + ITGC International Thwaites + adaptation NL Delta + Miami." },
    ],
  });

  // P49 — Fluid Dynamicist path. From continuum + Navier-Stokes through
  // inviscid/potential + boundary layer + turbulence + Kármán street
  // (the viz anchor) + compressible + multiphase + CFD/PINN frontier.
  // Distinct from P19 aerospace-engineer (this is fluid-mechanics-
  // centric).
  seedMasteryPath({
    slug: "fluid-dynamicist",
    title: "Fluid Dynamicist",
    description:
      "From continuum hypothesis + Knudsen + properties through Navier-Stokes derivation + Reynolds/Mach/Froude/Weber dimensionless numbers + similitude, inviscid + Bernoulli + potential flow + Joukowski + Kutta-Joukowski lift via circulation, viscous + Stokes Re→0 + Prandtl boundary layer 1904 + Blasius + Kármán + separation + drag crisis, turbulence + Reynolds decomposition + Kolmogorov K41 1941 + -5/3 energy cascade + DNS/LES/RANS + ML closures (with interactive Kármán-street viz), compressible + shocks + Rankine-Hugoniot + Prandtl-Meyer + supersonic/hypersonic + scramjets, multiphase + bubbles + Marangoni + capillary + rheology + Newtonian vs power-law/Bingham + viscoelastic + blood/polymers, and CFD frontier + finite-volume + lattice Boltzmann + spectral + neural surrogates + PINN/FNO + AI-Fluids NVIDIA Modulus + bio-inspired. The fluid stack end-to-end.",
    nodes: [
      { slug: "fluid-foundations-and-kinematics", title: "Foundations + Kinematics", level: "apprentice", order: 1, pages: ["continuum-knudsen", "eulerian-lagrangian", "conservation-laws"], prereqs: [], description: "Continuum hypothesis + Knudsen + ρ, μ, ν, σ properties; Eulerian vs Lagrangian + material derivative D/Dt; mass continuity + momentum + energy conservation." },
      { slug: "navier-stokes-and-dimensionless-numbers", title: "Navier-Stokes + Dimensionless", level: "practitioner", order: 2, pages: ["ns-derivation", "reynolds-mach-froude", "non-dim-similitude"], prereqs: ["fluid-foundations-and-kinematics"], description: "NS derivation + viscous + pressure; Reynolds + Mach + Froude + Weber + Péclet + Prandtl + Schmidt; non-dim + scaling + similitude + dynamic similarity." },
      { slug: "inviscid-and-potential-flow", title: "Inviscid + Potential Flow", level: "practitioner", order: 3, pages: ["euler-bernoulli-vorticity", "potential-flow-conformal", "joukowski-lift"], prereqs: ["navier-stokes-and-dimensionless-numbers"], description: "Euler + Bernoulli + streamlines + vorticity ω; potential flow + Laplace + complex analysis + conformal mapping; d'Alembert paradox + Joukowski + lift via circulation Kutta-Joukowski." },
      { slug: "viscous-and-boundary-layer", title: "Viscous + Boundary Layer", level: "specialist", order: 4, pages: ["stokes-creeping", "prandtl-blasius", "separation-drag-crisis"], prereqs: ["navier-stokes-and-dimensionless-numbers"], description: "Stokes Re=0 creeping flow; Prandtl boundary layer 1904 + Blasius + von Kármán momentum integral; separation + drag crisis + golf-ball dimples." },
      { slug: "turbulence-and-statistics", title: "Turbulence + Statistics", level: "specialist", order: 5, pages: ["reynolds-transition", "kolmogorov-cascade", "dns-les-rans"], prereqs: ["navier-stokes-and-dimensionless-numbers", "viscous-and-boundary-layer"], description: "Reynolds 1883 transition + Reynolds decomposition + RANS; Kolmogorov K41 1941 + energy cascade + -5/3 + intermittency; DNS/LES/RANS + k-ε + k-ω + closure + ML closures + interactive Kármán-street viz." },
      { slug: "compressible-flow-and-shocks", title: "Compressible Flow + Shocks", level: "expert", order: 6, pages: ["sound-speed-acoustics", "shocks-rankine-hugoniot", "supersonic-hypersonic"], prereqs: ["inviscid-and-potential-flow"], description: "Sound speed + Mach + acoustic equations; normal + oblique shocks + Rankine-Hugoniot + Prandtl-Meyer expansion; supersonic + hypersonic + sonic boom + scramjets + Concorde." },
      { slug: "multiphase-rheology-and-non-newtonian", title: "Multiphase + Rheology", level: "expert", order: 7, pages: ["bubbles-droplets-marangoni", "rheology-non-newtonian", "biological-industrial"], prereqs: ["viscous-and-boundary-layer"], description: "Bubbles + droplets + Stokes + Marangoni + capillary; Newtonian vs power-law vs Bingham + viscoelasticity + Weissenberg; blood + polymers + drilling fluids + ink-jet." },
      { slug: "cfd-modern-and-frontier", title: "CFD + Modern Frontier", level: "expert", order: 8, pages: ["fv-spectral-lattice-boltzmann", "meshes-convergence", "neural-surrogates-pinn"], prereqs: ["turbulence-and-statistics"], description: "FV + spectral + lattice Boltzmann + immersed boundary; meshes + adaptive refinement + grid convergence + V&V; GPU CFD + neural surrogates (PINN, FNO 2020, AlphaFlow) + NVIDIA Modulus + bio-inspired (jellyfish, fish schools)." },
    ],
  });

  // P48 — Solid-State Physicist path. From crystal lattices + reciprocal
  // space through free-electron + band theory (the viz anchor) + lattice
  // dynamics + semiconductors + magnetism + superconductivity +
  // topological phases + correlated electrons + twisted bilayer
  // graphene frontier. Distinct from P20 materials-scientist
  // (engineering applications) — this is condensed-matter physics.
  seedMasteryPath({
    slug: "solid-state-physicist",
    title: "Solid-State Physicist",
    description:
      "From crystal lattices + Bravais + reciprocal space + Bragg through free-electron Sommerfeld + band theory + Bloch (with interactive E(k) viz) + ARPES, lattice dynamics + acoustic/optical phonons + Debye/Einstein heat capacity + Boltzmann transport + Umklapp, semiconductors + carrier statistics + p-n + MOSFET + LEDs/photovoltaics + GaN/SiC, magnetism + Heisenberg/Ising + spin waves + GMR Fert-Grünberg Nobel 2007 + spintronics, superconductivity + Onnes 1911 + Meissner + BCS + Cooper pairs + Bardeen-Cooper-Schrieffer Nobel 1972 + high-Tc cuprates + iron-based + hydrides, topological phases + integer/fractional QHE Klitzing 1985 + Tsui-Stormer-Laughlin Nobel 1998 + topological insulators + Weyl + Haldane-Kosterlitz-Thouless Nobel 2016, and correlated-electron frontier + Hubbard + Mott + DMFT + heavy fermions + quantum criticality + twisted bilayer graphene magic angle + AI-for-materials GNoME 2023. The condensed-matter stack end-to-end.",
    nodes: [
      { slug: "crystal-lattices-and-reciprocal-space", title: "Crystal Lattices + Reciprocal Space", level: "apprentice", order: 1, pages: ["14-bravais-lattices", "reciprocal-brillouin", "xrd-laue-bragg"], prereqs: [], description: "7 crystal systems + 14 Bravais + symmetry groups; reciprocal lattice + Brillouin zones; X-ray diffraction Laue + Bragg + structure factors." },
      { slug: "free-electron-and-band-theory", title: "Free Electron + Band Theory", level: "practitioner", order: 2, pages: ["drude-sommerfeld", "nfe-tight-binding-bloch", "bands-metals-semiconductors"], prereqs: ["crystal-lattices-and-reciprocal-space"], description: "Drude + Sommerfeld + Fermi sea + DOS; nearly-free-electron + tight-binding + Bloch's theorem + band gaps (interactive viz); metals vs semiconductors vs insulators + ARPES." },
      { slug: "lattice-dynamics-and-phonons", title: "Lattice Dynamics + Phonons", level: "practitioner", order: 3, pages: ["harmonic-crystal", "debye-einstein", "phonon-thermal"], prereqs: ["crystal-lattices-and-reciprocal-space"], description: "Harmonic crystal + 1D chain dispersion + acoustic/optical branches; Debye + Einstein heat capacity; Boltzmann transport + Umklapp + phonon engineering." },
      { slug: "semiconductors-and-devices", title: "Semiconductors + Devices", level: "specialist", order: 4, pages: ["doping-fermi-level", "pn-bjt-mosfet", "leds-pv-iii-v"], prereqs: ["free-electron-and-band-theory"], description: "Doping + carrier statistics + Fermi level; p-n junction + diodes + BJT/MOSFET; LEDs/lasers/photovoltaics + III-V + wide-bandgap GaN/SiC + 2D materials." },
      { slug: "magnetism-in-solids", title: "Magnetism in Solids", level: "specialist", order: 5, pages: ["dia-para-pauli", "heisenberg-ising-spin-waves", "modern-spintronics-magnonic"], prereqs: ["free-electron-and-band-theory"], description: "Diamagnetism + paramagnetism + Pauli + Curie; Heisenberg + Ising + ferro/antiferro + spin waves; GMR Fert-Grünberg Nobel 2007 + spintronics + magnonic + topological magnets." },
      { slug: "superconductivity", title: "Superconductivity", level: "expert", order: 6, pages: ["onnes-meissner-london", "bcs-cooper-pairs", "high-tc-frontier"], prereqs: ["lattice-dynamics-and-phonons"], description: "Onnes 1911 + Meissner + London + type I/II + flux quantization; BCS + Cooper pairs + gap + isotope effect + Bardeen-Cooper-Schrieffer Nobel 1972; high-Tc cuprates + iron-based + hydrides + LK99 saga + room-T quest." },
      { slug: "topological-phases-and-quantum-hall", title: "Topological Phases + QHE", level: "expert", order: 7, pages: ["integer-fractional-qhe", "topological-insulators", "weyl-majorana"], prereqs: ["free-electron-and-band-theory", "magnetism-in-solids"], description: "Klitzing IQHE Nobel 1985 + Tsui-Stormer-Laughlin FQHE Nobel 1998; topological insulators Bi₂Se₃ + Z₂ invariant + Kane-Mele; Weyl/Dirac semimetals + Majorana + topological QC + Haldane-Kosterlitz-Thouless Nobel 2016." },
      { slug: "correlated-electrons-and-frontier", title: "Correlated Electrons + Frontier", level: "expert", order: 8, pages: ["hubbard-mott-dmft", "heavy-fermions-spin-liquid", "magic-angle-graphene-ai"], prereqs: ["superconductivity", "topological-phases-and-quantum-hall"], description: "Hubbard + Mott insulators + DMFT; heavy fermions + quantum criticality + spin liquids + Anderson 1973; twisted bilayer graphene magic angle + flat bands + AI-for-materials (GNoME 2023, Materials Project) + quantum simulators." },
    ],
  });

  // P47 — Plasma Physicist path. Plasma fundamentals + Debye/Langmuir
  // through fluid + kinetic descriptions + waves + magnetohydrodynamics
  // + magnetic confinement (tokamak/stellarator) + Lawson + ICF (the
  // viz anchor) + plasma diagnostics + astrophysical plasmas + space
  // weather + low-T applications. The plasma stack end-to-end.
  // Distinct from nuclear-engineer (P31, fission reactors), atmospheric-
  // scientist (P33, neutral atmospheres), photonics-engineer (P36,
  // optics/lasers).
  seedMasteryPath({
    slug: "plasma-physicist",
    title: "Plasma Physicist",
    description:
      "From plasma foundations + Debye/Langmuir + quasi-neutrality through single-particle motion (gyromotion + drifts + mirrors), fluid + kinetic descriptions (Vlasov + Boltzmann + two-fluid + MHD), plasma waves (Langmuir, Alfvén, whistlers, Landau damping), magnetic confinement fusion + tokamak/stellarator + Lawson criterion (with interactive ignition viz) + JET/ITER/SPARC, inertial confinement + NIF ignition Dec 2022, plasma diagnostics (Langmuir probes, Thomson scattering, interferometry, neutron yield), astrophysical + space plasmas (solar wind + magnetospheres + accretion + reconnection), and low-temperature + industrial plasmas (etching, thrusters, medical, fusion-startup). The plasma stack end-to-end.",
    nodes: [
      { slug: "plasma-foundations-and-debye", title: "Foundations + Debye", level: "apprentice", order: 1, pages: ["fourth-state-langmuir", "debye-screening", "plasma-parameter-criteria"], prereqs: [], description: "Plasma as 4th state of matter + Langmuir 1928 + ionization + applications; Debye length + screening + quasi-neutrality; plasma parameter Λ + 3 criteria (λ_D ≪ L, N_D ≫ 1, ωτ ≫ 1) + Saha equation." },
      { slug: "single-particle-motion", title: "Single-Particle Motion", level: "practitioner", order: 2, pages: ["gyromotion-larmor", "drifts-grad-b-curvature", "adiabatic-invariants-mirrors"], prereqs: ["plasma-foundations-and-debye"], description: "Larmor gyration + cyclotron frequency + Lorentz force; E×B + grad-B + curvature + polarization drifts; adiabatic invariants (μ, J, Φ) + magnetic mirrors + loss cones + Van Allen belts." },
      { slug: "fluid-and-kinetic-descriptions", title: "Fluid + Kinetic Descriptions", level: "practitioner", order: 3, pages: ["vlasov-boltzmann", "two-fluid-and-mhd", "transport-coefficients"], prereqs: ["single-particle-motion"], description: "Vlasov + Boltzmann + BBGKY hierarchy + collision operators; two-fluid + ideal MHD + frozen-in flux + Alfvén theorem; collisional transport + Braginskii + Spitzer resistivity + thermal conductivity." },
      { slug: "plasma-waves-and-instabilities", title: "Waves + Instabilities", level: "specialist", order: 4, pages: ["electrostatic-langmuir-ion", "em-alfven-whistler", "landau-damping-instabilities"], prereqs: ["fluid-and-kinetic-descriptions"], description: "Langmuir + ion-acoustic + Bernstein modes + dispersion; EM waves (Alfvén, magnetosonic, whistler, R/L/O/X) + cutoffs + resonances; Landau damping (Vlasov 1946 / Landau 1946) + two-stream + Weibel + interchange + drift-wave instabilities." },
      { slug: "magnetic-confinement-and-lawson", title: "Magnetic Confinement + Lawson", level: "specialist", order: 5, pages: ["confinement-concepts", "tokamak-stellarator-pinches", "lawson-and-machines"], prereqs: ["plasma-waves-and-instabilities"], description: "Confinement requirements + β + safety factor q + Greenwald density limit; tokamak (Soviet 1960s, JET, JT-60U, KSTAR) + stellarator (W7-X) + Z-pinch + RFP + compact alternatives; Lawson criterion + triple product + interactive viz + JET 1997/2022 + ITER + SPARC + Wendelstein." },
      { slug: "inertial-confinement-and-nif", title: "Inertial Confinement + NIF", level: "expert", order: 6, pages: ["icf-implosion-physics", "hohlraum-and-direct-drive", "nif-ignition-2022"], prereqs: ["magnetic-confinement-and-lawson"], description: "Implosion physics + Rayleigh-Taylor + hot-spot ignition + Atzeni-Meyer-ter-Vehn; indirect-drive hohlraum + LMJ + direct-drive OMEGA + fast/shock ignition; NIF Dec 2022 fusion ignition (Q_target=1.5) + 192 beams + Hurricane 2014 alpha-heating + path to IFE." },
      { slug: "diagnostics-and-experimental", title: "Diagnostics + Experimental Methods", level: "expert", order: 7, pages: ["langmuir-and-spectroscopy", "thomson-and-interferometry", "neutron-fast-ion"], prereqs: ["plasma-waves-and-instabilities"], description: "Langmuir probes + emissive + Mach + spectroscopy (Doppler, Stark, Zeeman) for T_e + n_e + impurities; Thomson scattering + interferometry + reflectometry + polarimetry; neutron + gamma diagnostics + NPA + collective Thomson + ITER diagnostic suite." },
      { slug: "astrophysical-and-low-temperature-plasmas", title: "Astrophysical + Low-T + Frontier", level: "expert", order: 8, pages: ["solar-magnetospheric-reconnection", "accretion-jets-cosmic", "low-t-industrial-medical"], prereqs: ["fluid-and-kinetic-descriptions"], description: "Solar wind + corona heating + magnetospheres + reconnection (Sweet-Parker + Petschek + Hall + MMS mission); accretion disks + MRI Balbus-Hawley + jets + gamma-ray bursts + relativistic + cosmic-ray acceleration; etching + Hall thrusters + medical plasmas + private fusion (CFS, TAE, Helion, Zap) + plasma AI." },
    ],
  });

  // P46 — Computational Neuroscientist path. Membrane biophysics
  // through Hodgkin-Huxley (the viz anchor) + synapses + plasticity
  // + neural coding + circuits + dendritic computation + NeuroAI +
  // neurotechnology. The deep, biophysical+computational+frontier
  // companion to the broader P14 "neuroscientist" path (which is
  // brain-systems + cognition + consciousness-centric). Distinct
  // from cognitive-scientist (P40, decision-making + behavior) and
  // biomedical-engineer (P34, devices).
  seedMasteryPath({
    slug: "computational-neuroscientist",
    title: "Computational Neuroscientist",
    description:
      "From neural foundations + membrane biophysics + Nernst/Goldman through Hodgkin-Huxley action potentials (with interactive 4-variable ODE viz), synapses + neurotransmission + quantal release + EPSP/IPSP, synaptic plasticity + LTP/LTD/STDP + Hebbian/anti-Hebbian, neural coding + rate/temporal/population codes + Bayesian brain + predictive coding, circuits + canonical microcircuits + V1/hippocampus/cerebellum/basal ganglia, computational neuroscience + dendritic computation + biological vs artificial networks + NeuroAI, and neurotechnology + Neuralink + optogenetics + connectomics + organoids. The cellular-to-frontier neuroscience stack end-to-end.",
    nodes: [
      { slug: "neural-foundations-and-membrane-biophysics", title: "Foundations + Membrane Biophysics", level: "apprentice", order: 1, pages: ["nervous-system-overview", "membrane-potentials", "nernst-goldman"], prereqs: [], description: "Nervous system organization (CNS/PNS, neurons + glia, synapse types); resting membrane potential + Na/K ATPase + ion gradients; Nernst equation + Goldman-Hodgkin-Katz + driving force." },
      { slug: "action-potentials-and-hodgkin-huxley", title: "Action Potentials + Hodgkin-Huxley", level: "practitioner", order: 2, pages: ["voltage-clamp-history", "hh-equations", "channel-pharmacology"], prereqs: ["neural-foundations-and-membrane-biophysics"], description: "Voltage clamp + squid giant axon + Hodgkin/Huxley 1952/Nobel 1963; HH 4-variable ODE m³h n⁴ + interactive viz; channel pharmacology TTX/TEA/4-AP + Nav/Kv diversity + channelopathies." },
      { slug: "synapses-and-neurotransmission", title: "Synapses + Neurotransmission", level: "practitioner", order: 3, pages: ["chemical-vs-electrical", "quantal-release", "receptors-and-pscs"], prereqs: ["action-potentials-and-hodgkin-huxley"], description: "Chemical vs electrical synapses + gap junctions; quantal release Katz Nobel 1970 + SNARE/Synaptotagmin Südhof Nobel 2013; ionotropic + metabotropic receptors + EPSP/IPSP + AMPA/NMDA/GABA-A." },
      { slug: "plasticity-and-learning", title: "Plasticity + Learning", level: "specialist", order: 4, pages: ["ltp-ltd-mechanisms", "stdp-hebbian", "systems-consolidation"], prereqs: ["synapses-and-neurotransmission"], description: "LTP/LTD molecular mechanisms + NMDA Ca²⁺ + AMPA trafficking + CaMKII; STDP + Hebbian + anti-Hebbian + Bi-Poo 1998; systems consolidation + sleep + hippocampal replay + Tonegawa engrams." },
      { slug: "neural-coding-and-representations", title: "Neural Coding + Representations", level: "specialist", order: 5, pages: ["rate-vs-temporal", "population-and-sparse", "bayesian-predictive"], prereqs: ["action-potentials-and-hodgkin-huxley"], description: "Rate codes + Fano factor + tuning curves; population codes + sparse coding Olshausen/Field 1996 + place cells O'Keefe Nobel 2014 + grid cells Moser; Bayesian brain + Helmholtz + predictive coding Rao-Ballard 1999 + free-energy Friston." },
      { slug: "circuits-and-systems", title: "Circuits + Systems", level: "expert", order: 6, pages: ["canonical-microcircuits", "vision-v1-hippocampus", "cerebellum-basal-ganglia"], prereqs: ["plasticity-and-learning", "neural-coding-and-representations"], description: "Canonical cortical microcircuits + Douglas-Martin + Markram blueprint; V1 Hubel-Wiesel Nobel 1981 + hippocampal CA1-CA3-DG circuit + Sharp Marr 1971 theories; cerebellum + Marr-Albus-Ito + basal-ganglia direct/indirect + dopamine RPE Schultz Wolfram 1997." },
      { slug: "computational-and-neuroai", title: "Computational Neuroscience + NeuroAI", level: "expert", order: 7, pages: ["dendritic-computation", "bio-vs-ann", "neuroai-frontier"], prereqs: ["circuits-and-systems"], description: "Dendritic computation + NMDA-spikes + Ca²⁺ plateaus + Larkum + active cables; biological vs ANN networks + Yamins/DiCarlo CNN-V4-IT alignment + ResNet maps; NeuroAI + Hassabis 'roadmap' + foundation models for neural data + brain-to-text decoding + Olshausen+Field reborn." },
      { slug: "neurotechnology-and-bmi", title: "Neurotechnology + BMI", level: "expert", order: 8, pages: ["recording-stimulation", "bmi-and-prosthetics", "frontier-organoids-connectomes"], prereqs: ["circuits-and-systems"], description: "Recording (EEG, MEG, iEEG/ECoG, Utah array, Neuropixels, fMRI BOLD) + stimulation (TMS, tDCS, DBS, optogenetics Boyden/Deisseroth, chemogenetics); BMI Schwartz/Donoghue + Neuralink + BrainGate speech-decoding + sensory prosthetics; frontier — connectomics (fly EM, mouse MICrONS), organoids + assembloids, cyborg challenges + ethics." },
    ],
  });

  // P45 — Structural Biologist path. Protein-structure determination
  // (X-ray, NMR, cryo-EM) through folding + Ramachandran (the viz
  // anchor) + secondary/tertiary/quaternary structure + membrane
  // proteins + AlphaFold/RoseTTAFold + protein design (RFdiffusion +
  // ProteinMPNN) + structure-based drug design + dynamics/ensembles.
  // The structural-biology stack end-to-end. Distinct from
  // bioinformatician (sequence-centric) — this path is structure-
  // centric. Also distinct from biomedical-engineer (devices) and
  // cell-molecular-biologist (wet-lab cell biology).
  seedMasteryPath({
    slug: "structural-biologist",
    title: "Structural Biologist",
    description:
      "From structural-biology foundations + experimental methods (X-ray, NMR, cryo-EM) through protein folding + Anfinsen + Levinthal + chaperones + Ramachandran (with interactive φ/ψ viz), primary→quaternary structure + domains + motifs + intrinsically disordered proteins, membrane proteins + GPCRs + ion channels + bilayer biophysics, AlphaFold 2/3 + RoseTTAFold + ESMFold + accuracy metrics + Nobel 2024, RFdiffusion + ProteinMPNN + de novo enzyme design, structure-based drug design + fragment screening + allostery + cryo-EM-driven therapeutics, and conformational dynamics + MD + AlphaFold-Multistate + cryo-ET + RNA structure. The structural-biology stack end-to-end.",
    nodes: [
      { slug: "structural-biology-foundations", title: "Foundations + Methods", level: "apprentice", order: 1, pages: ["field-overview", "x-ray-crystallography", "nmr-and-cryoem"], prereqs: [], description: "What structural biology is vs adjacent fields; X-ray crystallography (Bragg + Patterson + MR + phase problem); NMR + cryo-EM (single-particle + resolution revolution + Henderson/Frank/Dubochet Nobel)." },
      { slug: "protein-folding-and-ramachandran", title: "Folding + Ramachandran", level: "practitioner", order: 2, pages: ["anfinsen-levinthal", "ramachandran-torsions", "folding-funnels-chaperones"], prereqs: ["structural-biology-foundations"], description: "Anfinsen's dogma + Levinthal paradox + thermodynamic hypothesis; Ramachandran φ/ψ torsions + steric maps + secondary-structure regions (interactive viz); folding funnels + molten globule + chaperones (GroEL/Hsp70) + misfolding diseases (prions, amyloids)." },
      { slug: "secondary-tertiary-quaternary-structure", title: "Structure Hierarchy + Domains", level: "practitioner", order: 3, pages: ["primary-to-quaternary", "domains-and-motifs", "idps-and-condensates"], prereqs: ["protein-folding-and-ramachandran"], description: "Levels of structure (1°/2°/3°/4°) + α-helix + β-sheet hydrogen-bond patterns + supersecondary motifs; protein domains + Pfam/SCOP/CATH classification + evolutionary modularity; intrinsically disordered proteins + LLPS + biomolecular condensates + p53 + FUS." },
      { slug: "membrane-proteins-and-channels", title: "Membrane Proteins + Channels", level: "specialist", order: 4, pages: ["bilayer-biophysics", "gpcrs-and-receptors", "channels-and-transporters"], prereqs: ["secondary-tertiary-quaternary-structure"], description: "Lipid bilayer biophysics + hydrophobic matching + α-helical vs β-barrel topologies; GPCRs (rhodopsin + β2AR + Kobilka/Lefkowitz Nobel) + biased agonism + cryo-EM revolution; ion channels (K+, Na+, Ca2+, ClC) + MacKinnon selectivity filter + voltage sensing + transporters." },
      { slug: "alphafold-and-computational-structure", title: "AlphaFold + Computational Structure", level: "specialist", order: 5, pages: ["history-to-alphafold", "alphafold2-architecture", "alphafold3-roseTTAfold-esm"], prereqs: ["secondary-tertiary-quaternary-structure"], description: "Pre-AlphaFold landscape: CASP + homology modeling + threading + Rosetta + ab initio; AlphaFold 2 architecture (Evoformer + structure module + recycling + pLDDT) + Nobel 2024; AlphaFold 3 (diffusion + ligands/nucleic acids) + RoseTTAFold + ESMFold + OmegaFold + accuracy metrics." },
      { slug: "protein-design-and-de-novo", title: "Protein Design + De Novo", level: "expert", order: 6, pages: ["rosetta-baker-de-novo", "rfdiffusion-and-protein-mpnn", "applications-binders-enzymes"], prereqs: ["alphafold-and-computational-structure"], description: "Rosetta + Baker-lab de novo design history + Top7 + IL-2 mimics; RFdiffusion (denoising diffusion for backbones) + ProteinMPNN (inverse folding) + ESM-IF; applications: de novo enzymes + binders + flu/SARS vaccines + Baker Nobel 2024." },
      { slug: "structure-based-drug-design", title: "Structure-Based Drug Design", level: "expert", order: 7, pages: ["sbdd-pipeline", "fragment-and-virtual-screening", "allostery-and-modern-cases"], prereqs: ["membrane-proteins-and-channels", "alphafold-and-computational-structure"], description: "SBDD pipeline: target → structure → hit → lead → drug; fragment-based + virtual screening + free-energy perturbation + docking benchmarks; allosteric drugs + KRAS G12C (sotorasib) + paxlovid + cryo-EM-driven design + GPCR-targeted drugs + DEL libraries." },
      { slug: "dynamics-ensembles-and-rna", title: "Dynamics + Ensembles + RNA", level: "expert", order: 8, pages: ["md-and-enhanced-sampling", "ensembles-and-multistate", "rna-and-cryo-et"], prereqs: ["alphafold-and-computational-structure"], description: "Molecular dynamics (AMBER, CHARMM, GROMACS, OpenMM) + force fields + enhanced sampling (REMD, metadynamics) + ML potentials (MACE, NequIP); conformational ensembles + AlphaFold-Multistate + ESMFlow + HDX-MS; RNA structure + RNAfold + AlphaFold-RNA + cryo-ET + in-cell structural biology." },
    ],
  });

  // P44 — Bioinformatician path. Genome anatomy + sequencing through
  // sequence alignment (with new AlignmentMatrix DP viz) + assembly
  // + variant calling + transcriptomics + single-cell + structure
  // (AlphaFold) + phylogenetics + ML in biology + reproducibility +
  // cloud. The bioinformatics stack end-to-end. Distinct from
  // cell-molecular-biologist (wet-lab biology) and ai-researcher
  // (general ML).
  seedMasteryPath({
    slug: "bioinformatician",
    title: "Bioinformatician",
    description:
      "From bioinformatics foundations + genome anatomy + sequencing tech through dynamic-programming sequence alignment + BLAST (with interactive Needleman-Wunsch / Smith-Waterman viz), assembly + variant calling + T2T + pangenomes, transcriptomics + single-cell + spatial + Human Cell Atlas, structure + AlphaFold + protein design + cryo-EM, phylogenetics + phylogenomics + population genetics, machine learning + foundation models (ESM + AlphaFold + AlphaMissense + scGPT), and reproducibility + cloud + Nextflow/Snakemake + FAIR data. The bioinformatics stack end-to-end.",
    nodes: [
      { slug: "bioinformatics-foundations-and-genomes", title: "Foundations + Genomes", level: "apprentice", order: 1, pages: ["field-overview", "genome-anatomy", "sequencing-tech"], prereqs: [], description: "Bioinformatics vs comp-bio vs systems; genome anatomy (coding, regulatory, repeats, 3D); short/long/single-cell sequencing + cost trajectory + file formats." },
      { slug: "sequence-alignment-and-blast", title: "Sequence Alignment + BLAST", level: "practitioner", order: 2, pages: ["alignment-foundations", "nw-sw-dp", "blast-heuristic"], prereqs: ["bioinformatics-foundations-and-genomes"], description: "Pairwise/MSA + global/local + scoring (PAM/BLOSUM), Needleman-Wunsch + Smith-Waterman DP + affine gaps + interactive viz, BLAST + e-values + DIAMOND + minimap2." },
      { slug: "genome-assembly-and-variant-calling", title: "Assembly + Variant Calling", level: "practitioner", order: 3, pages: ["olc-vs-debruijn", "variant-calling", "pangenomes-t2t"], prereqs: ["sequence-alignment-and-blast"], description: "OLC + de Bruijn graphs + N50 + BUSCO + long-read T2T, SNVs/indels/SVs/CNVs + GATK + DeepVariant + Strelka + truth sets, T2T-CHM13 + HPRC pangenome + clinical applications." },
      { slug: "transcriptomics-and-single-cell", title: "Transcriptomics + Single-Cell", level: "specialist", order: 4, pages: ["bulk-rnaseq", "scrna-pipeline", "de-interpretation"], prereqs: ["genome-assembly-and-variant-calling"], description: "Bulk RNA-seq pipeline + DESeq2 + normalization, scRNA-seq + Seurat/Scanpy + Human Cell Atlas + integration, differential expression + GSEA + pathway interpretation." },
      { slug: "structure-and-alphafold", title: "Structure + AlphaFold", level: "specialist", order: 5, pages: ["structure-methods", "alphafold-revolution", "protein-design"], prereqs: ["sequence-alignment-and-blast"], description: "X-ray + cryo-EM + NMR + PDB + Anfinsen + CASP, AlphaFold 2/3 + AFDB + Nobel 2024 + RoseTTAFold + ESMFold, RFdiffusion + ProteinMPNN + drug discovery + cryo-EM-driven design." },
      { slug: "phylogenetics-and-evolution", title: "Phylogenetics + Evolution", level: "expert", order: 6, pages: ["tree-methods", "phylogenomics-ils", "popgen-human"], prereqs: ["sequence-alignment-and-blast"], description: "NJ/ML/Bayesian + substitution models + clocks + bootstrap, phylogenomics + ASTRAL + ILS + introgression + ancient DNA, popgen + selection scans + human migration + biobanks." },
      { slug: "machine-learning-in-biology", title: "ML in Biology", level: "expert", order: 7, pages: ["ml-survey", "foundation-models", "clinical-ethics"], prereqs: ["transcriptomics-and-single-cell", "structure-and-alphafold"], description: "Classical + DL milestones + GNN + diffusion, ESM + AlphaFold + scGPT + Enformer + AlphaMissense, clinical + pathogen surveillance + drug discovery + ethics + privacy." },
      { slug: "reproducibility-and-cloud-bioinformatics", title: "Reproducibility + Cloud", level: "expert", order: 8, pages: ["repro-principles", "workflow-managers", "cloud-future"], prereqs: ["genome-assembly-and-variant-calling"], description: "FAIR + Git + containers + archives, Nextflow/nf-core + Snakemake + WDL/CWL + Galaxy, AWS/GCP/Azure + Terra/DNAnexus + AnVIL + federated + foundation-model serving." },
    ],
  });

  // P43 — Archaeologist path. Stratigraphy + radiocarbon (with new
  // RadiocarbonDecay viz) + lithic technology + bioarchaeology +
  // aDNA + agriculture origins + state formation/collapse + remote
  // sensing/GIS + ethics/repatriation/public archaeology. The
  // archaeology stack end-to-end.
  seedMasteryPath({
    slug: "archaeologist",
    title: "Archaeologist",
    description:
      "From archaeological foundations + stratigraphy + Harris matrix through radiocarbon dating + IntCal20 + Bayesian chronological modeling (with interactive ¹⁴C decay viz), lithic technology + chaîne opératoire + Levallois cognition + use-wear, bioarchaeology + stable isotopes + ancient DNA + Pääbo's Nobel + Denisovans, agriculture origins + Neolithic transition + archaeobotany + zooarchaeology, early states + cities + collapse + Maya + Bronze Age, remote sensing + LiDAR + GIS + AI + digital archaeology, and ethics + NAGPRA + community-based + decolonizing archaeology. The archaeology stack end-to-end.",
    nodes: [
      { slug: "archaeology-foundations-and-stratigraphy", title: "Foundations + Stratigraphy", level: "apprentice", order: 1, pages: ["disciplines-periods", "harris-matrix", "dating-paradigms"], prereqs: [], description: "Archaeology vs related fields + periodization, stratigraphic principles + Harris matrix + site formation (C/N-transforms), relative vs absolute dating + Bayesian chronology." },
      { slug: "radiocarbon-dating-and-calibration", title: "Radiocarbon + Calibration", level: "practitioner", order: 2, pages: ["c14-decay", "intcal-bayesian", "famous-frontier"], prereqs: ["archaeology-foundations-and-stratigraphy"], description: "Libby's discovery + decay law + AMS + interactive viz, IntCal20 + OxCal Bayesian modeling + Miyake wiggle-matching, famous cases (Ötzi, Shroud, L'Anse aux Meadows) + AMS frontier." },
      { slug: "lithic-technology-and-typology", title: "Lithic Technology + Typology", level: "practitioner", order: 3, pages: ["industries-knapping", "chaine-operatoire", "ethnography-experimental"], prereqs: ["archaeology-foundations-and-stratigraphy"], description: "Oldowan → Upper Paleolithic industries + raw materials + knapping, chaîne opératoire + Levallois cognition + use-wear + residues, ethnographic analogy + experimental archaeology + cognitive evolution." },
      { slug: "bioarchaeology-and-ancient-dna", title: "Bioarchaeology + Ancient DNA", level: "specialist", order: 4, pages: ["osteology-pathology", "isotopes", "adna-revolution"], prereqs: ["archaeology-foundations-and-stratigraphy"], description: "Osteology + paleopathology + paleodemography, δ¹³C/δ¹⁵N/δ¹⁸O/Sr isotopes for diet + mobility, aDNA revolution + Neanderthals + Denisovans + Pääbo Nobel + Reich Lab ethics." },
      { slug: "agriculture-origins-and-archaeobotany", title: "Agriculture Origins + Archaeobotany", level: "specialist", order: 5, pages: ["neolithic-transition", "archaeobotany-methods", "zooarchaeology-impacts"], prereqs: ["archaeology-foundations-and-stratigraphy"], description: "Vavilov centers + Neolithic Revolution + drivers + domestication syndrome, flotation + phytoliths + macro/microbotanicals + isotopes, zooarchaeology + secondary products + Anthropocene roots." },
      { slug: "states-cities-and-collapse", title: "States, Cities + Collapse", level: "expert", order: 6, pages: ["urban-revolution", "early-cities", "collapse-resilience"], prereqs: ["agriculture-origins-and-archaeobotany"], description: "Childe + pristine states + Uruk/Indus/Shang/Olmec/Andes, Mohenjo-daro + Teotihuacan + Tenochtitlan + Angkor, Late Bronze Age + Maya + Anasazi + Tainter + transformation reframing." },
      { slug: "remote-sensing-and-gis", title: "Remote Sensing + GIS", level: "expert", order: 7, pages: ["aerial-lidar-satellite", "gis-spatial", "digital-ai-heritage"], prereqs: ["archaeology-foundations-and-stratigraphy"], description: "Aerial + CORONA + LiDAR (PACUNAM Maya) + geophysics, GIS + viewshed + least-cost + predictive modeling, digital archaeology + AI + 3D + climate-change rescue." },
      { slug: "ethics-repatriation-and-public-archaeology", title: "Ethics + Repatriation + Public", level: "expert", order: 8, pages: ["stakeholders-repatriation", "ethics-cbpr", "public-future"], prereqs: ["bioarchaeology-and-ancient-dna"], description: "Stakeholders + NAGPRA + Benin Bronzes + antiquities trafficking, codes of ethics + community-based + decolonizing + FAIR/CARE, public archaeology + pseudoarchaeology + Anthropocene-era directions." },
    ],
  });

  // P42 — Marine Biologist path. Ocean life from microbial to whale
  // through phytoplankton + primary production, predator-prey with
  // new Lotka-Volterra viz, coral reefs + bleaching, fisheries +
  // stock assessment, marine mammals + tetrapod return, OA +
  // deoxygenation, and ocean conservation + blue economy. The
  // marine-biology stack end-to-end.
  seedMasteryPath({
    slug: "marine-biologist",
    title: "Marine Biologist",
    description:
      "From ocean zones + biodiversity + methods through phytoplankton + Redfield + biological pump + HABs, predator-prey + Lotka-Volterra (with interactive viz) + Schaefer/MSY + regime shifts, coral reefs + zoox symbiosis + bleaching/DHW + restoration, fisheries + VPA + EBFM + MPAs, marine mammals + diving physiology + acoustic culture + conservation, ocean acidification + deoxygenation + the 'deadly trio,' and ocean conservation + BBNJ + 30x30 + blue economy + nature-based solutions. The marine-biology stack end-to-end.",
    nodes: [
      { slug: "marine-foundations-and-ocean-life", title: "Marine Foundations + Ocean Life", level: "apprentice", order: 1, pages: ["zones-habitats", "diversity-classification", "methods-frontier"], prereqs: [], description: "Ocean zones (epipelagic → hadal) + habitats (reef/vent/ice), microbes → whales diversity + classification + DNA barcoding, methods from trawls + ROVs to eDNA + Argo + omics + AI." },
      { slug: "phytoplankton-and-primary-production", title: "Phytoplankton + Primary Production", level: "practitioner", order: 2, pages: ["phyto-groups", "limits-mixing", "bcp-habs-climate"], prereqs: ["marine-foundations-and-ocean-life"], description: "Cyanos + diatoms + dinos + coccoliths + haptos, light + Redfield + Fe + mixing + critical depth, biological carbon pump + HABs + climate change impacts." },
      { slug: "predator-prey-and-lotka-volterra", title: "Predator-Prey + Lotka-Volterra", level: "practitioner", order: 3, pages: ["population-dynamics", "lv-derivation", "fisheries-regimes"], prereqs: ["marine-foundations-and-ocean-life"], description: "Marine population cycles + Allee + logistic, Lotka-Volterra equations + fixed points + interactive viz + Rosenzweig-MacArthur, Schaefer/MSY + Newfoundland cod + regime shifts." },
      { slug: "coral-reefs-and-bleaching", title: "Coral Reefs + Bleaching", level: "specialist", order: 4, pages: ["reef-symbiosis", "bleaching-stressors", "restoration-future"], prereqs: ["marine-foundations-and-ocean-life"], description: "Reef types + coral-zoox symbiosis + biodiversity, bleaching mechanism + DHW + mass events 1998-2024 + synergistic stressors, restoration + assisted evolution + IPCC projections + refugia." },
      { slug: "fisheries-and-stock-assessment", title: "Fisheries + Stock Assessment", level: "specialist", order: 5, pages: ["global-fisheries", "vpa-models", "ebfm-aquaculture-climate"], prereqs: ["predator-prey-and-lotka-volterra"], description: "Global capture + aquaculture + IUU + bycatch, VPA + SCAA + Stock Synthesis + reference points + MSE, EBFM + MPAs + 30x30 + climate range shifts." },
      { slug: "marine-mammals-and-tetrapod-return", title: "Marine Mammals + Tetrapod Return", level: "expert", order: 6, pages: ["lineages-convergence", "diving-physiology", "acoustics-conservation"], prereqs: ["marine-foundations-and-ocean-life"], description: "Cetaceans + pinnipeds + sirenians + turtles + birds + convergent evolution, diving physiology (O₂ storage + bradycardia + lung collapse), acoustic communication + culture + intelligence + conservation (vaquita + right whale)." },
      { slug: "ocean-acidification-and-deoxygenation", title: "Ocean Acidification + Deoxygenation", level: "expert", order: 7, pages: ["oa-chemistry", "carbonate-revelle", "deox-deadly-trio"], prereqs: ["phytoplankton-and-primary-production"], description: "OA chemistry + saturation states + calcifier impacts, DIC/TA/Revelle factor + Cant + alkalinity enhancement, deoxygenation + OMZs + coastal dead zones + the deadly trio." },
      { slug: "ocean-conservation-and-blue-economy", title: "Ocean Conservation + Blue Economy", level: "expert", order: 8, pages: ["anthropocene-threats", "mpas-governance", "restoration-nbs"], prereqs: ["fisheries-and-stock-assessment", "ocean-acidification-and-deoxygenation"], description: "Stacked threats (climate + fishing + pollution + plastic + noise + mining), MPAs + UNCLOS + BBNJ + RFMOs + indigenous-led, blue carbon + restoration + NbS + CDR + offshore wind + sustainable aquaculture." },
    ],
  });

  // P41 — Operations Researcher path. LP + MIP + queueing (with
  // new MM1Queue viz) + network flow + stochastic/robust +
  // simulation + scheduling/VRP. The applied-optimization stack
  // behind logistics, airlines, healthcare, supply chain, energy.
  seedMasteryPath({
    slug: "operations-researcher",
    title: "Operations Researcher",
    description:
      "From OR foundations + modeling discipline through LP + simplex + duality + sensitivity, integer programming + branch-and-bound + cutting planes, queueing theory + M/M/1 with interactive viz + Little's law + Pollaczek-Khinchine, network flow + Dijkstra + max-flow/min-cut + Hungarian, stochastic + robust + chance-constrained optimization + flaw of averages, discrete-event simulation + Monte Carlo + variance reduction + digital twins, and scheduling + VRP + ALNS + ML-augmented heuristics. The operations-research stack end-to-end.",
    nodes: [
      { slug: "or-foundations-and-modeling", title: "OR Foundations + Modeling", level: "apprentice", order: 1, pages: ["or-vs-ml", "modeling-pipeline", "or-pillars"], prereqs: [], description: "OR vs ML vs IE vs systems engineering, modeling pipeline (vars → obj → constraints → solve), pillars (LP/MIP/queueing/simulation/MDP)." },
      { slug: "linear-programming-and-simplex", title: "Linear Programming + Simplex", level: "practitioner", order: 2, pages: ["lp-geometry", "simplex-ipm", "duality-sensitivity"], prereqs: ["or-foundations-and-modeling"], description: "LP standard form + polytope geometry, simplex + interior-point methods + Klee-Minty pathology, duality + shadow prices + sensitivity analysis." },
      { slug: "integer-programming-and-branch-bound", title: "Integer Programming + Branch & Bound", level: "practitioner", order: 3, pages: ["mip-basics", "branch-and-cut", "modeling-tricks"], prereqs: ["linear-programming-and-simplex"], description: "MIP classes + 0/1 problems + knapsack/TSP/VRP/facility, branch-and-bound + cutting planes + branch-and-price, big-M + indicators + symmetry breaking + formulation strength." },
      { slug: "queueing-theory-and-mm1", title: "Queueing Theory + M/M/1", level: "specialist", order: 4, pages: ["queueing-foundations", "mm1-derivation", "littles-law-pk"], prereqs: ["or-foundations-and-modeling"], description: "Erlang origins + Kendall notation + applications, M/M/1 steady state + hockey-stick blowup + interactive viz, Little's law + Pollaczek-Khinchine + variance as enemy." },
      { slug: "network-flow-and-shortest-path", title: "Network Flow + Shortest Path", level: "specialist", order: 5, pages: ["network-flow-intro", "dijkstra-bellman", "max-flow-assignment"], prereqs: ["linear-programming-and-simplex"], description: "Network-flow LP structure + totally unimodular, Dijkstra + Bellman-Ford + A* + contraction hierarchies, max-flow/min-cut + Hungarian assignment + NRMP." },
      { slug: "stochastic-and-robust-optimization", title: "Stochastic + Robust Optimization", level: "expert", order: 6, pages: ["uncertainty-paradigms", "robust-cc", "applications-dfl"], prereqs: ["linear-programming-and-simplex"], description: "Stochastic + robust + DRO + chance-constrained, Bertsimas-Sim Γ-budget + CVaR + Wasserstein-DRO, applications + decision-focused learning + RL." },
      { slug: "simulation-and-monte-carlo", title: "Simulation + Monte Carlo", level: "expert", order: 7, pages: ["simulation-paradigms", "des-mechanics", "mc-optimization"], prereqs: ["queueing-theory-and-mm1"], description: "DES + ABM + Monte Carlo + system dynamics, event calendar + variance reduction (CRN/antithetic/importance/strat), MC integration + optimization-via-simulation + digital twins." },
      { slug: "scheduling-and-vehicle-routing", title: "Scheduling + Vehicle Routing", level: "expert", order: 8, pages: ["scheduling-classes", "vrp-family", "metaheuristics-ml"], prereqs: ["integer-programming-and-branch-bound"], description: "Single-machine + flow shop + job shop + Johnson's rule, CVRP + VRPTW + Clarke-Wright + ALNS + Lin-Kernighan, metaheuristics + RL/GNN learning-based methods + UPS ORION-scale industrial impact." },
    ],
  });

  // P40 — Cognitive Scientist path. Perception + attention +
  // decision-making with new DriftDiffusion viz + memory systems
  // + language + learning + cognitive control + neuroscience
  // methods. Distinct from neuro-engineer (which is BCI/implant
  // focused) and nlp-linguist (which is computational NLP).
  seedMasteryPath({
    slug: "cognitive-scientist",
    title: "Cognitive Scientist",
    description:
      "From perception + visual hierarchy + Marr's three levels through attention + working-memory + Baddeley/Cowan, decision-making + drift-diffusion model with interactive viz + speed-accuracy tradeoff + risk + prospect theory, memory systems + episodic/semantic/procedural + reconsolidation + forgetting curves, language + Broca/Wernicke + N400/P600 + LLM comparisons, learning + Rescorla-Wagner + TD + dopamine RPE + intrinsic motivation, cognitive control + PFC + executive function + Stroop + DLPFC/ACC + meta-cognition, and cognitive-neuroscience methods + fMRI/EEG/MEG + intracranial + multivariate decoding + connectomics. The cognitive-science stack end-to-end.",
    nodes: [
      { slug: "perception-and-vision", title: "Perception + Vision", level: "apprentice", order: 1, pages: ["marrs-levels", "visual-hierarchy", "illusions-bayes"], prereqs: [], description: "Marr's computational/algorithmic/implementational levels, V1 → IT ventral stream + dorsal stream, perceptual illusions + Bayesian perception + predictive coding." },
      { slug: "attention-and-working-memory", title: "Attention + Working Memory", level: "practitioner", order: 2, pages: ["attention-types", "wm-models", "limits-bottlenecks"], prereqs: ["perception-and-vision"], description: "Selective + divided + sustained attention + Posner cueing, Baddeley + Cowan WM models, capacity limits + attentional bottlenecks + change blindness." },
      { slug: "decision-making-and-ddm", title: "Decision Making + DDM", level: "practitioner", order: 3, pages: ["drift-diffusion", "speed-accuracy", "risk-prospect"], prereqs: ["attention-and-working-memory"], description: "Drift-diffusion model + interactive viz + evidence accumulation + boundary, speed-accuracy tradeoff + LIP/FEF neural mechanisms, expected utility vs prospect theory + Kahneman + framing." },
      { slug: "memory-systems", title: "Memory Systems", level: "specialist", order: 4, pages: ["episodic-semantic-procedural", "consolidation-reconsolidation", "forgetting-distortion"], prereqs: ["perception-and-vision"], description: "Episodic + semantic + procedural + working memory, hippocampus + cortical consolidation + reconsolidation, Ebbinghaus forgetting + false memory + DRM paradigm." },
      { slug: "language-and-comprehension", title: "Language + Comprehension", level: "specialist", order: 5, pages: ["brain-language-areas", "n400-p600", "llm-comparison"], prereqs: ["attention-and-working-memory"], description: "Broca + Wernicke + arcuate fasciculus + aphasia, N400 semantic + P600 syntactic ERPs, GPT-4-class LLMs vs human language processing + alignment." },
      { slug: "learning-and-plasticity", title: "Learning + Plasticity", level: "expert", order: 6, pages: ["rescorla-wagner-td", "dopamine-rpe", "intrinsic-motivation"], prereqs: ["decision-making-and-ddm"], description: "Rescorla-Wagner classical + TD learning + Sutton-Barto, dopamine reward prediction error + Schultz, intrinsic motivation + curiosity + exploration-exploitation." },
      { slug: "cognitive-control-and-pfc", title: "Cognitive Control + PFC", level: "expert", order: 7, pages: ["executive-function", "stroop-flanker", "metacognition"], prereqs: ["attention-and-working-memory", "decision-making-and-ddm"], description: "Executive function + DLPFC/ACC + Miller-Cohen, Stroop + flanker + go/no-go + conflict monitoring, metacognition + confidence + meta-d' + theory of mind." },
      { slug: "cognitive-neuroscience-methods", title: "Cognitive Neuroscience Methods", level: "expert", order: 8, pages: ["fmri-eeg-meg", "intracranial-tms", "multivariate-connectomics"], prereqs: ["perception-and-vision", "memory-systems"], description: "fMRI BOLD + EEG/MEG + temporal/spatial tradeoffs, intracranial ECoG + single-unit + TMS + causal methods, MVPA + RSA + connectomics + Human Connectome Project." },
    ],
  });

  // P39 — Cell + Molecular Biologist path. Cell structure + DNA
  // replication + transcription/translation + gene regulation with
  // new HillFunction viz + signal transduction + cell cycle +
  // apoptosis + epigenetics. Distinct from comp-biologist (which
  // is bioinformatics-focused).
  seedMasteryPath({
    slug: "cell-molecular-biologist",
    title: "Cell + Molecular Biologist",
    description:
      "From cell structure + organelles + endosymbiosis through DNA replication + repair + telomeres, transcription + translation + alternative splicing, gene regulation with an interactive Hill-function viz + lac operon + GRNs, signal transduction + GPCR/RTK/NHR + MAPK + drug targeting, cell cycle + CDK-cyclin + CDK4/6 inhibitors, apoptosis + venetoclax + immune checkpoints, and epigenetics + histone marks + DNA methylation + epigenetic therapies. The cell + molecular biology stack end-to-end.",
    nodes: [
      { slug: "cell-structure-and-organelles", title: "Cell Structure + Organelles", level: "apprentice", order: 1, pages: ["pro-vs-eukaryote", "membrane-transport", "cytoskeleton"], prereqs: [], description: "Prokaryote vs eukaryote + endosymbiosis, plasma membrane + Na/K ATPase + endocytosis, cytoskeleton + motor proteins + cilia." },
      { slug: "dna-replication-and-repair", title: "DNA Replication + Repair", level: "practitioner", order: 2, pages: ["semi-conservative", "telomeres", "repair-pathways"], prereqs: ["cell-structure-and-organelles"], description: "Replication fork + polymerases + fidelity, telomeres + telomerase + aging + cancer, BER/NER/MMR/HR/NHEJ repair pathways + BRCA + PARP synthetic lethality." },
      { slug: "transcription-and-translation", title: "Transcription + Translation", level: "practitioner", order: 3, pages: ["pol-machinery", "rna-processing", "ribosome-translation"], prereqs: ["dna-replication-and-repair"], description: "Pol II + GTFs + Mediator, 5' cap + splicing + alternative-splicing + 3' polyA, 80S ribosome + genetic code + NMD." },
      { slug: "gene-regulation-and-hill", title: "Gene Regulation + Hill Function", level: "specialist", order: 4, pages: ["lac-operon", "hill-cooperativity", "grn-motifs"], prereqs: ["transcription-and-translation"], description: "lac operon + classical regulation, Hill function + cooperativity + interactive viz, gene regulatory network motifs (FFLs, bistability, feedback)." },
      { slug: "signal-transduction-and-receptors", title: "Signal Transduction + Receptors", level: "specialist", order: 5, pages: ["receptor-classes", "mapk-pi3k", "drug-discovery"], prereqs: ["cell-structure-and-organelles"], description: "GPCR + RTK + NHR + ion channels, MAPK + PI3K + JAK-STAT + Wnt + Notch + Hedgehog cascades, targeted cancer therapies + GLP-1 agonists." },
      { slug: "cell-cycle-and-mitosis", title: "Cell Cycle + Mitosis", level: "specialist", order: 6, pages: ["phases-mitosis", "cdk-cyclin", "p53-cancer"], prereqs: ["dna-replication-and-repair"], description: "G1/S/G2/M + meiosis, CDK-cyclin + checkpoints + p53/RB, CDK4/6 inhibitors + cancer hallmarks + targeted oncology." },
      { slug: "apoptosis-and-cancer", title: "Apoptosis + Cancer", level: "expert", order: 7, pages: ["death-types-caspases", "bcl2-venetoclax", "immunotherapy-checkpoints"], prereqs: ["cell-cycle-and-mitosis", "signal-transduction-and-receptors"], description: "Apoptosis + necroptosis + pyroptosis + ferroptosis + autophagy, intrinsic + extrinsic pathways + venetoclax + BCL-2 inhibition, checkpoint inhibitors (PD-1/CTLA-4) + CAR-T + immunotherapy revolution." },
      { slug: "epigenetics-and-chromatin", title: "Epigenetics + Chromatin", level: "expert", order: 8, pages: ["histone-marks", "dna-methylation", "epigenetic-therapies"], prereqs: ["transcription-and-translation", "cell-cycle-and-mitosis"], description: "Histone modifications + Polycomb/Trithorax + chromatin remodelers, DNA methylation + X-inactivation + epigenetic clocks + iPSCs, DNMT/HDAC/EZH2/IDH inhibitors + aging therapeutics." },
    ],
  });

  // P38 — Macroeconomist path. From national-income accounting +
  // growth theory through IS-LM + money + Phillips curve with new
  // interactive viz + business cycles + fiscal policy + public debt
  // + open-economy macro. Distinct from existing financial-engineer
  // (asset pricing) + quant-trader (markets) paths.
  seedMasteryPath({
    slug: "macroeconomist",
    title: "Macroeconomist",
    description:
      "From national-income accounting + GDP measurement through Solow + Romer growth theory + cross-country development, IS-LM + AD-AS + DSGE, money + central banks + Taylor rule + unconventional monetary policy, the Phillips curve with interactive viz + 1970s/2022 inflation episodes + anchored expectations, business cycles + Great Depression/Recession/COVID + soft landings, fiscal multipliers + Ricardian equivalence + austerity-vs-stimulus + debt sustainability, and open-economy macro + exchange rates + impossible trinity + EM crises + USD dominance. The macroeconomics stack end-to-end.",
    nodes: [
      { slug: "national-income-accounting", title: "National Income Accounting", level: "apprentice", order: 1, pages: ["gdp-measurement", "nominal-real-pcap", "limitations-alternatives"], prereqs: [], description: "GDP via production/expenditure/income approaches, nominal vs real + per-capita + PPP, limitations + Beyond-GDP indicators." },
      { slug: "growth-theory-and-development", title: "Growth Theory + Development", level: "practitioner", order: 2, pages: ["solow-model", "endogenous-growth", "cross-country-tfp"], prereqs: ["national-income-accounting"], description: "Solow capital accumulation + steady state, Romer endogenous growth + ideas, TFP + institutions (Acemoglu-Robinson Nobel 2024) + Korean miracle." },
      { slug: "is-lm-and-aggregate-demand", title: "IS-LM + Aggregate Demand", level: "practitioner", order: 3, pages: ["islm-curves", "ad-as-pdynamics", "modern-dsge"], prereqs: ["national-income-accounting"], description: "IS-LM short-run framework, AD-AS + price dynamics + self-correction, modern DSGE + New Keynesian + HANK." },
      { slug: "money-and-monetary-policy", title: "Money + Monetary Policy", level: "specialist", order: 4, pages: ["m-aggregates", "central-bank-tools", "taylor-rule-modern"], prereqs: ["is-lm-and-aggregate-demand"], description: "M0/M1/M2 + fractional reserve + CBDC, central-bank tools (rates/OMO/QE/yield curve), Taylor rule + FAIT + 2022 normalization." },
      { slug: "phillips-curve-and-monetary-policy", title: "Phillips Curve + Inflation", level: "specialist", order: 5, pages: ["expectations-augmented", "great-moderation-2022", "anchoring-credibility"], prereqs: ["money-and-monetary-policy"], description: "Friedman-Phelps expectations-augmented PC + interactive viz, Great Moderation + 2022 inflation surge + Volcker, anchoring + credibility + soft landings." },
      { slug: "business-cycles-and-recessions", title: "Business Cycles + Recessions", level: "expert", order: 6, pages: ["bc-phases-indicators", "recession-types", "great-depression-recession-covid"], prereqs: ["money-and-monetary-policy"], description: "NBER cycle dating + leading indicators, demand vs supply vs financial recessions, Great Depression + Great Recession + COVID + 2024 soft landing." },
      { slug: "fiscal-policy-and-public-debt", title: "Fiscal Policy + Public Debt", level: "expert", order: 7, pages: ["multipliers", "debt-sustainability", "austerity-stimulus-mmt"], prereqs: ["is-lm-and-aggregate-demand"], description: "Fiscal multipliers + Ricardian + state-dependence, debt dynamics + r-g + sustainability, austerity vs stimulus + MMT + IRA + CHIPS." },
      { slug: "open-economy-and-exchange-rates", title: "Open Economy + Exchange Rates", level: "expert", order: 8, pages: ["fx-regimes", "ppp-irp-crises", "usd-dominance"], prereqs: ["money-and-monetary-policy", "fiscal-policy-and-public-debt"], description: "Floating vs fixed + impossible trinity, PPP + IRP + EM crises (Asian 1997, Tequila, Argentina, Turkey), USD reserve dominance + de-dollarization + CBDCs." },
    ],
  });

  // P37 — Linguist path (general formal linguistics, distinct from
  // existing nlp-linguist which is computational). Phonetics +
  // phonology with new VowelFormantChart viz; morphology; syntax;
  // semantics; pragmatics; sociolinguistics; historical linguistics.
  seedMasteryPath({
    slug: "linguist",
    title: "Linguist",
    description:
      "From Hockett's design features + typological diversity through phonetics + phonology with an interactive IPA vowel formant chart, morphology + agglutinative/fusional/polysynthetic typology, syntax + X-bar + dependency + word-order universals, formal truth-conditional + distributional semantics + lambda calculus + word embeddings, pragmatics + Gricean maxims + speech acts + LLM theory of mind, sociolinguistics + Labovian variation + dialect + AAVE, and historical linguistics + comparative method + Grimm's Law + Indo-European + Bayesian phylogenetics. The general-linguistics stack end-to-end.",
    nodes: [
      { slug: "language-structure-foundations", title: "Language Structure + Foundations", level: "apprentice", order: 1, pages: ["hockett-features", "linguistic-levels", "universals-diversity"], prereqs: [], description: "Hockett's design features, linguistic levels (phonetics → pragmatics), universals + cross-linguistic diversity, formal vs functional approaches." },
      { slug: "phonetics-and-phonology", title: "Phonetics + Phonology", level: "practitioner", order: 2, pages: ["articulatory-ipa", "phoneme-allophone", "acoustic"], prereqs: ["language-structure-foundations"], description: "Articulatory + acoustic phonetics + IPA + interactive vowel chart, phonemes vs allophones + phonological rules + OT, formant analysis + speech perception." },
      { slug: "morphology-and-word-formation", title: "Morphology + Word Formation", level: "practitioner", order: 3, pages: ["morphemes", "typology", "computational"], prereqs: ["language-structure-foundations"], description: "Derivational + inflectional, isolating → polysynthetic typology + index of synthesis, finite-state + subword tokenization (BPE)." },
      { slug: "syntax-and-phrase-structure", title: "Syntax + Phrase Structure", level: "specialist", order: 4, pages: ["constituency-dependency", "word-order", "movement-binding"], prereqs: ["language-structure-foundations"], description: "X-bar + dependency, Greenberg word-order universals + Chomsky parameters, movement + binding theory + neural parsing." },
      { slug: "semantics-meaning-and-truth", title: "Semantics: Meaning + Truth", level: "specialist", order: 5, pages: ["truth-conditional", "lexical-wordnet", "distributional-neural"], prereqs: ["syntax-and-phrase-structure"], description: "Truth-conditional + compositional + lambda + Montague, lexical relations + WordNet + frame semantics, distributional + neural embeddings + CLIP + LLMs." },
      { slug: "pragmatics-and-discourse", title: "Pragmatics + Discourse", level: "expert", order: 6, pages: ["gricean-speech-acts", "politeness-register", "computational-llm"], prereqs: ["semantics-meaning-and-truth"], description: "Gricean maxims + speech acts + presupposition + implicature, politeness + face + register + honorifics, RSA + LLM ToM + RLHF alignment." },
      { slug: "sociolinguistics-and-variation", title: "Sociolinguistics + Variation", level: "expert", order: 7, pages: ["labov-variationist", "standard-prestige", "change-revitalization"], prereqs: ["phonetics-and-phonology"], description: "Labov's NYC + variationist methodology, standard + prescriptive vs descriptive + AAVE, apparent-time + language change + endangerment." },
      { slug: "historical-linguistics-and-reconstruction", title: "Historical Linguistics + Reconstruction", level: "expert", order: 8, pages: ["comparative-method", "ie-families", "phylogenetics"], prereqs: ["phonetics-and-phonology"], description: "Comparative method + Grimm/Verner laws, IE + other families + steppe hypothesis, glottochronology + Bayesian phylogenetics + ancient DNA." },
    ],
  });

  // P36 — Photonics Engineer path. EM + Gaussian beams (new
  // GaussianBeam viz) + lasers/cavities + fiber + photodetectors +
  // nonlinear optics + photonic ICs + quantum optics. Introduces
  // 'puzzle_drag_build' question type for optical-system assembly.
  seedMasteryPath({
    slug: "photonics-engineer",
    title: "Photonics Engineer",
    description:
      "From Maxwell's equations + Fresnel + dispersion through Gaussian-beam propagation with interactive viz, lasers + cavity design + Michelson interferometer assembly, fiber optics + WDM + EDFA + coherent telecom, photodetectors + SPADs + noise, nonlinear optics + frequency combs + attosecond physics, photonic ICs + Si/InP/SiN/TFLN + co-packaged optics, and quantum optics + entanglement + QKD + Bell tests. The photonics-engineering stack end-to-end.",
    nodes: [
      { slug: "em-waves-and-maxwell", title: "EM Waves + Maxwell's Equations", level: "apprentice", order: 1, pages: ["maxwell", "fresnel-coatings", "dispersion-polarization"], prereqs: [], description: "Maxwell's equations, plane-wave + Fresnel coefficients + AR/HR coatings, polarization + birefringence + dispersion + Sellmeier." },
      { slug: "gaussian-beams-and-diffraction", title: "Gaussian Beams + Diffraction", level: "practitioner", order: 2, pages: ["gaussian-beam-math", "diffraction-limit", "fourier-optics"], prereqs: ["em-waves-and-maxwell"], description: "w(z), z_R, θ_div, M² beam quality + interactive viz, Abbe diffraction limit + Fourier optics + super-resolution." },
      { slug: "lasers-and-cavity-design", title: "Lasers + Cavity Design", level: "practitioner", order: 3, pages: ["stimulated-emission", "cavity-stability", "cw-pulsed-ultrafast"], prereqs: ["em-waves-and-maxwell"], description: "Einstein A/B + population inversion, resonators + Q + ABCD + cavity stability, CW + Q-switched + mode-locked + CPA + frequency combs." },
      { slug: "fiber-optics-and-dispersion", title: "Fiber Optics + Dispersion", level: "specialist", order: 4, pages: ["single-multi-mode", "chromatic-dispersion", "wdm-edfa-coherent"], prereqs: ["gaussian-beams-and-diffraction"], description: "Step + graded index + TIR, modal + chromatic + PMD + nonlinear effects, WDM + EDFA + Raman + coherent 100G+ telecom." },
      { slug: "photodetectors-and-noise", title: "Photodetectors + Noise", level: "specialist", order: 5, pages: ["detector-families", "shot-thermal-noise", "spad-snspd"], prereqs: ["em-waves-and-maxwell"], description: "PIN + APD + SPAD + SNSPD + PMT + SiPM, shot + thermal + dark + amplifier noise, SNR + sensitivity in real systems." },
      { slug: "nonlinear-optics-and-frequency-conversion", title: "Nonlinear Optics + Frequency Conversion", level: "specialist", order: 6, pages: ["nonlinear-polarization", "phase-matching", "comb-attosecond"], prereqs: ["em-waves-and-maxwell"], description: "χ⁽²⁾ + χ⁽³⁾ processes + phase matching (BPM + QPM/PPLN), frequency combs + supercontinuum + solitons, attosecond physics + 2023 Nobel." },
      { slug: "photonic-integrated-circuits", title: "Photonic Integrated Circuits", level: "expert", order: 7, pages: ["platforms-siph-inp-sin-tfln", "components", "co-packaged-optics"], prereqs: ["fiber-optics-and-dispersion"], description: "Si + InP + SiN + TFLN platforms + heterogeneous, modulators + lasers + detectors on chip, co-packaged optics + AI accelerator I/O." },
      { slug: "quantum-optics-and-entanglement", title: "Quantum Optics + Entanglement", level: "expert", order: 8, pages: ["quantum-states", "bell-tests", "qkd-quantum-net"], prereqs: ["em-waves-and-maxwell"], description: "Fock + coherent + squeezed states, Bell theorem + loophole-free tests + 2022 Nobel, BB84/E91 QKD + Beijing-Shanghai + Micius + quantum repeaters." },
    ],
  });

  // P35 — Information Theorist path. Entropy + source coding + MI/KL
  // + channel capacity (with new ShannonChannel viz) + error-correcting
  // codes + rate-distortion + practical compression + info theory in
  // ML. Continues 'slider' question type usage.
  seedMasteryPath({
    slug: "information-theorist",
    title: "Information Theorist",
    description:
      "From entropy + surprisal through source coding + Huffman/arithmetic/ANS, mutual information + KL divergence, Shannon's noisy-channel theorem with interactive binary-symmetric-channel viz, error-correcting codes (Hamming → Reed-Solomon → LDPC → polar), rate-distortion + perceptual coding, practical compressors (gzip/zstd/xz/brotli), and information theory in ML (cross-entropy, ELBO, InfoNCE, CLIP). The information-theory stack end-to-end.",
    nodes: [
      { slug: "entropy-and-surprisal", title: "Entropy + Surprisal", level: "apprentice", order: 1, pages: ["surprisal", "entropy-axioms", "coding-interpretation"], prereqs: [], description: "Surprisal -log p, Shannon entropy H = -∑ p log p, axiomatic derivation, coding-theorem interpretation." },
      { slug: "source-coding-and-compression", title: "Source Coding + Compression", level: "practitioner", order: 2, pages: ["huffman", "arithmetic-ans", "lz-bwt"], prereqs: ["entropy-and-surprisal"], description: "Huffman + arithmetic + ANS entropy coders, LZ77/LZ78 + BWT dictionary coding, universal coding + neural LM compression." },
      { slug: "mutual-information-and-kl-divergence", title: "Mutual Info + KL Divergence", level: "practitioner", order: 3, pages: ["mutual-info", "kl-divergence", "information-bottleneck"], prereqs: ["entropy-and-surprisal"], description: "I(X;Y) + KL(P||Q), information bottleneck, cross-entropy + variational inference + MI for representation learning." },
      { slug: "channel-capacity-and-noisy-channel-theorem", title: "Channel Capacity + Shannon's Theorem", level: "specialist", order: 4, pages: ["bsc-capacity", "shannon-hartley", "multi-user"], prereqs: ["mutual-information-and-kl-divergence"], description: "BSC capacity + interactive viz, Shannon-Hartley + practical wireless/fiber, MIMO + 5G + multi-user info theory." },
      { slug: "error-correcting-codes", title: "Error-Correcting Codes", level: "expert", order: 5, pages: ["hamming-bch-rs", "convolutional-turbo", "ldpc-polar-neural"], prereqs: ["channel-capacity-and-noisy-channel-theorem"], description: "Hamming + BCH + Reed-Solomon, convolutional + turbo, LDPC + polar + iterative decoding, neural decoders." },
      { slug: "rate-distortion-and-lossy-compression", title: "Rate-Distortion + Lossy Compression", level: "expert", order: 6, pages: ["rd-function", "jpeg-mp3", "neural-codecs"], prereqs: ["entropy-and-surprisal"], description: "R(D) for Gaussian, JPEG + MP3 + perceptual coding, AVIF + HEIC + neural image codecs." },
      { slug: "compression-in-practice", title: "Compression in Practice", level: "expert", order: 7, pages: ["gzip-zstd-xz", "columnar-db", "streaming"], prereqs: ["source-coding-and-compression"], description: "gzip/zstd/xz/brotli/LZ4 tradeoffs, columnar databases + Parquet/ORC, streaming + dictionary + parallelism." },
      { slug: "information-theory-in-ml", title: "Information Theory in ML", level: "expert", order: 8, pages: ["cross-entropy-mle", "elbo-vae", "infonce-clip"], prereqs: ["mutual-information-and-kl-divergence"], description: "Cross-entropy = MLE = KL min, ELBO + VAE + diffusion, InfoNCE + SimCLR + CLIP + multimodal foundations." },
    ],
  });

  // P34 — Biomedical Engineer path. Biomechanics + tissue, cardio
  // hemodynamics, electrophysiology + ECG with new interactive
  // ECGSimulator viz, medical imaging modalities, biomaterials +
  // implants, drug-delivery, prosthetics + BMI, regulatory + clinical
  // translation. Introduces the 'slider' question type (numeric
  // estimation in a range).
  seedMasteryPath({
    slug: "biomedical-engineer",
    title: "Biomedical Engineer",
    description:
      "From biomechanics + tissue properties through cardiovascular hemodynamics + Poiseuille, electrophysiology + the 12-lead ECG with an interactive ECG simulator + clinical-arrhythmia detection, medical imaging (X-ray/CT/MRI/PET/US) + modality selection, biomaterials + implants + the metal-on-metal recall story, controlled-release + LNP/mRNA drug delivery, prosthetics + brain-machine interfaces + Neuralink/Synchron, and FDA pathways + clinical translation + reimbursement. The biomedical-engineering stack end-to-end.",
    nodes: [
      { slug: "biomechanics-and-tissue", title: "Biomechanics + Tissue", level: "apprentice", order: 1, pages: ["stress-strain", "tissue-moduli", "stress-shielding"], prereqs: [], description: "Stress + strain in biological tissue, Hooke's law + viscoelasticity, bone + tendon + cartilage, stress-shielding around orthopedic implants." },
      { slug: "cardiovascular-hemodynamics", title: "Cardiovascular Hemodynamics", level: "practitioner", order: 2, pages: ["poiseuille", "cardiac-cycle-pv-loops", "interventions"], prereqs: ["biomechanics-and-tissue"], description: "Blood flow + Poiseuille 1/r⁴ scaling, P-V loops + ejection fraction + heart failure, stents + TAVR + LVADs." },
      { slug: "electrophysiology-and-ecg", title: "Electrophysiology + ECG", level: "specialist", order: 3, pages: ["cardiac-action-potential", "12-lead-ecg", "arrhythmias"], prereqs: ["cardiovascular-hemodynamics"], description: "Cardiac action-potential phases + Nernst, the 12-lead ECG with interactive viz, AV block + AFib + STEMI localization." },
      { slug: "medical-imaging-modalities", title: "Medical Imaging Modalities", level: "specialist", order: 4, pages: ["xray-ct-mri-pet", "resolution-contrast", "modality-selection"], prereqs: [], description: "X-ray + CT + MRI + ultrasound + PET physics, contrast vs resolution vs dose tradeoffs, clinical scenario-to-modality mapping." },
      { slug: "biomaterials-and-implants", title: "Biomaterials + Implants", level: "specialist", order: 5, pages: ["material-classes", "foreign-body-response", "implant-lifecycle"], prereqs: ["biomechanics-and-tissue"], description: "Metals + polymers + ceramics + composites, foreign-body response + biocompatibility, hip + knee + stents + the MoM recall." },
      { slug: "drug-delivery-and-controlled-release", title: "Drug Delivery + Controlled Release", level: "specialist", order: 6, pages: ["release-kinetics", "targeting-strategies", "lnp-mrna"], prereqs: [], description: "Controlled-release kinetics (Higuchi + Korsmeyer-Peppas), passive (EPR) + active (ADC) targeting, LNP-mRNA platform success." },
      { slug: "prosthetics-and-bmi", title: "Prosthetics + Brain-Machine Interfaces", level: "expert", order: 7, pages: ["limb-prosthetics", "bmi-signal-acquisition", "ethics"], prereqs: ["biomechanics-and-tissue", "electrophysiology-and-ecg"], description: "Myoelectric + powered + neural prosthetics, EEG + ECoG + Utah + Neuralink BMI, foreign-body response + ethics." },
      { slug: "regulatory-and-clinical-translation", title: "Regulatory + Clinical Translation", level: "expert", order: 8, pages: ["fda-pathways", "clinical-trials", "reimbursement"], prereqs: ["biomaterials-and-implants"], description: "Class I/II/III + 510(k) / De Novo / PMA pathways, device trials + RWE, CMS + payer reimbursement + SaMD/AI regulation." },
    ],
  });

  // P33 — Atmospheric Scientist path. From atmospheric structure +
  // composition through radiation + greenhouse, dynamics + circulation,
  // weather systems, boundary layer + pollution, NWP + ML weather,
  // severe weather + extremes, and atmospheric chemistry + ozone.
  // Uses new AtmosphericSounding viz.
  seedMasteryPath({
    slug: "atmospheric-scientist",
    title: "Atmospheric Scientist",
    description:
      "From atmospheric layers + composition + barometric formula through Earth's radiation balance + greenhouse + climate sensitivity, geostrophic + Hadley + Ferrel circulation + jets + Rossby waves, mid-latitude + tropical cyclones with interactive atmospheric sounding + CAPE, boundary layer + Pasquill-Gifford air-pollution dispersion + ozone smog, numerical weather prediction + ML revolution (GraphCast), severe weather + attribution science + extreme events, and atmospheric chemistry + the ozone hole + Montreal Protocol. The atmospheric-science stack end-to-end.",
    nodes: [
      { slug: "atmospheric-structure-and-composition", title: "Atmospheric Structure + Composition", level: "apprentice", order: 1, pages: ["layers", "composition", "hydrostatic-barometric"], prereqs: [], description: "Troposphere → exosphere; dry-air + trace gases; hydrostatic balance + scale height + barometric formula." },
      { slug: "radiation-and-greenhouse-effect", title: "Radiation + Greenhouse Effect", level: "practitioner", order: 2, pages: ["radiation-balance", "greenhouse-spectroscopy", "fingerprints"], prereqs: ["atmospheric-structure-and-composition"], description: "Solar + thermal balance, GHG spectroscopy + Revelle factor, climate sensitivity + ECS + stratospheric cooling fingerprint." },
      { slug: "atmospheric-dynamics-and-circulation", title: "Atmospheric Dynamics + Circulation", level: "practitioner", order: 3, pages: ["geostrophic-thermal-wind", "hadley-ferrel", "jets-rossby"], prereqs: ["atmospheric-structure-and-composition"], description: "Geostrophic + thermal-wind balance, Hadley + Ferrel + Polar cells + Walker, jet streams + Rossby waves + blocking." },
      { slug: "weather-systems-and-cyclones", title: "Weather Systems + Cyclones", level: "specialist", order: 4, pages: ["extratropical", "tropical", "forecasting"], prereqs: ["atmospheric-dynamics-and-circulation"], description: "Mid-latitude cyclones + baroclinic instability, tropical cyclones + RI + Saffir-Simpson, NWP + ML forecasting." },
      { slug: "boundary-layer-and-air-pollution", title: "Boundary Layer + Air Pollution", level: "specialist", order: 5, pages: ["pbl-stability", "pollutants-chemistry", "dispersion-inversion"], prereqs: ["atmospheric-dynamics-and-circulation"], description: "Diurnal PBL evolution + stability; primary + secondary pollutants + chemistry; Pasquill-Gifford dispersion + inversions." },
      { slug: "numerical-weather-prediction", title: "Numerical Weather Prediction", level: "expert", order: 6, pages: ["nwp-anatomy", "chaos-ensembles", "ml-weather"], prereqs: ["atmospheric-dynamics-and-circulation"], description: "Observations + data assimilation + integration; chaos limits + ensembles; ML revolution (GraphCast + Pangu + AIFS)." },
      { slug: "severe-weather-and-extremes", title: "Severe Weather + Extremes", level: "expert", order: 7, pages: ["convective-severe", "storm-surge", "extremes-attribution"], prereqs: ["weather-systems-and-cyclones"], description: "Supercells + tornadoes + hail; hurricane storm surge + flooding; attribution science + 2021 PNW heat dome." },
      { slug: "atmospheric-chemistry-and-ozone", title: "Atmospheric Chemistry + Ozone", level: "expert", order: 8, pages: ["stratospheric-ozone", "montreal-protocol", "troposphere-ch4"], prereqs: ["radiation-and-greenhouse-effect", "boundary-layer-and-air-pollution"], description: "Chapman cycle + UV protection; ozone hole + CFCs + Montreal Protocol success; OH chemistry + CH₄ budget + methane pledge." },
    ],
  });

  // P32 — Oceanographer path. From physical oceanography through
  // ocean circulation + currents (uses new OceanTSDiagram viz),
  // waves + tides, ocean chemistry + acidification, marine
  // biogeochemistry + nutrients, marine ecosystems + zones,
  // ENSO + climate coupling, and sea-level rise + ocean warming.
  // Introduces sortable + drag_classify question types.
  seedMasteryPath({
    slug: "oceanographer",
    title: "Oceanographer",
    description:
      "From T-S diagrams + water masses (interactive viz) through wind-driven + thermohaline circulation + AMOC, surface waves + tides + tsunamis, the carbonate system + ocean acidification, marine biogeochemistry + Redfield + carbon pump, vertical + horizontal ecosystem zones + coral reefs, ENSO + Bjerknes feedback + teleconnections, and sea-level rise + ocean heat content + coastal adaptation. The oceanography stack end-to-end.",
    nodes: [
      { slug: "physical-oceanography-basics", title: "Physical Oceanography Basics", level: "apprentice", order: 1, pages: ["t-s-density", "water-masses", "vertical-structure"], prereqs: [], description: "T + S + density, T-S diagrams + isopycnals + cabbeling, mixed layer + thermocline + abyssal water." },
      { slug: "ocean-circulation-and-currents", title: "Ocean Circulation + Currents", level: "practitioner", order: 2, pages: ["wind-driven", "geostrophy-thermal-wind", "amoc-thc"], prereqs: ["physical-oceanography-basics"], description: "Wind-driven gyres + Ekman + western boundary intensification, geostrophy + thermal wind, AMOC + climate coupling." },
      { slug: "waves-and-tides", title: "Waves + Tides", level: "practitioner", order: 3, pages: ["wave-spectrum", "tides-harmonics", "tsunami-surge"], prereqs: ["physical-oceanography-basics"], description: "Capillary/gravity/swell, tide harmonic decomposition + M2/S2/K1, storm surge + tsunami shoaling + Green's law." },
      { slug: "ocean-chemistry-and-acidification", title: "Ocean Chemistry + Acidification", level: "practitioner", order: 4, pages: ["major-ions", "carbonate-system", "acidification-impacts"], prereqs: ["physical-oceanography-basics"], description: "Major-ion constancy, carbonate equilibria + Revelle factor + saturation states, OA impacts on calcifiers." },
      { slug: "marine-biogeochemistry-and-nutrients", title: "Marine Biogeochemistry + Nutrients", level: "specialist", order: 5, pages: ["redfield", "carbon-pumps", "hnlc-iron"], prereqs: ["physical-oceanography-basics", "ocean-chemistry-and-acidification"], description: "Redfield ratio + N/P/Fe limitation, biological + solubility carbon pumps, HNLC regions + iron fertilization + dead zones." },
      { slug: "marine-ecosystems-and-zones", title: "Marine Ecosystems + Zones", level: "specialist", order: 6, pages: ["vertical-zones", "biomes-reefs", "food-web-decline"], prereqs: ["marine-biogeochemistry-and-nutrients"], description: "Euphotic/mesopelagic/bathypelagic/abyssal, coral reefs + kelp + vents + nurseries, trophic levels + fishing-down + MPAs." },
      { slug: "el-nino-and-climate-coupling", title: "ENSO + Climate Coupling", level: "expert", order: 7, pages: ["enso-states", "bjerknes-feedback", "teleconnections"], prereqs: ["ocean-circulation-and-currents"], description: "El Niño/La Niña/neutral states, Bjerknes feedback + delayed oscillator, global teleconnections + 2015-16 + 2023-24 super events." },
      { slug: "sea-level-rise-and-ocean-warming", title: "Sea-Level Rise + Ocean Warming", level: "expert", order: 8, pages: ["ocean-heat-content", "slr-components", "coastal-adaptation"], prereqs: ["physical-oceanography-basics", "ocean-circulation-and-currents"], description: "OHC + Argo + warming trend, SLR components (thermal + glaciers + ice sheets), gravitational fingerprints + adaptation." },
    ],
  });

  // P31 — Nuclear Engineer path. From fission fundamentals through
  // neutron transport + criticality, reactor kinetics + control with
  // the new interactive PointKinetics viz, thermal-hydraulics +
  // DNB, reactor types (PWR/BWR/CANDU/SMR/Gen IV/MSR), fuel cycle +
  // waste, radiation safety + accident lessons (TMI/Chernobyl/
  // Fukushima), and fusion + future nuclear.
  seedMasteryPath({
    slug: "nuclear-engineer",
    title: "Nuclear Engineer",
    description:
      "From fission fundamentals + binding energy through neutron transport + criticality + the four-factor formula, point kinetics + delayed neutrons + the 1$ prompt-critical threshold with an interactive viz, thermal-hydraulics + DNB + LOCA, reactor types (LWR/CANDU/SFR/MSR/SMR/Gen IV), fuel cycle + reprocessing + geological disposal, radiation safety + ALARA + TMI/Chernobyl/Fukushima lessons, and fusion + advanced fission for the future grid. The nuclear-engineering stack end-to-end.",
    nodes: [
      { slug: "fission-fundamentals", title: "Fission Fundamentals", level: "apprentice", order: 1, pages: ["binding-energy", "chain-reaction", "decay-heat"], prereqs: [], description: "Binding-energy curve, U-235 fission + 200 MeV/reaction, fissile vs fertile, decay-heat curve + why Fukushima cores melted." },
      { slug: "neutron-transport-and-criticality", title: "Neutron Transport + Criticality", level: "practitioner", order: 2, pages: ["four-factor", "diffusion-equation", "reactivity-control"], prereqs: ["fission-fundamentals"], description: "k_∞ + four-factor formula, neutron diffusion + buckling, control rods + boron + xenon poisoning." },
      { slug: "reactor-kinetics-and-control", title: "Reactor Kinetics + Control", level: "specialist", order: 3, pages: ["point-kinetics", "delayed-neutrons", "control-architecture"], prereqs: ["neutron-transport-and-criticality"], description: "Point-kinetics ODEs + interactive viz, delayed-neutron role + 1$ threshold, defense in depth + Chernobyl rod design lesson." },
      { slug: "thermal-hydraulics", title: "Thermal Hydraulics", level: "specialist", order: 4, pages: ["heat-removal", "dnb-chf", "loca-fukushima"], prereqs: ["fission-fundamentals", "neutron-transport-and-criticality"], description: "Fuel-pin heat conduction + cladding T, boiling regimes + DNBR > 1.3, LOCA sequences + TMI + Fukushima common-mode failure." },
      { slug: "reactor-types-and-designs", title: "Reactor Types + Designs", level: "specialist", order: 5, pages: ["lwr-pwr-bwr", "candu-fast-msr", "smr-gen-iv"], prereqs: ["thermal-hydraulics"], description: "PWR/BWR dominance, CANDU + fast reactors + MSR, Gen III+ (AP1000, EPR) + Gen IV + SMRs (BWRX-300, Natrium)." },
      { slug: "fuel-cycle-and-waste", title: "Fuel Cycle + Waste", level: "expert", order: 6, pages: ["enrichment-fabrication", "reprocessing-mox", "geological-repository"], prereqs: ["fission-fundamentals"], description: "Open vs closed fuel cycle, enrichment + SWU, MOX + reprocessing economics, Finnish/Swedish repositories + Yucca politics." },
      { slug: "radiation-safety-and-accidents", title: "Radiation Safety + Accidents", level: "expert", order: 7, pages: ["dose-units", "alara", "accident-case-studies"], prereqs: ["fission-fundamentals"], description: "α/β/γ/n + Sv units + ALARA, dose limits + 3 R's, TMI/Chernobyl/Fukushima accident sequences + LNT controversy." },
      { slug: "fusion-and-future-nuclear", title: "Fusion + Future Nuclear", level: "expert", order: 8, pages: ["d-t-fusion", "iter-nif", "fusion-timeline"], prereqs: ["fission-fundamentals", "thermal-hydraulics"], description: "D-T reaction + Lawson criterion, magnetic (ITER, SPARC) vs inertial (NIF 2022 breakeven), commercial fusion 2050-2070 horizon." },
    ],
  });

  // P30 — Chemical Engineer path. Mass + energy balances through
  // fluid mechanics, heat transfer, reactor design with the new
  // interactive CSTR-vs-PFR viz, distillation + separations, process
  // control + dynamics, process safety + HAZOP/LOPA, and process
  // intensification + sustainability + decarbonization.
  seedMasteryPath({
    slug: "chemical-engineer",
    title: "Chemical Engineer",
    description:
      "From mass + energy balances through fluid mechanics + transport phenomena, heat-exchanger design + LMTD, reactor design + kinetics with an interactive CSTR-vs-PFR comparison viz, distillation + extraction + membranes, PID + cascade process control, HAZOP + LOPA process safety, and process intensification + LCA + decarbonization pathways. The chemical-engineering stack end-to-end.",
    nodes: [
      { slug: "mass-and-energy-balances", title: "Mass + Energy Balances", level: "apprentice", order: 1, pages: ["general-balance", "steady-state", "energy-balance"], prereqs: [], description: "Accumulation = In − Out + Gen − Cons applied to mass + energy; steady-state vs dynamic; reactor + evaporator + heater design balances." },
      { slug: "fluid-mechanics-and-transport", title: "Fluid Mechanics + Transport", level: "practitioner", order: 2, pages: ["mechanical-energy-balance", "reynolds-number", "transport-analogies"], prereqs: ["mass-and-energy-balances"], description: "Bernoulli + friction-factor + pump sizing; Re + flow regimes; Chilton-Colburn analogy + dimensionless-number culture." },
      { slug: "heat-transfer-and-exchangers", title: "Heat Transfer + Exchangers", level: "practitioner", order: 3, pages: ["three-modes", "lmtd-sizing", "topology-selection"], prereqs: ["fluid-mechanics-and-transport"], description: "Conduction/convection/radiation; LMTD + UA sizing; S+T vs plate-and-frame + heat-integration via pinch analysis." },
      { slug: "reactor-design-and-kinetics", title: "Reactor Design + Kinetics", level: "specialist", order: 4, pages: ["arrhenius-rates", "cstr-vs-pfr", "selectivity-multiple-reactions"], prereqs: ["mass-and-energy-balances"], description: "Arrhenius + rate laws; interactive CSTR-vs-PFR viz; selectivity in series + parallel + Damköhler scaling." },
      { slug: "separations-distillation-and-extraction", title: "Separations: Distillation + Extraction", level: "specialist", order: 5, pages: ["vle-raoult", "mccabe-thiele", "extraction-membranes"], prereqs: ["mass-and-energy-balances"], description: "Raoult's law + relative volatility; McCabe-Thiele + Fenske-Underwood + minimum reflux; extraction + absorption + membranes + RO desalination." },
      { slug: "process-control-and-dynamics", title: "Process Control + Dynamics", level: "expert", order: 6, pages: ["first-order-fopdt", "pid-tuning", "cascade-mpc"], prereqs: ["mass-and-energy-balances", "reactor-design-and-kinetics"], description: "First-order + FOPDT models; PID + IMC tuning + anti-windup; cascade control + MPC + RGA pairing." },
      { slug: "process-safety-and-risk", title: "Process Safety + Risk", level: "expert", order: 7, pages: ["historical-incidents", "hazop-lopa", "safety-culture"], prereqs: ["mass-and-energy-balances"], description: "Bhopal + Texas City lessons; HAZOP + LOPA + SIL ratings + Swiss-cheese model; inherent safety + safety culture + PSM." },
      { slug: "process-intensification-and-sustainability", title: "Process Intensification + Sustainability", level: "expert", order: 8, pages: ["intensification", "lca-boundaries", "decarbonization-pathways"], prereqs: ["mass-and-energy-balances", "reactor-design-and-kinetics", "separations-distillation-and-extraction"], description: "Divided-wall columns + reactive distillation + microreactors; LCA methodology + system-boundary; green H₂ + CCUS + circular feedstocks." },
    ],
  });

  // P29 — Epidemiologist path. From foundational measures (incidence,
  // prevalence, CFR) through interactive SIR compartmental models + R₀,
  // study designs (cohort, case-control, RCT), outbreak investigation +
  // surveillance, infectious-disease genomics, causal inference + DAGs,
  // vaccines + immunization programs, public-health decisions + equity,
  // and global health + pandemic preparedness.
  seedMasteryPath({
    slug: "epidemiologist",
    title: "Epidemiologist",
    description:
      "From the core measures (incidence, prevalence, CFR vs IFR) through compartmental SIR models with an interactive viz, R₀ + herd-immunity threshold, observational + experimental study designs, outbreak investigation + multi-stream surveillance (wastewater, genomic), pathogen genomics + Nextstrain phylogenies, modern causal inference with DAGs + target-trial emulation, vaccine efficacy + safety surveillance, equity-focused public health, and global pandemic preparedness. The epidemiology stack end-to-end.",
    nodes: [
      { slug: "epidemiology-foundations", title: "Epidemiology Foundations", level: "apprentice", order: 1, pages: ["incidence-prevalence", "rates-ratios", "epi-curves"], prereqs: [], description: "Incidence vs prevalence, CFR vs IFR, age-adjustment + epi curves + the lag problem." },
      { slug: "compartmental-models-and-r0", title: "Compartmental Models + R₀", level: "practitioner", order: 2, pages: ["sir-derivation", "herd-immunity", "beyond-sir"], prereqs: ["epidemiology-foundations"], description: "Interactive SIR viz, R₀ derivation + herd-immunity threshold, SEIR + age structure + network models + super-spreaders." },
      { slug: "study-designs", title: "Study Designs", level: "practitioner", order: 3, pages: ["observational-designs", "rcts", "bias-confounding"], prereqs: ["epidemiology-foundations"], description: "Cohort vs case-control vs cross-sectional, RCT design (blinding + ITT), confounding + bias + DAGs." },
      { slug: "outbreak-investigation-and-surveillance", title: "Outbreak Investigation + Surveillance", level: "practitioner", order: 4, pages: ["ten-steps", "line-list-attack-rate", "multi-stream-surveillance"], prereqs: ["epidemiology-foundations"], description: "CDC 10-step outbreak framework, line lists + attack-rate tables, modern surveillance (notifiable, syndromic, wastewater, genomic)." },
      { slug: "infectious-disease-genomics", title: "Infectious Disease Genomics", level: "specialist", order: 5, pages: ["phylogenies", "nextstrain", "transmission-reconstruction"], prereqs: ["compartmental-models-and-r0"], description: "Pathogen WGS + molecular clock, Nextstrain + variant surveillance, outbreak reconstruction + vaccine strain selection." },
      { slug: "causal-inference-in-epidemiology", title: "Causal Inference + DAGs", level: "specialist", order: 6, pages: ["bradford-hill", "dags-backdoor", "target-trial-emulation"], prereqs: ["study-designs"], description: "Bradford-Hill criteria, DAGs + confounder/collider identification + backdoor criterion, target-trial emulation + Mendelian randomization." },
      { slug: "vaccines-and-immunization-programs", title: "Vaccines + Immunization Programs", level: "specialist", order: 7, pages: ["vaccine-types", "efficacy-effectiveness", "safety-monitoring"], prereqs: ["compartmental-models-and-r0", "study-designs"], description: "Vaccine types (live/inactivated/mRNA), VE vs effectiveness vs impact, VAERS/VSD safety surveillance + Wakefield's legacy." },
      { slug: "public-health-decisions-and-equity", title: "Public Health Decisions + Equity", level: "expert", order: 8, pages: ["dalys-qalys", "social-determinants", "intervention-design"], prereqs: ["epidemiology-foundations", "study-designs"], description: "DALYs + QALYs + CEA, social determinants + structural epi, universal vs targeted interventions + Health-in-all-Policies." },
      { slug: "global-health-and-pandemic-preparedness", title: "Global Health + Pandemic Preparedness", level: "expert", order: 9, pages: ["global-architecture", "preparedness-failures", "one-health"], prereqs: ["compartmental-models-and-r0", "outbreak-investigation-and-surveillance"], description: "WHO/Gavi/Global Fund architecture, why preparedness is hard, One Health + zoonotic spillover prevention." },
    ],
  });

  // P28 — Astrophysicist path. From stellar structure + fusion through
  // HR diagram + stellar evolution (interactive viz), galaxies + dark
  // matter, big-bang cosmology, black holes + GR, exoplanets +
  // habitability, gravitational waves + multi-messenger, high-energy
  // astrophysics, observational astronomy + instruments.
  seedMasteryPath({
    slug: "astrophysicist",
    title: "Astrophysicist",
    description:
      "From stellar structure + nuclear fusion through the interactive Hertzsprung-Russell diagram + stellar evolution, galaxies + dark matter, big-bang cosmology + CMB + BBN, black holes + GR + the EHT, exoplanets + biosignatures, gravitational waves + GW170817 + multi-messenger, high-energy astrophysics + UHECRs, and observational astronomy + telescope tradeoffs. The astrophysics stack end-to-end.",
    nodes: [
      { slug: "stellar-structure-and-fusion", title: "Stellar Structure + Fusion", level: "apprentice", order: 1, pages: ["hydrostatic-equilibrium", "pp-cno-cycles", "virial-scalings"], prereqs: [], description: "Hydrostatic equilibrium + virial theorem, pp-chain vs CNO cycle, stellar-structure equations + Sun's lifetime." },
      { slug: "hr-diagram-stellar-evolution", title: "HR Diagram + Stellar Evolution", level: "practitioner", order: 2, pages: ["hr-regions", "mass-luminosity-lifetime", "post-ms-tracks"], prereqs: ["stellar-structure-and-fusion"], description: "Interactive HR diagram viz, L-M-T scalings, post-MS evolution + endpoints (WD/NS/BH), globular-cluster turnoff." },
      { slug: "galaxies-and-dark-matter", title: "Galaxies + Dark Matter", level: "practitioner", order: 3, pages: ["hubble-sequence", "rotation-curves", "lambda-cdm"], prereqs: ["stellar-structure-and-fusion"], description: "Hubble morphology, Rubin's rotation curves + DM evidence, ΛCDM + cosmic web + MOND tradeoffs." },
      { slug: "cosmology-and-the-big-bang", title: "Cosmology + Big Bang", level: "specialist", order: 4, pages: ["hubble-law", "cmb-acoustic-peaks", "bbn-deuterium"], prereqs: ["galaxies-and-dark-matter"], description: "Hubble's law + age, CMB acoustic peaks + ΛCDM fits, BBN + D/H baryometer + lithium problem." },
      { slug: "black-holes-and-general-relativity", title: "Black Holes + GR", level: "specialist", order: 5, pages: ["schwarzschild-radius", "eht-imaging", "kerr-spin"], prereqs: ["stellar-structure-and-fusion"], description: "Schwarzschild radius derivation, EHT image of M87* + Sgr A*, no-hair theorem + Kerr metric + tidal effects." },
      { slug: "exoplanets-and-habitability", title: "Exoplanets + Habitability", level: "practitioner", order: 6, pages: ["detection-methods", "habitable-zone", "biosignatures-falsepositives"], prereqs: ["stellar-structure-and-fusion"], description: "RV/transit/imaging detection, habitable zone math, atmospheric biosignatures + O2 false positives on M-dwarfs." },
      { slug: "gravitational-waves-and-multi-messenger", title: "Gravitational Waves + Multi-Messenger", level: "expert", order: 7, pages: ["chirp-mass", "ligo-interferometry", "gw170817"], prereqs: ["black-holes-and-general-relativity"], description: "Chirp mass + Peters-Mathews, LIGO interferometry + noise, GW170817 BNS merger + kilonova + r-process." },
      { slug: "high-energy-astrophysics", title: "High-Energy Astrophysics", level: "expert", order: 8, pages: ["supernova-types", "agn-eddington", "uhecr-gzk"], prereqs: ["stellar-structure-and-fusion", "galaxies-and-dark-matter"], description: "SNe Ia vs core-collapse, AGN unification + Eddington luminosity, UHECRs + GZK cutoff + Auger." },
      { slug: "observational-astronomy-and-instruments", title: "Observational Astronomy + Instruments", level: "expert", order: 9, pages: ["em-spectrum", "diffraction-interferometry", "ground-vs-space"], prereqs: ["high-energy-astrophysics"], description: "EM windows + multi-messenger, diffraction limit + VLBI, JWST/Rubin/HWO + ground-space tradeoffs." },
    ],
  });

  // P27 — Geologist path. Earth science end-to-end: plate tectonics,
  // minerals + rocks, structural geology (interactive Mohr's circle
  // viz), sedimentary systems, earthquakes + seismology, volcanism,
  // deep time + mass extinctions, economic geology + critical minerals.
  seedMasteryPath({
    slug: "geologist",
    title: "Geologist",
    description:
      "From plate tectonics + the unifying theory of Earth through minerals + the rock cycle, structural geology with an interactive Mohr's-circle stress viz, sedimentary systems + facies, earthquake source mechanics + seismic waves, volcanism + magma evolution, deep time + radiometric dating + the Big Five extinctions, and economic geology + the critical-minerals stack (Li, Co, Ni, Cu, REE). The Earth-science stack end-to-end.",
    nodes: [
      { slug: "plate-tectonics", title: "Plate Tectonics", level: "apprentice", order: 1, pages: ["lithosphere-asthenosphere", "boundary-types", "hotspots-convection"], prereqs: [], description: "Lithosphere + asthenosphere, divergent + convergent + transform boundaries, hotspots + mantle convection, Wilson cycle." },
      { slug: "minerals-and-rocks", title: "Minerals + the Rock Cycle", level: "apprentice", order: 2, pages: ["mineral-id", "igneous-classification", "metamorphic-facies"], prereqs: [], description: "Mineral identification + silicate classes, igneous TAS + Bowen's reaction series, sedimentary + metamorphic facies + the rock cycle." },
      { slug: "structural-geology", title: "Structural Geology + Stress", level: "practitioner", order: 3, pages: ["stress-strain", "mohrs-circle", "folds-faults-coulomb"], prereqs: ["minerals-and-rocks"], description: "Stress + strain tensors, interactive Mohr's circle + Coulomb failure, folds + faults + Anderson's classification + reservoir geomechanics." },
      { slug: "sedimentary-systems", title: "Sedimentary Systems + Facies", level: "practitioner", order: 4, pages: ["weathering-transport", "facies-walther", "sequence-stratigraphy"], prereqs: ["minerals-and-rocks"], description: "Weathering + Hjulström transport + sorting, depositional environments + Walther's law, sequence stratigraphy + petroleum systems." },
      { slug: "earthquakes-and-seismology", title: "Earthquakes + Seismology", level: "specialist", order: 5, pages: ["elastic-rebound", "p-s-waves", "magnitude-hazard"], prereqs: ["structural-geology"], description: "Elastic-rebound theory + focal mechanisms, P/S/surface waves + travel-time + tomography, magnitude scales + hazard + early-warning." },
      { slug: "volcanism-and-magma", title: "Volcanism + Magma", level: "practitioner", order: 6, pages: ["magma-genesis", "eruption-styles-vei", "monitoring-hazards"], prereqs: ["plate-tectonics", "minerals-and-rocks"], description: "Magma genesis + decompression melting, viscosity + volatile content + eruption styles + VEI, monitoring + Pinatubo + super-eruption risk." },
      { slug: "earth-history-and-deep-time", title: "Deep Time + Earth History", level: "specialist", order: 7, pages: ["radiometric-dating", "geologic-time-scale", "big-five-extinctions"], prereqs: [], description: "Radiometric dating + half-life math, Hadean → Cenozoic narrative, the Big Five mass extinctions + the Anthropocene + Snowball Earth." },
      { slug: "economic-geology-and-resources", title: "Economic Geology + Resources", level: "expert", order: 8, pages: ["ore-genesis", "critical-minerals", "energy-resources"], prereqs: ["plate-tectonics", "structural-geology"], description: "Porphyry + VMS + SEDEX + epithermal ore genesis, critical minerals (Li, Co, Ni, Cu, REE), petroleum systems + geothermal + CCS + the energy transition." },
    ],
  });

  // P26 — Quant Trader path. Systematic trading: strategies,
  // microstructure (uses OrderBook viz), signals + alpha,
  // statistical arbitrage, trend + momentum, backtesting,
  // execution algos, risk + portfolio management.
  seedMasteryPath({
    slug: "quant-trader",
    title: "Quant Trader",
    description:
      "From systematic vs discretionary trading + strategy taxonomies through limit-order books + market impact (interactive OrderBook viz), alpha signals + the fundamental law of active management, statistical arbitrage + cointegration, trend + momentum + Almgren-Chriss execution, backtesting + López-de-Prado overfitting, RL execution + VaR + Kelly + LTCM. The systematic-trading stack end-to-end.",
    nodes: [
      { slug: "systematic-trading-overview", title: "Systematic Trading Overview", level: "apprentice", order: 1, pages: ["systematic-vs-discretionary", "strategy-taxonomy", "sharpe-firms"], prereqs: [], description: "Systematic vs discretionary, strategy families (trend/mean-revert/factor/HFT), Sharpe + capacity + firm structures." },
      { slug: "market-microstructure-trading", title: "Market Microstructure (Trading)", level: "practitioner", order: 2, pages: ["lob-orders", "impact-tca", "hft-makers"], prereqs: [], description: "Limit order books + walk-the-book (interactive viz), market impact + square-root law, HFT + makers + dark pools." },
      { slug: "signals-and-alpha", title: "Signals + Alpha", level: "practitioner", order: 3, pages: ["alpha-sources", "decay-combination", "alt-data-ml"], prereqs: [], description: "Alpha sources + IC/IR, signal decay + combination, alternative data + ML in trading + López-de-Prado." },
      { slug: "statistical-arbitrage", title: "Statistical Arbitrage", level: "specialist", order: 4, pages: ["pairs-cointegration", "mean-reversion", "factor-regime"], prereqs: [], description: "Pairs trading + Engle-Granger cointegration, mean-reversion strategies, factor models + regime change (Aug 2007 quake)." },
      { slug: "trend-and-momentum", title: "Trend + Momentum", level: "practitioner", order: 5, pages: ["trend-fundamentals", "ma-breakout", "modern-momentum"], prereqs: [], description: "Time-series + cross-sectional momentum, MA + breakout + vol scaling, crisis alpha (2008, 2022) + risk-parity." },
      { slug: "backtesting-pitfalls", title: "Backtesting Pitfalls", level: "specialist", order: 6, pages: ["bias-types", "walk-forward-cv", "capacity-gap"], prereqs: [], description: "Survivorship + look-ahead + selection biases, walk-forward + López-de-Prado PBO + Deflated Sharpe, capacity + paper trading." },
      { slug: "execution-algorithms", title: "Execution Algorithms", level: "specialist", order: 7, pages: ["twap-vwap-is", "sor-dark", "rl-modern"], prereqs: ["market-microstructure-trading"], description: "TWAP/VWAP/IS/POV algorithms, smart order routing + dark pools + IEX, Almgren-Chriss + RL execution (JPMorgan LOXM)." },
      { slug: "risk-and-portfolio-management", title: "Risk + Portfolio Management", level: "expert", order: 8, pages: ["var-es", "kelly-sizing", "stress-ltcm"], prereqs: [], description: "VaR + Expected Shortfall, Kelly + position sizing + leverage, stress testing + liquidity + the LTCM lesson." },
    ],
  });

  // P25 — Healthcare ML Engineer path. EHR + coding, medical imaging
  // AI, clinical decision support (uses ROC viz), clinical NLP +
  // ambient scribes, predictive modeling, clinical genomics,
  // trials + RWE, fairness + equity.
  seedMasteryPath({
    slug: "healthcare-ml-engineer",
    title: "Healthcare ML Engineer",
    description:
      "From EHR data + coding standards (ICD/SNOMED/LOINC/FHIR) through medical imaging deep learning, ROC-based clinical decision support (interactive viz), clinical NLP + AI scribes, predictive modeling + drift, clinical genomics + pharmacogenomics, RCT + adaptive trials + RWE, and AI fairness + health equity. The clinical-ML stack end-to-end.",
    nodes: [
      { slug: "ehr-and-medical-coding", title: "EHR + Medical Coding", level: "apprentice", order: 1, pages: ["ehr-systems", "icd-snomed-loinc", "fhir-omop"], prereqs: [], description: "EHR systems + data types, ICD/CPT/SNOMED/LOINC + RxNorm, HL7/FHIR + OMOP CDM, phenotyping + biases." },
      { slug: "medical-imaging-ai", title: "Medical Imaging AI", level: "practitioner", order: 2, pages: ["modalities", "cnn-transformer-medical", "fda-samd"], prereqs: [], description: "X-ray/CT/MRI/US/PET/pathology, U-Net + nnU-Net + foundation models, FDA SaMD pathway + bias considerations." },
      { slug: "clinical-decision-support", title: "Clinical Decision Support", level: "practitioner", order: 3, pages: ["confusion-bayes", "roc-auc-calibration", "nnt-utility"], prereqs: ["ehr-and-medical-coding"], description: "Sensitivity + specificity + PPV + Bayes (interactive ROC viz), AUC + calibration, NNT + decision-curve analysis." },
      { slug: "clinical-nlp", title: "Clinical NLP + AI Scribes", level: "practitioner", order: 4, pages: ["clinical-text", "deid-llm", "scribes-deployment"], prereqs: ["ehr-and-medical-coding"], description: "Clinical text tasks (NER, negation, normalization), de-identification + LLM challenges, ambient AI scribes (Nuance DAX, Abridge)." },
      { slug: "predictive-modeling-clinical", title: "Clinical Predictive Modeling", level: "specialist", order: 5, pages: ["model-types", "internal-external-validation", "deployment-mlops"], prereqs: ["clinical-decision-support"], description: "Diagnostic vs prognostic vs treatment effect, internal + external + temporal validation, deployment + drift + Epic Sepsis lessons." },
      { slug: "genomics-clinical", title: "Clinical Genomics + PGx", level: "specialist", order: 6, pages: ["clinical-testing", "pharmacogenomics-precision-onc", "gwas-prs-alphamissense"], prereqs: [], description: "Genomic testing modalities, pharmacogenomics + precision oncology + companion diagnostics, GWAS + polygenic risk scores + AlphaMissense." },
      { slug: "trial-design-and-rwe", title: "Clinical Trials + RWE", level: "specialist", order: 7, pages: ["rct-fundamentals", "adaptive-platform-bayesian", "rwe-rwd"], prereqs: [], description: "RCT design + endpoints + bias, adaptive + platform (RECOVERY) + Bayesian trials, real-world evidence + target trial emulation." },
      { slug: "health-equity-and-bias-in-ml", title: "Health Equity + ML Fairness", level: "expert", order: 8, pages: ["bias-sources", "fairness-metrics-impossibility", "mitigations-governance"], prereqs: ["clinical-decision-support", "predictive-modeling-clinical"], description: "Sources of bias (Obermeyer 2019), fairness metrics + Kleinberg impossibility, mitigations + governance + regulation." },
    ],
  });

  // P24 — Pharmacologist path. PK + PD + drug targets + medicinal
  // chemistry + pipeline + clinical pharm + tox + modern modalities.
  // Uses new pk-curve viz in pharmacokinetics lesson.
  seedMasteryPath({
    slug: "pharmacologist",
    title: "Pharmacologist",
    description:
      "From ADME + pharmacokinetics (interactive PK-curve viz) through receptor binding + dose-response, drug targets + GPCRs + kinases, medicinal chemistry + Lipinski's Rule of Five, the clinical-trial pipeline + FDA, drug-drug interactions + Beers Criteria, toxicology + Paracelsus, and biologics + mRNA + gene therapy. The pharmacology stack end-to-end.",
    nodes: [
      { slug: "pharmacokinetics", title: "Pharmacokinetics + ADME", level: "apprentice", order: 1, pages: ["adme", "halflife-clearance", "steady-state"], prereqs: [], description: "Absorption + distribution + metabolism + excretion, first-order kinetics + half-life + clearance, steady-state with PK-curve viz." },
      { slug: "pharmacodynamics", title: "Pharmacodynamics + Hill", level: "practitioner", order: 2, pages: ["receptor-binding", "agonists-antagonists", "therapeutic-window"], prereqs: [], description: "Hill equation + receptor occupancy, agonists vs antagonists vs partial agonists, therapeutic index + selectivity." },
      { slug: "drug-targets", title: "Drug Targets + Druggability", level: "practitioner", order: 3, pages: ["target-families", "gpcr-kinase", "validation-druggability"], prereqs: [], description: "GPCRs + kinases + ion channels + nuclear + transporters, signaling pathways, target validation + the KRAS G12C breakthrough." },
      { slug: "medicinal-chemistry", title: "Medicinal Chemistry", level: "specialist", order: 4, pages: ["lipinski", "sar-bioisosteres", "prodrugs-modalities"], prereqs: [], description: "Lipinski's Rule of Five, SAR + bioisosteres + chirality, prodrugs + ADCs + covalent + PROTACs." },
      { slug: "drug-development-pipeline", title: "Drug Development Pipeline", level: "specialist", order: 5, pages: ["preclinical", "phases-1-2-3", "accelerated-pathways"], prereqs: [], description: "IND + preclinical, Phase I/II/III + endpoints + biomarkers, accelerated approval + RWE + companion diagnostics." },
      { slug: "clinical-pharmacology", title: "Clinical Pharmacology + DDIs", level: "specialist", order: 6, pages: ["ddi", "polypharmacy-beers", "pharmacogenomics-tdm"], prereqs: ["pharmacokinetics", "pharmacodynamics"], description: "DDI mechanisms + CYP induction/inhibition, polypharmacy + Beers Criteria + deprescribing, pharmacogenomics + TDM." },
      { slug: "toxicology", title: "Toxicology + Risk", level: "practitioner", order: 7, pages: ["paracelsus", "preclinical-tox", "acetaminophen"], prereqs: [], description: "Dose-response in toxicology, in vitro + in vivo testing + alternatives + risk assessment, acetaminophen + heavy metals + antidotes." },
      { slug: "modern-modalities", title: "Modern Modalities (Biologics, mRNA, CAR-T)", level: "expert", order: 8, pages: ["biologics-mabs", "mrna-lnp", "gene-cell-therapy"], prereqs: ["pharmacokinetics", "drug-development-pipeline"], description: "mAbs + ADCs + bispecifics, mRNA + LNPs (Nobel 2023), gene therapy + CRISPR + CAR-T + cure paradigm." },
    ],
  });

  // P23 — Civil / Structural Engineer path. Structural analysis +
  // concrete + steel + soils + foundations + water + transport +
  // construction management. Uses new beam-deflection viz.
  seedMasteryPath({
    slug: "civil-engineer",
    title: "Civil Engineer",
    description:
      "From structural analysis + shear-moment diagrams (interactive beam-deflection viz) through reinforced concrete + structural steel, soil mechanics + foundations, water resources, transportation, and construction management. The civil + structural engineering stack end-to-end.",
    nodes: [
      { slug: "structural-analysis", title: "Structural Analysis", level: "apprentice", order: 1, pages: ["beams-reactions", "shear-moment", "trusses-frames"], prereqs: [], description: "Reactions + internal forces, shear + moment diagrams (interactive beam viz), trusses + frames + indeterminate." },
      { slug: "concrete-and-rebar", title: "Reinforced Concrete", level: "practitioner", order: 2, pages: ["concrete-mix", "rebar-composite", "prestressed-durability"], prereqs: [], description: "Concrete chemistry + low-carbon, rebar + composite action, pre-stressed + durability." },
      { slug: "steel-design", title: "Structural Steel Design", level: "practitioner", order: 3, pages: ["steel-shapes", "buckling-slenderness", "connections-systems"], prereqs: [], description: "Steel grades + shapes, column buckling + slenderness, connections + lateral systems." },
      { slug: "soil-mechanics", title: "Soil Mechanics", level: "practitioner", order: 4, pages: ["soil-classification", "effective-stress", "consolidation"], prereqs: [], description: "Soil classification + properties, Terzaghi effective stress + liquefaction, consolidation + settlement." },
      { slug: "foundations", title: "Foundations", level: "specialist", order: 5, pages: ["shallow-deep", "bearing-capacity", "pile-design"], prereqs: ["soil-mechanics"], description: "Shallow vs deep, bearing capacity, pile types + group effects + load testing." },
      { slug: "water-resources", title: "Water Resources", level: "practitioner", order: 6, pages: ["hydro-cycle", "manning-channels", "treatment-distribution"], prereqs: [], description: "Hydrologic cycle + budgets, pipe + open-channel + Manning, water treatment + distribution + aging." },
      { slug: "transportation-engineering", title: "Transportation Engineering", level: "specialist", order: 7, pages: ["geometric-design", "pavement-traffic-flow", "transit-av"], prereqs: [], description: "Highway geometric design, pavement + traffic flow, transit + AV + urban transformation." },
      { slug: "construction-management", title: "Construction Management", level: "expert", order: 8, pages: ["delivery-lifecycle", "cpm-evm", "cost-risk"], prereqs: [], description: "Project delivery methods, CPM + earned value, cost estimation + risk + megaprojects." },
    ],
  });

  // P22 — Mechanical Engineer path. Statics, dynamics, thermo,
  // fluids, heat transfer, machine design, manufacturing,
  // mechatronics. Thermo lesson uses new carnot-cycle viz.
  seedMasteryPath({
    slug: "mechanical-engineer",
    title: "Mechanical Engineer",
    description:
      "From statics + stress through kinematics + dynamics + Lagrangian methods, thermodynamics + the Carnot cycle (interactive viz), fluid mechanics + Reynolds, heat transfer, machine design + gears + bearings, manufacturing processes + DFM, and mechatronics + PID control. The mechanical-engineering stack end-to-end.",
    nodes: [
      { slug: "statics-and-stress", title: "Statics + Stress", level: "apprentice", order: 1, pages: ["equilibrium", "stress-strain", "concentrations"], prereqs: [], description: "Static equilibrium + FBDs, stress + strain + Hooke's law, beam bending + stress concentrations." },
      { slug: "kinematics-and-dynamics", title: "Kinematics + Dynamics", level: "practitioner", order: 2, pages: ["kinematics", "newton-forces", "rotational-lagrangian"], prereqs: [], description: "Position-velocity-acceleration, Newton's laws + force analysis, rotational dynamics + Lagrangian methods." },
      { slug: "thermodynamics-engineering", title: "Thermodynamics + Carnot", level: "practitioner", order: 3, pages: ["thermo-laws", "carnot-cycle", "refrigeration"], prereqs: [], description: "Three laws of thermodynamics, Carnot cycle (interactive P-V viz), real engine cycles + heat pumps." },
      { slug: "fluid-mechanics", title: "Fluid Mechanics", level: "practitioner", order: 4, pages: ["bernoulli", "reynolds-laminar-turbulent", "pipe-flow"], prereqs: [], description: "Bernoulli + the energy equation, Reynolds + laminar vs turbulent, pipe flow + pumps + drag." },
      { slug: "heat-transfer", title: "Heat Transfer", level: "practitioner", order: 5, pages: ["three-modes", "heat-exchangers", "insulation"], prereqs: ["thermodynamics-engineering"], description: "Conduction + convection + radiation, heat exchangers + effectiveness-NTU, insulation + R-values + passive house." },
      { slug: "machine-design", title: "Machine Design", level: "specialist", order: 6, pages: ["elements", "gears", "bearings-fasteners"], prereqs: ["statics-and-stress"], description: "Machine elements + design process, gears + ratios, bearings + fasteners + joint design." },
      { slug: "manufacturing-processes", title: "Manufacturing Processes", level: "practitioner", order: 7, pages: ["forming-machining", "cnc-modern", "dfm-additive"], prereqs: [], description: "Forming + machining + additive, CNC + Industry 4.0, Design for Manufacturing + additive revolution." },
      { slug: "mechatronics-and-control", title: "Mechatronics + Control", level: "specialist", order: 8, pages: ["sensors-actuators", "pid-control", "embedded-real-time"], prereqs: [], description: "Sensors + actuators + power electronics, feedback control + PID tuning, real-time embedded control + Industry 4.0." },
    ],
  });

  // P21 — Renewable Energy Engineer path. Solar + wind +
  // batteries + grid + hydrogen + geothermal + nuclear +
  // economics. Includes a new solar-pv-curve interactive viz.
  seedMasteryPath({
    slug: "renewable-energy-engineer",
    title: "Renewable Energy Engineer",
    description:
      "From photovoltaic physics + I-V curves through wind turbine aerodynamics, Li-ion + flow batteries, grid integration + frequency control, green hydrogen + fuel cells, geothermal + hydro, nuclear fission + fusion, and LCOE + carbon pricing. The full clean-energy engineering stack.",
    nodes: [
      { slug: "solar-pv-fundamentals", title: "Solar PV Fundamentals", level: "apprentice", order: 1, pages: ["pv-effect", "iv-mpp", "balance-of-system"], prereqs: [], description: "Photovoltaic effect + Shockley-Queisser, I-V curve + MPPT (interactive viz), system design + balance-of-system." },
      { slug: "wind-energy", title: "Wind Energy", level: "practitioner", order: 2, pages: ["betz-limit", "turbine-architecture", "wind-farms"], prereqs: [], description: "Wind power equation + Betz limit, turbine components + gearbox vs direct-drive, wind farms + wake effects + grid integration." },
      { slug: "battery-storage", title: "Battery Storage", level: "practitioner", order: 3, pages: ["lion-chemistry", "c-rate-cycle", "grid-storage"], prereqs: [], description: "Li-ion chemistry (LFP/NMC), C-rate + cycle life, grid-scale storage + flow batteries + emerging chemistries." },
      { slug: "grid-integration", title: "Grid Integration", level: "specialist", order: 4, pages: ["freq-voltage", "transmission", "duck-curve"], prereqs: ["solar-pv-fundamentals", "wind-energy"], description: "Frequency + voltage stability, HVDC + smart grids, duck-curve + inertia + grid-forming inverters." },
      { slug: "hydrogen-economy", title: "Hydrogen Economy", level: "specialist", order: 5, pages: ["h2-production", "electrolysis", "fuel-cells-uses"], prereqs: [], description: "Gray/blue/green H₂, electrolysis (AEL/PEM/SOE), fuel cells + heavy transport + industrial uses." },
      { slug: "geothermal-and-hydro", title: "Geothermal + Hydro", level: "practitioner", order: 6, pages: ["geothermal-egs", "hydroelectric", "pumped-storage"], prereqs: [], description: "Geothermal heat + EGS breakthroughs, hydroelectric power + types, pumped storage + tidal + complementarity." },
      { slug: "nuclear-fundamentals", title: "Nuclear Fission + Fusion", level: "specialist", order: 7, pages: ["fission-chain", "reactor-generations", "safety-fusion"], prereqs: [], description: "Fission + chain reaction control, Gen II/III/IV + SMRs, safety + waste + ITER + NIF fusion." },
      { slug: "energy-economics-and-policy", title: "Energy Economics + Policy", level: "expert", order: 8, pages: ["lcoe", "carbon-pricing", "transition-pathway"], prereqs: ["solar-pv-fundamentals", "wind-energy", "battery-storage"], description: "Levelized Cost of Energy (LCOE), carbon pricing + ETS, energy markets + transition pathways." },
    ],
  });

  // P20 — Materials Scientist path. Crystal structure + defects
  // + mechanical properties + phase diagrams + electronic +
  // polymers + composites + characterization.
  seedMasteryPath({
    slug: "materials-scientist",
    title: "Materials Scientist",
    description:
      "From crystal structure + Bravais lattices through defects + dislocations, mechanical properties + fracture, phase diagrams + heat treatment, band theory + semiconductors, polymer architecture, composites + metamaterials, and XRD / SEM / TEM characterization. The materials-science stack end-to-end.",
    nodes: [
      { slug: "crystal-structure-and-symmetry", title: "Crystal Structure + Symmetry", level: "apprentice", order: 1, pages: ["bravais-lattices", "miller-indices", "close-packing"], prereqs: [], description: "7 crystal systems + 14 Bravais lattices, Miller indices for planes + directions, FCC/BCC/HCP + close packing." },
      { slug: "defects-and-microstructure", title: "Defects + Microstructure", level: "practitioner", order: 2, pages: ["point-defects", "dislocations", "grain-boundaries"], prereqs: ["crystal-structure-and-symmetry"], description: "Point + line + planar defects, dislocation glide + Burgers vectors, grain boundaries + Hall-Petch." },
      { slug: "mechanical-properties", title: "Mechanical Properties + Fracture", level: "practitioner", order: 3, pages: ["stress-strain", "ductile-brittle", "fatigue-griffith"], prereqs: ["defects-and-microstructure"], description: "Stress-strain + Young's modulus, ductile vs brittle (DBTT, Liberty Ships), fatigue + Griffith fracture toughness." },
      { slug: "phase-diagrams-and-thermodynamics", title: "Phase Diagrams + Thermo", level: "practitioner", order: 4, pages: ["gibbs-free-energy", "binary-eutectic", "heat-treatment"], prereqs: ["crystal-structure-and-symmetry"], description: "Gibbs free energy + phase rule, binary phase diagrams + lever rule, heat treatment + martensite + precipitation." },
      { slug: "electronic-properties", title: "Electronic Properties + Semiconductors", level: "specialist", order: 5, pages: ["band-theory", "doping-pn", "solar-leds"], prereqs: ["crystal-structure-and-symmetry"], description: "Band theory + Fermi level, n/p doping + transistors, solar cells + LEDs + wide-bandgap power devices." },
      { slug: "polymers-and-soft-matter", title: "Polymers + Soft Matter", level: "practitioner", order: 6, pages: ["polymer-structure", "tg-crystallinity", "thermosets"], prereqs: [], description: "Polymer architecture + synthesis, glass transition + crystallinity, thermoplastics vs thermosets vs elastomers." },
      { slug: "composites-and-engineered-materials", title: "Composites + Engineered Materials", level: "practitioner", order: 7, pages: ["composite-types", "rule-of-mixtures", "metamaterials"], prereqs: ["mechanical-properties", "polymers-and-soft-matter"], description: "PMC/MMC/CMC, rule of mixtures + anisotropy, foams + auxetics + metamaterials + 3D-printed lattices." },
      { slug: "characterization-techniques", title: "Characterization Techniques", level: "specialist", order: 8, pages: ["xrd-bragg", "sem-tem-afm", "spectroscopy"], prereqs: ["crystal-structure-and-symmetry"], description: "XRD + Bragg's law, SEM + TEM + AFM electron microscopy, XPS + FTIR + NMR spectroscopy." },
    ],
  });

  // P19 — Aerospace Engineer path. Orbital mechanics, aero,
  // propulsion, structures, flight dynamics + control,
  // re-entry, spacecraft, GNC. The full aerospace stack.
  seedMasteryPath({
    slug: "aerospace-engineer",
    title: "Aerospace Engineer",
    description:
      "From Kepler + vis-viva orbital mechanics through aerodynamics + compressibility, the Tsiolkovsky rocket equation, structural design + fatigue, fly-by-wire flight control, atmospheric reentry + heat shields, spacecraft subsystems, and GNC + Kalman filtering. The aerospace stack end-to-end.",
    nodes: [
      { slug: "orbital-mechanics", title: "Orbital Mechanics", level: "apprentice", order: 1, pages: ["kepler-laws", "vis-viva", "hohmann"], prereqs: [], description: "Kepler's three laws, vis-viva + orbital energy, Hohmann transfer + delta-v budgets." },
      { slug: "aerodynamics", title: "Aerodynamics", level: "practitioner", order: 2, pages: ["bernoulli-lift-drag", "compressibility-mach", "boundary-layer"], prereqs: [], description: "Bernoulli + lift/drag/stall, subsonic/transonic/supersonic/hypersonic regimes, boundary layer + Reynolds." },
      { slug: "propulsion", title: "Propulsion + Rocket Equation", level: "practitioner", order: 3, pages: ["tsiolkovsky", "isp-thrust", "jets-rockets"], prereqs: ["orbital-mechanics"], description: "Tsiolkovsky equation derivation + the tyranny of mass ratio, specific impulse + thrust-to-weight, jet vs rocket vs ion." },
      { slug: "structures-and-materials", title: "Aero Structures + Materials", level: "practitioner", order: 4, pages: ["load-paths", "fatigue", "composites"], prereqs: [], description: "Load paths + safety factors, fatigue (Comet, Aloha 243), composites + advanced alloys + 3D printing." },
      { slug: "flight-dynamics-and-control", title: "Flight Dynamics + Control", level: "specialist", order: 5, pages: ["six-dof", "stability", "fly-by-wire"], prereqs: ["aerodynamics"], description: "Six DOF + control surfaces, static + dynamic stability + modes, fly-by-wire + envelope protection." },
      { slug: "atmospheric-reentry", title: "Atmospheric Reentry + EDL", level: "expert", order: 6, pages: ["reentry-physics", "ballistic-lifting", "heat-shields"], prereqs: ["aerodynamics", "structures-and-materials"], description: "Reentry kinetic energy + plasma sheath, ballistic vs lifting vs skip reentry, ablative vs reusable heat shields." },
      { slug: "spacecraft-design", title: "Spacecraft Subsystems", level: "specialist", order: 7, pages: ["subsystems", "power-thermal", "comms-dsn"], prereqs: ["orbital-mechanics"], description: "Bus + payload, ADCS + propulsion + structure, power + thermal + comms budgets." },
      { slug: "avionics-and-guidance", title: "Avionics + GNC + Kalman", level: "expert", order: 8, pages: ["gnc-stack", "kalman-filter", "ins-gps"], prereqs: ["flight-dynamics-and-control", "spacecraft-design"], description: "Guidance/Navigation/Control stack, Kalman filter + sensor fusion, INS + GPS + visual-inertial." },
    ],
  });

  // P18 — Audio Engineer / Music Producer path. Acoustics +
  // psychoacoustics, digital audio + DSP, mixing + dynamics,
  // synthesis, mastering + LUFS, spatial audio, DAWs + plugins.
  seedMasteryPath({
    slug: "audio-engineer",
    title: "Audio Engineer",
    description:
      "From acoustic + psychoacoustic foundations through Nyquist sampling, FFT-based DSP, EQ + compression mixing, subtractive + FM + wavetable synthesis, LUFS-aware mastering, binaural + Atmos spatial audio, and DAW + plugin ecosystems. Music production + audio engineering end-to-end.",
    nodes: [
      { slug: "acoustics-and-psychoacoustics", title: "Acoustics + Psychoacoustics", level: "apprentice", order: 1, pages: ["sound-waves-spl", "equal-loudness", "masking-critical-bands"], prereqs: [], description: "Sound wave properties + SPL, Fletcher-Munson equal-loudness contours, auditory masking + critical bands." },
      { slug: "digital-audio-fundamentals", title: "Digital Audio Fundamentals", level: "practitioner", order: 2, pages: ["nyquist-sampling", "bit-depth-dither", "aliasing"], prereqs: ["acoustics-and-psychoacoustics"], description: "Nyquist-Shannon sampling, bit depth + dynamic range + dithering, aliasing + oversampling." },
      { slug: "dsp-and-fft", title: "DSP + FFT", level: "practitioner", order: 3, pages: ["fft", "spectrogram-stft", "fir-iir"], prereqs: ["digital-audio-fundamentals"], description: "DFT/FFT + frequency resolution, spectrogram + STFT + mel-spec, FIR vs IIR digital filters." },
      { slug: "mixing-and-dynamics", title: "Mixing + Dynamics", level: "specialist", order: 4, pages: ["mixing-workflow", "eq", "compression"], prereqs: ["dsp-and-fft"], description: "Mixing workflow + gain staging, EQ + frequency tuning, compression + side-chain + parallel processing." },
      { slug: "synthesis-techniques", title: "Synthesis Techniques", level: "specialist", order: 5, pages: ["subtractive-analog", "fm-additive-wavetable", "polyphony"], prereqs: ["dsp-and-fft"], description: "Subtractive analog synthesis, FM + additive + wavetable + granular, polyphony + voice management." },
      { slug: "mastering", title: "Mastering + LUFS", level: "expert", order: 6, pages: ["loudness-war-lufs", "mastering-chain", "delivery-formats"], prereqs: ["mixing-and-dynamics"], description: "LUFS + the end of the loudness war, mastering chain (EQ + multi-band + saturation + limiter), delivery formats (CD, streaming, vinyl)." },
      { slug: "spatial-audio", title: "Spatial Audio (Stereo + Atmos + Binaural)", level: "specialist", order: 7, pages: ["stereo-perception", "surround-atmos", "binaural-hrtf"], prereqs: ["acoustics-and-psychoacoustics"], description: "Stereo perception + ITD/ILD, surround + Dolby Atmos object-based, binaural rendering via HRTF + VR." },
      { slug: "music-tech-and-daws", title: "Music Tech + DAWs", level: "specialist", order: 8, pages: ["daw-overview", "midi", "plugin-ecosystem"], prereqs: ["digital-audio-fundamentals"], description: "DAWs (Logic / Pro Tools / Live / FL), MIDI + MPE, plugin formats + ecosystem + AI tools." },
    ],
  });

  // P17 — UX Designer path. Design-discipline complement to
  // frontend-engineer: research, IA, interaction principles,
  // typography, prototyping, usability, design systems,
  // metrics + experimentation.
  seedMasteryPath({
    slug: "ux-designer",
    title: "UX Designer",
    description:
      "From qualitative + quantitative user research through information architecture, Norman's interaction principles + Fitts's Law, typography + color systems, Figma prototyping, usability testing + SUS, design tokens + atomic design, and HEART metrics + A/B testing. The UX-design discipline end-to-end.",
    nodes: [
      { slug: "user-research-and-interviews", title: "User Research + Interviews", level: "apprentice", order: 1, pages: ["qual-vs-quant", "contextual-jbd", "samples-bias"], prereqs: [], description: "Qualitative vs quantitative methods, contextual inquiry + jobs-to-be-done, sample-size + bias mitigation." },
      { slug: "information-architecture", title: "Information Architecture", level: "practitioner", order: 2, pages: ["ia-fundamentals", "card-sort-tree-test", "nav-patterns"], prereqs: ["user-research-and-interviews"], description: "IA principles, card sorting + tree testing, navigation patterns + Hick's Law." },
      { slug: "interaction-design-principles", title: "Interaction Design Principles", level: "practitioner", order: 3, pages: ["norman-principles", "feedback-patterns", "fitts-sizing"], prereqs: ["user-research-and-interviews"], description: "Norman's principles (affordances, mappings, feedback, constraints), feedback latency rules, Fitts's Law + control sizing." },
      { slug: "visual-design-typography", title: "Visual Design + Typography", level: "practitioner", order: 4, pages: ["typography", "hierarchy-grids", "color-accessibility"], prereqs: [], description: "Typography fundamentals, hierarchy + whitespace + grids, color systems + WCAG accessibility." },
      { slug: "wireframing-and-prototyping", title: "Wireframing + Prototyping", level: "specialist", order: 5, pages: ["fidelity", "figma-workflow", "interactive-handoff"], prereqs: ["interaction-design-principles"], description: "Low + mid + high fidelity, Figma workflow + components + variants, interactive prototyping + dev handoff." },
      { slug: "usability-testing", title: "Usability Testing", level: "specialist", order: 6, pages: ["test-protocol", "think-aloud", "sus-metrics"], prereqs: ["user-research-and-interviews"], description: "Usability-test protocol, think-aloud method, task success + SUS + HEART metrics." },
      { slug: "design-systems-and-tokens", title: "Design Systems + Tokens", level: "specialist", order: 7, pages: ["design-systems", "tokens-themes", "atomic-design"], prereqs: ["visual-design-typography", "wireframing-and-prototyping"], description: "Design-system structure, design tokens for theming + accessibility, atomic-design hierarchy." },
      { slug: "ux-metrics-and-experimentation", title: "UX Metrics + Experimentation", level: "expert", order: 8, pages: ["heart-framework", "ab-testing", "goodhart-dark-patterns"], prereqs: ["usability-testing", "user-research-and-interviews"], description: "Google HEART framework, A/B test design + sample sizes, Goodhart's Law + dark patterns + ethical metrics." },
    ],
  });

  // P16 — Game Developer path. Real-time interactive systems:
  // loop, rendering, shaders, physics, AI, networking, animation,
  // engines + build.
  seedMasteryPath({
    slug: "game-developer",
    title: "Game Developer",
    description:
      "From game loops + ECS architecture through GPU rendering, PBR shaders, rigid-body physics, FSM/BT/GOAP game AI, rollback multiplayer netcode, skeletal animation, and engine + build pipelines. Real-time interactive systems end-to-end.",
    nodes: [
      { slug: "game-loop-and-architecture", title: "Game Loop + Architecture", level: "apprentice", order: 1, pages: ["frame-budget", "fixed-variable-timestep", "ecs"], prereqs: [], description: "Fixed vs variable timestep, frame-time budgeting, ECS + data-oriented design." },
      { slug: "rendering-pipeline", title: "GPU Rendering Pipeline", level: "practitioner", order: 2, pages: ["pipeline-stages", "forward-deferred", "culling-batching"], prereqs: ["game-loop-and-architecture"], description: "Vertex/fragment pipeline, MVP transformations, forward vs deferred, culling + draw-call batching." },
      { slug: "shaders-and-glsl", title: "Shaders + GLSL", level: "practitioner", order: 3, pages: ["shader-languages", "pbr-microfacet", "shader-optimization"], prereqs: ["rendering-pipeline"], description: "Vertex/fragment shaders in GLSL/HLSL, PBR Cook-Torrance microfacet, GPU warp divergence + optimization." },
      { slug: "physics-and-collision", title: "Physics + Collision", level: "practitioner", order: 4, pages: ["rigid-integration", "collision-detection", "constraint-solvers"], prereqs: ["game-loop-and-architecture"], description: "Symplectic Euler / Verlet integration, broad-phase + narrow-phase collision (SAT/GJK), iterative impulse solvers." },
      { slug: "game-ai-and-fsm", title: "Game AI (FSM, BT, GOAP)", level: "specialist", order: 5, pages: ["fsm-bt", "astar-navmesh", "goap-utility"], prereqs: ["game-loop-and-architecture"], description: "Finite-state machines + behavior trees, A* + navigation meshes, GOAP planning + utility AI." },
      { slug: "networking-and-multiplayer", title: "Networking + Multiplayer", level: "specialist", order: 6, pages: ["client-server-p2p", "rollback-lockstep", "lag-compensation"], prereqs: ["game-loop-and-architecture"], description: "Client-server vs P2P, lockstep + rollback netcode (GGPO), client-side prediction + lag compensation." },
      { slug: "animation-and-skeletal", title: "Skeletal Animation", level: "specialist", order: 7, pages: ["lbs-skinning", "fk-ik", "state-machines-blending"], prereqs: ["rendering-pipeline"], description: "Linear blend skinning, forward + inverse kinematics, animation state machines + blend trees, motion matching." },
      { slug: "game-engines-and-build", title: "Game Engines + Build Pipeline", level: "expert", order: 8, pages: ["unreal-unity-godot", "asset-pipeline", "live-ops"], prereqs: ["game-loop-and-architecture", "rendering-pipeline"], description: "Unity/Unreal/Godot/custom engines, asset cooking + multi-platform builds, live-service operations + monetization." },
    ],
  });

  // P15 — Hardware Engineer path. Digital logic, RTL/HDL, CPU
  // microarchitecture, memory + interconnect, FPGA, ASIC flow,
  // ML accelerators. Complements compiler-engineer + systems-
  // engineer + ml-engineer with the hardware layer.
  seedMasteryPath({
    slug: "hardware-engineer",
    title: "Hardware Engineer",
    description:
      "From Boolean logic + flip-flops through RTL/Verilog, CPU pipelines + branch prediction, cache hierarchies + DRAM/NAND, FPGA architecture + place-and-route, the ASIC RTL-to-GDSII flow, high-speed SerDes + NoCs, and ML accelerators (GPU SMs, TPU systolic arrays, roofline analysis). The full hardware stack.",
    nodes: [
      { slug: "digital-logic", title: "Digital Logic", level: "apprentice", order: 1, pages: ["gates-boolean", "comb-blocks", "flip-flops-timing"], prereqs: [], description: "Gates + Boolean algebra, combinational blocks (adder/MUX/decoder), flip-flops + setup/hold timing." },
      { slug: "rtl-and-hdl", title: "RTL + Hardware Description Languages", level: "practitioner", order: 2, pages: ["verilog-vhdl", "behavioral-structural", "blocking-nonblocking"], prereqs: ["digital-logic"], description: "Verilog/VHDL syntax, behavioral vs structural RTL, always blocks + blocking vs non-blocking semantics." },
      { slug: "cpu-microarchitecture", title: "CPU Microarchitecture", level: "practitioner", order: 3, pages: ["five-stage-pipeline", "hazards-forwarding", "branch-prediction"], prereqs: ["digital-logic", "rtl-and-hdl"], description: "Classical 5-stage pipeline, data + control hazards, branch prediction + speculative execution + Spectre." },
      { slug: "memory-systems-hw", title: "Memory Systems Hardware", level: "practitioner", order: 4, pages: ["cache-hierarchy", "dram-sram", "nand-flash"], prereqs: ["digital-logic"], description: "Cache hierarchy + AMAT, DRAM/SRAM/HBM, NAND flash + SSD trade-offs." },
      { slug: "fpga-design", title: "FPGA Design", level: "specialist", order: 5, pages: ["lut-bram-dsp", "fpga-flow", "fpga-applications"], prereqs: ["rtl-and-hdl"], description: "LUTs/BRAMs/DSPs, place-and-route + timing closure, FPGA in networking + radar + ML." },
      { slug: "asic-design-flow", title: "ASIC Design Flow (RTL→GDSII)", level: "specialist", order: 6, pages: ["asic-flow", "verification", "tape-out"], prereqs: ["rtl-and-hdl"], description: "RTL-to-GDSII flow (synthesis, P&R, STA, DRC, LVS), UVM + functional verification, process nodes + tape-out economics." },
      { slug: "high-speed-interconnect", title: "High-Speed Interconnect", level: "specialist", order: 7, pages: ["serdes", "pcie-cxl", "noc"], prereqs: ["digital-logic"], description: "SerDes electrical + encoding, PCIe/DDR/CXL/HBM, NoC topologies + cache coherence." },
      { slug: "accelerators-and-systolic", title: "Accelerators + Systolic Arrays", level: "expert", order: 8, pages: ["gpu-sm-tensor", "tpu-systolic", "roofline"], prereqs: ["digital-logic", "memory-systems-hw"], description: "GPU SM + tensor cores, TPU systolic array, roofline + arithmetic-intensity model." },
    ],
  });

  // P14 — Neuroscientist path. Brain + cognition complement to
  // ml-engineer / ai-researcher: neurons, synapses, coding,
  // anatomy, imaging, computational models, decision-making,
  // consciousness.
  seedMasteryPath({
    slug: "neuroscientist",
    title: "Neuroscientist",
    description:
      "From single neurons through synaptic plasticity, neural coding, brain anatomy + circuits, neuroimaging modalities, computational models, decision-making + cognition, and consciousness. The brain + behavior end-to-end.",
    nodes: [
      { slug: "neurons-and-action-potentials", title: "Neurons + Action Potentials", level: "apprentice", order: 1, pages: ["resting-potential", "hodgkin-huxley", "refractory"], prereqs: [], description: "Nernst equation, Hodgkin-Huxley mechanism, refractory periods, channel pharmacology." },
      { slug: "synapses-and-plasticity", title: "Synapses + Plasticity", level: "practitioner", order: 2, pages: ["chemical-electrical", "ltp-nmda", "stdp-hebb"], prereqs: ["neurons-and-action-potentials"], description: "Chemical vs electrical synapses, neurotransmitters + receptors, LTP/LTD via NMDA, STDP + Hebb's rule." },
      { slug: "neural-coding", title: "Neural Coding + Information", level: "practitioner", order: 3, pages: ["rate-temporal", "population-codes", "shannon-info"], prereqs: ["neurons-and-action-potentials"], description: "Rate vs temporal codes, population vectors + Bayesian decoding, mutual information + sparse coding." },
      { slug: "brain-anatomy-and-circuits", title: "Brain Anatomy + Circuits", level: "practitioner", order: 4, pages: ["divisions-lobes", "cortical-column", "hippocampus-bg-cerebellum"], prereqs: ["neurons-and-action-potentials"], description: "Major brain divisions, canonical 6-layer cortical column, hippocampus + basal ganglia + cerebellum roles." },
      { slug: "neuroimaging", title: "Neuroimaging", level: "specialist", order: 5, pages: ["fmri-eeg-meg", "bold-interpretation", "bci-prosthetics"], prereqs: ["brain-anatomy-and-circuits"], description: "fMRI / EEG / MEG / ECoG / calcium tradeoffs, BOLD interpretation + reverse-inference fallacy, BCIs + prosthetics." },
      { slug: "computational-neuroscience", title: "Computational Neuroscience", level: "specialist", order: 6, pages: ["lif-models", "hopfield-attractors", "neuro-ai"], prereqs: ["neurons-and-action-potentials"], description: "Integrate-and-fire models, attractor + Hopfield networks, what biological vs artificial NNs share + differ." },
      { slug: "decision-making-and-cognition", title: "Decision-Making + Cognition", level: "expert", order: 7, pages: ["drift-diffusion", "value-vmpfc", "explore-exploit"], prereqs: ["brain-anatomy-and-circuits"], description: "Drift-diffusion model + LIP accumulator, value coding in vmPFC + prospect theory, exploration vs exploitation foraging." },
      { slug: "consciousness-and-attention", title: "Consciousness + Attention", level: "expert", order: 8, pages: ["gwt-iit-hot", "attention-types", "binding-ncc"], prereqs: ["brain-anatomy-and-circuits"], description: "Theories of consciousness (GWT, IIT, HOT), attention vs awareness, binding problem + neural correlates of consciousness." },
    ],
  });

  // P13 — Climate Scientist path. Earth-system science:
  // atmospheric + ocean physics, carbon cycle, climate models,
  // paleoclimate, extreme-event attribution, mitigation, tipping.
  seedMasteryPath({
    slug: "climate-scientist",
    title: "Climate Scientist",
    description:
      "From atmospheric radiative balance through ocean circulation, carbon cycle, GCM modeling, paleoclimate proxies, extreme-event attribution, mitigation pathways, and tipping-point adaptation. Earth-system science end-to-end.",
    nodes: [
      { slug: "atmospheric-physics", title: "Atmospheric Physics", level: "apprentice", order: 1, pages: ["radiative-balance", "greenhouse-effect", "vertical-structure"], prereqs: [], description: "Earth's effective temperature from radiative balance, greenhouse gases + radiative forcing, troposphere/stratosphere/lapse rates." },
      { slug: "ocean-circulation", title: "Ocean Circulation", level: "practitioner", order: 2, pages: ["wind-thc", "amoc", "enso"], prereqs: ["atmospheric-physics"], description: "Wind-driven gyres + Ekman transport, thermohaline circulation + AMOC, El Niño / La Niña + global teleconnections." },
      { slug: "carbon-cycle", title: "The Carbon Cycle", level: "practitioner", order: 3, pages: ["reservoirs-fluxes", "co2-lifetime", "ocean-acidification"], prereqs: ["atmospheric-physics"], description: "Atmosphere/ocean/land reservoirs + fluxes, CO₂ lifetime spectrum + the long tail, ocean acidification + biological feedbacks." },
      { slug: "climate-models", title: "General Circulation Models", level: "specialist", order: 4, pages: ["gcm-structure", "parameterizations", "cmip-ensembles"], prereqs: ["atmospheric-physics", "ocean-circulation"], description: "GCM/AGCM/OGCM/ESM structure, sub-grid parameterizations, multi-model ensembles + uncertainty quantification." },
      { slug: "paleoclimate-proxies", title: "Paleoclimate Proxies", level: "specialist", order: 5, pages: ["ice-cores-trees", "milankovitch", "petm-warm-worlds"], prereqs: ["atmospheric-physics", "carbon-cycle"], description: "Ice cores + tree rings + sediments + corals, Milankovitch cycles + glacial-interglacial, deep-time analogs (Pliocene, PETM)." },
      { slug: "extreme-events-and-attribution", title: "Extreme Events + Attribution", level: "specialist", order: 6, pages: ["extreme-trends", "far-storyline", "insurance-financial"], prereqs: ["climate-models"], description: "Heat / precip / hurricane / fire / drought trends, event-attribution methodology (FAR, storyline), insurance + climate-financial risk." },
      { slug: "mitigation-and-pathways", title: "Mitigation + Emission Pathways", level: "specialist", order: 7, pages: ["ssps", "wedges", "iam-discount-rate"], prereqs: ["carbon-cycle"], description: "RCP → SSP scenarios, carbon budget for 1.5°C/2°C, mitigation wedges, IAMs + the discount-rate debate." },
      { slug: "adaptation-and-tipping-points", title: "Adaptation + Tipping Points", level: "expert", order: 8, pages: ["tipping-elements", "adaptation-strategies", "loss-and-damage"], prereqs: ["climate-models", "ocean-circulation"], description: "Major tipping elements (GIS / WAIS / AMOC / Amazon / corals), adaptation strategies + costs, limits + loss-and-damage." },
    ],
  });

  // P12 — Embedded Systems Engineer path. MCU architecture, RTOS +
  // real-time constraints, bare-metal memory, peripheral drivers,
  // interrupts, power, bootloaders + OTA, safety-critical.
  seedMasteryPath({
    slug: "embedded-systems-engineer",
    title: "Embedded Systems Engineer",
    description:
      "From Cortex-M architecture through real-time scheduling, bare-metal memory + linker scripts, peripheral drivers (UART/SPI/I2C), interrupt design, low-power techniques, secure bootloaders + OTA, and safety-critical certification (ISO 26262, DO-178C). The MCU-engineering toolkit.",
    nodes: [
      { slug: "microcontroller-architecture", title: "Microcontroller Architecture", level: "apprentice", order: 1, pages: ["cortex-m", "registers-vector-table"], prereqs: [], description: "ARM Cortex-M family, register file (R0-R15, MSP/PSP), memory map, vector table + reset sequence." },
      { slug: "real-time-constraints", title: "Real-Time Constraints + Scheduling", level: "practitioner", order: 2, pages: ["hard-firm-soft", "rms-edf", "priority-inversion"], prereqs: ["microcontroller-architecture"], description: "Hard/firm/soft real-time, rate-monotonic scheduling + Liu-Layland bound, priority inversion + the Mars Pathfinder fix." },
      { slug: "memory-and-bare-metal", title: "Memory + Bare-Metal Startup", level: "practitioner", order: 3, pages: ["linker-scripts", "startup", "stack-mpu"], prereqs: ["microcontroller-architecture"], description: "Linker scripts, .text/.data/.bss/.heap/.stack, reset handler, stack overflow + MPU protection." },
      { slug: "peripheral-drivers", title: "Peripheral Drivers (UART/SPI/I2C)", level: "practitioner", order: 4, pages: ["serial-protocols", "memory-mapped-io", "polling-irq-dma"], prereqs: ["microcontroller-architecture"], description: "Serial-protocol comparison, memory-mapped register interfaces, polling vs interrupt-driven vs DMA." },
      { slug: "interrupts-and-isr", title: "Interrupts + ISR Design", level: "specialist", order: 5, pages: ["irq-entry-exit", "nvic-priority", "isr-discipline"], prereqs: ["peripheral-drivers"], description: "Hardware-stacked context, NVIC priority + preemption, worst-case latency analysis, ISR-discipline + producer-consumer pattern." },
      { slug: "power-management", title: "Power Management", level: "specialist", order: 6, pages: ["sleep-modes", "wake-sources", "battery-budget"], prereqs: ["peripheral-drivers"], description: "Cortex-M sleep modes, wake sources + latency, peripheral clock gating + DVFS, battery-budget math." },
      { slug: "bootloaders-and-ota", title: "Bootloaders + OTA Updates", level: "specialist", order: 7, pages: ["bootloader-basics", "ota-protocol", "a-b-partitions"], prereqs: ["memory-and-bare-metal"], description: "Bootloader role + secure boot, OTA download/verify/install protocol, A/B partitioning for fail-safe updates." },
      { slug: "safety-critical-systems", title: "Safety-Critical Systems", level: "expert", order: 8, pages: ["iec-iso-do", "lockstep-redundancy", "misra-static-analysis"], prereqs: ["real-time-constraints", "memory-and-bare-metal"], description: "IEC 61508 / ISO 26262 / DO-178C, lockstep cores + diversity-of-redundancy, MISRA C + qualified toolchains." },
    ],
  });

  // P11 — NLP Linguist path. Linguistics-grounded NLP: tokenization,
  // morphology, syntax, semantics, statistical + neural LMs,
  // translation, multilingual + low-resource. Complements ml-engineer
  // / ai-researcher / multimodal-engineer with a language-aware angle.
  seedMasteryPath({
    slug: "nlp-linguist",
    title: "NLP Linguist",
    description:
      "From subword tokenization through morphological typology, dependency parsing, lexical + distributional semantics, statistical + neural language models, neural translation, and multilingual + low-resource NLP. The linguistics-grounded view of modern NLP.",
    nodes: [
      { slug: "tokenization-and-bpe", title: "Tokenization + BPE", level: "apprentice", order: 1, pages: ["tokenization", "bpe-algorithm"], prereqs: [], description: "Character / word / subword tokenization, BPE + WordPiece + SentencePiece, vocab-size trade-offs." },
      { slug: "morphology-and-typology", title: "Morphology + Language Typology", level: "apprentice", order: 2, pages: ["typology", "morphological-analysis"], prereqs: ["tokenization-and-bpe"], description: "Isolating / fusional / agglutinative / polysynthetic, stemming + lemmatization, why BPE wins for agglutinative languages." },
      { slug: "syntax-and-parsing", title: "Syntax + Dependency Parsing", level: "practitioner", order: 3, pages: ["dependency-grammar", "biaffine-parsing"], prereqs: ["tokenization-and-bpe"], description: "Phrase-structure vs dependency grammar, transition-based + biaffine graph-based parsers, parsing-as-tagging in transformers." },
      { slug: "semantic-representations", title: "Semantic Representations", level: "practitioner", order: 4, pages: ["wordnet", "framenet-srl", "distributional"], prereqs: ["tokenization-and-bpe"], description: "WordNet + FrameNet + semantic-role labeling, distributional semantics, why contextual embeddings won." },
      { slug: "statistical-language-models", title: "Statistical Language Models", level: "practitioner", order: 5, pages: ["n-grams", "smoothing-kn", "perplexity"], prereqs: ["tokenization-and-bpe"], description: "N-gram chain-rule, MLE + smoothing (Laplace, Kneser-Ney), perplexity + cross-entropy." },
      { slug: "neural-embeddings", title: "Neural Word + Sentence Embeddings", level: "specialist", order: 6, pages: ["word2vec", "glove", "elmo-bert"], prereqs: ["statistical-language-models"], description: "Word2Vec skip-gram + negative sampling, GloVe co-occurrence factorization, ELMo + BERT contextual embeddings." },
      { slug: "translation-and-alignment", title: "Machine Translation + Alignment", level: "specialist", order: 7, pages: ["ibm-models", "attention-seq2seq", "bleu-comet"], prereqs: ["neural-embeddings"], description: "IBM word-alignment models, attention as soft alignment, BLEU + COMET evaluation." },
      { slug: "multilingual-and-low-resource", title: "Multilingual + Low-Resource NLP", level: "expert", order: 8, pages: ["mbert-xlmr", "adapters-lora", "long-tail-languages"], prereqs: ["neural-embeddings", "translation-and-alignment"], description: "Multilingual transfer, mBERT + XLM-R + the curse of multilinguality, adapters + LoRA, the long tail of ~7000 languages." },
    ],
  });

  // P10 — Financial Engineer (quant finance) path. Time value of
  // money, no-arb pricing, Black-Scholes, Greeks, Monte Carlo,
  // fixed income, market microstructure, portfolio theory.
  seedMasteryPath({
    slug: "financial-engineer",
    title: "Financial Engineer",
    description:
      "From time value of money through no-arbitrage pricing, Black-Scholes, option Greeks + hedging, Monte Carlo simulation, fixed income, market microstructure, and portfolio theory. The full quant-finance toolkit.",
    nodes: [
      { slug: "time-value-of-money", title: "Time Value of Money", level: "apprentice", order: 1, pages: ["pv-fv", "compounding", "npv"], prereqs: [], description: "Present + future value, discrete vs continuous compounding, NPV + capital budgeting." },
      { slug: "no-arbitrage-pricing", title: "No-Arbitrage Pricing", level: "practitioner", order: 2, pages: ["arbitrage-principle", "risk-neutral", "put-call-parity"], prereqs: ["time-value-of-money"], description: "Replication arguments, FTAP + the risk-neutral measure, put-call parity, forward pricing." },
      { slug: "black-scholes", title: "Black-Scholes Model", level: "specialist", order: 3, pages: ["bsm-formula", "bsm-pde", "implied-vol"], prereqs: ["no-arbitrage-pricing"], description: "BSM assumptions + closed-form, delta-hedging derivation, implied vol + the smile." },
      { slug: "greeks-and-hedging", title: "Greeks + Dynamic Hedging", level: "specialist", order: 4, pages: ["delta-gamma-vega", "gamma-scalping", "vega-risk"], prereqs: ["black-scholes"], description: "The Greeks, dynamic delta-hedging, gamma scalping = the vol trade, vega + vanna risk." },
      { slug: "monte-carlo-finance", title: "Monte Carlo in Finance", level: "specialist", order: 5, pages: ["mc-pricing", "variance-reduction", "lsm-americans"], prereqs: ["black-scholes"], description: "MC for derivative pricing, variance reduction, Longstaff-Schwartz for Americans." },
      { slug: "fixed-income", title: "Fixed Income", level: "specialist", order: 6, pages: ["bond-pricing", "duration-convexity", "yield-curve"], prereqs: ["time-value-of-money"], description: "Bond pricing + YTM, duration + convexity for risk, the yield curve + forward rates." },
      { slug: "market-microstructure", title: "Market Microstructure", level: "expert", order: 7, pages: ["limit-order-book", "spread-impact", "hft"], prereqs: ["no-arbitrage-pricing"], description: "Limit order book, spread + market impact, Kyle's lambda, market makers + HFT." },
      { slug: "portfolio-theory", title: "Portfolio Theory", level: "specialist", order: 8, pages: ["markowitz", "capm", "factor-models"], prereqs: ["time-value-of-money"], description: "Markowitz mean-variance, CAPM + the SML, Fama-French + factor models." },
    ],
  });

  // P9 — Compiler Engineer path. Lexing, parsing, ASTs, types,
  // SSA IR, optimization passes, register allocation, JIT. Sits
  // beneath algorithms-engineer + systems-engineer.
  seedMasteryPath({
    slug: "compiler-engineer",
    title: "Compiler Engineer",
    description:
      "From lexical analysis through parsing, ASTs, type systems, SSA-form IR, optimization passes, register allocation, and JIT runtime. The full compiler pipeline as practiced in production toolchains (clang, rustc, V8, HotSpot).",
    nodes: [
      { slug: "lexical-analysis", title: "Lexical Analysis", level: "apprentice", order: 1, pages: ["regex-nfa-dfa", "maximal-munch"], prereqs: [], description: "Regex → NFA → DFA via Thompson + subset construction, maximal-munch rule, hand-written vs generated lexers." },
      { slug: "parsing-strategies", title: "Parsing Strategies", level: "practitioner", order: 2, pages: ["ll-vs-lr", "pratt-parsing", "error-recovery"], prereqs: ["lexical-analysis"], description: "LL vs LR, recursive descent, Pratt parsing for expression precedence, error recovery for IDEs." },
      { slug: "abstract-syntax-trees", title: "Abstract Syntax Trees", level: "practitioner", order: 3, pages: ["ast-design", "visitor-pattern", "source-positions"], prereqs: ["parsing-strategies"], description: "AST vs CST, discriminated-union node types, visitor pattern, source position spans for diagnostics." },
      { slug: "type-systems", title: "Type Systems (Hindley-Milner)", level: "specialist", order: 4, pages: ["hindley-milner", "unification", "polymorphism"], prereqs: ["abstract-syntax-trees"], description: "Hindley-Milner principal types, unification + occurs-check, parametric vs ad-hoc vs subtype polymorphism." },
      { slug: "ir-and-ssa", title: "IR + SSA Form", level: "specialist", order: 5, pages: ["llvm-ir", "ssa", "dominance-frontier"], prereqs: ["abstract-syntax-trees"], description: "Why an IR, SSA invariant + φ-functions, dominators + dominance frontiers (Cytron et al)." },
      { slug: "optimization-passes", title: "Optimization Passes", level: "specialist", order: 6, pages: ["classical-opts", "inlining", "lto-pgo"], prereqs: ["ir-and-ssa"], description: "Classical passes + ordering, why inlining is #1, LTO + PGO + BOLT." },
      { slug: "codegen-and-registers", title: "Codegen + Register Allocation", level: "expert", order: 7, pages: ["instruction-selection", "graph-coloring", "linear-scan"], prereqs: ["ir-and-ssa"], description: "Instruction selection, register allocation as graph coloring (Chaitin), linear-scan for JITs." },
      { slug: "jit-and-runtime", title: "JIT Compilation + Runtime", level: "expert", order: 8, pages: ["tiered-jit", "deoptimization", "jit-vs-aot"], prereqs: ["codegen-and-registers", "optimization-passes"], description: "Tiered JITs (V8, HotSpot, RyuJIT), speculative type optimization + deopt, JIT vs AOT trade-offs." },
    ],
  });

  // P8 — Cryptographer path. Deeper crypto complement to
  // security-engineer: hash functions, block ciphers, AEAD,
  // public-key primitives, zero-knowledge proofs, post-quantum,
  // password hashing, side-channels.
  seedMasteryPath({
    slug: "cryptographer",
    title: "Cryptographer",
    description:
      "From hash functions through block-cipher design, authenticated encryption, public-key primitives, zero-knowledge proofs, post-quantum schemes, password hashing, and side-channel attacks. The deeper crypto complement to security-engineer.",
    nodes: [
      { slug: "hash-functions", title: "Cryptographic Hash Functions", level: "apprentice", order: 1, pages: ["hash-properties", "hmac", "merkle-trees"], prereqs: [], description: "Preimage / 2nd-preimage / collision resistance, HMAC, Merkle trees, the birthday bound." },
      { slug: "block-cipher-design", title: "Block Cipher Design (AES)", level: "practitioner", order: 2, pages: ["aes-rounds", "confusion-diffusion", "aes-ni"], prereqs: ["hash-functions"], description: "AES round structure, Shannon's confusion + diffusion, constant-time S-boxes, AES-NI." },
      { slug: "authenticated-encryption", title: "Authenticated Encryption (AEAD)", level: "practitioner", order: 3, pages: ["aead", "aes-gcm", "nonce-reuse"], prereqs: ["block-cipher-design"], description: "Why encrypt-then-MAC is the right shape, AES-GCM = CTR + GHASH, nonce-reuse catastrophe, ChaCha20-Poly1305." },
      { slug: "public-key-primitives", title: "Public-Key Primitives", level: "specialist", order: 4, pages: ["diffie-hellman", "rsa", "ecdsa-nonces"], prereqs: ["hash-functions"], description: "DH/ECDH, RSA encrypt vs sign, ECDSA nonce-reuse (PS3 + Bitcoin breaks), X25519." },
      { slug: "zero-knowledge-proofs", title: "Zero-Knowledge Proofs", level: "expert", order: 5, pages: ["zk-properties", "snarks-vs-starks", "schnorr"], prereqs: ["public-key-primitives"], description: "Completeness / soundness / zero-knowledge, SNARKs vs STARKs vs Bulletproofs, zk-rollups." },
      { slug: "post-quantum-cryptography", title: "Post-Quantum Cryptography", level: "expert", order: 6, pages: ["shor", "lattice-lwe", "kyber-dilithium"], prereqs: ["public-key-primitives"], description: "Shor's threat, LWE, Kyber + Dilithium + SPHINCS+, hybrid migration (X25519 + Kyber768)." },
      { slug: "password-hashing", title: "Password Hashing", level: "practitioner", order: 7, pages: ["argon2id", "salts-peppers", "constant-time-cmp"], prereqs: ["hash-functions"], description: "Argon2id memory-hardness, bcrypt / scrypt / PBKDF2 trade-offs, salts, constant-time comparison." },
      { slug: "side-channel-attacks", title: "Side-Channel Attacks", level: "expert", order: 8, pages: ["timing-power-em", "spectre-meltdown", "constant-time-discipline"], prereqs: ["block-cipher-design", "public-key-primitives"], description: "Timing / power / EM / microarchitectural channels, Spectre + Meltdown, constant-time discipline." },
    ],
  });

  // P7 — Operating Systems path. The kernel-level foundation
  // under every other engineering discipline. Sits beneath
  // algorithms-engineer, distributed-systems, systems-engineer,
  // and container-deployment concerns.
  seedMasteryPath({
    slug: "operating-systems",
    title: "Operating Systems",
    description:
      "Processes + threads, virtual memory, file systems, scheduling, synchronization, system calls, interrupts + I/O, and container isolation. The kernel-level foundation under every other engineering discipline.",
    nodes: [
      { slug: "processes-and-threads", title: "Processes & Threads", level: "apprentice", order: 1, pages: ["process-model", "fork-cow"], prereqs: [], description: "Process vs thread, fork() + copy-on-write, the C10K story, modern coroutines." },
      { slug: "virtual-memory", title: "Virtual Memory", level: "practitioner", order: 2, pages: ["page-tables", "tlb", "mmap"], prereqs: ["processes-and-threads"], description: "Page tables, TLB, page faults (minor/major/COW), mmap as a unified abstraction." },
      { slug: "file-systems", title: "File Systems", level: "practitioner", order: 3, pages: ["inodes", "journaling", "fsync"], prereqs: [], description: "Inodes, journaling vs copy-on-write, fsync + group commit, ext4/XFS/ZFS." },
      { slug: "scheduling", title: "Scheduling", level: "practitioner", order: 4, pages: ["cfs", "real-time-scheduling"], prereqs: ["processes-and-threads"], description: "Cooperative vs preemptive, Linux CFS fairness, SCHED_FIFO/RR/DEADLINE for real-time." },
      { slug: "synchronization", title: "Synchronization", level: "specialist", order: 5, pages: ["mutex-rwlock", "futex", "lock-free"], prereqs: ["processes-and-threads"], description: "Mutex/RWLock/spinlock, futex fast-path, lock-free + the ABA problem." },
      { slug: "system-calls", title: "System Calls", level: "specialist", order: 6, pages: ["syscall-abi", "io-uring"], prereqs: ["processes-and-threads"], description: "User/kernel transition, syscall ABI, io_uring as syscall-bypass for high-IOPS." },
      { slug: "interrupts-and-io", title: "Interrupts & I/O", level: "expert", order: 7, pages: ["interrupts", "dma", "polling-vs-interrupt"], prereqs: ["system-calls"], description: "Interrupt-driven I/O, DMA, interrupt coalescing, when polling (DPDK/SPDK) beats interrupts." },
      { slug: "container-isolation", title: "Container Isolation", level: "expert", order: 8, pages: ["namespaces", "cgroups", "microvm"], prereqs: ["processes-and-threads", "virtual-memory", "file-systems"], description: "Containers vs VMs, namespaces + cgroups, the security limits, microvms (Firecracker, Kata)." },
    ],
  });

  // P6 — Frontend Engineer path. Modern web stack: DOM rendering,
  // JS runtime, React, accessibility, performance budgets,
  // TypeScript, testing, build tooling. Complements security,
  // networking, and data-engineer paths.
  seedMasteryPath({
    slug: "frontend-engineer",
    title: "Frontend Engineer",
    description:
      "From browser rendering through React, accessibility, performance budgets, TypeScript, testing, and build tooling. The modern web stack as practiced in 2024-2025.",
    nodes: [
      { slug: "dom-and-rendering", title: "DOM & Rendering Pipeline", level: "apprentice", order: 1, pages: ["dom", "render-pipeline"], prereqs: [], description: "Layout vs paint vs composite. Why transform animations are smooth + others aren't." },
      { slug: "javascript-runtime", title: "JavaScript Runtime", level: "practitioner", order: 2, pages: ["event-loop", "v8-tiers"], prereqs: ["dom-and-rendering"], description: "Event loop, microtasks vs macrotasks, V8's optimization tiers, hidden-class deopts." },
      { slug: "react-and-state", title: "React + State Management", level: "practitioner", order: 3, pages: ["react", "state-colocation"], prereqs: ["javascript-runtime"], description: "UI = f(state), memoization, state colocation, when to use Context vs Zustand." },
      { slug: "accessibility", title: "Accessibility (WCAG)", level: "practitioner", order: 4, pages: ["wcag", "aria"], prereqs: ["dom-and-rendering"], description: "WCAG AA, semantic HTML over ARIA, keyboard navigation, color contrast." },
      { slug: "performance-budgets", title: "Performance Budgets", level: "specialist", order: 5, pages: ["core-web-vitals", "lazy-loading"], prereqs: ["dom-and-rendering", "javascript-runtime"], description: "Core Web Vitals, LCP optimization, code splitting, mobile-first budgets." },
      { slug: "typescript-types", title: "TypeScript Type System", level: "specialist", order: 6, pages: ["structural-typing", "generics"], prereqs: ["javascript-runtime"], description: "Structural typing, generics + inference, narrowing, branded types, intentional unsoundness." },
      { slug: "testing-frontend", title: "Frontend Testing", level: "specialist", order: 7, pages: ["testing-trophy", "testing-library"], prereqs: ["react-and-state"], description: "The testing trophy (integration > unit), Testing Library, Playwright e2e, accessibility-as-tests." },
      { slug: "build-and-bundle", title: "Build & Bundle", level: "expert", order: 8, pages: ["vite", "tree-shaking", "code-splitting"], prereqs: ["javascript-runtime", "typescript-types"], description: "Modern bundlers (Vite, esbuild, Turbopack), tree-shaking, code-splitting, source maps in production." },
    ],
  });

  // P5 — Networking path. The network-stack foundation:
  // IP/TCP/UDP, HTTP/REST, TLS, DNS, CDNs, load balancers,
  // QUIC/HTTP3, network failure modes. Sits beneath every
  // distributed system.
  seedMasteryPath({
    slug: "networking",
    title: "Networking",
    description:
      "From IP+TCP through HTTP/REST, TLS 1.3, DNS, CDNs, load balancing, QUIC + HTTP/3, and network failure modes. The network-stack foundation under every distributed system.",
    nodes: [
      { slug: "ip-and-tcp", title: "IP + TCP", level: "apprentice", order: 1, pages: ["ip-tcp", "bandwidth-delay-product"], prereqs: [], description: "Layer responsibilities, three-way handshake, congestion control, BDP." },
      { slug: "http-and-rest", title: "HTTP & REST", level: "apprentice", order: 2, pages: ["http", "rest-conventions"], prereqs: ["ip-and-tcp"], description: "Methods, status codes, caching headers, idempotency in API design." },
      { slug: "tls-handshake", title: "TLS 1.3", level: "practitioner", order: 3, pages: ["tls13", "0-rtt"], prereqs: ["ip-and-tcp"], description: "TLS 1.3 handshake, cipher suites, 0-RTT, post-quantum migration." },
      { slug: "dns", title: "DNS", level: "apprentice", order: 4, pages: ["dns", "ttl-propagation"], prereqs: [], description: "Resolution path, record types, TTL + propagation, DNSSEC, amplification attacks." },
      { slug: "cdns-and-caching", title: "CDNs & Edge Caching", level: "practitioner", order: 5, pages: ["cdn", "cache-headers"], prereqs: ["http-and-rest", "dns"], description: "Topology, push vs pull, versioned URLs vs purge, hit-ratio math." },
      { slug: "load-balancing", title: "Load Balancing", level: "practitioner", order: 6, pages: ["load-balancing", "consistent-hashing"], prereqs: ["ip-and-tcp"], description: "L4 vs L7, algorithms, health checks, service-mesh patterns." },
      { slug: "quic-and-http3", title: "QUIC & HTTP/3", level: "specialist", order: 7, pages: ["quic", "http3"], prereqs: ["tls-handshake"], description: "UDP-based transport, 0-RTT setup, connection migration, no head-of-line blocking." },
      { slug: "network-failure-modes", title: "Network Failure Modes", level: "expert", order: 8, pages: ["timeouts", "circuit-breaker", "retry-backoff-jitter"], prereqs: ["ip-and-tcp", "load-balancing"], description: "Common failures, timeout discipline, retry + backoff + jitter, circuit breakers, deadline propagation." },
    ],
  });

  // P4 — Database Internals path. Sits beneath data-engineer +
  // distributed-systems. The 'how does the database actually work'
  // foundation: storage engines, indexes, transactions, concurrency,
  // optimization, recovery, distribution.
  seedMasteryPath({
    slug: "database-internals",
    title: "Database Internals",
    description:
      "Storage engines, B-trees + LSM-trees, ACID transactions, MVCC, query optimization, WAL + crash recovery, and distributed-storage architectures. The 'how does the database actually work' foundation.",
    nodes: [
      { slug: "storage-engines", title: "Storage Engines: B-tree vs LSM", level: "apprentice", order: 1, pages: ["storage-engines", "b-tree-vs-lsm"], prereqs: [], description: "Two dominant engine families + the read/write/space amplification trade-offs." },
      { slug: "b-tree-indexes", title: "B+ Tree Indexes", level: "practitioner", order: 2, pages: ["b-plus-tree", "covering-index"], prereqs: ["storage-engines"], description: "Fan-out, height, leaf-linking, index-only scans, covering indexes." },
      { slug: "lsm-trees", title: "LSM Trees in Detail", level: "practitioner", order: 3, pages: ["lsm-tree", "bloom-filter", "compaction"], prereqs: ["storage-engines"], description: "Memtable → SSTable → compaction. Leveled vs tiered. Bloom filters." },
      { slug: "transactions-acid", title: "ACID Transactions", level: "practitioner", order: 4, pages: ["acid", "isolation-levels", "ssi"], prereqs: ["storage-engines"], description: "ACID, isolation levels + their anomalies, Serializable Snapshot Isolation (SSI)." },
      { slug: "mvcc", title: "Multi-Version Concurrency Control", level: "practitioner", order: 5, pages: ["mvcc", "vacuum"], prereqs: ["transactions-acid"], description: "Readers don't block writers; the cost is VACUUM + bloat management." },
      { slug: "query-optimizer", title: "Query Optimizer", level: "specialist", order: 6, pages: ["query-optimizer", "join-order", "cardinality-estimation"], prereqs: ["b-tree-indexes"], description: "Cost-based optimization, join order, cardinality estimation, reading EXPLAIN plans." },
      { slug: "wal-recovery", title: "WAL + Crash Recovery", level: "specialist", order: 7, pages: ["wal", "aries-recovery", "checkpoint"], prereqs: ["transactions-acid"], description: "Write-ahead log invariant, ARIES recovery, checkpoint tuning, point-in-time recovery." },
      { slug: "distributed-storage", title: "Distributed Storage", level: "expert", order: 8, pages: ["shared-nothing", "consensus-replication", "data-placement"], prereqs: ["mvcc", "wal-recovery"], description: "Shared-nothing vs shared-disk, consensus + replication, partitioning, real distributed DBs." },
    ],
  });

  // P3 — Distributed Systems path. The foundation under any
  // multi-node service — ML training infra, data pipelines,
  // production serving. Sits beneath data-engineer + systems-engineer.
  seedMasteryPath({
    slug: "distributed-systems",
    title: "Distributed Systems",
    description:
      "From CAP through consensus, replication, partitioning, distributed transactions, eventual consistency, failure modes, and observability. The foundation under every multi-node service — ML training infra, data pipelines, production serving.",
    nodes: [
      { slug: "cap-theorem", title: "CAP & PACELC", level: "apprentice", order: 1, pages: ["cap-theorem", "pacelc"], prereqs: [], description: "C vs A during partition, the practical PACELC refinement, picking the right posture per subsystem." },
      { slug: "consensus-raft", title: "Consensus & Raft", level: "practitioner", order: 2, pages: ["raft", "consensus"], prereqs: ["cap-theorem"], description: "Raft's leader election + log replication, quorum arithmetic, when 5 nodes beats 7." },
      { slug: "replication-strategies", title: "Replication Strategies", level: "practitioner", order: 3, pages: ["replication"], prereqs: ["consensus-raft"], description: "Sync vs async vs semi-sync; single-leader vs multi-leader vs leaderless; latency-vs-durability." },
      { slug: "partitioning-sharding", title: "Partitioning & Sharding", level: "practitioner", order: 4, pages: ["partitioning", "consistent-hashing"], prereqs: ["replication-strategies"], description: "Range vs hash, consistent hashing, hot partitions + how to spot + fix them." },
      { slug: "distributed-transactions", title: "Distributed Transactions", level: "specialist", order: 5, pages: ["two-phase-commit", "saga-pattern", "idempotency-keys"], prereqs: ["consensus-raft"], description: "2PC's blocking problem, sagas + compensating actions, idempotency keys as the modern reliability discipline." },
      { slug: "eventual-consistency-crdts", title: "Eventual Consistency & CRDTs", level: "specialist", order: 6, pages: ["eventual-consistency", "crdt"], prereqs: ["replication-strategies"], description: "The consistency spectrum, CRDTs for conflict-free convergence, where they shine (collaborative editing) and where they don't." },
      { slug: "failure-modes", title: "Failure Modes", level: "expert", order: 7, pages: ["failure-modes", "circuit-breaker"], prereqs: ["consensus-raft"], description: "Fail-stop vs Byzantine vs gray failures, retry storms, circuit breakers, cascading failure mitigation." },
      { slug: "distributed-tracing", title: "Distributed Tracing & Observability", level: "expert", order: 8, pages: ["distributed-tracing", "opentelemetry"], prereqs: ["failure-modes"], description: "Traces / metrics / logs, OpenTelemetry, propagation, sampling. The discipline that makes cross-service debugging tractable." },
    ],
  });

  // P2 — Data Engineer path. The data-plumbing discipline every
  // ML / analytics team eventually needs: modeling, ETL/ELT, batch +
  // streaming, warehousing, orchestration, quality, ML feature
  // pipelines.
  seedMasteryPath({
    slug: "data-engineer",
    title: "Data Engineer",
    description:
      "From data modeling through ETL/ELT, batch + streaming, warehousing, orchestration, data quality, and ML feature pipelines. The plumbing discipline every data-using team eventually needs.",
    nodes: [
      { slug: "data-modeling", title: "Data Modeling", level: "apprentice", order: 1, pages: ["data-modeling", "star-schema"], prereqs: [], description: "OLTP vs OLAP, 3NF, star schema. The structural choices that decide whether your queries scale." },
      { slug: "etl-fundamentals", title: "ETL & ELT Fundamentals", level: "apprentice", order: 2, pages: ["etl-elt", "idempotency"], prereqs: ["data-modeling"], description: "Extract / Load / Transform, idempotency, late data. The modern data stack's ground rules." },
      { slug: "batch-processing-spark", title: "Batch Processing & Spark", level: "practitioner", order: 3, pages: ["spark", "shuffles"], prereqs: ["etl-fundamentals"], description: "Narrow vs wide transformations, shuffles, when warehouse-SQL beats Spark." },
      { slug: "streaming-kafka", title: "Streaming & Kafka", level: "practitioner", order: 4, pages: ["kafka", "stream-processing"], prereqs: ["etl-fundamentals"], description: "Log-based architecture, at-least-once vs exactly-once, when streaming beats batch." },
      { slug: "data-warehousing", title: "Data Warehousing", level: "practitioner", order: 5, pages: ["warehouse", "columnar-storage", "lakehouse"], prereqs: ["data-modeling"], description: "Columnar storage, warehouse vs lake vs lakehouse, cloud-warehouse cost reasoning." },
      { slug: "orchestration-airflow", title: "Orchestration with Airflow", level: "practitioner", order: 6, pages: ["airflow", "dags"], prereqs: ["etl-fundamentals"], description: "DAGs, operators, sensors, the common anti-patterns. The orchestrator everyone uses." },
      { slug: "data-quality-testing", title: "Data Quality & Testing", level: "specialist", order: 7, pages: ["data-quality", "data-contracts"], prereqs: ["etl-fundamentals"], description: "Schema tests, anomaly tests, contract tests. Catching silent corruption before it costs you." },
      { slug: "ml-feature-pipelines", title: "ML Feature Pipelines", level: "expert", order: 8, pages: ["feature-store", "train-serve-skew"], prereqs: ["batch-processing-spark", "data-quality-testing"], description: "Online vs offline serving, train/serve skew, feature stores. Where data engineering meets ML in production." },
    ],
  });

  // P1 — Security Engineer path. The defensive-engineering half of
  // every shipping system: threat modeling, crypto, web security,
  // identity, plus the security-on-ML frontier (adversarial ML,
  // privacy-preserving ML, IR).
  seedMasteryPath({
    slug: "security-engineer",
    title: "Security Engineer",
    description:
      "From threat modeling through crypto, web security, identity, adversarial ML, privacy-preserving ML, and incident response. The defensive-engineering half of every shipping system.",
    nodes: [
      { slug: "threat-modeling", title: "Threat Modeling", level: "apprentice", order: 1, pages: ["threat-modeling"], prereqs: [], description: "STRIDE, trust boundaries, attack surface. Articulating assumptions before they're broken." },
      { slug: "symmetric-crypto", title: "Symmetric Cryptography", level: "apprentice", order: 2, pages: ["symmetric-crypto", "aead"], prereqs: ["threat-modeling"], description: "AES, ChaCha20, AEAD discipline, nonce hygiene. The fast half of every secure protocol." },
      { slug: "asymmetric-crypto", title: "Asymmetric Cryptography", level: "apprentice", order: 3, pages: ["asymmetric-crypto", "diffie-hellman"], prereqs: ["symmetric-crypto"], description: "RSA, ECC, Diffie-Hellman, post-quantum. Key distribution + signatures + the migration ahead." },
      { slug: "web-security", title: "Web Security", level: "practitioner", order: 4, pages: ["web-security", "owasp-top-10"], prereqs: ["threat-modeling"], description: "OWASP Top 10, XSS vs CSRF, Content-Security-Policy, secure-by-default frameworks." },
      { slug: "authentication-auth", title: "Authentication & Authorization", level: "practitioner", order: 5, pages: ["oidc", "oauth-2", "webauthn"], prereqs: ["asymmetric-crypto"], description: "OIDC + OAuth 2, MFA, WebAuthn, JWT, the principle of least privilege." },
      { slug: "adversarial-ml", title: "Adversarial ML", level: "specialist", order: 6, pages: ["adversarial-examples", "prompt-injection"], prereqs: ["threat-modeling"], description: "Evasion, poisoning, extraction. Adversarial examples + prompt injection + the empirical defense practice." },
      { slug: "privacy-preserving-ml", title: "Privacy-Preserving ML", level: "specialist", order: 7, pages: ["differential-privacy", "federated-learning"], prereqs: ["adversarial-ml"], description: "Differential privacy, DP-SGD, federated learning, secure aggregation. The formal-guarantee half of privacy engineering." },
      { slug: "security-incident-response", title: "Security Incident Response", level: "expert", order: 8, pages: ["incident-response", "blameless-postmortems"], prereqs: ["threat-modeling"], description: "Detection → containment → eradication → recovery → blameless review. The discipline that turns inevitable incidents into long-term improvements." },
    ],
  });

  // Triplet 15 — Surgeon. From the birth of survivable surgery
  // (anaesthesia + antisepsis) through anatomy, hemostasis, anaesthesia,
  // technique, minimally-invasive + robotic surgery, to transplantation
  // and the regenerative frontier.
  seedMasteryPath({
    slug: "surgeon",
    title: "Surgeon",
    description:
      "From Lister's antisepsis and Halsted's discipline through surgical anatomy, hemostasis, anaesthesia, instrumentation, laparoscopic + robotic surgery, to transplantation and the regenerative frontier.",
    nodes: [
      { slug: "surgical-history-and-antisepsis", title: "History + Antisepsis", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Morton's ether 1846 + Lister's carbolic acid 1867 + Semmelweis + Halsted — how surgery became survivable (interactive vital-signs monitor)." },
      { slug: "surgical-anatomy-and-approach", title: "Surgical Anatomy + Approach", level: "apprentice", order: 2, pages: [], prereqs: ["surgical-history-and-antisepsis"], description: "Fascial layers, Langer's lines, incisions (midline, Pfannenstiel, McBurney), exposure + tissue planes." },
      { slug: "asepsis-and-the-sterile-field", title: "Asepsis + the Sterile Field", level: "practitioner", order: 3, pages: [], prereqs: ["surgical-anatomy-and-approach"], description: "Autoclave sterilization, scrub + gown + glove, the sterile field, SSI prevention, the WHO Surgical Safety Checklist." },
      { slug: "hemostasis-and-wound-healing", title: "Hemostasis + Wound Healing", level: "practitioner", order: 4, pages: [], prereqs: ["asepsis-and-the-sterile-field"], description: "Coagulation cascade, ligature vs cautery, suture materials + technique, the four phases of wound healing." },
      { slug: "anesthesia-and-perioperative-physiology", title: "Anaesthesia + Perioperative Physiology", level: "specialist", order: 5, pages: [], prereqs: ["hemostasis-and-wound-healing"], description: "General/regional/local, airway, agents, intra-op monitoring (ECG/SpO2/capnography), ASA status, malignant hyperthermia." },
      { slug: "surgical-technique-and-instrumentation", title: "Technique + Instrumentation", level: "specialist", order: 6, pages: [], prereqs: ["anesthesia-and-perioperative-physiology"], description: "Instruments, knots, anastomosis, electrosurgery (the Bovie), staplers + advanced energy devices." },
      { slug: "minimally-invasive-and-robotic-surgery", title: "Minimally-Invasive + Robotic Surgery", level: "expert", order: 7, pages: [], prereqs: ["surgical-technique-and-instrumentation"], description: "Laparoscopy (Mühe 1985, Mouret 1987), CO2 insufflation, the fulcrum effect, the da Vinci system, NOTES + endoscopy." },
      { slug: "transplantation-and-surgical-frontiers", title: "Transplantation + Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["minimally-invasive-and-robotic-surgery"], description: "Murray 1954, Barnard 1967, Starzl; immunosuppression + HLA; ERAS; xenotransplantation + the regenerative frontier." },
    ],
  });

  // Triplet 15 — Sommelier. Wine from vine to glass: history + the
  // sommelier craft, viticulture + terroir, varieties, fermentation
  // chemistry, structure + faults, blind tasting, regions, and service.
  seedMasteryPath({
    slug: "sommelier",
    title: "Sommelier",
    description:
      "Wine from vine to glass: the sommelier craft, viticulture + terroir, grape varieties, fermentation chemistry, wine structure + faults, sensory evaluation + blind tasting, regional classification, and food + service.",
    nodes: [
      { slug: "wine-history-and-the-sommelier-craft", title: "History + the Sommelier Craft", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Wine from Georgia 6000 BC to the Court of Master Sommeliers + WSET + the 1976 Judgment of Paris (interactive flavor wheel)." },
      { slug: "viticulture-and-terroir", title: "Viticulture + Terroir", level: "apprentice", order: 2, pages: [], prereqs: ["wine-history-and-the-sommelier-craft"], description: "Vitis vinifera, the growth cycle, terroir (soil/climate/aspect), phylloxera + rootstock, ripeness in Brix." },
      { slug: "grape-varieties-and-wine-styles", title: "Grape Varieties + Styles", level: "practitioner", order: 3, pages: [], prereqs: ["viticulture-and-terroir"], description: "Noble varieties; still / sparkling / fortified / dessert; the traditional method; blends." },
      { slug: "vinification-and-fermentation-chemistry", title: "Vinification + Fermentation Chemistry", level: "practitioner", order: 4, pages: [], prereqs: ["grape-varieties-and-wine-styles"], description: "Pasteur + Saccharomyces, the Gay-Lussac equation, red vs white, malolactic fermentation, SO2, oak." },
      { slug: "wine-chemistry-structure-and-faults", title: "Wine Chemistry, Structure + Faults", level: "specialist", order: 5, pages: [], prereqs: ["vinification-and-fermentation-chemistry"], description: "Acids, tannins/phenolics, balance; faults — TCA cork taint, Brett, oxidation, volatile acidity, reduction." },
      { slug: "sensory-evaluation-and-blind-tasting", title: "Sensory Evaluation + Blind Tasting", level: "specialist", order: 6, pages: [], prereqs: ["wine-chemistry-structure-and-faults"], description: "The systematic tasting grid; aroma chemistry (pyrazines, terpenes, thiols, rotundone); Ann Noble's Aroma Wheel." },
      { slug: "wine-regions-and-classification", title: "Regions + Classification", level: "expert", order: 7, pages: [], prereqs: ["sensory-evaluation-and-blind-tasting"], description: "Old vs New World; AOC/INAO, Bordeaux 1855, Burgundy crus, German Prädikat, Italian DOCG, AVAs." },
      { slug: "wine-and-food-service-and-frontiers", title: "Food, Service + Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["wine-regions-and-classification"], description: "Pairing science, service + glassware, cellaring; climate change, natural/orange/biodynamic wine, closures + scoring." },
    ],
  });

  // Triplet 15 — Pilot. Aviation from the four forces and the flight
  // envelope through systems, instruments, navigation, weather, IFR
  // operations, to human factors + the safety culture that flies the line.
  seedMasteryPath({
    slug: "pilot",
    title: "Pilot",
    description:
      "Aviation from the principles of flight and the flight envelope through aircraft systems, instruments, navigation + airspace, weather, IFR operations + the instrument approach, to human factors and aviation safety.",
    nodes: [
      { slug: "aviation-history-and-principles-of-flight", title: "History + Principles of Flight", level: "apprentice", order: 1, pages: [], prereqs: [], description: "The Wright brothers 1903, the four forces, how lift really works, airfoil anatomy (interactive lift-curve)." },
      { slug: "aerodynamics-and-the-flight-envelope", title: "Aerodynamics + the Flight Envelope", level: "apprentice", order: 2, pages: [], prereqs: ["aviation-history-and-principles-of-flight"], description: "The lift equation, CL vs angle of attack + stall, the drag polar, V-speeds, load factor + the V-n diagram." },
      { slug: "aircraft-systems-and-powerplant", title: "Aircraft Systems + Powerplant", level: "practitioner", order: 3, pages: [], prereqs: ["aerodynamics-and-the-flight-envelope"], description: "Piston + turbine engines (Whittle, von Ohain), propellers, fuel + electrical + hydraulics, pressurization." },
      { slug: "flight-instruments-and-the-six-pack", title: "Flight Instruments + the Six-Pack", level: "practitioner", order: 4, pages: [], prereqs: ["aircraft-systems-and-powerplant"], description: "The pitot-static + gyroscopic instruments, the six-pack layout, magnetic-compass errors, the glass cockpit." },
      { slug: "navigation-and-airspace", title: "Navigation + Airspace", level: "specialist", order: 5, pages: [], prereqs: ["flight-instruments-and-the-six-pack"], description: "VFR/IFR, dead reckoning + the wind triangle, VOR/ILS/GPS, airspace classes, charts + clearances." },
      { slug: "weather-and-meteorology-for-pilots", title: "Weather + Meteorology", level: "specialist", order: 6, pages: [], prereqs: ["navigation-and-airspace"], description: "METAR/TAF, fronts, icing, thunderstorms + wind shear, density altitude, the standard atmosphere." },
      { slug: "flight-operations-and-the-instrument-approach", title: "Operations + the Instrument Approach", level: "expert", order: 7, pages: [], prereqs: ["weather-and-meteorology-for-pilots"], description: "The IFR system, SID/STAR + holds, the ILS approach, decision height, ATC, performance + weight & balance." },
      { slug: "human-factors-and-aviation-safety", title: "Human Factors + Aviation Safety", level: "researcher", order: 8, pages: [], prereqs: ["flight-operations-and-the-instrument-approach"], description: "CRM (after United 173), Tenerife 1977, automation dependency, AF447, the Swiss-cheese model, SMS + just culture." },
    ],
  });

  // Triplet 16 — Accountant. Double-entry from Pacioli through the
  // financial statements, the accounting cycle, accrual + revenue
  // recognition, GAAP/IFRS, managerial costing, audit, to forensic
  // accounting + the digital-reporting frontier.
  seedMasteryPath({
    slug: "accountant",
    title: "Accountant",
    description:
      "Double-entry from Luca Pacioli through the financial statements, the accounting cycle, accrual + revenue recognition, GAAP/IFRS, managerial + cost accounting, auditing + internal control, to forensic accounting and the digital-reporting frontier.",
    nodes: [
      { slug: "accounting-history-and-double-entry", title: "History + Double-Entry", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Pacioli's 1494 Summa, debits + credits, and the accounting equation Assets = Liabilities + Equity (interactive ledger)." },
      { slug: "the-financial-statements", title: "The Financial Statements", level: "apprentice", order: 2, pages: [], prereqs: ["accounting-history-and-double-entry"], description: "Balance sheet, income statement, cash-flow statement + statement of equity — and how they articulate." },
      { slug: "the-accounting-cycle", title: "The Accounting Cycle", level: "practitioner", order: 3, pages: [], prereqs: ["the-financial-statements"], description: "Journals → ledgers → trial balance → adjusting entries → statements → closing entries." },
      { slug: "accrual-accounting-and-revenue-recognition", title: "Accrual + Revenue Recognition", level: "practitioner", order: 4, pages: [], prereqs: ["the-accounting-cycle"], description: "Accrual vs cash, the matching principle, and the ASC 606 / IFRS 15 five-step revenue model." },
      { slug: "gaap-ifrs-and-standards", title: "GAAP, IFRS + Standards", level: "specialist", order: 5, pages: [], prereqs: ["accrual-accounting-and-revenue-recognition"], description: "FASB vs IASB, the conceptual framework, principles- vs rules-based, fair value vs historical cost." },
      { slug: "managerial-and-cost-accounting", title: "Managerial + Cost Accounting", level: "specialist", order: 6, pages: [], prereqs: ["accrual-accounting-and-revenue-recognition"], description: "Cost behavior, CVP + break-even, standard costing + variances, activity-based costing, the balanced scorecard." },
      { slug: "auditing-and-internal-control", title: "Auditing + Internal Control", level: "expert", order: 7, pages: [], prereqs: ["gaap-ifrs-and-standards"], description: "The audit opinion + risk model, COSO internal control, Sarbanes-Oxley + the PCAOB, the Big Four." },
      { slug: "forensic-accounting-and-frontiers", title: "Forensic Accounting + Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["auditing-and-internal-control"], description: "The fraud triangle, Enron/WorldCom/Madoff, Benford's Law, XBRL + AI/blockchain in audit." },
    ],
  });

  // Triplet 16 — Agronomist. Crop science from Liebig's yield law
  // through soil, plant nutrition, water, physiology + breeding, pest
  // management, precision agriculture, to sustainable + gene-edited
  // frontiers.
  seedMasteryPath({
    slug: "agronomist",
    title: "Agronomist",
    description:
      "Crop science from Liebig's Law of the Minimum through soil fertility, plant nutrition + fertilizers, water + irrigation, crop physiology + breeding, pest/weed/disease management, precision agriculture, to sustainable + gene-edited frontiers.",
    nodes: [
      { slug: "agronomy-history-and-the-yield-equation", title: "History + the Yield Equation", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Liebig's Law of the Minimum + Mitscherlich diminishing returns + Borlaug's Green Revolution (interactive yield curve)." },
      { slug: "soil-science-and-fertility", title: "Soil Science + Fertility", level: "apprentice", order: 2, pages: [], prereqs: ["agronomy-history-and-the-yield-equation"], description: "Soil horizons + texture, cation exchange capacity, pH + liming, organic matter, soil testing." },
      { slug: "plant-nutrition-and-fertilizers", title: "Plant Nutrition + Fertilizers", level: "practitioner", order: 3, pages: [], prereqs: ["soil-science-and-fertility"], description: "The 17 essential nutrients, N-P-K, the nitrogen cycle, Haber-Bosch, the 4Rs + eutrophication." },
      { slug: "water-and-irrigation", title: "Water + Irrigation", level: "practitioner", order: 4, pages: [], prereqs: ["soil-science-and-fertility"], description: "Evapotranspiration (Penman-Monteith), field capacity, irrigation methods, drip + water-use efficiency." },
      { slug: "crop-physiology-and-breeding", title: "Crop Physiology + Breeding", level: "specialist", order: 5, pages: [], prereqs: ["plant-nutrition-and-fertilizers"], description: "C3/C4/CAM photosynthesis, growing-degree-days, harvest index, Mendel → hybrid vigor → MAS + GMOs." },
      { slug: "pest-weed-and-disease-management", title: "Pest, Weed + Disease Management", level: "specialist", order: 6, pages: [], prereqs: ["plant-nutrition-and-fertilizers"], description: "IPM + the economic threshold, modes of action + resistance, glyphosate, Silent Spring, biological control." },
      { slug: "precision-agriculture-and-data", title: "Precision Agriculture + Data", level: "expert", order: 7, pages: [], prereqs: ["crop-physiology-and-breeding"], description: "GPS guidance, NDVI remote sensing, variable-rate application, yield mapping, drones + satellites." },
      { slug: "sustainable-agriculture-and-frontiers", title: "Sustainable Agriculture + Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["precision-agriculture-and-data"], description: "Cover crops + no-till, soil carbon, agroforestry, climate-smart ag, CRISPR crops, vertical farming." },
    ],
  });

  // Triplet 16 — Actuary. Risk + mortality from Halley's life tables
  // through interest theory, life contingencies, premiums + reserves,
  // risk models, pricing, solvency, to the data-science frontier.
  seedMasteryPath({
    slug: "actuary",
    title: "Actuary",
    description:
      "Risk + mortality from Halley's life tables through interest theory + annuities, life contingencies + the force of mortality, premiums + reserves, loss + risk models, pricing + credibility, solvency + ERM, to the data-science frontier.",
    nodes: [
      { slug: "actuarial-history-and-life-tables", title: "History + Life Tables", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Graunt 1662 + Halley's 1693 Breslau table; the life-table columns l_x, d_x, q_x (interactive survival curve)." },
      { slug: "interest-theory-and-annuities", title: "Interest Theory + Annuities", level: "apprentice", order: 2, pages: [], prereqs: ["actuarial-history-and-life-tables"], description: "Time value of money, compound interest + discounting, the force of interest, annuities-immediate vs -due." },
      { slug: "life-contingencies-and-the-force-of-mortality", title: "Life Contingencies + Force of Mortality", level: "practitioner", order: 3, pages: [], prereqs: ["interest-theory-and-annuities"], description: "Survival models, the force of mortality, expectation of life, the Gompertz-Makeham laws." },
      { slug: "premium-calculation-and-reserves", title: "Premiums + Reserves", level: "practitioner", order: 4, pages: [], prereqs: ["life-contingencies-and-the-force-of-mortality"], description: "The equivalence principle, net + gross premiums, the policy reserve (prospective + retrospective)." },
      { slug: "probability-and-risk-models", title: "Probability + Risk Models", level: "specialist", order: 5, pages: [], prereqs: ["life-contingencies-and-the-force-of-mortality"], description: "Frequency × severity, the collective risk model, loss distributions, Cramér-Lundberg ruin theory." },
      { slug: "pricing-and-experience-rating", title: "Pricing + Experience Rating", level: "specialist", order: 6, pages: [], prereqs: ["premium-calculation-and-reserves"], description: "P&C ratemaking, GLMs in pricing, Bühlmann credibility, loss reserving + chain-ladder." },
      { slug: "solvency-and-enterprise-risk", title: "Solvency + Enterprise Risk", level: "expert", order: 7, pages: [], prereqs: ["probability-and-risk-models"], description: "Solvency II + RBC, VaR + Tail-VaR coherence, ERM + ORSA, economic capital + stress testing." },
      { slug: "actuarial-frontiers-and-data-science", title: "Frontiers + Data Science", level: "researcher", order: 8, pages: [], prereqs: ["solvency-and-enterprise-risk"], description: "ML pricing, telematics, longevity risk, IFRS 17, climate + pandemic modeling, fairness in algorithms." },
    ],
  });

  // Triplet 17 — Dentist. Clinical dentistry from Pierre Fauchard through
  // oral histology, cariology, periodontology, restorative materials,
  // endodontics, prosthodontics + orthodontics, to the digital frontier.
  seedMasteryPath({
    slug: "dentist",
    title: "Dentist",
    description:
      "Clinical dentistry from Pierre Fauchard through oral anatomy + histology, cariology, periodontology, restorative materials, endodontics, prosthodontics + orthodontics, to the digital-dentistry frontier.",
    nodes: [
      { slug: "dentistry-history-and-tooth-anatomy", title: "History + Tooth Anatomy", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Hesy-Ra + Fauchard's 1728 Le Chirurgien Dentiste; enamel / dentin / pulp + tooth notation (interactive tooth cross-section)." },
      { slug: "oral-anatomy-and-histology", title: "Oral Anatomy + Histology", level: "apprentice", order: 2, pages: [], prereqs: ["dentistry-history-and-tooth-anatomy"], description: "Enamel (ameloblasts), dentin (odontoblasts + tubules), pulp, the periodontium, the TMJ + salivary glands." },
      { slug: "dental-caries-and-cariology", title: "Dental Caries + Cariology", level: "practitioner", order: 3, pages: [], prereqs: ["oral-anatomy-and-histology"], description: "S. mutans + biofilm, the Stephan curve + critical pH 5.5, de-/remineralization, fluoride, DMFT + ICDAS." },
      { slug: "periodontology", title: "Periodontology", level: "practitioner", order: 4, pages: [], prereqs: ["dental-caries-and-cariology"], description: "Gingivitis vs periodontitis, probing + attachment loss, Socransky's red complex, the 2017 staging + grading." },
      { slug: "restorative-dentistry-and-materials", title: "Restorative Dentistry + Materials", level: "specialist", order: 5, pages: [], prereqs: ["periodontology"], description: "Amalgam vs composite (BisGMA), glass-ionomer, Buonocore's acid-etch bonding, crowns + ceramics (zirconia)." },
      { slug: "endodontics", title: "Endodontics", level: "specialist", order: 6, pages: [], prereqs: ["restorative-dentistry-and-materials"], description: "Pulpitis + necrosis, root-canal therapy (NiTi files, NaOCl irrigation, gutta-percha), regenerative endodontics." },
      { slug: "prosthodontics-and-orthodontics", title: "Prosthodontics + Orthodontics", level: "expert", order: 7, pages: [], prereqs: ["endodontics"], description: "Angle's occlusion classes, dentures + bridges, Brånemark osseointegration + implants, aligners + cephalometrics." },
      { slug: "digital-dentistry-frontiers", title: "Digital Dentistry + Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["prosthodontics-and-orthodontics"], description: "CAD/CAM (CEREC), intraoral scanners, cone-beam CT, dental lasers, AI radiograph diagnosis, teledentistry." },
    ],
  });

  // Triplet 17 — Nutritionist. Nutrition science from Lind + Lavoisier
  // through macronutrients, energy balance, micronutrients, digestion,
  // dietary guidelines, clinical + sports nutrition, to nutrigenomics.
  seedMasteryPath({
    slug: "nutritionist",
    title: "Nutritionist",
    description:
      "Nutrition science from James Lind + Lavoisier through macronutrients, energy balance + metabolism, micronutrients, digestion + absorption, dietary guidelines, clinical + sports nutrition, to the nutrigenomics frontier.",
    nodes: [
      { slug: "nutrition-science-history-and-energy-balance", title: "History + Energy Balance", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Lind's scurvy trial, Lavoisier's calorimetry, Atwater factors (4/4/9), Eijkman + Funk's vitamins (interactive energy balance)." },
      { slug: "macronutrients", title: "Macronutrients", level: "apprentice", order: 2, pages: [], prereqs: ["nutrition-science-history-and-energy-balance"], description: "Carbohydrates + glycemic index, protein quality (PDCAAS) + amino acids, lipids, omega-3/6, LDL/HDL." },
      { slug: "energy-balance-and-metabolism", title: "Energy Balance + Metabolism", level: "practitioner", order: 3, pages: [], prereqs: ["macronutrients"], description: "BMR/RMR, TDEE = BMR + TEF + activity, Harris-Benedict + Mifflin-St Jeor, indirect calorimetry + RQ." },
      { slug: "micronutrients-vitamins-and-minerals", title: "Micronutrients", level: "practitioner", order: 4, pages: [], prereqs: ["energy-balance-and-metabolism"], description: "Fat- vs water-soluble vitamins, scurvy / rickets / pellagra / beriberi, iron + iodine, fortification, the DRIs." },
      { slug: "digestion-and-absorption", title: "Digestion + Absorption", level: "specialist", order: 5, pages: [], prereqs: ["micronutrients-vitamins-and-minerals"], description: "The GI tract + enzymes, small-intestine absorption (villi), bile + pancreas, the gut microbiome + SCFAs." },
      { slug: "dietary-assessment-and-guidelines", title: "Dietary Assessment + Guidelines", level: "specialist", order: 6, pages: [], prereqs: ["digestion-and-absorption"], description: "24-h recall + FFQs, the DRIs + Dietary Guidelines, MyPlate, Mediterranean + DASH, glycemic load, labels." },
      { slug: "clinical-and-sports-nutrition", title: "Clinical + Sports Nutrition", level: "expert", order: 7, pages: [], prereqs: ["dietary-assessment-and-guidelines"], description: "Obesity + type-2 diabetes, cardiovascular nutrition, carbohydrate loading + protein timing, enteral / parenteral." },
      { slug: "nutrigenomics-frontiers", title: "Nutrigenomics + Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["clinical-and-sports-nutrition"], description: "Nutrigenomics (MTHFR, FTO, lactase), the PREDICT study + CGMs, the microbiome, metabolomics, AI diet tools." },
    ],
  });

  // Triplet 17 — Sports Scientist. Exercise science from A.V. Hill through
  // muscle physiology, bioenergetics, cardiorespiratory fitness,
  // biomechanics, strength + conditioning, recovery, to the data frontier.
  seedMasteryPath({
    slug: "sports-scientist",
    title: "Sports Scientist",
    description:
      "Exercise science from A.V. Hill through skeletal-muscle physiology, bioenergetics, cardiorespiratory fitness, biomechanics, strength + conditioning, recovery + ergogenics, to the wearables + force-velocity frontier.",
    nodes: [
      { slug: "sports-science-history-and-force-velocity", title: "History + Force-Velocity", level: "apprentice", order: 1, pages: [], prereqs: [], description: "A.V. Hill (Nobel 1922) + the 1938 force-velocity equation; Krogh, Astrand, Margaria (interactive force-velocity curve)." },
      { slug: "skeletal-muscle-physiology", title: "Skeletal Muscle Physiology", level: "apprentice", order: 2, pages: [], prereqs: ["sports-science-history-and-force-velocity"], description: "Sliding-filament theory (Huxley), the cross-bridge cycle, Henneman's size principle, Type I / IIa / IIx fibers." },
      { slug: "bioenergetics-and-energy-systems", title: "Bioenergetics + Energy Systems", level: "practitioner", order: 3, pages: [], prereqs: ["skeletal-muscle-physiology"], description: "ATP-PCr, anaerobic glycolysis + lactate, oxidative phosphorylation, the energy-system continuum, EPOC + RER." },
      { slug: "cardiorespiratory-fitness", title: "Cardiorespiratory Fitness", level: "practitioner", order: 4, pages: [], prereqs: ["bioenergetics-and-energy-systems"], description: "VO2max + the Fick equation, cardiac output + stroke volume, lactate + ventilatory thresholds, Cooper + Bruce tests." },
      { slug: "biomechanics", title: "Biomechanics", level: "specialist", order: 5, pages: [], prereqs: ["cardiorespiratory-fitness"], description: "Kinematics vs kinetics, ground-reaction force + force plates, lever classes, torque, gait + motion capture." },
      { slug: "strength-and-conditioning", title: "Strength + Conditioning", level: "specialist", order: 6, pages: [], prereqs: ["biomechanics"], description: "Progressive overload, Matveyev periodization, 1RM, hypertrophy, the SAID principle, Selye's GAS, plyometrics." },
      { slug: "recovery-and-ergogenics", title: "Recovery + Ergogenics", level: "expert", order: 7, pages: [], prereqs: ["strength-and-conditioning"], description: "Sleep + glycogen resynthesis, DOMS + overtraining, creatine / caffeine / beta-alanine / nitrate, WADA, HRV + RPE." },
      { slug: "sports-science-frontiers", title: "Frontiers", level: "researcher", order: 8, pages: [], prereqs: ["recovery-and-ergogenics"], description: "Wearables + IMUs, Samozino-Morin force-velocity profiling, the acute:chronic workload ratio, ACTN3, return-to-play." },
    ],
  });

  seedExamPrepPaths();
}

// One mastery path per exam (user choice). Slug = the exam's own
// declared pathSlug (e.g. sat → "sat-prep"); the single terminal
// node is nodeKind:"exam" so the player deep-links to the existing
// /exams/:examSlug runner. Idempotent via seedMasteryPath.
// SAT prep gets a full lesson path (8 College Board domains) +
// the timed exam as a prereq-gated capstone. Lesson content is
// authored in seed-content/lessons/<slug>.json and auto-attached
// by slug via loadLessonData; nodes whose file is absent seed
// with null lessonData (valid). Other exams stay single-node.
const SAT_LESSON_NODES: MasteryNodeSpec[] = [
  { slug: "sat-rw-information-ideas", title: "Reading: Information & Ideas", level: "apprentice", order: 1, pages: [], prereqs: [], description: "Central ideas, command of evidence (textual + quantitative), and inferences." },
  { slug: "sat-rw-craft-structure", title: "Reading: Craft & Structure", level: "apprentice", order: 2, pages: [], prereqs: ["sat-rw-information-ideas"], description: "Words in context, vocabulary, purpose, tone, text structure, cross-text connections." },
  { slug: "sat-rw-expression-of-ideas", title: "Writing: Expression of Ideas", level: "practitioner", order: 3, pages: [], prereqs: ["sat-rw-craft-structure"], description: "Rhetorical synthesis, transitions, and concision." },
  { slug: "sat-rw-standard-english", title: "Writing: Standard English Conventions", level: "practitioner", order: 4, pages: [], prereqs: ["sat-rw-expression-of-ideas"], description: "Grammar, verb tense, agreement, pronouns, modifiers, punctuation, parallelism." },
  { slug: "sat-math-algebra", title: "Math: Algebra", level: "apprentice", order: 5, pages: [], prereqs: [], description: "Linear equations & inequalities, systems, linear functions, graphs." },
  { slug: "sat-math-advanced", title: "Math: Advanced Math", level: "practitioner", order: 6, pages: [], prereqs: ["sat-math-algebra"], description: "Quadratics, polynomials, exponents & radicals, functions, logarithms." },
  { slug: "sat-math-problem-solving-data", title: "Math: Problem-Solving & Data Analysis", level: "practitioner", order: 7, pages: [], prereqs: ["sat-math-algebra"], description: "Ratios, rates, proportions, percentages, statistics, probability, data interpretation." },
  { slug: "sat-math-geometry-trig", title: "Math: Geometry & Trigonometry", level: "practitioner", order: 8, pages: [], prereqs: ["sat-math-advanced"], description: "Lines, angles, triangles, circles, area & volume, right-triangle trig." },
];

function seedExamPrepPaths() {
  const dir = path.join(import.meta.dir, "../../../seed-content/exams");
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let exam: any;
    try {
      exam = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    if (!exam?.slug || !exam?.pathSlug) continue;
    const short = exam.shortName || exam.title || exam.slug;
    const lessonNodes =
      exam.pathSlug === "sat-prep" ? SAT_LESSON_NODES : [];
    const examNode: MasteryNodeSpec = {
      slug: `${exam.pathSlug}-exam`,
      title:
        lessonNodes.length > 0
          ? `${short} — full timed exam (capstone)`
          : `${short} — full timed exam`,
      level: "practitioner",
      order: lessonNodes.length + 1,
      pages: [],
      prereqs: lessonNodes.map((n) => n.slug),
      description: `Sit the complete ${short} under timed conditions; your score and attempt history are saved.`,
      nodeKind: "exam",
      examSlug: exam.slug,
    };
    seedMasteryPath({
      slug: exam.pathSlug,
      title: `${short} Prep`,
      description:
        exam.description ||
        `Prepare for the ${short} and take the full timed exam.`,
      nodes: [...lessonNodes, examNode],
    });
  }
}

// --- Forum seeding -------------------------------------------------------

interface ForumTopicFrontmatter {
  title: string;
  postType: string;
  domainSlug: string;
  wikiPageSlug?: string;
  author: string;
  replies: { author: string; body: string }[];
}

const SEED_DOMAINS = [
  {
    slug: "ml",
    title: "Machine Learning",
    description:
      "Modern ML, transformers, training, decoding, alignment, interpretability.",
  },
  {
    slug: "math",
    title: "Mathematics",
    description: "Foundations of the math behind ML and beyond.",
  },
  {
    slug: "physics",
    title: "Physics",
    description: "Statistical mechanics, dynamical systems, and beyond.",
  },
  {
    slug: "systems",
    title: "Systems",
    description:
      "Distributed training, serving, monitoring, the infrastructure half of ML.",
  },
  {
    slug: "rl",
    title: "Reinforcement Learning",
    description:
      "MDPs, value functions, policy gradients, PPO, RLHF, model-based RL.",
  },
  {
    slug: "multimodal",
    title: "Multimodal & Vision",
    description:
      "Vision transformers, CLIP, diffusion, audio, VLMs — non-text ML.",
  },
  {
    slug: "bio",
    title: "Computational Biology",
    description:
      "ML × biology: protein folding, sequence modeling, AlphaFold + ESM.",
  },
  {
    slug: "stats",
    title: "Applied Statistics",
    description:
      "Hypothesis testing, A/B experiments, calibration, fairness — production statistics.",
  },
  {
    slug: "causal",
    title: "Causality",
    description:
      "DAGs, do-calculus, counterfactuals, instrumental variables — Pearl-style causal inference.",
  },
  {
    slug: "robotics",
    title: "Robotics & Control",
    description:
      "PID through SLAM, manipulation, sim-to-real, and end-to-end ML policies — the embodied-AI stack.",
  },
  {
    slug: "quantum",
    title: "Quantum Computing",
    description:
      "Qubits, gates, Shor + Grover, error correction, NISQ-era variational algorithms, QML.",
  },
  {
    slug: "game-theory",
    title: "Game Theory & Mechanism Design",
    description:
      "Nash, mechanism design, auctions, multi-agent RL, alignment as a game-theoretic problem.",
  },
  {
    slug: "algorithms",
    title: "Algorithms & Data Structures",
    description:
      "Sorting, hashing, graphs, dynamic programming, complexity theory. The CS-foundations spine of every engineering discipline.",
  },
];

const SEED_FORUM_USERS = [
  { username: "alice", displayName: "Alice", bio: "Mech-interp researcher.", species: "cat", level: 2 },
  { username: "bob", displayName: "Bob", bio: "Optimization & math foundations.", species: "fox", level: 2 },
  { username: "carol", displayName: "Carol", bio: "Theoretical ML.", species: "owl", level: 1 },
  { username: "dave", displayName: "Dave", bio: "Systems and inference engineering.", species: "otter", level: 1 },
];

function ensureForumUser(username: string, displayName: string, bio: string): string {
  const existing = db.select().from(users).where(eq(users.username, username)).get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(users).values({
    id,
    username,
    email: `${username}@axiomic.local`,
    passwordHash: FORUM_SEED_PASSWORD_HASH,
    displayName,
    bio,
    // S108 — seeded users are pre-verified so tests and the demo
    // cohort can publish/upload without the verify-email gate.
    emailVerifiedAt: new Date().toISOString(),
  }).run();
  return id;
}

// Give a seeded forum user a starter pet so forum bylines,
// leaderboards, and PetByUsername render visible avatars on a
// fresh DB. Idempotent: skip when the user already owns a pet.
function ensureStarterPet(userId: string, species: string, level: number): void {
  const existing = db.select({ id: pets.id }).from(pets).where(eq(pets.userId, userId)).get();
  if (existing) return;
  const petId = randomUUID();
  db.insert(pets).values({
    id: petId,
    userId,
    species,
    level,
    activeSkinSlug: "default",
  }).run();
  db.update(users).set({ activePetId: petId }).where(eq(users.id, userId)).run();
  db.insert(petSkinInventory).values({
    id: randomUUID(),
    userId,
    skinSlug: "default",
  }).onConflictDoNothing().run();
}

function ensureDomain(slug: string, title: string, description: string): string {
  const existing = db.select().from(domains).where(eq(domains.slug, slug)).get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(domains).values({ id, slug, title, description }).run();
  return id;
}

function parseForumTopic(file: string, content: string): ForumTopicFrontmatter | null {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    console.warn(`Skipping forum topic ${file}: no frontmatter.`);
    return null;
  }
  const fm = m[1];
  const get = (key: string) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
    return fm.match(re)?.[1]?.trim();
  };
  const title = get("title");
  const postType = get("postType");
  const domainSlug = get("domainSlug");
  const author = get("author");
  if (!title || !postType || !domainSlug || !author) {
    console.warn(`Skipping forum topic ${file}: missing required frontmatter.`);
    return null;
  }
  const wikiPageSlug = get("wikiPageSlug");

  // Replies block: parse YAML-ish indented `- author: ...\n    body: |\n      ...`
  const replies: { author: string; body: string }[] = [];
  const repliesMatch = fm.match(/^replies:\n([\s\S]+)$/m);
  if (repliesMatch) {
    const block = repliesMatch[1];
    const lines = block.split("\n");
    let current: { author: string; body: string } | null = null;
    let inBody = false;
    let bodyIndent = 0;
    for (const line of lines) {
      const itemMatch = line.match(/^\s*-\s+author:\s*(.+)$/);
      if (itemMatch) {
        if (current) replies.push(current);
        current = { author: itemMatch[1].trim(), body: "" };
        inBody = false;
        continue;
      }
      const bodyStartMatch = line.match(/^(\s+)body:\s*\|\s*$/);
      if (bodyStartMatch && current) {
        inBody = true;
        bodyIndent = bodyStartMatch[1].length + 2;
        continue;
      }
      if (inBody && current) {
        if (line.trim() === "" || line.startsWith(" ".repeat(bodyIndent))) {
          current.body += line.slice(bodyIndent) + "\n";
        } else if (/^\s*-\s+author:/.test(line)) {
          // Next reply starts; loop will catch it next iteration via itemMatch
          current.body = current.body.trim();
          replies.push(current);
          const next = line.match(/^\s*-\s+author:\s*(.+)$/);
          if (next) current = { author: next[1].trim(), body: "" };
          inBody = false;
        }
      }
    }
    if (current) {
      current.body = current.body.trim();
      replies.push(current);
    }
  }

  // Use body parsed at module level
  return { title, postType, domainSlug, wikiPageSlug, author, replies };
}

async function seedForum() {
  // Forum users + their starter pets are seeded unconditionally so
  // bylines render avatars even on re-seeds against an already-
  // populated DB. The topic/post creation below remains guarded.
  for (const d of SEED_DOMAINS) {
    ensureDomain(d.slug, d.title, d.description);
  }
  const userIds = new Map<string, string>();
  for (const u of SEED_FORUM_USERS) {
    const id = ensureForumUser(u.username, u.displayName, u.bio);
    userIds.set(u.username, id);
    ensureStarterPet(id, u.species, u.level);
  }

  // Skip if topics are already seeded.
  const anyTopic = db.select().from(forumTopics).get();
  if (anyTopic) {
    console.log("  Forum already seeded, skipping.");
    return;
  }

  const forumDir = path.join(import.meta.dir, "../../../seed-content/forum/topics");
  if (!fs.existsSync(forumDir)) {
    console.log("  No forum seed directory; skipping topics.");
    return;
  }

  // Phase 41 — `demo-*` topics only seed when SEED_DEMO=1.
  const files = fs
    .readdirSync(forumDir)
    .filter((f) => f.endsWith(".md") && (SEED_DEMO || !f.startsWith("demo-")));
  let topicCount = 0;
  let postCount = 0;
  let voteCount = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(forumDir, file), "utf-8");
    const fm = parseForumTopic(file, raw);
    if (!fm) continue;

    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = (bodyMatch?.[1] || "").trim();

    const dom = db.select().from(domains).where(eq(domains.slug, fm.domainSlug)).get();
    if (!dom) {
      console.warn(`Skipping ${file}: unknown domain ${fm.domainSlug}`);
      continue;
    }

    let wikiPageId: string | null = null;
    if (fm.wikiPageSlug) {
      const w = db.select().from(wikiPages).where(eq(wikiPages.slug, fm.wikiPageSlug)).get();
      if (w) wikiPageId = w.id;
    }

    const authorId = userIds.get(fm.author);
    if (!authorId) {
      console.warn(`Skipping ${file}: unknown seed author ${fm.author}`);
      continue;
    }

    const topicId = randomUUID();
    const slug = `${file.replace(".md", "")}-${randomUUID().slice(0, 6)}`;
    db.insert(forumTopics).values({
      id: topicId,
      slug,
      title: fm.title,
      body,
      postType: fm.postType,
      domainId: dom.id,
      authorId,
      wikiPageId,
    }).run();
    topicCount++;

    // Insert replies sequentially with tiny clock skew to preserve order.
    const replyIds: string[] = [];
    for (let i = 0; i < fm.replies.length; i++) {
      const r = fm.replies[i];
      const replyAuthorId = userIds.get(r.author) || authorId;
      const id = randomUUID();
      db.insert(forumPosts).values({
        id,
        topicId,
        parentId: i === 0 ? null : replyIds[0], // simple shape: first reply is root, rest reply to it
        authorId: replyAuthorId,
        body: r.body.trim(),
      }).run();
      replyIds.push(id);
      postCount++;
    }

    // Seed some votes so reputation is non-zero. Skip self-votes.
    const allVoters = SEED_FORUM_USERS.map((u) => userIds.get(u.username)!);
    // Topic gets 2 upvotes from non-author voters.
    let voted = 0;
    for (const v of allVoters) {
      if (v === authorId) continue;
      if (voted >= 2) break;
      db.insert(forumVotes).values({
        id: randomUUID(),
        subjectType: "topic",
        subjectId: topicId,
        userId: v,
        value: 1,
      }).run();
      voteCount++;
      voted++;
    }
    // Each reply gets one upvote from a different non-author voter.
    for (const rid of replyIds) {
      const post = db.select().from(forumPosts).where(eq(forumPosts.id, rid)).get();
      if (!post) continue;
      const voter = allVoters.find((v) => v !== post.authorId);
      if (!voter) continue;
      db.insert(forumVotes).values({
        id: randomUUID(),
        subjectType: "post",
        subjectId: rid,
        userId: voter,
        value: 1,
      }).run();
      voteCount++;
    }
  }

  console.log(
    `  Seeded forum: ${topicCount} topics, ${postCount} replies, ${voteCount} votes.`
  );
}

// Sprint 28 — load capstones from seed-content/capstones/*.json. Each
// JSON is a self-contained brief + ordered milestones (with rubrics +
// optional runnable tests). Authored by the seeded `system` user;
// upserted on slug.
async function seedCapstones() {
  const capstonesDir = path.join(import.meta.dir, "../../../seed-content/capstones");
  if (!fs.existsSync(capstonesDir)) {
    return;
  }

  // Find or create the `system` author. Reuse if a real user owns the
  // username (rare but possible); the seed deliberately doesn't
  // overwrite a real account.
  let systemUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "system"))
    .get();
  if (!systemUser) {
    const id = randomUUID();
    db.insert(users)
      .values({
        id,
        username: "system",
        email: "system@axiomic.local",
        passwordHash: FORUM_SEED_PASSWORD_HASH,
        displayName: "Axiomic system",
        bio: "Authored capstones + reference content shipped with the platform.",
        emailVerifiedAt: new Date().toISOString(),
      })
      .run();
    systemUser = { id };
  }

  // S85 — load skill_drill seeds from the directory root, then
  // long_arc seeds from the `long-arc/` subdirectory. Same file
  // shape; the loader threads the new fields through.
  type Seed = { file: string; absPath: string; defaultTier: "skill_drill" | "long_arc" };
  const seeds: Seed[] = fs
    .readdirSync(capstonesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      file: f,
      absPath: path.join(capstonesDir, f),
      defaultTier: "skill_drill" as const,
    }));
  const longArcDir = path.join(capstonesDir, "long-arc");
  if (fs.existsSync(longArcDir)) {
    for (const f of fs.readdirSync(longArcDir).filter((f) => f.endsWith(".json"))) {
      seeds.push({
        file: `long-arc/${f}`,
        absPath: path.join(longArcDir, f),
        defaultTier: "long_arc" as const,
      });
    }
  }

  let count = 0;
  for (const seed of seeds) {
    const raw = fs.readFileSync(seed.absPath, "utf-8");
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn(`  Skipping capstone ${seed.file}: invalid JSON.`);
      continue;
    }

    if (!parsed?.slug || !parsed?.title) continue;

    const existing = db
      .select({ id: capstones.id })
      .from(capstones)
      .where(eq(capstones.slug, parsed.slug))
      .get();

    let capstoneId: string;
    const values = {
      slug: parsed.slug,
      title: parsed.title,
      summary: parsed.summary ?? "",
      contentIntro: parsed.contentIntro ?? "",
      contentUndergrad: parsed.contentUndergrad ?? "",
      contentGrad: parsed.contentGrad ?? "",
      canonicalTier: parsed.canonicalTier ?? "undergrad",
      estimatedWeeks: parsed.estimatedWeeks ?? 6,
      prerequisiteWikiSlugs: JSON.stringify(parsed.prerequisiteWikiSlugs ?? []),
      prerequisiteNodeIds: JSON.stringify(parsed.prerequisiteNodeIds ?? []),
      tags: JSON.stringify(parsed.tags ?? []),
      coverEmoji: parsed.coverEmoji ?? "🎓",
      accentColor: parsed.accentColor ?? "violet",
      status: parsed.status ?? "published",
      authorId: systemUser.id,
      scaleTier: parsed.scaleTier ?? seed.defaultTier,
      domainsJson: JSON.stringify(parsed.domains ?? []),
      estimatedHoursMin: parsed.estimatedHoursMin ?? null,
      estimatedHoursMax: parsed.estimatedHoursMax ?? null,
      realWorldDeliverableMd: parsed.realWorldDeliverableMd ?? null,
    };
    if (existing) {
      capstoneId = existing.id;
      db.update(capstones)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(capstones.id, existing.id))
        .run();
      // Wipe + rewrite milestones so seed updates reflect cleanly.
      db.delete(capstoneMilestones)
        .where(eq(capstoneMilestones.capstoneId, capstoneId))
        .run();
    } else {
      capstoneId = randomUUID();
      db.insert(capstones).values({ id: capstoneId, ...values }).run();
    }

    const milestones: any[] = Array.isArray(parsed.milestones) ? parsed.milestones : [];
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m?.title) continue;
      db.insert(capstoneMilestones).values({
        id: randomUUID(),
        capstoneId,
        order: i,
        title: m.title,
        description: m.description ?? "",
        rubricJson: JSON.stringify(m.rubric ?? { criteria: [], passingScore: 0.6 }),
        requiredArtifactKinds: JSON.stringify(m.requiredArtifactKinds ?? []),
        runnableTests: m.runnableTests ?? null,
        estimatedDays: m.estimatedDays ?? 7,
        dueAt: m.dueAt ?? null,
        advisorSignoffRequired: m.advisorSignoffRequired ?? false,
      }).run();
    }
    count++;
  }
  console.log(`  Seeded ${count} capstone(s).`);
}

// Sprint 29 — load misconception_catalog from seed-content/misconceptions/*.json.
function seedMisconceptionCatalog() {
  const dir = path.join(import.meta.dir, "../../../seed-content/misconceptions");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const f of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed?.conceptSlug || !parsed?.key) continue;

    const existing = db
      .select({ id: misconceptionCatalog.id })
      .from(misconceptionCatalog)
      .where(eq(misconceptionCatalog.key, parsed.key))
      .get();
    const values = {
      conceptSlug: parsed.conceptSlug,
      key: parsed.key,
      label: parsed.label,
      description: parsed.description ?? "",
      probeQuestionsJson: JSON.stringify(parsed.probeQuestions ?? []),
      correctionPromptTemplate: parsed.correctionPromptTemplate ?? "",
    };
    if (existing) {
      db.update(misconceptionCatalog)
        .set(values)
        .where(eq(misconceptionCatalog.id, existing.id))
        .run();
    } else {
      db.insert(misconceptionCatalog)
        .values({ id: randomUUID(), ...values })
        .run();
    }
    count++;
  }
  console.log(`  Seeded ${count} misconception catalog entr${count === 1 ? "y" : "ies"}.`);
}

// Sprint 49 — load research papers from seed-content/research/*.json.
function seedResearchPapers() {
  const dir = path.join(import.meta.dir, "../../../seed-content/research");
  if (!fs.existsSync(dir)) return;

  // Use `system` if it exists; else fall back to `alice`.
  const authorId =
    db.select({ id: users.id }).from(users).where(eq(users.username, "system")).get()?.id ??
    db.select({ id: users.id }).from(users).where(eq(users.username, "alice")).get()?.id;
  if (!authorId) {
    console.log("  No author available for research papers; skipping.");
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const f of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed?.slug || !parsed?.title) continue;

    const existing = db
      .select({ id: researchPapers.id })
      .from(researchPapers)
      .where(eq(researchPapers.slug, parsed.slug))
      .get();
    if (existing) continue; // Don't overwrite manually-edited papers.

    db.insert(researchPapers).values({
      id: randomUUID(),
      slug: parsed.slug,
      title: parsed.title,
      summary: parsed.summary ?? "",
      format: parsed.format ?? "research",
      abstract: parsed.abstract ?? "",
      contentIntro: parsed.contentIntro ?? "",
      contentUndergrad: parsed.contentUndergrad ?? "",
      contentGrad: parsed.contentGrad ?? "",
      canonicalTier: parsed.canonicalTier ?? "undergrad",
      paperStructureJson: JSON.stringify(parsed.paperStructure ?? {}),
      referencesJson: JSON.stringify(parsed.references ?? []),
      coauthorsJson: JSON.stringify(parsed.coauthors ?? []),
      coverEmoji: parsed.coverEmoji ?? "📄",
      accentColor: parsed.accentColor ?? "violet",
      status: parsed.status ?? "published",
      tags: JSON.stringify(parsed.tags ?? []),
      authorId,
    }).run();
    count++;
  }
  console.log(`  Seeded ${count} research paper${count === 1 ? "" : "s"}.`);
}

// Sprint 52 — load capstone tracks from seed-content/tracks/*.json.
// Each track JSON has { slug, title, summary, ..., capstones: [{slug,
// optional?}] }. The loader resolves capstone slugs to IDs and
// upserts the (track, capstone) join rows.
async function seedCapstoneTracks() {
  const dir = path.join(import.meta.dir, "../../../seed-content/tracks");
  if (!fs.existsSync(dir)) return;

  const systemUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "system"))
    .get();
  if (!systemUser) return; // capstones loader didn't run; nothing to attach

  // Phase 41 — `demo-*` tracks only seed when SEED_DEMO=1.
  const files = fs
    .readdirSync(dir)
    .filter(
      (f) => f.endsWith(".json") && (SEED_DEMO || !f.startsWith("demo-")),
    );
  let count = 0;
  for (const file of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed?.slug || !parsed?.title) continue;

    const existing = db
      .select({ id: capstoneTracks.id })
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, parsed.slug))
      .get();

    let trackId: string;
    const values = {
      slug: parsed.slug,
      title: parsed.title,
      summary: parsed.summary ?? "",
      contentIntro: parsed.contentIntro ?? "",
      contentUndergrad: parsed.contentUndergrad ?? "",
      contentGrad: parsed.contentGrad ?? "",
      canonicalTier: parsed.canonicalTier ?? "undergrad",
      coverEmoji: parsed.coverEmoji ?? "🎯",
      accentColor: parsed.accentColor ?? "violet",
      tags: JSON.stringify(parsed.tags ?? []),
      status: parsed.status ?? "published",
      authorId: systemUser.id,
    };
    if (existing) {
      trackId = existing.id;
      db.update(capstoneTracks)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(capstoneTracks.id, existing.id))
        .run();
      db.delete(capstoneTrackCapstones)
        .where(eq(capstoneTrackCapstones.trackId, trackId))
        .run();
    } else {
      trackId = randomUUID();
      db.insert(capstoneTracks).values({ id: trackId, ...values }).run();
    }

    const items: any[] = Array.isArray(parsed.capstones) ? parsed.capstones : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const slug = typeof it === "string" ? it : it?.slug;
      if (!slug) continue;
      const cap = db
        .select({ id: capstones.id })
        .from(capstones)
        .where(eq(capstones.slug, slug))
        .get();
      if (!cap) {
        console.warn(`  track ${parsed.slug}: capstone "${slug}" not found, skipping.`);
        continue;
      }
      db.insert(capstoneTrackCapstones).values({
        trackId,
        capstoneId: cap.id,
        order: typeof it === "object" && typeof it.order === "number" ? it.order : i,
        optional: typeof it === "object" && it.optional ? 1 : 0,
      }).run();
    }
    count++;
  }
  console.log(`  Seeded ${count} capstone track${count === 1 ? "" : "s"}.`);
}

// S86 — pet cosmetic catalog. Idempotent on slug. Reads
// `seed-content/pet-cosmetics/cosmetics.json` (single file, list of
// cosmetics) so the seed is one round-trip rather than per-file.
function seedPetCosmetics() {
  const file = path.join(import.meta.dir, "../../../seed-content/pet-cosmetics/cosmetics.json");
  if (!fs.existsSync(file)) return;
  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    console.warn("  Skipping pet cosmetics: invalid JSON.");
    return;
  }
  const list = Array.isArray(parsed?.cosmetics) ? parsed.cosmetics : [];
  let count = 0;
  for (const c of list) {
    if (!c?.slug || !c?.name || !c?.slot) continue;
    const existing = db
      .select({ id: petCosmetics.id })
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, c.slug))
      .get();
    const values = {
      slug: c.slug,
      name: c.name,
      slot: c.slot,
      renderKind: c.renderKind ?? "emoji",
      emoji: c.emoji ?? null,
      rarity: c.rarity ?? "common",
      grantOnly: c.grantOnly ?? true,
      description: c.description ?? "",
      // S89 — null = not for sale; positive int = purchasable.
      xpCost: typeof c.xpCost === "number" && c.xpCost > 0 ? c.xpCost : null,
      // Phase M — failSmall flag (hides cosmetic on tiny avatars).
      failSmall: c.failSmall === true,
    };
    if (existing) {
      db.update(petCosmetics).set(values).where(eq(petCosmetics.id, existing.id)).run();
    } else {
      db.insert(petCosmetics).values({ id: randomUUID(), ...values }).run();
    }
    count++;
  }
  console.log(`  Seeded ${count} pet cosmetic${count === 1 ? "" : "s"}.`);
}

// Phase L — pet skin catalog. Idempotent on slug. Reads
// `seed-content/pet-skins/skins.json` (single file, list of skins
// with nested fx object) and flattens the fx fields into the flat
// columns on pet_skins. Same shape as seedPetCosmetics().
function seedPetSkins() {
  const file = path.join(import.meta.dir, "../../../seed-content/pet-skins/skins.json");
  if (!fs.existsSync(file)) return;
  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    console.warn("  Skipping pet skins: invalid JSON.");
    return;
  }
  const list = Array.isArray(parsed?.skins) ? parsed.skins : [];
  let count = 0;
  for (const s of list) {
    if (!s?.slug || !s?.name) continue;
    const fx = s.fx ?? {};
    const glow = fx.glow ?? null;
    const values = {
      slug: s.slug,
      name: s.name,
      rarity: s.rarity ?? "common",
      obtain: s.obtain ?? "xp",
      xpCost: typeof s.xpCost === "number" && s.xpCost > 0 ? s.xpCost : null,
      description: s.description ?? "",
      fxFilter: typeof fx.filter === "string" ? fx.filter : null,
      fxOpacity: typeof fx.opacity === "number" ? fx.opacity : 1,
      fxGlowColor: glow?.color ?? null,
      fxGlowBlur: typeof glow?.blur === "number" ? glow.blur : null,
      fxGlowAlpha: typeof glow?.alpha === "number" ? glow.alpha : null,
      fxBg: typeof fx.bg === "string" ? fx.bg : null,
      fxParticles: typeof fx.particles === "string" ? fx.particles : null,
      fxRing: typeof fx.ring === "string" ? fx.ring : null,
      fxAnimated: typeof fx.animated === "string" ? fx.animated : null,
    };
    const existing = db
      .select({ id: petSkins.id })
      .from(petSkins)
      .where(eq(petSkins.slug, s.slug))
      .get();
    if (existing) {
      db.update(petSkins).set(values).where(eq(petSkins.id, existing.id)).run();
    } else {
      db.insert(petSkins).values({ id: randomUUID(), ...values }).run();
    }
    count++;
  }
  console.log(`  Seeded ${count} pet skin${count === 1 ? "" : "s"}.`);
}

// S108 — Demo cohort for the pitch path.
//
// Adds one instructor, six students, one class ("Intro to Machine
// Learning — Spring 2026"), three tasks, and a fully-completed
// signed capstone for `demo-student-6` against the `clip-style-retriever`
// capstone. Idempotent on slug: re-running seed is safe and the
// instructor/students are reused if they already exist.
//
// All accounts share the password `demo` (hashed below). They are
// only safe to use on a controlled demo deploy; pitch deploy config
// should disable signups or require an invite to prevent these from
// being attacked in production.
async function seedDemoCohort() {
  const DEMO_PASSWORD_HASH = Bun.password.hashSync("demo");

  function ensureUser(username: string, displayName: string, bio: string): string {
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
    if (existing) return existing.id;
    const id = randomUUID();
    db.insert(users).values({
      id,
      username,
      email: `${username}@axiomic.local`,
      passwordHash: DEMO_PASSWORD_HASH,
      displayName,
      bio,
      // S108 — demo accounts are pre-verified so the pitch path can
      // publish/upload without the verify-email gate.
      emailVerifiedAt: new Date().toISOString(),
    }).run();
    return id;
  }

  const instructorId = ensureUser(
    "demo-instructor",
    "Dr. Demo Instructor",
    "Pitch-demo instructor account. Teaches Intro to Machine Learning — Spring 2026.",
  );

  const studentIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    studentIds.push(
      ensureUser(
        `demo-student-${i}`,
        `Demo Student ${i}`,
        `Pitch-demo student account in Intro to Machine Learning — Spring 2026.`,
      ),
    );
  }
  const completeStudentId = studentIds[5]; // demo-student-6

  // Class. Stable slug + joinCode so the pitch demo can reference
  // them by URL / clipboard without re-reading the seed output.
  const CLASS_SLUG = "intro-to-ml-demo";
  const CLASS_JOIN_CODE = "DEMO2026";
  let classId: string;
  const existingClass = db.select({ id: classes.id }).from(classes).where(eq(classes.slug, CLASS_SLUG)).get();
  if (existingClass) {
    classId = existingClass.id;
  } else {
    classId = randomUUID();
    db.insert(classes).values({
      id: classId,
      slug: CLASS_SLUG,
      title: "Intro to Machine Learning — Spring 2026",
      term: "Spring 2026",
      description:
        "Demo cohort used to showcase Axiomic's classroom and competency-verification flow to college administrators and investors.",
      syllabusMd:
        "# Syllabus\n\nWeek 1: Foundations (linear models, loss functions)\nWeek 2: Optimization (SGD, momentum)\nWeek 3: Neural nets\nWeek 4: Contrastive learning + capstone kickoff\nWeek 5: Capstone milestones 1-2\nWeek 6: Capstone milestones 3-4 + final review",
      welcomeMessageMd:
        "Welcome! This class showcases Axiomic's classroom + verification flow. Open the cohort dashboard to see roster progress, or jump straight to a student's signed capstone artifact.",
      discoverable: true,
      joinCode: CLASS_JOIN_CODE,
      status: "active",
      instructorId,
    }).run();
  }

  // Enroll every student. Idempotent on (classId, userId).
  for (const studentId of studentIds) {
    const existing = db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(and(eq(classEnrollments.classId, classId), eq(classEnrollments.userId, studentId)))
      .get();
    if (existing) continue;
    db.insert(classEnrollments).values({
      id: randomUUID(),
      classId,
      userId: studentId,
      role: "student",
    }).run();
  }

  // Three demo tasks. Idempotent by (classId, title).
  const demoTasks: Array<{ title: string; kind: "reading" | "homework"; descriptionMd: string; xpReward: number; }> = [
    {
      title: "Read: What is a loss function?",
      kind: "reading",
      descriptionMd: "Read the linked wiki page on loss functions.",
      xpReward: 10,
    },
    {
      title: "Homework: Implement softmax from scratch",
      kind: "homework",
      descriptionMd: "Implement the softmax function and verify gradients against autograd.",
      xpReward: 25,
    },
    {
      title: "Homework: Train a small MLP on MNIST",
      kind: "homework",
      descriptionMd: "Train a 2-layer MLP on MNIST. Report final test accuracy.",
      xpReward: 30,
    },
  ];

  const taskIds: string[] = [];
  for (const t of demoTasks) {
    const existing = db
      .select({ id: classTasks.id })
      .from(classTasks)
      .where(and(eq(classTasks.classId, classId), eq(classTasks.title, t.title)))
      .get();
    if (existing) {
      taskIds.push(existing.id);
      continue;
    }
    const taskId = randomUUID();
    db.insert(classTasks).values({
      id: taskId,
      classId,
      kind: t.kind,
      title: t.title,
      descriptionMd: t.descriptionMd,
      xpReward: t.xpReward,
      createdById: instructorId,
    }).run();
    taskIds.push(taskId);
  }

  function ensureCompletion(taskId: string, studentId: string, payload: {
    content: string | null;
    gradeJson?: string;
    gradedAt?: string;
  }) {
    const existing = db
      .select({ id: classTaskCompletions.id })
      .from(classTaskCompletions)
      .where(and(eq(classTaskCompletions.taskId, taskId), eq(classTaskCompletions.userId, studentId)))
      .get();
    if (existing) return;
    db.insert(classTaskCompletions).values({
      id: randomUUID(),
      taskId,
      userId: studentId,
      content: payload.content,
      gradeJson: payload.gradeJson,
      gradedAt: payload.gradedAt,
    }).run();
  }

  // Mid-progress for students 1 and 2: each completes the first task.
  for (let i = 0; i < 2; i++) {
    ensureCompletion(taskIds[0], studentIds[i], { content: null });
  }

  // Fully-complete student: demo-student-6. All three tasks completed
  // and graded as passing. Capstone enrollment + signed transcript
  // happen below.
  const now = new Date().toISOString();
  for (const taskId of taskIds) {
    ensureCompletion(taskId, completeStudentId, {
      content: "Submitted for demo. Pass on review.",
      gradeJson: JSON.stringify({ pass: true, feedback: "Strong submission. Pass." }),
      gradedAt: now,
    });
  }

  // Signed capstone artifact. Look up the clip-style-retriever capstone
  // (seeded earlier) and the demo student. Create an enrollment with
  // completedAt set + artifactPageSlug populated so /verify and the
  // transcript route work end-to-end. If the capstone wasn't seeded
  // (e.g. seed-content/capstones missing), skip with a warning instead
  // of failing the whole seed.
  const targetCapstoneSlug = "clip-style-retriever";
  const targetCapstone = db
    .select({ id: capstones.id, title: capstones.title })
    .from(capstones)
    .where(eq(capstones.slug, targetCapstoneSlug))
    .get();
  if (!targetCapstone) {
    console.warn(`  Demo seed: capstone '${targetCapstoneSlug}' not seeded; skipping signed transcript.`);
  } else {
    const ARTIFACT_SLUG = `demo-student-6-${targetCapstoneSlug}`;
    const existingEnrollment = db
      .select({ id: capstoneEnrollments.id })
      .from(capstoneEnrollments)
      .where(eq(capstoneEnrollments.artifactPageSlug, ARTIFACT_SLUG))
      .get();
    let enrollmentId: string;
    if (existingEnrollment) {
      enrollmentId = existingEnrollment.id;
    } else {
      enrollmentId = randomUUID();
      const startedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(); // 60 days ago
      const completedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(); // 2 days ago
      db.insert(capstoneEnrollments).values({
        id: enrollmentId,
        capstoneId: targetCapstone.id,
        userId: completeStudentId,
        startedAt,
        completedAt,
        artifactPageSlug: ARTIFACT_SLUG,
      }).run();
    }

    // Insert a passing submission for every milestone on this capstone.
    // Idempotent on (enrollmentId, milestoneId) via the unique index.
    const milestoneRows = db
      .select({ id: capstoneMilestones.id, order: capstoneMilestones.order, title: capstoneMilestones.title })
      .from(capstoneMilestones)
      .where(eq(capstoneMilestones.capstoneId, targetCapstone.id))
      .all();
    milestoneRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const submittedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString();
    const gradedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
    for (const m of milestoneRows) {
      const existingSub = db
        .select({ id: capstoneSubmissions.id })
        .from(capstoneSubmissions)
        .where(and(eq(capstoneSubmissions.enrollmentId, enrollmentId), eq(capstoneSubmissions.milestoneId, m.id)))
        .get();
      if (existingSub) continue;
      const score = 0.85 + (m.order ?? 0) * 0.02; // 0.85, 0.87, 0.89, 0.91
      db.insert(capstoneSubmissions).values({
        id: randomUUID(),
        enrollmentId,
        milestoneId: m.id,
        writeup: `Demo submission for "${m.title}". Auto-passed by seed for pitch path.`,
        status: "passed",
        aiGradeJson: JSON.stringify({
          totalScore: Number(score.toFixed(2)),
          summary: `Strong work on "${m.title}". Demo grade for pitch path.`,
          gradedBy: "axiomic-demo-seed",
        }),
        submittedAt,
        gradedAt,
      }).run();
    }
    console.log(`  Demo cohort: signed-transcript artifact ready at /verify?artifact=${ARTIFACT_SLUG}`);
  }

  console.log("  Demo cohort seeded: 1 instructor + 6 students, joinCode " + CLASS_JOIN_CODE + ".");
}

// ============================================================
// Phase 41 — gated pre-beta demo content (SEED_DEMO=1). Additive,
// idempotent (stable slugs, select-before-insert). The always-on
// seeders (incl. seedDemoCohort) are untouched.
// ============================================================

function ensureOrgMember(orgId: string, userId: string, role: string): void {
  const existing = db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .get();
  if (existing) return;
  db.insert(orgMembers)
    .values({ id: randomUUID(), orgId, userId, role })
    .run();
}

function seedDemoOrgs(): void {
  if (!SEED_DEMO) return;
  const ORGS = [
    {
      slug: "climate-futures-institute",
      name: "Climate Futures Institute",
      descriptionMd:
        "An independent institute funding open climate-resilience research and reproducible early-warning tooling for vulnerable regions.",
      website: "https://example.org/climate-futures",
      verificationStatus: "verified",
      admin: ["org-climate-admin", "Dr. Lena Ortiz"],
      verifier: ["org-climate-verifier", "Dr. Sam Whitfield"],
    },
    {
      slug: "world-nutrition-alliance",
      name: "World Nutrition Alliance",
      descriptionMd:
        "A coalition of public-health groups working on open dietary-data standards and micronutrient-deficiency mapping.",
      website: "https://example.org/world-nutrition",
      verificationStatus: "verified",
      admin: ["org-nutrition-admin", "Dr. Amara Diallo"],
      verifier: ["org-nutrition-verifier", "Dr. Ravi Menon"],
    },
    {
      slug: "global-health-equity-lab",
      name: "Global Health Equity Lab",
      descriptionMd:
        "University lab focused on supply-chain reliability and forecasting for essential medicines in under-served clinics.",
      website: "https://example.org/health-equity",
      verificationStatus: "unverified",
      admin: ["org-health-admin", "Dr. Priya Nair"],
      verifier: ["org-health-verifier", "Dr. Tom Becker"],
    },
  ];
  for (const o of ORGS) {
    const adminId = ensureDemoUser(
      o.admin[0],
      o.admin[1],
      `${o.name} — administrator (demo account).`,
    );
    const verifierId = ensureDemoUser(
      o.verifier[0],
      o.verifier[1],
      `${o.name} — verifier (demo account).`,
    );
    let orgId: string;
    const existing = db
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.slug, o.slug))
      .get();
    if (existing) {
      orgId = existing.id;
    } else {
      orgId = randomUUID();
      db.insert(orgs)
        .values({
          id: orgId,
          slug: o.slug,
          name: o.name,
          descriptionMd: o.descriptionMd,
          website: o.website,
          verificationStatus: o.verificationStatus,
          creatorId: adminId,
        })
        .run();
    }
    ensureOrgMember(orgId, adminId, "admin");
    ensureOrgMember(orgId, verifierId, "verifier");
  }
  console.log("  [demo] Seeded 3 orgs (admin + verifier each).");
}

function ensureMissionMember(
  missionId: string,
  userId: string,
  role: string,
): void {
  const existing = db
    .select({ id: missionMembers.id })
    .from(missionMembers)
    .where(
      and(
        eq(missionMembers.missionId, missionId),
        eq(missionMembers.userId, userId),
      ),
    )
    .get();
  if (existing) return;
  db.insert(missionMembers)
    .values({ id: randomUUID(), missionId, userId, role })
    .run();
}

function seedDemoMissions(): void {
  if (!SEED_DEMO) return;
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();
  const missionBySlug = (slug: string) =>
    db.select({ id: missions.id }).from(missions).where(eq(missions.slug, slug)).get();

  // verified == minted flag + the reviewers' confirms (populates the
  // public impact graph + verified UI; the signed/transparency chain
  // is exercised by the tester completing the live mint on a pending
  // one). pending == one confirm below the 3.0 weight threshold.
  const addContribution = (
    missionId: string,
    subproblemId: string | null,
    userId: string,
    kind: string,
    bodyMd: string,
    artifacts: Array<{ kind: string; url: string; label: string }>,
    reviewerIds: string[],
    minted: boolean,
  ): void => {
    const cid = randomUUID();
    db.insert(missionContributions)
      .values({
        id: cid,
        missionId,
        subproblemId,
        userId,
        kind,
        bodyMd,
        artifactsJson: JSON.stringify(artifacts),
        credentialMintedAt: minted ? daysAgo(1) : null,
        credentialMintWeight: minted ? 3.0 : null,
      })
      .run();
    for (const rid of reviewerIds) {
      db.insert(missionContributionReviews)
        .values({
          id: randomUUID(),
          contributionId: cid,
          reviewerId: rid,
          verdict: "confirmed",
          notesMd:
            "Reproduced the core result from the linked artifacts; method and data check out.",
        })
        .run();
    }
  };

  const addSub = (
    id: string,
    missionId: string,
    createdById: string,
    slug: string,
    title: string,
    descriptionMd: string,
    status: string,
    order: number,
  ): void => {
    db.insert(missionSubproblems)
      .values({
        id,
        missionId,
        slug,
        title,
        descriptionMd,
        status,
        order,
        createdById,
      })
      .run();
  };

  const backWith = (
    missionId: string,
    orgSlug: string,
    addedByUserId: string,
  ): void => {
    const org = db
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.slug, orgSlug))
      .get();
    if (!org) return;
    db.insert(missionOrgBackers)
      .values({ id: randomUUID(), missionId, orgId: org.id, addedByUserId })
      .run();
  };

  // --- Mission 1: climate (backed; one verified, one pending) ---
  if (!missionBySlug("coastal-flood-early-warning")) {
    const lead = ensureDemoUser("mission-lead-climate", "Dr. Ada Reyes", "Coastal-resilience researcher (demo).");
    const eli = ensureDemoUser("contrib-eli", "Eli Tanaka", "Hydrology + ML (demo).");
    const mara = ensureDemoUser("contrib-mara", "Mara Costa", "Coastal data engineering (demo).");
    const r1 = ensureDemoUser("reviewer-oceanog-1", "Dr. Jun Park", "Oceanography reviewer (demo).");
    const r2 = ensureDemoUser("reviewer-oceanog-2", "Dr. Nadia Haddad", "Coastal-engineering reviewer (demo).");
    const mId = randomUUID();
    db.insert(missions)
      .values({
        id: mId,
        slug: "coastal-flood-early-warning",
        title: "Open coastal-flood early-warning for data-sparse deltas",
        problemMd:
          "Hundreds of millions live in low-lying deltas with little or no flood-warning infrastructure. Commercial nowcasts are closed and tuned for instrumented coastlines. **Goal:** an open, reproducible early-warning baseline that works where tide-gauge coverage is sparse.",
        summaryMd:
          "Open early-warning baseline for under-instrumented coastlines: gap-fill sparse tide gauges, a surge nowcast baseline, and a last-mile alert protocol.",
        theme: "climate",
        topicTagsJson: JSON.stringify(["climate", "forecasting", "open-data"]),
        status: "active",
        creatorId: lead,
      })
      .run();
    ensureMissionMember(mId, lead, "organizer");
    ensureMissionMember(mId, eli, "member");
    ensureMissionMember(mId, mara, "member");
    const sp1 = randomUUID();
    const sp2 = randomUUID();
    const sp3 = randomUUID();
    addSub(sp1, mId, lead, "tide-gauge-gap-filling", "Gap-fill sparse tide-gauge series", "Impute missing tide-gauge readings well enough to drive a surge model where temporal coverage is under 30%.", "solved", 0);
    addSub(sp2, mId, lead, "surge-nowcast-baseline", "A reproducible surge-nowcast baseline", "An open baseline turning weather + tide inputs into a 0–24h surge nowcast.", "in_progress", 1);
    addSub(sp3, mId, lead, "community-alert-protocol", "Last-mile community alert protocol", "A low-bandwidth alert protocol (SMS / radio) from nowcast output to at-risk households.", "open", 2);
    addContribution(
      mId,
      sp1,
      eli,
      "analysis",
      "I compared Gaussian-process imputation against kriging and a seasonal-naive baseline on three deltas with 22–28% gauge coverage. A GP with a Matérn-3/2 kernel and a tidal-harmonic mean function cut RMSE 31% vs kriging at the 6h horizon. The held-out delta was never used for kernel selection. Method note and code are linked.",
      [
        { kind: "github", url: "https://github.com/axiomic-demo/tide-gp", label: "Method + code" },
        { kind: "paper", url: "https://example.org/tide-gp-note.pdf", label: "Method note (PDF)" },
      ],
      [r1, r2],
      true,
    );
    addContribution(
      mId,
      sp2,
      mara,
      "data",
      "Harmonized 11 years of hourly tide + ERA5 wind/pressure for the three pilot deltas into a single tidy parquet, with a reproducible build script and a data dictionary — the input layer the nowcast baseline can train on.",
      [{ kind: "dataset", url: "https://example.org/delta-surge-dataset", label: "Harmonized dataset" }],
      [r1],
      false,
    );
    backWith(mId, "climate-futures-institute", lead);
  }

  // --- Mission 2: hunger (backed; one verified, one pending) ---
  if (!missionBySlug("micronutrient-gap-mapping")) {
    const lead = ensureDemoUser("mission-lead-nutrition", "Dr. Omar Said", "Public-health nutrition (demo).");
    const priya = ensureDemoUser("contrib-priya", "Priya Shah", "Survey methods (demo).");
    const luis = ensureDemoUser("contrib-luis", "Luis Romero", "Geo-statistics (demo).");
    const r1 = ensureDemoUser("reviewer-nutri-1", "Dr. Mei Lin", "Nutrition reviewer (demo).");
    const r2 = ensureDemoUser("reviewer-nutri-2", "Dr. Kofi Mensah", "Epidemiology reviewer (demo).");
    const mId = randomUUID();
    db.insert(missions)
      .values({
        id: mId,
        slug: "micronutrient-gap-mapping",
        title: "Map household micronutrient gaps from open dietary-survey data",
        problemMd:
          "Micronutrient deficiency is invisible in calorie-based hunger metrics. Open dietary surveys exist but are fragmented across incompatible schemas. **Goal:** a harmonized pipeline turning open survey microdata into a household-level deficiency-risk map.",
        summaryMd:
          "Harmonize open dietary surveys → a household-level micronutrient-deficiency-risk map and a policy brief.",
        theme: "hunger",
        topicTagsJson: JSON.stringify(["hunger", "nutrition", "open-data"]),
        status: "active",
        creatorId: lead,
      })
      .run();
    ensureMissionMember(mId, lead, "organizer");
    ensureMissionMember(mId, priya, "member");
    ensureMissionMember(mId, luis, "member");
    const sp1 = randomUUID();
    const sp2 = randomUUID();
    const sp3 = randomUUID();
    addSub(sp1, mId, lead, "survey-harmonization", "Harmonize incompatible dietary surveys", "Map 6 national survey schemas onto one open food-composition + intake schema.", "solved", 0);
    addSub(sp2, mId, lead, "deficiency-risk-model", "Household deficiency-risk model", "From harmonized intake → per-household iron/zinc/vitamin-A deficiency-risk scores.", "in_progress", 1);
    addSub(sp3, mId, lead, "policy-brief", "Decision-maker policy brief", "A short, sourced brief translating the risk map into fortification recommendations.", "open", 2);
    addContribution(
      mId,
      sp1,
      priya,
      "solution",
      "Built an open crosswalk mapping six national dietary-survey schemas onto a single intake schema keyed to a public food-composition table. Validated on overlapping respondents (n≈4,100): agreement on energy intake within ±6% and iron within ±9%. Crosswalk, validation notebook, and harmonized extract are linked.",
      [
        { kind: "github", url: "https://github.com/axiomic-demo/diet-crosswalk", label: "Crosswalk + validation" },
        { kind: "dataset", url: "https://example.org/harmonized-intake", label: "Harmonized extract" },
      ],
      [r1, r2],
      true,
    );
    addContribution(
      mId,
      sp2,
      luis,
      "analysis",
      "First-pass deficiency-risk model: a calibrated logistic on harmonized intake + household covariates, AUROC 0.78 on a held-out country. Writeup discusses calibration drift across regions and what's needed before this is decision-grade.",
      [{ kind: "github", url: "https://github.com/axiomic-demo/deficiency-risk", label: "Model + eval" }],
      [r1],
      false,
    );
    backWith(mId, "world-nutrition-alliance", lead);
  }

  // --- Mission 3: health (open, unbacked, pending only) ---
  if (!missionBySlug("malaria-stockout-forecasting")) {
    const lead = ensureDemoUser("mission-lead-health", "Dr. Sofia Almeida", "Health supply chains (demo).");
    const tariq = ensureDemoUser("contrib-tariq", "Tariq Aziz", "Operations research (demo).");
    const rev = ensureDemoUser("reviewer-health-1", "Dr. Gabriel Moreau", "Health-systems reviewer (demo).");
    const mId = randomUUID();
    db.insert(missions)
      .values({
        id: mId,
        slug: "malaria-stockout-forecasting",
        title: "Forecast antimalarial stock-outs in rural clinics",
        problemMd:
          "Rural clinics run out of antimalarials during demand spikes because ordering is reactive. **Goal:** an open short-horizon stock-out forecast clinics can act on with their existing data.",
        summaryMd:
          "An open short-horizon stock-out forecast for antimalarials in rural clinics.",
        theme: "health",
        topicTagsJson: JSON.stringify(["health", "supply-chain", "forecasting"]),
        status: "open",
        creatorId: lead,
      })
      .run();
    ensureMissionMember(mId, lead, "organizer");
    ensureMissionMember(mId, tariq, "member");
    const sp1 = randomUUID();
    const sp2 = randomUUID();
    addSub(sp1, mId, lead, "consumption-signal", "A clean consumption signal from messy clinic logs", "Turn inconsistent paper-digitized dispensing logs into a usable weekly consumption series.", "open", 0);
    addSub(sp2, mId, lead, "lead-time-model", "Model resupply lead-time variability", "Estimate the lead-time distribution so the forecast horizon matches reality.", "open", 1);
    addContribution(
      mId,
      sp1,
      tariq,
      "analysis",
      "Scoped the consumption-signal problem: characterized three failure modes in the digitized logs (duplicate batches, unit ambiguity, backfilled zeros) and proposed a reconciliation rule set with a small labeled validation set. Looking for a second reviewer before this drives a model.",
      [{ kind: "writeup", url: "https://example.org/stockout-signal-scoping", label: "Scoping writeup" }],
      [rev],
      false,
    );
  }

  console.log("  [demo] Seeded 3 missions (sub-problems, contributions, reviews; 2 org-backed).");
}

function seedDemoBounties(): void {
  if (!SEED_DEMO) return;
  const uid = (u: string) =>
    db.select({ id: users.id }).from(users).where(eq(users.username, u)).get()
      ?.id ?? ensureDemoUser(u, u, "Demo account.");
  const inDays = (n: number) =>
    new Date(Date.now() + n * 86_400_000).toISOString();
  const BOUNTIES: Array<{
    slug: string;
    title: string;
    descriptionMd: string;
    kind: string;
    rewardXp: number;
    status: string;
    maxClaimants: number;
    deadlineAt: string;
    poster: string;
    claim: string | null;
  }> = [
    {
      slug: "reproduce-coastal-nowcast",
      title: "Reproduce the coastal surge-nowcast baseline",
      descriptionMd:
        "Independently reproduce the surge-nowcast baseline from the Coastal Flood Early Warning mission on a fourth delta and report RMSE vs the seasonal-naive baseline.",
      kind: "reproduce",
      rewardXp: 300,
      status: "open",
      maxClaimants: 2,
      deadlineAt: inDays(30),
      poster: "mission-lead-climate",
      claim: null,
    },
    {
      slug: "extend-micronutrient-map",
      title: "Extend the micronutrient map to a new region",
      descriptionMd:
        "Apply the harmonization crosswalk to one additional national survey and contribute the validated extract back.",
      kind: "extend",
      rewardXp: 250,
      status: "open",
      maxClaimants: 1,
      deadlineAt: inDays(45),
      poster: "mission-lead-nutrition",
      claim: null,
    },
    {
      slug: "analyze-stockout-signal",
      title: "Analyze a candidate stock-out leading indicator",
      descriptionMd:
        "Evaluate whether clinic visit volume leads antimalarial consumption, with a clean evaluation on the open scoping dataset.",
      kind: "analyze",
      rewardXp: 200,
      status: "in_review",
      maxClaimants: 1,
      deadlineAt: inDays(10),
      poster: "mission-lead-health",
      claim: "contrib-tariq",
    },
  ];
  for (const b of BOUNTIES) {
    if (
      db
        .select({ id: researchBounties.id })
        .from(researchBounties)
        .where(eq(researchBounties.slug, b.slug))
        .get()
    ) {
      continue;
    }
    const bid = randomUUID();
    db.insert(researchBounties)
      .values({
        id: bid,
        slug: b.slug,
        title: b.title,
        descriptionMd: b.descriptionMd,
        kind: b.kind,
        rewardXp: b.rewardXp,
        status: b.status,
        maxClaimants: b.maxClaimants,
        deadlineAt: b.deadlineAt,
        discoverable: true,
        posterId: uid(b.poster),
      })
      .run();
    if (b.claim) {
      db.insert(bountyClaims)
        .values({
          id: randomUUID(),
          bountyId: bid,
          userId: uid(b.claim),
          status: "submitted",
        })
        .run();
    }
  }
  console.log("  [demo] Seeded 3 research bounties.");
}

function seedDemoHackathons(): void {
  if (!SEED_DEMO) return;
  const uid = (u: string) =>
    db.select({ id: users.id }).from(users).where(eq(users.username, u)).get()
      ?.id ?? ensureDemoUser(u, u, "Demo account.");
  const inDays = (n: number) =>
    new Date(Date.now() + n * 86_400_000).toISOString();

  if (
    !db
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.slug, "climate-ai-sprint-2026"))
      .get()
  ) {
    const organizer = uid("mission-lead-climate");
    const hId = randomUUID();
    db.insert(hackathons)
      .values({
        id: hId,
        slug: "climate-ai-sprint-2026",
        title: "Climate AI Sprint 2026",
        descriptionMd:
          "A 48-hour sprint building open tooling for climate resilience — flood nowcasts, heat-risk maps, grid forecasting. All fields welcome.",
        rulesMd:
          "Teams of up to 4. Links + writeups only (no uploads). An open-source license is required to be prize-eligible.",
        fieldTag: "climate",
        coverEmoji: "🌊",
        hostMode: "public",
        discoverable: true,
        status: "registration",
        maxTeamSize: 4,
        judgingMode: "manual",
        registrationOpensAt: new Date().toISOString(),
        startsAt: inDays(7),
        endsAt: inDays(9),
        createdById: organizer,
      })
      .run();
    db.insert(hackathonPrizes)
      .values({
        id: randomUUID(),
        hackathonId: hId,
        rank: 1,
        title: "Winner",
        descriptionMd: "Best overall climate-resilience tool.",
        xpAmount: 1000,
        maxWinners: 1,
      })
      .run();
    db.insert(hackathonPrizes)
      .values({
        id: randomUUID(),
        hackathonId: hId,
        rank: 2,
        title: "Runner-up",
        descriptionMd: "Second place.",
        xpAmount: 500,
        maxWinners: 1,
      })
      .run();
    const captain = uid("contrib-eli");
    const teamId = randomUUID();
    db.insert(hackathonTeams)
      .values({ id: teamId, hackathonId: hId, name: "Delta Forecasters", captainId: captain })
      .run();
    db.insert(hackathonTeamMembers)
      .values({
        id: randomUUID(),
        teamId,
        hackathonId: hId,
        userId: captain,
        role: "captain",
      })
      .run();
  }

  if (
    !db
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.slug, "health-data-jam"))
      .get()
  ) {
    db.insert(hackathons)
      .values({
        id: randomUUID(),
        slug: "health-data-jam",
        title: "Health Data Jam (draft)",
        descriptionMd:
          "An upcoming jam on essential-medicine supply reliability. Details being finalized.",
        fieldTag: "health",
        coverEmoji: "🩺",
        hostMode: "public",
        discoverable: false,
        status: "draft",
        maxTeamSize: 4,
        judgingMode: "manual",
        createdById: uid("mission-lead-health"),
      })
      .run();
  }
  console.log("  [demo] Seeded 2 hackathons (1 open w/ prizes + team, 1 draft).");
}

function seedDemoActivity(): void {
  if (!SEED_DEMO) return;
  const demoClass = db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.slug, "intro-to-ml-demo"))
    .get();
  const kinds = ["lesson_completed", "quiz_passed", "flashcard_review"];
  let seeded = 0;
  for (let i = 1; i <= 6; i++) {
    const u = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, `demo-student-${i}`))
      .get();
    if (!u) continue;
    // Idempotent: skip a student who already has any activity.
    const has = db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(eq(activityEvents.userId, u.id))
      .get();
    if (has) continue;
    // Earlier students are "more active" so the leaderboard has a
    // visible spread (student-1: 16 events … student-6: 6).
    const events = 4 + (7 - i) * 2;
    for (let e = 0; e < events; e++) {
      const day = new Date(Date.now() - (e % 10) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      db.insert(activityEvents)
        .values({
          id: randomUUID(),
          userId: u.id,
          kind: kinds[e % kinds.length],
          day,
        })
        .run();
    }
    db.insert(xpGrants)
      .values({
        id: randomUUID(),
        userId: u.id,
        classId: demoClass ? demoClass.id : null,
        source: "demo-activity",
        sourceRefId: `demo-activity-${i}`,
        amount: 50 * (7 - i),
      })
      .onConflictDoNothing()
      .run();
    seeded++;
  }
  console.log(`  [demo] Seeded activity for ${seeded} demo student(s).`);
}

seed().catch(console.error);
