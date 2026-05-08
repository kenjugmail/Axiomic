export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  // Sprint 52 — 'admin' unlocks /admin/* routes; 'member' is everyone else.
  role: string;
  createdAt: string;
}

export type Env = {
  Variables: {
    user: SessionUser;
  };
};
