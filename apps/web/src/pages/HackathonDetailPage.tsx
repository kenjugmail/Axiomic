// Phase 27D — hackathon detail page.
//
// One page that adapts based on viewer role + hackathon status.
// Sections:
// - Header (title, host context, status badge, schedule).
// - Description + rules (markdown).
// - Prizes (read for everyone; edit + add for organizer).
// - Teams (join / create / leave; submit if captain).
// - Organizer panel (publish / judge / award prizes).
// - Awards summary (after status=ended).

import { useEffect, useState } from "react";
import { confirm } from "../stores/confirm";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Award,
  ChevronLeft,
  Gavel,
  Plus,
  Send,
  Trash2,
  Trophy,
  UserPlus,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Modal, Skeleton } from "../components/ui";
import { toast } from "../stores/toast";

type Detail = Awaited<ReturnType<typeof api.hackathons.get>>;

export function HackathonDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const r = await api.hackathons.get(slug);
      setData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api.hackathons
      .get(slug)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          to="/hackathons"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> Back
        </Link>
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { hackathon: h, prizes, teams, submissions, awards, myTeamId } = data;
  const isOrganizer = h.isOrganizer;
  const myTeam = teams.find((t) => t.id === myTeamId) ?? null;
  const isCaptain = !!myTeam && me?.id === myTeam.captainId;
  const mySubmission = mySubmissionFor(myTeam, submissions);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link
        to="/hackathons"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> All hackathons
      </Link>

      <header className="mt-3 mb-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <span className="text-5xl shrink-0" aria-hidden>
            {h.coverEmoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {h.title}
              </h1>
              <StatusBadge status={h.status} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full border border-border">
                {h.fieldTag}
              </span>
              <span>{h.hostMode}</span>
              {h.hostContext && (
                <>
                  <span>·</span>
                  <Link
                    to={
                      h.hostContext.kind === "class"
                        ? `/classes/${h.hostContext.slug}`
                        : `/cohorts/${h.hostContext.slug}`
                    }
                    className="hover:text-foreground"
                  >
                    {h.hostContext.title}
                  </Link>
                </>
              )}
              <span>·</span>
              <span>teams up to {h.maxTeamSize}</span>
              <span>·</span>
              <span>{h.judgingMode === "ai_rubric" ? "AI-judged" : "manually judged"}</span>
            </div>
            {(h.startsAt || h.endsAt) && (
              <div className="text-xs text-muted-foreground mt-2">
                {h.startsAt && (
                  <>starts {new Date(h.startsAt).toLocaleString()}</>
                )}
                {h.startsAt && h.endsAt && " · "}
                {h.endsAt && <>ends {new Date(h.endsAt).toLocaleString()}</>}
              </div>
            )}
          </div>
        </div>
      </header>

      {h.descriptionMd && (
        <section className="mb-6 prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={h.descriptionMd} />
        </section>
      )}

      {h.rulesMd && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-2">Rules</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={h.rulesMd} />
          </div>
        </section>
      )}

      {/* Prizes */}
      <PrizesSection
        slug={slug}
        prizes={prizes}
        teams={teams}
        awards={awards}
        isOrganizer={isOrganizer}
        canAward={h.status === "ended"}
        onChanged={reload}
      />

      {/* Teams + register */}
      <TeamsSection
        slug={slug}
        hackathon={h}
        teams={teams}
        myTeam={myTeam}
        canRegister={h.status === "registration" && !!me && !myTeam}
        onChanged={reload}
      />

      {/* Submission (captain only when in progress; everyone after end) */}
      {(myTeam || isOrganizer) && (
        <SubmissionSection
          slug={slug}
          hackathon={h}
          myTeam={myTeam}
          isCaptain={isCaptain}
          isOrganizer={isOrganizer}
          submissions={submissions}
          mySubmission={mySubmission}
          onChanged={reload}
        />
      )}

      {/* Organizer-only panel */}
      {isOrganizer && (
        <OrganizerPanel
          slug={slug}
          hackathon={h}
          onChanged={reload}
          onDeleted={() => navigate("/hackathons")}
        />
      )}
    </div>
  );
}

// ---------- helpers ----------

function mySubmissionFor(
  myTeam: Detail["teams"][number] | null,
  submissions: Detail["submissions"],
): Detail["submissions"][number] | null {
  if (!myTeam) return null;
  return submissions.find((s) => s.teamId === myTeam.id) ?? null;
}

