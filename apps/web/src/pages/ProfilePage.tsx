import { useAuthStore } from "../stores/auth";
import { Link } from "react-router-dom";

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">You need to be signed in to view your profile.</p>
        <Link to="/login" className="text-primary hover:underline">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
          {(user.displayName || user.username).charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user.displayName || user.username}</h1>
          <p className="text-muted-foreground text-sm">@{user.username}</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "recently"}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Learning Progress</h2>
          <Link
            to="/paths/ml-engineer"
            className="block p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">ML Engineer Path</h3>
                <p className="text-sm text-muted-foreground">Track your progress through the mastery path</p>
              </div>
              <span className="text-primary text-sm">View &rarr;</span>
            </div>
          </Link>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Account</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Username</span>
              <span>@{user.username}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
