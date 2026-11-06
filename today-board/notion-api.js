// Existing Worker is an API relay; never place Notion secrets in this file.
export const WORKER = 'https://notion-proxy.h-miura.workers.dev';
export const DEFAULT_TASK_DB = '1630b8afe6f7806ebec9d07911f3a5cb';
export const DEFAULT_PROJECT_DB = '1640b8afe6f78079b042cc39249270e8';
export const REVIEW_CHECKBOX = '\u30df\u30cb\u30a2\u30d7\u30ea\u5b8c\u4e86';
export const PROP = {
  title: '\u30bf\u30b9\u30af\u540d', project: '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8',
  scheduled: '\u5b9f\u884c\u65e5\u6642', estimate: '\u76ee\u5b89\u6642\u9593',
  deadline: '\u672c\u5f53\u306e\u671f\u9650', status: '\u30b9\u30c6\u30fc\u30bf\u30b9',
  status2: '\u30b9\u30c6\u30fc\u30bf\u30b9 1', choice: '\u9078\u629e',
  projectTitle: '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u540d',
};
export const ESTIMATES = new Map([[5,'5\u5206'],[10,'10\u5206'],[15,'15\u5206'],[20,'20\u5206'],[30,'30\u5206'],[60,'1\u6642\u9593'],[120,'2\u6642\u9593'],[180,'3\u6642\u9593\u4ee5\u4e0a']]);
export function nextDay(date, offset=1) {
  const [y,m,d]=date.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10);
}
export function todayJST() {
  const fmt = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function readText(prop) {
  if (!prop) return '';
  if (prop.type==='title') return (prop.title||[]).map(x=>x.plain_text||x.text?.content||'').join('');
  if (prop.type==='rich_text') return (prop.rich_text||[]).map(x=>x.plain_text||'').join('');
  return '';
}
export function statusOf(p) { return p?.status?.name||p?.select?.name||''; }
export function isOfficialDone(page) {
  const p=page.properties||{};
  return [PROP.status,PROP.status2].some(k=>['\u5b8c\u4e86','\u30a2\u30fc\u30ab\u30a4\u30d6\u6e08\u307f'].includes(statusOf(p[k])));
}
export function mapTask(page) {
  const p=page.properties||{}, project=p[PROP.project]?.relation||[];
  const n=p[PROP.estimate]?.select?.name||'';
  const found=[...ESTIMATES.entries()].find(([k,v])=>v===n);
  return {id:page.id,url:page.url||'',name:readText(p[PROP.title]),date:p[PROP.scheduled]?.date?.start?.slice(0,10)||'',
    limit:p[PROP.deadline]?.date?.start?.slice(0,10)||'',projectIds:project.map(x=>x.id),
    minutes:found?found[0]:null,estimateLabel:n,appDone:!!p[REVIEW_CHECKBOX]?.checkbox,officialDone:isOfficialDone(page)};
}
export function mapProject(page) {
  const p=page.properties||{};
  let name=readText(p[PROP.projectTitle]);
  if(!name) for(const v of Object.values(p)) if(v.type==='title'){name=readText(v);break;}
  return {id:page.id,name};
}
export function dailyFilter(date) {
  return {and:[{property:PROP.scheduled,date:{on_or_after:date}},{property:PROP.scheduled,date:{before:nextDay(date)}},{property:PROP.choice,select:{equals:'\u4eca\u65e5'}}]};
}
export async function request(path,method='GET',body){
  const options={method,headers:{'Content-Type':'application/json'}};
  if(body!==undefined)options.body=JSON.stringify(body);
  for(let tries=0;tries<2;tries++){
    const response=await fetch(WORKER+path,options);
    if(response.status===429 && tries===0){await new Promise(r=>setTimeout(r,1200));continue;}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||data.error||`HTTP ${response.status}`);
    return data;
  }
  throw new Error('Rate limit');
}
export async function queryPages(db,filter,{limit=15}={}) {
  let items=[],cursor;
  for(let i=0;i<limit;i++){
    const body={page_size:100};if(filter)body.filter=filter;
    if(cursor)body.start_cursor=cursor;
    const data=await request(`/v1/databases/${db}/query`,'POST',body);
    items.push(...(data.results||[]));
    if(!data.has_more)return items;
    cursor=data.next_cursor;
    if(!cursor)throw new Error('Pagination cursor missing');
  }
  throw new Error('The project or task list exceeds the safe pagination limit');
}
export async function assertSchema(db){
  const s=await request(`/v1/databases/${db}`);
  const p=s.properties||{};
  if(p[REVIEW_CHECKBOX]?.type!=='checkbox')throw new Error('Required checkbox property is missing or is not a checkbox');
  if(p[PROP.project]?.type!=='relation'||p[PROP.scheduled]?.type!=='date')throw new Error('Existing task DB schema does not match expected properties');
  return p;
}
export function newTaskProperties({name,projectId,date,minutes,deadline}){
  if(!name?.trim()||!projectId||!date)throw new Error('Task name, project and execution date are mandatory');
  const props={
    [PROP.title]:{title:[{text:{content:name.trim().slice(0,1800)}}]},
    [PROP.project]:{relation:[{id:projectId}]},
    [PROP.scheduled]:{date:{start:date}},
    [PROP.status]:{status:{name:'\u81ea\u5206\u306e\u624b\u5143'}},
    [PROP.status2]:{status:{name:'\u672a\u7740\u624b'}},
    [PROP.choice]:{select:{name:'\u4eca\u65e5'}},
    [REVIEW_CHECKBOX]:{checkbox:false},
  };
  if(minutes!==null && minutes!==undefined){
    const n=Number(minutes),value=ESTIMATES.get(n);
    if(!value)throw new Error('Unsupported estimate duration');
    props[PROP.estimate]={select:{name:value}};
  }
  if(deadline)props[PROP.deadline]={date:{start:deadline}};
  return props;
}
export async function setAppDone(taskId,value){
  return request(`/v1/pages/${taskId}`,'PATCH',{properties:{[REVIEW_CHECKBOX]:{checkbox:!!value}}});
}
