/* ================= LEDGER ================= */
function monthKey(d){ return d.slice(0,7); }

/* 定期账单:每月 day 日自动补记。id 用 rec-<规则id>-<年月> 确定性生成,
   两台设备同月各补一笔时同步合并按 id 去重;去重集合读 localStorage 原始数据(含墓碑),
   手动删掉的那笔留有墓碑,不会被补回来 */
function applyRecurring(){
  if(!recurring.length) return;
  let raw; try{ raw = JSON.parse(localStorage.getItem('shiji-transactions')) || []; }catch(e){ raw = []; }
  const seen = new Set(raw.map(t=>t.id));
  const today = todayStr();
  const [ty,tm] = today.slice(0,7).split('-').map(Number);
  let added = 0, advanced = false;
  for(const r of recurring){
    let [y,m] = (r.lastPosted || r.start.slice(0,7)).split('-').map(Number);
    if(r.lastPosted){ m++; if(m>12){ m=1; y++; } }
    while(y<ty || (y===ty && m<=tm)){
      const mk = `${y}-${String(m).padStart(2,'0')}`;
      const lastDay = new Date(y, m, 0).getDate(); // 31 号在小月自动收到月底
      const date = `${mk}-${String(Math.min(r.day,lastDay)).padStart(2,'0')}`;
      if(date > today) break; // 本月还没到日子,lastPosted 不动,到日子那天再补
      const id = `rec-${r.id}-${mk}`;
      if(date >= r.start && !seen.has(id)){
        txns.unshift({id, type:r.type, amount:r.amount, category:r.category, note:r.note, date});
        seen.add(id); added++;
      }
      r.lastPosted = mk; advanced = true;
      m++; if(m>12){ m=1; y++; }
    }
  }
  if(advanced) persistRecurring();
  if(added){ persistTxns(); toast(`⟳ 已自动记入 ${added} 笔定期账单`); }
}

function addRecurring(){
  const val = parseFloat(document.getElementById('amountInput').value);
  if(!val || val<=0){ toast('先在上面填好金额和分类,再设为定期'); return; }
  const d = parseInt(prompt('每月几号自动记这笔账?(1-31,31 在小月自动算月底)', new Date().getDate()), 10);
  if(!d || d<1 || d>31) return;
  recurring.push({id:uid(), type:ledgerType, amount:val, category:ledgerCategory,
    note:document.getElementById('noteInput').value.trim(), day:d, start:todayStr()});
  persistRecurring();
  document.getElementById('amountInput').value=''; document.getElementById('noteInput').value='';
  applyRecurring();
  renderLedger();
  toast(`已设定期:每月 ${d} 日自动记账`);
}

