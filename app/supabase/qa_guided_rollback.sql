begin;
select set_config('pci.qa_pair',id::text,true),set_config('pci.qa_manager',manager_id::text,true),set_config('pci.qa_employee',employee_id::text,true)
from public.manager_employee_relationships where id='26d9b9e5-449a-401a-b6b9-34970dd56df9' and status='active';
select set_config('pci.qa_id',gen_random_uuid()::text,true),set_config('pci.qa_private',gen_random_uuid()::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('pci.qa_manager'),true);
select public.pci_save_entry(current_setting('pci.qa_id')::uuid,current_setting('pci.qa_pair')::uuid,'one_on_ones',null,null,'{"topics":{"other":"QA rollback only"}}',false);
do $$ begin
 if (select count(*) from public.pci_entries where id=current_setting('pci.qa_id')::uuid)<>1 then raise exception 'Author cannot read draft'; end if;
 begin
   perform public.pci_save_entry(current_setting('pci.qa_id')::uuid,current_setting('pci.qa_pair')::uuid,'one_on_ones',null,99,'{"topics":{"other":"stale"}}',false);
   raise exception 'Stale edit accepted';
 exception when others then if sqlerrm='Stale edit accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pci.qa_employee'),true);
do $$ begin
 if exists(select 1 from public.pci_entries where id=current_setting('pci.qa_id')::uuid) then raise exception 'Draft leaked to recipient'; end if;
 begin
   perform public.pci_save_entry(current_setting('pci.qa_id')::uuid,current_setting('pci.qa_pair')::uuid,'one_on_ones',null,1,'{"topics":{"other":"employee overwrite"}}',true);
   raise exception 'Recipient overwrite accepted';
 exception when others then if sqlerrm='Recipient overwrite accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pci.qa_manager'),true);
select public.pci_save_entry(current_setting('pci.qa_id')::uuid,current_setting('pci.qa_pair')::uuid,'one_on_ones',null,1,'{"topics":{"other":"QA rollback only"}}',true);
select public.pci_save_entry(current_setting('pci.qa_private')::uuid,current_setting('pci.qa_pair')::uuid,'performance_updates',null,null,'{"performance_updates":{"observation":"QA private rollback"}}',false);
do $$ begin
 begin
   perform public.pci_save_entry(current_setting('pci.qa_private')::uuid,current_setting('pci.qa_pair')::uuid,'performance_updates',null,1,'{"performance_updates":{"observation":"QA private rollback"}}',true);
   raise exception 'Private submission accepted';
 exception when others then if sqlerrm='Private submission accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pci.qa_employee'),true);
do $$ begin
 if (select count(*) from public.pci_entries where id=current_setting('pci.qa_id')::uuid and state='submitted')<>1 then raise exception 'Recipient cannot read submission'; end if;
 if exists(select 1 from public.pci_entries where id=current_setting('pci.qa_private')::uuid) then raise exception 'Private manager notes leaked'; end if;
end $$;
select public.pci_save_entry(gen_random_uuid(),current_setting('pci.qa_pair')::uuid,'one_on_ones',current_setting('pci.qa_id')::uuid,null,'{"prep":{"q0":"Employee response"}}',false);
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$ begin
 if exists(select 1 from public.pci_entries where id in(current_setting('pci.qa_id')::uuid,current_setting('pci.qa_private')::uuid)) then raise exception 'Outsider read accepted'; end if;
end $$;
reset role;
select 'PASS: author draft, recipient isolation, stale edit, submit visibility, private manager notes, employee response, outsider isolation; all writes rolled back' as result;
rollback;
