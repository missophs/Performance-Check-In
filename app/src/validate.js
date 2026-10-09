// Offline validator for the exact Block Kit subset emitted by this app.
// Live Slack rendering and API acceptance still require workspace credentials.
export function validate(view) {
  const fail=m=>{throw new Error(m);};
  if(!['home','modal'].includes(view.type))fail('Unsupported surface');
  if(!Array.isArray(view.blocks)||view.blocks.length>100)fail('Block limit');
  if(view.type==='modal') {
    for(const key of ['title','submit','close'])if(view[key]&&(view[key].type!=='plain_text'||view[key].text.length>24))fail(key+' limit');
    if(view.callback_id?.length>255||view.private_metadata?.length>3000)fail('View metadata limit');
  }
  const blocks=new Set(),actions=new Set();
  function text(o,max=3000,markdown=false) {if(!(o?.type==='plain_text'||(markdown&&o?.type==='mrkdwn'))||!o.text||o.text.length>max)fail('Text object');}
  function element(e) {
    if(!e.action_id||e.action_id.length>255)fail('Action ID');
    if(['button','external_select','static_select'].includes(e.type)&&e.action_id!=='value')actions.add(e.action_id);
    if(e.type==='button') {text(e.text,75);if(!e.value||e.value.length>2000)fail('Button value');}
    else if(['static_select','checkboxes'].includes(e.type)) {
      if(!e.options?.length||e.options.length>(e.type==='checkboxes'?10:100))fail('Options limit');
      for(const o of e.options){text(o.text,75);if(!o.value||o.value.length>150)fail('Option value');}
      if(e.initial_options?.some(selected=>!e.options.some(o=>o.value===selected.value)))fail('Invalid initial options');
      if(e.initial_option&&!e.options.some(o=>o.value===e.initial_option.value))fail('Invalid initial option');
    } else if(e.type==='external_select'){text(e.placeholder,150);}
    else if(e.type==='plain_text_input'){if(e.initial_value?.length>e.max_length||e.max_length>3000)fail('Input limit');}
    else if(!['datepicker','datetimepicker'].includes(e.type))fail('Unsupported element');
  }
  for(const b of view.blocks) {
    if(b.block_id){if(blocks.has(b.block_id)||b.block_id.length>255)fail('Duplicate block');blocks.add(b.block_id);}
    if(b.type==='header')text(b.text,150);
    else if(b.type==='section'){text(b.text,3000,true);if(b.accessory)element(b.accessory);}
    else if(b.type==='context'){if(!b.elements?.length||b.elements.length>10)fail('Context limit');b.elements.forEach(e=>text(e,3000,true));}
    else if(b.type==='divider'){}
    else if(b.type==='actions'){if(!b.elements?.length||b.elements.length>25)fail('Actions limit');if(new Set(b.elements.map(e=>e.action_id)).size!==b.elements.length)fail('Duplicate action ID in block');b.elements.forEach(element);}
    else if(b.type==='input'){if(view.type!=='modal')fail('Input surface');text(b.label,2000);element(b.element);}
    else fail('Unsupported block');
  }
  return [...actions];
}
