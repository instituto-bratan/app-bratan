import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { cargoLabels, cargos } from "@/lib/access";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Cargo } from "@/types/database";
import bratanLogoHorizontal from "@/assets/bratan-logo-horizontal.png";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "Informe a senha."),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { pessoa, signInWithPassword, enterPreview } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewCargo, setPreviewCargo] = useState<Cargo>("gestor_financeiro");

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  if (pessoa) {
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(values: LoginForm) {
    setError(null);
    setStatus(null);

    try {
      await signInWithPassword(values.email, values.password);
      setStatus("Acesso realizado.");
    } catch {
      setError("Não foi possível entrar. Confira e-mail, senha e cadastro do colaborador.");
    }
  }

  function startPreview(cargo: Cargo) {
    enterPreview(cargo);
    navigate(redirectTo, { replace: true });
  }

  return (
    <main className="isolate grid min-h-screen min-h-dvh place-items-center overflow-hidden px-3 py-8 ios-safe-bottom ios-safe-top sm:px-4 sm:py-10">
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-7 flex items-start justify-between gap-4">
          <img src={bratanLogoHorizontal} alt="Instituto Bratan" className="h-auto w-60 max-w-[72%] object-contain" />
          <Badge variant="gold">Interno</Badge>
        </div>

        <Card className="border-brand-oliva/20 bg-white/72 shadow-ios backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-brand-tinta">Acesso da equipe</CardTitle>
            <CardDescription>Entre com e-mail e senha autorizados pela coordenação.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@institutobratan.com.br"
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Senha cadastrada"
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                ) : null}
              </div>

              <Button className="w-full" type="submit" disabled={form.formState.isSubmitting || !isSupabaseConfigured}>
                Entrar
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </form>

            {status ? <p className="mt-4 text-sm text-brand-musgo">{status}</p> : null}
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            {!isSupabaseConfigured ? (
              <div className="mt-6 rounded-md border border-brand-dourado/45 bg-brand-creme/45 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-musgo">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Prévia local
                </div>
                <div className="space-y-3">
                  <select
                    value={previewCargo}
                    onChange={(event) => setPreviewCargo(event.target.value as Cargo)}
                    className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {cargos.map((cargo) => (
                      <option key={cargo} value={cargo}>
                        {cargoLabels[cargo]}
                      </option>
                    ))}
                  </select>
                  <LiquidButton type="button" size="lg" className="w-full" onClick={() => startPreview(previewCargo)}>
                    Entrar como {cargoLabels[previewCargo]}
                  </LiquidButton>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
