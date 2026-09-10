// TRAVA DA MESA (10/09/2026, áudio da CEO): "tem que ter uma questão de proteção
// pra não poder editar. Mas alguém deveria ter essa senha de proteção pra poder
// editar. Nem a gente vai no mercado e pode editar compras — mas tem um gestor
// que coloca uma senha e ele consegue editar."
//
// O computador da recepção fica logado o dia inteiro, então só o cargo não
// segura: correção de fechamento pede a senha do gestor na hora. A senha é
// conferida NO BANCO (função SECURITY DEFINER) — o hash nunca chega ao
// navegador. Se ainda não existe senha, a gestão cria aqui mesmo.
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { canFinanceiroFull } from "@/lib/access";
import { conferirSenhaGestor, definirSenhaGestor, senhaGestorDefinida } from "@/lib/remoteData";

export function SenhaDeGestor({
  acao,
  onConfirmado,
  onCancelar,
}: {
  /** O que vai acontecer se a senha estiver certa (aparece no texto). */
  acao: string;
  onConfirmado: () => void;
  onCancelar: () => void;
}) {
  const { pessoa, isPreview } = useAuth();
  const podeDefinir = canFinanceiroFull(pessoa?.cargo ?? null);
  const [existe, setExiste] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (isPreview) {
      setExiste(true);
      return;
    }
    senhaGestorDefinida()
      .then(setExiste)
      .catch(() => setErro("Não consegui falar com o servidor para conferir a senha. Tente de novo."));
  }, [isPreview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    // Modo demonstração não fala com o banco: a trava vale para o app de verdade.
    if (isPreview) {
      onConfirmado();
      return;
    }
    setOcupado(true);
    try {
      if (existe === false) {
        if (senha !== repetir) {
          setErro("As duas senhas não são iguais.");
          return;
        }
        await definirSenhaGestor(senha);
        setExiste(true);
        setSenha("");
        setRepetir("");
        setErro("");
        return;
      }
      const certa = await conferirSenhaGestor(senha);
      if (!certa) {
        setErro("Senha incorreta. Chame o gestor.");
        setSenha("");
        return;
      }
      onConfirmado();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não consegui conferir a senha.");
    } finally {
      setOcupado(false);
    }
  }

  const criando = existe === false;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-brand-tinta/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-brand-oliva/20 bg-brand-papel p-5 shadow-calm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {criando ? <ShieldCheck className="h-5 w-5 text-brand-musgo" aria-hidden="true" /> : <KeyRound className="h-5 w-5 text-brand-musgo" aria-hidden="true" />}
            <h2 className="text-lg font-bold text-brand-musgo">{criando ? "Criar a senha do gestor" : "Senha do gestor"}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={onCancelar}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {criando
            ? "Ainda não existe senha de gestor. Crie agora — ela protege as correções em qualquer computador, mesmo logado."
            : `Esta ação muda um registro já fechado: ${acao}. Digite a senha do gestor para continuar.`}
        </p>

        {criando && !podeDefinir ? (
          <p className="mt-3 rounded-lg border border-brand-dourado/40 bg-brand-creme/50 px-3 py-2 text-sm text-brand-musgo">
            Só a gestão (Lucas, Dr. Daniel ou a CEO) pode criar a senha. Chame um deles.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <Label htmlFor="senha-gestor">{criando ? "Nova senha (mínimo 4 caracteres)" : "Senha"}</Label>
              <Input
                id="senha-gestor"
                type="password"
                autoFocus
                autoComplete="off"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="••••••"
              />
            </div>
            {criando ? (
              <div>
                <Label htmlFor="senha-gestor-2">Repita a senha</Label>
                <Input
                  id="senha-gestor-2"
                  type="password"
                  autoComplete="off"
                  value={repetir}
                  onChange={(event) => setRepetir(event.target.value)}
                  placeholder="••••••"
                />
              </div>
            ) : null}
          </div>
        )}

        {erro ? <p className="mt-3 text-sm font-semibold text-red-700">{erro}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={ocupado || senha.length < 4 || existe === null || (criando && !podeDefinir)}>
            {criando ? "Criar senha" : "Confirmar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
