import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  api,
  type ForumTopicSummary,
  type MasteryPath,
  type PostType,
  type WikiPage,
} from "../lib/api";
import type {
  NextNodeResponse,
  RecentActivityEvent,
} from "@axiomic/types";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { useAuthStore } from "../stores/auth";

// Featured lesson — surface to first-time visitors only. Signed-in
// users see the personalized "continue learning" card instead.
const FEATURED_LESSON = {
  pathSlug: "ml-engineer",
  nodeSlug: "softmax-basics",
  title: "Softmax & temperature",
  blurb:
    "Drag a slider to flatten or sharpen a probability distribution; finish with a Python sandbox where you implement softmax from scratch.",
  bullets: [
    "6 slides mixing live visualizations with embedded checks",
    "An interactive temperature slider you can play with",
    "A Pyodide-backed coding problem with instant test feedback",
  ],
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function HomePage() {
  const { user } = useAuthStore();
  const [recentPages, setRecentPages] = useState<WikiPage[]>([]);
  const [recentTopics, setRecentTopics] = useState<ForumTopicSummary[]>([]);
  const [paths, setPaths] = useState<MasteryPath[]>([]);

  // Personalized data — only fetched when signed in. Each one degrades
  // gracefully on failure so a single 404 doesn't blank the dashboard.
  const [nextNode, setNextNode] = useState<NextNodeResponse["next"] | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<RecentActivityEvent[]>([]);

  useEffect(() => {
    api.wiki.list().then((data) => {
      setRecentPages(data.pages.slice(0, 8));
    }).catch(() => {});
    api.forum
      .listTopics({ sort: "active" })
      .then((d) => setRecentTopics(d.topics.slice(0, 5)))
      .catch(() => {});
    api.mastery
      .getPaths()
      .then((d) => setPaths(d.paths))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setNextNode(null);
      setDueCount(null);
      setActivity([]);
      return;
    }
    setNextLoading(true);
    api.mastery
      .nextNode()
      .then((r) => setNextNode(r.next))
      .catch(() => setNextNode(null))
      .finally(() => setNextLoading(false));
    api.flashcards
      .dueCount()
      .then((r) => setDueCount(r.count))
      .catch(() => setDueCount(null));
    api.activity
      .recent(user.username, 5)
      .then((r) => setActivity(r.events))
      .catch(() => setActivity([]));
  }, [user]);

  // First path is the default "Start Learning" CTA target for signed-out.
  const defaultPath = paths[0];
  const greeting = user?.displayName || user?.username || "";

  return (
    <div>
      <WelcomeBanner />

      {!user ? (
        // --- Signed-out: marketing hero + features + featured lesson ----
        <>
          <section className="relative overflow-hidden">
            <div className="max-w-5xl mx-auto px-4 py-20 sm:py-28">
              <div className="text-center">
                <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                  Deep Knowledge,
                  <br />
                  <span className="text-primary">Beautifully Structured</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
                  Interactive lessons with live visualizations and a Python sandbox,
                  tiered wiki articles, structured forum debate, and gamified mastery
                  paths — starting with modern machine learning and transformer
                  architectures.
                </p>
                <div className="flex gap-4 justify-center flex-wrap">
                  <Link
                    to="/wiki"
                    className="inline-flex items-center px-7 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors text-lg"
                  >
                    Explore the Wiki
                  </Link>
                  <Link
                    to={defaultPath ? `/paths/${defaultPath.slug}` : "/paths"}
                    className="inline-flex items-center px-7 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors text-lg"
                  >
                    Start Learning
                  </Link>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 -z-10 overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
            </div>
          </section>

          <section className="border-t border-border bg-muted/30">
            <div className="max-w-5xl mx-auto px-4 py-16">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                <FeatureCard
                  title="Tiered Explanations"
                  description="Every topic has three levels: intuitive intro, undergraduate depth with full math, and graduate-level with research connections."
                />
                <FeatureCard
                  title="Brilliant-Style Lessons"
                  description="Step-through slides with live attention heatmaps, gradient-descent surfaces, and embedded checks. Drag, classify, and run real Python in your browser."
                />
                <FeatureCard
                  title="AI Tutor + Spaced Repetition"
                  description="An always-available tutor that adapts to your level. Generate flashcards from any page; review what's due with a real SM-2 spaced-repetition scheduler."
                />
                <FeatureCard
                  title="Discourse Forum"
                  description="Structured discussion: claims, questions, derivations, critiques, syntheses, predictions. Per-domain reputation built in."
                />
              </div>
            </div>
          </section>

          <section className="border-t border-border">
            <div className="max-w-5xl mx-auto px-4 py-16">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold">Try an interactive lesson</h2>
                  <p className="text-muted-foreground mt-1">
                    Live visualizations, drag-and-classify, and a Python sandbox — in 5 minutes.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
                <div className="grid md:grid-cols-[1fr_auto] items-center gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      Featured · Apprentice
                    </div>
                    <h3 className="text-xl font-semibold mb-2">
                      {FEATURED_LESSON.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {FEATURED_LESSON.blurb}
                    </p>
                    <ul className="space-y-1 mb-5">
                      {FEATURED_LESSON.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <span className="text-primary mt-0.5">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/paths/${FEATURED_LESSON.pathSlug}`}
                        className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90"
                      >
                        Start the lesson →
                      </Link>
                      <Link
                        to="/signup"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        or sign up to track progress
                      </Link>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center justify-center w-48 h-48 rounded-lg bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
                    <svg viewBox="0 0 120 80" className="w-32 h-20 text-primary">
                      {[0.45, 0.27, 0.15, 0.08, 0.05].map((h, i) => (
                        <rect
                          key={i}
                          x={6 + i * 22}
                          y={80 - h * 70}
                          width={16}
                          height={h * 70}
                          rx={2}
                          fill="currentColor"
                          opacity={0.85 - i * 0.12}
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        // --- Signed-in: personalized dashboard ----
        <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
          <div className="max-w-5xl mx-auto px-4 py-10">
            <h1 className="text-2xl font-bold mb-1">Welcome back, {greeting}.</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Pick up where you left off, clear today's queue, or jump back into a discussion.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Continue learning */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Continue learning
                </div>
                {nextLoading ? (
                  <div className="h-16 animate-pulse bg-muted rounded mt-2" />
                ) : nextNode ? (
                  <>
                    <h3 className="text-lg font-semibold mt-1">{nextNode.nodeTitle}</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      <span className="capitalize">{nextNode.level}</span> · {nextNode.pathTitle}
                    </p>
                    <Link
                      to={`/wiki/${nextNode.nodeSlug}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                    >
                      {nextNode.hasLesson ? "Open lesson" : "Open page"} →
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-3 mt-2">
                      You're all caught up on every path. Nice work.
                    </p>
                    <Link
                      to="/paths"
                      className="text-sm text-primary hover:underline"
                    >
                      Explore another path →
                    </Link>
                  </>
                )}
              </div>

              {/* Today's review */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Today's review
                </div>
                {dueCount === null ? (
                  <div className="h-16 animate-pulse bg-muted rounded mt-2" />
                ) : dueCount > 0 ? (
                  <>
                    <h3 className="text-3xl font-semibold mt-1">
                      {dueCount}
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        card{dueCount === 1 ? "" : "s"} due
                      </span>
                    </h3>
                    <Link
                      to="/flashcards"
                      className="inline-block mt-3 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                    >
                      Review now →
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mt-2 mb-3">
                      No cards due. Save flashcards from any wiki page to build your deck.
                    </p>
                    <Link to="/wiki" className="text-sm text-primary hover:underline">
                      Browse the wiki →
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Recent activity strip */}
            {activity.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Recent activity
                </div>
                <ul className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
                  {activity.map((e, i) => (
                    <li key={i}>
                      <Link
                        to={e.href}
                        className="flex items-center justify-between px-4 py-2 text-sm hover:bg-accent/30 transition-colors"
                      >
                        <span>{e.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-3">
                          {relativeTime(e.occurredAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Practice tools — visible only when signed in */}
      {user && (
        <section className="border-t border-border bg-muted/30">
          <div className="max-w-5xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-bold mb-6">Your practice tools</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <PracticeCard
                title="Flashcards"
                description="Save cards from any wiki page; review what's due today with SM-2 scheduling."
                to="/flashcards"
              />
              <PracticeCard
                title="Notifications"
                description="Replies to your topics, mentions, and mastery level-up celebrations land here."
                to="/notifications"
              />
              <PracticeCard
                title="Profile"
                description="Per-domain reputation, mastery progress across paths, recent completions."
                to={`/profile/${user.username}`}
              />
            </div>
          </div>
        </section>
      )}

      {/* Mastery path preview */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">Mastery Paths</h2>
              <p className="text-muted-foreground mt-1">Structured journeys from fundamentals to research expertise</p>
            </div>
            <Link to="/paths" className="text-sm text-primary hover:underline">View all paths</Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {paths.length === 0 ? (
              <div className="h-32 animate-pulse bg-muted rounded-xl col-span-2" />
            ) : (
              paths.map((path) => (
                <Link
                  key={path.id}
                  to={`/paths/${path.slug}`}
                  className="block p-6 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-lg">{path.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {path.description}
                  </p>
                  <div className="flex gap-1">
                    {["Apprentice", "Practitioner", "Specialist", "Expert", "Researcher"].map((level, i) => (
                      <div key={level} className="flex-1 text-center">
                        <div
                          className={`h-2 rounded-full mb-1 ${
                            i === 0
                              ? "bg-emerald-400"
                              : i === 1
                                ? "bg-blue-400"
                                : i === 2
                                  ? "bg-purple-400"
                                  : i === 3
                                    ? "bg-amber-400"
                                    : "bg-red-400"
                          }`}
                        />
                        <span className="text-[9px] text-muted-foreground">{level}</span>
                      </div>
                    ))}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Trending forum activity */}
      {recentTopics.length > 0 && (
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-4 py-16">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">Trending in the forum</h2>
                <p className="text-muted-foreground mt-1">
                  Most recently active claims, questions, derivations, and predictions
                </p>
              </div>
              <Link to="/forum" className="text-sm text-primary hover:underline">
                Browse all
              </Link>
            </div>
            <ul className="space-y-2">
              {recentTopics.map((t) => (
                <li
                  key={t.id}
                  className="border border-border rounded-lg p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <PostTypeBadge type={t.postType as PostType} />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.domainTitle}
                    </span>
                  </div>
                  <Link
                    to={`/forum/t/${t.slug}`}
                    className="font-medium text-sm hover:text-primary"
                  >
                    {t.title}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    @{t.authorUsername} · {t.postCount} replies · score {t.score}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Recent pages */}
      {recentPages.length > 0 && (
        <section className="border-t border-border bg-muted/30">
          <div className="max-w-5xl mx-auto px-4 py-16">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">Explore Topics</h2>
              <Link to="/wiki" className="text-sm text-primary hover:underline">Browse all</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recentPages.map((page) => (
                <Link
                  key={page.id}
                  to={`/wiki/${page.slug}`}
                  className="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                >
                  <h3 className="font-medium text-sm mb-1">{page.title}</h3>
                  <span className="text-xs text-muted-foreground capitalize">{page.category}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function PracticeCard({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block p-5 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
    >
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
