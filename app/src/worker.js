import bolt from '@slack/bolt';
import {SlackIdentity} from './slack-identity.js';
import {register} from './handlers.js';
import {handleSlackHttp} from './slack-http.js';
import {slackFetchAdapter} from './fetch-adapter.js';

class WorkerReceiver {
  init(app){this.app=app;}
  start(){return Promise.resolve();}
  stop(){return Promise.resolve();}
}

let instance;
function application(env) {
  if(instance)return instance;
  for(const key of ['SLACK_BOT_TOKEN','SLACK_SIGNING_SECRET','SLACK_TEAM_ID','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])
    if(!env[key])throw new Error('Missing hosted app configuration');
  if(!env.SLACK_BOT_TOKEN.startsWith('xoxb-')||env.SUPABASE_URL!=='https://jfnjmjgolfjftiwblgbm.supabase.co')
    throw new Error('Unexpected hosted app configuration');
  const receiver=new WorkerReceiver();
  const app=new bolt.App({token:env.SLACK_BOT_TOKEN,receiver,clientOptions:{adapter:slackFetchAdapter}});
  register(app,new SlackIdentity(env),env.SLACK_TEAM_ID,env);
  instance=app;
  return app;
}

export default {
  async fetch(request,env,context) {
    if(new URL(request.url).pathname==='/health')return new Response('ok');
    try{return await handleSlackHttp(request,application(env),env.SLACK_SIGNING_SECRET,context);}
    catch(error){console.error(JSON.stringify({event:'pci_worker_error',type:error?.name||'Error'}));return new Response('Server unavailable',{status:503});}
  }
};
