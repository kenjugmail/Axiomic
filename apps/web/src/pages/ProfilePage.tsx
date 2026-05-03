import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { api, type MasteryPath } from "../lib/api";
import type { ReputationByDomain } from "@axiomic/types";

export function ProfilePage() {
  const { username: paramUsername } = useParams<{ username?: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const username = paramUsername || currentUser?.username;
  const isOwnProfile = !!currentUser && currentUser.username === username;

  const [reputation, setReputation] = useState<{
    total: number;
    domains: ReputationByDomain[];
  } | null>(null);
  const [paths, setPaths] = useState<MasteryPath[]>([]);

  useEffect(() => {
    if (!username) return;
    api.forum
      .reputation(username)
      .then((r) => setReputation({ total: r.total, domains: r.domains }))
      .catch(() => setReputation({ total: 0, domains: [] }));
  }, [username]);

  useEffect(() => {
    if (!isOwnProfile) return;
    api.mastery.getPaths().then((d) => setPaths(d.paths)).catch(() => {});
  }, [isOwnProfile]);

  if (!username) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          You need to be signed in to view your profile.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const display = isOwnProfile
    ? currentUser?.displayName || currentUser?.username || username
    : username;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
          {display.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{display}</h1>
          <p className="text-muted-foreground text-sm">@{username}</p>
          {isOwnProfile && currentUser?.createdAt && (
            <p className="text-muted-foreground text-xs mt-0.5">
              Joined {new Date(currentUser.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Reputation</h2>
          {reputation === null ? (
            <div className="h-16 animate-pulse bg-muted rounded-lg" />
          ) : reputation.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No forum activity yet.{" "}
              <Link to="/forum" className="text-primary hover:underline">
                Browse the forum
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-semibold">
                  {reputation.total}
                </span>
                <span className="text-sm text-muted-foreground">total</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {reputation.domains.map((d) => (
                  <Link
                    key={d.domainSlug}
                    to={`/forum/${d.domainSlug}`}
                    className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm">{d.domainTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.topicCount} topics · {d.postCount} replies
                      </div>
                    </div>
                    <span
                      className={`text-lg font-semibold ${
                        d.score > 0
                          ? "text-primary"
                          : d.score < 0
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {d.score > 0 ? "+" : ""}
                      {d.score}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {isOwnProfile && (
          <>
            <section>
              <h2 className="text-lg font-semibold mb-3">Learning Progress</h2>
              {paths.length === 0 ? (
                <div className="h-20 animate-pulse bg-muted rounded-lg" />
              ) : (
                <div className="space-y-2">
                  {paths.map((path) => (
                    <Link
                      key={path.id}
                      to={`/paths/${path.slug}`}
                      className="block p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <h3 className="font-medium">{path.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {path.description}
                          </p>
                        </div>
                        <span className="text-primary text-sm shrink-0 ml-4">
                          View &rarr;
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">Account</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Email</span>
                  <span>{currentUser?.email}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Username</span>
                  <span>@{currentUser?.username}</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
