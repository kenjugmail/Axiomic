import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import type { PrimaryPersona, ThemePreference, UserSettings } from "@axiomic/types";
import { AUDIENCES, AUDIENCE_IDS } from "../marketing/audiences";
import { readPushState, subscribePush, unsubscribePush, type PushState } from "../lib/pushClient";
import { toast } from "../stores/toast";

export function SettingsPage() {
  const { user, loading: authLoading, fetchUser } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyReplies, setNotifyReplies] = useState(true);
  const [notifyMastery, setNotifyMastery] = useState(true);
  // Sprint 69 — researcher profile fields. Empty string in state
  // round-trips to null on save (so the user can clear a field).
  const [orcid, setOrcid] = useState("");
  const [scholarUrl, setScholarUrl] = useState("");
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [institution, setInstitution] = useState("");
  const [primaryPersona, setPrimaryPersona] = useState<PrimaryPersona | "">(
    "",
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    api.settings
      .get()
      .then(({ settings }) => {
        setSettings(settings);
        setDisplayName(settings.displayName ?? "");
        setBio(settings.bio ?? "");
        setNotifyMentions(settings.notifyMentions);
        setNotifyReplies(settings.notifyReplies);
        setNotifyMastery(settings.notifyMastery);
        setOrcid(settings.orcid ?? "");
        setScholarUrl(settings.scholarUrl ?? "");
        setBlueskyHandle(settings.blueskyHandle ?? "");
        setTwitterHandle(settings.twitterHandle ?? "");
        setInstitution(settings.institution ?? "");
        setPrimaryPersona(settings.primaryPersona ?? "");
      })
      .catch((e) => setError(e.message ?? "Failed to load settings"));
  }, [user, authLoading, navigate]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { settings: next } = await api.settings.update({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        notifyMentions,
        notifyReplies,
        notifyMastery,
        orcid: orcid.trim() || null,
        scholarUrl: scholarUrl.trim() || null,
        blueskyHandle: blueskyHandle.trim() || null,
        twitterHandle: twitterHandle.trim() || null,
        institution: institution.trim() || null,
        primaryPersona: primaryPersona === "" ? null : primaryPersona,
      });
      setSettings(next);
      setSavedAt(Date.now());
      void fetchUser();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-32 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your profile and preferences.
        </p>
      </div>

      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input
            value={settings.username}
            disabled
            className="w-full px-3 py-2 rounded-md border border-input bg-muted text-muted-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={settings.username}
            maxLength={80}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">How you use Axiomic</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Shapes default coach hints and the shortcuts on your home
          dashboard. Leave unset for a balanced experience.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">
            Primary focus
          </label>
          <select
            value={primaryPersona}
            onChange={(e) =>
              setPrimaryPersona(
                (e.target.value || "") as PrimaryPersona | "",
              )
            }
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="">Not set</option>
            {AUDIENCE_IDS.map((id) => (
              <option key={id} value={id}>
                {AUDIENCES[id].title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Sprint 69 — Researcher profile */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Researcher profile</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Optional. Linking external identities improves your for-you
          feed and is required to claim authored papers.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">ORCID</label>
          <input
            value={orcid}
            onChange={(e) => setOrcid(e.target.value)}
            placeholder="0000-0000-0000-0000"
            maxLength={19}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Your{" "}
            <a
              href="https://orcid.org/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              ORCID
            </a>{" "}
            identifier. Used to verify external paper authorship.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Google Scholar URL
          </label>
          <input
            type="url"
            value={scholarUrl}
            onChange={(e) => setScholarUrl(e.target.value)}
            placeholder="https://scholar.google.com/citations?user=…"
            maxLength={500}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Bluesky handle
            </label>
            <input
              value={blueskyHandle}
              onChange={(e) => setBlueskyHandle(e.target.value)}
              placeholder="@user.bsky.social"
              maxLength={80}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Twitter / X handle
            </label>
            <input
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              placeholder="@username"
              maxLength={40}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Institution</label>
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Stanford, MIT, Independent…"
            maxLength={200}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        {settings.hIndex != null && (
          <div className="text-xs text-muted-foreground">
            h-index: <span className="font-mono">{settings.hIndex}</span>{" "}
            <span className="opacity-60">(refreshed nightly)</span>
          </div>
        )}
      </section>

      {/* Preferences */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Preferences</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Theme</label>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as ThemePreference[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1.5 rounded-md border text-sm capitalize ${
                  theme === t
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Saved automatically on change.
          </p>
        </div>

        <div className="space-y-3">
          <ToggleRow
            label="Notify me when someone @-mentions me"
            description="In forum topics, posts, or wiki comments"
            checked={notifyMentions}
            onChange={setNotifyMentions}
          />
          <ToggleRow
            label="Notify me on replies to my posts"
            description="Forum topic replies, post replies, and wiki comment replies"
            checked={notifyReplies}
            onChange={setNotifyReplies}
          />
          <ToggleRow
            label="Notify me on mastery progress"
            description="When you reach a new level on any mastery path"
            checked={notifyMastery}
            onChange={setNotifyMastery}
          />
        </div>
      </section>

      {/* S107a — Web Push opt-in. Renders a state-aware button:
          "Enable" when supported + unsubscribed, "Disable" when
          already subscribed, or a disabled "Not supported" notice
          on browsers without Push API / when the server lacks
          VAPID keys. */}
      <PushSettingsSection />

      {error && (
        <div className="text-sm text-destructive">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedAt && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
      </div>

      <section className="space-y-2 pt-6 border-t border-border">
        <h2 className="text-lg font-semibold">Storage</h2>
        <p className="text-sm text-muted-foreground">
          <Link
            to="/settings/attachments"
            className="text-primary hover:underline"
          >
            Manage attachments
          </Link>{" "}
          you've uploaded across articles, lessons, posts, and comments.
        </p>
      </section>

      {/* S108 — Danger zone: export + delete. Soft-delete sets a
          deletedAt timestamp; the background job hard-deletes after
          30 days. Export is a one-shot JSON dump of user-scoped data. */}
      <DangerZone />
    </div>
  );
}

function PushSettingsSection() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setState(await readPushState());
    } catch {
      setState({ supported: false, vapidPublicKey: null, subscription: null });
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  if (state === null) return null;

  const canSubscribe = state.supported && state.vapidPublicKey;
  const isSubscribed = !!state.subscription;

  const onEnable = async () => {
    if (!state.vapidPublicKey) return;
    setBusy(true);
    try {
      await subscribePush(state.vapidPublicKey);
      await refresh();
      toast.success("Browser notifications enabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const onDisable = async () => {
    if (!state.subscription) return;
    setBusy(true);
    try {
      await unsubscribePush(state.subscription);
      await refresh();
      toast.success("Browser notifications disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3">Browser notifications</h2>
      <div className="rounded-md border border-border p-4">
        {!state.supported ? (
          <p className="text-sm text-muted-foreground">
            This browser doesn't support push notifications.
          </p>
        ) : !state.vapidPublicKey ? (
          <p className="text-sm text-muted-foreground">
            The server isn't configured for push notifications.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              {isSubscribed
                ? "You'll get a browser notification when something happens here, even when the tab is closed."
                : "Get a native browser notification for new mentions, replies, cosmetic grants, and competition wins."}
            </div>
            <button
              type="button"
              onClick={isSubscribed ? onDisable : onEnable}
              disabled={busy || !canSubscribe}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "…" : isSubscribed ? "Disable" : "Enable"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
    </label>
  );
}

// S108 — Danger zone: export-my-data + soft-delete-account.
function DangerZone() {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await api.me.exportData();
      // Trigger a download client-side. Blob URL is cleaned up after
      // a beat so the browser actually flushes the download.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `axiomic-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setExportError(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async () => {
    if (!confirmPassword) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.me.deleteAccount(confirmPassword);
      // Login session is destroyed server-side; just kick to login.
      navigate("/login");
    } catch (e: any) {
      setDeleteError(e?.message ?? "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-3 pt-6 border-t border-rose-500/30">
      <h2 className="text-lg font-semibold text-rose-700 dark:text-rose-400">Danger zone</h2>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-medium">Export my data</div>
        <p className="text-xs text-muted-foreground">
          Downloads a JSON file containing your profile, posts, comments,
          capstone enrollments, XP history, classes, and cosmetics. Useful
          for backups and GDPR-style data-portability requests.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50"
          >
            {exporting ? "Preparing…" : "Download export"}
          </button>
          {exportError && <span className="text-xs text-rose-600 dark:text-rose-400">{exportError}</span>}
        </div>
      </div>

      <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 space-y-2">
        <div className="text-sm font-medium">Delete my account</div>
        <p className="text-xs text-muted-foreground">
          Marks your account for deletion. You'll be logged out immediately
          and your content will show "[deleted]" as the author. After 30
          days, the account is permanently removed and all your posts,
          comments, capstones, and XP history are deleted.
        </p>
        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
          >
            Delete my account…
          </button>
        ) : (
          <div className="space-y-2">
            <label htmlFor="delete-confirm-password" className="block text-xs">
              Type your password to confirm.
            </label>
            <input
              id="delete-confirm-password"
              type="password"
              autoComplete="current-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full max-w-xs px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || !confirmPassword}
                className="text-xs px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete my account"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmPassword("");
                  setDeleteError(null);
                }}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
              >
                Cancel
              </button>
            </div>
            {deleteError && <p className="text-xs text-rose-600 dark:text-rose-400">{deleteError}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
