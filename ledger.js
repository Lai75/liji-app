/* ================= LEDGER ================= */
function monthKey(d){ return d.slice(0,7); }

// 记账类型共用的颜色/文案:支出/收入是老的,储蓄/转账是后加的
function typeLabel(t){ return t==='expense'?'支出':t==='saving'?'储蓄':t==='transfer'?'转账':'收入'; }
function typeColor(t){ return t==='expense'?'var(--expense)':t==='saving'?'var(--saving)':t==='transfer'?'var(--brand)':'var(--income)'; }
function typeColorSoft(t){ return t==='expense'?'var(--expense-soft)':t==='saving'?'var(--saving-soft)':t==='transfer'?'var(--brand-soft)':'var(--income-soft)'; }
function typeSign(t){ return t==='expense'?'-':t==='transfer'?'':'+'; }

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
      .map(t=> t.type==='transfer'
        ? [t.date, '转账', `${accountLabel(t.fromAccountId)} → ${accountLabel(t.toAccountId)}`, t.amount, t.note||'']
        : [t.date, typeLabel(t.type), t.category, t.amount, t.note||''])];
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
  const saving = list.filter(t=>t.type==='saving').reduce((s,t)=>s+t.amount,0);
  // 标了"不计入预算"的分类(比如给妈妈的钱)不进总预算的计算,但仍算进上面的"支出"汇总和分类小计
  const budgetExpense = list.filter(t=>t.type==='expense' && !budgetExcludedCats.includes(t.category)).reduce((s,t)=>s+t.amount,0);

  let budgetHtml = '';
  if(!searching){
    if(budget>0){
      const pct = budgetExpense/budget*100;
      const barColor = pct>=100 ? 'var(--expense)' : pct>=80 ? 'var(--flag)' : 'var(--brand)';
      budgetHtml = `
      <div class="box" data-act="setBudget" style="cursor:pointer;padding:10px 12px;" title="点击修改预算">
        <div class="row" style="justify-content:space-between;font-size:12px;margin-bottom:6px;">
          <span style="color:var(--muted);">本月预算 RM ${fmtMoney(budget)}</span>
          <span class="mono" style="color:${pct>=100?'var(--expense)':'var(--muted)'};">${pct>=100?`超支 RM ${fmtMoney(budgetExpense-budget)}`:`剩余 RM ${fmtMoney(budget-budgetExpense)}`}</span>
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
        const excluded = budgetExcludedCats.includes(c);
        return `
        <div class="row" data-act="setCatBudget" data-cat="${escapeHtml(c)}" style="justify-content:space-between;font-size:12px;padding:3px 0;cursor:pointer;" title="点击设置该分类本月预算">
          <span style="color:var(--ink-soft);">${escapeHtml(c)}${excluded?' <span style="color:var(--faint);" title="不计入总预算">⊘</span>':''}${cb>0?` <span style="color:var(--faint);">/ RM ${fmtMoney(cb)}</span>`:''}</span>
          <span class="mono" style="color:${over?'var(--expense)':'var(--muted)'};"><b style="color:${over?'var(--expense)':'var(--ink)'};">RM ${fmtMoney(v)}</b> · ${Math.round(v/expense*100)}%</span>
        </div>`;}).join('')}
    </div>`;
  }

  return `
    <div class="summary4">
      <div class="stat"><div class="l">${searching?'匹配收入':'收入'}</div><div class="v mono" style="color:var(--income);">${fmtMoney(income)}</div></div>
      <div class="stat"><div class="l">${searching?'匹配支出':'支出'}</div><div class="v mono" style="color:var(--expense);">${fmtMoney(expense)}</div></div>
      <div class="stat"><div class="l">${searching?'匹配储蓄':'储蓄'}</div><div class="v mono" style="color:var(--saving);">${fmtMoney(saving)}</div></div>
      <div class="stat"><div class="l">结余</div><div class="v mono" style="color:var(--gold);">${fmtMoney(income-expense-saving)}</div></div>
    </div>
    ${budgetHtml}
    ${subtotalHtml}
    <div id="txnGroups">
      ${groupedEntries.length===0 ? `<div class="empty">${searching?'没有匹配的记录':'本月还没有记录'}</div>` : groupedEntries.map(([d,items])=>`
        <div class="day-group">
          <div class="day-label mono">${d}</div>
          ${items.map(t=>{
            const isTransfer = t.type==='transfer';
            const catText = isTransfer ? '转账' : t.category;
            const noteText = isTransfer ? `${accountLabel(t.fromAccountId)} → ${accountLabel(t.toAccountId)}${t.note?' · '+t.note:''}` : (t.note||'');
            const reimburseBadge = (t.type==='expense' && t.reimburse) ? ` <span style="color:var(--brand);font-size:10px;">${t.reimbursed?'✓已报销':'🧾待报销'}</span>` : '';
            return `
            <div class="txn-row" data-id="${t.id}">
              <span class="cat" style="background:${typeColorSoft(t.type)};color:${typeColor(t.type)};">${escapeHtml(catText)}</span>
              <span class="note">${escapeHtml(noteText)}${reimburseBadge}</span>
              <span class="amt mono" style="color:${typeColor(t.type)};">${typeSign(t.type)}${fmtMoney(t.amount)}</span>
              <button class="rm" data-act="rmTxn">✕</button>
            </div>`;}).join('')}
        </div>`).join('')}
    </div>`;
}

