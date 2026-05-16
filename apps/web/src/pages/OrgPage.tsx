// Phase 34B — organization / institution page.
//
// Public profile + members + the signed attestations the org has
// issued. A verifier/admin (resolved server-side via the
// authed /orgs/:slug call) sees an attest action.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, BadgeCheck, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";

export function OrgPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.orgs.get>
  > | null>(null);
  const [pub, setPub] = useState<Awaited<
    ReturnType<typeof api.publicApi.org>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attUser, setAttUser] = useState("");
  const [attRef, setAttRef] = useState("");

  const load = () => {
    api.publicApi
      .org(slug)
      .then(setPub)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load"),
      );
    if (user) {
      api.orgs
        .get(slug)
        .then(setData)
        .catch((e) =>
          setError((prev) =>
            prev ?? (e instanceof ApiError ? e.message : null),
          ),
        );
    }
  };
  useEffect(() => {
    load();
  }, [slug, user?.id]);

  const role = data?.role ?? null;
  const canAttest = role === "admin" || role === "verifier";

  const attest = async () => {
    if (!attUser.trim()) return;
    try {
      await api.orgs.attest(slug, attUser.trim(), "reproduction", attRef.trim());
      toast.success("Attestation signed");
      setAttUser("");
      setAttRef("");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not attest");
    }
  };

  // Fall back to the authed payload if the public endpoint
  // transiently fails (an admin/member should still see the
  // page); only hard-error when neither source resolved.
  const view: Awaited<ReturnType<typeof api.publicApi.org>> | null = pub
    ? pub
    : data
      ? {
          org: data.org,
          members: data.members.map((m) => ({
            username: m.username,
            displayName: m.displayName,
            role: m.role,
          })),
          attestations: [],
        }
      : null;

  if (!view) {
    if (error) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Building2 className="w-7 h-7 text-primary" />
          {view.org.name}
          {view.org.verificationStatus === "verified" && (
            <ShieldCheck
              className="w-5 h-5 text-emerald-600 dark:text-emerald-400"
              aria-label="Verified org"
            />
          )}
        </h1>
        {view.org.descriptionMd && (
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            {view.org.descriptionMd}
          </p>
        )}
        {view.org.website && (
          <a
            href={view.org.website}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {view.org.website}
          </a>
        )}
      </header>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2">
          Members ({view.members.length})
        </h2>
        <ul className="flex flex-wrap gap-2">
          {view.members.map((m) => (
            <li
              key={m.username}
              className="text-xs px-2 py-1 rounded-full border border-border"
            >
              @{m.username}{" "}
              <span className="text-muted-foreground">· {m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      {canAttest && (
        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Attest a member's reproduction
          </h2>
          <div className="flex gap-2 flex-wrap items-end">
            <input
              value={attUser}
              onChange={(e) => setAttUser(e.target.value)}
              placeholder="member username"
              className="text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
            <input
              value={attRef}
              onChange={(e) => setAttRef(e.target.value)}
              placeholder="reproduction id (optional)"
              className="text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
            <button
              type="button"
              onClick={attest}
              className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Sign attestation
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-2 inline-flex items-center gap-1.5">
          <BadgeCheck className="w-4 h-4 text-primary" />
          Signed attestations ({view.attestations.length})
        </h2>
        {view.attestations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This org hasn't issued any attestations yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {view.attestations.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-border p-3 text-sm"
              >
                <span className="font-medium">{a.attestKind}</span>
                {a.statement && (
                  <span className="text-muted-foreground"> — {a.statement}</span>
                )}
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {new Date(a.createdAt).toLocaleDateString()} · Ed25519-signed
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Verifiable bundle:{" "}
          <code className="text-[11px]">
            /api/v1/public/orgs/{slug}?format=vc
          </code>
        </p>
      </section>
    </div>
  );
}
