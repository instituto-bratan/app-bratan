import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { cargoLabels, isCargo } from "@/lib/access";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Cargo, Pessoa } from "@/types/database";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  pessoa: Pessoa | null;
  isPreview: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  enterPreview: (cargo: Cargo) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const previewStorageKey = "app-bratan-preview-cargo";
const previewWindowNamePrefix = "app-bratan-preview-cargo:";

const previewNames: Partial<Record<Cargo, string>> = {
  dr_daniel: "Dr. Daniel Bratan",
  gestor_financeiro: "Lucas",
  recepcionista: "Recepção Bratan",
  enfermeira: "Enfermagem Bratan",
  nutricionista: "Nutrição Bratan",
  limpeza: "Equipe Limpeza",
};

const previewPessoa = (cargo: Cargo): Pessoa => ({
  id: `preview-${cargo}`,
  auth_id: null,
  nome: previewNames[cargo] ?? cargoLabels[cargo],
  email: `${cargo.replace(/_/g, ".")}@institutobratan.com.br`,
  cargo,
  ativo: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

function readPreviewCargo(): Cargo | null {
  try {
    const storedCargo = window.sessionStorage?.getItem(previewStorageKey) ?? null;
    if (isCargo(storedCargo)) {
      return storedCargo;
    }
  } catch {
    // Storage can be unavailable in restricted preview browsers.
  }

  if (window.name.startsWith(previewWindowNamePrefix)) {
    const namedCargo = window.name.replace(previewWindowNamePrefix, "");
    if (isCargo(namedCargo)) {
      return namedCargo;
    }
  }

  return null;
}

function writePreviewCargo(cargo: Cargo) {
  try {
    window.sessionStorage?.setItem(previewStorageKey, cargo);
  } catch {
    // Storage can be unavailable in restricted preview browsers.
  }

  window.name = `${previewWindowNamePrefix}${cargo}`;
}

function clearPreviewCargo() {
  try {
    window.sessionStorage?.removeItem(previewStorageKey);
  } catch {
    // Storage can be unavailable in restricted preview browsers.
  }

  if (window.name.startsWith(previewWindowNamePrefix)) {
    window.name = "";
  }
}

async function loadPessoa(authId: string): Promise<Pessoa | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("colaborador_app")
    .select("*")
    .eq("auth_id", authId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (!supabase) {
      const storedCargo = readPreviewCargo();
      if (storedCargo) {
        setIsPreview(true);
        setPessoa(previewPessoa(storedCargo));
      }

      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;

      setSession(data.session);
      if (data.session?.user.id) {
        try {
          setPessoa(await loadPessoa(data.session.user.id));
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession?.user.id) {
        setPessoa(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      loadPessoa(nextSession.user.id)
        .then(setPessoa)
        .finally(() => setLoading(false));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error("Supabase ainda não está configurado.");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }
  }, []);

  const enterPreview = useCallback((cargo: Cargo) => {
    writePreviewCargo(cargo);
    setIsPreview(true);
    setPessoa(previewPessoa(cargo));
  }, []);

  const signOut = useCallback(async () => {
    if (supabase && session) {
      await supabase.auth.signOut();
    }

    setSession(null);
    setPessoa(null);
    setIsPreview(false);
    clearPreviewCargo();
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      pessoa,
      isPreview,
      signInWithPassword,
      enterPreview,
      signOut,
    }),
    [enterPreview, isPreview, loading, pessoa, session, signInWithPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth precisa ser usado dentro de AuthProvider.");
  }

  return value;
}
