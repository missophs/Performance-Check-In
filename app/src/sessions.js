import {readFile,lstat,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {UserError} from './errors.js';
async function writeSessions(path,sessions) {
  const temporary=path+'.'+randomUUID()+'.next';
  try {
    await writeFile(temporary,JSON.stringify(sessions),{mode:0o600,flag:'wx'});
    await rename(temporary,path);
  }finally{await unlink(temporary).catch(()=>{});}
}
export class Sessions {
  constructor(config,factory=createClient) {this.config=config;this.factory=factory;this.lock=Promise.resolve();}
  async connect(team,user,session) {
    if(team!==this.config.SLACK_TEAM_ID || !/^[UW][A-Z0-9]+$/.test(user))throw new UserError('Invalid workspace or Slack account.');
    const result=this.lock.then(async()=>{
      const client=this.factory(this.config.SUPABASE_URL,this.config.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const applied=await client.auth.setSession(session);
      if(applied.error || !applied.data?.session)throw new UserError('Account verification failed.');
      const verified=await client.auth.getUser();
      if(verified.error || !verified.data?.user?.email_confirmed_at)throw new UserError('Verify your email before connecting your account.');
      const profile=await client.from('profiles').select('id,slack_user_id').eq('id',verified.data.user.id).single();
      if(profile.error || profile.data?.slack_user_id!==user)throw new UserError('Slack and Supabase account identities do not match.');
      const path=this.config.SESSION_FILE;
      if(!isAbsolute(path))throw new UserError('Account connection setup needs administrator attention.');
      let sessions={};
      try {
        const info=await lstat(path);
        if(!info.isFile()||(info.mode&0o077)!==0)throw new Error('Unsafe permissions');
        sessions=JSON.parse(await readFile(path,'utf8'));
        if(!sessions || Array.isArray(sessions) || typeof sessions!=='object')throw new Error('Invalid session map');
      }catch(error){if(error.code!=='ENOENT')throw new UserError('Account connection setup needs administrator attention.');}
      sessions[team+':'+user]={access_token:applied.data.session.access_token,refresh_token:applied.data.session.refresh_token};
      await writeSessions(path,sessions);
      return {actor:verified.data.user.id};
    });
    this.lock=result.catch(()=>{});
    return result;
  }
  async forUser(team,user) {
    if(team!==this.config.SLACK_TEAM_ID) throw new UserError('This workspace is not authorized.');
    // Serialize refresh and atomic rotation; this deployment runs one process.
    const result=this.lock.then(()=>this.load(team,user));
    this.lock=result.catch(()=>{});
    return result;
  }
  async load(team,user) {
    const path=this.config.SESSION_FILE;
    if(!isAbsolute(path)) throw new UserError('Account connection setup needs administrator attention.');
    let info,sessions;
    try {
      info=await lstat(path);
      if(!info.isFile()||(info.mode&0o077)!==0)throw new Error('Unsafe session file');
      sessions=JSON.parse(await readFile(path,'utf8'));
      if(!sessions||Array.isArray(sessions)||typeof sessions!=='object')throw new Error('Invalid session map');
    } catch(error) {
      if(error.code==='ENOENT')throw new UserError('Your account is not connected yet. Complete account setup before saving check-ins.');
      throw new UserError('Account connection setup needs administrator attention.');
    }
    if(!info.isFile()||(info.mode & 0o077)!==0) throw new UserError('Account connection setup needs administrator attention.');
    const session=sessions[team+':'+user];
    if(!session?.access_token || !session?.refresh_token) throw new UserError('Your account is not connected yet. Complete account setup before saving check-ins.');
    const client=this.factory(this.config.SUPABASE_URL,this.config.SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(10000)})}
    });
    const {data,error}=await client.auth.setSession(session);
    if(error || !data.session) throw new UserError('Your account connection expired. Ask the app administrator to reconnect it.');
    const verified=await client.auth.getUser();
    if(verified.error || !verified.data.user) throw new UserError('Account verification failed.');
    const profile=await client.from('profiles').select('id,slack_user_id').eq('id',verified.data.user.id).single();
    if(profile.error || profile.data?.slack_user_id!==user) throw new UserError('Slack and Supabase account identities do not match.');
    sessions[team+':'+user]={access_token:data.session.access_token,refresh_token:data.session.refresh_token};
    await writeSessions(path,sessions);
    return {client,actor:verified.data.user.id};
  }
}
