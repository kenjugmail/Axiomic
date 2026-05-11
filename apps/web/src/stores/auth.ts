import { create } from "zustand";
import { api, type User } from "../lib/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  fetchUser: async () => {
    try {
      const { user } = await api.auth.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const { user } = await api.auth.login({ email, password });
      set({ user });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  signup: async (username, email, password, turnstileToken) => {
    set({ error: null });
    try {
      const { user } = await api.auth.signup({ username, email, password, turnstileToken });
      set({ user });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  logout: async () => {
    await api.auth.logout();
    set({ user: null });
  },
}));
