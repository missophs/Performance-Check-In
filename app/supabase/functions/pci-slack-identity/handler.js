const result=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export function identityHandler({admin,publicClient,request=fetch}) {
  async function slack(method,token,params={}) {
    const r=await request('https://slack.com/api/'+method,{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(8000)});
    const data=await r.json();
    if(!r.ok||!data.ok){const error=new Error('Slack verification failed');error.code=data.error==='missing_scope'?'missing_scope':'unavailable';throw error;}
    return data;
  }
  return async req=>{
    if(req.method!=='POST')return result(405,{code:'method_not_allowed'});
    const token=req.headers.get('x-pci-bot-token');
    if(!token?.startsWith('xoxb-'))return result(401,{code:'unauthorized'});
    if(Number(req.headers.get('content-length')||0)>2048)return result(413,{code:'invalid_request'});
    try {
      const raw=await req.text();
      if(raw.length>2048)return result(413,{code:'invalid_request'});
      const body=JSON.parse(raw);
      if(!/^T[A-Z0-9]+$/.test(body.workspace||'')||! /^[UW][A-Z0-9]+$/.test(body.user||''))return result(400,{code:'invalid_request'});
      // A public endpoint authenticates the installed bot against Slack on every
      // exchange. An anon key, user JWT or another app's bot cannot provision.
      const authenticated=await slack('auth.test',token);
      if(authenticated.team_id!==body.workspace)return result(403,{code:'unauthorized'});
      const cfg=await admin.from('pci_slack_workspaces').select('bot_user_id,manager_email,employee_email').eq('workspace_id',body.workspace).eq('enabled',true).single();
      if(cfg.error||cfg.data?.bot_user_id!==authenticated.user_id)return result(403,{code:'unauthorized'});
      const {user}=await slack('users.info',token,{user:body.user});
      if(!user||user.id!==body.user||user.team_id!==body.workspace||user.deleted||user.is_bot||user.is_app_user||user.is_stranger)return result(403,{code:'unauthorized'});
      const email=user.profile?.email?.toLowerCase();
      if(!email)return result(403,{code:'missing_scope'});
      if(![cfg.data.manager_email.toLowerCase(),cfg.data.employee_email.toLowerCase()].includes(email))return result(403,{code:'not_assigned'});
      const mapped=await admin.from('pci_slack_identities').select('profile_id').eq('workspace_id',body.workspace).eq('slack_user_id',body.user).maybeSingle();
      if(mapped.error)throw new Error('Identity lookup failed');
      // Internal Auth aliases represent Slack identity, not verified ownership
      // of a personal email. No message or link is sent to the alias.
      const alias=(body.workspace+'.'+body.user).toLowerCase()+'@slack.pci.invalid';
      const existing=await admin.rpc('pci_slack_auth_actor',{p_workspace:body.workspace,p_slack_user:body.user});
      if(existing.error)throw new Error('Untrusted identity alias');
      let expectedActor=existing.data;
      if(!expectedActor) {
        const created=await admin.auth.admin.createUser({email:alias,password:crypto.randomUUID()+crypto.randomUUID(),email_confirm:true,app_metadata:{pci_slack_workspace:body.workspace,pci_slack_user:body.user}});
        if(created.error||!created.data?.user?.id)throw new Error('Identity account unavailable');
        expectedActor=created.data.user.id;
      }
      const linked=await admin.auth.admin.generateLink({type:'magiclink',email:alias});
      if(linked.error||!linked.data?.properties?.hashed_token||!linked.data?.user?.id)throw new Error('Identity session unavailable');
      const actor=linked.data.user.id;
      if(actor!==expectedActor)return result(403,{code:'unauthorized'});
      if(mapped.data&&mapped.data.profile_id!==actor)return result(403,{code:'unauthorized'});
      const session=await publicClient.auth.verifyOtp({token_hash:linked.data.properties.hashed_token,type:'email'});
      if(session.error||!session.data?.session||session.data.user?.id!==actor)throw new Error('Identity session unavailable');
      const bound=await admin.rpc('pci_bind_slack_identity',{p_workspace:body.workspace,p_slack_user:body.user,p_auth_user:actor,p_email:email,p_name:(user.profile?.display_name||user.real_name||'Workspace member').slice(0,100)});
      if(bound.error)throw new Error('Identity provisioning failed');
      return result(200,{actor,access_token:session.data.session.access_token,expires_at:session.data.session.expires_at});
    }catch(error){return result(error.code==='missing_scope'?403:503,{code:error.code==='missing_scope'?'missing_scope':'unavailable'});}
  };
}