function setBudget(){ openBudgetModal(); }
function setCatBudget(cat){ openBudgetModal(cat); }

// 一次性设总预算 + 各分类预算,而不是逐个分类点开单独设(点分类小计里的某一行会带焦点跳到对应输入框)
function openBudgetModal(focusCat){
  const cats = EXPENSE_CATS.concat(customCats.expense);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 class="serif">设置本月预算</h3>
      <div class="modal-field row">
        <span>总预算</span>
        <input type="text" inputmode="decimal" id="mTotalBudget" placeholder="0=不限" value="${budget||''}">
      </div>
      <div class="modal-cats">
        ${cats.map(c=>`
        <div class="modal-field row">
          <span style="flex:1;">${escapeHtml(c)}</span>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);white-space:nowrap;" title="不勾选=这个分类不算进总预算(比如给家人的钱)">
            <input type="checkbox" class="mCatIncl" data-cat="${escapeHtml(c)}" ${budgetExcludedCats.includes(c)?'':'checked'}> 计入
          </label>
          <input type="text" inputmode="decimal" class="mCatInput" data-cat="${escapeHtml(c)}" placeholder="0=不限" value="${categoryBudgets[c]||''}">
        </div>`).join('')}
      </div>
      <div class="modal-actions row">
        <button id="mCancel">取消</button>
        <button id="mSave" class="add-btn">保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(()=>overlay.classList.add('show'));
  const close = () => { overlay.classList.remove('show'); setTimeout(()=>overlay.remove(), 200); };
  overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  overlay.querySelector('#mCancel').addEventListener('click', close);
  overlay.querySelectorAll('input[type=text]').forEach(inp=>inp.addEventListener('input', e=>{ e.target.value = e.target.value.replace(/[^0-9.]/g,''); }));
  overlay.querySelector('#mSave').addEventListener('click', ()=>{
    budget = parseFloat(overlay.querySelector('#mTotalBudget').value) || 0;
    saveKey('shiji-budget', budget);
    overlay.querySelectorAll('.mCatInput').forEach(inp=>{
      const n = parseFloat(inp.value) || 0;
      if(n>0) categoryBudgets[inp.dataset.cat] = n; else delete categoryBudgets[inp.dataset.cat];
    });
    saveKey('shiji-category-budgets', categoryBudgets);
    budgetExcludedCats = [...overlay.querySelectorAll('.mCatIncl:not(:checked)')].map(chk=>chk.dataset.cat);
    saveKey('shiji-budget-excluded-cats', budgetExcludedCats);
    close();
    renderLedger();
  });
  const target = focusCat ? overlay.querySelector(`.mCatInput[data-cat="${CSS.escape(focusCat)}"]`) : overlay.querySelector('#mTotalBudget');
  setTimeout(()=>{ target?.focus(); target?.scrollIntoView({block:'center'}); }, 260);
}

