const encoder=new TextEncoder();

function fixedTimeEqual(a,b) {
  if(a.length!==b.length)return false;
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  return difference===0;
}

function hexBytes(value) {
  if(!/^[0-9a-f]{64}$/i.test(value))return null;
  return Uint8Array.from(value.match(/../g),part=>parseInt(part,16));
}

export async function verifySlackRequest(request,rawBody,signingSecret,now=Date.now()) {
  const timestamp=request.headers.get('x-slack-request-timestamp');
  const signature=request.headers.get('x-slack-signature');
  if(!/^\d+$/.test(timestamp||'')||!signature?.startsWith('v0=')||Math.abs(now-Number(timestamp)*1000)>300000)return false;
  const received=hexBytes(signature.slice(3));
  if(!received)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(signingSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`v0:${timestamp}:${rawBody}`)));
  return fixedTimeEqual(signed,received);
}

function parseBody(request,rawBody) {
  const type=request.headers.get('content-type')||'';
  if(type.includes('application/json'))return JSON.parse(rawBody);
  if(type.includes('application/x-www-form-urlencoded')) {
    const fields=Object.fromEntries(new URLSearchParams(rawBody));
    return fields.payload?JSON.parse(fields.payload):fields;
  }
  throw new Error('Unsupported content type');
}

function acknowledgement(value) {
  if(value===undefined||value===null)return new Response('',{status:200});
  if(typeof value==='string')return new Response(value,{status:200,headers:{'content-type':'text/plain; charset=utf-8'}});
  return Response.json(value);
}

export async function handleSlackHttp(request,app,signingSecret,context) {
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return new Response('ok');
  if(path!=='/slack/events'||request.method!=='POST')return new Response('Not found',{status:404});
  if(!signingSecret)return new Response('Server unavailable',{status:503});
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>1048576)return new Response('Payload too large',{status:413});
  const rawBody=await request.text();
  if(encoder.encode(rawBody).length>1048576)return new Response('Payload too large',{status:413});
  if(!(await verifySlackRequest(request,rawBody,signingSecret)))return new Response('Unauthorized',{status:401});
  let body;
  try{body=parseBody(request,rawBody);}catch{return new Response('Bad request',{status:400});}
  if(body.ssl_check==='1')return new Response('ok');
  if(body.type==='url_verification')return new Response(body.challenge||'',{status:200});

  let resolveAck;
  let acknowledged=false;
  const response=new Promise(resolve=>{resolveAck=resolve;});
  const ack=value=>{
    if(acknowledged)throw new Error('Request was already acknowledged');
    acknowledged=true;
    resolveAck(acknowledgement(value));
  };
  const event={body,ack,retryNum:Number(request.headers.get('x-slack-retry-num'))||undefined,
    retryReason:request.headers.get('x-slack-retry-reason')||undefined,customProperties:{}};
  const work=Promise.resolve().then(()=>app.processEvent(event)).then(()=>{
    if(!acknowledged)resolveAck(new Response('No acknowledgement',{status:500}));
  }).catch(error=>{
    console.error(JSON.stringify({event:'pci_http_error',type:error?.name||'Error'}));
    if(!acknowledged)resolveAck(new Response('Request failed',{status:500}));
  });
  context.waitUntil(work);
  if(body.type==='event_callback')return new Response('',{status:200});
  let timeout;
  try{return await Promise.race([response,new Promise(resolve=>{timeout=setTimeout(()=>resolve(new Response('Timed out',{status:503})),2700);})]);}
  finally{clearTimeout(timeout);}
}
