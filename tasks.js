/* ================= TASKS ================= */
function renderTasks(){
  const el = document.getElementById('view-tasks');
  if(taskView==='cal'){ renderTaskCalendar(el); return; }
  let list = tasks.slice();
  if(taskList!=='all') list = list.filter(t=>t.listId===taskList);
  if(taskFilter==='active') list = list.filter(t=>!t.completed);
  if(taskFilter==='today') list = list.filter(t=>!t.completed && t.dueDate && daysFromToday(t.dueDate)<=0);
  if(taskFilter==='done') list = list.filter(t=>t.completed);
  // 手动序:按 tasks 数组顺序展示(拖拽即改数组),只让已完成沉底
  list.sort((a,b)=> a.completed===b.completed ? 0 : (a.completed?1:-1));
  const scoped = taskList==='all' ? tasks : tasks.filter(t=>t.listId===taskList);
  const active = scoped.filter(t=>!t.completed);
  const counts = {
    all: active.length,
    today: active.filter(t=>t.dueDate && daysFromToday(t.dueDate)<=0).length,
    done: scoped.filter(t=>t.completed).length,
  };

  el.innerHTML = `
    <h1 class="serif">待办清单</h1>
    <div class="sub">把要做的事情，一件件划掉</div>
    <div class="chiprow" id="listchips">
      <button class="chip ${taskList==='all'?'active':''}" data-list="all" style="${taskList==='all'?'border-color:var(--gold);background:var(--gold-soft);color:var(--gold);':''}">全部</button>
      ${LISTS.map(l=>`<button class="chip ${taskList===l.id?'active':''}" data-list="${l.id}" style="${taskList===l.id?`border-color:${l.color};background:${l.color}1A;color:${l.color};`:''}">${l.name}</button>`).join('')}
    </div>
    <div class="box quickadd">
      <div class="row">
        <span style="color:var(--gold);">＋</span>
        <input type="text" id="quickTitle" placeholder="添加一件事，回车即可" />
        <select id="quickList">
          ${LISTS.map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="filtertabs">
      <button data-f="active" class="${taskFilter==='active'?'active':''}">进行中 ${counts.all}</button>
      <button data-f="today" class="${taskFilter==='today'?'active':''}">今天 ${counts.today}</button>
      <button data-f="done" class="${taskFilter==='done'?'active':''}">已完成 ${counts.done}</button>
      <button data-f="all" class="${taskFilter==='all'?'active':''}">全部</button>
      <button id="calViewBtn" style="margin-left:auto;">🗓 日历</button>
    </div>
    <div id="taskList">
      ${list.length===0 ? `<div class="empty">这里空空如也，添加一件事开始吧</div>` : list.map(taskCardHtml).join('')}
    </div>
  `;

  el.querySelectorAll('#listchips .chip').forEach(b=>b.addEventListener('click',()=>{taskList=b.dataset.list;renderTasks();}));
  el.querySelectorAll('.filtertabs button[data-f]').forEach(b=>b.addEventListener('click',()=>{taskFilter=b.dataset.f;renderTasks();}));
  el.querySelector('#calViewBtn').addEventListener('click',()=>{ taskView='cal'; renderTasks(); });
  const qi = el.querySelector('#quickTitle');
  onEnter(qi, addTask);
  const listEl = el.querySelector('#taskList');
  // ponytail: HTML5 DnD 只支持桌面鼠标,手机触屏拖不动;需要时换 pointer events 实现
  let dragId = null;
  listEl.addEventListener('dragstart', e=>{
    const card = e.target.closest('.task-card');
    if(!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
  });
  listEl.addEventListener('dragover', e=>{
    e.preventDefault();
    const card = e.target.closest('.task-card');
    listEl.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    if(card && card.dataset.id!==dragId) card.classList.add('drag-over');
  });
  listEl.addEventListener('dragend', ()=>{
    dragId = null;
    listEl.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
  });
  listEl.addEventListener('drop', e=>{
    e.preventDefault();
    const card = e.target.closest('.task-card');
    if(!card || !dragId || card.dataset.id===dragId) return;
    const fromIdx = tasks.findIndex(t=>t.id===dragId);
    const toIdx = tasks.findIndex(t=>t.id===card.dataset.id);
    const [moved] = tasks.splice(fromIdx,1);
    tasks.splice(toIdx,0,moved); // 移除后原 toIdx 恰好等于:下移=目标后面,上移=目标前面
    persistTasks(); renderTasks();
  });
  listEl.addEventListener('click', handleTaskListClick);
  // 下拉/日期的修改必须走 change:之前放在 click 里,点开下拉那一刻就重渲染,菜单被销毁根本选不了
  listEl.addEventListener('change', e=>{
    const act = e.target.dataset.act;
    const card = e.target.closest('.task-card');
    if(!act || !card) return;
    const t = tasks.find(x=>x.id===card.dataset.id);
    if(act==='editTitle'){
      const v = e.target.value.trim();
      if(v && v!==t.title){ t.title=v; persistTasks(); renderTasks(); }
    }
    if(act==='setList'){ t.listId=e.target.value; persistTasks(); renderTasks(); }
    if(act==='setPriority'){ t.priority=e.target.value; persistTasks(); renderTasks(); }
    if(act==='setDue'){ t.dueDate=e.target.value; persistTasks(); renderTasks(); }
  });
}

function renderTaskCalendar(el){
  const today = todayStr();
  const [y,m] = calCursor.split('-').map(Number);
  const offset = new Date(y, m-1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  let cells = '';
  for(let i=0;i<offset;i++) cells += '<div></div>';
  for(let d=1; d<=dim; d++){
    const key = `${calCursor}-${String(d).padStart(2,'0')}`;
    const dayTasks = tasks.filter(t=>t.dueDate===key);
    const open = dayTasks.filter(t=>!t.completed).length;
    cells += `<button class="cal-cell ${key===today?'today':''} ${key===calSelected?'selected':''}" data-date="${key}">
      <span>${d}</span>${dayTasks.length?`<span class="cal-count ${open?'':'alldone'}">${open||'✓'}</span>`:''}
    </button>`;
  }
  const selTasks = tasks.filter(t=>t.dueDate===calSelected);
  const unscheduled = tasks.filter(t=>!t.completed && !t.dueDate);

  el.innerHTML = `
    <h1 class="serif">待办清单</h1>
    <div class="sub">点一天，安排要做的事</div>
    <div class="filtertabs">
      <button id="backToList">☰ 列表</button>
      <button class="active">🗓 日历</button>
    </div>
    <div class="monthnav">
      <button id="calPrev">‹</button>
      <span>${calCursor}</span>
      <button id="calNext">›</button>
    </div>
    <div class="cal-week">${WEEKDAYS.map(w=>`<span>${w}</span>`).join('')}</div>
    <div class="cal-grid" id="calGrid">${cells}</div>
    <div class="box" id="calDay" style="margin-top:16px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">🗓 ${calSelected}${calSelected===today?' · 今天':''}</div>
      ${selTasks.map(t=>`
        <div class="subtask-row" data-tid="${t.id}">
          <button data-act="calToggle" style="color:${t.completed?'var(--income)':'var(--faint)'};">${t.completed?'✔':'○'}</button>
          <span class="${t.completed?'done':''}">${escapeHtml(t.title)}</span>
          <button data-act="calUnset" title="取消这天的安排" style="color:var(--faint);">✕</button>
        </div>`).join('') || `<div style="font-size:12.5px;color:var(--faint);padding:2px 0 8px;">这一天还没有安排任务</div>`}
      <div class="sub-add">
        <span style="color:var(--gold);">＋</span>
        <input type="text" id="calQuickTitle" placeholder="添加任务到这一天，回车即可" />
      </div>
      ${unscheduled.length?`
      <div class="row" style="margin-top:10px;">
        <select id="calAssign" style="flex:1;font-size:13px;border:1px solid var(--line);border-radius:8px;padding:6px 9px;background:var(--card);color:inherit;">
          <option value="">📌 安排一个未定日期的任务到这天…</option>
          ${unscheduled.map(t=>`<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('')}
        </select>
      </div>`:''}
    </div>
  `;

  el.querySelector('#backToList').addEventListener('click',()=>{ taskView='list'; renderTasks(); });
  el.querySelector('#calPrev').addEventListener('click',()=>shiftCal(-1));
  el.querySelector('#calNext').addEventListener('click',()=>shiftCal(1));
  el.querySelector('#calGrid').addEventListener('click',e=>{
    const c = e.target.closest('.cal-cell');
    if(c){ calSelected = c.dataset.date; renderTasks(); }
  });
  el.querySelector('#calDay').addEventListener('click',e=>{
    const act = e.target.dataset.act;
    if(!act) return;
    const t = tasks.find(x=>x.id===e.target.closest('.subtask-row').dataset.tid);
    if(act==='calToggle') t.completed = !t.completed;
    if(act==='calUnset') t.dueDate = '';
    persistTasks(); renderTasks();
  });
  onEnter(el.querySelector('#calQuickTitle'), ()=>{
    const input = document.getElementById('calQuickTitle');
    const title = input.value.trim();
    if(!title) return;
    tasks.unshift({id:uid(),title,listId:'inbox',priority:'none',dueDate:calSelected,completed:false,subtasks:[],createdAt:Date.now()});
    persistTasks(); renderTasks();
    document.getElementById('calQuickTitle').focus();
  });
  el.querySelector('#calAssign')?.addEventListener('change',e=>{
    const t = tasks.find(x=>x.id===e.target.value);
    if(!t) return;
    t.dueDate = calSelected;
    persistTasks(); renderTasks();
  });
}
function shiftCal(delta){
  const [y,m] = calCursor.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  calCursor = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  calSelected = calCursor===todayStr().slice(0,7) ? todayStr() : calCursor+'-01';
  renderTasks();
}

function taskCardHtml(t){
  const list = LISTS.find(l=>l.id===t.listId)||LISTS[0];
  const pr = PRIORITIES.find(p=>p.id===t.priority);
  const due = dueLabel(t.dueDate);
  const doneCount = t.subtasks.filter(s=>s.done).length;
  const expanded = expandedTask===t.id;
  return `
  <div class="task-card ${t.completed?'done':''}" data-id="${t.id}" draggable="true">
    <div class="task-main">
      <button class="task-check ${t.completed?'done':''}" data-act="toggle">${t.completed?'✔':'○'}</button>
      <div class="task-body" data-act="expand">
        <div class="task-title ${t.completed?'done':''}">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span class="badge" style="background:${list.color}1A;color:${list.color};">${list.name}</span>
          ${t.priority!=='none'?`<span class="meta-text" style="color:${pr.color};">⚑ ${pr.label}</span>`:''}
          ${due?`<span class="meta-text" style="color:${due.tone==='danger'?'var(--expense)':due.tone==='warn'?'var(--flag)':'var(--muted)'};">🗓 ${due.text}</span>`:''}
          ${t.subtasks.length>0?`<span class="meta-text">${doneCount}/${t.subtasks.length} 子任务</span>`:''}
        </div>
      </div>
      <button data-act="expand" style="color:var(--faint);">${expanded?'⌄':'›'}</button>
    </div>
    <div class="task-expand ${expanded?'open':''}">
      <div class="row">
        <form style="display:contents;"><input type="text" data-act="editTitle" value="${escapeHtml(t.title)}" style="flex:1;border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:13px;background:var(--card);color:inherit;" /></form>
      </div>
      <div class="row">
        <select data-act="setList">${LISTS.map(l=>`<option value="${l.id}" ${l.id===t.listId?'selected':''}>${l.name}</option>`).join('')}</select>
        <select data-act="setPriority">${PRIORITIES.map(p=>`<option value="${p.id}" ${p.id===t.priority?'selected':''}>优先级：${p.label}</option>`).join('')}</select>
        <input type="date" data-act="setDue" value="${t.dueDate||''}" />
      </div>
      <div class="row">
        <button class="move-btn" data-act="moveUp">▲ 上移</button>
        <button class="move-btn" data-act="moveDown">▼ 下移</button>
        <button class="del-btn" data-act="delete">🗑 删除</button>
      </div>
      <div class="subtasks">
        ${t.subtasks.map(s=>`
          <div class="subtask-row" data-sid="${s.id}">
            <button data-act="toggleSub" style="color:${s.done?'var(--income)':'var(--faint)'};">${s.done?'✔':'○'}</button>
            <span class="${s.done?'done':''}">${escapeHtml(s.title)}</span>
            <button data-act="removeSub" style="color:var(--faint);">✕</button>
          </div>`).join('')}
        <div class="sub-add">
          <span style="color:var(--muted);">＋</span>
          <form style="display:contents;"><input type="text" data-act="newSub" placeholder="添加子任务" /></form>
        </div>
      </div>
    </div>
  </div>`;
}

function addTask(){
  const input = document.getElementById('quickTitle');
  const title = input.value.trim();
  if(!title) return;
  const listId = document.getElementById('quickList').value;
  tasks.unshift({id:uid(),title,listId,priority:'none',dueDate:'',completed:false,subtasks:[],createdAt:Date.now()});
  persistTasks();
  renderTasks();
  document.getElementById('quickTitle').focus();
}

function handleTaskListClick(e){
  const card = e.target.closest('.task-card');
  if(!card) return;
  const id = card.dataset.id;
  const t = tasks.find(x=>x.id===id);
  const act = e.target.dataset.act;

  if(act==='toggle'){ t.completed=!t.completed; persistTasks(); renderTasks(); return; }
  if(act==='moveUp'||act==='moveDown'){
    // ponytail: 在完整 tasks 数组里和相邻项交换;若相邻项被当前筛选隐藏,需多点几次才见效
    const idx = tasks.findIndex(x=>x.id===id);
    const to = act==='moveUp' ? idx-1 : idx+1;
    if(to<0 || to>=tasks.length) return;
    [tasks[idx],tasks[to]] = [tasks[to],tasks[idx]];
    persistTasks(); renderTasks(); return;
  }
  if(act==='expand'){ expandedTask = expandedTask===id? null : id; renderTasks(); return; }
  if(act==='delete'){ removeWithUndo(()=>tasks, id, persistTasks, renderTasks, '任务'); return; }
  if(act==='toggleSub'){
    const sid = e.target.closest('.subtask-row').dataset.sid;
    const s = t.subtasks.find(x=>x.id===sid); s.done=!s.done;
    persistTasks(); renderTasks(); return;
  }
  if(act==='removeSub'){
    const sid = e.target.closest('.subtask-row').dataset.sid;
    t.subtasks = t.subtasks.filter(x=>x.id!==sid);
    persistTasks(); renderTasks(); return;
  }
}
// subtask add / title edit:动态渲染的输入框各自包在 <form> 里,委托监听 submit(和 onEnter 同理,兼容手机输入法)
document.addEventListener('submit', e=>{
  e.preventDefault();
  const input = e.target.querySelector('input');
  if(input) handleDelegatedEnter(input);
});
function handleDelegatedEnter(target){
  if(!target.dataset) return;
  if(target.dataset.act==='editTitle'){ target.blur(); return; }
  if(target.dataset.act==='newSub'){
    const card = target.closest('.task-card');
    const id = card.dataset.id;
    const t = tasks.find(x=>x.id===id);
    const title = target.value.trim();
    if(!title) return;
    t.subtasks.push({id:uid(),title,done:false});
    persistTasks();
    renderTasks();
    document.querySelector(`.task-card[data-id="${id}"] input[data-act=newSub]`)?.focus();
  }
}
