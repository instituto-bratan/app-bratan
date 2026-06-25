export type SharePointQueueItem = {
  comprovanteId: string;
  arquivoNome: string;
  queuedAt: string;
  provider: "microsoft_graph_next_phase";
  status: "pendente";
};

export function prepareSharePointDispatch(comprovanteId: string, arquivoNome: string): SharePointQueueItem {
  return {
    comprovanteId,
    arquivoNome,
    queuedAt: new Date().toISOString(),
    provider: "microsoft_graph_next_phase",
    status: "pendente",
  };
}
