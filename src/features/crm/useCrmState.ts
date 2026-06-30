import { useEffect, useState } from "react";
import {
  generateCadenceTasks,
  loadCrmState,
  saveCrmStateWithIntelligence,
  seedCrmState,
  type CrmState,
} from "./crmData";

export function useCrmState() {
  const [state, setState] = useState<CrmState>(() => generateCadenceTasks(loadCrmState()));

  useEffect(() => {
    saveCrmStateWithIntelligence(state);
  }, []);

  function persist(updater: (current: CrmState) => CrmState) {
    setState((current) => {
      const next = generateCadenceTasks(updater(current));
      saveCrmStateWithIntelligence(next);
      return next;
    });
  }

  function reset() {
    setState(seedCrmState);
    saveCrmStateWithIntelligence(seedCrmState);
  }

  return { state, persist, reset, syncMode: "Local + Dashboard 360" };
}
