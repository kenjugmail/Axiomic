export const NAV_PILLAR_IDS = [
  "learn",
  "research",
  "build",
  "teach",
  "lab",
  "prove",
] as const;

export type NavPillarId = (typeof NAV_PILLAR_IDS)[number];

export const AUDIENCE_IDS = [
  "learn",
  "research",
  "build",
  "teach",
  "lab",
  "prove",
] as const;

export type AudienceId = (typeof AUDIENCE_IDS)[number];
