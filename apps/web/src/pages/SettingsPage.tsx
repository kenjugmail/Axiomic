import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import type { ThemePreference, UserSettings } from "@axiomic/types";
import { readPushState, subscribePush, unsubscribePush, type PushState } from "../lib/pushClient";
import { toast } from "../stores/toast";

export function SettingsPage() {
  const { user, loading: authLoading } = useAuthStore();
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
      });
      setSettings(next);
      setSavedAt(Date.now());
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
