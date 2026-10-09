// Slack's Node HTTP adapter is not available in Cloudflare Workers.
export async function slackFetchAdapter(config) {
  const url=new URL(config.url,config.baseURL);
  const headers=config.headers?.toJSON?.()||config.headers||{};
  const response=await fetch(url,{method:(config.method||'post').toUpperCase(),headers,
    body:config.data,signal:config.signal,redirect:'manual',cache:'no-store'});
  const text=await response.text();
  let data=text;
  try{data=JSON.parse(text);}catch{}
  return {data,status:response.status,statusText:response.statusText,
    headers:Object.fromEntries(response.headers),config,request:{path:url.pathname}};
}
