create or replace function public.pci_save_entry(p_id uuid,p_pair uuid,p_type text,p_parent uuid,p_expected integer,p_content jsonb,p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.manager_employee_relationships; e public.pci_entries; allowed text[]; section record; field record;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.manager_employee_relationships where id=p_pair and status='active';
 if not found or auth.uid() not in (r.manager_id,r.employee_id) then raise exception 'Unauthorized relationship'; end if;
 if p_type='performance_updates' and auth.uid()<>r.manager_id then raise exception 'Manager only'; end if;
 if p_submit and p_type in ('performance_updates','review_prep_drafts') then raise exception 'Private content cannot be submitted'; end if;
 if p_type='one_on_ones' then allowed:=array['topics','prep','achievements','goals','development_plans','career_conversations','feedback','feedback_requests','actions','wrap'];
 elsif p_type='agenda_topics' then allowed:=array['topics'];
 elsif p_type in ('achievements','goals','development_plans','career_conversations','feedback','feedback_requests','actions','performance_updates','review_prep_drafts') then allowed:=array[p_type];
 else raise exception 'Unknown entry type'; end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>200000 then raise exception 'Invalid content'; end if;
 for section in select key,value from jsonb_each(p_content) loop
   if not(section.key=any(allowed)) or jsonb_typeof(section.value)<>'object' then raise exception 'Invalid section'; end if;
   for field in select key,value from jsonb_each(section.value) loop
     if length(field.key)>50 or jsonb_typeof(field.value)<>'string' or length(field.value#>>'{}')>2000 then raise exception 'Invalid field'; end if;
   end loop;
 end loop;
 if p_submit and not exists(select 1 from jsonb_each(p_content) s,jsonb_each_text(s.value) f where length(btrim(f.value))>0) then raise exception 'Add information before submitting'; end if;
 if p_parent is not null and not exists(select 1 from public.pci_entries where id=p_parent and pair_id=p_pair and state='submitted' and entry_type not in ('performance_updates','review_prep_drafts')) then raise exception 'Invalid conversation'; end if;
 -- Serialize concurrent creates and enforce revision checks for edits.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into e from public.pci_entries where id=p_id for update;
 if found then
   if e.discarded then raise exception 'Draft discarded; restore it before editing'; end if;
   if e.author_id<>auth.uid() or e.pair_id<>p_pair or e.entry_type<>p_type or e.parent_id is distinct from p_parent then raise exception 'Entry mismatch'; end if;
   if e.content=p_content and e.state=(case when p_submit then 'submitted' else 'draft' end) then return to_jsonb(e); end if;
   if e.state='submitted' then raise exception 'Submitted entry is read only; add a response'; end if;
   if p_expected is distinct from e.revision then raise exception 'Entry changed; reopen it'; end if;
   update public.pci_entries set content=p_content,state=case when p_submit then 'submitted' else 'draft' end,
     revision=revision+1,updated_at=now(),submitted_at=case when p_submit then now() else null end where id=p_id returning * into e;
 else
   if p_expected is not null then raise exception 'Entry no longer exists'; end if;
   insert into public.pci_entries(id,pair_id,author_id,entry_type,parent_id,content,state,submitted_at)
     values(p_id,p_pair,auth.uid(),p_type,p_parent,p_content,case when p_submit then 'submitted' else 'draft' end,case when p_submit then now() else null end) returning * into e;
 end if;
 return to_jsonb(e);
end $$;
revoke all on function public.pci_save_entry(uuid,uuid,text,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.pci_save_entry(uuid,uuid,text,uuid,integer,jsonb,boolean) to authenticated;


create function public.pci_combine_entry(p_id uuid,p_expected integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.pci_entries;
begin
 select * into e from public.pci_entries where id=p_id for update;
 if not found or auth.uid() is null or e.author_id<>auth.uid() or e.state<>'draft' or e.discarded then raise exception 'Only your own active draft can be combined'; end if;
 if not exists(select 1 from public.manager_employee_relationships r where r.id=e.pair_id and r.status='active' and auth.uid() in(r.manager_id,r.employee_id)) then raise exception 'Inactive relationship'; end if;
 if e.entry_type in ('performance_updates','review_prep_drafts') then raise exception 'Private notes cannot be shared'; end if;
 if e.revision is distinct from p_expected then raise exception 'Draft changed; reopen it'; end if;
 if e.entry_type='agenda_topics' then update public.pci_entries set content=jsonb_build_object('topics',content->'topics') where id=p_id; end if;
 update public.pci_entries set entry_type='one_on_ones',revision=revision+1,updated_at=now() where id=p_id returning * into e;
 return to_jsonb(e);
end $$;
revoke all on function public.pci_combine_entry(uuid,integer) from public,anon;
grant execute on function public.pci_combine_entry(uuid,integer) to authenticated;
