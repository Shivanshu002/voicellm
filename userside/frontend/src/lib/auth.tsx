import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken, UNAUTHORIZED_EVENT, type Company, type Session, type User } from "./api";

type AuthState = {
  user: User | null;
  company: Company | null;
  loading: boolean;
  signIn: (s: Session) => void;
  signOut: () => void;
  setCompany: (c: Company) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const signIn = useCallback((s: Session) => {
    setToken(s.token);
    setUser(s.user);
    setCompany(s.company);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setCompany(null);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(signIn)
      .catch(signOut)
      .finally(() => setLoading(false));
  }, [signIn, signOut]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ user, company, loading, signIn, signOut, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
