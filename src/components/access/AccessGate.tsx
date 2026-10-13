import { LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { BlocoSaber, botaoClasses } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { canSeeModule, cargoLabels, type ModuleKey } from "@/lib/access";
import type { Cargo } from "@/types/database";

type AccessGateProps = {
  allowed: (cargo: Cargo | null | undefined) => boolean;
  children: React.ReactNode;
  label: string;
  /** Tela do controle de Acessos por pessoa: quando presente, a exceção
   *  gravada pela coordenação vence a regra de cargo (OCULTO bloqueia). */
  module?: ModuleKey;
};

export function AccessGate({ allowed, children, label, module }: AccessGateProps) {
  const { pessoa } = useAuth();

  const permitted = module ? canSeeModule(pessoa, module) : allowed(pessoa?.cargo);
  if (permitted) {
    return <>{children}</>;
  }

  // 13/10/2026 (revisão da etapa 4): na base Papel & Musgo — bloco de leitura
  // sem borda, sem vidro; mesmo texto e o mesmo "Voltar ao início".
  return (
    <div className="mx-auto grid min-h-[52vh] w-full max-w-3xl place-items-center">
      <BlocoSaber className="p-8 text-center max-md:p-6">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-controle bg-folha text-musgo">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mb-3 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Acesso restrito</p>
        <h1 className="font-serifa text-3xl font-normal leading-tight text-tinta">{label}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-6 text-tinta-2">
          Seu cargo atual é {pessoa?.cargo ? cargoLabels[pessoa.cargo] : "não definido"}. A interface esconde este módulo para reduzir ruído, e a segurança definitiva fica nas políticas RLS do Supabase.
        </p>
        <Link to="/" className={`mt-6 ${botaoClasses({ variante: "secundario" })}`}>
          Voltar ao início
        </Link>
      </BlocoSaber>
    </div>
  );
}
