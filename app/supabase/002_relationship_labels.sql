create function public.pci_relationships()
returns table(id uuid,manager_id uuid,employee_id uuid,status text,partner_name text)
language sql stable security definer set search_path=pg_catalog,public as $$
 select r.id,r.manager_id,r.employee_id,r.status,coalesce(nullif(p.display_name,''),'Unnamed account')
 from public.manager_employee_relationships r
 join public.profiles p on p.id=case when r.manager_id=auth.uid() then r.employee_id else r.manager_id end
 where r.status='active' and auth.uid() in (r.manager_id,r.employee_id)
 order by r.created_at,r.id limit 100;
$$;
revoke all on function public.pci_relationships() from public,anon;
grant execute on function public.pci_relationships() to authenticated;
