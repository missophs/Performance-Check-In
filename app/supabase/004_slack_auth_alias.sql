-- Reject untrusted pre-registration of an internal Slack Auth alias.
create function public.pci_slack_auth_actor(p_workspace text,p_slack_user text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u auth.users;
begin
 if not exists(select 1 from public.pci_slack_workspaces where workspace_id=p_workspace and enabled) then raise exception 'Workspace not authorized'; end if;
 select * into u from auth.users where email=lower(p_workspace||'.'||p_slack_user)||'@slack.pci.invalid';
 if not found then return null; end if;
 if u.raw_app_meta_data->>'pci_slack_workspace' is distinct from p_workspace or u.raw_app_meta_data->>'pci_slack_user' is distinct from p_slack_user then raise exception 'Untrusted Auth alias'; end if;
 return u.id;
end;
$$;
revoke all on function public.pci_slack_auth_actor(text,text) from public,anon,authenticated;
grant execute on function public.pci_slack_auth_actor(text,text) to service_role;
