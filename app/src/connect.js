import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {parseArgs} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {config} from './config.js';
import {Sessions} from './sessions.js';
import {requestCode,finishConnection} from './account.js';
import {userMessage} from './errors.js';

let muted=false;
const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
const prompt=createInterface({input:process.stdin,output,terminal:process.stdin.isTTY});
try {
  const c=config();
  const {values}=parseArgs({options:{'slack-user':{type:'string'},name:{type:'string'}}});
  const slackUser=values['slack-user'],displayName=values.name;
  if(!/^[UW][A-Z0-9]+$/.test(slackUser||'')||!displayName?.trim())throw new Error('Usage');
  console.log('Performance Check-In account connection. Stop the Slack app while connecting accounts.');
  console.log('Use the Slack account ID checked by the workspace administrator. No passwords or tokens are collected in Slack.');
  const email=(await prompt.question('Your email: ')).trim();
  const confirmation=await prompt.question('Send a verification email and create your account if needed? (yes/no): ');
  if(confirmation.trim().toLowerCase()!=='yes')console.log('No email sent.');
  else {
    const client=createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(10000)})}});
    await requestCode(client,email);
    console.log('Email sent. Supabase must be configured to include a verification code in the email template.');
    process.stdout.write('Verification code (hidden): ');
    muted=true;
    const code=(await prompt.question('')).trim();
    muted=false;process.stdout.write('\n');
    await finishConnection(client,new Sessions(c),c,{email,code,slackUser,displayName});
    console.log('Account connected securely. Restart the Slack app and use Refresh. An administrator must configure your manager–employee relationship before you can save check-ins.');
  }
}catch(error){muted=false;console.error(error.message==='Usage'?'Provide --slack-user and --name for the verified Slack account.':userMessage(error));process.exitCode=1;}
finally{prompt.close();}
