import { Check, Clock, AlertTriangle } from "lucide-react";

interface Props {
  expiresAt: string | null;
  // When passed, format dates as "in 12 days" / "expired 3 days ago".
  // When omitted, only show the "valid"/"expiring"/"expired" tag.
  verbose?: boolean;
}

export function certExpiryStatus(expiresAt: string | null): {
  state: "valid" | "expiring" | "expired" | "permanent";
  daysOut: number | null;
} {
  if (expiresAt === null) return { state: "permanent", daysOut: null };
  const days = Math.ceil(
    (Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return { state: "expired", daysOut: days };
  if (days <= 30) return { state: "expiring", daysOut: days };
  return { state: "valid", daysOut: days };
}

export function CertExpiryBadge({ expiresAt, verbose }: Props) {
  const { state, daysOut } = certExpiryStatus(expiresAt);

  if (state === "permanent") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
        <Check className="w-3 h-3" strokeWidth={2.5} />
        Active{verbose ? " · No expiry" : ""}
      </span>
    );
  }
  if (state === "expired") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/15 text-destructive border border-destructive/30">
        <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
        Expired
        {verbose && daysOut !== null
          ? ` ${Math.abs(daysOut)}d ago`
          : ""}
      </span>
    );
  }
  if (state === "expiring") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
        <Clock className="w-3 h-3" strokeWidth={2.5} />
        Expires{verbose ? ` in ${daysOut}d` : ` ${daysOut}d`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
      <Check className="w-3 h-3" strokeWidth={2.5} />
      Active{verbose && daysOut !== null ? ` · ${daysOut}d left` : ""}
    </span>
  );
}
