import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import { api, hasSession, SESSION_EXPIRED, type Language, type Role, type User } from "./api";

interface Auth {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (body: { email: string; full_name: string; password: string; role: Role }) => Promise<User>;
  signOut: () => Promise<void>;
  update: (user: User) => void;
  setLanguage: (language: Language) => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  const [user, setUser] = useState<User | null>(null);
  // Without a session cookie there is nothing to restore: ready immediately, no request.
  const [ready, setReady] = useState(() => !hasSession());

  const adopt = useCallback(
    (next: User) => {
      setUser(next);
      i18n.setLanguage(next.language);
      return next;
    },
    [i18n],
  );

  useEffect(() => {
    if (hasSession()) api.me().then(adopt, () => setUser(null)).finally(() => setReady(true));
    const expire = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, expire);
    return () => window.removeEventListener(SESSION_EXPIRED, expire);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on start
  }, []);

  const value = useMemo<Auth>(
    () => ({
      user,
      ready,
      signIn: async (email, password) => adopt(await api.login(email, password)),
      signUp: async (body) => adopt(await api.register({ ...body, language: i18n.language })),
      signOut: async () => {
        await api.logout().catch(() => undefined);
        setUser(null);
      },
      update: setUser,
      setLanguage: (language) => {
        i18n.setLanguage(language);
        if (user) api.updateProfile({ language }).then(setUser, () => undefined);
      },
    }),
    [user, ready, adopt, i18n],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export const canSign = (role: Role | undefined): boolean => role === "radiologist" || role === "admin";
