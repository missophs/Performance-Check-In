import test from 'node:test';
import assert from 'node:assert/strict';
import {createAI,sharedContext} from '../src/ai.js';
test('allowlist strips private sections, unknown fields, identity and provenance',()=>{
 const result=sharedContext({performance_updates:{observation:'SECRET'},review_prep_drafts:{draft:'SECRET'},wrap:{discussed:'Shared',secret:'SECRET',ai_source:'identity'},unknown:{text:'SECRET'}},'manager');
 assert.deepEqual(result,{wrap:{discussed:'Shared'}});
});
test('provider request is bounded, disables storage and contains only shared context',async()=>{
 let request;const ai=createAI({PCI_AI_ENABLED:'true',PCI_AI_API_KEY:'test',PCI_AI_MODEL:'configured-model'},async(url,options)=>{request={url,options};return {ok:true,json:async()=>({choices:[{message:{content:'Suggestion'}}]})};});
 for(const kind of ['questions','summary','actions'])assert.equal(await ai.generate(kind,{topics:{other:'Discuss progress'},performance_updates:{observation:'SECRET'}},'manager'),'Suggestion');
 assert.equal(request.url,'https://api.openai.com/v1/chat/completions');
 const body=JSON.parse(request.options.body);assert.equal(body.store,false);assert(!JSON.stringify(body).includes('SECRET'));assert(request.options.signal);assert(body.messages[0].content.includes('untrusted'));
});
test('disabled provider, errors, empty and oversized output fail without returning drafts',async()=>{
 await assert.rejects(createAI({}).generate('questions',{},'manager'));
 for(const response of [{ok:false},{ok:true,json:async()=>({choices:[]})},{ok:true,json:async()=>({choices:[{message:{content:'x'.repeat(2001)}}]})}]){
 const ai=createAI({PCI_AI_ENABLED:'true',PCI_AI_API_KEY:'test',PCI_AI_MODEL:'model'},async()=>response);
 await assert.rejects(ai.generate('summary',{},'manager'));
 }
});
