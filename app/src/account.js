import {UserError} from './errors.js';

// Local administrator tool. The Slack ID must be checked in the installed workspace.
// It does not expose a public signup endpoint or grant a working relationship.
export async function requestCode(client,email) {
  if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new UserError('Enter a valid email address.');
  const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
  if(error)throw new UserError('The sign-in email could not be sent. Check email configuration or try again later.');
}

export async function finishConnection(client,sessions,config,{email,code,slackUser,displayName}) {
  if(!/^[UW][A-Z0-9]+$/.test(slackUser)||typeof displayName!=='string'||!displayName.trim()||displayName.length>100)throw new UserError('Check the Slack account and display name.');
  if(typeof code!=='string'||!/^\d{6,10}$/.test(code))throw new UserError('Enter the verification code from your email.');
  const result=await client.auth.verifyOtp({email,token:code,type:'email'});
  if(result.error||!result.data?.session)throw new UserError('That code could not be verified. Request a new code and try again.');
  const verified=await client.auth.getUser();
  const user=verified.data?.user;
  if(verified.error||!user?.email_confirmed_at||user.email?.toLowerCase()!==email.toLowerCase())throw new UserError('Account verification failed.');
  const existing=await client.from('profiles').select('id,slack_user_id').eq('id',user.id).maybeSingle();
  if(existing.error)throw new UserError('Account profile could not be checked.');
  if(existing.data && existing.data.slack_user_id!==slackUser)throw new UserError('This account is already linked to a different Slack identity. Ask the administrator to review it.');
  if(!existing.data) {
    const created=await client.from('profiles').insert({id:user.id,slack_user_id:slackUser,email:user.email,display_name:displayName.trim()});
    if(created.error)throw new UserError('Account profile could not be created. Ask the administrator to check the Slack identity.');
  }
  return sessions.connect(config.SLACK_TEAM_ID,slackUser,result.data.session);
}
