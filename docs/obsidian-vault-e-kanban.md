# Vault Obsidian e Kanban Comercial

## Vault Obsidian

O APP BRATAN continua sendo a fonte da verdade. O Vault Obsidian é uma camada de documentação viva para snapshots, briefings, playbooks, templates e auditoria operacional.

Como configurar:

1. Acesse `/configuracoes/obsidian`.
2. Ative o Vault.
3. Informe o caminho de referência da pasta do Obsidian.
4. Mantenha a redação como `PARTIAL` para uso normal.
5. Use `Exportar ZIP do Vault` e descompacte o arquivo na pasta do seu Vault.

Como funciona a segurança:

- CPF, documentos, exames detalhados, dados bancários e conteúdo médico profundo não são exportados.
- Telefones e valores financeiros ficam ocultos por padrão.
- O modo `STRICT` exporta apenas referências seguras.
- O modo `NONE` deve ser usado somente por coordenação/admin com decisão explícita.

O que pode ser exportado:

- Snapshot do Dashboard 360.
- Briefing diário do CRM.
- Resumo seguro de contatos/perfis.
- Resumo do Kanban e negociações.
- Playbooks de cadências.
- Templates de mensagem.
- Relatório de qualidade dos dados.

## Kanban Comercial

O Kanban agora tem:

- Modo tela cheia.
- Visualização por seções: `Ver tudo`, `Captação & Consulta`, `Negociação & Recuperação`.
- Densidade `Compacto`, `Confortável` e `Executivo`.
- Cards mais largos, com próxima ação, temperatura, origem, objeção e alerta de dados incompletos.
- Drawer lateral para mover etapa sem sair da tela.
- Exportação do resumo do Kanban para Obsidian.

Regra de uso:

- Nenhum deal aberto deve ficar sem próxima ação.
- Ao mover uma etapa, o app valida campos obrigatórios e cria tarefas/cadências para o setor correto.
- O Dashboard 360 apenas consolida; a origem do dado continua no CRM, cadências, tarefas e módulos operacionais.

## Próxima sprint sugerida

- Persistir configurações do Vault no Supabase em vez de apenas local/ZIP.
- Criar rotina backend para escrita direta no filesystem quando houver ambiente com permissão.
- Adicionar exportação individual em mais módulos operacionais.
- Criar busca global dedicada do CRM no topo do app.
