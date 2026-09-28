# Segurança dos dados clínicos — 28/09/2026

Levantamento feito para planejar o módulo de nutrição. Nada aqui foi aplicado
em produção nem publicado. Tudo está no branch `seguranca/rls-dados-clinicos`,
sem commit, esperando revisão.

## 1. O que foi confirmado no código

| # | Achado | Onde | Confirmado |
|---|--------|------|------------|
| 1 | `paciente_medicao`, `paciente_consulta` e `paciente_acesso` com RLS `using (true)` para qualquer logado | `202609150006_portal_paciente.sql:25-27, 46, 66-70`. Nenhuma migration seguinte mexe nas políticas (`202609210003` só adiciona colunas) | Sim |
| 2 | Senha do portal em SHA-256 com sal | `supabase/functions/portal-paciente/index.ts:27-30` (`hashDaSenha`), usada nas linhas 173 e 199 | Sim. O sal é o `id` da linha |
| 3a | `contato_documento` sem migration | usada em `src/lib/remote/compliance.ts:95-113`, `focus-nfse/index.ts:279` e até na migration `202609220005_nfse_lote.sql:47` | Sim |
| 3b | `crm_deals.program_milestones_done` sem migration | `src/lib/remoteData.ts:2185, 2416` | Sim. O commit `1b5695b` diz "jsonb default []" |
| 3c | `paciente_acesso.login/senha_hash/tentativas/bloqueado_ate` sem migration | `portal-paciente/index.ts:164-199` | Sim, e **também `senha_criada_em`** (linha 199). O commit `c345b68` cita um índice único em `lower(login)` |

O levantamento não pegou três coisas, que pioram o quadro:

- **Os pontos 1 e 2 se somam.** Como o `select` era `using (true)` sobre a tabela inteira,
  qualquer colaborador podia ler `senha_hash` e `id` (o sal) pela API e tentar
  quebrar a senha fora do sistema. O app nunca pede essas colunas, mas a API entregava.
- **Qualquer logado podia se passar pelo paciente.** A política de update
  (`paciente_acesso_revogar`) aceitava qualquer mudança. Bastava gravar um
  `sessao_hash` conhecido na linha e abrir o portal como o paciente, fotos incluídas.
- **Qualquer logado podia apagar de verdade** medições e consultas (`for all`
  inclui DELETE). O app só faz exclusão lógica.

## 2. Quem precisa de cada tabela

Levantado nas telas que usam (`src/lib/remote/portalPaciente.ts`,
`src/features/portal/PortalDoPacienteCard.tsx`,
`src/features/programa/ProgramaAcompanhamentoPage.tsx`,
`src/features/programa/ImportarInBodyCard.tsx`):

| Tabela | Uso na tela | Lê | Grava | Exceção em Acessos |
|--------|-------------|----|-------|--------------------|
| `paciente_medicao` | curva, semáforo, pesagem da semana, importação InBody, lançar/apagar na ficha | equipe clínica | equipe clínica (só origem ENFERMAGEM/IMPORTACAO; sem DELETE) | tela "Plano de Acompanhamento": VER lê, EDITAR grava |
| `paciente_consulta` | "Próxima consulta" na ficha | equipe clínica + recepção | idem (sem DELETE) | tela "CRM" |
| `paciente_acesso` | gerar link, revogar, "acesso ativo" | equipe clínica + recepção, **só as colunas sem hash e sem login** | inserir link; update **só para revogar** | tela "CRM" |
| todas | portal do paciente | Edge Function `portal-paciente` com chave de serviço (não passa pela RLS; nada muda) | | |

Equipe clínica = coordenação (dr_daniel, ceo, gestor, gestor_financeiro,
secretaria_executiva) + dr_daniel (escrito à parte) + enfermeira + nutricionista.
Perdem acesso: **limpeza e marketing**. A recepção deixa de ver bioimpedância.

