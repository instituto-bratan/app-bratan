// Os números da casca para quem está dentro dela (08/10/2026): a tela Avisos
// mostra a MESMA lista que o sino conta — lida uma vez só, pela casca.
import { createContext, useContext } from "react";
import type { ContadoresDaCasca } from "./useContadores";

const vazio: ContadoresDaCasca = {
  decisoes: { pedidos: 0, contas: 0, fechamentos: 0, total: 0 },
  notasSemCpf: [],
  veNotas: false,
  carregandoNotas: false,
  exemplo: false,
  valor: () => 0,
};

export const ContextoDosContadores = createContext<ContadoresDaCasca>(vazio);

export function useContadoresDaTela(): ContadoresDaCasca {
  return useContext(ContextoDosContadores);
}
