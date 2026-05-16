// Phase 31D — embeddable credential verifier.
//
// Self-contained (no router, no auth, no app chrome) so a third
// party can drop it in an <iframe src=".../embed/verify">. Posts
// the pasted signed bundle to the unchanged /api/v1/keys/verify
// and renders the verdict. Independent of VerifyPage so the
// working page carries zero regression risk.

import { useState } from "react";

interface VerifyResult {
  valid: boolean;
  publicKey?: string;
  canonicalPayload?: string;
  error?: string;
  issuerTrusted?: boolean;
}

export function VerifyWidget() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const verify = async () => {
    setError("");
    setResult(null);
    let bundle: { manifest: unknown; signature: string; publicKey?: string };
    try {
      bundle = JSON.parse(text);
    } catch {
      setError("That isn't valid JSON.");
      return;
    }
    if (!bundle || typeof bundle !== "object" || !("signature" in bundle)) {
      setError("Paste a full signed credential bundle (manifest + signature).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      setResult((await res.json()) as VerifyResult);
    } catch {
      setError("Verification request failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-base font-semibold mb-1">
        Verify an Axiomic credential
      </h1>
      <p className="text-xs text-muted-foreground mb-3">
        Paste a signed credential bundle. Verification is
        cryptographic (Ed25519) — it does not trust Axiomic.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder='{"manifest":{...},"signature":"...","publicKey":"..."}'
        className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background font-mono"
      />
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={verify}
        disabled={busy || !text.trim()}
        className="mt-2 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Verifying…" : "Verify"}
      </button>
      {result && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.valid
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="font-semibold">
            {result.valid ? "✓ Signature valid" : "✗ Signature invalid"}
          </div>
          {result.valid && result.issuerTrusted === false && (
            <div className="mt-1 text-xs font-normal text-amber-800 dark:text-amber-200">
              ⚠ Self-asserted key — NOT this issuer. Not an Axiomic-issued
              credential; do not trust as proof.
            </div>
          )}
          {result.canonicalPayload && (
            <pre className="mt-2 text-[10px] overflow-x-auto whitespace-pre-wrap">
              {result.canonicalPayload}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
