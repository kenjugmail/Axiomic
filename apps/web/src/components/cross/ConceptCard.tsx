// Sprint 17 — Concept Card.
//
// Renders a compact preview of a wiki concept inside a hover popover
// or any other surface. Lazy-fetches the preview the first time it's
// asked for; subsequent requests for the same slug hit a tiny in-
// memory cache so quickly hovering across [[multi]] [[concepts]] in a
// paragraph stays cheap.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap,
  MessageSquare,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { ConceptPreview } from "@axiomic/types";
import { api } from "../../lib/api";
import { Card, CardBody } from "../ui/Card";

interface Props {
  slug: string;
}

const cache = new Map<string, ConceptPreview | "missing">();
const inflight = new Map<string, Promise<ConceptPreview | null>>();

async function loadPreview(slug: string): Promise<ConceptPreview | null> {
  const cached = cache.get(slug);
  if (cached === "missing") return null;
  if (cached) return cached;
  const existing = inflight.get(slug);
  if (existing) return existing;
  const p = api.concepts
    .preview(slug)
    .then((r) => {
      cache.set(slug, r);
      inflight.delete(slug);
      return r;
    })
    .catch(() => {
      cache.set(slug, "missing");
      inflight.delete(slug);
      return null;
    });
  inflight.set(slug, p);
  return p;
}

export function ConceptCard({ slug }: Props) {
  const [preview, setPreview] = useState<ConceptPreview | null | "loading" | "missing">(
    () => {
      const c = cache.get(slug);
      if (c === "missing") return "missing";
      if (c) return c;
      return "loading";
    },
  );

  useEffect(() => {
    if (preview !== "loading") return;
    let cancelled = false;
    loadPreview(slug).then((r) => {
      if (cancelled) return;
      setPreview(r ?? "missing");
    });
    return () => {
      cancelled = true;
    };
  }, [slug, preview]);

  if (preview === "loading") {
    return (
      <Card variant="elevated" className="w-72 max-w-[90vw]">
        <CardBody className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
          Loading concept…
        </CardBody>
      </Card>
    );
  }

  if (preview === "missing" || !preview) {
    return (
      <Card variant="elevated" className="w-72 max-w-[90vw]">
        <CardBody className="text-sm text-muted-foreground italic py-3">
          No wiki page for{" "}
          <span className="font-mono">[[{slug}]]</span> yet.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card variant="elevated" className="w-80 max-w-[92vw]">
      <CardBody className="space-y-2.5 py-3">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link
              to={`/wiki/${preview.slug}`}
              className="text-sm font-semibold hover:underline"
            >
              {preview.title}
            </Link>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {preview.category}
            </span>
            {preview.masteryStatus === "completed" && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                Mastered
              </span>
            )}
            {preview.masteryStatus === "in_progress" && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                In progress
              </span>
            )}
          </div>
          {preview.oneLineDef && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {preview.oneLineDef}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          {preview.nodeRef && (
            <Link
              to={`/paths/${preview.nodeRef.pathSlug}/lessons/${preview.nodeRef.nodeSlug}`}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10"
            >
              <GraduationCap className="w-3 h-3" strokeWidth={2} />
              Practice
            </Link>
          )}
          {preview.threadCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="w-3 h-3" strokeWidth={2} />
              {preview.threadCount} thread{preview.threadCount === 1 ? "" : "s"}
            </span>
          )}
          <Link
            to={`/wiki/${preview.slug}`}
            className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Read →
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
