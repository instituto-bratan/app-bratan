import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Archive, CheckCircle2, Download, FileText, FolderTree, History, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canAdministracao } from "@/lib/access";
import { loadInteligencia360State } from "@/features/inteligencia360/inteligencia360Data";
import { useCrmState } from "@/features/crm/useCrmState";
import {
  appendObsidianLog,
  appendObsidianQueueItems,
  buildObsidianExportBundle,
  defaultObsidianConfig,
  downloadBlob,
  exportVaultAsZip,
  loadObsidianConfig,
  loadObsidianLogs,
  loadObsidianQueue,
  saveObsidianConfig,
  testVaultConnection,
  vaultFolders,
  type ObsidianRedactionMode,
  type ObsidianSyncMode,
  type ObsidianVaultConfig,
} from "./obsidianVault";

function FieldRow({ label, children, detail }: { label: string; children: React.ReactNode; detail?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  detail,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-musgo" />
      <span>
        <span className="block text-sm font-semibold text-brand-tinta">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

export function ObsidianVaultPage() {
  const { pessoa } = useAuth();
  const { state: crmState } = useCrmState();
  const [config, setConfig] = useState<ObsidianVaultConfig>(() => loadObsidianConfig());
  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState(() => loadObsidianQueue());
  const [logs, setLogs] = useState(() => loadObsidianLogs());
  const inteligenciaState = useMemo(() => loadInteligencia360State(), []);
  const connection = testVaultConnection(config);

  function updateConfig(next: ObsidianVaultConfig) {
    setConfig(next);
    saveObsidianConfig(next);
  }

  function testConnection() {
    const result = testVaultConnection(config);
    const next = {
      ...config,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: result.status,
      lastSyncError: result.status === "connected" ? "" : result.message,
    };
    updateConfig(next);
    setMessage(result.message);
  }

  function exportZip() {
    const bundle = buildObsidianExportBundle(crmState, inteligenciaState, config, pessoa?.id ?? "preview");
    const zip = exportVaultAsZip(bundle.files);
    downloadBlob(zip.blob, zip.name);
    appendObsidianQueueItems(bundle.queueItems);
    appendObsidianLog(bundle.log);
    setQueue(loadObsidianQueue());
    setLogs(loadObsidianLogs());
    updateConfig({
      ...config,
      lastSyncAt: bundle.log.finishedAt,
      lastSyncStatus: "success",
      lastSyncError: "",
    });
    setMessage(`${bundle.files.length} arquivos Markdown preparados no ZIP do Vault.`);
  }

  function resetStructure() {
    const next = {
      ...defaultObsidianConfig,
      vaultPath: config.vaultPath,
      enabled: true,
      createdAt: config.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateConfig(next);
    setMessage("Estrutura padrão e regras seguras restauradas.");
  }

  return (
    <AccessGate allowed={canAdministracao} label="Vault Obsidian">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="gold">Documentação viva</Badge>
              <h1 className="mt-3 text-4xl leading-tight text-brand-musgo sm:text-5xl">Vault Obsidian</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                O APP continua sendo a fonte da verdade. O Vault recebe snapshots, briefings, playbooks e decisões em Markdown seguro.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={testConnection}>
                <CheckCircle2 className="h-4 w-4" />
                Testar conexão
              </Button>
              <LiquidButton type="button" size="lg" onClick={exportZip}>
                <Download className="h-4 w-4" />
                Exportar ZIP do Vault
              </LiquidButton>
            </div>
          </div>
        </motion.section>

        {message ? (
          <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/45 px-4 py-3 text-sm font-semibold text-brand-tinta">
            {message}
          </div>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-brand-oliva" />
                Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ToggleRow
                label="Ativar Vault Obsidian"
                checked={config.enabled}
                onChange={(enabled) => updateConfig({ ...config, enabled })}
                detail="Libera botões de exportação e prepara os arquivos do Vault."
              />
              <FieldRow label="Modo de sincronização" detail="No navegador, AUTO fica registrado como preferência; a exportação real é manual/ZIP.">
                <select
                  value={config.syncMode}
                  onChange={(event) => updateConfig({ ...config, syncMode: event.target.value as ObsidianSyncMode })}
                  className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                >
                  <option value="MANUAL">Manual</option>
                  <option value="AUTO_DAILY">Auto diário</option>
                  <option value="AUTO_WEEKLY">Auto semanal</option>
                  <option value="ON_DEMAND">Sob demanda</option>
                </select>
              </FieldRow>
              <div className="md:col-span-2">
                <FieldRow label="Caminho do Vault" detail="Não é hardcoded. Em app web, este caminho fica como referência para você descompactar o ZIP no lugar certo.">
                  <Input
                    value={config.vaultPath}
                    onChange={(event) => updateConfig({ ...config, vaultPath: event.target.value })}
                    placeholder="/Users/lucas/.../Instituto Bratan Vault"
                  />
                </FieldRow>
              </div>
              <FieldRow label="Redação padrão" detail="PARTIAL é o padrão seguro: mostra contexto sem expor excesso.">
                <select
                  value={config.defaultRedactionMode}
                  onChange={(event) => updateConfig({ ...config, defaultRedactionMode: event.target.value as ObsidianRedactionMode })}
                  className="h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                >
                  <option value="STRICT">Strict</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="NONE">None</option>
                </select>
              </FieldRow>
              <div className="rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Status</p>
                <p className="mt-1 text-sm font-semibold text-brand-tinta">{connection.status}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{connection.message}</p>
              </div>
              <ToggleRow
                label="Exportar nomes de pacientes"
                checked={config.exportPatientNames}
                onChange={(exportPatientNames) => updateConfig({ ...config, exportPatientNames })}
                detail="Quando desativado, usa apenas referência protegida."
              />
              <ToggleRow
                label="Exportar telefone/WhatsApp"
                checked={config.exportContactPhone}
                onChange={(exportContactPhone) => updateConfig({ ...config, exportContactPhone })}
                detail="Por padrão fica oculto para reduzir exposição."
              />
              <ToggleRow
                label="Exportar valores financeiros"
                checked={config.exportFinancialValues}
                onChange={(exportFinancialValues) => updateConfig({ ...config, exportFinancialValues })}
                detail="Desativado por padrão. Dashboards saem com valores ocultos."
              />
              <ToggleRow
                label="Exportar dados sensíveis"
                checked={config.exportSensitiveData}
                onChange={(exportSensitiveData) => updateConfig({ ...config, exportSensitiveData })}
                detail="Use apenas se a coordenação decidir explicitamente."
              />
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={resetStructure}>
                  <RotateCcw className="h-4 w-4" />
                  Restaurar estrutura padrão
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            <Card className="border-brand-dourado/35 bg-brand-creme/35 shadow-none">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-brand-musgo" />
                  <div>
                    <p className="font-semibold text-brand-tinta">Segurança por padrão</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      CPF, documentos, exames detalhados, dados bancários e conteúdo médico profundo não entram nos arquivos gerados.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Archive className="h-5 w-5 text-brand-oliva" />
                  Última sincronização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase text-brand-oliva">Status</p>
                  <p className="mt-1 text-sm font-semibold text-brand-tinta">{config.lastSyncStatus}</p>
                </div>
                <div className="rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
                  <p className="text-xs font-semibold uppercase text-brand-oliva">Última data</p>
                  <p className="mt-1 text-sm font-semibold text-brand-tinta">{config.lastSyncAt || "Ainda não sincronizado"}</p>
                </div>
                {config.lastSyncError ? <p className="text-sm leading-6 text-destructive">{config.lastSyncError}</p> : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-dourado" />
                Estrutura padrão do Vault
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {vaultFolders.map((folder) => (
                  <div key={folder} className="rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2 text-sm text-brand-tinta">
                    Instituto Bratan/{folder}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-brand-oliva" />
                Histórico
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {logs.length ? (
                logs.slice(0, 8).map((log) => (
                  <div key={log.id} className="rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={log.status === "DONE" ? "muted" : "gold"}>{log.status}</Badge>
                      <span className="text-xs text-muted-foreground">{log.filesCreated} arquivos</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{log.finishedAt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">Nenhuma sincronização registrada ainda.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand-oliva" />
              Fila de exportação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-3 py-2">Entidade</th>
                    <th className="px-3 py-2">Destino</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Tentativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {queue.length ? (
                    queue.slice(0, 20).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3">{item.entityType}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{item.targetPath}</td>
                        <td className="px-3 py-3"><Badge variant={item.status === "DONE" ? "muted" : "gold"}>{item.status}</Badge></td>
                        <td className="px-3 py-3">{item.attempts}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-muted-foreground">A fila aparece depois da primeira exportação ZIP.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
