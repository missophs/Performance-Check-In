import {WebClient} from '@slack/web-api';
try {
  if(!process.env.SLACK_BOT_TOKEN?.startsWith('xoxb-'))throw new Error('Bot credential is missing.');
  const client=new WebClient(process.env.SLACK_BOT_TOKEN,{retryConfig:{retries:0},timeout:10000});
  const result=await client.auth.test();
  if(result.team_id!==process.env.SLACK_TEAM_ID)throw new Error('Bot belongs to a different workspace.');
  console.log(JSON.stringify({bot_auth:'PASS',workspace_id:result.team_id,bot_user_id:result.user_id,app_connection:process.env.SLACK_APP_TOKEN?'configured':'missing'}));
}catch(error){console.error(JSON.stringify({bot_auth:'FAILED',reason:error.code||'configuration_or_network'}));process.exitCode=1;}
