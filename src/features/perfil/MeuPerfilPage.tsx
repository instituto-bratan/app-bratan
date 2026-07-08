import { useState } from "react";
import { motion } from "framer-motion";
import { Camera, CheckCircle2, KeyRound, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useImageUpload } from "@/hooks/use-image-upload";
import { cargoGroup, cargoLabels } from "@/lib/access";
import { cn } from "@/lib/utils";
import { accessMatrix, allowedModuleCount } from "@/features/admin/colaboradoresData";
import { bumpAvatarVersion, fileToAvatarDataUrl, saveAvatar, useAvatar } from "./avatarStore";
import { uploadRemoteAvatar } from "@/lib/remoteData";

export function avatarInitials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase() || "IB";
}

function AvatarUpload({ pessoaId, nome }: { pessoaId: string; nome: string }) {
  const avatar = useAvatar(pessoaId);
  const { session, isPreview } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState("");

  // Salva no aparelho e publica no bucket da equipe — todos passam a ver.
  function persistAvatar(dataUrl: string) {
    saveAvatar(pessoaId, dataUrl);
    setShared("");
    if (session && !isPreview) {
      uploadRemoteAvatar(pessoaId, dataUrl)
        .then(() => {
          bumpAvatarVersion(pessoaId);
          setShared("Foto publicada — visível para toda a equipe.");
        })
        .catch(() => setShared("Foto salva neste aparelho, mas não sincronizou — tente de novo com internet."));
    }
  }
  const { fileInputRef, handleThumbnailClick, handleFileChange } = useImageUpload({
    onUpload: (_url, file) => {
      setError("");
      fileToAvatarDataUrl(file)
        .then(persistAvatar)
        .catch(() => setError("Não foi possível processar a foto. Tente JPG ou PNG."));
    },
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
      <button
        type="button"
        onClick={handleThumbnailClick}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file?.type.startsWith("image/")) {
            setError("");
            fileToAvatarDataUrl(file)
              .then(persistAvatar)
              .catch(() => setError("Não foi possível processar a foto. Tente JPG ou PNG."));
          }
        }}
        aria-label={avatar ? "Trocar foto do perfil" : "Adicionar foto do perfil"}
        className={cn(
          "group ios-pressable relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 shadow-calm transition-colors",
          isDragging ? "border-brand-dourado bg-brand-creme/60" : "border-white/70 bg-brand-musgo",
        )}
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-brand-papel">{avatarInitials(nome)}</span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-brand-tinta/45 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-6 w-6 text-white" aria-hidden="true" />
        </span>
      </button>
      {avatar ? (
        <button
          type="button"
          onClick={() => saveAvatar(pessoaId, null)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/70 hover:text-brand-tinta"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Remover foto
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Toque para adicionar — fica visível para toda a equipe</p>
      )}
      {error ? <p className="max-w-40 text-center text-xs text-destructive">{error}</p> : null}
      {shared ? <p className="text-xs font-semibold text-brand-musgo">{shared}</p> : null}
    </div>
  );
}

function formatDateTime(dateString?: string | null) {
  if (!dateString) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function MeuPerfilPage() {
  const { pessoa, isPreview } = useAuth();

  if (!pessoa) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <AvatarUpload pessoaId={pessoa.id} nome={pessoa.nome} />
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="gold">Meu perfil</Badge>
                {isPreview ? <Badge variant="outline">Prévia local</Badge> : null}
                <Badge variant="outline">{cargoLabels[pessoa.cargo]}</Badge>
                <Badge variant="muted">{cargoGroup(pessoa.cargo)}</Badge>
              </div>
              <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">{pessoa.nome}</h1>
              <p className="mt-3 flex max-w-2xl items-center gap-2 text-base leading-7 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pessoa.email}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-brand-musgo">{allowedModuleCount(pessoa.cargo)}</p>
            <p className="text-xs font-semibold uppercase text-brand-oliva">módulos liberados</p>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <section className="space-y-4">
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-5 w-5" aria-hidden="true" />
                Dados de acesso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Cargo</p>
                <p className="mt-2 font-semibold text-brand-tinta">{cargoLabels[pessoa.cargo]}</p>
                <p className="mt-1 text-sm text-muted-foreground">{cargoGroup(pessoa.cargo)}</p>
              </div>
              <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Login</p>
                <div className="mt-2 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                  <p className="font-semibold text-brand-tinta">{isPreview ? "Prévia local ativa" : "Acesso ativo"}</p>
                </div>
              </div>
              <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Cadastro</p>
                <p className="mt-2 text-sm text-muted-foreground">Criado em {formatDateTime(pessoa.created_at)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Atualizado em {formatDateTime(pessoa.updated_at)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-brand-dourado/45 bg-brand-creme/35 shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <KeyRound className="mt-1 h-5 w-5 shrink-0 text-brand-musgo" aria-hidden="true" />
              <p className="text-sm leading-6 text-muted-foreground">
                Alterações de cargo, e-mail ou senha inicial são feitas pela coordenação em Colaboradores.
              </p>
            </CardContent>
          </Card>
        </section>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              Minhas permissões
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {accessMatrix.map((item) => {
                const allowed = item.allowed(pessoa.cargo);

                return (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-lg border p-4 transition",
                      allowed ? "border-brand-oliva/20 bg-white/70" : "border-brand-oliva/12 bg-muted/35 opacity-75",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-semibold text-brand-tinta">{item.label}</p>
                      <Badge variant={allowed ? "gold" : "muted"}>{allowed ? "Liberado" : "Bloqueado"}</Badge>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
