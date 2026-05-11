import type { PrimaryPersona } from "@axiomic/types";

const VALUES: readonly PrimaryPersona[] = [
  "learn",
  "research",
  "build",
  "teach",
  "lab",
  "prove",
];

export function isPrimaryPersona(v: string | null): v is PrimaryPersona {
  return v !== null && VALUES.includes(v as PrimaryPersona);
}

/** Default “home” link for each persona in coach suggestions. */
export const PERSONA_CTA_URLS: Record<PrimaryPersona, string> = {
  learn: "/hub/learn",
  research: "/research",
  build: "/hub/build",
  teach: "/classes",
  lab: "/hub/lab",
  prove: "/hub/prove",
};

export const PERSONA_COACH_LABELS: Record<PrimaryPersona, string> = {
  learn: "Learning hub (paths, wiki, diagnostics)",
  research: "Research library and feed",
  build: "Capstones and credential tracks",
  teach: "Classes and cohort teaching tools",
  lab: "Protocols, equipment, and safety certifications",
  prove: "Verification and public proof surfaces",
};
