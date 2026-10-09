import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slackFetchAdapter} from '../src/fetch-adapter.js';

test('Slack adapter uses Worker-compatible fetch and parses Slack JSON',async()=>{
  const original=globalThis.fetch;
  let called;
  globalThis.fetch=async (url,options)=>{called={url:String(url),options};return new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}});};
  try{
    const result=await slackFetchAdapter({baseURL:'https://slack.com/api/',url:'auth.test',method:'post',headers:{toJSON:()=>({authorization:'Bearer dummy'})},data:'a=1'});
    assert.equal(called.url,'https://slack.com/api/auth.test');
    assert.equal(called.options.cache,'no-store');
    assert.equal(called.options.body,'a=1');
    assert.deepEqual(result.data,{ok:true});
    assert.equal(result.request.path,'/api/auth.test');
  }finally{globalThis.fetch=original;}
});
