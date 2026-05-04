import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import type { ThemePreference, UserSettings } from "@axiomic/types";

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyReplies, setNotifyReplies] = useState(true);
  const [notifyMastery, setNotifyMastery] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      })
      .catch((e) => setError(e.message ?? "Failed to load settings"));
  }, [user, navigate]);

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
    </div>
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
