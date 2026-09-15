// ERRO DE TELA SEM DERRUBAR O APP (14/09/2026, proposta 7.2). Antes, uma exceção
// no render de qualquer tela deixava o app em branco. Agora a tela quebrada
// mostra o que aconteceu, com botão de tentar de novo e de voltar ao Início —
// e o resto do app (menu, outras telas) continua de pé. O detalhe técnico fica
// visível para um print já chegar com o diagnóstico (aprendizado do CRM).
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = { children: ReactNode; rotulo?: string };
type State = { erro: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Tela quebrou:", erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    const erro = this.state.erro;
    return (
      <div className="mx-auto my-8 max-w-2xl rounded-lg border border-red-200 bg-red-50/70 p-5 text-brand-tinta" role="alert">
        <p className="flex items-center gap-2 text-lg font-bold text-red-800">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          Algo deu errado {this.props.rotulo ? `em ${this.props.rotulo}` : "nesta tela"}.
        </p>
        <p className="mt-1 text-sm">
          O resto do app continua funcionando. Tente de novo; se repetir, mande um print desta caixa para o Lucas — o detalhe técnico abaixo já diz onde
          foi.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-red-200 bg-white/80 p-3 font-mono text-[11px] leading-4 text-red-700">
          {erro.name}: {erro.message}
          {erro.stack ? `\n${erro.stack.split("\n").slice(1, 6).join("\n")}` : ""}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => this.setState({ erro: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-musgo px-3 text-sm font-semibold text-brand-papel"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tentar de novo
          </button>
          <a href="/" className="inline-flex h-9 items-center rounded-md border border-brand-oliva/40 bg-white px-3 text-sm font-semibold text-brand-musgo">
            Voltar ao Início
          </a>
        </div>
      </div>
    );
  }
}
