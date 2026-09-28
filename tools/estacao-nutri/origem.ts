// QUEM PODE FALAR COM A ESTAÇÃO (28/09/2026).
//
// Só as origens do app (lista exata) recebem CORS. O Chrome manda um preflight
// de "rede privada" quando uma página pede algo a 127.0.0.1; a estação responde
// que aceita, mas só para origem permitida. O cabeçalho Host também é conferido,
// para que um site com DNS apontando para 127.0.0.1 não consiga ler a estação.

type Cabecalhos = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function origemPermitida(origin: string | undefined, permitidas: string[]): boolean {
  if (!origin) return false;
  return permitidas.includes(origin);
}

export function cabecalhosCors(cabecalhos: Cabecalhos, permitidas: string[]): Record<string, string> {
  const origin = primeiro(cabecalhos["origin"]);
  const resposta: Record<string, string> = { Vary: "Origin" };
  if (!origemPermitida(origin, permitidas)) return resposta;
  resposta["Access-Control-Allow-Origin"] = origin as string;
  resposta["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
  resposta["Access-Control-Allow-Headers"] = "Content-Type";
  resposta["Access-Control-Max-Age"] = "600";
  if (primeiro(cabecalhos["access-control-request-private-network"]) === "true") {
    resposta["Access-Control-Allow-Private-Network"] = "true";
  }
  return resposta;
}

export function hostPermitido(host: string | undefined, porta: number): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${porta}` || h === `localhost:${porta}`;
}
