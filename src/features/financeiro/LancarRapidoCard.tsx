// LANÇAR RÁPIDO (02/09/2026) — capturar sem digitar.
// Cole o texto do boleto/e-mail/PIX ou solte o PDF: o app lê valor, vencimento,
// beneficiário e preenche o formulário de conta. Atalhos para os fornecedores
// de medicação (Stin, Biòs, Victa) já trazem categoria, estoque e "é compra".
// Papel & Musgo (08/10/2026): virou bloco de folha (é para agir), com os
// atalhos como filtros de contorno e os campos novos (borda de campo, foco visível).
import { useRef, useState } from "react";
import { Camera, FileText, Sparkles, Upload, Wand2 } from "lucide-react";
import { BlocoFolha, Botao } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import type { EstoqueSetor } from "@/features/estoque/estoqueData";
import { lerDocumento, linhaDigitavelDoCodigoDeBarras, type LeituraDocumento } from "./leitorDocumento";
import { extrairTextoArquivo } from "./pdfTexto";
import { AJUDA, CABECA_DA_FOLHA, CAMPO_TEXTO, TituloDoBloco } from "./pecasDiaPagar";

export type PresetFornecedor = {
  chave: string;
  rotulo: string;
  fornecedor: string;
  categoryRef: string;
  descricaoPadrao: string;
  estoqueSetor: EstoqueSetor | null;
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
  const inputCamera = useRef<HTMLInputElement>(null);
  const temCamera = typeof window !== "undefined" && "BarcodeDetector" in window;

  // CÂMERA (14/09/2026, proposta 4.3): fotografa o boleto; o leitor nativo do
  // celular (BarcodeDetector, formato ITF) devolve os 44 dígitos, que viram a
  // linha digitável. Se não conseguir ler, a foto segue como arquivo da conta.
  async function lerFoto(file: File) {
    setLendo(true);
    setErro("");
    try {
      type Detector = { detect: (img: ImageBitmap) => Promise<{ rawValue: string; format: string }[]> };
      const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!Ctor) throw new Error("Este navegador não lê código de barras pela câmera. Use a foto como arquivo ou digite a linha digitável.");
      const bitmap = await createImageBitmap(file);
      const codigos = await new Ctor({ formats: ["itf", "code_128"] }).detect(bitmap);
      const bruto = codigos.map((c) => c.rawValue.replace(/\D/g, "")).find((v) => v.length === 44);
      const linha = bruto ? linhaDigitavelDoCodigoDeBarras(bruto) : null;
      if (!linha) {
        setTexto("");
        onLeitura({ tipo: "DESCONHECIDO", leituras: [] } as unknown as LeituraDocumento, "", file);
        setErro("Não achei o código de barras na foto. A foto ficou como arquivo da conta — digite o valor e o vencimento, ou cole a linha digitável.");
        return;
      }
      setTexto(linha);
      aplicar(linha, file);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setLendo(false);
      if (inputCamera.current) inputCamera.current.value = "";
    }
  }

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
    <BlocoFolha as="section" aria-labelledby="lancar-rapido-titulo" className="min-w-0">
      <div className={CABECA_DA_FOLHA}>
        <TituloDoBloco id="lancar-rapido-titulo" icone={<Wand2 className="h-4 w-4" aria-hidden="true" />}>
          Lançar rápido
        </TituloDoBloco>
        <InfoTip title="Como usar">
          Cole aqui o texto do boleto (a linha digitável basta), do e-mail do fornecedor, da nota ou um PIX
          copia-e-cola — ou solte o PDF. O app lê valor, vencimento e beneficiário e preenche o formulário de conta;
          você só confere e escolhe a categoria. Os atalhos de fornecedor preenchem categoria, estoque e marcam
          &quot;é compra&quot;. Nada é lançado sem você apertar &quot;Lançar conta&quot;.
        </InfoTip>
      </div>
      <div className="grid gap-4 p-6 max-md:p-4">
        <div className="grid gap-2">
          <p className={AJUDA}>Atalhos de fornecedor: já trazem categoria, estoque e “é compra”.</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS_FORNECEDOR.map((preset) => (
              <Botao key={preset.chave} variante="secundario" tamanho="pq" disabled={readOnly} onClick={() => onPreset(preset)}>
                {preset.rotulo}
              </Botao>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
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
            className={CAMPO_TEXTO}
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
            <Botao
              variante="secundario"
              disabled={readOnly || lendo}
              carregando={lendo}
              icone={<Upload className="h-4 w-4" aria-hidden="true" />}
              onClick={() => inputArquivo.current?.click()}
            >
              {lendo ? "Lendo…" : "Soltar PDF / e-mail"}
            </Botao>
            <input
              ref={inputCamera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void lerFoto(file);
              }}
            />
            <Botao
              variante="secundario"
              disabled={readOnly || lendo}
              icone={<Camera className="h-4 w-4" aria-hidden="true" />}
              onClick={() => inputCamera.current?.click()}
              title={temCamera ? "Fotografe o código de barras do boleto; o app lê a linha digitável" : "Este navegador não lê código de barras; a foto fica como arquivo da conta"}
            >
              Fotografar boleto
            </Botao>
            <Botao variante="suave" disabled={readOnly || !texto.trim()} icone={<Sparkles className="h-4 w-4" aria-hidden="true" />} onClick={() => aplicar(texto, null)}>
              Ler e preencher
            </Botao>
          </div>
        </div>
        {erro ? <p className="text-[13px] font-bold leading-5 text-atencao">{erro}</p> : null}
        {ultima && !erro ? (
          <p className={cn(AJUDA, "flex items-start gap-2")}>
            <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Li um{ultima.tipo === "NOTA_FISCAL" ? "a nota fiscal" : ultima.tipo === "PIX" ? " PIX" : ultima.tipo === "GUIA" ? "a guia" : " boleto"}:{" "}
              {ultima.leituras.join(" · ") || "sem campos reconhecidos"}. Confira no formulário abaixo antes de lançar.
            </span>
          </p>
        ) : (
          <p className={AJUDA}>Colou ou soltou: o formulário de conta abre já preenchido. Para digitar à mão, use “Nova conta” no alto da tela.</p>
        )}
      </div>
    </BlocoFolha>
  );
}
