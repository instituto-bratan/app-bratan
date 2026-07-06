# Integração SharePoint (Microsoft Graph)

Tudo que é anexado no APP BRATAN entra em uma fila (`sharepoint_dispatch_queue`) com a pasta de destino já calculada. A Edge Function `sharepoint-dispatch` processa a fila e envia os arquivos para o SharePoint. Sem credenciais configuradas, a fila apenas acumula com status `PENDING` — nada se perde.

## Pastas de destino

| Origem no app | Pasta no SharePoint |
| --- | --- |
| Comprovantes | `Financeiro/Comprovantes/AAAA/MM` |
| Estornos | `Financeiro/Estornos/AAAA/MM` |
| Documentos do CRM | `CRM/Documentos` |
| POPs | `Operacional/POPs` |
| Relatórios 360 | `Gestao/Relatorios 360` |

O mapa vive em [src/lib/sharepoint.ts](../src/lib/sharepoint.ts) (`sharePointFolderMap`). Para mudar uma pasta, altere ali — fila e função usam o valor gravado no momento do anexo. O segredo opcional `SHAREPOINT_ROOT_FOLDER` prefixa tudo (ex.: `APP BRATAN/Financeiro/...`).

## Ativação (uma vez, pela coordenação/TI)

Infraestrutura já no ar: a função `sharepoint-dispatch` está publicada e um job
`pg_cron` (`sharepoint-dispatch-15min`) processa a fila a cada 15 minutos. Só
faltam as credenciais.

### 1. Registrar o app no Azure (Entra ID)
1. [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → **App registrations** → **New registration** (nome: `APP BRATAN SharePoint`; o resto no padrão).
2. Em **API permissions** → **Add a permission** → Microsoft Graph → **Application permissions** → `Sites.ReadWrite.All` → depois clique em **Grant admin consent** (exige administrador do Microsoft 365).
3. Em **Certificates & secrets** → **New client secret** — copie o **Value** na hora (some depois).
4. Na página **Overview**, copie **Directory (tenant) ID** e **Application (client) ID**.

### 2. Rodar o ativador

```bash
node scripts/sharepoint-setup.mjs
```

O script valida as credenciais no Graph, localiza o site, lista as bibliotecas
e as pastas existentes, grava os segredos (`supabase secrets set`) e dispara um
teste. Nenhum segredo sai da máquina de quem roda.

### 3. Conferir o mapa de pastas
As pastas listadas pelo script devem casar com o `sharePointFolderMap` em
[src/lib/sharepoint.ts](../src/lib/sharepoint.ts). Ajustou o mapa → `git push`
(o Vercel publica). Itens já enfileirados mantêm a pasta calculada no anexo.

### Teste manual (opcional)

```bash
curl -X POST "https://xdccpfdoxrjbzfdvoonr.supabase.co/functions/v1/sharepoint-dispatch" \
  -H "Authorization: Bearer <ANON_KEY do .env.local>"
```

## Comportamento

- Lotes de 10 itens por execução, mais antigos primeiro.
- As subpastas (ex.: ano/mês) são criadas automaticamente se não existirem; pastas já existentes são reutilizadas.
- Arquivos até 4 MB sobem em chamada única; maiores usam sessão de upload em blocos de 5 MB.
- Conflito de nome no SharePoint: renomeia automaticamente (`conflictBehavior=rename`).
- Erro: volta para `PENDING` e tenta de novo na próxima execução; após 5 tentativas vira `FAILED` com o erro em `last_error`.
- Sucesso: `SENT`, com `sharepoint_item_id` e `sharepoint_web_url` (link direto) gravados.
- RLS: recepção e coordenação enxergam a fila; só coordenação altera; a função usa service role.

## O que já enfileira hoje

- Upload de comprovante (`uploadRemoteComprovante`) → `Financeiro/Comprovantes/AAAA/MM`.

Próximos módulos (anexos do CRM, POPs) devem inserir na mesma fila com o `module` correspondente — a função e as pastas já estão prontas.
