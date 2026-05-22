// Curated multi-path "learning journeys". Each journey is an ordered
// list of path slugs the curator believes belong together. Renders as
// /journeys (index) + /journeys/:slug (detail). Hardcoded — no DB
// table — so adding a journey only touches this file.
//
// Path slugs must exist in seed-content; if a slug doesn't resolve,
// the detail page gracefully omits that entry.

export interface Journey {
  slug: string;
  title: string;
  tagline: string;
  paths: string[];   // ordered path slugs
  icon: string;
  audience?: string;
}

export const JOURNEYS: Journey[] = [
  {
    slug: "ai-researcher-track",
    title: "AI Researcher Track",
    tagline: "From ML fundamentals to alignment and frontier research.",
    paths: ["ml-engineer", "mathematician", "ai-researcher", "multimodal-engineer"],
    icon: "🤖",
    audience: "research",
  },
  {
    slug: "frontier-physics",
    title: "Frontier Physics Stack",
    tagline: "Solid state to plasma to cosmology and observational astronomy.",
    paths: ["physicist", "solid-state-physicist", "plasma-physicist", "cosmologist", "astronomer"],
    icon: "🌌",
    audience: "research",
  },
  {
    slug: "life-sciences-foundations",
    title: "Life Sciences Foundations",
    tagline: "Cells to genes to structures to evolution.",
    paths: ["cell-molecular-biologist", "geneticist", "structural-biologist", "comp-biologist", "evolutionary-biologist"],
    icon: "🧬",
    audience: "research",
  },
  {
    slug: "humanities-pillars",
    title: "Humanities Pillars",
    tagline: "Philosophy, history, language, and culture.",
    paths: ["philosopher", "historian", "linguist", "anthropologist"],
    icon: "📜",
    audience: "learn",
  },
  {
    slug: "social-sciences-stack",
    title: "Social Sciences Stack",
    tagline: "How groups, minds, markets, and governments work.",
    paths: ["sociologist", "psychologist", "macroeconomist", "microeconomist", "political-scientist"],
    icon: "🏛️",
    audience: "learn",
  },
  {
    slug: "built-environment",
    title: "Built Environment",
    tagline: "From rebar to skyline to region.",
    paths: ["civil-engineer", "architect", "urban-planner", "cartographer", "geographer"],
    icon: "🏙️",
    audience: "build",
  },
  {
    slug: "medical-stack",
    title: "Medical Stack",
    tagline: "Cells → immunity → pharmacology → epidemiology → public health.",
    paths: ["cell-molecular-biologist", "immunologist", "pharmacologist", "epidemiologist", "public-health-professional"],
    icon: "🩺",
    audience: "learn",
  },
  {
    slug: "quantitative-frontier",
    title: "Quantitative Frontier",
    tagline: "Pure math, applied stats, causal inference, information theory.",
    paths: ["pure-mathematician", "applied-statistician", "causal-scientist", "information-theorist"],
    icon: "🧮",
    audience: "research",
  },
  {
    slug: "climate-sustainability",
    title: "Climate + Sustainability",
    tagline: "Atmosphere, oceans, ecology, and geography of the Anthropocene.",
    paths: ["climate-scientist", "atmospheric-scientist", "oceanographer", "ecologist", "geographer"],
    icon: "🌍",
    audience: "research",
  },
  {
    slug: "robotics-stack",
    title: "Robotics Stack",
    tagline: "Kinematics, learning, perception, humanoid frontiers.",
    paths: ["roboticist", "humanoid-robotics-engineer", "reinforcement-learner"],
    icon: "🦾",
    audience: "build",
  },
  {
    slug: "data-engineering-stack",
    title: "Data Engineering Stack",
    tagline: "Distributed systems, databases, compilers, applied stats.",
    paths: ["distributed-systems-engineer", "data-engineer", "compiler-engineer", "applied-statistician"],
    icon: "🗄️",
    audience: "build",
  },
  {
    slug: "communicators-stack",
    title: "Communicators + Storytellers",
    tagline: "Language, education, music, film.",
    paths: ["linguist", "educator", "musicologist", "cinematographer"],
    icon: "🎬",
    audience: "learn",
  },
];

export function findJourney(slug: string): Journey | undefined {
  return JOURNEYS.find((j) => j.slug === slug);
}
