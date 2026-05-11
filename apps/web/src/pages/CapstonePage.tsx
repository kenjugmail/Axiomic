// Sprint 26-27 — Capstone read page.
//
// Renders the brief at the chosen tier, the milestone overview, the
// prereq X-ray (when prerequisites are declared), and the enroll
// affordance. Once enrolled, the page surfaces a "Continue capstone"
// CTA pointing to the workspace.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  BookMarked,
  GraduationCap,
  ChevronRight,
  History,
  Sparkles,
  Lock,
  ListChecks,
  Mountain,
  Target,
  Calendar,
} from "lucide-react";
import type { Capstone, CapstoneTier } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TierToggle } from "../components/research/TierToggle";
import { TutorMount } from "../components/ai/TutorMount";
import { PrereqXray } from "../components/prereq/PrereqXray";
import { CiteDialog } from "../components/citations/CiteDialog";
import { toast } from "../stores/toast";

export function CapstonePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [capstone, setCapstone] = useState<Capstone | null>(null);
  // Sprint 63h — root for the selection-to-chat popover.
  const briefBodyRef = useRef<HTMLDivElement | null>(null);
  const [tier, setTier] = useState<CapstoneTier>("undergrad");
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [citeOpen, setCiteOpen] = useState(false);

  useEffect(() => {
    setCapstone(null);
    api.capstones
      .get(slug, tier)
      .then((r) => {
        setCapstone(r.capstone);
        if (r.capstone.tier !== tier) setTier(r.capstone.tier);
      })
      .catch((e) => setError(e?.message ?? "Failed to load capstone"));
  }, [slug, tier]);

  const enroll = async () => {
    if (!user) {
      navigate(`/login?redirect=/capstones/${slug}`);
      return;
    }
    setEnrolling(true);
    try {
      await api.capstones.enroll(slug);
      const r = await api.capstones.get(slug, tier);
      setCapstone(r.capstone);
      toast.success(`Enrolled in ${r.capstone.title}`);
    } catch (e) {
      // Sprint 67c — enroll failures are transient + don't block the
      // page; fire as a toast instead of replacing the page with an
      // error state.
      const message = e instanceof Error ? e.message : "Failed to enroll";
      toast.error(message);
    } finally {
      setEnrolling(false);
    }
  };

  const passedSet = useMemo(
    () => new Set(capstone?.myEnrollment?.passedMilestoneIds ?? []),
    [capstone],
  );
  const revisionSet = useMemo(
    () => new Set(capstone?.myEnrollment?.needsRevisionMilestoneIds ?? []),
    [capstone],
  );

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link to="/capstones" className="text-sm text-primary hover:underline mt-4 inline-block">
          Back to capstones
        </Link>
      </div>
    );
  }

  if (!capstone) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  const enrollment = capstone.myEnrollment;
  const allPassed =
    enrollment != null &&
    enrollment.passedMilestoneIds.length === capstone.milestones.length;

  return (
    <div ref={briefBodyRef} className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
        <Link to="/capstones" className="hover:text-foreground">
          Capstones
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span>{capstone.title}</span>
        {capstone.status === "draft" && (
          <span className="text-amber-500 ml-2 inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> draft
          </span>
        )}
      </div>

      {/* Header */}
      <header className="mb-6">
        <div className="text-5xl mb-3">{capstone.coverEmoji}</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {capstone.title}
        </h1>
        {capstone.summary && (
          <p className="text-base text-muted-foreground mt-2 leading-relaxed">
            {capstone.summary}
          </p>
        )}
        <div className="text-xs text-muted-foreground mt-3 flex items-center gap-3 flex-wrap">
          <span>
            by{" "}
            <Link
              to={`/u/${capstone.authorUsername}`}
              className="text-foreground hover:underline"
            >
              {capstone.authorDisplayName || capstone.authorUsername}
            </Link>
          </span>
          <span>·</span>
          {capstone.scaleTier === "long_arc" &&
          capstone.estimatedHoursMin != null &&
          capstone.estimatedHoursMax != null ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium">
              <Mountain className="w-3 h-3" />
              Year-scale · {capstone.estimatedHoursMin}-{capstone.estimatedHoursMax}h
            </span>
          ) : (
            <span>{capstone.estimatedWeeks}-week capstone</span>
          )}
          <span>·</span>
          <span>
            {capstone.milestones.length} milestone
            {capstone.milestones.length === 1 ? "" : "s"}
          </span>
          {capstone.tags.map((t) => (
            <span key={t} className="text-muted-foreground">
              · #{t}
            </span>
          ))}
          {capstone.status === "published" && (
            <button
              type="button"
              onClick={() => setCiteOpen(true)}
              className={`text-xs px-2 py-1 rounded border border-border hover:bg-accent/40 inline-flex items-center gap-1 ${
                capstone.isAuthor ? "" : "ml-auto"
              }`}
            >
              <BookMarked className="w-3 h-3" strokeWidth={2} />
              Cite
            </button>
          )}
          {capstone.status === "published" &&
            capstone.currentVersion &&
            capstone.currentVersion > 1 && (
              <Link
                to={`/capstones/${capstone.slug}/versions`}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/40 inline-flex items-center gap-1"
              >
                <History className="w-3 h-3" strokeWidth={2} />
                v{capstone.currentVersion}
              </Link>
            )}
          {capstone.isAuthor && (
            <Link
              to={`/capstones/${capstone.slug}/edit`}
              className={`text-xs px-2 py-1 rounded border border-border hover:bg-accent/40 ${
                capstone.status === "published" ? "" : "ml-auto"
              }`}
            >
              Edit
            </Link>
          )}
        </div>
      </header>

      {/* Enroll / Continue CTA */}
      {!capstone.isAuthor && capstone.status === "published" && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-between gap-4 flex-wrap">
          {enrollment == null && (
            <>
              <div>
                <h3 className="text-sm font-medium">Ready to start?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enroll to track milestones and earn a public artifact page.
                </p>
              </div>
              <button
                type="button"
                onClick={enroll}
                disabled={enrolling}
                className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {enrolling ? "Enrolling…" : "Enroll"}
              </button>
            </>
          )}
          {enrollment != null && !allPassed && (
            <>
              <div>
                <h3 className="text-sm font-medium">In progress</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {enrollment.passedMilestoneIds.length}/
                  {capstone.milestones.length} milestones passed
                </p>
              </div>
              <Link
                to={`/capstones/${capstone.slug}/work`}
                className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Continue capstone
              </Link>
            </>
          )}
          {enrollment != null && allPassed && enrollment.artifactPageSlug && (
            <>
              <div>
                <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  All milestones passed
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Your public artifact page is live. Exams are diagnostics; this
                  capstone page is signed proof. Verify signatures at{" "}
                  <Link to="/verify" className="text-primary hover:underline">
                    /verify
                  </Link>
                  .
                </p>
              </div>
              <Link
                to={`/capstones/c/${enrollment.artifactPageSlug}`}
                className="text-sm px-4 py-2 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
              >
                View artifact
              </Link>
            </>
          )}
        </div>
      )}

      {/* S85 — Year-scale metadata. Domains + real-world deliverable
         surface BEFORE the brief so the learner knows what they're
         signing up for upfront. */}
      {capstone.scaleTier === "long_arc" && (
        <section className="mb-6 space-y-4">
          {capstone.domains.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Domains
              </div>
              <div className="flex flex-wrap gap-1.5">
                {capstone.domains.map((d) => (
                  <span
                    key={d}
                    className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/40 text-foreground"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
          {capstone.realWorldDeliverableMd &&
            capstone.realWorldDeliverableMd.trim().length > 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="text-xs font-semibold inline-flex items-center gap-1.5 mb-2 text-emerald-700 dark:text-emerald-300">
                  <Target className="w-3.5 h-3.5" />
                  Real-world deliverable
                </div>
                <div className="prose-sm max-w-none">
                  <MarkdownRenderer
                    content={capstone.realWorldDeliverableMd}
                    codeKernelKey={`capstone-deliverable:${capstone.slug}`}
                  />
                </div>
              </div>
            )}
        </section>
      )}

      {/* Tier toggle */}
      {capstone.availableTiers.length > 1 && (
        <TierToggle
          active={tier}
          available={capstone.availableTiers}
          onChange={(t) => setTier(t)}
          sticky
        />
      )}

      {/* Brief */}
      <article className="prose-sm max-w-none mt-6">
        {capstone.brief ? (
          <MarkdownRenderer
            content={capstone.brief}
            codeKernelKey={`capstone:${capstone.slug}`}
            codeAuthorUsername={capstone.authorUsername}
            codeViewerUsername={user?.username ?? null}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No brief at this tier yet.
          </p>
        )}
      </article>

      {/* Prereq X-ray */}
      {capstone.prerequisiteWikiSlugs.length > 0 && (
        <section className="mt-10 pt-6 border-t border-border">
          <PrereqXray wikiSlugs={capstone.prerequisiteWikiSlugs} />
        </section>
      )}

      {/* Milestones */}
      <section className="mt-10 pt-6 border-t border-border">
        <h2 className="text-sm font-semibold inline-flex items-center gap-2 mb-4">
          <ListChecks className="w-4 h-4 text-primary" />
          Milestones
        </h2>
        {capstone.milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No milestones declared yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {capstone.milestones.map((m, i) => {
              const isPassed = passedSet.has(m.id);
              const needsRevision = revisionSet.has(m.id);
              return (
                <li
                  key={m.id}
                  className={`rounded-md border p-3 ${
                    isPassed
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : needsRevision
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`text-xs font-mono mt-0.5 tabular-nums ${
                        isPassed
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium">{m.title}</h3>
                      {m.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                          {m.description.slice(0, 220)}
                        </p>
                      )}
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
                        {capstone.scaleTier === "long_arc" && m.dueAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            due {formatMilestoneDate(m.dueAt)}
                          </span>
                        ) : (
                          <span>{m.estimatedDays}d</span>
                        )}
                        <span>· {m.rubric.criteria.length} criteria</span>
                        {m.advisorSignoffRequired && (
                          <span className="text-amber-600 dark:text-amber-400">
                            · advisor sign-off
                          </span>
                        )}
                        {m.requiredArtifactKinds.length > 0 && (
                          <span>
                            · requires:{" "}
                            {m.requiredArtifactKinds.join(", ")}
                          </span>
                        )}
                        {isPassed && <span className="text-emerald-500">· passed ✓</span>}
                        {needsRevision && (
                          <span className="text-amber-500">· needs revision</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Author affordance — add milestone */}
      {capstone.isAuthor && (
        <div className="mt-8 text-center">
          <Link
            to={`/capstones/${capstone.slug}/edit`}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Edit capstone & milestones
          </Link>
        </div>
      )}

      {citeOpen && (
        <CiteDialog
          kind="capstone"
          slug={capstone.slug}
          onClose={() => setCiteOpen(false)}
        />
      )}

      {/* Sprint 63h — AI tutor mount. */}
      <TutorMount
        pageSlug={capstone.slug}
        pageTitle={capstone.title}
        tier="capstone"
        articleRef={briefBodyRef}
      />
    </div>
  );
}

// S85 — Render an ISO date string as a short human label (e.g. "Aug
// 1, 2026"). Falls back to the raw string if Date parsing fails so
// authors who store an unconventional value still see something
// readable.
function formatMilestoneDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
