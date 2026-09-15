// INTEGRAÇÕES EXTERNAS — cache puro (15/09/2026, lote C).
// A tabela `integracao` diz o que está ligado; este módulo guarda a última leitura
// para os motores e as telas perguntarem de forma síncrona ("o WhatsApp oficial
// está ligado?"). Quem carrega é o hook useIntegracoes (montado no AppLayout).
export type ChaveIntegracao = "whatsapp" | "focus_nfse" | "supersign" | "feegow" | "outlook" | "push" | "itau" | "rede";

export type IntegracaoRecord = {
  chave: ChaveIntegracao;
  nome: string;
  descricao: string;
  ligada: boolean;
  config: Record<string, unknown>;
  atualizadoEm: string;
  atualizadoPor: string | null;
};

let cache: Map<string, IntegracaoRecord> = new Map();
let carregado = false;
const ouvintes = new Set<() => void>();

export function definirCacheIntegracoes(linhas: IntegracaoRecord[]) {
  cache = new Map(linhas.map((linha) => [linha.chave, linha]));
  carregado = true;
  ouvintes.forEach((fn) => fn());
}

export function cacheIntegracoesCarregado() {
  return carregado;
}

export function integracaoLigada(chave: ChaveIntegracao) {
  return Boolean(cache.get(chave)?.ligada);
}

export function configIntegracao<T = Record<string, unknown>>(chave: ChaveIntegracao): T {
  return (cache.get(chave)?.config ?? {}) as T;
}

export function integracaoAtual(chave: ChaveIntegracao) {
  return cache.get(chave) ?? null;
}

export function assinarIntegracoes(fn: () => void) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** O que cada integração exige do Lucas para ligar — texto que a tela mostra. */
export const GUIA_ATIVACAO: Record<ChaveIntegracao, { passos: string[]; segredos: string[]; funcoes: string[] }> = {
  whatsapp: {
    passos: [
      "Criar o app no Meta for Developers (Business) e ligar o número oficial do Instituto ao WhatsApp Business Platform (Cloud API).",
      "Gerar um token permanente de sistema com permissão whatsapp_business_messaging e anotar o Phone Number ID.",
      "Cadastrar o webhook: URL da função whatsapp-webhook + o verify token que você escolher; assinar 'messages'.",
      "Aprovar pelo menos um template (ex.: lembrete de consulta) — fora da janela de 24 h só template envia.",
      "Ligar aqui. As mensagens das cadências passam a sair pelo número oficial; o histórico fica em mensagem_whatsapp.",
    ],
    segredos: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET (opcional)"],
    funcoes: ["whatsapp-enviar", "whatsapp-webhook"],
  },
  focus_nfse: {
    passos: [
      "Contratar a Focus NFe (plano NFS-e São Paulo) e pegar o token de produção e o de homologação.",
      "Cadastrar a empresa na Focus (CNPJ, inscrição municipal, certificado A1 da prefeitura).",
      "Preencher a config: cnpjPrestador, inscricaoMunicipal, codigoServico (LC 116), aliquotas e ambiente = homologacao para testar.",
      "Cadastrar o webhook focus-nfse-webhook na Focus (com ?token=FOCUS_WEBHOOK_TOKEN).",
      "Emitir uma nota de teste em homologação; depois trocar ambiente = producao e ligar.",
    ],
    segredos: ["FOCUS_NFE_TOKEN", "FOCUS_WEBHOOK_TOKEN (opcional)"],
    funcoes: ["focus-nfse", "focus-nfse-webhook"],
  },
  supersign: {
    passos: [
      "Pedir ao SuperSign a chave de API da conta do Instituto e a documentação do endpoint de criação de documento.",
      "Subir o PDF do contrato de adesão num link fixo (SharePoint público ou bucket) e colocar em documentoModeloUrl.",
      "Conferir endpointCriar / campoArquivo na config com a documentação (o padrão é /v1/documents e file_url).",
      "Ligar. O botão 'Enviar contrato' aparece no card do paciente depois do fechamento.",
    ],
    segredos: ["SUPERSIGN_TOKEN", "SUPERSIGN_API_URL (opcional)"],
    funcoes: ["supersign-enviar"],
  },
  feegow: {
    passos: [
      "Pedir ao suporte do Feegow o token da API (x-access-token) da licença do Instituto.",
      "Confirmar os ids dos profissionais (1 Daniel · 15 Barbara · 16 Gessica · 19 Juliana) na config.",
      "Ligar. A agenda dos próximos 30 dias é copiada todo dia às 5h30 e pelo botão 'Sincronizar agora'.",
      "Se a clínica ficar só no iClinic, esta integração pode ficar desligada (a memória do app tem os endpoints do iClinic).",
    ],
    segredos: ["FEEGOW_TOKEN"],
    funcoes: ["feegow-sync"],
  },
  outlook: {
    passos: [
      "No Entra ID, dar ao mesmo aplicativo do SharePoint a permissão de aplicativo Calendars.Read (consentimento do administrador).",
      "Criar ou escolher a caixa do calendário (ex.: agenda@institutobratan.com.br) e colocar em caixaDeCorreio.",
      "Ligar. Os eventos dos próximos 30 dias entram em agenda_espelho todo dia às 5h30.",
    ],
    segredos: ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET (já existem para o SharePoint)"],
    funcoes: ["outlook-agenda"],
  },
  push: {
    passos: [
      "No computador, rodar `npx web-push generate-vapid-keys` e guardar as duas chaves.",
      "Configurar os segredos VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY e VAPID_SUBJECT (mailto:lucas.daniel@institutobratan.com.br) pelo script local.",
      "Colar a chave PÚBLICA também em vapidPublicKey nesta config (o navegador precisa dela para assinar).",
      "Ligar. Cada pessoa ativa os avisos na Home do app instalado; às 7h a Fila do dia chega no celular.",
    ],
    segredos: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    funcoes: ["push-enviar"],
  },
  itau: {
    passos: [
      "Pedir ao gerente o acesso ao Itaú for Developers (Open Finance / API de extrato) para a conta do Instituto — exige contrato e certificado.",
      "Quando o banco liberar, o app ganha a função itau-extrato (a conciliação continua igual, só deixa de precisar do PDF).",
    ],
    segredos: ["ITAU_CLIENT_ID", "ITAU_CLIENT_SECRET", "ITAU_CERT_PEM"],
    funcoes: [],
  },
  rede: {
    passos: [
      "Solicitar à Rede o acesso à API de conciliação (Rede Conciliador / e.Rede) para o PV do Instituto.",
      "Quando liberar, o app ganha a função rede-conciliar (recebíveis e antecipação direto na conferência da maquininha).",
    ],
    segredos: ["REDE_PV", "REDE_TOKEN"],
    funcoes: [],
  },
};
