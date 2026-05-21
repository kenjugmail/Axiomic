import { lazy, Suspense, useEffect } from "react";
import {
  Navigate,
  Routes,
  Route,
  useParams,
  useLocation,
} from "react-router-dom";
import { Layout } from "./components/Layout";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ToastContainer } from "./components/ui/ToastContainer";
import { ConfirmContainer } from "./components/ui/ConfirmContainer";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { WikiListPage } from "./pages/WikiListPage";
import { MasteryListPage } from "./pages/MasteryListPage";
import { VizGalleryPage } from "./pages/VizGalleryPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { ConceptSearchPage } from "./pages/ConceptSearchPage";
import { AuthorLessonPage } from "./pages/admin/AuthorLessonPage";
import { LearnNextPage } from "./pages/LearnNextPage";
import { JourneysListPage } from "./pages/JourneysListPage";
import { JourneyDetailPage } from "./pages/JourneyDetailPage";
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
const DemoCompetencyLoopPage = lazy(() =>
  import("./pages/DemoCompetencyLoopPage").then((m) => ({
    default: m.DemoCompetencyLoopPage,
  })),
);
const ResearchListPage = lazy(() =>
  import("./pages/ResearchListPage").then((m) => ({ default: m.ResearchListPage })),
);
const ResearchPaperPage = lazy(() =>
  import("./pages/ResearchPaperPage").then((m) => ({ default: m.ResearchPaperPage })),
);
const ResearchFeedPage = lazy(() =>
  import("./pages/ResearchFeedPage").then((m) => ({ default: m.ResearchFeedPage })),
);
const GrantsListPage = lazy(() =>
  import("./pages/GrantsListPage").then((m) => ({ default: m.GrantsListPage })),
);
const GrantDetailPage = lazy(() =>
  import("./pages/GrantDetailPage").then((m) => ({ default: m.GrantDetailPage })),
);
const GrantsBookmarksPage = lazy(() =>
  import("./pages/GrantsBookmarksPage").then((m) => ({
    default: m.GrantsBookmarksPage,
  })),
);
const AuthorPage = lazy(() =>
  import("./pages/AuthorPage").then((m) => ({ default: m.AuthorPage })),
);
const ExamsListPage = lazy(() =>
  import("./pages/ExamsListPage").then((m) => ({ default: m.ExamsListPage })),
);
const ExamPage = lazy(() =>
  import("./pages/ExamPage").then((m) => ({ default: m.ExamPage })),
);
const ExamRunnerPage = lazy(() =>
  import("./pages/ExamRunnerPage").then((m) => ({ default: m.ExamRunnerPage })),
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
// S109 — admin feedback inbox.
const AdminFeedbackPage = lazy(() =>
  import("./pages/AdminFeedbackPage").then((m) => ({
    default: m.AdminFeedbackPage,
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
const ClassesListPage = lazy(() =>
  import("./pages/ClassesListPage").then((m) => ({ default: m.ClassesListPage })),
);
const ClassPage = lazy(() =>
  import("./pages/ClassPage").then((m) => ({ default: m.ClassPage })),
);
const ClassEditPage = lazy(() =>
  import("./pages/ClassEditPage").then((m) => ({ default: m.ClassEditPage })),
);
const ClassGradebookPage = lazy(() =>
  import("./pages/ClassGradebookPage").then((m) => ({
    default: m.ClassGradebookPage,
  })),
);
const ClassCalendarPage = lazy(() =>
  import("./pages/ClassCalendarPage").then((m) => ({
    default: m.ClassCalendarPage,
  })),
);
const ClassTaskPage = lazy(() =>
  import("./pages/ClassTaskPage").then((m) => ({ default: m.ClassTaskPage })),
);
const MyPetPage = lazy(() =>
  import("./pages/MyPetPage").then((m) => ({ default: m.MyPetPage })),
);
const InventoryPage = lazy(() =>
  import("./pages/InventoryPage").then((m) => ({ default: m.InventoryPage })),
);
const SkinShowcasePage = lazy(() =>
  import("./pages/SkinShowcasePage").then((m) => ({ default: m.SkinShowcasePage })),
);
const CompetitionDetailPage = lazy(() =>
  import("./pages/CompetitionDetailPage").then((m) => ({ default: m.CompetitionDetailPage })),
);
const ShopPage = lazy(() =>
  import("./pages/ShopPage").then((m) => ({ default: m.ShopPage })),
);
const ClassAnalyticsPage = lazy(() =>
  import("./pages/ClassAnalyticsPage").then((m) => ({ default: m.ClassAnalyticsPage })),
);
const MyProgressPage = lazy(() =>
  import("./pages/MyProgressPage").then((m) => ({ default: m.MyProgressPage })),
);
const PetShowcasePage = lazy(() =>
  import("./pages/PetShowcasePage").then((m) => ({ default: m.PetShowcasePage })),
);
const JoinClassPage = lazy(() =>
  import("./pages/JoinClassPage").then((m) => ({ default: m.JoinClassPage })),
);
const ClassesDirectoryPage = lazy(() =>
  import("./pages/ClassesDirectoryPage").then((m) => ({ default: m.ClassesDirectoryPage })),
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
// S108 — Email-verify landing for the link in the sent verify email.
const VerifyEmailPage = lazy(() =>
  import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })),
);

// S109 — Forgot-password + reset-password landings.
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailChangePage = lazy(() =>
  import("./pages/VerifyEmailChangePage").then((m) => ({ default: m.VerifyEmailChangePage })),
);

// Sprint 37 — Public transcript verifier (paste-and-check).
const VerifyPage = lazy(() =>
  import("./pages/VerifyPage").then((m) => ({ default: m.VerifyPage })),
);
// Phase 31D — chrome-free embeddable verifier (no <Layout/>).
const VerifyWidget = lazy(() =>
  import("./components/VerifyWidget").then((m) => ({
    default: m.VerifyWidget,
  })),
);
// Sprint 38 — Misconception marketplace (community-curated catalog).
const MisconceptionMarketplacePage = lazy(() =>
  import("./pages/MisconceptionMarketplacePage").then((m) => ({
    default: m.MisconceptionMarketplacePage,
  })),
);
const MisconceptionsModerationPage = lazy(() =>
  import("./pages/MisconceptionsModerationPage").then((m) => ({
    default: m.MisconceptionsModerationPage,
  })),
);
const CohortDetailPage = lazy(() =>
  import("./pages/CohortDetailPage").then((m) => ({
    default: m.CohortDetailPage,
  })),
);
// Phase 27 — Hackathons + engineering competitions.
const HackathonsListPage = lazy(() =>
  import("./pages/HackathonsListPage").then((m) => ({
    default: m.HackathonsListPage,
  })),
);
const HackathonDetailPage = lazy(() =>
  import("./pages/HackathonDetailPage").then((m) => ({
    default: m.HackathonDetailPage,
  })),
);
const HackathonNewPage = lazy(() =>
  import("./pages/HackathonNewPage").then((m) => ({
    default: m.HackathonNewPage,
  })),
);
// Phase 28 — the differentiation chain: credential wallet,
// reproduction review, research bounties.
const CredentialWalletPage = lazy(() =>
  import("./pages/CredentialWalletPage").then((m) => ({
    default: m.CredentialWalletPage,
  })),
);
const TodayPage = lazy(() =>
  import("./pages/TodayPage").then((m) => ({ default: m.TodayPage })),
);
const OrgPage = lazy(() =>
  import("./pages/OrgPage").then((m) => ({ default: m.OrgPage })),
);
const ReproductionReviewPage = lazy(() =>
  import("./pages/ReproductionReviewPage").then((m) => ({
    default: m.ReproductionReviewPage,
  })),
);
const MissionsListPage = lazy(() =>
  import("./pages/MissionsListPage").then((m) => ({
    default: m.MissionsListPage,
  })),
);
const MissionNewPage = lazy(() =>
  import("./pages/MissionNewPage").then((m) => ({
    default: m.MissionNewPage,
  })),
);
const MissionDetailPage = lazy(() =>
  import("./pages/MissionDetailPage").then((m) => ({
    default: m.MissionDetailPage,
  })),
);
const CredentialSkillsPage = lazy(() =>
  import("./pages/CredentialSkillsPage").then((m) => ({
    default: m.CredentialSkillsPage,
  })),
);
const RecruiterSearchPage = lazy(() =>
  import("./pages/RecruiterSearchPage").then((m) => ({
    default: m.RecruiterSearchPage,
  })),
);
const BountiesListPage = lazy(() =>
  import("./pages/BountiesListPage").then((m) => ({
    default: m.BountiesListPage,
  })),
);
const BountyDetailPage = lazy(() =>
  import("./pages/BountyDetailPage").then((m) => ({
    default: m.BountyDetailPage,
  })),
);
const BountyNewPage = lazy(() =>
  import("./pages/BountyNewPage").then((m) => ({
    default: m.BountyNewPage,
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
// Sprint 79 — Lab protocol + equipment library.
const ProtocolsListPage = lazy(() =>
  import("./pages/ProtocolsListPage").then((m) => ({
    default: m.ProtocolsListPage,
  })),
);
const ProtocolDetailPage = lazy(() =>
  import("./pages/ProtocolDetailPage").then((m) => ({
    default: m.ProtocolDetailPage,
  })),
);
const ProtocolEditPage = lazy(() =>
  import("./pages/ProtocolEditPage").then((m) => ({
    default: m.ProtocolEditPage,
  })),
);
const EquipmentListPage = lazy(() =>
  import("./pages/EquipmentListPage").then((m) => ({
    default: m.EquipmentListPage,
  })),
);
const EquipmentDetailPage = lazy(() =>
  import("./pages/EquipmentDetailPage").then((m) => ({
    default: m.EquipmentDetailPage,
  })),
);
// Sprint 80 — Safety certifications + protocol-run sign-offs.
const SafetyCertsListPage = lazy(() =>
  import("./pages/SafetyCertsListPage").then((m) => ({
    default: m.SafetyCertsListPage,
  })),
);
const SafetyCertPage = lazy(() =>
  import("./pages/SafetyCertPage").then((m) => ({
    default: m.SafetyCertPage,
  })),
);
const ProtocolRunPage = lazy(() =>
  import("./pages/ProtocolRunPage").then((m) => ({
    default: m.ProtocolRunPage,
  })),
);
const MyLabPage = lazy(() =>
  import("./pages/MyLabPage").then((m) => ({
    default: m.MyLabPage,
  })),
);
// Sprint 82 — PI dashboard for a lab cohort.
const LabRosterPage = lazy(() =>
  import("./pages/LabRosterPage").then((m) => ({
    default: m.LabRosterPage,
  })),
);
// Sprint 83 — AI-assisted protocol drafting wizard.
const ProtocolWizardPage = lazy(() =>
  import("./pages/ProtocolWizardPage").then((m) => ({
    default: m.ProtocolWizardPage,
  })),
);
const ForAudiencePage = lazy(() =>
  import("./pages/ForAudiencePage").then((m) => ({ default: m.ForAudiencePage })),
);
const HubPage = lazy(() =>
  import("./pages/HubPage").then((m) => ({ default: m.HubPage })),
);

function PageFallback() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="animate-pulse h-32 bg-muted rounded-xl" />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AppErrorBoundary
      key={`${location.pathname}${location.search}`}
    >
      {/* Sprint 64a — global toast notifications. Mounted once at the
          app root; any code can call `toast.success(...)` etc. */}
      <ToastContainer />
      <ConfirmContainer />
      <Routes>
        {/* Phase 31D — embeddable verifier, intentionally outside
            <Layout/> so it renders chrome-free in an iframe. */}
        <Route path="/embed/verify" element={<VerifyWidget />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/for/:audienceId" element={<ForAudiencePage />} />
          <Route path="/hub/:pillarId" element={<HubPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/wiki" element={<WikiListPage />} />
          <Route path="/wiki/new" element={<WikiNewPage />} />
          <Route path="/wiki/:slug" element={<WikiPage />} />
          <Route path="/wiki/:slug/edit" element={<WikiEditPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/paths" element={<MasteryListPage />} />
          <Route path="/viz-gallery" element={<VizGalleryPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/concepts/search" element={<ConceptSearchPage />} />
          <Route path="/admin/author/lesson" element={<AuthorLessonPage />} />
          <Route path="/learn-next" element={<LearnNextPage />} />
          <Route path="/journeys" element={<JourneysListPage />} />
          <Route path="/journeys/:slug" element={<JourneyDetailPage />} />
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
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email-change" element={<VerifyEmailChangePage />} />
          <Route
            path="/misconceptions"
            element={<MisconceptionMarketplacePage />}
          />
          <Route
            path="/misconceptions/moderate"
            element={<MisconceptionsModerationPage />}
          />
          <Route
            path="/capstones/review-queue"
            element={<CapstoneReviewQueuePage />}
          />
          <Route path="/cohorts" element={<CohortsPage />} />
          <Route path="/cohorts/:slug" element={<CohortDetailPage />} />
          {/* Phase 27 — Hackathons. */}
          <Route path="/hackathons" element={<HackathonsListPage />} />
          <Route path="/hackathons/new" element={<HackathonNewPage />} />
          <Route path="/hackathons/:slug" element={<HackathonDetailPage />} />
          {/* Phase 28 — credentials · reproductions · bounties. */}
          <Route path="/me/credentials" element={<CredentialWalletPage />} />
          <Route path="/me/today" element={<TodayPage />} />
          <Route path="/orgs/:slug" element={<OrgPage />} />
          <Route
            path="/u/:username/credentials"
            element={<CredentialWalletPage />}
          />
          {/* Phase 29C — recruiter skills rollup. */}
          <Route
            path="/u/:username/skills"
            element={<CredentialSkillsPage />}
          />
          {/* Phase 30C — recruiter search dashboard. */}
          <Route path="/recruiter" element={<RecruiterSearchPage />} />
          <Route
            path="/reproductions/review"
            element={<ReproductionReviewPage />}
          />
          {/* Phase 39 — "Goodness" missions. */}
          <Route path="/missions" element={<MissionsListPage />} />
          <Route path="/missions/new" element={<MissionNewPage />} />
          <Route path="/missions/:slug" element={<MissionDetailPage />} />
          <Route path="/bounties" element={<BountiesListPage />} />
          <Route path="/bounties/new" element={<BountyNewPage />} />
          <Route path="/bounties/:slug" element={<BountyDetailPage />} />
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
          <Route path="/demo/competency-loop" element={<DemoCompetencyLoopPage />} />
          <Route path="/research" element={<ResearchListPage />} />
          <Route path="/research/feed" element={<ResearchFeedPage />} />
          {/* Sprint 71 — Funding feed. */}
          <Route path="/grants" element={<GrantsListPage />} />
          <Route path="/grants/me/bookmarks" element={<GrantsBookmarksPage />} />
          <Route path="/grants/:id" element={<GrantDetailPage />} />
          {/* Sprint 72 — author profile aggregator. */}
          <Route path="/authors/:username" element={<AuthorPage />} />
          {/* Sprint 79 — Lab protocol + equipment library. */}
          <Route path="/lab/protocols" element={<ProtocolsListPage />} />
          <Route
            path="/lab/protocols/new"
            element={<ProtocolEditPage mode="new" />}
          />
          <Route
            path="/lab/protocols/wizard"
            element={<ProtocolWizardPage />}
          />
          <Route
            path="/lab/protocols/:slug/edit"
            element={<ProtocolEditPage mode="edit" />}
          />
          <Route
            path="/lab/protocols/:slug"
            element={<ProtocolDetailPage />}
          />
          <Route path="/lab/equipment" element={<EquipmentListPage />} />
          <Route
            path="/lab/equipment/:slug"
            element={<EquipmentDetailPage />}
          />
          {/* Sprint 80 — Safety certifications + protocol-run sign-offs. */}
          <Route
            path="/lab/safety-certs"
            element={<SafetyCertsListPage />}
          />
          <Route
            path="/lab/safety-certs/:slug"
            element={<SafetyCertPage />}
          />
          <Route path="/lab/runs/:id" element={<ProtocolRunPage />} />
          <Route path="/me/lab" element={<MyLabPage />} />
          <Route
            path="/lab-groups/:slug/roster"
            element={<LabRosterPage />}
          />
          {/* Sprint 73 — exam mastery framework. */}
          <Route path="/exams" element={<ExamsListPage />} />
          <Route path="/exams/:slug" element={<ExamPage />} />
          <Route
            path="/exams/:slug/run/:attemptId"
            element={<ExamRunnerPage />}
          />
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
          {/* S86 — classes + pets. */}
          <Route path="/classes" element={<ClassesListPage />} />
          <Route path="/classes/:slug" element={<ClassPage />} />
          <Route path="/classes/:slug/edit" element={<ClassEditPage />} />
          <Route
            path="/classes/:slug/gradebook"
            element={<ClassGradebookPage />}
          />
          <Route
            path="/classes/:slug/calendar"
            element={<ClassCalendarPage />}
          />
          <Route path="/classes/:slug/tasks/:taskId" element={<ClassTaskPage />} />
          <Route
            path="/classes/:slug/competitions/:competitionId"
            element={<CompetitionDetailPage />}
          />
          <Route path="/classes/:slug/analytics" element={<ClassAnalyticsPage />} />
          <Route path="/me/pet" element={<MyPetPage />} />
          <Route path="/me/inventory" element={<InventoryPage />} />
          <Route path="/me/progress" element={<MyProgressPage />} />
          <Route path="/skins" element={<SkinShowcasePage />} />
          <Route path="/explore/pets" element={<PetShowcasePage />} />
          <Route path="/join/:slug/:joinCode" element={<JoinClassPage />} />
          <Route path="/classes/discover" element={<ClassesDirectoryPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/tracks" element={<CapstoneTracksListPage />} />
          <Route path="/tracks/c/:artifactSlug" element={<CapstoneTrackArtifactPage />} />
          <Route path="/tracks/:slug" element={<CapstoneTrackPage />} />
          <Route path="/invitations/:token" element={<CohortInvitationAcceptPage />} />
          <Route path="/admin/approvals" element={<AdminApprovalsPage />} />
          <Route path="/admin/errors" element={<AdminErrorStatsPage />} />
          <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
          <Route path="/me/weak-concepts" element={<WeakConceptsPage />} />
          <Route path="/me/mri" element={<KnowledgeMRIPage />} />
          <Route path="/me/mentors" element={<MentorDashboardPage />} />
          <Route path="/cite/p/:author/:slug" element={<CitePaperRedirect />} />
          <Route path="/cite/c/:author/:slug" element={<CiteCapstoneRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AppErrorBoundary>
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
      <AppRoutes />
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