function exportLedgerCsv(){
  const rows = [['日期','类型','分类','金额(RM)','备注'],
    ...txns.slice().sort((a,b)=> a.date<b.date?1:-1)
      .map(t=>[t.date, t.type==='expense'?'支出':'收入', t.category, t.amount, t.note||''])];
  // BOM 让 Excel 认出 UTF-8,中文才不乱码
  const csv = String.fromCharCode(0xFEFF)+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download = `liji-账单-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// 汇总/预算/小计/账单列表这一段会被搜索输入单独重绘(不动输入框,焦点不丢)
function ledgerBodyHtml(){
  const kw = ledgerSearch.trim().toLowerCase();
  const searching = kw.length>0;
  const list = (searching
    ? txns.filter(t=> (t.note||'').toLowerCase().includes(kw) || t.category.toLowerCase().includes(kw))
    : txns.filter(t=>monthKey(t.date)===ledgerCursor)
  ).slice().sort((a,b)=> a.date<b.date?1:-1);
  const grouped = {};
  list.forEach(t=>{ (grouped[t.date]=grouped[t.date]||[]).push(t); });
  const groupedEntries = Object.entries(grouped).sort((a,b)=> a[0]<b[0]?1:-1);
  const income = list.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = list.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  let budgetHtml = '';
  if(!searching){
    if(budget>0){
      const pct = expense/budget*100;
      const barColor = pct>=100 ? 'var(--expense)' : pct>=80 ? 'var(--flag)' : 'var(--brand)';
      budgetHtml = `
      <div class="box" data-act="setBudget" style="cursor:pointer;padding:10px 12px;" title="点击修改预算">
        <div class="row" style="justify-content:space-between;font-size:12px;margin-bottom:6px;">
          <span style="color:var(--muted);">本月预算 RM ${fmtMoney(budget)}</span>
          <span class="mono" style="color:${pct>=100?'var(--expense)':'var(--muted)'};">${pct>=100?`超支 RM ${fmtMoney(expense-budget)}`:`剩余 RM ${fmtMoney(budget-expense)}`}</span>
        </div>
        <div style="height:6px;border-radius:3px;background:var(--soft);overflow:hidden;">
          <div style="height:100%;width:${Math.min(100,pct)}%;background:${barColor};"></div>
        </div>
      </div>`;
    }else{
      budgetHtml = `<div style="margin-bottom:16px;"><button data-act="setBudget" style="font-size:12px;color:var(--muted);">＋ 设置月度预算</button></div>`;
    }
  }

  let subtotalHtml = '';
  if(!searching && expense>0){
    const catMap = {};
    list.filter(t=>t.type==='expense').forEach(t=>{ catMap[t.category]=(catMap[t.category]||0)+t.amount; });
    subtotalHtml = `
    <div class="box" style="padding:10px 12px;">
      ${Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([c,v])=>{
        const cb = categoryBudgets[c] || 0;
        const over = cb>0 && v>cb;
        return `
        <div class="row" data-act="setCatBudget" data-cat="${escapeHtml(c)}" style="justify-content:space-between;font-size:12px;padding:3px 0;cursor:pointer;" title="点击设置该分类本月预算">
          <span style="color:var(--ink-soft);">${escapeHtml(c)}${cb>0?` <span style="color:var(--faint);">/ RM ${fmtMoney(cb)}</span>`:''}</span>
          <span class="mono" style="color:${over?'var(--expense)':'var(--muted)'};"><b style="color:${over?'var(--expense)':'var(--ink)'};">RM ${fmtMoney(v)}</b> · ${Math.round(v/expense*100)}%</span>
        </div>`;}).join('')}
    </div>`;
  }

  return `
    <div class="summary3">
      <div class="stat"><div class="l">${searching?'匹配收入':'收入'}</div><div class="v mono" style="color:var(--income);">${fmtMoney(income)}</div></div>
      <div class="stat"><div class="l">${searching?'匹配支出':'支出'}</div><div class="v mono" style="color:var(--expense);">${fmtMoney(expense)}</div></div>
      <div class="stat"><div class="l">结余</div><div class="v mono" style="color:var(--gold);">${fmtMoney(income-expense)}</div></div>
    </div>
    ${budgetHtml}
    ${subtotalHtml}
    <div id="txnGroups">
      ${groupedEntries.length===0 ? `<div class="empty">${searching?'没有匹配的记录':'本月还没有记录'}</div>` : groupedEntries.map(([d,items])=>`
        <div class="day-group">
          <div class="day-label mono">${d}</div>
          ${items.map(t=>`
            <div class="txn-row" data-id="${t.id}">
              <span class="cat" style="background:${t.type==='expense'?'var(--expense-soft)':'var(--income-soft)'};color:${t.type==='expense'?'var(--expense)':'var(--income)'};">${escapeHtml(t.category)}</span>
              <span class="note">${escapeHtml(t.note||'')}</span>
              <span class="amt mono" style="color:${t.type==='expense'?'var(--expense)':'var(--income)'};">${t.type==='expense'?'-':'+'}${fmtMoney(t.amount)}</span>
              <button class="rm" data-act="rmTxn">✕</button>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
}

function setBudget(){
  const v = prompt('每月支出预算 (RM)，输入 0 清除', budget || '');
  if(v===null) return;
  budget = parseFloat(v) || 0;
  saveKey('shiji-budget', budget);
  renderLedger();
}

function setCatBudget(cat){
  const v = prompt(`「${cat}」本月预算 (RM)，输入 0 清除`, categoryBudgets[cat] || '');
  if(v===null) return;
  const n = parseFloat(v) || 0;
  if(n>0) categoryBudgets[cat] = n; else delete categoryBudgets[cat];
  saveKey('shiji-category-budgets', categoryBudgets);
  renderLedger();
}

function renderLedger(){
  const el = document.getElementById('view-ledger');
  // 重渲染会重建表单,先留住已输入的值(切分类/月份时不丢)
  const keep = {
    amount: el.querySelector('#amountInput')?.value || '',
    date: el.querySelector('#dateInput')?.value || todayStr(),
    note: el.querySelector('#noteInput')?.value || '',
  };
  const cats = (ledgerType==='expense'?EXPENSE_CATS:INCOME_CATS).concat(customCats[ledgerType]);

  el.innerHTML = `
    <h1 class="serif" id="ldgTitle" style="user-select:none;">记账本</h1>
    <div class="sub">钱花在哪，心里有数</div>
    <div class="box">
      <div class="typebtns">
        <button class="expense ${ledgerType==='expense'?'active':''}" data-type="expense">支出</button>
        <button class="income ${ledgerType==='income'?'active':''}" data-type="income">收入</button>
      </div>
      <div class="row amount-row">
        <span class="sign mono" style="color:${ledgerType==='expense'?'var(--expense)':'var(--income)'};">RM</span>
        <input type="text" id="amountInput" inputmode="decimal" placeholder="0.00" class="mono" />
        <input type="date" id="dateInput" value="${todayStr()}" />
      </div>
      <div class="chiprow" id="catchips">
        ${cats.map(c=>`<button class="chip ${ledgerCategory===c?'active':''}" data-cat="${escapeHtml(c)}" style="${ledgerCategory===c?`border-color:${ledgerType==='expense'?'var(--expense)':'var(--income)'};background:${ledgerType==='expense'?'var(--expense-soft)':'var(--income-soft)'};color:${ledgerType==='expense'?'var(--expense)':'var(--income)'};`:''}">${escapeHtml(c)}</button>`).join('')}
        <button class="chip" data-addcat="1" style="border-style:dashed;">＋自定义</button>
      </div>
      <div class="row note-row">
        <input type="text" id="noteInput" placeholder="备注（可选）" />
        ${editingTxn?`<button id="cancelTxnEdit" style="font-size:12px;color:var(--muted);flex-shrink:0;">取消</button>`:''}
        ${editingTxn?'':`<button id="recBtn" title="把上面填好的这笔设为每月自动记账" style="font-size:12px;color:var(--muted);flex-shrink:0;">⟳ 定期</button>`}
        <button class="add-btn" id="addTxnBtn">${editingTxn?'保存修改':'记一笔'}</button>
      </div>
    </div>

    ${recurring.length?`
    <div class="box" id="recList" style="padding:10px 12px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">⟳ 定期账单 · 每月自动记</div>
      ${recurring.map(r=>`
        <div class="row" style="justify-content:space-between;font-size:12px;padding:3px 0;gap:8px;">
          <span style="color:var(--ink-soft);">每月 ${r.day} 日 · ${escapeHtml(r.category)}${r.note?` · ${escapeHtml(r.note)}`:''}</span>
          <span class="mono" style="color:${r.type==='expense'?'var(--expense)':'var(--income)'};flex-shrink:0;">${r.type==='expense'?'-':'+'}${fmtMoney(r.amount)}
            <button data-rmrec="${r.id}" title="停止这条定期(已记的账不受影响)" style="color:var(--faint);padding:2px 6px;">✕</button>
          </span>
        </div>`).join('')}
    </div>`:''}

    <div class="row" style="margin-bottom:12px;">
      <input type="search" id="searchInput" placeholder="🔍 搜索备注或分类（跨所有月份）" value="${escapeHtml(ledgerSearch)}"
        style="flex:1;border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:13px;outline:none;background:var(--card);color:inherit;" />
      <button id="csvBtn" title="导出全部账单为 CSV（Excel 可直接打开）" style="font-size:12px;color:var(--muted);flex-shrink:0;border:1px solid var(--line);border-radius:10px;padding:7px 10px;background:var(--card);">⤓ CSV</button>
    </div>

    <div class="monthnav" id="monthnav" style="${ledgerSearch.trim()?'display:none;':''}">
      <button id="prevMonth">‹</button>
      <span>${ledgerCursor}</span>
      <button id="nextMonth">›</button>
    </div>
    <div id="ledgerBody">${ledgerBodyHtml()}</div>
  `;

  let ldgPressTimer = null;
  const ldgTitle = el.querySelector('#ldgTitle');
  const startLdgPress = () => { ldgPressTimer = setTimeout(()=>{ toggleMoneyHidden(); renderLedger(); toast(moneyHidden?'🙈 已隐藏金额':'👀 已显示金额'); }, 600); };
  const cancelLdgPress = () => clearTimeout(ldgPressTimer);
  ldgTitle.addEventListener('mousedown', startLdgPress);
  ldgTitle.addEventListener('touchstart', startLdgPress, {passive:true});
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>ldgTitle.addEventListener(ev, cancelLdgPress));

  el.querySelectorAll('.typebtns button').forEach(b=>b.addEventListener('click',()=>{
    ledgerType=b.dataset.type; ledgerCategory=(ledgerType==='expense'?EXPENSE_CATS:INCOME_CATS)[0]; renderLedger();
  }));
  el.querySelectorAll('#catchips .chip').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.addcat){
      const name = (prompt('新分类名称') || '').trim();
      if(!name) return;
      const cats = (ledgerType==='expense'?EXPENSE_CATS:INCOME_CATS).concat(customCats[ledgerType]);
      if(!cats.includes(name)) { customCats[ledgerType].push(name); saveKey('shiji-custom-cats', customCats); }
      ledgerCategory = name;
    }else{
      ledgerCategory = b.dataset.cat;
    }
    renderLedger();
  }));
  el.querySelector('#prevMonth').addEventListener('click',()=>shiftMonth(-1));
  el.querySelector('#nextMonth').addEventListener('click',()=>shiftMonth(1));
  el.querySelector('#addTxnBtn').addEventListener('click', addTxn);
  el.querySelector('#recBtn')?.addEventListener('click', addRecurring);
  el.querySelector('#csvBtn').addEventListener('click', exportLedgerCsv);
  el.querySelector('#recList')?.addEventListener('click', e=>{
    const id = e.target.dataset.rmrec;
    if(id) removeWithUndo(()=>recurring, id, persistRecurring, renderLedger, '定期账单');
  });
  el.querySelector('#amountInput').addEventListener('input', e=>{ e.target.value = e.target.value.replace(/[^0-9.]/g,''); });
  onEnter(el.querySelector('#noteInput'), addTxn);
  const cancelBtn = el.querySelector('#cancelTxnEdit');
  if(cancelBtn) cancelBtn.addEventListener('click',()=>{
    editingTxn=null;
    el.querySelector('#amountInput').value=''; el.querySelector('#noteInput').value=''; el.querySelector('#dateInput').value=todayStr();
    renderLedger();
  });
  el.querySelector('#searchInput').addEventListener('input', e=>{
    ledgerSearch = e.target.value;
    el.querySelector('#monthnav').style.display = ledgerSearch.trim() ? 'none' : '';
    el.querySelector('#ledgerBody').innerHTML = ledgerBodyHtml();
  });
  el.querySelector('#ledgerBody').addEventListener('click', e=>{
    if(e.target.closest('[data-act=setBudget]')){ setBudget(); return; }
    const catRow = e.target.closest('[data-act=setCatBudget]');
    if(catRow){ setCatBudget(catRow.dataset.cat); return; }
    const row = e.target.closest('.txn-row');
    if(!row) return;
    const id = row.dataset.id;
    if(e.target.dataset.act==='rmTxn'){
      if(editingTxn===id) editingTxn=null;
      removeWithUndo(()=>txns, id, persistTxns, renderLedger, '这笔记录');
      return;
    }
    const t = txns.find(x=>x.id===id);
    editingTxn = id;
    ledgerType = t.type;
    ledgerCategory = t.category;
    el.querySelector('#amountInput').value = t.amount;
    el.querySelector('#dateInput').value = t.date;
    el.querySelector('#noteInput').value = t.note||'';
    renderLedger();
  });
  el.querySelector('#amountInput').value = keep.amount;
  el.querySelector('#dateInput').value = keep.date;
  el.querySelector('#noteInput').value = keep.note;
}

function shiftMonth(delta){
  const [y,m] = ledgerCursor.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  ledgerCursor = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderLedger();
}

function addTxn(){
  const amountInput = document.getElementById('amountInput');
  const dateInput = document.getElementById('dateInput');
  const noteInput = document.getElementById('noteInput');
  const val = parseFloat(amountInput.value);
  if(!val || val<=0) return;
  const rec = {type:ledgerType, amount:val, category:ledgerCategory, note:noteInput.value.trim(), date:dateInput.value||todayStr()};
  if(editingTxn){
    const t = txns.find(x=>x.id===editingTxn);
    if(t) Object.assign(t, rec);
    editingTxn = null;
  }else{
    txns.unshift({id:uid(), ...rec});
  }
  amountInput.value=''; noteInput.value='';  // 清空后再渲染,keep 捕获到的就是空表单(日期保留方便连续补记)
  persistTxns();
  renderLedger();
  document.getElementById('amountInput').focus();
}
