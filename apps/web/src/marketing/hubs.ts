import type { NavPillarId } from "../lib/site-types";

export type HubLink = {
  label: string;
  to: string;
  description: string;
};

export type HubDefinition = {
  id: NavPillarId;
  label: string;
  kicker: string;
  description: string;
  links: HubLink[];
};

export const NAV_PILLARS: Array<{
  id: NavPillarId;
  label: string;
  to: string;
  // Optional active-state path. The pillar *links* to `to` but is
  // highlighted whenever the route is within `match` (Phase 42 —
  // Research links to the fused frontier feed yet stays active
  // across the whole /research* section). Defaults to `to`.
  match?: string;
}> = [
  { id: "learn", label: "Learn", to: "/hub/learn" },
  { id: "research", label: "Research", to: "/research/feed", match: "/research" },
  { id: "build", label: "Build", to: "/hub/build" },
  { id: "teach", label: "Teach", to: "/hub/teach" },
  { id: "lab", label: "Lab", to: "/hub/lab" },
  { id: "prove", label: "Prove", to: "/hub/prove" },
];

export const HUBS: Record<NavPillarId, HubDefinition> = {
  learn: {
    id: "learn",
    label: "Learn",
    kicker: "Hub",
    description: "Core study surfaces for building and retaining deep understanding.",
    links: [
      { label: "Wiki", to: "/wiki", description: "Tiered explanations by topic." },
      { label: "Paths", to: "/paths", description: "Guided mastery progression." },
      { label: "Flashcards", to: "/flashcards", description: "Spaced repetition queue." },
      { label: "Weak concepts", to: "/me/weak-concepts", description: "Target concept-level gaps." },
      { label: "Knowledge MRI", to: "/me/mri", description: "Diagnostic map across paths." },
      { label: "Exams", to: "/exams", description: "Exam-style performance checks." },
      { label: "Daily challenge", to: "/challenge", description: "One focused question each day." },
      {
        label: "Competency loop tour",
        to: "/demo/competency-loop",
        description: "Curated checklist across learn, assessment, and proof.",
      },
    ],
  },
  research: {
    id: "research",
    label: "Research",
    kicker: "Hub",
    description: "Your research frontier — grants, recommendations, and papers ranked for you — plus the full paper library.",
    links: [
      { label: "Research feed", to: "/research/feed", description: "Grants, recommendations & papers ranked for you." },
      { label: "Research library", to: "/research", description: "Browse and author papers." },
      { label: "Grants", to: "/grants", description: "Funding opportunities." },
    ],
  },
  build: {
    id: "build",
    label: "Build",
    kicker: "Hub",
    description: "Project execution surfaces that turn ideas into artifacts.",
    links: [
      { label: "Capstones", to: "/capstones", description: "Thesis-scale project tracks." },
      { label: "Tracks", to: "/tracks", description: "Curated credential bundles." },
      { label: "Cohorts", to: "/cohorts", description: "Small group accountability." },
      {
        label: "Competency loop tour",
        to: "/demo/competency-loop",
        description: "See how build steps connect back to learning and verify.",
      },
    ],
  },
  teach: {
    id: "teach",
    label: "Teach",
    kicker: "Hub",
    description: "Teaching and mentorship tools for instruction and outcomes.",
    links: [
      { label: "Classes", to: "/classes", description: "Run and manage classes." },
      { label: "Discover classes", to: "/classes/discover", description: "Find active classes." },
      { label: "Mentors", to: "/me/mentors", description: "Mentorship relationships." },
    ],
  },
  lab: {
    id: "lab",
    label: "Lab",
    kicker: "Hub",
    description: "Operational lab tools for protocols, equipment, and safety.",
    links: [
      { label: "Protocols", to: "/lab/protocols", description: "Author and run protocols." },
      { label: "Equipment", to: "/lab/equipment", description: "Equipment references." },
      { label: "Safety certs", to: "/lab/safety-certs", description: "Safety certifications." },
      { label: "My lab", to: "/me/lab", description: "Your operational dashboard." },
    ],
  },
  prove: {
    id: "prove",
    label: "Prove",
    kicker: "Hub",
    description: "Verification-first pages for trust, credentials, and outcomes.",
    links: [
      { label: "Verify", to: "/verify", description: "Validate transcript claims." },
      { label: "Tracks", to: "/tracks", description: "Credential bundles with artifacts." },
      { label: "Capstones", to: "/capstones", description: "Portfolio-grade evidence." },
      {
        label: "Competency loop tour",
        to: "/demo/competency-loop",
        description: "Walk the learn → verify path with live routes.",
      },
    ],
  },
};

export function getHub(pillarId: string): HubDefinition | null {
  if (!(pillarId in HUBS)) return null;
  return HUBS[pillarId as NavPillarId];
}
