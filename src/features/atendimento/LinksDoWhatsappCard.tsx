// LINKS DO WHATSAPP POR CANAL (27/10/2026, frente Atendimento digital).
//
// Na tela de Marketing: um link wa.me por canal (bio do Instagram, story, perfil
// do Google, QR da recepção, indicação de médico), cada um com um código entre
// colchetes no fim da mensagem pronta ("… [IG-BIO]"). Quando o WhatsApp oficial
// estiver ligado, a primeira mensagem com código carimba a origem na ficha do
// CRM — ou abre o lead, se o número for novo (whatsapp-webhook). Os links já
// funcionam hoje com o WhatsApp Business da recepção.
//
// O número do Instituto vem da config do WhatsApp (Integrações): nada de
// telefone escrito no código.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { BlocoFolha, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/avisos";
import { Aviso, Etiqueta, Input, RUBRICA, TITULO_SECAO } from "@/features/crm/comercialVisual";
import { lerEstadoDoWhatsapp } from "@/lib/remote/atendimento";
import { cn } from "@/lib/utils";
import { CANAIS_DE_ORIGEM, codigoDeIndicacaoMedica, linkWaMe } from "../../../supabase/functions/_shared/whatsappRegras";

async function copiar(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copiado.", { tom: "ok" });
  } catch {
    toast("Não deu para copiar sozinho: selecione o link e copie.", { tom: "atencao" });
  }
}

function LinhaDoLink({ rotulo, codigo, link }: { rotulo: string; codigo: string; link: string }) {
  return (
    <li className="grid gap-2 border-b border-fio py-3 last:border-b-0 sm:grid-cols-[13rem_1fr_auto] sm:items-center">
      <span className="flex flex-wrap items-center gap-2 text-sm font-bold leading-5 text-tinta">
        {rotulo}
        <Etiqueta>[{codigo}]</Etiqueta>
      </span>
      <span className={cn("min-w-0 font-mono text-[13px] leading-5 [overflow-wrap:anywhere]", link ? "text-tinta" : "text-tinta-2")}>{link || "falta o número do Instituto"}</span>
      <Botao variante="secundario" tamanho="pq" className="w-fit max-md:h-10" disabled={!link} icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={() => void copiar(link)}>
        Copiar link
      </Botao>
    </li>
  );
}

export function LinksDoWhatsappCard() {
  const estado = useQuery({ queryKey: ["whatsapp-estado"], queryFn: lerEstadoDoWhatsapp, staleTime: 60_000, retry: false });
  const [medico, setMedico] = useState("");
  const numero = estado.data?.config.numeroPublico ?? "";
  const fixos = useMemo(() => CANAIS_DE_ORIGEM.map((canal) => ({ ...canal, link: linkWaMe(numero, canal.codigo, canal.texto) })), [numero]);
  const codigoDoMedico = codigoDeIndicacaoMedica(medico);
  const linkDoMedico = codigoDoMedico ? linkWaMe(numero, codigoDoMedico, `Olá! Fui indicado(a) por ${medico.trim()} e quero marcar uma consulta no Instituto Bratan.`) : "";

  return (
    <BlocoFolha as="section" respiro aria-labelledby="marketing-links-whatsapp">
      <h2 id="marketing-links-whatsapp" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
        <Link2 className="h-4 w-4 stroke-oliva" aria-hidden="true" /> Links do WhatsApp por canal
        <InfoTip title="Para que serve">
          Cada link abre o WhatsApp do Instituto com uma mensagem pronta e um código no fim, entre colchetes. Quando o WhatsApp oficial estiver ligado,
          quem chegar por um desses links entra no CRM com a origem marcada (e vira lead novo se ainda não tiver ficha). Se a pessoa apagar o código,
          a mensagem chega do mesmo jeito, só que sem a origem.
        </InfoTip>
      </h2>
      <p className="mt-1 text-sm font-medium leading-[22px] text-tinta-2">Um link por lugar onde o Instituto aparece. Para o QR da recepção, gere o QR a partir do link.</p>

      {estado.isError ? (
        <Aviso tom="atencao" className="mt-4">
          Não consegui ler o número do WhatsApp do Instituto agora.
        </Aviso>
      ) : !estado.isLoading && !numero ? (
        <Aviso tom="atencao" className="mt-4">
          Falta o número do WhatsApp do Instituto. Quem cuida das integrações cadastra em Ajustes → Integrações → WhatsApp oficial.
        </Aviso>
      ) : null}

      <ul className="mt-3">
        {fixos.map((canal) => (
          <LinhaDoLink key={canal.codigo} rotulo={canal.rotulo} codigo={canal.codigo} link={canal.link} />
        ))}
      </ul>

      <div className="mt-4 grid gap-2 border-t border-fio pt-4">
        <p className={RUBRICA}>Indicação de médico</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-center">
          <Input value={medico} onChange={(event) => setMedico(event.target.value)} placeholder="Nome do médico que indica (ex.: Dra. Ana Souza)" aria-label="Nome do médico que indica" />
          <span className="text-[13px] font-medium leading-5 text-tinta-2">{codigoDoMedico ? `O código fica [${codigoDoMedico}].` : "Escreva o nome para gerar o link desse médico."}</span>
        </div>
        {codigoDoMedico ? (
          <ul>
            <LinhaDoLink rotulo={`Indicação: ${medico.trim()}`} codigo={codigoDoMedico} link={linkDoMedico} />
          </ul>
        ) : null}
      </div>
    </BlocoFolha>
  );
}
