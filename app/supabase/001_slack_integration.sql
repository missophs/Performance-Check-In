-- Additive integration: existing policies, retention rules, and governance remain intact.
create or replace function public.pci_audit_write() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, metadata)
  values(auth.uid(),lower(TG_OP),TG_TABLE_NAME,new.id,jsonb_build_object('source','performance_check_in','human_authored',true));
  insert into public.governance_events(actor_id,event_type,entity_type,entity_id,metadata)
  values(auth.uid(),'human_record_saved',TG_TABLE_NAME,new.id,jsonb_build_object('ai_used',false));
  return new;
end $$;
revoke all on function public.pci_audit_write() from public,anon,authenticated;

create or replace function public.pci_save_record(
 p_table text,p_id uuid,p_pair uuid,p_parent uuid,p_expected timestamptz,p_fields jsonb
) returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
 pair public.manager_employee_relationships;
 allowed text[];
 payload jsonb;
 existing jsonb;
 cols text;
 vals text;
 result uuid;
 author_col text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 case p_table
 when 'one_on_ones' then allowed := array['focus','scheduled_for','status','discussed_summary','agreed_summary','revisit_summary','start_feedback','stop_feedback','continue_feedback','follow_up_on'];
when 'agenda_topics' then allowed := array['topic','category','why_it_matters','status','note'];
when 'achievements' then allowed := array['title','details','occurred_on'];
when 'feedback_requests' then allowed := array['prompt','status'];
when 'feedback' then allowed := array['feedback_text'];
when 'performance_updates' then allowed := array['update_text','occurred_on'];
when 'goals' then allowed := array['title','description','status','target_date','progress_note'];
when 'development_plans' then allowed := array['title','development_goal','plan_text','status','target_date'];
when 'career_conversations' then allowed := array['employee_notes','manager_notes','shared_summary','conversation_date'];
when 'actions' then allowed := array['title','details','owner_id','due_date','status'];
when 'review_prep_drafts' then allowed := array['draft_text'];
 else raise exception 'Unknown record type';
 end case;
 if p_fields is null or jsonb_typeof(p_fields) <> 'object'
 or exists(select 1 from jsonb_object_keys(p_fields) k where not(k=any(allowed)))
 then raise exception 'Invalid fields'; end if;
 select * into pair from public.manager_employee_relationships where id=p_pair and status='active';
 if not found or auth.uid() not in (pair.manager_id,pair.employee_id) then raise exception 'Unauthorized relationship'; end if;
 if p_table='performance_updates' and auth.uid()<>pair.manager_id then raise exception 'Manager only'; end if;
 if p_table='agenda_topics' then
   if not exists(select 1 from public.one_on_ones where id=p_parent and manager_id=pair.manager_id and employee_id=pair.employee_id) then raise exception 'Invalid parent'; end if;
 end if;
 payload:=p_fields;
 if p_table='actions' then
   if payload->>'owner_id' not in ('manager','employee') or payload->>'owner_id' is null then raise exception 'Invalid owner'; end if;
   payload:=jsonb_set(payload,'{owner_id}',to_jsonb(case when payload->>'owner_id'='manager' then pair.manager_id else pair.employee_id end));
   if payload->>'status'='done' then payload:=payload||jsonb_build_object('completed_at',now());
   else payload:=payload||jsonb_build_object('completed_at',null); end if;
 end if;
 if p_table='one_on_ones' then
   if payload->>'status'='closed' then payload:=payload||jsonb_build_object('closed_at',now());
   else payload:=payload||jsonb_build_object('closed_at',null); end if;
 end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_table) into existing using p_id;
 if existing is not null then
   if p_expected is null then
     -- Retry after a committed create: only this author's exact submitted content is idempotent.
     author_col:=case when p_table='feedback_requests' then 'requested_by' when p_table in ('feedback','review_prep_drafts') then 'author_id' else 'created_by' end;
     if existing->>author_col<>auth.uid()::text or existing->>'manager_id' is distinct from (case when p_table='agenda_topics' then null else pair.manager_id::text end)
       or existing->>'employee_id' is distinct from (case when p_table='agenda_topics' then null else pair.employee_id::text end)
       or (p_table='agenda_topics' and existing->>'one_on_one_id'<>p_parent::text)
       or not (existing @> (payload - 'completed_at' - 'closed_at'))
     then raise exception 'Record exists; reopen it'; end if;
     return p_id;
   end if;
   if (existing->>'updated_at')::timestamptz <> p_expected then raise exception 'Record changed; reopen it'; end if;
   if p_table='agenda_topics' then
     if existing->>'one_on_one_id'<>p_parent::text then raise exception 'Parent mismatch'; end if;
   elsif existing->>'manager_id'<>pair.manager_id::text or existing->>'employee_id'<>pair.employee_id::text then raise exception 'Pair mismatch'; end if;
   payload:=payload||jsonb_build_object('updated_at',now());
   select string_agg(format('%I = x.%I',k,k),',') into cols from jsonb_object_keys(payload) k;
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) x where t.id=$2 returning t.id',p_table,cols,p_table) into result using payload,p_id;
   if result is null then raise exception 'Write not permitted'; end if;
   return result;
 end if;
 if p_expected is not null then raise exception 'Record no longer exists'; end if;
 payload:=payload||jsonb_build_object('id',p_id);
 if p_table='agenda_topics' then payload:=payload||jsonb_build_object('one_on_one_id',p_parent);
 else payload:=payload||jsonb_build_object('manager_id',pair.manager_id,'employee_id',pair.employee_id); end if;
 author_col:=case when p_table='feedback_requests' then 'requested_by' when p_table in ('feedback','review_prep_drafts') then 'author_id' else 'created_by' end;
 payload:=payload||jsonb_build_object(author_col,auth.uid());
 select string_agg(format('%I',k),','),string_agg(format('x.%I',k),',') into cols,vals from jsonb_object_keys(payload) k;
 execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x returning id',p_table,cols,vals,p_table) into result using payload;
 return result;
end $$;
revoke all on function public.pci_save_record(text,uuid,uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.pci_save_record(text,uuid,uuid,uuid,timestamptz,jsonb) to authenticated;
create trigger pci_audit_one_on_ones after insert or update on public.one_on_ones for each row execute function public.pci_audit_write();
create trigger pci_audit_agenda_topics after insert or update on public.agenda_topics for each row execute function public.pci_audit_write();
create trigger pci_audit_achievements after insert or update on public.achievements for each row execute function public.pci_audit_write();
create trigger pci_audit_feedback_requests after insert or update on public.feedback_requests for each row execute function public.pci_audit_write();
create trigger pci_audit_feedback after insert or update on public.feedback for each row execute function public.pci_audit_write();
create trigger pci_audit_performance_updates after insert or update on public.performance_updates for each row execute function public.pci_audit_write();
create trigger pci_audit_goals after insert or update on public.goals for each row execute function public.pci_audit_write();
create trigger pci_audit_development_plans after insert or update on public.development_plans for each row execute function public.pci_audit_write();
create trigger pci_audit_career_conversations after insert or update on public.career_conversations for each row execute function public.pci_audit_write();
create trigger pci_audit_actions after insert or update on public.actions for each row execute function public.pci_audit_write();
create trigger pci_audit_review_prep_drafts after insert or update on public.review_prep_drafts for each row execute function public.pci_audit_write();
