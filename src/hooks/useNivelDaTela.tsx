// NÍVEL DA TELA (29/09/2026, auditoria B9).
//
// Por quê: o "Só vê" (VER) de Administração → Acessos só valia no Financeiro, no
// Estoque e na Concierge. No CRM, no Marketing, nos Comprovantes, no Plano de
// Acompanhamento e na Inteligência 360 a pessoa marcada "Só vê" continuava
// gravando. Este gancho é a porta única: diz o nível da pessoa na tela e dá a
// frase e o aviso padrão para quem só vê. As telas desabilitam os botões de
// gravar com `podeEditar`; o useCrmState({ modulo }) recusa a gravação mesmo
// que algum botão tenha escapado.
import { Eye } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, moduleLevel, type AccessLevel, type ModuleKey } from "@/lib/access";

export const FRASE_SO_VE = "Você só vê esta tela — para mudar algo, peça acesso de edição em Administração → Acessos.";

let ultimoAviso = 0;
/** Aviso na tela quando alguém que só vê tenta gravar (no máximo um a cada 4 s). */
export function avisarSoVe() {
  const agora = Date.now();
  if (agora - ultimoAviso < 4000) return;
  ultimoAviso = agora;
  toast(FRASE_SO_VE, { tom: "atencao", duracaoMs: 6000 });
}

export function useNivelDaTela(modulo: ModuleKey): { nivel: AccessLevel; podeEditar: boolean; soVe: boolean; motivo: string } {
  const { pessoa } = useAuth();
  const nivel = moduleLevel(pessoa, modulo);
  const podeEditar = canEditModule(pessoa, modulo);
  return { nivel, podeEditar, soVe: nivel === "VER", motivo: podeEditar ? "" : FRASE_SO_VE };
}

/** Faixa fina no topo da tela para quem só vê. */
export function AvisoSoVe({ soVe }: { soVe: boolean }) {
  if (!soVe) return null;
  return (
    // 13/10/2026: faixa de recado da base Papel & Musgo (atenção, sem borda), no lugar do âmbar antigo.
    <p className="flex items-start gap-3 rounded-bloco bg-atencao-claro px-4 py-3 text-sm font-semibold leading-5 text-tinta" role="status">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />
      <span className="min-w-0">{FRASE_SO_VE}</span>
    </p>
  );
}
