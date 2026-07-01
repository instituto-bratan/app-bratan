import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  appendRemoteObsidianExport,
  getRemoteObsidianVaultConfig,
  listRemoteObsidianQueue,
  listRemoteObsidianSyncLogs,
  saveRemoteObsidianVaultConfig,
} from "@/lib/remoteData";
import {
  downloadBlob,
  exportVaultAsZip,
  loadObsidianConfig,
  loadObsidianLogs,
  loadObsidianQueue,
  recordObsidianFilesExport,
  saveObsidianConfig,
  type ObsidianVaultConfig,
  type ObsidianVaultFile,
} from "./obsidianVault";

export function useObsidianVault() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [config, setConfig] = useState<ObsidianVaultConfig>(() => loadObsidianConfig());
  const [queue, setQueue] = useState(() => loadObsidianQueue());
  const [logs, setLogs] = useState(() => loadObsidianLogs());

  const remoteConfigQuery = useQuery({
    queryKey: ["obsidian-vault-config"],
    queryFn: getRemoteObsidianVaultConfig,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const remoteQueueQuery = useQuery({
    queryKey: ["obsidian-vault-queue"],
    queryFn: () => listRemoteObsidianQueue(),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const remoteLogsQuery = useQuery({
    queryKey: ["obsidian-vault-logs"],
    queryFn: () => listRemoteObsidianSyncLogs(),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const saveConfigMutation = useMutation({
    mutationFn: saveRemoteObsidianVaultConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["obsidian-vault-config"] });
    },
  });

  useEffect(() => {
    if (!remoteConfigQuery.data) return;
    setConfig(remoteConfigQuery.data);
    saveObsidianConfig(remoteConfigQuery.data);
  }, [remoteConfigQuery.data]);

  useEffect(() => {
    if (remoteQueueQuery.data) setQueue(remoteQueueQuery.data);
  }, [remoteQueueQuery.data]);

  useEffect(() => {
    if (remoteLogsQuery.data) setLogs(remoteLogsQuery.data);
  }, [remoteLogsQuery.data]);

  function updateConfig(next: ObsidianVaultConfig) {
    setConfig(next);
    saveObsidianConfig(next);
    if (useRemote) {
      void saveConfigMutation.mutateAsync(next).catch((error) => {
        console.warn("Configuração do Vault não sincronizou com o Supabase.", error);
      });
    }
  }

  function recordExport(files: ObsidianVaultFile[], syncType: string) {
    const record = recordObsidianFilesExport(files, syncType, pessoa?.id ?? "preview");
    setQueue(loadObsidianQueue());
    setLogs(loadObsidianLogs());
    if (useRemote) {
      void appendRemoteObsidianExport(record)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["obsidian-vault-queue"] });
          void queryClient.invalidateQueries({ queryKey: ["obsidian-vault-logs"] });
        })
        .catch((error) => {
          console.warn("Exportação do Vault não sincronizou com o Supabase.", error);
        });
    }
    return record;
  }

  function downloadFiles(files: ObsidianVaultFile[], fileName: string, syncType: string) {
    const zip = exportVaultAsZip(files, fileName);
    downloadBlob(zip.blob, zip.name);
    return recordExport(files, syncType);
  }

  return {
    config,
    updateConfig,
    queue,
    logs,
    recordExport,
    downloadFiles,
    syncMode: useRemote ? "Supabase + local" : "Somente local",
    isSyncing:
      remoteConfigQuery.isFetching ||
      remoteQueueQuery.isFetching ||
      remoteLogsQuery.isFetching ||
      saveConfigMutation.isPending,
    syncError: remoteConfigQuery.error || saveConfigMutation.error,
  };
}
