// NÍVEL DA TELA (29/09/2026, auditoria B9).
//
// Por quê: o "Só vê" (VER) de Administração → Acessos só valia no Financeiro, no
// Estoque e na Concierge. No CRM, no Marketing, nos Comprovantes, no Plano de
// Acompanhamento e na Inteligência 360 a pessoa marcada "Só vê" continuava
// gravando. Este gancho é a porta única: diz o nível da pessoa na tela e dá a
// frase e o aviso padrão para quem só vê. As telas desabilitam os botões de
// gravar com `podeEditar`; o useCrmState({ modulo }) recusa a gravação mesmo
// que algum botão tenha escapado.
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
    <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900" role="status">
      {FRASE_SO_VE}
    </p>
  );
}
