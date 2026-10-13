// MEU PERFIL — redesenho "Papel & Musgo", etapa 4 (08/10/2026).
//
// O que a tela FAZ não mudou: trocar a foto (tocar ou arrastar; salva no
// aparelho e, com login, publica no bucket da equipe), remover a foto (apaga no
// aparelho E despublica), ver o cargo, o login, as datas do cadastro e as
// permissões do cargo. Mudou a forma: um Cabecalho com o nome e a frase que diz
// o cargo e quantos módulos ele libera; a foto num bloco "folha" (é a única
// decisão da tela), com o avatar no ARCO DO BRASÃO (guia, seção 10) e o "trocar"
// escrito, não só no passar do mouse (no celular não existe mouse); os dados de
// acesso e as permissões em blocos "saber", as permissões como LISTA (itens do
// mesmo tipo), cada uma com a situação escrita e o ícone. Sem vidro, sem
// animação de entrada, sem as cores com opacidade que não geravam CSS.
import { useState } from "react";
import { Camera, CircleCheck, KeyRound, Lock, Mail, TriangleAlert, X } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { accessMatrix, allowedModuleCount } from "@/features/admin/colaboradoresData";
import { Recado } from "@/features/compras/pecas";
import { iniciaisDoNome, Rubrica, Situacao } from "@/features/pops/pecasDaEquipe";
import { useAuth } from "@/hooks/useAuth";
import { useImageUpload } from "@/hooks/use-image-upload";
import { cargoGroup, cargoLabels } from "@/lib/access";
import { deleteRemoteAvatar, uploadRemoteAvatar } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { bumpAvatarVersion, fileToAvatarDataUrl, saveAvatar, useAvatar } from "./avatarStore";

/** Iniciais do avatar ("Lucas Daniel" → "LD"). Mantida exportada: é a mesma regra do arco do brasão. */
export function avatarInitials(nome: string) {
  return iniciaisDoNome(nome);
}

