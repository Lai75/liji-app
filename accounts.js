/* ================= ACCOUNTS ================= */
function accountColor(a){ const i = accounts.findIndex(x=>x.id===a.id); return HABIT_COLORS[(i<0?0:i) % HABIT_COLORS.length]; }
function accountLabel(id){ const a = accounts.find(x=>x.id===id); return a ? `${a.icon} ${a.name}` : '已删除账户'; }
function accountTxnCount(a){
  return txns.filter(t=> t.accountId===a.id || (t.type==='transfer' && (t.fromAccountId===a.id || t.toAccountId===a.id))).length;
}
// 转账不算收入/支出,但要按转出/转入方向调整两边账户余额
function accountBalance(a){
  return txns.reduce((s,t)=>{
    if(t.type==='transfer'){
      if(t.fromAccountId===a.id) return s - t.amount;
      if(t.toAccountId===a.id) return s + t.amount;
      return s;
    }
    if(t.accountId!==a.id) return s;
    return s + (t.type==='income'?t.amount:-t.amount);
  }, a.openingBalance||0);
}

function renderAccounts(){
  const el = document.getElementById('view-accounts');
  const keep = {
    name: el.querySelector('#accountName')?.value || '',
    opening: el.querySelector('#accountOpening')?.value || '',
  };
  const totalBalance = accounts.reduce((s,a)=>s+accountBalance(a),0);

  el.innerHTML = `
    <h1 class="serif">账户</h1>
    <div class="sub">钱包、银行卡、公积金，余额一目了然</div>

    <div class="box account-form">
      <div class="row">
        <span style="color:var(--brand);">＋</span>
        <input type="text" id="accountName" placeholder="账户名称，比如 Maybank" />
      </div>
      <div class="chiprow" id="iconchips" style="margin-top:10px;">
        ${ACCOUNT_ICONS.map(ic=>`<button class="chip ${accountFormIcon===ic?'active':''}" data-icon="${ic}" style="${accountFormIcon===ic?'border-color:var(--brand);background:var(--brand-soft);':''}">${ic}</button>`).join('')}
      </div>
      <div class="row" style="margin-top:10px;">
        <span class="mono" style="color:var(--brand);">RM</span>
        <input type="text" id="accountOpening" class="price mono" inputmode="decimal" placeholder="期初余额" />
      </div>
      <div class="row" style="margin-top:10px;">
        ${editingAccount?`<button id="cancelAccountEdit" style="font-size:12px;color:var(--muted);margin-left:auto;">取消</button>`:''}
        <button class="add-btn" id="addAccountBtn" style="${editingAccount?'':'margin-left:auto;'}">${editingAccount?'保存修改':'添加账户'}</button>
      </div>
    </div>

    <div class="summary2">
      <div class="stat"><div class="l">账户数</div><div class="v mono">${accounts.length}</div></div>
      <div class="stat"><div class="l">总资产</div><div class="v mono" style="color:var(--brand);">RM ${fmtMoney(totalBalance)}</div></div>
    </div>

    <div id="accountList">
      ${accounts.length===0 ? `<div class="empty">还没有账户，添加一个开始记余额吧</div>` : accounts.map(accountCardHtml).join('')}
    </div>
  `;

  el.querySelector('#accountOpening').addEventListener('input', e=>{ e.target.value = e.target.value.replace(/[^0-9.]/g,''); });
  onEnter(el.querySelector('#accountName'), addAccount);
  el.querySelectorAll('#iconchips .chip').forEach(b=>b.addEventListener('click',()=>{ accountFormIcon=b.dataset.icon; renderAccounts(); }));
  el.querySelector('#addAccountBtn').addEventListener('click', addAccount);
  const cancelAccount = el.querySelector('#cancelAccountEdit');
  if(cancelAccount) cancelAccount.addEventListener('click',()=>{
    editingAccount=null;
    el.querySelector('#accountName').value='';
    el.querySelector('#accountOpening').value='';
    accountFormIcon = ACCOUNT_ICONS[0];
    renderAccounts();
  });
  el.querySelector('#accountList').addEventListener('click', e=>{
    const card = e.target.closest('.account-card');
    if(!card) return;
    const id = card.dataset.id;
    if(e.target.dataset.act==='delete'){
      if(editingAccount===id) editingAccount=null;
      removeWithUndo(()=>accounts, id, persistAccounts, renderAccounts, '这个账户');
      return;
    }
    const a = accounts.find(x=>x.id===id);
    editingAccount = id;
    accountFormIcon = a.icon;
    el.querySelector('#accountName').value = a.name;
    el.querySelector('#accountOpening').value = a.openingBalance||'';
    renderAccounts();
  });
  el.querySelector('#accountName').value = keep.name;
  el.querySelector('#accountOpening').value = keep.opening;
}

function accountCardHtml(a){
  const bal = accountBalance(a);
  const count = accountTxnCount(a);
  const color = accountColor(a);
  return `
  <div class="account-card" data-id="${a.id}" style="border-left:3px solid ${color};">
    <div class="row" style="align-items:flex-start;">
      <span class="account-icon" style="background:${color}22;color:${color};">${a.icon}</span>
      <div style="flex:1;min-width:0;">
        <div class="account-name">${escapeHtml(a.name)}</div>
        <div class="account-meta">${count} 笔记录</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="account-balance mono" style="color:${bal<0?'var(--expense)':'var(--ink)'};">RM ${fmtMoney(bal)}</div>
      </div>
      <button class="account-del" data-act="delete">🗑</button>
    </div>
  </div>`;
}

function addAccount(){
  const nameInput = document.getElementById('accountName');
  const openingInput = document.getElementById('accountOpening');
  const name = nameInput.value.trim();
  if(!name) return;
  const openingBalance = parseFloat(openingInput.value) || 0;
  const rec = { name, icon:accountFormIcon, openingBalance };
  if(editingAccount){
    const a = accounts.find(x=>x.id===editingAccount);
    if(a) Object.assign(a, rec);
    editingAccount = null;
  }else{
    accounts.push({id:uid(), ...rec, createdAt:Date.now()});
  }
  nameInput.value=''; openingInput.value='';
  accountFormIcon = ACCOUNT_ICONS[0];
  persistAccounts();
  renderAccounts();
  document.getElementById('accountName').focus();
}