**Decisão a confirmar:** a recepção não estava na lista pedida
(enfermeira, nutricionista, dr_daniel, coordenação). Entrou em consulta e
acesso porque o código diz que é ela quem gera o link e digita a consulta
("Peça um novo para a recepção", comentário da migration de 15/09). Sem ela,
a recepção perde essas duas tarefas. Para tirar, basta apagar a linha
`has_cargo(_user, 'recepcionista')` nas duas funções `can_paciente_portal_*`
e a condição igual em `src/lib/access.ts`.

A exceção de Acessos **só soma** acesso, igual a `fin_pdca_status`
(`202607270001`). Um "OCULTO" não tira a enfermagem do dado clínico.

## 3. O que mudou

| Arquivo | O quê |
|---------|-------|
| `supabase/migrations/202609280001_reconciliacao_schema_producao.sql` | **Reconciliação.** Registra os três objetos do item 3. Em produção tem de ser no-op: `add column if not exists`, índice checado pela expressão (não pelo nome), e `contato_documento` (tabela, RLS e políticas) só nasce se a tabela não existir. Tem blocos `CONFERIR` onde o commit não diz o detalhe |
| `supabase/migrations/202609280002_rls_dados_clinicos.sql` | Funções `is_equipe_clinica`, `can_paciente_medicao_read/write` e `can_paciente_portal_read/write` (sobre `has_cargo`, `is_coordenacao` e `module_access_override`), nove políticas no lugar das seis abertas e privilégios explícitos: sem DELETE, e em `paciente_acesso` só por coluna. As chamadas vão em `(select ...)` para rodar uma vez por consulta, e não uma vez por linha |
| `src/lib/access.ts` | `isEquipeClinica`, `canVerMedicoes`, `canGravarMedicoes`, `canVerPortalPaciente` e `canGravarPortalPaciente`, espelho da RLS |
| `src/features/crm/CrmContactProfilePage.tsx` | O card "Portal do paciente" só aparece para quem a RLS libera |
| `src/features/portal/PortalDoPacienteCard.tsx` | Quem só lê não vê botões de gravar. A seção de bioimpedância fica com a equipe clínica (antes, a recepção veria a lista vazia e um "apagar" que não apagaria nada, porque UPDATE barrado pela RLS não dá erro) |
| `src/features/programa/ProgramaAcompanhamentoPage.tsx` | A consulta de medições só sai para quem pode ler. O importador InBody e o bloco "Pesagem da semana" só aparecem para quem pode. O semáforo não muda: sem medição, a regra das 2 semanas já é pulada (`riscoAdesao.ts:100`) |
| `tests/rls-dados-clinicos.test.mjs` | 13 testes. Refaz as migrations em ordem e garante que nenhum `(true)` sobra nas três tabelas, sem DELETE nem FOR ALL. Confere que app e banco têm a mesma lista de cargos, que as colunas liberadas cobrem o que a tela pede (sem hash), que o que o código usa está em migration e que a reconciliação não tem `drop` nem nada fora da guarda. Tirando a migration nova, 8 dos 13 falham |
| `docs/seguranca-2026-09-28/` | `conferir-producao.sql` (só leitura, o "antes"), `verificar-depois.sql`, `reverter-rls-dados-clinicos.sql` e `proposta-bcrypt-portal.sql` |

Resultados: `npm test` deu 926 de 926 (913 antes + 13 novos) e `npm run build`
passou. Foi usado `npm` porque o `pnpm` não está instalado nesta máquina; os
scripts são os mesmos do `package.json`.

## 4. O que precisa de validação manual

1. **O SQL não foi executado em nenhum Postgres.** A máquina não tem Postgres
   nem Docker. Os testes leem o texto das migrations; não rodam o SQL. O
   ensaio do passo 4 abaixo, com `begin … rollback`, cobre isso.
2. **Reconciliação × produção:** comparar os blocos 1, 3 e 4 de
   `conferir-producao.sql` com os `CONFERIR` da `202609280001`. Pontos
   principais: se `program_milestones_done` e `tentativas` são not null, qual é
   a chave de `contato_documento` e o texto real das políticas dela. Se
   `contato_documento` estiver com RLS desligada (bloco 2), isso é um achado à
   parte, e a reconciliação de propósito não corrige.
