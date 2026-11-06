import {WORKER,DEFAULT_TASK_DB,DEFAULT_PROJECT_DB,REVIEW_CHECKBOX,PROP,ESTIMATES,nextDay,todayJST,readText,mapTask,mapProject,dailyFilter,request,queryPages,assertSchema,newTaskProperties,setAppDone} from './notion-api.js';
const el=id=>document.getElementById(id);
const ui={
  plan:'\u671d\u306e\u4e88\u5b9a\u3092\u66f4\u65b0',missing:'\u63a5\u7d9a\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ',
  checkbox:'\u65e2\u5b58\u30bf\u30b9\u30afDB\u306b\u300c\u30df\u30cb\u30a2\u30d7\u30ea\u5b8c\u4e86\u300d\u306e\u30c1\u30a7\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u5217\u3092\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044',
  completed:'\u5b8c\u4e86\u78ba\u8a8d\u5f85\u3061',official:'\u6b63\u5f0f\u5b8c\u4e86',
  project:'\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u3092\u5fc5\u305a\u9078\u629e',
  noResults:'\u8a72\u5f53\u3059\u308b\u6848\u4ef6\u304c\u3042\u308a\u307e\u305b\u3093',
  noName:'\u30bf\u30b9\u30af\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044',
  noDuration:'\u6240\u8981\u6642\u9593\u306f5/10/15/20/30/60/120/180\u5206\u304b\u3089\u9078\u629e',
  loaded:'\u4eca\u65e5\u306e\u4e88\u5b9a\u3092\u53cd\u6620\u3057\u307e\u3057\u305f',
  saved:'\u767b\u9332\u3057\u307e\u3057\u305f',
  synced:'\u540c\u671f\u6e08\u307f',
  projectLoading:'\u6848\u4ef6\u3092\u8aad\u307f\u8fbc\u307f\u4e2d...',
};
let currentDate=todayJST();let taskDb=localStorage.getItem('notion_task_db')||DEFAULT_TASK_DB;
let projectDb=localStorage.getItem('notion_proj_db')||DEFAULT_PROJECT_DB;
let items=[];let projects=[];let selectedProject=null;let busy=false;let projectsLoaded=false;let pendingToast;
function notice(msg,error=false){const e=el('toast');e.textContent=msg;e.className='toast show'+(error?' bad':'');clearTimeout(pendingToast);pendingToast=setTimeout(()=>e.className='toast',4300);}
function setSync(s){el('syncStatus').textContent=s;}
function text(tag,cls,value){const x=document.createElement(tag);if(cls)x.className=cls;x.textContent=value;return x;}
function isDone(t){return t.appDone||t.officialDone;}
function displayName(t){return t.name||'('+t.id.slice(0,8)+')';}
function makeRow(t){
  const done=isDone(t);
  const row=document.createElement('div');row.className='task-row'+(done?' finished':'');
  const check=document.createElement('button');check.type='button';check.className='task-check'+(done?' done':'');check.textContent=done?'\u2713':'';
  check.title=done?ui.completed:'\u5b8c\u4e86\u3092\u8a18\u9332';check.disabled=t.officialDone;
  check.addEventListener('click',async()=>{if(busy)return;busy=true;check.disabled=true;try{await setAppDone(t.id,!t.appDone);t.appDone=!t.appDone;render();setSync(ui.synced);}catch(err){notice(ui.missing+err.message,true);check.disabled=false;}finally{busy=false;}});
  const main=text('div','task-content','');
  main.append(text('div','task-title',displayName(t)));
  const meta=text('div','task-meta','');
  if(t.estimateLabel)meta.append(text('span','',t.estimateLabel));
  if(t.limit){const d=text('span',t.limit<currentDate?'overdue':'',`\u671f\u9650 ${t.limit}`);meta.append(d);}
  if(t.officialDone)meta.append(text('span','task-state',ui.official));
  else if(t.appDone)meta.append(text('span','task-state',ui.completed));
  if(!t.projectIds.length)meta.append(text('span','overdue',ui.project));
  main.append(meta);
  if(t.url){const a=text('a','task-open','Notion');a.href=t.url;a.target='_blank';a.rel='noopener noreferrer';main.append(a);}
  row.append(check,main);return row;
}
function render(){
  const open=items.filter(t=>!isDone(t));const done=items.filter(isDone);
  el('openCount').textContent=String(open.length);el('doneCount').textContent=String(done.length);
  el('doneHeaderCount').textContent=String(done.length);
  const sum=open.reduce((v,t)=>v+(t.minutes||0),0);
  el('remainingMinutes').textContent=`${Math.floor(sum/60)}h ${String(sum%60).padStart(2,'0')}m`;
  el('progressBar').style.width=items.length?`${Math.round(100*done.length/items.length)}%`:'0%';
  el('progressLabel').textContent=ui.plan;
  el('dayLabel').textContent=currentDate;
  el('targetDate').value=currentDate;
  el('pendingLabel').textContent=`${open.length} / ${items.length}`;
  const list=el('taskList');list.replaceChildren(...open.map(makeRow));
  el('emptyState').hidden=open.length!==0;
  el('doneList').replaceChildren(...done.map(makeRow));
}
async function refresh(){
  if(busy)return;
  busy=true;el('refresh').disabled=true;setSync('...');
  try{
    taskDb=el('configDbId').value.trim()||taskDb;
    await assertSchema(taskDb);
    const rows=await queryPages(taskDb,dailyFilter(currentDate),{limit:12});
    items=rows.map(mapTask).sort((a,b)=>Number(isDone(a))-Number(isDone(b)) || a.name.localeCompare(b.name,'ja'));
    render();setSync(ui.synced);
  }catch(err){setSync('\u30a8\u30e9\u30fc');el('progressLabel').textContent=ui.missing+err.message;notice(ui.missing+err.message,true);}finally{busy=false;el('refresh').disabled=false;}
}
function changeDate(day){if(!/^\d{4}-\d\d-\d\d$/.test(day))return;currentDate=day;refresh();}
async function loadProjects(){
  if(projectsLoaded)return;
  if(!projectDb){notice(ui.project,true);return;}
  const status='\u30b9\u30c6\u30fc\u30bf\u30b9';
  const filter={or:[{property:status,status:{equals:'\u672a\u7740\u624b'}},{property:status,status:{equals:'\u9032\u884c\u4e2d'}}]};
  try{
    projects=(await queryPages(projectDb,filter,{limit:20})).map(mapProject).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
    projectsLoaded=true;showProjects('');
  }catch(err){notice(ui.missing+err.message,true);}
}
function showProjects(query){
  const r=el('projectResults');r.replaceChildren();
  if(!projectsLoaded){r.append(text('div','status-note',ui.projectLoading));return;}
  if(selectedProject&&query===selectedProject.name)return;
  const matches=projects.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())).slice(0,20);
  if(!matches.length){r.append(text('div','status-note',ui.noResults));return;}
  for(const p of matches){
    const b=text('button','project-result',p.name);b.type='button';
    b.addEventListener('click',()=>{selectedProject=p;el('projectSearch').value=p.name;r.replaceChildren();el('projectSelected').textContent=p.name;});r.append(b);
  }
}
function setUI(){
  // Keep the existing board design, but bind it to the real Task DB and Project relation.
  document.querySelector('#settingsPanel h3').textContent='Notion \u65e2\u5b58\u30bf\u30b9\u30afDB\u3068\u63a5\u7d9a';
  document.querySelector('#settingsPanel .help').textContent='\u65b0\u3057\u3044DB\u306f\u4f5c\u308a\u307e\u305b\u3093\u3002\u65e2\u5b58Workers\u3092\u4f7f\u3044\u3001\u30bf\u30b9\u30afDB\u306e\u5b9f\u884c\u65e5\u6642\u3067\u7d5e\u308a\u8fbc\u307f\u307e\u3059\u3002';
  document.querySelector('label[for=configDbId]').textContent='\u65e2\u5b58\u30bf\u30b9\u30afDB ID';
  el('configDbId').value=taskDb;
  const e=document.createElement('div');e.append(text('label','', '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8DB ID'));
  const input=document.createElement('input');input.id='projectDbConfig';input.value=projectDb;e.append(input);
  el('configMode').closest('label')?.remove();
  const modeLabel=document.querySelector('label[for=configMode]');if(modeLabel)modeLabel.hidden=true;
  el('configMode').hidden=true;
  el('configMode').parentNode.insertBefore(e,el('configMode').nextSibling);
  document.querySelector('.footer p').textContent='\u30c1\u30a7\u30c3\u30af\u306f\u65e2\u5b58\u30bf\u30b9\u30afDB\u306e\u300c\u30df\u30cb\u30a2\u30d7\u30ea\u5b8c\u4e86\u300d\u306b\u3060\u3051\u8a18\u9332\u3002GAS\u5143\u30da\u30fc\u30b8\u3084\u6b63\u5f0f\u30b9\u30c6\u30fc\u30bf\u30b9\u306f\u5909\u66f4\u3057\u307e\u305b\u3093\u3002';
  const form=el('addForm');
  const old=el('caseName').parentNode;old.replaceChildren();
  const label=text('label','',ui.project);label.htmlFor='projectSearch';old.append(label);
  const search=document.createElement('input');search.type='search';search.id='projectSearch';search.placeholder=ui.project;old.append(search);
  const picked=text('div','project-selected','');picked.id='projectSelected';old.append(picked);
  const results=text('div','project-result-list','');results.id='projectResults';old.append(results);
  search.addEventListener('focus',()=>{if(!projectsLoaded)loadProjects();else showProjects(search.value);});
  search.addEventListener('input',()=>{selectedProject=null;picked.textContent='';showProjects(search.value);});
  const help=text('p','help',ui.noDuration);form.insertBefore(help,document.querySelector('#minutes').closest('.two-cols'));
  el('importToggle').hidden=true;el('importPanel').hidden=true;
  el('settingsButton').addEventListener('click',()=>el('settingsPanel').hidden=!el('settingsPanel').hidden);
  el('cancelSettings').addEventListener('click',()=>el('settingsPanel').hidden=true);
  el('settingsPanel').addEventListener('submit',e=>{e.preventDefault();const task=el('configDbId').value.trim(),project=el('projectDbConfig').value.trim();if(!/^[0-9a-f-]{32,36}$/i.test(task)||!/^[0-9a-f-]{32,36}$/i.test(project)){notice('Invalid Notion DB ID',true);return;}taskDb=task;projectDb=project;localStorage.setItem('notion_task_db',taskDb);localStorage.setItem('notion_proj_db',projectDb);projectsLoaded=false;selectedProject=null;el('settingsPanel').hidden=true;refresh();});
  el('refresh').addEventListener('click',refresh);
  el('targetDate').addEventListener('change',e=>changeDate(e.target.value));
  el('prevDay').addEventListener('click',()=>changeDate(nextDay(currentDate,-1)));
  el('nextDay').addEventListener('click',()=>changeDate(nextDay(currentDate)));
  el('todayButton').addEventListener('click',()=>changeDate(todayJST()));
  el('addToggle').addEventListener('click',()=>{el('addForm').hidden=!el('addForm').hidden;if(!el('addForm').hidden)loadProjects();});
  el('cancelAdd').addEventListener('click',()=>el('addForm').hidden=true);
  el('addForm').addEventListener('submit',addTask);
  el('doneToggle').addEventListener('click',()=>{const isClosed=el('doneList').hidden;el('doneList').hidden=!isClosed;el('doneToggle').setAttribute('aria-expanded',String(isClosed));});
  el('copyReport').addEventListener('click',copyReport);
  el('deadline').value='';
  el('taskName').placeholder='\u4f8b\uff1a\u5f01\u8b77\u58eb\u4f1a\u3078\u306e\u5831\u544a';
}
async function addTask(event){
  event.preventDefault();
  if(busy)return;
  const name=el('taskName').value.trim();if(!name){notice(ui.noName,true);return;}
  if(!selectedProject){notice(ui.project,true);return;}
  const mins=el('minutes').value===''?null:Number(el('minutes').value);
  if(mins!==null&&!ESTIMATES.has(mins)){notice(ui.noDuration,true);return;}
  const title=`${selectedProject.name} / ${name}`;
  let properties;
  try{properties=newTaskProperties({name:title,projectId:selectedProject.id,date:currentDate,minutes:mins,deadline:el('deadline').value});}catch(err){notice(err.message,true);return;}
  busy=true;el('saveTask').disabled=true;
  try{await request('/v1/pages','POST',{parent:{database_id:taskDb},properties});
    el('taskName').value='';el('minutes').value='';el('deadline').value='';selectedProject=null;
    el('projectSearch').value='';el('projectSelected').textContent='';el('projectResults').replaceChildren();
    el('addForm').hidden=true;notice(ui.saved);busy=false;await refresh();
  }catch(err){notice(ui.missing+err.message,true);}finally{busy=false;el('saveTask').disabled=false;}
}
async function copyReport(){
  const lines=[currentDate,...items.map(t=>`${isDone(t)?'[x]':'[ ]'} ${t.name}${t.estimateLabel?' ('+t.estimateLabel+')':''}${t.officialDone?' [official]':''}`)];
  try{await navigator.clipboard.writeText(lines.join('\n'));notice('\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f');}catch(err){notice('Clipboard unavailable',true);}
}
setUI();render();refresh();
