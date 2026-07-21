/* ================= OVERVIEW ================= */
function renderOverview(){
  const el = document.getElementById('view-overview');
  const hasChart = typeof Chart !== 'undefined'; // 本地 chart.umd.min.js 加载失败时降级为文本
  const today = todayStr();
  const todayTasks = tasks.filter(t=> t.dueDate===today || (!t.completed && t.dueDate && daysFromToday(t.dueDate)<0));
  const upcomingTasks = tasks.filter(t=> !t.completed && t.dueDate && daysFromToday(t.dueDate)>0 && daysFromToday(t.dueDate)<=7)
    .sort((a,b)=> a.dueDate<b.dueDate ? -1 : 1);
  const todayDone = todayTasks.filter(t=>t.completed).length;
  const todayTxns = txns.filter(t=>t.date===today);
  const todayNet = todayTxns.reduce((s,t)=> s + (t.type==='income'?t.amount:-t.amount),0);

  const thisMonth = today.slice(0,7);
  const monthTxns = txns.filter(t=>t.date.slice(0,7)===thisMonth);
  const monthIncome = monthTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const monthExpense = monthTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  const catMap={};
  monthTxns.filter(t=>t.type==='expense').forEach(t=>{ catMap[t.category]=(catMap[t.category]||0)+t.amount; });
  const categoryData = Object.entries(catMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);

  const last7=[];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = localDateStr(d);
    const dayTxns = txns.filter(t=>t.date===key);
    last7.push({
      day:key.slice(5),
      income: dayTxns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
      expense: dayTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0),
    });
  }

  const activeCount = tasks.filter(t=>!t.completed).length;
  const completedCount = tasks.filter(t=>t.completed).length;
  const gadgetsTotal = gadgets.reduce((s,g)=>s+g.price,0);
  const gadgetsCount = gadgets.length;
  const dueHabitsToday = habits.filter(h=>isHabitDue(h, today));
  const doneHabitsToday = dueHabitsToday.filter(h=>isChecked(h, today)).length;
  const last14 = [];
  for(let i=13;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); last14.push(localDateStr(d)); }

  el.innerHTML = `
    <h1 class="serif" id="ovTitle" style="user-select:none;">总览</h1>
    <div class="sub">今天的进度与花销，一眼看清</div>

    <div class="ticket mono">
      <div class="hdr"><span>${today} · 今日小票</span><span>LIJI</span></div>
      <div class="body">
        <span>待办完成 ${todayDone}/${todayTasks.length}</span>
        <span style="color:${todayNet>=0?'#8FBE9E':'#E6A08F'};">净收支 ${todayNet>=0?'+':'-'}RM ${fmtMoney(Math.abs(todayNet))}</span>
      </div>
      ${dueHabitsToday.length>0?`<div class="body" style="margin-top:4px;"><span>习惯打卡 ${doneHabitsToday}/${dueHabitsToday.length}</span><span></span></div>`:''}
    </div>

    <div class="card chart-card" id="todayGlance">
      <h3>今日速览</h3>
      <div class="glance-sec">待办 · ${todayDone}/${todayTasks.length}</div>
      ${todayTasks.length? todayTasks.map(t=>`
        <button class="glance-row" data-act="ovTask" data-id="${t.id}">
          <span class="gc" style="color:${t.completed?'var(--income)':'var(--faint)'};">${t.completed?'✔':'○'}</span>
          <span class="gt ${t.completed?'done':''}">${escapeHtml(t.title)}</span>
          ${t.dueDate && daysFromToday(t.dueDate)<0?`<span style="font-size:11px;color:var(--expense);flex-shrink:0;">逾期</span>`:''}
        </button>`).join('') : `<div style="font-size:12.5px;color:var(--faint);padding:6px 0;">今天没有到期的任务</div>`}
      ${upcomingTasks.length?`<div class="glance-sec" style="margin-top:14px;">近期截止</div>`+upcomingTasks.map(t=>`
        <button class="glance-row" data-act="ovTask" data-id="${t.id}">
          <span class="gc" style="color:var(--faint);">○</span>
          <span class="gt">${escapeHtml(t.title)}</span>
          <span style="font-size:11px;color:var(--muted);flex-shrink:0;">🗓 ${dueLabel(t.dueDate).text}</span>
        </button>`).join(''):''}
      <div class="glance-sec" style="margin-top:14px;">习惯 · ${doneHabitsToday}/${dueHabitsToday.length}</div>
      ${dueHabitsToday.length? dueHabitsToday.map(h=>{
        const done = isChecked(h, today);
        return `
        <button class="glance-row" data-act="ovHabit" data-id="${h.id}">
          <span class="gc" style="color:${done?'var(--habit)':'var(--faint)'};">${done?'✔':'○'}</span>
          <span class="gt">${escapeHtml(h.name)}</span>
          ${h.freqType==='weeklyCount'?`<span style="font-size:11px;color:var(--muted);flex-shrink:0;">本周 ${countThisWeek(h)}/${h.weeklyTarget||3}</span>`:''}
        </button>`;}).join('') : `<div style="font-size:12.5px;color:var(--faint);padding:6px 0;">还没有要打卡的习惯</div>`}
    </div>

    ${habits.length?`
    <div class="card chart-card">
      <h3>习惯总图 · 近 14 天</h3>
      <div class="ovgrid" style="grid-template-columns:minmax(56px,auto) repeat(14,minmax(10px,1fr)) auto;">
        <span></span>
        ${last14.map(k=>`<span style="font-size:9px;color:var(--faint);text-align:center;">${parseInt(k.slice(8),10)}</span>`).join('')}
        <span style="font-size:10px;">🔥</span>
        ${habits.map(h=>`
          <span class="hn">${escapeHtml(h.name)}</span>
          ${last14.map(k=>`<span class="cell" title="${k}" style="${isChecked(h,k)?`background:${h.color};`:''}"></span>`).join('')}
          <span class="mono" style="font-size:11px;color:${h.color};">${computeStreak(h).current}</span>
        `).join('')}
      </div>
    </div>`:''}

    <div class="grid2">
      <div class="card">
        <div class="l">进行中任务</div>
        <div class="v mono" style="color:var(--gold);">${activeCount}</div>
        <div class="s">已完成 ${completedCount}</div>
      </div>
      <div class="card">
        <div class="l">本月结余</div>
        <div class="v mono" style="color:var(--income);">RM ${fmtMoney(monthIncome-monthExpense)}</div>
        <div class="s">收 RM ${fmtMoney(monthIncome)} · 支 RM ${fmtMoney(monthExpense)}</div>
      </div>
      <div class="card">
        <div class="l">数码资产</div>
        <div class="v mono" style="color:var(--gadget);">RM ${fmtMoney(gadgetsTotal)}</div>
        <div class="s">共 ${gadgetsCount} 件</div>
      </div>
    </div>

    <div class="card chart-card">
      <h3>本月支出结构</h3>
      ${categoryData.length===0 ? `<div class="empty" style="padding:32px 0;">本月暂无支出</div>`
        : hasChart ? `<div class="chart-wrap"><canvas id="pieCanvas"></canvas></div>`
        : categoryData.map(c=>`<div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0;"><span>${c.name}</span><span class="mono">RM ${fmtMoney(c.value)}</span></div>`).join('')}
    </div>

    <div class="card chart-card">
      <h3>近 7 天收支</h3>
      ${hasChart ? `<div class="chart-wrap"><canvas id="barCanvas"></canvas></div>`
        : last7.map(d=>`<div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0;"><span class="mono">${d.day}</span><span class="mono"><span style="color:var(--income);">+${fmtMoney(d.income)}</span> / <span style="color:var(--expense);">-${fmtMoney(d.expense)}</span></span></div>`).join('')}
    </div>

    <div class="card chart-card">
      <h3>云同步</h3>
      ${session ? `
      <div class="s">已登录 ${escapeHtml(session.user?.email||'')}${lastSyncAt?` · 上次同步 ${lastSyncAt.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`:''}${dirty.size?` · ${dirty.size} 项待上传`:''}</div>
      <div class="row" style="margin-top:12px;">
        <button class="add-btn" id="syncNowBtn">立即同步</button>
        <button class="add-btn ghost" id="logoutBtn">退出登录</button>
      </div>` : `
      <div class="row note-row" style="margin-bottom:8px;"><input type="email" id="syncEmail" placeholder="邮箱" autocomplete="email" /></div>
      <div class="row note-row" style="margin-bottom:8px;"><input type="password" id="syncPass" placeholder="密码（至少 6 位）" autocomplete="current-password" /></div>
      <div class="row">
        <button class="add-btn" id="loginBtn">登录</button>
        <button class="add-btn ghost" id="signupBtn">注册新账号</button>
      </div>
      <div class="s" id="syncMsg" style="margin-top:8px;">登录后，所有数据在你的设备间自动同步；不登录也能正常使用</div>`}
    </div>

    <div class="card chart-card">
      <h3>数据备份</h3>
      <div class="row">
        <button class="add-btn" id="exportBtn">导出数据</button>
        <button class="add-btn ghost" id="importBtn">导入数据</button>
        <input type="file" id="importFile" accept=".json,application/json" style="display:none;" />
      </div>
      <div class="s" style="font-size:11px;color:var(--muted);margin-top:8px;">数据只存在浏览器本地,清缓存会丢失,建议定期导出备份</div>
    </div>
  `;

  let ovPressTimer = null;
  const ovTitle = el.querySelector('#ovTitle');
  const startOvPress = () => { ovPressTimer = setTimeout(()=>{ toggleMoneyHidden(); renderOverview(); toast(moneyHidden?'🙈 已隐藏金额':'👀 已显示金额'); }, 600); };
  const cancelOvPress = () => clearTimeout(ovPressTimer);
  ovTitle.addEventListener('mousedown', startOvPress);
  ovTitle.addEventListener('touchstart', startOvPress, {passive:true});
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>ovTitle.addEventListener(ev, cancelOvPress));

  const syncMsg = t => { const m = el.querySelector('#syncMsg'); if(m) m.textContent = t; };
  el.querySelector('#loginBtn')?.addEventListener('click', async ()=>{
    const email = el.querySelector('#syncEmail').value.trim();
    const pass = el.querySelector('#syncPass').value;
    if(!email || !pass){ syncMsg('请填邮箱和密码'); return; }
    syncMsg('登录中…');
    try{
      saveSession(await sbAuth('token?grant_type=password',{email,password:pass}));
      SYNC_KEYS.forEach(k=>{ if(localStorage.getItem(k)!==null) dirty.add(k); }); // 本地已有数据首次登录也要上传
      saveSyncState();
      await syncNow();
      renderOverview();
    }catch(e){ syncMsg('登录失败：'+e.message); }
  });
  el.querySelector('#signupBtn')?.addEventListener('click', async ()=>{
    const email = el.querySelector('#syncEmail').value.trim();
    const pass = el.querySelector('#syncPass').value;
    if(!email || pass.length<6){ syncMsg('请填邮箱，密码至少 6 位'); return; }
    syncMsg('注册中…');
    try{
      const d = await sbAuth('signup',{email,password:pass});
      if(d.access_token){ saveSession(d); await syncNow(); renderOverview(); }
      else syncMsg('注册成功！去邮箱点一下确认链接，回来再点「登录」');
    }catch(e){ syncMsg('注册失败：'+e.message); }
  });
  el.querySelector('#syncNowBtn')?.addEventListener('click', async e=>{
    e.target.textContent = '同步中…';
    const ok = await syncNow();
    renderOverview();
    toast(ok ? '✅ 同步成功' : '⚠️ 同步失败，检查网络后再试');
  });
  el.querySelector('#todayGlance').addEventListener('click', e=>{
    const row = e.target.closest('[data-act]');
    if(!row) return;
    if(row.dataset.act==='ovTask'){
      const t = tasks.find(x=>x.id===row.dataset.id);
      t.completed = !t.completed;
      persistTasks(); renderOverview();
    }
    if(row.dataset.act==='ovHabit'){
      const h = habits.find(x=>x.id===row.dataset.id);
      if(isChecked(h, today)) delete h.checkins[today];
      else h.checkins[today] = true;
      persistHabits(); renderOverview();
    }
  });
  el.querySelector('#logoutBtn')?.addEventListener('click', ()=>{
    if(!confirm('退出登录？本机数据保留，只是不再同步')) return;
    fetch(`${SB_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
    saveSession(null);
    renderOverview();
  });
  el.querySelector('#exportBtn').addEventListener('click', exportData);
  const importFile = el.querySelector('#importFile');
  el.querySelector('#importBtn').addEventListener('click', ()=>importFile.click());
  importFile.addEventListener('change', importData);

  if(!hasChart) return;
  const dark = document.documentElement.dataset.theme==='dark';
  Chart.defaults.color = dark ? '#B7B2A6' : '#5D584D';

  if(categoryData.length>0){
    const ctx = document.getElementById('pieCanvas');
    if(pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
      type:'doughnut',
      data:{
        labels: categoryData.map(c=>c.name),
        datasets:[{ data: categoryData.map(c=>c.value), backgroundColor: categoryData.map((_,i)=>PIE_COLORS[i%PIE_COLORS.length]), borderWidth:0 }]
      },
      options:{ maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:10 } },
        tooltip:{ callbacks:{ label: c => `${c.label}: RM ${fmtMoney(c.raw)}` } } } }
    });
  }
  const bctx = document.getElementById('barCanvas');
  if(barChart) barChart.destroy();
  barChart = new Chart(bctx, {
    type:'bar',
    data:{
      labels: last7.map(d=>d.day),
      datasets:[
        { label:'收入', data: last7.map(d=>d.income), backgroundColor:'#74997F', borderRadius:3 },
        { label:'支出', data: last7.map(d=>d.expense), backgroundColor:'#BE6B50', borderRadius:3 },
      ]
    },
    options:{ maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:10 } },
        tooltip:{ callbacks:{ label: c => `${c.dataset.label}: RM ${fmtMoney(c.raw)}` } } },
      scales:{ x:{ grid:{ display:false }, ticks:{ font:{size:11}, color:'#8C8779' } },
        y:{ grid:{ color: dark?'#26272D':'#EDE8DA' }, ticks:{ font:{size:11}, color:'#8C8779' } } }
    }
  });
}

/* ---------------- backup ---------------- */
function exportData(){
  const blob = new Blob([JSON.stringify({version:1, tasks, txns, habits, gadgets, customCats, budget, journal, recurring}, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liji-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importData(e){
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const data = JSON.parse(await file.text());
    if(!['tasks','txns','habits','gadgets'].every(k=>Array.isArray(data[k]))) throw new Error('不是有效的黎记备份文件');
    if(!confirm('导入会覆盖当前所有数据,确定继续?')) return;
    tasks = data.tasks; txns = data.txns; habits = data.habits; gadgets = data.gadgets;
    if(data.customCats){ customCats = data.customCats; saveKey('shiji-custom-cats', customCats); }
    if(typeof data.budget==='number'){ budget = data.budget; saveKey('shiji-budget', budget); }
    if(data.journal && typeof data.journal==='object'){ journal = data.journal; persistJournal(); }
    if(Array.isArray(data.recurring)){ recurring = data.recurring; persistRecurring(); }
    persistTasks(); persistTxns(); persistHabits(); persistGadgets();
    renderOverview();
    alert('导入成功');
  }catch(err){
    alert('导入失败:' + err.message);
  }
}
