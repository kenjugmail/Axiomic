import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  api,
  type ForumTopicSummary,
  type MasteryPath,
  type PostType,
  type WikiPage,
} from "../lib/api";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { useAuthStore } from "../stores/auth";

// Featured lesson — hand-picked to surface the most polished
// interactive experience to first-time visitors. The /paths/ link
// drops the user directly on the path; clicking "Start lesson" on
// softmax-basics opens the LessonPlayer.
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

export function HomePage() {
  const { user } = useAuthStore();
  const [recentPages, setRecentPages] = useState<WikiPage[]>([]);
  const [recentTopics, setRecentTopics] = useState<ForumTopicSummary[]>([]);
  const [paths, setPaths] = useState<MasteryPath[]>([]);

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

  // First path is the default "Start Learning" CTA target.
  const defaultPath = paths[0];

  return (
    <div>
      <WelcomeBanner />
      {/* Hero */}
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
        {/* Decorative gradient */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              title="Tiered Explanations"
              description="Every topic has three levels: intuitive intro, undergraduate depth with full math, and graduate-level with research connections."
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />
            <FeatureCard
              title="Brilliant-Style Lessons"
              description="Step-through slides with live attention heatmaps, gradient-descent surfaces, and embedded checks. Drag, classify, and run real Python in your browser."
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              }
            />
            <FeatureCard
              title="AI Tutor + Spaced Repetition"
              description="An always-available tutor that adapts to your level. Generate flashcards from any page; review what's due with a real SM-2 spaced-repetition scheduler."
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              }
            />
            <FeatureCard
              title="Discourse Forum"
              description="Structured discussion: claims, questions, derivations, critiques, syntheses, predictions. Per-domain reputation built in."
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h6m-6 8l4-4h7a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h2v4z" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* Featured interactive lesson */}
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
                  {!user && (
                    <Link
                      to="/signup"
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      or sign up to track progress
                    </Link>
                  )}
                </div>
              </div>
              <div className="hidden md:flex items-center justify-center w-48 h-48 rounded-lg bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
                {/* Stylized softmax bars */}
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

      {/* Recent forum activity */}
      {recentTopics.length > 0 && (
        <section className="border-t border-border">
          <div className="max-w-5xl mx-auto px-4 py-16">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">Forum</h2>
                <p className="text-muted-foreground mt-1">
                  Structured discussion across claims, questions, derivations, and predictions
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
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-6 rounded-xl">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
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
