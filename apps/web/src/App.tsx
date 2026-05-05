import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { WikiListPage } from "./pages/WikiListPage";
import { WikiPage } from "./pages/WikiPage";
import { WikiEditPage } from "./pages/WikiEditPage";
import { WikiNewPage } from "./pages/WikiNewPage";
import { SearchPage } from "./pages/SearchPage";
import { MasteryListPage } from "./pages/MasteryListPage";
import { MasteryPathPage } from "./pages/MasteryPathPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ForumListPage } from "./pages/ForumListPage";
import { ForumTopicPage } from "./pages/ForumTopicPage";
import { NewTopicPage } from "./pages/NewTopicPage";
import { NewsListPage } from "./pages/NewsListPage";
import { NewsArticlePage } from "./pages/NewsArticlePage";
import { NewsNewPage } from "./pages/NewsNewPage";
import { NewsEditPage } from "./pages/NewsEditPage";
import { NewsProposeEditPage } from "./pages/NewsProposeEditPage";
import { NewsProposalsPage } from "./pages/NewsProposalsPage";
import { NewsBookmarksPage } from "./pages/NewsBookmarksPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FlashcardsPage } from "./pages/FlashcardsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";

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
        <Route path="/forum/t/:slug" element={<ForumTopicPage />} />
        <Route path="/forum/:domain" element={<ForumListPage />} />
        <Route path="/news" element={<NewsListPage />} />
        <Route path="/news/new" element={<NewsNewPage />} />
        <Route path="/news/bookmarks" element={<NewsBookmarksPage />} />
        <Route path="/news/:slug" element={<NewsArticlePage />} />
        <Route path="/news/:slug/edit" element={<NewsEditPage />} />
        <Route path="/news/:slug/propose" element={<NewsProposeEditPage />} />
        <Route path="/news/:slug/proposals" element={<NewsProposalsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/flashcards" element={<FlashcardsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
