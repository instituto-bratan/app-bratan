// LANÇAR RÁPIDO (02/09/2026) — capturar sem digitar.
// Cole o texto do boleto/e-mail/PIX ou solte o PDF: o app lê valor, vencimento,
// beneficiário e preenche o formulário de conta. Atalhos para os fornecedores
// de medicação (Stin, Biòs, Victa) já trazem categoria, estoque e "é compra".
import { useRef, useState } from "react";
import { FileText, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { lerDocumento, type LeituraDocumento } from "./leitorDocumento";
import { extrairTextoArquivo } from "./pdfTexto";

export type PresetFornecedor = {
  chave: string;
  rotulo: string;
  fornecedor: string;
  categoryRef: string;
  descricaoPadrao: string;
  estoqueSetor: "RECEPCAO" | "ENFERMAGEM" | null;
  ehCompra: boolean;
  metodo: "BOLETO" | "PIX";
};

/** Fornecedores que mais aparecem nas compras de medicação e insumos. */
export const PRESETS_FORNECEDOR: PresetFornecedor[] = [
  { chave: "stin", rotulo: "Stin Pharma (medicação)", fornecedor: "Stin Pharma", categoryRef: "cat-boletos-compra-medicacoes", descricaoPadrao: "STIN — medicações", estoqueSetor: "ENFERMAGEM", ehCompra: true, metodo: "BOLETO" },
  { chave: "bios", rotulo: "Biòs (pellets/implante)", fornecedor: "Biòs Farmacêutica", categoryRef: "cat-boletos-compra-implantes-bios", descricaoPadrao: "BIÒS — pellets", estoqueSetor: "ENFERMAGEM", ehCompra: true, metodo: "BOLETO" },
  { chave: "victa", rotulo: "Victalab (manipulação)", fornecedor: "Victalab F Manipulação", categoryRef: "cat-boletos-compra-medicacoes", descricaoPadrao: "VICTA — manipulados", estoqueSetor: "ENFERMAGEM", ehCompra: true, metodo: "PIX" },
  { chave: "insumos", rotulo: "Insumos (ML/Cirúrgica)", fornecedor: "Mercado Livre", categoryRef: "cat-boletos-compra-insumos-geral", descricaoPadrao: "Insumos de enfermagem", estoqueSetor: "ENFERMAGEM", ehCompra: true, metodo: "PIX" },
  { chave: "recepcao", rotulo: "Recepção (mercado/café)", fornecedor: "", categoryRef: "cat-compra-mensal-diaria-mercado", descricaoPadrao: "Compra da recepção", estoqueSetor: "RECEPCAO", ehCompra: true, metodo: "PIX" },
];

export function LancarRapidoCard({
  hoje,
  readOnly,
  onLeitura,
  onPreset,
}: {
  hoje: string;
  readOnly: boolean;
  onLeitura: (leitura: LeituraDocumento, texto: string, arquivo: File | null) => void;
  onPreset: (preset: PresetFornecedor) => void;
}) {
  const [texto, setTexto] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [ultima, setUltima] = useState<LeituraDocumento | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  function aplicar(conteudo: string, arquivo: File | null) {
    const leitura = lerDocumento(conteudo, hoje);
    setUltima(leitura);
    if (leitura.tipo === "DESCONHECIDO" && !leitura.valor && !leitura.vencimento) {
      setErro("Não achei valor nem vencimento nesse texto. Você pode preencher a conta à mão abaixo.");
      return;
    }
    setErro("");
    onLeitura(leitura, conteudo, arquivo);
  }

  async function lerArquivo(file: File) {
    setLendo(true);
    setErro("");
    try {
      const conteudo = await extrairTextoArquivo(file);
      setTexto(conteudo.slice(0, 4000));
      aplicar(conteudo, file);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setLendo(false);
    }
  }

  return (
    <section className="rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          <Wand2 className="h-5 w-5" aria-hidden="true" />
          Lançar rápido
          <InfoTip title="Como usar">
            Cole aqui o texto do boleto (a linha digitável basta), do e-mail do fornecedor, da nota ou um PIX
            copia-e-cola — ou solte o PDF. O app lê valor, vencimento e beneficiário e preenche o formulário de conta;
            você só confere e escolhe a categoria. Os atalhos de fornecedor preenchem categoria, estoque e marcam
            &quot;é compra&quot;. Nada é lançado sem você apertar &quot;Lançar conta&quot;.
          </InfoTip>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS_FORNECEDOR.map((preset) => (
            <button
              key={preset.chave}
              type="button"
              disabled={readOnly}
              onClick={() => onPreset(preset)}
              className={cn(
                "rounded-full border border-brand-oliva/30 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-brand-tinta transition hover:border-brand-dourado",
                readOnly && "cursor-not-allowed opacity-60",
              )}
            >
              {preset.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <textarea
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onPaste={(event) => {
            // Colou: lê na hora, sem precisar do botão.
            const colado = event.clipboardData.getData("text");
            if (colado.trim()) {
              event.preventDefault();
              setTexto(colado.slice(0, 4000));
              aplicar(colado, null);
            }
          }}
          disabled={readOnly}
          placeholder="Cole aqui a linha digitável, o texto do boleto/e-mail, a NF ou o PIX copia-e-cola…"
          className="min-h-[88px] w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm"
          aria-label="Texto do boleto, nota ou PIX"
        />
        <div className="flex flex-col gap-2">
          <input
            ref={inputArquivo}
            type="file"
            accept="application/pdf,.pdf,.txt,.eml,text/plain,message/rfc822"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void lerArquivo(file);
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={readOnly || lendo} onClick={() => inputArquivo.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {lendo ? "Lendo o PDF…" : "Soltar PDF / e-mail"}
          </Button>
          <Button type="button" size="sm" disabled={readOnly || !texto.trim()} onClick={() => aplicar(texto, null)}>
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Ler e preencher
          </Button>
        </div>
      </div>
      {erro ? <p className="mt-2 text-xs font-semibold text-amber-800">{erro}</p> : null}
      {ultima && !erro ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Li um{ultima.tipo === "NOTA_FISCAL" ? "a nota fiscal" : ultima.tipo === "PIX" ? " PIX" : ultima.tipo === "GUIA" ? "a guia" : " boleto"}:{" "}
            {ultima.leituras.join(" · ") || "sem campos reconhecidos"}. Confira no formulário abaixo antes de lançar.
          </span>
        </p>
      ) : null}
    </section>
  );
}
