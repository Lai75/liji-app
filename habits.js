/* ================= HABITS ================= */
function isHabitDue(habit, dateStr){
  if(habit.freqType==='daily' || habit.freqType==='weeklyCount') return true;
  const dow = new Date(dateStr+'T00:00:00').getDay();
  return habit.days.includes(dow);
}
// 有小习惯时 checkins[date] 存已完成的小习惯 id 数组(true = 全部完成);全勾完才算这天打卡
function isChecked(habit, dateStr){
  const c = habit.checkins[dateStr];
  if(!c) return false;
  const subs = habit.subHabits||[];
  if(subs.length===0 || c===true) return true;
  return Array.isArray(c) && subs.every(s=>c.includes(s.id));
}
function weekStartOf(d){ const w = new Date(d); w.setDate(w.getDate()-w.getDay()); return w; } // 周日起
function countThisWeek(habit){
  const d = weekStartOf(new Date());
  let n = 0;
  for(let i=0;i<7;i++){
    const key = localDateStr(d);
    if(key > todayStr()) break;
    if(isChecked(habit, key)) n++;
    d.setDate(d.getDate()+1);
  }
  return n;
}
// 「每周 N 次」的连续按周算:本周没满不算断(还在进行中)
function computeWeekStreak(habit){
  const target = habit.weeklyTarget||3;
  const counts = {};
  Object.keys(habit.checkins).forEach(k=>{
    if(isChecked(habit,k)){ const wk = localDateStr(weekStartOf(new Date(k+'T00:00:00'))); counts[wk]=(counts[wk]||0)+1; }
  });
  const wk = weekStartOf(new Date());
  let current = (counts[localDateStr(wk)]||0) >= target ? 1 : 0;
  for(let i=0;i<520;i++){
    wk.setDate(wk.getDate()-7);
    if((counts[localDateStr(wk)]||0) >= target) current++;
    else break;
  }
  let best = 0, run = 0;
  const scan = weekStartOf(new Date()); scan.setDate(scan.getDate()-52*7);
  for(let i=0;i<53;i++){
    if((counts[localDateStr(scan)]||0) >= target){ run++; best = Math.max(best, run); }
    else run = 0;
    scan.setDate(scan.getDate()+7);
  }
  return { current, best: Math.max(best, current) };
}
// 本月打卡进度(奖励用):应打卡天数 vs 已打卡天数;每周 N 次按天数折算
function monthProgress(habit){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const dim = new Date(y, m+1, 0).getDate();
  let due = 0, done = 0;
  for(let day=1; day<=dim; day++){
    const key = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if(habit.freqType!=='weeklyCount' && isHabitDue(habit, key)) due++;
    if(isChecked(habit, key)) done++;
  }
  if(habit.freqType==='weeklyCount') due = Math.round((habit.weeklyTarget||3)*dim/7);
  return { done, due };
}
// 每个自然月最多 2 次漏打卡不清零(护盾),按日期动态算,不占存储
const STREAK_GRACE_PER_MONTH = 2;
function computeStreak(habit){
  if(habit.freqType==='weeklyCount') return computeWeekStreak(habit);
  // walk backward from today over due days until a due day is missing a checkin
  let cur = 0, best = 0, running = 0;
  const d = new Date();
  // best streak: scan all checkins chronologically over the last 365 due days
  const dueDates = [];
  const scan = new Date(d);
  for(let i=0;i<365;i++){
    const key = localDateStr(scan);
    if(isHabitDue(habit, key)) dueDates.push(key);
    scan.setDate(scan.getDate()-1);
  }
  dueDates.reverse(); // oldest -> newest
  const bestGrace = {};
  dueDates.forEach(key=>{
    if(isChecked(habit, key)){ running++; best = Math.max(best, running); }
    else if(key!==todayStr() && (bestGrace[key.slice(0,7)] = (bestGrace[key.slice(0,7)]||0)+1) <= STREAK_GRACE_PER_MONTH){ /* shielded: streak survives, doesn't grow */ }
    else running = 0;
  });
  // current streak: from most recent due day backward
  const curGrace = {};
  for(let i=dueDates.length-1;i>=0;i--){
    const key = dueDates[i];
    const isToday = key===todayStr();
    if(isChecked(habit, key)){ cur++; continue; }
    if(isToday) continue; // today not yet checked in doesn't break streak
    const mk = key.slice(0,7);
    if((curGrace[mk] = (curGrace[mk]||0)+1) <= STREAK_GRACE_PER_MONTH) continue; // shielded
    break;
  }
  return { current: cur, best };
}
function freqLabel(habit){
  if(habit.freqType==='weeklyCount') return `每周 ${habit.weeklyTarget||3} 次 · 不限哪天`;
  if(habit.freqType==='daily') return '每天';
  if(habit.days.length===7) return '每天';
  const sorted = [...habit.days].sort();
  return '每周 · ' + sorted.map(d=>WEEKDAYS[d]).join('');
}
// 过去、应打卡、未打卡的格子才能点开写"没完成的原因"
function dayCellHtml(habit, key, isFuture, checked){
  const clickable = !isFuture && !checked && key!==todayStr() && isHabitDue(habit, key);
  const note = habit.notes?.[key];
  const title = note ? `${key}：${note}` : key;
  return `<div class="cell ${isFuture?'future':''} ${checked?'checked':''} ${note?'has-note':''}" title="${escapeHtml(title)}" ${clickable?`data-act="dayNote" data-date="${key}"`:''}></div>`;
}
function monthHeatmap(habit){
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let cells = '';
  for(let i=0;i<startOffset;i++) cells += `<div class="cell future"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isFuture = key > todayStr();
    cells += dayCellHtml(habit, key, isFuture, isChecked(habit, key));
  }
  return cells;
}
function yearHeatmap(habit){
  // 从 364 天前所在周的周日排到今天,GitHub 风格按列填充
  const d = new Date(); d.setDate(d.getDate()-364);
  d.setDate(d.getDate()-d.getDay());
  const today = todayStr();
  let cells = '';
  for(let key=localDateStr(d); key<=today; d.setDate(d.getDate()+1), key=localDateStr(d)){
    cells += dayCellHtml(habit, key, false, isChecked(habit, key));
  }
  return cells;
}

function habitCardHtml(h, today){
  const { current, best } = computeStreak(h);
  const due = isHabitDue(h, today);
  const subs = h.subHabits||[];
  const checkedToday = isChecked(h, today);
  const cToday = h.checkins[today];
  const partial = !checkedToday && Array.isArray(cToday) && cToday.length>0;
  const unit = h.freqType==='weeklyCount' ? '周' : '天';
  const mp = monthProgress(h);
  const rewardHit = mp.due>0 && mp.done>=mp.due;
  return `
  <div class="habit-card" data-id="${h.id}">
    <div class="habit-top">
      <span class="habit-dot" style="background:${h.color};"></span>
      <div style="flex:1;min-width:0;">
        <div class="habit-name">${escapeHtml(h.name)}</div>
        <div class="habit-freq">${freqLabel(h)}${h.freqType==='weeklyCount'?` · 本周 ${countThisWeek(h)}/${h.weeklyTarget||3}`:''}</div>
      </div>
      <span class="habit-streak" style="color:${h.color};">🔥 ${current}</span>
      <button class="checkin-btn ${checkedToday?'done':''}" data-act="checkin" ${due?'':'style="opacity:.35;"'}>${checkedToday?'✔':partial?`<span style="font-size:11px;" data-act="checkin">${cToday.length}/${subs.length}</span>`:''}</button>
      <button class="habit-del" data-act="delete">🗑</button>
    </div>
    ${subs.length?`<div class="habit-subs">${subs.map(s=>{
      const sdone = cToday===true || (Array.isArray(cToday) && cToday.includes(s.id));
      return `<button class="habit-sub ${sdone?'done':''}" data-act="toggleSubHabit" data-sid="${s.id}">${sdone?'✔':'○'} ${escapeHtml(s.name)}<span class="subdel" data-act="delSubHabit" data-sid="${s.id}">✕</span></button>`;
    }).join('')}</div>`:''}
    ${habitHeatYear[h.id] ? `<div class="heatmap-year">${yearHeatmap(h)}</div>` : `<div class="heatmap">${monthHeatmap(h)}</div>`}
    <div class="habit-stats">
      <span>当前连续 ${current} ${unit}</span>
      <span>最长连续 ${best} ${unit}</span>
      <button data-act="toggleHeat" style="margin-left:auto;font-size:11px;color:${h.color};">${habitHeatYear[h.id]?'看本月':'看全年'}</button>
    </div>
    ${h.reward?`<div class="habit-reward" data-act="setReward">🎁 本月打卡 ${mp.done}/${mp.due} · ${rewardHit?`达成！奖励自己：${escapeHtml(h.reward)} 🎉`:`达成奖励：${escapeHtml(h.reward)}`}</div>`:''}
    <div class="habit-actions">
      <button data-act="addSubHabit">＋ 小习惯</button>
      <button data-act="setReward">🎁 ${h.reward?'改本月奖励':'设本月奖励'}</button>
    </div>
  </div>`;
}

function renderHabits(){
  const el = document.getElementById('view-habits');
  const today = todayStr();
  const pastEntries = Object.entries(journal)
    .filter(([d,e])=> d!==today && (e.text||e.mood))
    .sort((a,b)=> a[0]<b[0]?1:-1).slice(0,7);

  el.innerHTML = `
    <h1 class="serif">习惯打卡</h1>
    <div class="sub">每天一点坚持，积成长长的连续记录</div>

    <div class="box habit-form">
      <div class="row">
        <span style="color:var(--habit);">＋</span>
        <input type="text" id="habitName" placeholder="想养成的习惯，比如“喝水 8 杯”" style="flex:1;border:none;outline:none;background:transparent;font-size:14px;" />
      </div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap;">
        <select id="habitFreqType">
          <option value="daily" ${habitFreqType==='daily'?'selected':''}>每天</option>
          <option value="weekly" ${habitFreqType==='weekly'?'selected':''}>每周指定几天</option>
          <option value="weeklyCount" ${habitFreqType==='weeklyCount'?'selected':''}>每周完成 N 次</option>
        </select>
        ${habitFreqType==='weeklyCount'?`<select id="habitWeeklyTarget">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${n===habitWeeklyTarget?'selected':''}>每周 ${n} 次</option>`).join('')}</select>`:''}
        <button class="add-btn" id="addHabitBtn" style="margin-left:auto;">添加习惯</button>
      </div>
      <div class="weekday-picker" id="weekdayPicker" style="display:${habitFreqType==='weekly'?'flex':'none'};">
        ${WEEKDAYS.map((w,i)=>`<button data-day="${i}" class="${habitSelectedDays.includes(i)?'active':''}">${w}</button>`).join('')}
      </div>
    </div>

    <div id="habitList">
      ${habits.length===0 ? `<div class="empty">还没有习惯，添加一个开始打卡吧</div>` : habits.map(h=>habitCardHtml(h,today)).join('')}
    </div>

    <div class="box" style="margin-top:22px;">
      <div style="font-size:13.5px;font-weight:600;">今日随笔 <span class="mono" style="color:var(--faint);font-weight:400;font-size:11px;">${today}</span></div>
      <div class="mood-row" style="margin-top:10px;">
        ${MOODS.map(m=>`<button data-mood="${m}" class="${journal[today]?.mood===m?'active':''}">${m}</button>`).join('')}
      </div>
      <textarea id="journalText" placeholder="此刻的心情、今天想记下的小事…">${escapeHtml(journal[today]?.text||'')}</textarea>
      ${pastEntries.length?`<div style="margin-top:12px;">${pastEntries.map(([d,e])=>`
        <div class="journal-entry"><div class="jd mono">${d} ${e.mood||''}</div>${escapeHtml(e.text||'')}</div>`).join('')}</div>`:''}
    </div>
  `;

  el.querySelector('#habitFreqType').addEventListener('change', e=>{
    habitFreqType = e.target.value;
    renderHabits();
  });
  el.querySelector('#habitWeeklyTarget')?.addEventListener('change', e=>{ habitWeeklyTarget = parseInt(e.target.value,10); });
  el.querySelectorAll('#weekdayPicker button').forEach(b=>b.addEventListener('click',()=>{
    const day = parseInt(b.dataset.day,10);
    if(habitSelectedDays.includes(day)) habitSelectedDays = habitSelectedDays.filter(d=>d!==day);
    else habitSelectedDays = [...habitSelectedDays, day];
    renderHabits();
  }));
  onEnter(el.querySelector('#habitName'), addHabit);
  el.querySelector('#addHabitBtn').addEventListener('click', addHabit);
  el.querySelector('#habitList').addEventListener('click', e=>{
    const card = e.target.closest('.habit-card');
    if(!card) return;
    const id = card.dataset.id;
    const h = habits.find(x=>x.id===id);
    const act = e.target.dataset.act;
    if(act==='checkin'){
      if(isChecked(h, today)) delete h.checkins[today];
      else h.checkins[today] = true;
      persistHabits(); renderHabits();
      if(isChecked(h, today) && h.reward){
        const mp = monthProgress(h);
        if(mp.due>0 && mp.done>=mp.due) toast(`🎁 本月达成！奖励自己：${h.reward}`);
      }
      return;
    }
    if(act==='toggleSubHabit' || act==='delSubHabit'){
      const sid = e.target.dataset.sid;
      if(act==='delSubHabit'){
        h.subHabits = (h.subHabits||[]).filter(s=>s.id!==sid);
      }else{
        const subs = h.subHabits||[];
        const c = h.checkins[today];
        let arr = c===true ? subs.map(s=>s.id) : Array.isArray(c) ? [...c] : [];
        arr = arr.includes(sid) ? arr.filter(x=>x!==sid) : [...arr, sid];
        if(arr.length===0) delete h.checkins[today]; else h.checkins[today] = arr;
      }
      persistHabits(); renderHabits(); return;
    }
    if(act==='addSubHabit'){
      const name = (prompt('小习惯名称，比如「早餐」「午餐」')||'').trim();
      if(!name) return;
      (h.subHabits = h.subHabits||[]).push({id:uid(), name});
      persistHabits(); renderHabits(); return;
    }
    if(act==='setReward'){
      const v = prompt('这个月坚持下来，给自己什么奖励？(留空清除)', h.reward||'');
      if(v===null) return;
      h.reward = v.trim();
      persistHabits(); renderHabits(); return;
    }
    if(act==='toggleHeat'){
      habitHeatYear[id] = !habitHeatYear[id];
      renderHabits(); return;
    }
    if(act==='dayNote'){
      const date = e.target.dataset.date;
      const v = prompt(`${date} 没完成的原因(留空清除)`, h.notes?.[date]||'');
      if(v===null) return;
      h.notes = h.notes || {};
      if(v.trim()) h.notes[date] = v.trim(); else delete h.notes[date];
      persistHabits(); renderHabits(); return;
    }
    if(act==='delete'){ removeWithUndo(()=>habits, id, persistHabits, renderHabits, '习惯'); return; }
  });
  el.querySelectorAll('.mood-row button').forEach(b=>b.addEventListener('click',()=>{
    const cur = journal[today]||{};
    cur.mood = cur.mood===b.dataset.mood ? '' : b.dataset.mood;
    journal[today] = cur;
    persistJournal(); renderHabits();
  }));
  el.querySelector('#journalText').addEventListener('change', e=>{
    const cur = journal[today]||{};
    cur.text = e.target.value.trim();
    journal[today] = cur;
    persistJournal();
  });
}

function addHabit(){
  const input = document.getElementById('habitName');
  const name = input.value.trim();
  if(!name) return;
  if(habitFreqType==='weekly' && habitSelectedDays.length===0){ alert('每周习惯至少选一天'); return; }
  const color = HABIT_COLORS[habits.length % HABIT_COLORS.length];
  const days = habitFreqType==='weekly' ? [...habitSelectedDays] : [0,1,2,3,4,5,6];
  const habit = { id:uid(), name, color, freqType:habitFreqType, days, checkins:{}, subHabits:[], notes:{}, createdAt:Date.now() };
  if(habitFreqType==='weeklyCount') habit.weeklyTarget = habitWeeklyTarget;
  habits.unshift(habit);
  persistHabits();
  renderHabits();
  document.getElementById('habitName').focus();
}
