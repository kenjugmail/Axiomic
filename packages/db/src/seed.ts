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
