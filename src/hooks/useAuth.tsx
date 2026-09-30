import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { type AppRole, type Modulo, modulosEfetivos } from "@/lib/permissoes";

export interface EmpresaAtual {
  id: string;
  name: string;
  nome_exibicao: string | null;
  logo_url: string | null;
  cor_primaria: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  empresa: EmpresaAtual | null;
  modulos: Modulo[];
  pode: (modulo: Modulo) => boolean;
  loading: boolean;
  recarregarAcesso: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaAtual | null>(null);
  const [personalizados, setPersonalizados] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  const carregarAcesso = useCallback(async () => {
    const [{ data: papel }, { data: vinculos }] = await Promise.all([
      supabase.rpc("get_my_role"),
      // Mesma ordem de my_team_id(): a empresa mais antiga e a que vale.
      supabase
        .from("user_companies")
        .select("modulos, companies(id, name, nome_exibicao, logo_url, cor_primaria, created_at)")
        .limit(5),
    ]);
    setRole((papel as AppRole) ?? "viewer");
    const vinculo = (vinculos ?? [])
      .filter(v => v.companies)
      .sort((a, b) => (a.companies!.created_at < b.companies!.created_at ? -1 : 1))[0];
    setEmpresa((vinculo?.companies as EmpresaAtual | undefined) ?? null);
    setPersonalizados(vinculo?.modulos ?? null);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer role fetch to avoid deadlock
        setTimeout(() => carregarAcesso(), 0);
      } else {
        setRole(null);
        setEmpresa(null);
        setPersonalizados(null);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      // Sem esperar o papel, a primeira tela montava com modulos vazios e a
      // guarda de rota mostrava "sem acesso" antes da resposta chegar.
      if (existing?.user) await carregarAcesso();
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [carregarAcesso]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const modulos = role ? modulosEfetivos(role, personalizados) : [];
  const pode = (modulo: Modulo) => modulos.includes(modulo);

  return (
    <AuthContext.Provider
      value={{ user, session, role, empresa, modulos, pode, loading, recarregarAcesso: carregarAcesso, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
