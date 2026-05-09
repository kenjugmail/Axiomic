import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastContainer } from "./components/ui/ToastContainer";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { WikiListPage } from "./pages/WikiListPage";
import { MasteryListPage } from "./pages/MasteryListPage";
import { MasteryPathPage } from "./pages/MasteryPathPage";
import { ForumListPage } from "./pages/ForumListPage";
import { NewsListPage } from "./pages/NewsListPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";

// Heavy pages and rarely-needed-on-first-load editor flows are
// lazy-loaded so the initial bundle is much smaller. Editors pull in
// MarkdownRenderer + KaTeX + viz code that the article reader doesn't
// need.
// LessonPage pulls in 11 viz components (each in its own chunk) plus all
// 8 question kinds and the embedded notes editor. Lazy so users who never
// open a lesson don't pay for it.
const LessonPage = lazy(() =>
  import("./pages/LessonPage").then((m) => ({ default: m.LessonPage })),
);
// Search page pulls in the full search index API + Navigator path; lazy
// so pages that link out to /search don't pay the cost on first paint.
const SearchPage = lazy(() =>
  import("./pages/SearchPage").then((m) => ({ default: m.SearchPage })),
);
// Post-signup wizard. Only rendered once per user.
const OnboardingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({
    default: m.OnboardingPage,
  })),
);
const LessonEditPage = lazy(() =>
  import("./pages/LessonEditPage").then((m) => ({
    default: m.LessonEditPage,
  })),
);
const LessonAnalyticsPage = lazy(() =>
  import("./pages/LessonAnalyticsPage").then((m) => ({
    default: m.LessonAnalyticsPage,
  })),
);
const LessonEditsFeed = lazy(() =>
  import("./pages/LessonEditsFeed").then((m) => ({
    default: m.LessonEditsFeed,
  })),
);
// Reading pages with heavy deps (markdown + KaTeX renderers, comments,
// reactions). Lazy so the home/list pages don't pull them in.
const WikiPage = lazy(() =>
  import("./pages/WikiPage").then((m) => ({ default: m.WikiPage })),
);
const NewsArticlePage = lazy(() =>
  import("./pages/NewsArticlePage").then((m) => ({
    default: m.NewsArticlePage,
  })),
);
const ForumTopicPage = lazy(() =>
  import("./pages/ForumTopicPage").then((m) => ({
    default: m.ForumTopicPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const WikiNewPage = lazy(() =>
  import("./pages/WikiNewPage").then((m) => ({ default: m.WikiNewPage })),
);
const WikiEditPage = lazy(() =>
  import("./pages/WikiEditPage").then((m) => ({ default: m.WikiEditPage })),
);
const NewTopicPage = lazy(() =>
  import("./pages/NewTopicPage").then((m) => ({ default: m.NewTopicPage })),
);
const NewsNewPage = lazy(() =>
  import("./pages/NewsNewPage").then((m) => ({ default: m.NewsNewPage })),
);
const NewsEditPage = lazy(() =>
  import("./pages/NewsEditPage").then((m) => ({ default: m.NewsEditPage })),
);
const NewsProposeEditPage = lazy(() =>
  import("./pages/NewsProposeEditPage").then((m) => ({
    default: m.NewsProposeEditPage,
  })),
);
const NewsProposalsPage = lazy(() =>
  import("./pages/NewsProposalsPage").then((m) => ({
    default: m.NewsProposalsPage,
  })),
);
const NewsBookmarksPage = lazy(() =>
  import("./pages/NewsBookmarksPage").then((m) => ({
    default: m.NewsBookmarksPage,
  })),
);
const NewsDraftsPage = lazy(() =>
  import("./pages/NewsDraftsPage").then((m) => ({ default: m.NewsDraftsPage })),
);
const NewsResearchPage = lazy(() =>
  import("./pages/NewsResearchPage").then((m) => ({ default: m.NewsResearchPage })),
);
const ForumBookmarksPage = lazy(() =>
  import("./pages/ForumBookmarksPage").then((m) => ({
    default: m.ForumBookmarksPage,
  })),
);
const FeedPage = lazy(() =>
  import("./pages/FeedPage").then((m) => ({ default: m.FeedPage })),
);
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage").then((m) => ({ default: m.LeaderboardPage })),
);
const DailyChallengePage = lazy(() =>
  import("./pages/DailyChallengePage").then((m) => ({ default: m.DailyChallengePage })),
);
const PathCertificatePage = lazy(() =>
  import("./pages/PathCertificatePage").then((m) => ({ default: m.PathCertificatePage })),
);
const MistakesPage = lazy(() =>
  import("./pages/MistakesPage").then((m) => ({ default: m.MistakesPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const AttachmentsPage = lazy(() =>
  import("./pages/AttachmentsPage").then((m) => ({ default: m.AttachmentsPage })),
);
const DemoAttentionPage = lazy(() =>
  import("./pages/DemoAttentionPage").then((m) => ({ default: m.DemoAttentionPage })),
);
const ResearchListPage = lazy(() =>
  import("./pages/ResearchListPage").then((m) => ({ default: m.ResearchListPage })),
);
const ResearchPaperPage = lazy(() =>
  import("./pages/ResearchPaperPage").then((m) => ({ default: m.ResearchPaperPage })),
);
const ResearchNewPage = lazy(() =>
  import("./pages/ResearchNewPage").then((m) => ({ default: m.ResearchNewPage })),
);
const ResearchEditPage = lazy(() =>
  import("./pages/ResearchEditPage").then((m) => ({ default: m.ResearchEditPage })),
);
const ResearchDraftsPage = lazy(() =>
  import("./pages/ResearchDraftsPage").then((m) => ({ default: m.ResearchDraftsPage })),
);
const ResearchWizardPage = lazy(() =>
  import("./pages/ResearchWizardPage").then((m) => ({ default: m.ResearchWizardPage })),
);
const FlashcardsPage = lazy(() =>
  import("./pages/FlashcardsPage").then((m) => ({ default: m.FlashcardsPage })),
);
const CapstonesListPage = lazy(() =>
  import("./pages/CapstonesListPage").then((m) => ({ default: m.CapstonesListPage })),
);
const CapstoneTracksListPage = lazy(() =>
  import("./pages/CapstoneTracksListPage").then((m) => ({
    default: m.CapstoneTracksListPage,
  })),
);
const CapstoneTrackPage = lazy(() =>
  import("./pages/CapstoneTrackPage").then((m) => ({ default: m.CapstoneTrackPage })),
);
const CapstoneTrackArtifactPage = lazy(() =>
  import("./pages/CapstoneTrackArtifactPage").then((m) => ({
    default: m.CapstoneTrackArtifactPage,
  })),
);
const CohortInvitationAcceptPage = lazy(() =>
  import("./pages/CohortInvitationAcceptPage").then((m) => ({
    default: m.CohortInvitationAcceptPage,
  })),
);
const AdminApprovalsPage = lazy(() =>
  import("./pages/AdminApprovalsPage").then((m) => ({ default: m.AdminApprovalsPage })),
);
const AdminErrorStatsPage = lazy(() =>
  import("./pages/AdminErrorStatsPage").then((m) => ({
    default: m.AdminErrorStatsPage,
  })),
);
const CapstonePage = lazy(() =>
  import("./pages/CapstonePage").then((m) => ({ default: m.CapstonePage })),
);
const CapstoneNewPage = lazy(() =>
  import("./pages/CapstoneNewPage").then((m) => ({ default: m.CapstoneNewPage })),
);
const CapstoneEditPage = lazy(() =>
  import("./pages/CapstoneEditPage").then((m) => ({ default: m.CapstoneEditPage })),
);
const CapstoneWorkspacePage = lazy(() =>
  import("./pages/CapstoneWorkspacePage").then((m) => ({ default: m.CapstoneWorkspacePage })),
);
const CapstoneArtifactPageView = lazy(() =>
  import("./pages/CapstoneArtifactPage").then((m) => ({ default: m.CapstoneArtifactPageView })),
);
const WeakConceptsPage = lazy(() =>
  import("./pages/WeakConceptsPage").then((m) => ({ default: m.WeakConceptsPage })),
);
// Sprint 33 — Knowledge MRI lives next to the weak-concepts page.
const KnowledgeMRIPage = lazy(() =>
  import("./pages/KnowledgeMRIPage").then((m) => ({ default: m.KnowledgeMRIPage })),
);
// Sprint 64c — mentor relationships dashboard.
const MentorDashboardPage = lazy(() =>
  import("./pages/MentorDashboardPage").then((m) => ({
    default: m.MentorDashboardPage,
  })),
);
// Sprint 35 — version history + frozen-version snapshot reader.
const VersionsPage = lazy(() =>
  import("./pages/VersionsPage").then((m) => ({ default: m.VersionsPage })),
);
const PaperVersionPage = lazy(() =>
  import("./pages/PaperVersionPage").then((m) => ({ default: m.PaperVersionPage })),
);
// Sprint 36 — Argument map: forum thread as a DAG.
const ArgumentMapPage = lazy(() =>
  import("./pages/ArgumentMapPage").then((m) => ({ default: m.ArgumentMapPage })),
);
// Sprint 37 — Public transcript verifier (paste-and-check).
const VerifyPage = lazy(() =>
  import("./pages/VerifyPage").then((m) => ({ default: m.VerifyPage })),
);
// Sprint 38 — Misconception marketplace (community-curated catalog).
const MisconceptionMarketplacePage = lazy(() =>
  import("./pages/MisconceptionMarketplacePage").then((m) => ({
    default: m.MisconceptionMarketplacePage,
  })),
);
// Sprint 39 — Capstone peer review queue.
const CapstoneReviewQueuePage = lazy(() =>
  import("./pages/CapstoneReviewQueuePage").then((m) => ({
    default: m.CapstoneReviewQueuePage,
  })),
);
// Sprint 43 — Cohorts (social learning groups).
const CohortsPage = lazy(() =>
  import("./pages/CohortsPage").then((m) => ({ default: m.CohortsPage })),
);

function PageFallback() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="animate-pulse h-32 bg-muted rounded-xl" />
    </div>
  );
}

export function App() {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const user = useAuthStore((s) => s.user);
  const hydrateFromServer = useThemeStore((s) => s.hydrateFromServer);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Hydrate theme from server once auth resolves with a logged-in user.
  useEffect(() => {
    if (user) hydrateFromServer();
  }, [user, hydrateFromServer]);

  return (
    <Suspense fallback={<PageFallback />}>
      {/* Sprint 64a — global toast notifications. Mounted once at the
          app root; any code can call `toast.success(...)` etc. */}
      <ToastContainer />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/wiki" element={<WikiListPage />} />
          <Route path="/wiki/new" element={<WikiNewPage />} />
          <Route path="/wiki/:slug" element={<WikiPage />} />
          <Route path="/wiki/:slug/edit" element={<WikiEditPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/paths" element={<MasteryListPage />} />
          <Route path="/paths/:slug" element={<MasteryPathPage />} />
          <Route
            path="/paths/:pathSlug/lessons/:nodeSlug"
            element={<LessonPage />}
          />
          <Route
            path="/paths/:pathSlug/lessons/:nodeSlug/edit"
            element={<LessonEditPage />}
          />
          <Route
            path="/paths/:pathSlug/lessons/:nodeSlug/analytics"
            element={<LessonAnalyticsPage />}
          />
          <Route path="/lesson-edits" element={<LessonEditsFeed />} />
          <Route path="/forum" element={<ForumListPage />} />
          <Route path="/forum/new" element={<NewTopicPage />} />
          <Route path="/forum/bookmarks" element={<ForumBookmarksPage />} />
          <Route path="/forum/t/:slug" element={<ForumTopicPage />} />
          <Route path="/forum/graph" element={<ArgumentMapPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route
            path="/misconceptions"
            element={<MisconceptionMarketplacePage />}
          />
          <Route
            path="/capstones/review-queue"
            element={<CapstoneReviewQueuePage />}
          />
          <Route path="/cohorts" element={<CohortsPage />} />
          <Route path="/forum/:domain" element={<ForumListPage />} />
          <Route path="/news" element={<NewsListPage />} />
          <Route path="/news/new" element={<NewsNewPage />} />
          <Route path="/news/bookmarks" element={<NewsBookmarksPage />} />
          <Route path="/news/drafts" element={<NewsDraftsPage />} />
          <Route path="/news/research" element={<NewsResearchPage />} />
          <Route path="/news/:slug" element={<NewsArticlePage />} />
          <Route path="/news/:slug/edit" element={<NewsEditPage />} />
          <Route path="/news/:slug/propose" element={<NewsProposeEditPage />} />
          <Route path="/news/:slug/proposals" element={<NewsProposalsPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/challenge" element={<DailyChallengePage />} />
          <Route
            path="/paths/:pathSlug/certificate/:username"
            element={<PathCertificatePage />}
          />
          <Route path="/review/mistakes" element={<MistakesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/attachments" element={<AttachmentsPage />} />
          <Route path="/demo/attention" element={<DemoAttentionPage />} />
          <Route path="/research" element={<ResearchListPage />} />
          <Route path="/research/new" element={<ResearchNewPage />} />
          <Route path="/research/new/wizard" element={<ResearchWizardPage />} />
          <Route path="/research/me/drafts" element={<ResearchDraftsPage />} />
          <Route path="/research/:slug" element={<ResearchPaperPage />} />
          <Route path="/research/:slug/edit" element={<ResearchEditPage />} />
          <Route path="/research/:slug/versions" element={<VersionsPage />} />
          <Route path="/research/:slug/v/:n" element={<PaperVersionPage />} />
          <Route path="/capstones/:slug/versions" element={<VersionsPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/capstones" element={<CapstonesListPage />} />
          <Route path="/capstones/new" element={<CapstoneNewPage />} />
          <Route path="/capstones/c/:artifactSlug" element={<CapstoneArtifactPageView />} />
          <Route path="/capstones/:slug" element={<CapstonePage />} />
          <Route path="/capstones/:slug/edit" element={<CapstoneEditPage />} />
          <Route path="/capstones/:slug/work" element={<CapstoneWorkspacePage />} />
          <Route path="/tracks" element={<CapstoneTracksListPage />} />
          <Route path="/tracks/c/:artifactSlug" element={<CapstoneTrackArtifactPage />} />
          <Route path="/tracks/:slug" element={<CapstoneTrackPage />} />
          <Route path="/invitations/:token" element={<CohortInvitationAcceptPage />} />
          <Route path="/admin/approvals" element={<AdminApprovalsPage />} />
          <Route path="/admin/errors" element={<AdminErrorStatsPage />} />
          <Route path="/me/weak-concepts" element={<WeakConceptsPage />} />
          <Route path="/me/mri" element={<KnowledgeMRIPage />} />
          <Route path="/me/mentors" element={<MentorDashboardPage />} />
          <Route path="/cite/p/:author/:slug" element={<CitePaperRedirect />} />
          <Route path="/cite/c/:author/:slug" element={<CiteCapstoneRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// Sprint 34 — DOI-style citation permalinks. Stable URLs
// /cite/{p|c}/<author>/<slug> bounce to the canonical content page so
// external citations keep resolving even if the canonical surface
// moves later.
function CitePaperRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/research/${slug}`} replace />;
}

function CiteCapstoneRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/capstones/${slug}`} replace />;
}
