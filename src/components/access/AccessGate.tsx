import { LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { cargoLabels } from "@/lib/access";
import type { Cargo } from "@/types/database";

type AccessGateProps = {
  allowed: (cargo: Cargo | null | undefined) => boolean;
  children: React.ReactNode;
  label: string;
};

export function AccessGate({ allowed, children, label }: AccessGateProps) {
  const { pessoa } = useAuth();

  if (allowed(pessoa?.cargo)) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto grid min-h-[52vh] w-full max-w-3xl place-items-center">
      <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-lg bg-brand-creme text-brand-musgo">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </div>
          <Badge variant="gold" className="mb-4">
            Acesso restrito
          </Badge>
          <h1 className="text-3xl text-brand-musgo">{label}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Seu cargo atual é {pessoa?.cargo ? cargoLabels[pessoa.cargo] : "não definido"}. A interface esconde este módulo para reduzir ruído, e a segurança definitiva fica nas políticas RLS do Supabase.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