3. **Lista de pessoas:** o bloco 6 mostra quem ganha e quem perde acesso,
   pessoa a pessoa, incluindo as exceções de Acessos. Precisa do ok do Lucas.
4. **Teste nas telas, com uma conta de cada perfil**, depois de aplicar:
   - enfermagem e nutrição: ficha com o card completo; Plano de
     Acompanhamento com pesagem da semana e importação do InBody; lançar e
     apagar medição.
   - recepção: card sem bioimpedância; gerar link, revogar, registrar
     consulta e marcar como realizada.
   - limpeza e marketing: ficha sem o card; Plano sem pesagem nem importação.
   - coordenação: tudo, mais "Últimos acessos do paciente".
   - portal do paciente (`/meu`): entrar por link e por senha, mandar
     pesagem, responder consulta. Não deve mudar nada, porque passa pela
     chave de serviço.
5. **Outros clientes:** conferir se alguma ferramenta fora do app (planilha,
   n8n, BI) lê essas tabelas com login de colaborador. Se ler, passa a
   receber vazio.
6. **Tempo de carga** do Plano de Acompanhamento e do importador InBody
   (lê o histórico inteiro): deve ficar igual.

## 5. Passo a passo para aplicar em produção

As duas migrations **não alteram nenhuma linha de dado**: mudam só políticas,
privilégios e funções, e a reconciliação é no-op em produção. Mesmo assim:

**1. Backup (antes de tudo)**
   - Supabase → Database → Backups: confirmar que existe backup de hoje (ou o
     ponto de restauração do PITR, se estiver ligado) e anotar o horário.
   - Rodar `conferir-producao.sql` no SQL Editor, bloco a bloco, e salvar cada
     resultado em CSV. É o registro exato de políticas e privilégios de antes.
   - Opcional: se precisar da cópia dos dados das tabelas, usar
     `pg_dump "$URL_DO_BANCO" --data-only -t public.paciente_medicao -t public.paciente_consulta -t public.paciente_acesso -t public.contato_documento -t public.crm_deals -f backup-2026-09-28.sql`.
     O arquivo tem dado de saúde, CPF e hash de senha: guardar fora do
     repositório, criptografado, e apagar quando não precisar mais.

**2. Ajustar a reconciliação** ao que o passo 1 mostrou (itens `CONFERIR`).

**3. Publicar o front primeiro** (merge do branch → Vercel). Antes da RLS
   ele é seguro: só esconde, de quem vai perder acesso, o que o banco ainda
   entrega. Na ordem inversa, a recepção veria por algumas horas a
   bioimpedância vazia e erro ao lançar.

**4. Ensaio sem gravar**, no SQL Editor:
   ```sql
   begin;
   set local lock_timeout = '5s';
   -- colar aqui 202609280001_reconciliacao_schema_producao.sql
   -- colar aqui 202609280002_rls_dados_clinicos.sql
   -- colar aqui os blocos 1 e 2 de verificar-depois.sql
   rollback;
   ```
   Se der erro, nada ficou gravado. Corrigir e repetir.

**5. Aplicar.** Escolher um caminho:
   - Com `select … from supabase_migrations.schema_migrations` (bloco 7) em dia,
     rode `supabase db push --linked --dry-run`. Se ele listar só as duas
     migrations novas, rode `supabase db push --linked`.
   - Se o histórico não estiver em dia, use o SQL Editor, com o mesmo bloco
     do passo 4 terminando em `commit;` no lugar de `rollback;`. Depois,
     registre as duas no histórico:
     `supabase migration repair --status applied 202609280001 202609280002 --linked`.
     As duas migrations podem rodar de novo sem efeito, então um push
     repetido por engano não estraga nada.

**6. Verificar:** `verificar-depois.sql` completo (blocos 3 a 5 com `auth_id`
   reais de limpeza, recepção e enfermagem) e o roteiro de telas do item 4.4.

