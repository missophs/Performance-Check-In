export const catalog = {
  one_on_ones: {label:'1:1 check-ins', fields:['focus','scheduled_for','status','discussed_summary','agreed_summary','revisit_summary','start_feedback','stop_feedback','continue_feedback','follow_up_on']},
  agenda_topics: {label:'Agenda topics', parent:'one_on_ones', fields:['topic','category','why_it_matters','status','note']},
  achievements: {label:'Achievements', fields:['title','details','occurred_on']},
  feedback_requests: {label:'Feedback requests', fields:['prompt','status']},
  feedback: {label:'Feedback', fields:['feedback_text']},
  performance_updates: {label:'Manager notes', managerOnly:true, fields:['update_text','occurred_on']},
  goals: {label:'Goals', fields:['title','description','status','target_date','progress_note']},
  development_plans: {label:'Development plans', fields:['title','development_goal','plan_text','status','target_date']},
  career_conversations: {label:'Career conversations', fields:['employee_notes','manager_notes','shared_summary','conversation_date']},
  actions: {label:'Follow-up actions', fields:['title','details','owner_id','due_date','status']},
  review_prep_drafts: {label:'Private review drafts', private:true, fields:['draft_text']}
};
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const title = s => s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function kind(name) { if (!Object.hasOwn(catalog,name)) throw new Error('Invalid category.'); return catalog[name]; }
