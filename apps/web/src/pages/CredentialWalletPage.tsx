// Phase 28A — verifiable credential wallet.
//
// One shareable surface aggregating every signed achievement a
// user has earned: capstones, tracks, hackathon prizes, exams,
// peer-verified reproductions, completed research bounties.
// Two routes hit this page:
//   /me/credentials            — the caller's own (with a privacy
//                                 toggle + a JSON export).
//   /u/:username/credentials   — anyone's public portfolio.
// An employer or grad-school reviewer can open the public URL in
// an incognito window and verify each credential without logging
// in.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Award,
  BadgeCheck,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FlaskConical,
  GraduationCap,
  ScrollText,
  Trophy,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { toast } from "../stores/toast";

type Credential = {
  kind: string;
  title: string;
  earnedAt: string;
  signed: boolean;
  detailUrl: string;
  verifyUrl: string | null;
  skills: Array<{ slug: string; title: string }>;
};

const KIND_META: Record<
  string,
  { label: string; icon: typeof Award }
> = {
  capstone: { label: "Capstone", icon: GraduationCap },
  capstone_track: { label: "Capstone track", icon: ScrollText },
  hackathon_prize: { label: "Hackathon prize", icon: Trophy },
  exam: { label: "Exam", icon: BadgeCheck },
  reproduction: { label: "Verified reproduction", icon: FlaskConical },
  bounty: { label: "Research bounty", icon: Award },
};

export function CredentialWalletPage() {
  const { username: paramUsername } = useParams<{ username: string }>();
  const me = useAuthStore((s) => s.user);
  const isOwnView = !paramUsername;

  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [ownerName, setOwnerName] = useState<string>("");
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCreds(null);
    if (isOwnView) {
      if (!me) {
        setError("Sign in to see your credential wallet.");
        return;
      }
      api.credentials
        .mine()
        .then((r) => {
          if (cancelled) return;
          setCreds(r.credentials);
          setIsPublic(r.credentialsPublic);
          setOwnerName(me.displayName || `@${me.username}`);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e instanceof ApiError ? e.message : "Failed to load");
          }
        });
    } else {
      api.credentials
        .forUser(paramUsername!)
        .then((r) => {
          if (cancelled) return;
          setCreds(r.credentials);
          setOwnerName(r.user.displayName || `@${r.user.username}`);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(
              e instanceof ApiError ? e.message : "Failed to load portfolio",
            );
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isOwnView, paramUsername, me?.id]);

  const toggleVisibility = async () => {
    if (isPublic === null) return;
    setBusy(true);
    try {
      await api.credentials.setVisibility(!isPublic);
      setIsPublic(!isPublic);
      toast.success(
        !isPublic
          ? "Portfolio is now public — share the link."
          : "Portfolio is now private.",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <BadgeCheck
          className="w-10 h-10 mx-auto mb-3 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          Credential wallet
        </h1>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        {!me && isOwnView && (
          <Link
            to="/login"
            className="inline-block text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <BadgeCheck className="w-7 h-7 text-primary" />
          {isOwnView ? "Your credentials" : `${ownerName}'s credentials`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Every signed achievement in one place. Each credential is
          cryptographically verifiable — anyone can confirm it without
          trusting Axiomic.
        </p>
      </header>

      {isOwnView && isPublic !== null && (
        <div className="rounded-lg border border-border bg-card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <div className="font-medium inline-flex items-center gap-1.5">
              {isPublic ? (
                <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
              {isPublic ? "Public portfolio" : "Private portfolio"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {isPublic ? (
                <>
                  Anyone can view{" "}
                  <Link
                    to={`/u/${me!.username}/credentials`}
                    className="text-primary hover:underline"
                  >
                    /u/{me!.username}/credentials
                  </Link>
                </>
              ) : (
                "Only you can see this. Make it public to share with employers."
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/v1/me/credentials?format=json"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              Export JSON
            </a>
            <button
              type="button"
              onClick={toggleVisibility}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPublic ? "Make private" : "Make public"}
            </button>
          </div>
        </div>
      )}

      {creds === null && (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {creds && creds.length === 0 && (
        <EmptyState
          icon={BadgeCheck}
          title="No credentials yet"
          description={
            isOwnView
              ? "Complete a capstone, pass an exam, win a hackathon, get a reproduction verified, or finish a research bounty — they'll all show up here, signed."
              : "This person hasn't earned any verifiable credentials yet."
          }
        />
      )}

      {creds && creds.length > 0 && (
        <ul className="space-y-3">
          {creds.map((c, i) => {
            const meta = KIND_META[c.kind] ?? {
              label: c.kind,
              icon: Award,
            };
            const Icon = meta.icon;
            return (
              <li
                key={`${c.kind}-${c.earnedAt}-${i}`}
                className="rounded-lg border border-border bg-card p-4"
                data-testid="credential-row"
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 mt-0.5 w-9 h-9 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h2 className="font-display text-base font-semibold leading-snug">
                        {c.title}
                      </h2>
                      {c.signed && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                          <BadgeCheck className="w-3 h-3" />
                          Signed
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-full border border-border">
                        {meta.label}
                      </span>
                      <span>
                        earned {new Date(c.earnedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {c.skills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.skills.map((s) => (
                          <span
                            key={s.slug}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                          >
                            {s.title}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <Link
                        to={c.detailUrl}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                      {c.verifyUrl && (
                        <a
                          href={c.verifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          Verify transcript{" "}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creds && creds.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-6">
          Verify any credential against the platform's public key at{" "}
          <Link to="/verify" className="text-primary hover:underline">
            /verify
          </Link>
          . Signed credentials use Ed25519 over canonical JSON, so they
          re-verify offline.
        </p>
      )}
    </div>
  );
}
