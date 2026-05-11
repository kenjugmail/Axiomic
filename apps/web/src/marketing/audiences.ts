import { AUDIENCE_IDS as SITE_AUDIENCE_IDS } from "../lib/site-types";
import type { AudienceId, NavPillarId } from "../lib/site-types";

type AudienceLink = {
  label: string;
  to: string;
  description?: string;
};

export type AudienceDefinition = {
  id: AudienceId;
  pillar: NavPillarId;
  title: string;
  tagline: string;
  problem: string;
  workflow: string[];
  proofLine: string;
  primaryCta: { label: string; to: string };
  secondaryCtas?: Array<{ label: string; to: string }>;
  relatedLinks: AudienceLink[];
};

export const AUDIENCE_IDS: AudienceId[] = [...SITE_AUDIENCE_IDS];

export const AUDIENCES: Record<AudienceId, AudienceDefinition> = {
  learn: {
    id: "learn",
    pillar: "learn",
    title: "For Learners",
    tagline: "Learn deeply, then prove retention over time.",
    problem:
      "Most learning products optimize for completion metrics instead of conceptual transfer.",
    workflow: [
      "Start with structured knowledge in wiki + mastery paths.",
      "Practice with flashcards, weak-concept review, and Knowledge MRI.",
      "Pressure-test understanding in exams and daily challenges.",
    ],
    proofLine:
      "Every learning loop leaves a trail of mastery events you can revisit and share.",
    primaryCta: { label: "Start learning", to: "/paths" },
    secondaryCtas: [
      { label: "Competency loop tour", to: "/demo/competency-loop" },
      { label: "Open flashcards", to: "/flashcards" },
      { label: "Run Knowledge MRI", to: "/me/mri" },
    ],
    relatedLinks: [
      { label: "Wiki", to: "/wiki", description: "Tiered topic explanations." },
      { label: "Mastery paths", to: "/paths", description: "Guided progression tracks." },
      { label: "Flashcards", to: "/flashcards", description: "Spaced repetition queue." },
      { label: "Weak concepts", to: "/me/weak-concepts", description: "Target your gaps." },
      { label: "Knowledge MRI", to: "/me/mri", description: "Concept-level diagnostics." },
      { label: "Exams", to: "/exams", description: "Exam-style mastery practice." },
      { label: "Daily challenge", to: "/challenge", description: "One high-value question daily." },
    ],
  },
  research: {
    id: "research",
    pillar: "research",
    title: "For Researchers",
    tagline: "From idea capture to publication-ready artifacts.",
    problem:
      "Research workflows are fragmented across notes, papers, forums, and grant trackers.",
    workflow: [
      "Track open questions and references in the research library.",
      "Draft and revise papers with version history and feed visibility.",
      "Connect funding and collaborator discovery to active projects.",
    ],
    proofLine:
      "Your paper history, revisions, and collaboration footprint stay connected in one graph.",
    primaryCta: { label: "Open research", to: "/research" },
    secondaryCtas: [
      { label: "Browse grants", to: "/grants" },
      { label: "See research feed", to: "/research/feed" },
    ],
    relatedLinks: [
      { label: "Research library", to: "/research", description: "Browse active and published papers." },
      { label: "Research feed", to: "/research/feed", description: "Recent paper activity." },
      { label: "Grant opportunities", to: "/grants", description: "Funding discovery surface." },
      { label: "Author profile example", to: "/authors/axiomic", description: "Author-centric output view." },
      { label: "Wiki", to: "/wiki", description: "Background context and references." },
    ],
  },
  build: {
    id: "build",
    pillar: "build",
    title: "For Builders",
    tagline: "Ship artifacts, not just notes.",
    problem:
      "Builders need a progression from practice projects to portfolio-grade proofs of work.",
    workflow: [
      "Select a capstone that matches your target domain and depth.",
      "Use tracks and cohorts to stay accountable through milestones.",
      "Publish artifacts that connect directly to your learning evidence.",
    ],
    proofLine:
      "Capstones and track completions create an auditable signal of execution quality.",
    primaryCta: { label: "Browse capstones", to: "/capstones" },
    secondaryCtas: [
      { label: "Competency loop tour", to: "/demo/competency-loop" },
      { label: "Explore tracks", to: "/tracks" },
      { label: "Join cohorts", to: "/cohorts" },
    ],
    relatedLinks: [
      { label: "Capstones", to: "/capstones", description: "Thesis-scale project library." },
      { label: "Tracks", to: "/tracks", description: "Curated capstone bundles." },
      { label: "Cohorts", to: "/cohorts", description: "Small group execution loops." },
      { label: "Daily challenge", to: "/challenge", description: "Keep your cadence warm." },
      { label: "Shop", to: "/shop", description: "Optional cosmetics and upgrades." },
    ],
  },
  teach: {
    id: "teach",
    pillar: "teach",
    title: "For Teachers",
    tagline: "Run classes with evidence-rich student progress.",
    problem:
      "Instructors need one place for class operations, mentor support, and learner diagnostics.",
    workflow: [
      "Set up class spaces with tasks and discoverability controls.",
      "Track student progress through mentors, competitions, and analytics.",
      "Bridge assignments to capstones and research outcomes.",
    ],
    proofLine:
      "Class activity links directly to learner artifacts, reducing grading guesswork.",
    primaryCta: { label: "Open classes", to: "/classes" },
    secondaryCtas: [
      { label: "Discover classes", to: "/classes/discover" },
      { label: "Mentor dashboard", to: "/me/mentors" },
    ],
    relatedLinks: [
      { label: "Classes", to: "/classes", description: "Instructor and cohort class spaces." },
      { label: "Classes discover", to: "/classes/discover", description: "Public class directory." },
      { label: "Mentors", to: "/me/mentors", description: "Mentorship relationships dashboard." },
      { label: "Cohorts", to: "/cohorts", description: "Cross-class learning groups." },
      { label: "Capstones", to: "/capstones", description: "Project outcomes for evaluation." },
    ],
  },
  lab: {
    id: "lab",
    pillar: "lab",
    title: "For Lab Teams",
    tagline: "Standardize operations and safety without slowing execution.",
    problem:
      "Lab operations often split protocols, equipment docs, and certification state across tools.",
    workflow: [
      "Author and reuse protocol templates with step-level guidance.",
      "Manage equipment references and safety certifications in one surface.",
      "Track run history and lab-level accountability from the team dashboard.",
    ],
    proofLine:
      "Operational rigor becomes visible through protocol runs, certs, and sign-off history.",
    primaryCta: { label: "Open protocol library", to: "/lab/protocols" },
    secondaryCtas: [
      { label: "Safety certifications", to: "/lab/safety-certs" },
      { label: "My lab dashboard", to: "/me/lab" },
    ],
    relatedLinks: [
      { label: "Protocols", to: "/lab/protocols", description: "Protocol templates and runbooks." },
      { label: "Equipment", to: "/lab/equipment", description: "Equipment usage references." },
      { label: "Safety certs", to: "/lab/safety-certs", description: "Training and certification catalog." },
      { label: "My lab", to: "/me/lab", description: "Personal lab operations dashboard." },
      { label: "Verify", to: "/verify", description: "Public transcript verifier." },
    ],
  },
  prove: {
    id: "prove",
    pillar: "prove",
    title: "For Credential Seekers",
    tagline: "Turn work into portable proof.",
    problem:
      "Traditional transcripts hide process quality and make independent verification difficult.",
    workflow: [
      "Build durable artifacts through tracks, capstones, and published outputs.",
      "Link learning evidence, peer review, and revisions to each artifact.",
      "Share verifiable proofs that others can inspect quickly.",
    ],
    proofLine:
      "Verification-first records make it easier for teams to trust what you can do.",
    primaryCta: { label: "Verify a transcript", to: "/verify" },
    secondaryCtas: [
      { label: "Competency loop tour", to: "/demo/competency-loop" },
      { label: "Browse tracks", to: "/tracks" },
      { label: "Browse capstones", to: "/capstones" },
    ],
    relatedLinks: [
      { label: "Verify", to: "/verify", description: "Check public learning transcripts." },
      { label: "Tracks", to: "/tracks", description: "Credential-ready project bundles." },
      { label: "Capstones", to: "/capstones", description: "Artifact-grade project work." },
      { label: "Research", to: "/research", description: "Publication evidence stream." },
      { label: "Research feed", to: "/research/feed", description: "Recent output and updates." },
    ],
  },
};

export function getAudience(id: string): AudienceDefinition | null {
  if (!AUDIENCE_IDS.includes(id as AudienceId)) return null;
  return AUDIENCES[id as AudienceId];
}
