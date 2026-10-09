export function config(env=process.env) {
  const required=['SLACK_BOT_TOKEN','SLACK_APP_TOKEN','SLACK_TEAM_ID','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'];
  const missing=required.filter(k=>!env[k]?.trim());
  if(missing.length) throw new Error('Missing configuration: '+missing.join(', '));
  if(!env.SLACK_BOT_TOKEN.startsWith('xoxb-') || !env.SLACK_APP_TOKEN.startsWith('xapp-')) throw new Error('Expected Slack bot and app tokens.');
  if(env.SUPABASE_URL !== 'https://jfnjmjgolfjftiwblgbm.supabase.co') throw new Error('Unexpected Supabase project.');
  if(env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a service key.');
  if(env.SUPABASE_PUBLISHABLE_KEY.split('.').length===3) {
    let claims; try { claims=JSON.parse(Buffer.from(env.SUPABASE_PUBLISHABLE_KEY.split('.')[1],'base64url')); } catch { throw new Error('Invalid publishable key.'); }
    if(claims.role!=='anon') throw new Error('Use an anon or publishable key.');
  }
  return {...env};
}
