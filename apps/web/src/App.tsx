import { lazy, Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { WikiListPage } from "./pages/WikiListPage";
import { WikiPage } from "./pages/WikiPage";
import { SearchPage } from "./pages/SearchPage";
import { MasteryListPage } from "./pages/MasteryListPage";
import { MasteryPathPage } from "./pages/MasteryPathPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ForumListPage } from "./pages/ForumListPage";
import { ForumTopicPage } from "./pages/ForumTopicPage";
import { NewsListPage } from "./pages/NewsListPage";
import { NewsArticlePage } from "./pages/NewsArticlePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";

// Heavy pages and rarely-needed-on-first-load editor flows are
// lazy-loaded so the initial bundle is much smaller. Editors pull in
// MarkdownRenderer + KaTeX + viz code that the article reader doesn't
// need.
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
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const FlashcardsPage = lazy(() =>
  import("./pages/FlashcardsPage").then((m) => ({ default: m.FlashcardsPage })),
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
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/wiki" element={<WikiListPage />} />
          <Route path="/wiki/new" element={<WikiNewPage />} />
          <Route path="/wiki/:slug" element={<WikiPage />} />
          <Route path="/wiki/:slug/edit" element={<WikiEditPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/paths" element={<MasteryListPage />} />
          <Route path="/paths/:slug" element={<MasteryPathPage />} />
          <Route path="/forum" element={<ForumListPage />} />
          <Route path="/forum/new" element={<NewTopicPage />} />
          <Route path="/forum/bookmarks" element={<ForumBookmarksPage />} />
          <Route path="/forum/t/:slug" element={<ForumTopicPage />} />
          <Route path="/forum/:domain" element={<ForumListPage />} />
          <Route path="/news" element={<NewsListPage />} />
          <Route path="/news/new" element={<NewsNewPage />} />
          <Route path="/news/bookmarks" element={<NewsBookmarksPage />} />
          <Route path="/news/drafts" element={<NewsDraftsPage />} />
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
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
