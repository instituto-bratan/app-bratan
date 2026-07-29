// Telefone e e-mail de quem entra no CRM (29/07/2026).
// Motivo: dava para criar paciente/lead em vários lugares SEM telefone e SEM
// e-mail. Depois, ao abrir o perfil, não havia onde cadastrar — o contato
// nascia mudo e a cadência não tinha para onde ligar nem escrever.
// Aqui ficam as regras únicas: como formatar, como validar e como virar os
// campos do CrmContact. Toda tela que cria pessoa usa ESTAS funções.

export type ContactChannelsDraft = {
  /** WhatsApp / telefone, do jeito que a pessoa digitou. */
  phone: string;
  email: string;
};

export const emptyContactChannels: ContactChannelsDraft = { phone: "", email: "" };

export function phoneDigits(value: string) {
  return (value ?? "").replace(/\D+/g, "");
}

// Máscara brasileira conforme digita: (11) 98765-4321 / (11) 3456-7890.
// Números com DDI (13 dígitos começando em 55) viram +55 (11) 98765-4321.
export function formatPhoneBR(value: string): string {
  const digits = phoneDigits(value).slice(0, 13);
  if (!digits) return "";
  if (digits.length > 11 && digits.startsWith("55")) {
    const rest = digits.slice(2);
    return `+55 ${formatPhoneBR(rest)}`.trim();
  }
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

const emailShape = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function isValidEmail(value: string) {
  return emailShape.test((value ?? "").trim());
}

// Telefone brasileiro válido: 10 dígitos (fixo) ou 11 (celular com 9), aceitando
// o 55 na frente. Menos que isso não dá para ligar nem abrir WhatsApp.
export function isValidPhoneBR(value: string) {
  const digits = phoneDigits(value);
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  return local.length === 10 || local.length === 11;
}

/**
 * Explica em português o que está errado nos campos — ou null quando está tudo
 * bem. Campo vazio NÃO é erro aqui (quem exige é a tela); erro é preencher
 * torto, porque um telefone quebrado é pior que nenhum: a cadência tenta ligar.
 */
export function contactChannelsIssue(draft: ContactChannelsDraft): string | null {
  if (draft.phone.trim() && !isValidPhoneBR(draft.phone)) {
    return "O telefone parece incompleto — use DDD + número, como (11) 98765-4321.";
  }
  if (draft.email.trim() && !isValidEmail(draft.email)) {
    return "O e-mail parece incompleto — confira se tem @ e o final (ex.: nome@gmail.com).";
  }
  return null;
}

/**
 * Vira os campos do CrmContact. O telefone é gravado só em dígitos e vai para
 * `phone` E `whatsapp` (é o mesmo número na prática do Instituto), o que também
 * faz o id determinístico virar `contact-tel-…` e impedir duplicata entre
 * aparelhos. Campo vazio sai do objeto para não apagar dado já existente.
 */
export function contactChannelsValues(draft: ContactChannelsDraft): { phone?: string; whatsapp?: string; email?: string } {
  const values: { phone?: string; whatsapp?: string; email?: string } = {};
  const digits = phoneDigits(draft.phone);
  if (digits) {
    values.phone = digits;
    values.whatsapp = digits;
  }
  const email = draft.email.trim().toLowerCase();
  if (email) values.email = email;
  return values;
}

/** Tem algo preenchido? Usado para decidir se vale avisar/validar. */
export function hasContactChannels(draft: ContactChannelsDraft) {
  return Boolean(draft.phone.trim() || draft.email.trim());
}
