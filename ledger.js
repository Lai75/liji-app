/* ================= LEDGER ================= */
function monthKey(d){ return d.slice(0,7); }

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
      ${Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`
        <div class="row" style="justify-content:space-between;font-size:12px;padding:3px 0;">
          <span style="color:var(--ink-soft);">${escapeHtml(c)}</span>
          <span class="mono" style="color:var(--muted);"><b style="color:var(--ink);">RM ${fmtMoney(v)}</b> · ${Math.round(v/expense*100)}%</span>
        </div>`).join('')}
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
    <h1 class="serif">记账本</h1>
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
        <button class="add-btn" id="addTxnBtn">${editingTxn?'保存修改':'记一笔'}</button>
      </div>
    </div>

    <div class="row" style="margin-bottom:12px;">
      <input type="search" id="searchInput" placeholder="🔍 搜索备注或分类（跨所有月份）" value="${escapeHtml(ledgerSearch)}"
        style="flex:1;border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:13px;outline:none;background:var(--card);color:inherit;" />
    </div>

    <div class="monthnav" id="monthnav" style="${ledgerSearch.trim()?'display:none;':''}">
      <button id="prevMonth">‹</button>
      <span>${ledgerCursor}</span>
      <button id="nextMonth">›</button>
    </div>
    <div id="ledgerBody">${ledgerBodyHtml()}</div>
  `;

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
