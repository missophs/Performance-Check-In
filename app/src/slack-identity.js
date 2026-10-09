import {createClient} from '@supabase/supabase-js';
import {UserError} from './errors.js';

// Identity exchange runs server-to-server. Supabase's elevated key remains in
// its Edge Function; record operations here continue to use per-person RLS.
export class SlackIdentity {
  constructor(config,{request=(...args)=>fetch(...args),factory=createClient}={}) {this.config=config;this.request=request;this.factory=factory;this.cache=new Map();this.pending=new Map();}
  async forUser(team,user) {
    if(team!==this.config.SLACK_TEAM_ID||! /^[UW][A-Z0-9]+$/.test(user))throw new UserError('This workspace is not authorized.');
    const key=team+':'+user,cached=this.cache.get(key);
    if(cached&&cached.until>Date.now())return cached.identity;
    if(this.pending.has(key))return this.pending.get(key);
    const promise=this.exchange(team,user,key);
    this.pending.set(key,promise);
    try{return await promise;}finally{this.pending.delete(key);}
  }
  async exchange(team,user,key) {
    let response;
    try {response=await this.request(this.config.SUPABASE_URL+'/functions/v1/pci-slack-identity',{
      method:'POST',headers:{'content-type':'application/json','x-pci-bot-token':this.config.SLACK_BOT_TOKEN},
      body:JSON.stringify({workspace:team,user}),signal:AbortSignal.timeout(15000)
    });}catch {throw new UserError('Slack sign-in is temporarily unavailable. Please try Refresh again.');}
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      if(data.code==='missing_scope')throw new UserError('The administrator needs to approve the app’s updated Slack permissions. No separate account login is required.');
      if(data.code==='not_assigned')throw new UserError('Your administrator has not assigned your manager–employee access yet. No separate account login is required.');
      throw new UserError('Slack sign-in is temporarily unavailable. Please try Refresh again.');
    }
    if(typeof data.access_token!=='string'||!data.actor||!Number.isFinite(data.expires_at))throw new UserError('Slack account verification failed.');
    const client=this.factory(this.config.SUPABASE_URL,this.config.SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:'Bearer '+data.access_token},fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(10000)})}
    });
    const identity={client,actor:data.actor};
    // Recheck Slack membership at most every two minutes. RLS checks every query.
    this.cache.set(key,{identity,until:Math.min(Date.now()+120000,data.expires_at*1000-30000)});
    return identity;
  }
}
