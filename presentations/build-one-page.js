const pptxgen = require('pptxgenjs');
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Performance Check-In pilot';
pptx.title = 'Performance Check-In | How the cloud pilot works';
const C = {
  navy:'21163A', purple:'6046A5', lavender:'F0ECFA', green:'087D64', mint:'E4F4EF',
  ink:'20212A', grey:'596070', light:'F5F6F9', white:'FFFFFF', line:'D9D8E2', amber:'FFF0D8'
};
const s = pptx.addSlide();
s.background = {color:C.white};
const text = (v,x,y,w,h,size,color=C.ink,opt={}) => s.addText(v,{
  x,y,w,h,fontFace:'Aptos',fontSize:size,color,margin:0,fit:'shrink',
  breakLine:false,valign:'mid',...opt
});
const card = (x,y,w,h,fill) => s.addShape('roundRect',{
  x,y,w,h,rectRadius:0.15,fill:{color:fill},line:{color:fill,width:0.5}
});

text('PERFORMANCE CHECK-IN',0.58,0.29,8.75,0.52,30,C.navy,{bold:true});
text('Human-led Slack check-ins with optional, editable AI assistance',0.60,0.86,8.7,0.29,15,C.grey);
card(9.56,0.35,3.19,0.58,C.mint);
text('LIVE AI PILOT  •  LIMITED ACCESS',9.75,0.53,2.82,0.19,10.7,C.green,{bold:true,align:'center'});

text('HOW A CHECK-IN MOVES',0.60,1.38,11.8,0.31,18,C.navy,{bold:true});
const steps = [
  {n:'1',title:'Choose',body:'Pick an assigned colleague and the discussion areas needed.'},
  {n:'2',title:'Save a draft',body:'Add answers over time. Saved is private and can be edited.'},
  {n:'3',title:'Send once',body:'Review all chosen areas, then send them together. Private notes stay private.'},
  {n:'4',title:'Read & reply',body:'The recipient gets a Slack message and can respond to each area.'}
];
steps.forEach((p,i)=>{
  const x=0.60+i*3.18;
  card(x,1.82,2.91,1.72,i%2===0?C.lavender:C.mint);
  s.addShape('ellipse',{x:x+0.19,y:2.03,w:0.42,h:0.42,fill:{color:i%2===0?C.purple:C.green},line:{color:i%2===0?C.purple:C.green}});
  text(p.n,x+0.19,2.10,0.42,0.16,13,C.white,{bold:true,align:'center'});
  text(p.title,x+0.72,2.04,1.98,0.34,18,C.navy,{bold:true});
  text(p.body,x+0.20,2.54,2.48,0.76,14,C.ink,{valign:'top'});
});

card(0.60,3.84,6.08,2.43,C.light);
text('WHERE AI FITS',0.85,4.08,5.55,0.33,18,C.navy,{bold:true});
text('NOW  Optional AI suggests questions, drafts summaries and proposes follow-ups from one selected saved entry.',0.85,4.53,5.50,0.47,13.2,C.ink,{valign:'top'});
text('CONTROL  Consent → generate → edit → approve a private draft → review and send. Nothing is sent automatically.',0.85,5.06,5.50,0.49,13.2,C.ink,{valign:'top'});
text('LIMIT  Private notes stay out. Shared fields go to OpenAI only with consent. No AI ratings or employment decisions; people must check facts.',0.85,5.61,5.50,0.47,12.8,C.ink,{valign:'top'});

card(6.91,3.84,5.82,2.43,C.amber);
text('HOW IT RUNS & WHO GOVERNS',7.16,4.08,5.30,0.33,18,C.navy,{bold:true});
const bx=[7.16,8.84,10.81], bw=[1.34,1.60,1.68];
[['Slack',C.lavender],['Cloudflare',C.mint],['Supabase',C.white]].forEach(([label,fill],i)=>{
  card(bx[i],4.57,bw[i],0.44,fill);
  text(label,bx[i],4.70,bw[i],0.18,12.8,C.navy,{bold:true,align:'center'});
});
text('→',8.57,4.69,0.20,0.18,16,C.purple,{bold:true,align:'center'});
text('→',10.53,4.69,0.20,0.18,16,C.purple,{bold:true,align:'center'});
text('Cloudflare keeps it online; Supabase stores records and limits access. Pilot access is one approved pair in one workspace.',7.16,5.18,5.24,0.46,12.9,C.ink,{valign:'top'});
text('Before rollout, IT should own access, onboarding, security, privacy, retention, backups, audit needs and support.',7.16,5.72,5.24,0.43,12.9,C.ink,{valign:'top'});

text('PILOT & NEXT STEPS',0.61,6.62,2.30,0.20,11.5,C.purple,{bold:true,charSpacing:0.6});
text('All three AI modes generated, were edited, approved and submitted in the pilot. Recipient-side AI follow-up and wider rollout checks remain. Bulk roster upload and HRIS sync are not built.',2.83,6.48,9.90,0.58,12.8,C.navy,{bold:true});

pptx.writeFile({fileName:'Performance Check-In One-Page Overview.pptx'});
