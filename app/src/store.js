import {catalog,kind,uuid} from './catalog.js';
export class Store {
  constructor(client,actor) {this.client=client;this.actor=actor;}
  async run(query) {const {data,error}=await query; if(error) throw new Error('Database request failed. Please retry or contact the app administrator.');return data;}
  async pairs() {return this.run(this.client.rpc('pci_relationships'));}
  async searchCheckins(query='') {return this.run(this.client.from('one_on_ones').select('id,focus,scheduled_for').ilike('focus','%'+query.replaceAll('%','').replaceAll('_','')+'%').order('created_at',{ascending:false}).limit(100));}
  async list(table,page=0) {kind(table);if(!Number.isInteger(page)||page<0||page>10000)throw new Error('Invalid page.');
    return this.run(this.client.from(table).select('*').order('created_at',{ascending:false}).order('id').range(page*10,page*10+10));}
  async record(table,id) {kind(table);if(!uuid.test(id))throw new Error('Invalid record.');return this.run(this.client.from(table).select('*').eq('id',id).single());}
  async governance() {return this.run(this.client.from('governance_policies').select('title,version,policy_text').is('retired_at',null).order('effective_at',{ascending:false}).limit(10));}
  async retention() {return this.run(this.client.from('retention_rules').select('data_type,retention_days,deletion_mode').eq('active',true).order('data_type').limit(30));}
  async save(table,meta,fields) {
    kind(table);
    if(!uuid.test(meta.id) || !uuid.test(meta.pair))throw new Error('Invalid record context.');
    const pairs=await this.pairs();const pair=pairs.find(p=>p.id===meta.pair);
    if(!pair || ![pair.manager_id,pair.employee_id].includes(this.actor))throw new Error('This working relationship is no longer active.');
    if(catalog[table].managerOnly && pair.manager_id!==this.actor)throw new Error('Only the manager can save manager notes.');
    // RPC runs as this user's JWT and transactionally applies RLS, conflict checks, and audit triggers.
    return this.run(this.client.rpc('pci_save_record',{p_table:table,p_id:meta.id,p_pair:meta.pair,p_parent:meta.parent||null,p_expected:meta.expected||null,p_fields:fields}));
  }
}
