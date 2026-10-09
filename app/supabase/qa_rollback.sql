begin;
do $$
declare m uuid:=gen_random_uuid();e uuid:=gen_random_uuid();o uuid:=gen_random_uuid();p uuid:=gen_random_uuid();
begin
 insert into auth.users(id) values(m),(e),(o);
 insert into public.profiles(id,slack_user_id,display_name) values(m,'QA_MANAGER_'||m,'QA Manager'),(e,'QA_EMPLOYEE_'||e,'QA Employee'),(o,'QA_OUTSIDER_'||o,'QA Outsider');
 insert into public.manager_employee_relationships(id,manager_id,employee_id) values(p,m,e);
 perform set_config('pci.qa.manager',m::text,true);
 perform set_config('pci.qa.employee',e::text,true);
 perform set_config('pci.qa.outsider',o::text,true);
 perform set_config('pci.qa.pair',p::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare pair_id uuid:=current_setting('pci.qa.pair')::uuid;rid uuid;parent_id uuid;expected timestamptz;counted integer;
begin
 if (select count(*) from public.pci_relationships()) <> 1 then raise exception 'Relationship discovery failed'; end if;
 
  rid:=gen_random_uuid();
  perform public.pci_save_record('one_on_ones',rid,pair_id,null,null,'{"focus":"QA check-in","status":"preparing"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','one_on_ones') into expected using rid;
  if expected is null then raise exception 'Missing one_on_ones record'; end if;
  perform public.pci_save_record('one_on_ones',rid,pair_id,null,null,'{"focus":"QA check-in","status":"preparing"}'::jsonb);
  perform public.pci_save_record('one_on_ones',rid,pair_id,null,expected,'{"focus":"QA check-in","status":"preparing"}'::jsonb);
  begin
    perform public.pci_save_record('one_on_ones',rid,pair_id,null,'2000-01-01'::timestamptz,'{"focus":"QA check-in","status":"preparing"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  parent_id:=rid;


  rid:=gen_random_uuid();
  perform public.pci_save_record('agenda_topics',rid,pair_id,parent_id,null,'{"topic":"QA agenda","category":"development","status":"open"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','agenda_topics') into expected using rid;
  if expected is null then raise exception 'Missing agenda_topics record'; end if;
  perform public.pci_save_record('agenda_topics',rid,pair_id,parent_id,null,'{"topic":"QA agenda","category":"development","status":"open"}'::jsonb);
  perform public.pci_save_record('agenda_topics',rid,pair_id,parent_id,expected,'{"topic":"QA agenda","category":"development","status":"open"}'::jsonb);
  begin
    perform public.pci_save_record('agenda_topics',rid,pair_id,parent_id,'2000-01-01'::timestamptz,'{"topic":"QA agenda","category":"development","status":"open"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('achievements',rid,pair_id,null,null,'{"title":"QA achievement"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','achievements') into expected using rid;
  if expected is null then raise exception 'Missing achievements record'; end if;
  perform public.pci_save_record('achievements',rid,pair_id,null,null,'{"title":"QA achievement"}'::jsonb);
  perform public.pci_save_record('achievements',rid,pair_id,null,expected,'{"title":"QA achievement"}'::jsonb);
  begin
    perform public.pci_save_record('achievements',rid,pair_id,null,'2000-01-01'::timestamptz,'{"title":"QA achievement"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('feedback_requests',rid,pair_id,null,null,'{"prompt":"QA request","status":"open"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','feedback_requests') into expected using rid;
  if expected is null then raise exception 'Missing feedback_requests record'; end if;
  perform public.pci_save_record('feedback_requests',rid,pair_id,null,null,'{"prompt":"QA request","status":"open"}'::jsonb);
  perform public.pci_save_record('feedback_requests',rid,pair_id,null,expected,'{"prompt":"QA request","status":"open"}'::jsonb);
  begin
    perform public.pci_save_record('feedback_requests',rid,pair_id,null,'2000-01-01'::timestamptz,'{"prompt":"QA request","status":"open"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('feedback',rid,pair_id,null,null,'{"feedback_text":"QA response"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','feedback') into expected using rid;
  if expected is null then raise exception 'Missing feedback record'; end if;
  perform public.pci_save_record('feedback',rid,pair_id,null,null,'{"feedback_text":"QA response"}'::jsonb);
  perform public.pci_save_record('feedback',rid,pair_id,null,expected,'{"feedback_text":"QA response"}'::jsonb);
  begin
    perform public.pci_save_record('feedback',rid,pair_id,null,'2000-01-01'::timestamptz,'{"feedback_text":"QA response"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('performance_updates',rid,pair_id,null,null,'{"update_text":"QA private manager note"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','performance_updates') into expected using rid;
  if expected is null then raise exception 'Missing performance_updates record'; end if;
  perform public.pci_save_record('performance_updates',rid,pair_id,null,null,'{"update_text":"QA private manager note"}'::jsonb);
  perform public.pci_save_record('performance_updates',rid,pair_id,null,expected,'{"update_text":"QA private manager note"}'::jsonb);
  begin
    perform public.pci_save_record('performance_updates',rid,pair_id,null,'2000-01-01'::timestamptz,'{"update_text":"QA private manager note"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('goals',rid,pair_id,null,null,'{"title":"QA goal","status":"active"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','goals') into expected using rid;
  if expected is null then raise exception 'Missing goals record'; end if;
  perform public.pci_save_record('goals',rid,pair_id,null,null,'{"title":"QA goal","status":"active"}'::jsonb);
  perform public.pci_save_record('goals',rid,pair_id,null,expected,'{"title":"QA goal","status":"active"}'::jsonb);
  begin
    perform public.pci_save_record('goals',rid,pair_id,null,'2000-01-01'::timestamptz,'{"title":"QA goal","status":"active"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('development_plans',rid,pair_id,null,null,'{"title":"QA plan","status":"active"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','development_plans') into expected using rid;
  if expected is null then raise exception 'Missing development_plans record'; end if;
  perform public.pci_save_record('development_plans',rid,pair_id,null,null,'{"title":"QA plan","status":"active"}'::jsonb);
  perform public.pci_save_record('development_plans',rid,pair_id,null,expected,'{"title":"QA plan","status":"active"}'::jsonb);
  begin
    perform public.pci_save_record('development_plans',rid,pair_id,null,'2000-01-01'::timestamptz,'{"title":"QA plan","status":"active"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('career_conversations',rid,pair_id,null,null,'{"shared_summary":"QA shared career notes"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','career_conversations') into expected using rid;
  if expected is null then raise exception 'Missing career_conversations record'; end if;
  perform public.pci_save_record('career_conversations',rid,pair_id,null,null,'{"shared_summary":"QA shared career notes"}'::jsonb);
  perform public.pci_save_record('career_conversations',rid,pair_id,null,expected,'{"shared_summary":"QA shared career notes"}'::jsonb);
  begin
    perform public.pci_save_record('career_conversations',rid,pair_id,null,'2000-01-01'::timestamptz,'{"shared_summary":"QA shared career notes"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('actions',rid,pair_id,null,null,'{"title":"QA action","owner_id":"employee","status":"open"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','actions') into expected using rid;
  if expected is null then raise exception 'Missing actions record'; end if;
  perform public.pci_save_record('actions',rid,pair_id,null,null,'{"title":"QA action","owner_id":"employee","status":"open"}'::jsonb);
  perform public.pci_save_record('actions',rid,pair_id,null,expected,'{"title":"QA action","owner_id":"employee","status":"open"}'::jsonb);
  begin
    perform public.pci_save_record('actions',rid,pair_id,null,'2000-01-01'::timestamptz,'{"title":"QA action","owner_id":"employee","status":"open"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  


  rid:=gen_random_uuid();
  perform public.pci_save_record('review_prep_drafts',rid,pair_id,null,null,'{"draft_text":"QA private draft"}'::jsonb);
  execute format('select updated_at from public.%I where id=$1','review_prep_drafts') into expected using rid;
  if expected is null then raise exception 'Missing review_prep_drafts record'; end if;
  perform public.pci_save_record('review_prep_drafts',rid,pair_id,null,null,'{"draft_text":"QA private draft"}'::jsonb);
  perform public.pci_save_record('review_prep_drafts',rid,pair_id,null,expected,'{"draft_text":"QA private draft"}'::jsonb);
  begin
    perform public.pci_save_record('review_prep_drafts',rid,pair_id,null,'2000-01-01'::timestamptz,'{"draft_text":"QA private draft"}'::jsonb);
    raise exception 'QA expected stale failure';
  exception when others then if sqlerrm='QA expected stale failure' then raise; end if; end;
  

 select count(*) into counted from public.audit_events where actor_id=auth.uid();
 if counted<>22 then raise exception 'Expected 22 atomic audit events, got %',counted; end if;
 if (select count(*) from public.governance_events where actor_id=auth.uid())<>22 then raise exception 'Governance events missing'; end if;
 begin
   perform public.pci_save_record('goals',gen_random_uuid(),pair_id,null,null,'{"title":"bad","manager_id":"forged"}'::jsonb);
   raise exception 'QA expected field rejection';
 exception when others then if sqlerrm='QA expected field rejection' then raise; end if; end;
 begin
   perform public.pci_save_record('agenda_topics',gen_random_uuid(),pair_id,gen_random_uuid(),null,'{"topic":"bad","category":"QA"}'::jsonb);
   raise exception 'QA expected parent rejection';
 exception when others then if sqlerrm='QA expected parent rejection' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('pci.qa.employee'),'role','authenticated')::text,true);
do $$
begin
 if (select count(*) from public.performance_updates)<>0 then raise exception 'Manager notes leaked'; end if;
 if (select count(*) from public.review_prep_drafts)<>0 then raise exception 'Author draft leaked'; end if;
 if (select count(*) from public.goals)<>1 then raise exception 'Shared goal invisible'; end if;
 begin
   perform public.pci_save_record('performance_updates',gen_random_uuid(),current_setting('pci.qa.pair')::uuid,null,null,'{"update_text":"bad"}'::jsonb);
   raise exception 'QA expected manager-only rejection';
 exception when others then if sqlerrm='QA expected manager-only rejection' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('pci.qa.outsider'),'role','authenticated')::text,true);
do $$
begin
 if (select count(*) from public.goals)<>0 or (select count(*) from public.pci_relationships())<>0 then raise exception 'Cross-user data leaked'; end if;
 begin
   perform public.pci_save_record('goals',gen_random_uuid(),current_setting('pci.qa.pair')::uuid,null,null,'{"title":"bad"}'::jsonb);
   raise exception 'QA expected outsider rejection';
 exception when others then if sqlerrm='QA expected outsider rejection' then raise; end if; end;
end $$;
reset role;
select 'PASS: 11 create/update/retry flows, stale conflict rejection, 22 audit+governance events, shared access, private isolation, forged-field/parent/outsider/manager-only denial. All QA fixture writes rolled back.' as result;
rollback;