function renderLedger(){
  const el = document.getElementById('view-ledger');
  // 重渲染会重建表单,先留住已输入的值(切分类/月份时不丢)
  const keep = {
    amount: el.querySelector('#amountInput')?.value || '',
    date: el.querySelector('#dateInput')?.value || todayStr(),
    note: el.querySelector('#noteInput')?.value || '',
    accountId: el.querySelector('#accountSelect')?.value || '',
    fromAccountId: el.querySelector('#fromAccountSelect')?.value || '',
    toAccountId: el.querySelector('#toAccountSelect')?.value || '',
  };
  const isTransfer = ledgerType==='transfer';
  const cats = isTransfer ? [] : LEDGER_CATS[ledgerType].concat(customCats[ledgerType]);
  // 待报销不按月份筛,回款经常跨月,清单要一直看得到直到核销
  const pendingReimburse = txns.filter(t=>t.type==='expense' && t.reimburse && !t.reimbursed).sort((a,b)=> a.date<b.date?1:-1);

  el.innerHTML = `
    <h1 class="serif" id="ldgTitle" style="user-select:none;">记账本</h1>
    <div class="sub">钱花在哪，心里有数</div>
    <div class="box">
      <div class="typebtns">
        <button class="expense ${ledgerType==='expense'?'active':''}" data-type="expense">支出</button>
        <button class="income ${ledgerType==='income'?'active':''}" data-type="income">收入</button>
        <button class="saving ${ledgerType==='saving'?'active':''}" data-type="saving">储蓄</button>
        <button class="transfer ${ledgerType==='transfer'?'active':''}" data-type="transfer">转账</button>
      </div>
      <div class="row amount-row">
        <span class="sign mono" style="color:${typeColor(ledgerType)};">RM</span>
        <input type="text" id="amountInput" inputmode="decimal" placeholder="0.00" class="mono" />
        <input type="date" id="dateInput" value="${todayStr()}" />
      </div>
      ${isTransfer ? '' : `
      <div class="chiprow" id="catchips">
        ${cats.map(c=>{
          const active = ledgerCategory===c;
          const activeStyle = active?`border-color:${typeColor(ledgerType)};background:${typeColorSoft(ledgerType)};color:${typeColor(ledgerType)};`:'';
          if(!customCats[ledgerType].includes(c)) return `<button class="chip ${active?'active':''}" data-cat="${escapeHtml(c)}" style="${activeStyle}">${escapeHtml(c)}</button>`;
          return `<span class="chip" style="${activeStyle}display:inline-flex;align-items:center;gap:6px;">
            <button data-cat="${escapeHtml(c)}" style="all:unset;cursor:pointer;">${escapeHtml(c)}</button>
            <button data-delcat="${escapeHtml(c)}" title="删除这个自定义分类" style="all:unset;cursor:pointer;color:var(--faint);font-size:10px;">✕</button>
          </span>`;
        }).join('')}
        <button class="chip" data-addcat="1" style="border-style:dashed;">＋自定义</button>
      </div>`}
      ${isTransfer ? (accounts.length>=2 ? `
      <div class="row" style="margin-top:10px;gap:8px;">
        <select id="fromAccountSelect" style="flex:1;">
          ${accounts.map(a=>`<option value="${a.id}">${a.icon} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
        <span style="color:var(--muted);flex-shrink:0;">→</span>
        <select id="toAccountSelect" style="flex:1;">
          ${accounts.map(a=>`<option value="${a.id}">${a.icon} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>` : `<div class="empty" style="padding:14px 0;font-size:12px;">至少需要两个账户才能转账,先去"账户"页添加一个吧</div>`)
      : (accounts.length?`
      <div class="row" style="margin-top:10px;">
        <select id="accountSelect">
          <option value="">不选账户</option>
          ${accounts.map(a=>`<option value="${a.id}">${a.icon} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>`:'')}
      ${ledgerType==='expense'?`
      <div class="row" style="margin-top:10px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;" title="比如公司报销、代付,先记支出,回款后一键核销">
          <input type="checkbox" id="reimburseChk" ${reimburseFlag?'checked':''}> 🧾 标记为待报销
        </label>
      </div>`:''}
      <div class="row note-row">
        <input type="text" id="noteInput" placeholder="备注（可选）" />
        ${editingTxn?`<button id="cancelTxnEdit" style="font-size:12px;color:var(--muted);flex-shrink:0;">取消</button>`:''}
        ${editingTxn || isTransfer?'':`<button id="recBtn" title="把上面填好的这笔设为每月自动记账" style="font-size:12px;color:var(--muted);flex-shrink:0;">⟳ 定期</button>`}
        <button class="add-btn" id="addTxnBtn" ${isTransfer && accounts.length<2?'disabled':''}>${editingTxn?'保存修改':'记一笔'}</button>
      </div>
      <div id="priceHint" class="price-hint" style="display:none;"></div>
    </div>

    ${recurring.length?`
    <div class="box" id="recList" style="padding:10px 12px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">⟳ 定期账单 · 每月自动记</div>
      ${recurring.map(r=>`
        <div class="row" style="justify-content:space-between;font-size:12px;padding:3px 0;gap:8px;">
          <span style="color:var(--ink-soft);">每月 ${r.day} 日 · ${escapeHtml(r.category)}${r.note?` · ${escapeHtml(r.note)}`:''}</span>
          <span class="mono" style="color:${typeColor(r.type)};flex-shrink:0;">${typeSign(r.type)}${fmtMoney(r.amount)}
            <button data-rmrec="${r.id}" title="停止这条定期(已记的账不受影响)" style="color:var(--faint);padding:2px 6px;">✕</button>
          </span>
        </div>`).join('')}
    </div>`:''}

    ${pendingReimburse.length?`
    <div class="box" id="reimburseList" style="padding:10px 12px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">🧾 待报销 · 共 RM ${fmtMoney(pendingReimburse.reduce((s,t)=>s+t.amount,0))}</div>
      ${pendingReimburse.map(t=>`
        <div class="row" style="justify-content:space-between;font-size:12px;padding:3px 0;gap:8px;">
          <span style="color:var(--ink-soft);">${t.date} · ${escapeHtml(t.category)}${t.note?` · ${escapeHtml(t.note)}`:''}</span>
          <span class="mono" style="color:var(--expense);flex-shrink:0;">-${fmtMoney(t.amount)}
            <button data-markreimb="${t.id}" title="标记为已收到报销款,自动记一笔「报销」收入" style="color:var(--brand);padding:2px 4px;">✓已收</button>
            <button data-untrackreimb="${t.id}" title="不再追踪这笔待报销(不影响原支出记录)" style="color:var(--faint);padding:2px 4px;">✕</button>
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
    ledgerType=b.dataset.type; if(LEDGER_CATS[ledgerType]) ledgerCategory=LEDGER_CATS[ledgerType][0]; renderLedger();
  }));
  el.querySelector('#catchips')?.addEventListener('click', e=>{
    const delBtn = e.target.closest('[data-delcat]');
    if(delBtn){
      if(!confirm(`删除自定义分类「${delBtn.dataset.delcat}」?`)) return;
      customCats[ledgerType] = customCats[ledgerType].filter(x=>x!==delBtn.dataset.delcat);
      if(ledgerCategory===delBtn.dataset.delcat) ledgerCategory = LEDGER_CATS[ledgerType][0];
      saveKey('shiji-custom-cats', customCats);
      renderLedger();
      return;
    }
    if(e.target.closest('[data-addcat]')){
      const name = (prompt('新分类名称') || '').trim();
      if(!name) return;
      const cats = LEDGER_CATS[ledgerType].concat(customCats[ledgerType]);
      if(!cats.includes(name)) { customCats[ledgerType].push(name); saveKey('shiji-custom-cats', customCats); }
      ledgerCategory = name;
      renderLedger();
      return;
    }
    const catBtn = e.target.closest('[data-cat]');
    if(catBtn){ ledgerCategory = catBtn.dataset.cat; renderLedger(); }
  });
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
  el.querySelector('#noteInput').addEventListener('input', updatePriceHint);
  onEnter(el.querySelector('#noteInput'), addTxn);
  const cancelBtn = el.querySelector('#cancelTxnEdit');
  if(cancelBtn) cancelBtn.addEventListener('click',()=>{
    editingTxn=null; reimburseFlag=false;
    el.querySelector('#amountInput').value=''; el.querySelector('#noteInput').value=''; el.querySelector('#dateInput').value=todayStr();
    if(el.querySelector('#accountSelect')) el.querySelector('#accountSelect').value='';
    renderLedger();
  });
  el.querySelector('#reimburseChk')?.addEventListener('change', e=>{ reimburseFlag = e.target.checked; });
  el.querySelector('#reimburseList')?.addEventListener('click', e=>{
    const markId = e.target.dataset.markreimb;
    if(markId){
      const t = txns.find(x=>x.id===markId);
      if(!t) return;
      t.reimbursed = true;
      const incomeRec = {id:uid(), type:'income', amount:t.amount, category:'报销', note:`报销:${t.category}${t.note?'·'+t.note:''}`, date:todayStr(), accountId:t.accountId};
      txns.unshift(incomeRec);
      persistTxns();
      renderLedger();
      toast('✓ 已记为报销收入', ()=>{
        t.reimbursed = false;
        const idx = txns.findIndex(x=>x.id===incomeRec.id);
        if(idx>=0) txns.splice(idx,1);
        persistTxns();
        renderLedger();
      });
      return;
    }
    const untrackId = e.target.dataset.untrackreimb;
    if(untrackId){
      const t = txns.find(x=>x.id===untrackId);
      if(t){ t.reimburse = false; persistTxns(); renderLedger(); }
    }
  });
  el.querySelector('#fromAccountSelect')?.addEventListener('change', e=>{
    const toSel = el.querySelector('#toAccountSelect');
    if(toSel && toSel.value===e.target.value){
      const other = accounts.find(a=>a.id!==e.target.value);
      if(other) toSel.value = other.id;
    }
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
    reimburseFlag = !!t.reimburse;
    el.querySelector('#amountInput').value = t.amount;
    el.querySelector('#dateInput').value = t.date;
    el.querySelector('#noteInput').value = t.note||'';
    if(el.querySelector('#accountSelect')) el.querySelector('#accountSelect').value = t.accountId||'';
    renderLedger();
    if(t.type==='transfer'){
      const fs = el.querySelector('#fromAccountSelect'), ts = el.querySelector('#toAccountSelect');
      if(fs) fs.value = t.fromAccountId||'';
      if(ts) ts.value = t.toAccountId||'';
    }
  });
  el.querySelector('#amountInput').value = keep.amount;
  el.querySelector('#dateInput').value = keep.date;
  el.querySelector('#noteInput').value = keep.note;
  if(el.querySelector('#accountSelect')) el.querySelector('#accountSelect').value = keep.accountId;
  if(el.querySelector('#fromAccountSelect')) el.querySelector('#fromAccountSelect').value = keep.fromAccountId || accounts[0]?.id || '';
  if(el.querySelector('#toAccountSelect')) el.querySelector('#toAccountSelect').value = keep.toAccountId || accounts[1]?.id || accounts[0]?.id || '';
  updatePriceHint();
}

