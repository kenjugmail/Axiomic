// Sprint 37 — Public transcript verifier.
//
// /verify lets anyone paste a signed transcript JSON and check the
// signature against this server's published public key (or against a
// caller-supplied key in the bundle). The actual ed25519 verification
// happens server-side at /api/v1/keys/verify, so this page is a thin
// shell around POSTing the bundle and rendering the result.

import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Network,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

interface VerifyResult {
  valid: boolean;
  publicKey?: string;
  canonicalPayload?: string;
  error?: string;
  format?: string;
  // VC path only: false when the proof matched a self-asserted
  // did:key the holder controls, NOT this issuer's key.
  issuerTrusted?: boolean;
  revoked?: boolean;
}

export function VerifyPage() {
  const [params] = useSearchParams();
  const artifactParam = params.get("artifact");
  const [text, setText] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  // Auto-load state for ?artifact=<slug> deep links. We render a
  // banner so the visitor sees what's happening rather than the
  // textarea silently filling itself.
  const [autoLoading, setAutoLoading] = useState<boolean>(Boolean(artifactParam));
  const [autoLoadError, setAutoLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/keys/signing")
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (r?.publicKey) setServerKey(r.publicKey);
      })
      .catch(() => {});
  }, []);

  const verifyBundle = useCallback(async (bundle: { manifest: unknown; signature: string; publicKey?: string }) => {
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const data = (await res.json()) as VerifyResult;
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to verify");
    } finally {
      setBusy(false);
    }
  }, []);

  // Pre-populate from /api/v1/capstones/c/:slug/transcript when
  // ?artifact=<slug> is on the URL. Used by the pitch demo and any
  // shareable verify link from a capstone artifact page.
  useEffect(() => {
    if (!artifactParam) return;
    let cancelled = false;
    setAutoLoadError(null);
    setAutoLoading(true);
    fetch(`/api/v1/capstones/c/${encodeURIComponent(artifactParam)}/transcript`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? `No completed capstone artifact with slug "${artifactParam}".`
              : `Could not load transcript (HTTP ${r.status}).`,
          );
        }
        return (await r.json()) as { manifest: unknown; signature: string; publicKey?: string };
      })
      .then((bundle) => {
        if (cancelled) return;
        setText(JSON.stringify(bundle, null, 2));
        return verifyBundle({
          manifest: bundle.manifest,
          signature: bundle.signature,
          publicKey: bundle.publicKey,
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setAutoLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setAutoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactParam, verifyBundle]);

  const onVerify = async () => {
    setError("");
    setResult(null);
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That isn't valid JSON.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.manifest || !parsed.signature) {
      setError('Bundle must include both "manifest" and "signature".');
      return;
    }
    await verifyBundle({
      manifest: parsed.manifest,
      signature: parsed.signature,
      publicKey: parsed.publicKey,
    });
  };

  const onPasteSample = () => {
    setText("");
    setResult(null);
    setError("");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
  };

  const copyServerKey = async () => {
    if (!serverKey) return;
    try {
      await navigator.clipboard.writeText(serverKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 1500);
    } catch {}
  };

  const manifest = result?.valid ? safeParse(result.canonicalPayload) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-primary" strokeWidth={2} />
        Verify a transcript
      </h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-prose">
        Paste a signed transcript bundle to check proof of work. This
        verifies the credential signature on what was learned, done, and
        published. Signatures are ed25519. The bundle's{" "}
        <code className="px-1 py-0.5 rounded bg-muted text-[11px]">publicKey</code>{" "}
        field is checked against the issuer; you can also pin to this
        Axiomic instance's published key.
      </p>

      {artifactParam && (
        <div
          className={`mt-4 rounded-md border p-3 text-xs ${
            autoLoadError
              ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : autoLoading
              ? "border-border bg-muted/40 text-muted-foreground"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {autoLoading
            ? `Loading signed transcript for "${artifactParam}"…`
            : autoLoadError
            ? autoLoadError
            : `Loaded signed transcript for "${artifactParam}". Verifying…`}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Transcript JSON
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40 cursor-pointer inline-flex items-center gap-1">
              <Upload className="w-3 h-3" strokeWidth={2} />
              Upload
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={onFile}
              />
            </label>
            <button
              type="button"
              onClick={onPasteSample}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Paste {"manifest":...,"signature":"...","publicKey":"..."}'
          className="w-full h-64 px-3 py-2 text-xs font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={onVerify}
            disabled={busy || !text.trim()}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Verify signature"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-rose-600 dark:text-rose-400 inline-flex items-center gap-2">
          <X className="w-4 h-4" strokeWidth={2} />
          {error}
        </p>
      )}

      {result && (
        <div
          className={`mt-4 rounded-md border p-4 ${
            result.valid
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-rose-500/40 bg-rose-500/10"
          }`}
        >
          <div
            className={`text-sm font-semibold inline-flex items-center gap-2 ${
              result.valid
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300"
            }`}
          >
            {result.valid ? (
              <>
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                Signature valid
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                Signature INVALID
              </>
            )}
          </div>
          {result.valid && result.issuerTrusted === false && (
            <div className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 inline-flex items-start gap-2">
              <AlertTriangle
                className="w-4 h-4 mt-0.5 shrink-0"
                strokeWidth={2}
              />
              <span>
                <strong>Self-asserted key — not this issuer.</strong> The
                proof matches a key embedded in the credential itself, not
                Axiomic's issuer key. The bytes are internally consistent
                but this is <em>not</em> an Axiomic-issued credential. Do
                not trust it as proof.
              </span>
            </div>
          )}
          {result.valid && result.issuerTrusted === true && (
            <div className="mt-2 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
              Issued by this Axiomic instance's verified key.
            </div>
          )}
          {result.valid && manifest && (
            <div className="text-xs text-foreground/80 mt-2 space-y-1">
              <div>
                <strong>{manifest.capstone?.title}</strong> · v
                {manifest.capstone?.version}
              </div>
              <div>Signed evidence for learn → do → prove.</div>
              <div>
                Completed by{" "}
                <strong>
                  @{manifest.learner?.username ?? "unknown"}
                </strong>{" "}
                on{" "}
                {manifest.completedAt
                  ? new Date(manifest.completedAt).toLocaleDateString()
                  : "—"}
              </div>
              <div>
                {(manifest.milestones ?? []).length} milestones · issued
                by {manifest.issuer ?? "unknown"}
              </div>
              {manifest.artifactUrl && (
                <div>
                  <a
                    href={manifest.artifactUrl}
                    className="text-primary hover:underline"
                  >
                    Open artifact page →
                  </a>
                </div>
              )}
            </div>
          )}
          {!result.valid && (
            <p className="text-xs text-foreground/80 mt-1">
              The signature does not match the manifest bytes. The
              transcript was either modified after signing or signed by
              a different issuer than the public key supplied.
            </p>
          )}
        </div>
      )}

      <section className="mt-10 pt-6 border-t border-border">
        <h2 className="text-sm font-semibold inline-flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" strokeWidth={2} />
          This server's signing key
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Pin this hex to your records. Any transcript signed by this
          Axiomic instance will verify against it.
        </p>
        <div className="mt-2 rounded-md border border-border p-2 bg-muted/30 flex items-center gap-2">
          <code className="text-[11px] font-mono break-all flex-1">
            {serverKey ?? "loading…"}
          </code>
          {serverKey && (
            <button
              type="button"
              onClick={copyServerKey}
              className="shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-accent/40 inline-flex items-center gap-1"
            >
              {keyCopied ? (
                <Check className="w-3 h-3" strokeWidth={2} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={2} />
              )}
              {keyCopied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          See also:{" "}
          <Link to="/capstones" className="text-primary hover:underline">
            <Network className="w-3 h-3 inline -mt-0.5" /> Capstones gallery
          </Link>
        </p>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-2">Embed &amp; integrate</h2>
        <p className="text-xs text-muted-foreground mb-2">
          Drop the chrome-free verifier into any site:
        </p>
        <pre className="text-[11px] bg-background border border-border rounded-md p-2 overflow-x-auto">
          {`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/verify"
        width="640" height="480" style="border:0"></iframe>`}
        </pre>
        <p className="text-xs text-muted-foreground mt-3">
          Public, CORS-open, no-auth API:{" "}
          <code className="text-[11px]">
            /.well-known/axiomic-signing-pubkey
          </code>
          ,{" "}
          <code className="text-[11px]">
            /api/v1/public/users/:username/credentials
          </code>
          ,{" "}
          <code className="text-[11px]">
            /api/v1/public/research/:kind/:id/provenance
          </code>
          .
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          <strong>Standards &amp; transparency.</strong> Every
          credential is also exportable as a{" "}
          <strong>W3C Verifiable Credential 2.0 / Open Badges 3.0</strong>{" "}
          (<code className="text-[11px]">?format=vc</code> on the
          wallet endpoints) — this verifier accepts a pasted VC
          envelope directly. The issuer DID document lives at{" "}
          <code className="text-[11px]">/.well-known/did.json</code>{" "}
          (did:web + did:key). Issuance &amp; revocation are written
          to a tamper-evident, hash-chained transparency log with a
          signed tree head:{" "}
          <code className="text-[11px]">
            /api/v1/public/transparency/tree-head
          </code>
          .
        </p>
      </section>
    </div>
  );
}

function safeParse(s: string | undefined): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
