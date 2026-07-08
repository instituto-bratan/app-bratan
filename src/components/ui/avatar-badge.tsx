import { useEffect, useState } from "react";
import { useAvatarSrc } from "@/features/perfil/avatarStore";
import { cn } from "@/lib/utils";

// Foto de perfil visível para toda a equipe: tenta a foto local deste
// aparelho, depois a do bucket compartilhado; sem foto, mostra a inicial.
export function AvatarBadge({
  pessoaId,
  nome,
  className,
}: {
  pessoaId: string | null | undefined;
  nome: string;
  className?: string;
}) {
  const src = useAvatarSrc(pessoaId);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = (nome || "?").trim().charAt(0).toUpperCase();

  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-musgo text-sm font-bold text-brand-papel",
        className,
      )}
      aria-hidden="true"
    >
      {src && !failed ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      ) : (
        initial
      )}
    </span>
  );
}
