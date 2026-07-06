-- Remove o módulo Vault Obsidian por completo (decisão do Lucas, 06/07/2026).
drop table if exists public.obsidian_export_queue;
drop table if exists public.obsidian_sync_logs;
drop table if exists public.obsidian_vault_settings;
