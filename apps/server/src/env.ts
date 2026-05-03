export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  createdAt: string;
}

export type Env = {
  Variables: {
    user: SessionUser;
  };
};
