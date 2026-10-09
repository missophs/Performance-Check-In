-- Identity provisioning is restricted to the server-only service role.
create table public.pci_slack_workspaces (
 workspace_id text primary key,
 bot_user_id text not null,
 manager_email text not null,
 employee_email text not null,
 enabled boolean not null default true,
 check (lower(manager_email) <> lower(employee_email))
);
create table public.pci_slack_identities (
 workspace_id text not null references public.pci_slack_workspaces(workspace_id),
 slack_user_id text not null,
 profile_id uuid not null unique references public.profiles(id),
 role text not null check (role in ('manager','employee')),
 primary key (workspace_id,slack_user_id),
 unique(workspace_id,role)
);
alter table public.pci_slack_workspaces enable row level security;
alter table public.pci_slack_identities enable row level security;
revoke all on public.pci_slack_workspaces,public.pci_slack_identities from anon,authenticated;
grant all on public.pci_slack_workspaces,public.pci_slack_identities to service_role;

create function public.pci_bind_slack_identity(p_workspace text,p_slack_user text,p_auth_user uuid,p_email text,p_name text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg public.pci_slack_workspaces; chosen_role text; existing_id uuid; manager uuid; employee uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('pci_identity:'||p_workspace,0));
 select * into cfg from public.pci_slack_workspaces where workspace_id=p_workspace and enabled;
 if not found then raise exception 'Workspace not authorized'; end if;
 chosen_role:=case when lower(p_email)=lower(cfg.manager_email) then 'manager' when lower(p_email)=lower(cfg.employee_email) then 'employee' end;
 if chosen_role is null then raise exception 'Account not assigned'; end if;
 select profile_id into existing_id from public.pci_slack_identities where workspace_id=p_workspace and slack_user_id=p_slack_user;
 if found and existing_id<>p_auth_user then raise exception 'Identity conflict'; end if;
 insert into public.profiles(id,slack_user_id,email,display_name)
 values(p_auth_user,p_slack_user,p_email,left(p_name,100)) on conflict(id) do nothing;
 if not exists(select 1 from public.profiles where id=p_auth_user and slack_user_id=p_slack_user) then raise exception 'Profile identity conflict'; end if;
 insert into public.pci_slack_identities(workspace_id,slack_user_id,profile_id,role)
 values(p_workspace,p_slack_user,p_auth_user,chosen_role) on conflict(workspace_id,slack_user_id) do nothing;
 select profile_id into manager from public.pci_slack_identities where workspace_id=p_workspace and role='manager';
 select profile_id into employee from public.pci_slack_identities where workspace_id=p_workspace and role='employee';
 -- Provision the explicitly approved pair once; never reactivate a revoked pair.
 if manager is not null and employee is not null and not exists(select 1 from public.manager_employee_relationships where manager_id=manager and employee_id=employee) then
  insert into public.manager_employee_relationships(manager_id,employee_id,status) values(manager,employee,'active');
  insert into public.audit_events(actor_id,action,entity_type,metadata) values(p_auth_user,'slack_relationship_provisioned','manager_employee_relationships',jsonb_build_object('source','approved_workspace_setup'));
  insert into public.governance_events(actor_id,event_type,entity_type,metadata) values(p_auth_user,'slack_relationship_provisioned','manager_employee_relationships',jsonb_build_object('source','approved_workspace_setup'));
 end if;
 return p_auth_user;
end;
$$;
revoke all on function public.pci_bind_slack_identity(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pci_bind_slack_identity(text,text,uuid,text,text) to service_role;
