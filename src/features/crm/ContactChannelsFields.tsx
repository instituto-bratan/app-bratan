// Os dois campos (WhatsApp e e-mail) que aparecem em TODA tela onde nasce uma
// pessoa nova. Um componente só para os dois campos serem iguais em todo lugar
// e ninguém esquecer nenhum deles de novo (29/07/2026).

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { contactChannelsIssue, formatPhoneBR, type ContactChannelsDraft } from "./contactChannels";

type ContactChannelsFieldsProps = {
  value: ContactChannelsDraft;
  onChange: (next: ContactChannelsDraft) => void;
  /** Prefixo dos ids, para os rótulos casarem quando há mais de um formulário na tela. */
  idPrefix: string;
  /** Some com a moldura destacada quando os campos já estão dentro de um card. */
  bare?: boolean;
  className?: string;
  /** Texto do topo. Padrão: explica por que o número importa. */
  note?: string;
  phoneLabel?: string;
  disabled?: boolean;
};

export function ContactChannelsFields({
  value,
  onChange,
  idPrefix,
  bare,
  className,
  note,
  phoneLabel = "WhatsApp / telefone",
  disabled,
}: ContactChannelsFieldsProps) {
  const issue = contactChannelsIssue(value);
  return (
    <div
      className={cn(
        "grid gap-3",
        !bare && "rounded-lg border border-brand-dourado/35 bg-brand-creme/25 p-3",
        className,
      )}
    >
      {!bare || note ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {note ?? "Contato da pessoa — é por aqui que a cadência liga e escreve. Sem número, o CRM não tem como cobrar nem acompanhar."}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-phone`}>{phoneLabel}</Label>
          <Input
            id={`${idPrefix}-phone`}
            className="mt-1"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
            value={value.phone}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, phone: formatPhoneBR(event.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-email`}>E-mail</Label>
          <Input
            id={`${idPrefix}-email`}
            className="mt-1"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nome@email.com"
            value={value.email}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, email: event.target.value })}
          />
        </div>
      </div>
      {issue ? <p className="text-[11px] font-semibold text-destructive">{issue}</p> : null}
    </div>
  );
}