// 备注跟以前买过的某笔支出重名(同一件东西反复买)时,提示首次/上次价格方便比价
function updatePriceHint(){
  const hint = document.getElementById('priceHint');
  if(!hint) return;
  const note = document.getElementById('noteInput').value.trim().toLowerCase();
  const matches = note && ledgerType==='expense'
    ? txns.filter(t=> t.type==='expense' && t.id!==editingTxn && (t.note||'').trim().toLowerCase()===note).sort((a,b)=> a.date<b.date?-1:1)
    : [];
  if(!matches.length){ hint.style.display='none'; return; }
  const first = matches[0], last = matches[matches.length-1];
  hint.style.display = '';
  hint.textContent = first===last
    ? `💡 上次买这个是 RM ${fmtMoney(first.amount)}（${first.date}）`
    : `💡 首次 RM ${fmtMoney(first.amount)}（${first.date}） · 上次 RM ${fmtMoney(last.amount)}（${last.date}）`;
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

  let rec;
  if(ledgerType==='transfer'){
    const fromAccountId = document.getElementById('fromAccountSelect')?.value;
    const toAccountId = document.getElementById('toAccountSelect')?.value;
    if(!fromAccountId || !toAccountId || fromAccountId===toAccountId){ toast('请选择两个不同的账户'); return; }
    rec = {type:'transfer', amount:val, category:'转账', fromAccountId, toAccountId, note:noteInput.value.trim(), date:dateInput.value||todayStr()};
  }else{
    const accountSelect = document.getElementById('accountSelect');
    rec = {type:ledgerType, amount:val, category:ledgerCategory, note:noteInput.value.trim(), date:dateInput.value||todayStr(), accountId:accountSelect?.value||undefined,
      reimburse: ledgerType==='expense' ? reimburseFlag : undefined};
  }

  if(editingTxn){
    const t = txns.find(x=>x.id===editingTxn);
    if(t) Object.assign(t, rec);
    editingTxn = null;
  }else{
    txns.unshift({id:uid(), ...rec});
  }
  amountInput.value=''; noteInput.value=''; reimburseFlag=false;  // 清空后再渲染,keep 捕获到的就是空表单(日期保留方便连续补记)
  persistTxns();
  renderLedger();
  document.getElementById('amountInput').focus();
}
