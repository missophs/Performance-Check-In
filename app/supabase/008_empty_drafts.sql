-- Empty navigation placeholders are not conversations in the user-facing history.
-- Preserve existing rows and audit history; no deletion is performed.
alter table public.pci_entries add column has_content boolean
generated always as (jsonb_path_exists(content,'$.*.* ? (@ != "")')) stored;
