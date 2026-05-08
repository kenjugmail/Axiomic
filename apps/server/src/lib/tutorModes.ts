// Sprint 30 — AI tutor mode system-prompt builders.
//
// Each mode contributes a paragraph to the chat system prompt that
// shapes the model's voice + behavior. Modes are selected explicitly
// by the user (chip row in the sidebar) or auto-picked from context.
//
// Five modes shipped in v1:
//   - socratic      → asks one calibrated question first
//   - misconception → probes a specific catalog entry, then corrects
//   - bridge        → ties the page to the user's strongest prereq
//   - debate        → argues the opposite of a forum claim
//   - contribution  → suggests gaps the user is positioned to fill

import { and, eq, sql } from "drizzle-orm";
import {
  forumTopics,
  forumPosts,
  getDb,
  masteryNodes,
  misconceptionCatalog,
  misconceptionDiagnoses,
  userProgress,
} from "@axiomic/db";
import type { TutorMode, TutorModeContext } from "@axiomic/types";

export interface TutorModeResult {
  prompt: string;
  // True when the mode requires extra context that the caller did not
  // supply (e.g. debate without a forumTopicId). Caller should reject
  // with a 400 to avoid silently downgrading.
  invalid?: string;
}

export function buildTutorModePrompt(
  mode: TutorMode,
  ctx: TutorModeContext,
  userId: string | null,
): TutorModeResult {
  switch (mode) {
    case "socratic":
      return {
        prompt: `You are in **Socratic mode**. Lead with ONE calibrated question that surfaces what the learner already knows or doesn't. Refuse to dump the answer until they attempt; if they hand-wave, ask a sharper question. End with a check ("does that match your intuition?"). Avoid lecture mode.`,
      };
    case "misconception":
      return buildMisconceptionPrompt(ctx, userId);
    case "bridge":
      return buildBridgePrompt(ctx, userId);
    case "debate":
      return buildDebatePrompt(ctx);
    case "contribution":
      return buildContributionPrompt(userId);
  }
}

