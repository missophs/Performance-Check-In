import {readFileSync} from 'node:fs';

const input=process.argv[2];
if(!input)throw new Error('Provide the deployed Worker URL.');
const url=new URL(input);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use a clean HTTPS Worker URL.');
url.pathname='/slack/events';
const endpoint=url.toString();
const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
manifest.settings.socket_mode_enabled=false;
manifest.settings.event_subscriptions.request_url=endpoint;
manifest.settings.interactivity.request_url=endpoint;
manifest.settings.interactivity.message_menu_options_url=endpoint;
for(const command of manifest.features.slash_commands)command.url=endpoint;
process.stdout.write(JSON.stringify(manifest,null,2)+'\n');
