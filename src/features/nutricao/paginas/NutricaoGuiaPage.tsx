// GUIA DE USO DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// O passo a passo que a Dra. Géssica pediu, na ordem em que a consulta
// acontece, e o que fazer quando algo não funciona. Texto curto, sem jargão,
// escrito para quem está com a pessoa na frente.
import { Link } from "react-router-dom";
import { AudioLines, ClipboardCopy, FileText, Mic, ShieldCheck, Sparkles, UserPlus, Wrench } from "lucide-react";
import { COMO_RELIGAR_ESTACAO } from "../estacao/cliente";
import { CabecalhoDaPagina, Cartao, Modulo } from "../ui/basicos";

type Passo = { icone: typeof Mic; titulo: string; texto: string; dica?: string };

const ANTES: Passo[] = [
  { icone: UserPlus, titulo: "Cadastre a pessoa uma vez", texto: "Em Pessoas → nova pessoa. Nome, telefone e o mês do acompanhamento. Os suplementos e medicamentos ficam na aba dela: é contra essa lista que a consulta confere a adesão.", dica: "Já cadastrada? Na tela Hoje ela aparece com o botão Começar." },
  { icone: ShieldCheck, titulo: "Peça o consentimento para gravar", texto: "Na consulta, ligue o interruptor “A pessoa consentiu com a gravação”. Sem ele, o botão de gravar fica desligado. O áudio fica só neste Mac e é apagado 7 dias depois de finalizar." },
];

const DURANTE: Passo[] = [
  { icone: Mic, titulo: "Grave a consulta", texto: "Clique em Gravar consulta e atenda como sempre. O app guarda o áudio neste computador a cada 5 segundos: se a página fechar, nada se perde. Dá para pausar e retomar.", dica: "Na primeira vez, o Chrome pede o microfone: clique em Permitir." },
  { icone: AudioLines, titulo: "Encerre e transcreva", texto: "Ao terminar, Encerrar e transcrever. A estação do Mac transcreve sozinha: uma consulta de 1 hora leva uns 5 minutos. Pode abrir outra tela enquanto isso." },
];

const DEPOIS: Passo[] = [
  { icone: Sparkles, titulo: "Leve as falas para as linhas", texto: "Embaixo de cada linha do roteiro aparecem os trechos da gravação que falam daquele tema (sono, intestino, café…). Clique em Usar para levar o trecho para a linha, e ajuste o texto como quiser. Os atalhos abaixo de cada linha completam o que faltou.", dica: "Quer ver tudo? “Ver a transcrição inteira” lista cada trecho com o minuto e um “Usar em…”." },
  { icone: FileText, titulo: "Confira os suplementos e a conduta", texto: "A adesão de cada item registrado é conferida contra a prescrição. O que foi combinado hoje vai em Conduta e entra no prontuário. Trouxe algo do atendimento anterior? Só entra depois de confirmado." },
  { icone: ClipboardCopy, titulo: "Copie para o iClinic e finalize", texto: "A folha à direita já está no seu formato: Copiar para o iClinic e colar. Depois, Finalizar checkpoint: o prazo do plano (3 dias úteis) começa a contar e o registro fica guardado como está.", dica: "Precisou corrigir depois? Retificar, com o motivo. O texto original fica preservado." },
];

const PLANO: Passo[] = [
  { icone: FileText, titulo: "Monte o plano", texto: "Da consulta finalizada, Montar o plano: duplique a versão anterior ou comece pelas suas listas. Alimentos da TACO com as suas medidas caseiras, substituições fora do cálculo, azeite do preparo somado sem aparecer. A tabela de calorias e macros fica ao lado enquanto você monta." },
  { icone: ClipboardCopy, titulo: "PDF e entrega", texto: "Gerar o PDF sai com a sua identificação no fim e nenhuma refeição cortada entre páginas. Marque anexado, compartilhado e recebido para a tela Hoje parar de cobrar." },
];

function Lista({ passos, inicio }: { passos: Passo[]; inicio: number }) {
  return (
    <ol className="grid gap-4">
      {passos.map((p, i) => {
        const Icone = p.icone;
        return (
          <li key={p.titulo} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-oliva/12 text-brand-musgo">
              <Icone className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <p className="font-semibold text-brand-musgo">
                <span className="mr-1.5 font-mono text-[11px] font-normal text-muted-foreground">{String(inicio + i).padStart(2, "0")}</span>
                {p.titulo}
              </p>
              <p className="text-sm text-brand-tinta">{p.texto}</p>
              {p.dica ? <p className="text-xs text-muted-foreground">{p.dica}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function NutricaoGuiaPage() {
  return (
    <Modulo>
      <CabecalhoDaPagina sobretitulo="Nutrição · Guia" titulo="Da gravação ao plano, passo a passo" detalhe="Uma consulta inteira leva cinco passos. Esta página fica aqui para quando precisar." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <Cartao titulo="Antes da consulta">
            <Lista passos={ANTES} inicio={1} />
          </Cartao>
          <Cartao titulo="Durante">
            <Lista passos={DURANTE} inicio={3} />
          </Cartao>
        </div>
        <div className="grid content-start gap-6">
          <Cartao titulo="Depois: o prontuário">
            <Lista passos={DEPOIS} inicio={5} />
          </Cartao>
          <Cartao titulo="O plano alimentar">
            <Lista passos={PLANO} inicio={8} />
          </Cartao>
          <Cartao titulo="Se algo não funcionar">
            <div className="grid gap-3 text-sm">
              <p className="inline-flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-brand-oliva" aria-hidden="true" />
                <span>
                  <strong>“Estação local desligada”</strong> ou a transcrição não começa: {COMO_RELIGAR_ESTACAO}
                </span>
              </p>
              <p className="inline-flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-brand-oliva" aria-hidden="true" />
                <span>
                  <strong>O botão de gravar não aparece:</strong> ligue o consentimento. Se ainda assim não aparecer, seu acesso a esta tela é só de leitura.
                </span>
              </p>
              <p className="inline-flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-brand-oliva" aria-hidden="true" />
                <span>
                  <strong>O microfone não grava:</strong> no Chrome, clique no ícone à esquerda do endereço e deixe o microfone em Permitir. No Mac, Ajustes do Sistema → Privacidade e Segurança → Microfone → Google Chrome ligado.
                </span>
              </p>
              <p className="inline-flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-brand-oliva" aria-hidden="true" />
                <span>
                  <strong>A transcrição errou uma palavra:</strong> corrija na linha. A gravação não é editada; o que vale é o texto que você confirma.
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Os registros ficam neste Chrome. Uma vez por semana, baixe a cópia de segurança em <Link to="/nutricao/biblioteca" className="font-semibold text-brand-oliva hover:underline">Biblioteca → Ajustes</Link>.
              </p>
            </div>
          </Cartao>
        </div>
      </div>
    </Modulo>
  );
}