function buildMisconceptionPrompt(
  ctx: TutorModeContext,
  userId: string | null,
): TutorModeResult {
  if (!ctx.diagnosisId) {
    return {
      prompt: "",
      invalid: "Misconception mode requires a diagnosisId.",
    };
  }
  if (!userId) {
    return {
      prompt: "",
      invalid: "Misconception mode requires an authenticated user.",
    };
  }
  const db = getDb();
  const diagnosis = db
    .select({
      id: misconceptionDiagnoses.id,
      userId: misconceptionDiagnoses.userId,
      label: misconceptionDiagnoses.label,
      misconceptionKey: misconceptionDiagnoses.misconceptionKey,
      conceptSlug: misconceptionDiagnoses.conceptSlug,
    })
    .from(misconceptionDiagnoses)
    .where(eq(misconceptionDiagnoses.id, ctx.diagnosisId))
    .get();
  if (!diagnosis || diagnosis.userId !== userId) {
    return { prompt: "", invalid: "Diagnosis not found." };
  }

  const catalog = db
    .select()
    .from(misconceptionCatalog)
    .where(eq(misconceptionCatalog.key, diagnosis.misconceptionKey))
    .get();

  const probeQuestions: string[] = (() => {
    if (!catalog) return [];
    try {
      const parsed = JSON.parse(catalog.probeQuestionsJson);
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  })();

  // Mark the diagnosis as 'coached' so the dashboard can reflect that
  // the learner has at least started addressing it.
  db.update(misconceptionDiagnoses)
    .set({ status: "coached" })
    .where(
      and(
        eq(misconceptionDiagnoses.id, diagnosis.id),
        eq(misconceptionDiagnoses.status, "active"),
      ),
    )
    .run();

  const probesBlock = probeQuestions.length
    ? `\n\nProbe questions:\n${probeQuestions.map((q) => `  - ${q}`).join("\n")}`
    : "";

  const correctionPrompt = catalog?.correctionPromptTemplate ?? "";

  return {
    prompt: `You are in **Misconception mode**. The learner has a diagnosed misconception about ${diagnosis.conceptSlug}: "${diagnosis.label}". ${correctionPrompt}${probesBlock}\n\nProcedure: 1) Ask one of the probe questions to confirm the misconception. 2) Walk them through the correction with concrete numbers. 3) End with a checkpoint question that would only succeed if the misconception is corrected.`,
  };
}

function buildBridgePrompt(
  ctx: TutorModeContext,
  userId: string | null,
): TutorModeResult {
  if (!ctx.pageSlug) {
    return { prompt: "", invalid: "Bridge mode requires a pageSlug." };
  }
  if (!userId) {
    return {
      prompt: "",
      invalid: "Bridge mode requires an authenticated user.",
    };
  }
  const db = getDb();

  // Sprint 32 — anchor selection now intersects with the current page's
  // actual prereqs. We find mastery nodes that include `ctx.pageSlug` in
  // their pageIds, walk their prerequisiteNodeIds, then pick the user's
  // highest-scored mastered node *among those prereqs*. Falls back to
  // global highest-mastered when prereqs are unavailable.
  const hostNodes = db
    .select({
      id: masteryNodes.id,
      prerequisiteNodeIds: masteryNodes.prerequisiteNodeIds,
    })
    .from(masteryNodes)
    .where(
      sql`EXISTS (SELECT 1 FROM json_each(${masteryNodes.pageIds}) WHERE value = ${ctx.pageSlug})`,
    )
    .all();

  const prereqIds = new Set<string>();
  for (const h of hostNodes) {
    try {
      const ids = JSON.parse(h.prerequisiteNodeIds);
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string") prereqIds.add(id);
        }
      }
    } catch {}
  }

  const progress = db
    .select({
      nodeId: userProgress.nodeId,
      quizScore: userProgress.quizScore,
    })
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .all();

  const mastered = progress
    .filter((p) => p.quizScore != null && p.quizScore >= 0.7)
    .sort((a, b) => (b.quizScore ?? 0) - (a.quizScore ?? 0));

  let anchorNodeId: string | null = null;
  if (prereqIds.size > 0) {
    const matched = mastered.find((p) => prereqIds.has(p.nodeId));
    if (matched) anchorNodeId = matched.nodeId;
  }
  // Fall back to global highest-mastered if no prereq match.
  if (!anchorNodeId && mastered.length > 0) {
    anchorNodeId = mastered[0].nodeId;
  }

  let anchor = "";
  if (anchorNodeId) {
    const node = db
      .select({ slug: masteryNodes.slug, title: masteryNodes.title })
      .from(masteryNodes)
      .where(eq(masteryNodes.id, anchorNodeId))
      .get();
    if (node) {
      const isPrereq = prereqIds.has(anchorNodeId);
      anchor = isPrereq
        ? `The learner has mastered "${node.title}" (slug: ${node.slug}), which is a direct prerequisite of ${ctx.pageSlug}. Use it as the bridge anchor.`
        : `The learner has mastered "${node.title}" (slug: ${node.slug}). It is not a direct prerequisite of ${ctx.pageSlug}, so bridge analogically rather than by reduction.`;
    }
  }

  return {
    prompt: `You are in **Bridge mode**. Build a minimal-viable explanation that bridges what the learner DOES know to ${ctx.pageSlug}.${anchor ? `\n\n${anchor}` : ""}\n\nProcedure: 1) State the bridge — "Since you know X, ${ctx.pageSlug} is X with one twist." 2) Explain the twist in plain language. 3) Defer the heavy machinery; offer to go deeper if they want.`,
  };
}

function buildDebatePrompt(ctx: TutorModeContext): TutorModeResult {
  if (!ctx.forumTopicId) {
    return { prompt: "", invalid: "Debate mode requires a forumTopicId." };
  }
  const db = getDb();
  const topic = db
    .select({
      id: forumTopics.id,
      title: forumTopics.title,
      postType: forumTopics.postType,
    })
    .from(forumTopics)
    .where(eq(forumTopics.id, ctx.forumTopicId))
    .get();
  if (!topic) {
    return { prompt: "", invalid: "Forum topic not found." };
  }

  // Pull the OP body + recent replies for context.
  const posts = db
    .select({ body: forumPosts.body })
    .from(forumPosts)
    .where(eq(forumPosts.topicId, topic.id))
    .all();
  const opBody = posts[0]?.body ?? "";

  return {
    prompt: `You are in **Debate mode** on a forum thread titled "${topic.title}" (postType: ${topic.postType}).\n\nThread opener:\n${opBody.slice(0, 1500)}\n\nProcedure: Argue the OPPOSITE position to stress-test the learner's reasoning. Be precise — name your strongest counter-argument upfront, then steelman it. End with: "Where did your strongest counter-argument land?"`,
  };
}

function buildContributionPrompt(userId: string | null): TutorModeResult {
  if (!userId) {
    return {
      prompt: "",
      invalid: "Contribution mode requires an authenticated user.",
    };
  }
  return {
    prompt: `You are in **Contribution mode**. The learner has been reading recently but hasn't written. Suggest THREE specific gaps on the platform where they could contribute — a wiki edit, a forum reply, or a research paper. Be concrete: name the slug or topic, name the gap, suggest a one-paragraph contribution. Make it feel achievable, not assigned.`,
  };
}
