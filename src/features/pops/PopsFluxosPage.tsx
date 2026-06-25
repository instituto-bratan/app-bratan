import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileText, FolderOpen, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

type AreaDoc = {
  area: string;
  descricao: string;
  documentos: string[];
};

const areas: AreaDoc[] = [
  {
    area: "Recepção",
    descricao: "Fluxos de chegada, confirmação, agenda e acolhimento.",
    documentos: ["POP de atendimento inicial", "Fluxograma de confirmação", "Fluxo de comprovantes"],
  },
  {
    area: "Enfermagem",
    descricao: "Rotinas assistenciais operacionais sem prontuário clínico no app.",
    documentos: ["POP de sala", "Fluxo de preparo", "Checklist de materiais"],
  },
  {
    area: "Nutrição",
    descricao: "Documentos de rotina e passagem operacional da área.",
    documentos: ["POP de bioimpedância", "Fluxo de encaminhamento"],
  },
  {
    area: "Financeiro",
    descricao: "Fechamentos, conferências e documentos de suporte interno.",
    documentos: ["POP de fechamento diário", "Fluxo de notas fiscais"],
  },
  {
    area: "Limpeza",
    descricao: "Rotinas de ambiente e organização interna.",
    documentos: ["POP de salas", "Fluxo de reposição"],
  },
];

export function PopsFluxosPage() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredAreas = useMemo(() => {
    if (!normalizedQuery) return areas;

    return areas
      .map((area) => ({
        ...area,
        documentos: area.documentos.filter((documento) =>
          `${area.area} ${area.descricao} ${documento}`.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((area) => area.documentos.length > 0 || area.area.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="gold" className="mb-4">
              Fase 2 preparada
            </Badge>
            <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">POPs & Fluxos</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Estrutura pronta para receber os POPs e fluxogramas por área. O caminho ideal é referenciar documentos do SharePoint sem duplicar conteúdo.
            </p>
          </div>
          <LiquidButton type="button" size="lg">
            SharePoint pronto
          </LiquidButton>
        </div>
      </motion.section>

      <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por área ou documento" className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredAreas.map((area, index) => (
          <motion.article
            key={area.area}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04, ease: [0.4, 0, 0.2, 1] }}
          >
            <Card className="h-full border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
                    <FolderOpen className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{area.area}</CardTitle>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{area.descricao}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {area.documentos.map((documento) => (
                  <div key={documento} className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-brand-oliva" aria-hidden="true" />
                      <span className="truncate text-sm font-semibold text-brand-tinta">{documento}</span>
                    </div>
                    <Badge variant="muted">pendente</Badge>
                  </div>
                ))}
                <Button type="button" variant="outline" className="mt-3 w-full" disabled>
                  Abrir documento quando anexado
                </Button>
              </CardContent>
            </Card>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
