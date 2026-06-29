import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ClipboardCheck, FileText, FolderOpen, Image as ImageIcon, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { cn } from "@/lib/utils";
import { documentsByArea, fluxogramas, popsAreas, totalPopsTasks, type PopsAreaId } from "./popsData";

type AreaFilter = PopsAreaId | "todos";

const areaFilterOptions: { id: AreaFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  ...popsAreas.map((area) => ({ id: area.id, label: area.label })),
];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function PopsFluxosPage() {
  const [query, setQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState<AreaFilter>("todos");
  const normalizedQuery = normalizeSearch(query.trim());
  const activeArea = selectedArea === "todos" ? null : popsAreas.find((area) => area.id === selectedArea) ?? null;

  const filteredDocs = useMemo(() => {
    return fluxogramas.filter((documento) => {
      const matchesArea = selectedArea === "todos" || documento.areaId === selectedArea;
      const searchableText = normalizeSearch(
        [
          documento.titulo,
          documento.setor,
          documento.responsavel,
          documento.categoria,
          documento.resumo,
          ...documento.etapas,
          ...documento.tarefasSugeridas,
          ...documento.tags,
        ].join(" "),
      );
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

      return matchesArea && matchesQuery;
    });
  }, [normalizedQuery, selectedArea]);

  const areasWithDocs = useMemo(() => {
    return popsAreas
      .map((area) => ({
        ...area,
        documentos: filteredDocs.filter((documento) => documento.areaId === area.id),
      }))
      .filter((area) => selectedArea === "todos" || area.id === selectedArea || area.documentos.length > 0);
  }, [filteredDocs, selectedArea]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <Badge variant="gold" className="mb-4">
              Biblioteca operacional
            </Badge>
            <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">POPs & Fluxos</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              Fluxogramas internos organizados por setor, com contexto operacional e tarefas extraídas para a rotina da equipe.
            </p>
          </div>

          <Card className="border-brand-dourado/35 bg-brand-creme/45 shadow-none">
            <CardContent className="grid grid-cols-3 gap-3 p-4 text-center">
              <div>
                <p className="text-3xl font-bold text-brand-musgo">{fluxogramas.length}</p>
                <p className="text-[11px] font-semibold uppercase text-brand-oliva">fluxos</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-brand-musgo">{popsAreas.length}</p>
                <p className="text-[11px] font-semibold uppercase text-brand-oliva">setores</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-brand-musgo">{totalPopsTasks}</p>
                <p className="text-[11px] font-semibold uppercase text-brand-oliva">tarefas</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.section>

      <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por setor, tarefa, documento ou palavra-chave" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            {areaFilterOptions.map((area) => (
              <Button
                key={area.id}
                type="button"
                size="sm"
                variant={selectedArea === area.id ? "default" : "outline"}
                onClick={() => setSelectedArea(area.id)}
              >
                {area.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {activeArea ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl text-brand-musgo">
                    <Sparkles className="h-5 w-5 text-brand-dourado" aria-hidden="true" />
                    {activeArea.label}
                  </CardTitle>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{activeArea.foco}</p>
                </div>
                <Badge variant="outline">{documentsByArea(activeArea.id).length} fluxos</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="rounded-lg border border-brand-oliva/16 bg-brand-papel/60 p-4">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Responsáveis</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeArea.responsaveis.map((responsavel) => (
                    <Badge key={responsavel} variant="muted">
                      {responsavel}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-brand-oliva/16 bg-white/70 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-tinta">
                  <ClipboardCheck className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
                  Tarefas do setor
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {activeArea.tarefasDoDia.map((task) => (
                    <div key={task} className="rounded-lg bg-brand-papel/55 px-3 py-2 text-sm leading-6 text-brand-tinta">
                      {task}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      ) : null}

      <div className="space-y-6">
        {areasWithDocs.map((area, areaIndex) => (
          <motion.section
            key={area.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: areaIndex * 0.04, ease: [0.4, 0, 0.2, 1] }}
            className={cn(area.documentos.length === 0 && "hidden")}
          >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl text-brand-musgo">{area.label}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{area.descricao}</p>
              </div>
              <Badge variant="gold">{area.documentos.length} documento{area.documentos.length === 1 ? "" : "s"}</Badge>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {area.documentos.map((documento, index) => (
                <motion.article
                  key={documento.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Card className="h-full overflow-hidden border-brand-oliva/20 bg-white/75 shadow-none backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-calm">
                    <a href={documento.assetPath} target="_blank" rel="noreferrer" className="block bg-brand-papel/45">
                      <div className="aspect-[16/9] overflow-hidden border-b border-brand-oliva/12">
                        <img
                          src={documento.assetPath}
                          alt={`Fluxograma ${documento.titulo}`}
                          loading="lazy"
                          className="h-full w-full object-contain transition duration-500 hover:scale-[1.015]"
                        />
                      </div>
                    </a>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
                          <FolderOpen className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <Badge variant="outline">{documento.categoria}</Badge>
                            <Badge variant="muted">{documento.setor}</Badge>
                          </div>
                          <CardTitle className="text-lg leading-6">{documento.titulo}</CardTitle>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{documento.resumo}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-tinta">
                          <FileText className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
                          Etapas principais
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {documento.etapas.map((etapa) => (
                            <Badge key={etapa} variant="muted">
                              {etapa}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-brand-oliva/16 bg-brand-papel/55 p-3">
                        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-tinta">
                          <ClipboardCheck className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
                          Tarefas extraídas
                        </p>
                        <ul className="space-y-2">
                          {documento.tarefasSugeridas.map((task) => (
                            <li key={task} className="grid grid-cols-[auto_1fr] gap-2 text-sm leading-6 text-muted-foreground">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-dourado" aria-hidden="true" />
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase text-brand-oliva">
                          <ImageIcon className="h-4 w-4" aria-hidden="true" />
                          PNG anexado
                        </div>
                        <LiquidButton type="button" size="lg" className="h-11 px-5" onClick={() => window.open(documento.assetPath, "_blank", "noopener,noreferrer")}>
                          Abrir fluxograma
                          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                        </LiquidButton>
                      </div>
                    </CardContent>
                  </Card>
                </motion.article>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      {filteredDocs.length === 0 ? (
        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-semibold text-brand-musgo">Nenhum fluxograma encontrado.</p>
            <p className="mt-2 text-sm text-muted-foreground">Ajuste a busca ou escolha outro setor.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