function AvatarUpload({ pessoaId, nome }: { pessoaId: string; nome: string }) {
  const avatar = useAvatar(pessoaId);
  const { session, isPreview } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState("");
  const [sharedFalhou, setSharedFalhou] = useState(false);

  // Salva no aparelho e publica no bucket da equipe — todos passam a ver.
  function persistAvatar(dataUrl: string) {
    saveAvatar(pessoaId, dataUrl);
    setShared("");
    if (session && !isPreview) {
      uploadRemoteAvatar(pessoaId, dataUrl)
        .then(() => {
          bumpAvatarVersion(pessoaId);
          setSharedFalhou(false);
          setShared("Foto publicada — visível para toda a equipe.");
        })
        .catch(() => {
          setSharedFalhou(true);
          setShared("Foto salva neste aparelho, mas não sincronizou — tente de novo com internet.");
        });
    }
  }
  // Remover: apaga no aparelho E despublica do bucket — senão a equipe continuava
  // vendo a foto "removida" (o arquivo seguia no Storage).
  function removeAvatar() {
    saveAvatar(pessoaId, null);
    if (session && !isPreview) {
      deleteRemoteAvatar(pessoaId)
        .then(() => {
          bumpAvatarVersion(pessoaId);
          setSharedFalhou(false);
          setShared("Foto removida — a equipe não a vê mais.");
        })
        .catch(() => {
          setSharedFalhou(true);
          setShared("Removida deste aparelho, mas não despublicou — tente de novo com internet.");
        });
    } else {
      setShared("");
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
    <div className="grid gap-4">
      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileChange} />
      <div className="flex items-center gap-5">
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
            // O arco do brasão em tamanho de perfil (a foto é o que se toca aqui).
            "group relative grid h-[100px] w-[88px] shrink-0 place-items-center rounded-b-bloco rounded-t-[44px] bg-musgo transition-shadow duration-150 ease-papel",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
            isDragging ? "shadow-[0_0_0_3px_rgb(var(--folha-rgb)),0_0_0_5px_rgb(var(--musgo-rgb))]" : "hover:shadow-[0_0_0_3px_rgb(var(--folha-rgb)),0_0_0_4px_rgb(var(--fio-2-rgb))]",
          )}
        >
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-b-bloco rounded-t-[44px]">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-sans text-2xl font-extrabold tracking-[0.04em] text-creme dark:text-sobre-musgo">{iniciaisDoNome(nome)}</span>
            )}
          </span>
          {/* A câmera fica sempre à vista: no celular não existe "passar o mouse". */}
          <span
            aria-hidden="true"
            className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full border border-fio-2 bg-folha text-musgo transition-colors duration-150 ease-papel group-hover:bg-papel"
          >
            <Camera className="h-4 w-4" />
          </span>
        </button>

        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-bold leading-5 text-tinta">{avatar ? "Toque na foto para trocar" : "Toque para adicionar"}</p>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            {avatar ? "Ou arraste outra imagem para cima dela." : "Ou arraste uma imagem. Fica visível para toda a equipe."}
          </p>
          {avatar ? (
            <Botao
              variante="fantasma"
              tamanho="pq"
              onClick={removeAvatar}
              icone={<X className="h-4 w-4" aria-hidden="true" />}
              className="-ml-3 mt-1 w-fit max-md:h-11"
            >
              Remover foto
            </Botao>
          ) : null}
        </div>
      </div>

      {error ? (
        <Recado tom="erro" role="alert" icone={<TriangleAlert className="text-erro" aria-hidden="true" />}>
          {error}
        </Recado>
      ) : null}
      {shared ? (
        <p role="status" className={cn("flex items-start gap-1.5 text-[13px] font-bold leading-5", sharedFalhou ? "text-atencao" : "text-ok")}>
          {sharedFalhou ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          {shared}
        </p>
      ) : null}
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

/** Uma linha de "Dados de acesso": o rótulo em rubrica, o valor e o detalhe. */
function LinhaDeDado({ rotulo, children, detalhe }: { rotulo: string; children: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-fio py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt>
        <Rubrica as="span">{rotulo}</Rubrica>
      </dt>
      <dd className="text-sm font-semibold leading-6 text-tinta">{children}</dd>
      {detalhe ? <dd className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{detalhe}</dd> : null}
    </div>
  );
}

export function MeuPerfilPage() {
  const { pessoa, isPreview } = useAuth();

  if (!pessoa) {
    return null;
  }

  const liberados = allowedModuleCount(pessoa.cargo);
  const total = accessMatrix.length;

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha={isPreview ? "Ajustes · Meu perfil · prévia local" : "Ajustes · Meu perfil"}
        titulo={pessoa.nome}
        frase={
          <>
            <strong>{cargoLabels[pessoa.cargo]}</strong>, no grupo {cargoGroup(pessoa.cargo)}. O seu cargo libera{" "}
            <strong>
              {liberados} de {total} módulos
            </strong>{" "}
            do app.
          </>
        }
      />

      <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          <BlocoFolha as="section" respiro aria-labelledby="perfil-foto">
            <h2 id="perfil-foto" className="mb-4 text-base font-bold leading-6 text-tinta">
              Sua foto
            </h2>
            <AvatarUpload pessoaId={pessoa.id} nome={pessoa.nome} />
          </BlocoFolha>

          <BlocoSaber as="section" aria-labelledby="perfil-acesso" className="grid gap-4">
            <h2 id="perfil-acesso" className="text-base font-bold leading-6 text-tinta">
              Dados de acesso
            </h2>
            <dl>
              <LinhaDeDado rotulo="E-mail">
                <span className="inline-flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
                  <Mail className="h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
                  {pessoa.email}
                </span>
              </LinhaDeDado>
              <LinhaDeDado rotulo="Cargo" detalhe={cargoGroup(pessoa.cargo)}>
                {cargoLabels[pessoa.cargo]}
              </LinhaDeDado>
              <LinhaDeDado rotulo="Login">
                <Situacao tom="ok" icone={<CircleCheck aria-hidden="true" />}>
                  {isPreview ? "Prévia local ativa" : "Acesso ativo"}
                </Situacao>
              </LinhaDeDado>
              <LinhaDeDado rotulo="Cadastro" detalhe={`Atualizado em ${formatDateTime(pessoa.updated_at)}`}>
                <span className="tabular-nums">Criado em {formatDateTime(pessoa.created_at)}</span>
              </LinhaDeDado>
            </dl>
            <p className="flex items-start gap-2 border-t border-fio pt-4 text-[13px] font-medium leading-5 text-tinta-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
              Alterações de cargo, e-mail ou senha inicial são feitas pela coordenação em Colaboradores.
            </p>
          </BlocoSaber>
        </div>

        <BlocoSaber as="section" aria-labelledby="perfil-permissoes" className="min-w-0 p-0 max-md:p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4">
            <h2 id="perfil-permissoes" className="text-base font-bold leading-6 text-tinta">
              Minhas permissões
            </h2>
            <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
              {liberados} liberados · {total - liberados} bloqueados
            </p>
          </div>
          <ul>
            {accessMatrix.map((item) => {
              const allowed = item.allowed(pessoa.cargo);
              return (
                <li
                  key={item.label}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-1 border-t border-fio px-6 py-4 max-md:px-4"
                >
                  <div className="min-w-0">
                    <p className={cn("text-sm font-bold leading-6", allowed ? "text-tinta" : "text-tinta-2")}>{item.label}</p>
                    <p className="text-[13px] font-medium leading-5 text-tinta-2">{item.description}</p>
                  </div>
                  <Situacao
                    tom={allowed ? "ok" : "neutro"}
                    icone={allowed ? <CircleCheck aria-hidden="true" /> : <Lock aria-hidden="true" />}
                    className="mt-0.5"
                  >
                    {allowed ? "Liberado" : "Bloqueado"}
                  </Situacao>
                </li>
              );
            })}
          </ul>
        </BlocoSaber>
      </div>
    </div>
  );
}