**7. Se uma tela parar:** primeiro corrigir a função, por exemplo incluindo
   um cargo em `can_paciente_portal_read` com `create or replace function`, sem
   reabrir nada. Só em emergência rodar `reverter-rls-dados-clinicos.sql`, que
   **reabre o buraco**.

## 6. Proposta: senha do portal em bcrypt (não aplicada)

SQL em `proposta-bcrypt-portal.sql`, fora de `supabase/migrations` de propósito.

- `portal_senha_definir(acesso, login, senha)` grava login e senha de uma vez,
  com `crypt(senha, gen_salt('bf', 10))`.
- `portal_senha_conferir(acesso, senha)` devolve só verdadeiro ou falso. Se o
  hash ainda for o SHA-256 antigo e a senha bater, regrava em bcrypt na mesma
  transação (rehash no próximo login).
- Só a chave de serviço executa (`revoke` para anon e authenticated). O hash
  nunca sai do banco, no mesmo modelo de `conferir_senha_gestor`
  (`202609100001`).
- Custo 10 (o padrão do `gen_salt('bf')` é 6). O bcrypt usa só 72 bytes,
  então a função recusa senha maior.
- Os hashes de token do link e de sessão ficam em SHA-256: são 256 bits
  aleatórios, e aí o SHA-256 é o certo.

Mudança na Edge Function `portal-paciente` (proposta, **não feita**):

```ts
// entrar_senha: a comparação sai da função e vai para o banco
-    if (await hashDaSenha(senha, acesso.id) !== acesso.senha_hash) {
+    const { data: confere, error: erroConferir } = await client.rpc("portal_senha_conferir", { _acesso_id: acesso.id, _senha: senha });
+    if (erroConferir) return json({ ok: false, error: "Não consegui conferir a senha agora. Tente de novo." });
+    if (confere !== true) {

// criar_senha: login e senha de uma vez, já em bcrypt
+    if (new TextEncoder().encode(senha).length > 72) return json({ ok: false, error: "A senha pode ter no máximo 72 caracteres." });
-    const { error } = await client.from("paciente_acesso").update({ login, senha_hash: await hashDaSenha(senha, acesso.id), senha_criada_em: agora(), tentativas: 0, bloqueado_ate: null }).eq("id", acesso.id);
+    const { error } = await client.rpc("portal_senha_definir", { _acesso_id: acesso.id, _login: login, _senha: senha });

// e apagar hashDaSenha()
```

Ordem: (1) criar as duas funções, o que não muda nada porque ninguém as
chama ainda; (2) publicar a função `portal-paciente` nova; (3) acompanhar em
`paciente_portal_evento` se "senha errada" subiu; (4) ver no bloco 8 de
`conferir-producao.sql` os hashes migrando; (5) uns 90 dias depois (a
duração da sessão), zerar os hashes antigos que sobrarem, com o `update`
comentado no fim do arquivo.

**Atenção: a volta não é simples.** Depois que alguém entra e ganha hash em
bcrypt, a função antiga não reconhece mais essa senha. Se precisar voltar
atrás, essas pessoas criam senha nova pelo link. O melhor é corrigir para a
frente.

A senha em texto passa como parâmetro da RPC, como já acontece hoje com
`conferir_senha_gestor`. Vale conferir se o projeto não tem log de statements
ou pgaudit ligado, porque aí o parâmetro iria para o log.

## 7. O que continua em aberto

- **Quem gera o link vê o portal como o paciente**, inclusive as fotos que o
  portal promete que "só você vê". A RLS nova limita isso à equipe clínica e
  à recepção, mas não fecha o risco. Próximo passo sugerido: o link passar a
  ser gerado pela Edge Function, com registro de quem gerou.
- A reconciliação cobre só os três itens do levantamento. Uma comparação
  completa do schema (`supabase db diff --linked`, que precisa de Docker)
  pode achar mais coisa.