function StatusBadge({ status }: { status: Detail["hackathon"]["status"] }) {
  const tone: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-border",
    registration:
      "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    active:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    judging:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    ended:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${tone[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

// ---------- prizes ----------

function PrizesSection({
  slug,
  prizes,
  teams,
  awards,
  isOrganizer,
  canAward,
  onChanged,
}: {
  slug: string;
  prizes: Detail["prizes"];
  teams: Detail["teams"];
  awards: Detail["awards"];
  isOrganizer: boolean;
  canAward: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [rank, setRank] = useState(1);
  const [xpAmount, setXpAmount] = useState(100);
  const [cosmeticSlug, setCosmeticSlug] = useState("");
  const [skinSlug, setSkinSlug] = useState("");
  const [badgeSlug, setBadgeSlug] = useState("");
  const [maxWinners, setMaxWinners] = useState(1);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.hackathons.createPrize(slug, {
        title: title.trim(),
        rank,
        xpAmount,
        cosmeticSlug: cosmeticSlug.trim() || null,
        skinSlug: skinSlug.trim() || null,
        badgeSlug: badgeSlug.trim() || null,
        maxWinners,
      });
      setTitle("");
      setRank(1);
      setXpAmount(100);
      setCosmeticSlug("");
      setSkinSlug("");
      setBadgeSlug("");
      setMaxWinners(1);
      setCreating(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: "Delete this prize tier?", destructive: true })))
      return;
    try {
      await api.hackathons.deletePrize(slug, id);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-primary" />
          Prizes
        </h2>
        {isOrganizer && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            Add prize
          </button>
        )}
      </div>

      {creating && isOrganizer && (
        <div className="rounded-md border border-border bg-card p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="1st place (or 'Best UX')"
              className="text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
            <input
              type="number"
              min={0}
              max={50}
              value={rank}
              onChange={(e) => setRank(parseInt(e.target.value, 10) || 0)}
              placeholder="rank (1, 2, 3 or 0)"
              className="text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              max={10000}
              value={xpAmount}
              onChange={(e) => setXpAmount(parseInt(e.target.value, 10) || 0)}
              placeholder="XP amount"
              className="text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
            <input
              type="number"
              min={1}
              max={50}
              value={maxWinners}
              onChange={(e) => setMaxWinners(parseInt(e.target.value, 10) || 1)}
              placeholder="max winners (1 = single)"
              className="text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </div>
          <input
            value={cosmeticSlug}
            onChange={(e) => setCosmeticSlug(e.target.value)}
            placeholder="Pet cosmetic slug (optional)"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
          <input
            value={skinSlug}
            onChange={(e) => setSkinSlug(e.target.value)}
            placeholder="Pet skin slug (optional)"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
          <input
            value={badgeSlug}
            onChange={(e) => setBadgeSlug(e.target.value)}
            placeholder="Badge / achievement slug (optional)"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={create}
              disabled={busy || !title.trim()}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Adding…" : "Add prize"}
            </button>
          </div>
        </div>
      )}

      {prizes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prizes yet.</p>
      ) : (
        <ul className="space-y-2">
          {prizes.map((p) => {
            const winnerIds = awards
              .filter((a) => a.prizeId === p.id)
              .map((a) => a.teamId);
            const winnerTeams = winnerIds
              .map((tid) => teams.find((t) => t.id === tid))
              .filter(Boolean) as Detail["teams"];
            return (
              <li
                key={p.id}
                className="rounded-md border border-border bg-card p-3"
                data-testid="prize-row"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {p.rank > 0 && (
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          #{p.rank}
                        </span>
                      )}
                      {p.title}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                      {p.xpAmount > 0 && <span>{p.xpAmount} XP</span>}
                      {p.cosmeticSlug && <span>cosmetic · {p.cosmeticSlug}</span>}
                      {p.skinSlug && <span>skin · {p.skinSlug}</span>}
                      {p.badgeSlug && <span>badge · {p.badgeSlug}</span>}
                      {p.maxWinners > 1 && (
                        <span>up to {p.maxWinners} winners</span>
                      )}
                    </div>
                  </div>
                  {isOrganizer && (
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="text-rose-600 dark:text-rose-400 hover:text-rose-500"
                      aria-label="Delete prize"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {winnerTeams.length > 0 && (
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Awarded to: </span>
                    {winnerTeams.map((t, i) => (
                      <span key={t.id}>
                        <strong>{t.name}</strong>
                        {i < winnerTeams.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                )}
                {isOrganizer && canAward && winnerTeams.length < p.maxWinners && (
                  <AwardPrizeButton
                    slug={slug}
                    prizeId={p.id}
                    teams={teams.filter(
                      (t) => !winnerIds.includes(t.id),
                    )}
                    onChanged={onChanged}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AwardPrizeButton({
  slug,
  prizeId,
  teams,
  onChanged,
}: {
  slug: string;
  prizeId: string;
  teams: Detail["teams"];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const award = async (teamId: string) => {
    setBusy(true);
    try {
      await api.hackathons.awardPrize(slug, prizeId, teamId);
      toast.success("Prize awarded — rewards distributed.");
      setOpen(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Award failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs px-3 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 inline-flex items-center gap-1.5"
      >
        <Award className="w-3 h-3" />
        Award this prize
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Award prize to which team?"
      >
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No remaining teams to award this prize to.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {teams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => award(t.id)}
                  disabled={busy}
                  className="w-full text-left text-sm rounded-md border border-border px-3 py-2 hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {t.members.length} member{t.members.length === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

// ---------- teams ----------

function TeamsSection({
  slug,
  hackathon,
  teams,
  myTeam,
  canRegister,
  onChanged,
}: {
  slug: string;
  hackathon: Detail["hackathon"];
  teams: Detail["teams"];
  myTeam: Detail["teams"][number] | null;
  canRegister: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);

  const registerSolo = async () => {
    setBusy(true);
    try {
      await api.hackathons.registerSolo(slug);
      toast.success("Registered solo");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Register failed");
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!teamName.trim()) return;
    setBusy(true);
    try {
      await api.hackathons.createTeam(slug, teamName.trim());
      toast.success("Team created");
      setTeamName("");
      setCreatingTeam(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Create team failed");
    } finally {
      setBusy(false);
    }
  };

  const joinTeam = async (teamId: string) => {
    setBusy(true);
    try {
      await api.hackathons.joinTeam(slug, teamId);
      toast.success("Joined team");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Join failed");
    } finally {
      setBusy(false);
    }
  };

  const leaveTeam = async (teamId: string) => {
    if (!(await confirm({ title: "Leave this team?", destructive: true })))
      return;
    try {
      await api.hackathons.leaveTeam(slug, teamId);
      toast.success("Left team");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Leave failed");
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold">
          Teams ({teams.length})
        </h2>
        {canRegister && (
          <div className="flex gap-2">
            {hackathon.maxTeamSize === 1 ? (
              <button
                type="button"
                onClick={registerSolo}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3 h-3" />
                Register
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={registerSolo}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50"
                >
                  Register solo
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingTeam(true)}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  Create team
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {creatingTeam && (
        <div className="rounded-md border border-border bg-card p-3 mb-3 flex items-center gap-2 flex-wrap">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            className="text-sm px-3 py-2 rounded-md border border-border bg-background flex-1"
          />
          <button
            type="button"
            onClick={() => setCreatingTeam(false)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createTeam}
            disabled={busy || !teamName.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No teams yet.</p>
      ) : (
        <ul className="space-y-2">
          {teams.map((t) => {
            const isMine = myTeam?.id === t.id;
            const canJoin =
              hackathon.status === "registration" &&
              !myTeam &&
              t.members.length < hackathon.maxTeamSize;
            return (
              <li
                key={t.id}
                className={`rounded-md border bg-card p-3 ${
                  isMine ? "border-primary/40 bg-primary/5" : "border-border"
                }`}
                data-testid="team-row"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.members
                        .map((m) => m.displayName ?? `@${m.username}`)
                        .join(", ")}{" "}
                      · {t.members.length}/{hackathon.maxTeamSize}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => leaveTeam(t.id)}
                        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                      >
                        Leave
                      </button>
                    )}
                    {!isMine && canJoin && (
                      <button
                        type="button"
                        onClick={() => joinTeam(t.id)}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- submission ----------

function SubmissionSection({
  slug,
  hackathon,
  myTeam,
  isCaptain,
  isOrganizer,
  submissions,
  mySubmission,
  onChanged,
}: {
  slug: string;
  hackathon: Detail["hackathon"];
  myTeam: Detail["teams"][number] | null;
  isCaptain: boolean;
  isOrganizer: boolean;
  submissions: Detail["submissions"];
  mySubmission: Detail["submissions"][number] | null;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(mySubmission?.title ?? "");
  const [writeup, setWriteup] = useState(mySubmission?.writeup ?? "");
  const [busy, setBusy] = useState(false);
  const submissionsOpen =
    hackathon.status === "registration" || hackathon.status === "active";

  const submit = async () => {
    if (!myTeam || !title.trim()) return;
    setBusy(true);
    try {
      await api.hackathons.submit(slug, myTeam.id, {
        title: title.trim(),
        writeup,
      });
      toast.success("Submitted");
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  // Re-sync editor state when the underlying submission changes
  // (e.g., after reload).
  useEffect(() => {
    setTitle(mySubmission?.title ?? "");
    setWriteup(mySubmission?.writeup ?? "");
  }, [mySubmission?.id, mySubmission?.title, mySubmission?.writeup]);

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3">Submissions</h2>

      {/* Captain's editor */}
      {myTeam && isCaptain && submissionsOpen && (
        <div className="rounded-md border border-border bg-card p-3 mb-3">
          {!editing && mySubmission ? (
            <div>
              <div className="text-sm font-semibold">{mySubmission.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                submitted {new Date(mySubmission.submittedAt).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Edit submission
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project title"
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
              />
              <textarea
                value={writeup}
                onChange={(e) => setWriteup(e.target.value)}
                rows={6}
                placeholder="Writeup (markdown). Link to your GitHub / Colab / demo in the body for now."
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
              />
              <div className="flex justify-end gap-2">
                {mySubmission && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !title.trim()}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  {busy ? "Submitting…" : mySubmission ? "Save" : "Submit"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* List (organizer sees all; participants see their own only) */}
      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      ) : (
        <ul className="space-y-2">
          {submissions.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-border bg-card p-3"
              data-testid="submission-row"
            >
              <div className="text-sm font-semibold">{s.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                submitted {new Date(s.submittedAt).toLocaleString()}
                {s.gradedAt && (
                  <> · graded {new Date(s.gradedAt).toLocaleString()}</>
                )}
              </div>
              {s.writeup && (
                <div className="mt-2 prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownRenderer content={s.writeup} />
                </div>
              )}
              {s.aiGrade != null && (
                <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-xs">
                  <div className="font-medium mb-1">AI grade</div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px]">
                    {JSON.stringify(s.aiGrade, null, 2)}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOrganizer && submissions.length > 0 && hackathon.status === "ended" && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Organizers see every team's submission; participants only see their
          own (and only after judging completes).
        </p>
      )}
    </section>
  );
}

// ---------- organizer panel ----------

function OrganizerPanel({
  slug,
  hackathon,
  onChanged,
  onDeleted,
}: {
  slug: string;
  hackathon: Detail["hackathon"];
  onChanged: () => void | Promise<void>;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    try {
      await api.hackathons.publish(slug);
      toast.success("Published — registration is open.");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };
  const judge = async () => {
    if (
      !(await confirm({
        title:
          hackathon.judgingMode === "ai_rubric"
            ? "Run AI judging on all submissions?"
            : "Mark judging complete?",
        body:
          hackathon.judgingMode === "ai_rubric"
            ? "This will call the AI grader per submission."
            : "You can then award prizes.",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await api.hackathons.judge(slug);
      toast.success(
        hackathon.judgingMode === "ai_rubric"
          ? `Judged ${r.graded} submission${r.graded === 1 ? "" : "s"} (${r.errors} errors)`
          : "Judging complete.",
      );
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Judge failed");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (
      !(await confirm({
        title: "Delete this hackathon?",
        body: "Only allowed in draft.",
        destructive: true,
      }))
    )
      return;
    try {
      await api.hackathons.delete(slug);
      toast.success("Deleted");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };
  return (
    <section className="rounded-md border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
        <Gavel className="w-4 h-4 text-primary" />
        Organizer panel
      </h2>
      <div className="flex flex-wrap gap-2">
        {hackathon.status === "draft" && (
          <>
            <button
              type="button"
              onClick={publish}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
            <button
              type="button"
              onClick={remove}
              className="text-xs px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              Delete draft
            </button>
          </>
        )}
        {(hackathon.status === "registration" || hackathon.status === "active") && (
          <button
            type="button"
            onClick={judge}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Gavel className="w-3 h-3" />
            {busy ? "Judging…" : "Close submissions + judge"}
          </button>
        )}
        {hackathon.status === "ended" && (
          <p className="text-xs text-muted-foreground">
            Judging complete. Award prizes from the Prizes section above.
          </p>
        )}
      </div>
    </section>
  );
}
