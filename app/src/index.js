import bolt from '@slack/bolt';
import {config} from './config.js';
import {SlackIdentity} from './slack-identity.js';
import {register} from './handlers.js';
try {
  const c=config();
  const app=new bolt.App({token:c.SLACK_BOT_TOKEN,appToken:c.SLACK_APP_TOKEN,socketMode:true});
  for(const state of ['connected','disconnected','reconnecting'])app.receiver.client.on(state,()=>console.log(JSON.stringify({event:'pci_socket',state})));
  app.receiver.client.on('slack_event',({type})=>console.log(JSON.stringify({event:'pci_socket_delivery',type})));
  app.use(async ({body,next})=>{
    console.log(JSON.stringify({event:'pci_received',type:body.type||'interaction',actions:body.actions?.map(a=>a.action_id),callback:body.view?.callback_id}));
    await next();
  });
  register(app,new SlackIdentity(c),c.SLACK_TEAM_ID);
  await app.start();
  console.log('Performance Check-In connected.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.stop();process.exit(0);});
}catch(error){console.error(error.message?.startsWith('Missing configuration:')?error.message:'Performance Check-In could not start. Check configuration and account connections.');process.exitCode=1;}
