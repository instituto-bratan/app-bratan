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

### 1. Registrar o app no Azure AD
1. [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → **App registrations** → **New registration** (nome: `APP BRATAN SharePoint`).
2. Em **API permissions** → **Add a permission** → Microsoft Graph → **Application permissions** → `Sites.ReadWrite.All` → **Grant admin consent**.
3. Em **Certificates & secrets** → **New client secret** — guarde o valor.
4. Anote: **Directory (tenant) ID** e **Application (client) ID** (página Overview).

### 2. Descobrir o Drive ID da biblioteca de documentos
Com o token do app (ou no [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer)):

```
GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{nome-do-site}
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
```

Use o `id` do drive "Documentos" (ou da biblioteca desejada).

### 3. Configurar os segredos no Supabase

```bash
supabase secrets set \
  MS_TENANT_ID="..." \
  MS_CLIENT_ID="..." \
  MS_CLIENT_SECRET="..." \
  SHAREPOINT_DRIVE_ID="..." \
  SHAREPOINT_ROOT_FOLDER="APP BRATAN"
```

### 4. Publicar a função e aplicar a migration

```bash
supabase db push
supabase functions deploy sharepoint-dispatch
```

### 5. Agendar o processamento (a cada 15 min)
No SQL Editor do Supabase (pg_cron + pg_net):

```sql
select cron.schedule(
  'sharepoint-dispatch-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sharepoint-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Ou dispare manualmente para testar:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sharepoint-dispatch" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## Comportamento

- Lotes de 10 itens por execução, mais antigos primeiro.
- Arquivos até 4 MB sobem em chamada única; maiores usam sessão de upload em blocos de 5 MB.
- Conflito de nome no SharePoint: renomeia automaticamente (`conflictBehavior=rename`).
- Erro: volta para `PENDING` e tenta de novo na próxima execução; após 5 tentativas vira `FAILED` com o erro em `last_error`.
- Sucesso: `SENT`, com `sharepoint_item_id` e `sharepoint_web_url` (link direto) gravados.
- RLS: recepção e coordenação enxergam a fila; só coordenação altera; a função usa service role.

## O que já enfileira hoje

- Upload de comprovante (`uploadRemoteComprovante`) → `Financeiro/Comprovantes/AAAA/MM`.

Próximos módulos (anexos do CRM, POPs) devem inserir na mesma fila com o `module` correspondente — a função e as pastas já estão prontas.
