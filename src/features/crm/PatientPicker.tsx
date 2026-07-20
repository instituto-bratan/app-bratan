import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { contactDisplayName, type CrmContact } from "./crmData";

export type PatientPickerValue = { ref: string; name: string };

function norm(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function digits(value: string) {
  return (value || "").replace(/\D/g, "");
}

// Seletor de paciente ligado ao CRM: busca por nome/telefone nos contatos,
// VINCULA um existente (guarda o ref) ou marca um NOVO (ref vazio → a tela que
// usa cria no CRM ao salvar). Evita paciente duplicado entre CRM, comandas,
// comprovantes, dívida e 360 — tudo conectado pelo mesmo contato.
export function PatientPicker({
  contacts,
  value,
  onChange,
  placeholder = "Buscar paciente por nome ou telefone…",
  disabled = false,
  autoFocus = false,
  id,
}: {
  contacts: CrmContact[];
  value: PatientPickerValue;
  onChange: (next: PatientPickerValue) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const [query, setQuery] = useState(value.name);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | undefined>(undefined);

  // Ressincroniza quando o valor muda de fora (reset do form, editar registro).
  useEffect(() => {
    setQuery(value.name);
  }, [value.name]);

  const linked = Boolean(value.ref);

  const matches = useMemo(() => {
    const q = norm(query);
    const qDigits = digits(query);
    if (!q && !qDigits) return contacts.slice(0, 8);
    const scored = contacts
      .map((contact) => {
        const name = norm(contactDisplayName(contact));
        const full = norm(contact.fullName);
        const phone = digits(contact.phone) + digits(contact.whatsapp);
        let score = -1;
        if (q && (name.startsWith(q) || full.startsWith(q))) score = 3;
        else if (q && (name.includes(q) || full.includes(q))) score = 2;
        else if (qDigits && qDigits.length >= 4 && phone.includes(qDigits)) score = 1;
        return { contact, score };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return scored.map((item) => item.contact);
  }, [contacts, query]);

  const exactMatch = useMemo(
    () => contacts.some((contact) => norm(contactDisplayName(contact)) === norm(query) || norm(contact.fullName) === norm(query)),
    [contacts, query],
  );
  const canCreate = query.trim().length >= 2 && !exactMatch;

  function handleType(next: string) {
    setQuery(next);
    setOpen(true);
    // Digitar desfaz o vínculo: vira "novo" até escolher alguém da lista.
    onChange({ ref: "", name: next });
  }

  function selectContact(contact: CrmContact) {
    const name = contactDisplayName(contact);
    setQuery(name);
    setOpen(false);
    onChange({ ref: contact.id, name });
  }

  function clear() {
    setQuery("");
    setOpen(true);
    onChange({ ref: "", name: "" });
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={id}
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={cn("pl-9", linked && "pr-9 border-emerald-300 bg-emerald-50/40", query && "pr-9")}
          onChange={(event) => handleType(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={clear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-brand-tinta"
            aria-label="Limpar paciente"
          >
            {linked ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      {/* Estado abaixo do campo: vinculado / novo */}
      {linked ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Vinculado ao cadastro do CRM
        </p>
      ) : query.trim() ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Novo paciente — será cadastrado no CRM ao salvar
        </p>
      ) : null}

      {open && !disabled ? (
        <div
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-brand-oliva/25 bg-white/95 p-1 shadow-lg backdrop-blur"
          onMouseDown={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
          }}
        >
          {matches.length ? (
            matches.map((contact) => {
              const isPatient = ["ACTIVE_PATIENT", "CLOSED_PATIENT"].includes(contact.lifecycleStage);
              const phone = contact.whatsapp || contact.phone;
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => selectContact(contact)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-brand-creme/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-brand-tinta">{contactDisplayName(contact)}</span>
                    {phone ? <span className="block truncate text-xs text-muted-foreground">{phone}</span> : null}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", isPatient ? "bg-emerald-100 text-emerald-800" : "bg-brand-creme text-brand-musgo")}>
                    {isPatient ? "Paciente" : "Lead"}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum paciente encontrado com esse nome/telefone.</p>
          )}
          {canCreate ? (
            <div className="mt-1 border-t border-brand-oliva/10 px-3 py-2 text-xs text-amber-800">
              <UserPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              <strong>“{query.trim()}”</strong> será cadastrado como novo paciente ao salvar.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
