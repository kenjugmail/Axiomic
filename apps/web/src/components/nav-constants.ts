// Phase 10A — top-nav extras.
//
// Forum + News live here (not in marketing/hubs.ts) because they
// aren't part of the typed NavPillarId pillar set (each pillar in
// hubs.ts also drives a HUB definition + audience metadata). These
// are plain top-level destinations.
//
// Layout.tsx imports + renders these alongside NAV_PILLARS in both
// the desktop nav strip and the mobile drawer.

export type NavItem = { to: string; label: string; match?: string };

export const EXTRA_NAV_PILLARS: NavItem[] = [
  { to: "/forum", label: "Forum" },
  { to: "/news", label: "News" },
  // Phase 39 — "Goodness" missions: verified collaborative
  // problem-solving on real-world problems.
  { to: "/missions", label: "Goodness" },
];

// Routes that should highlight the "Pet" dropdown trigger as the
// active section.
export const PET_ROUTES = [
  "/me/pet",
  "/me/inventory",
  "/shop",
  "/skins",
  "/explore/pets",
];

// Active-route matcher used by the desktop nav.
export function isRouteActive(currentPath: string, to: string): boolean {
  if (to === "/") return currentPath === "/";
  return currentPath === to || currentPath.startsWith(to + "/");
}
