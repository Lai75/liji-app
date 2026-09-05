/* ================= PRICE COMPARE ================= */
// 自己建条目、自己记每次的价格,不依赖记账本的备注匹配
function renderPriceCompare(){
  const el = document.getElementById('view-pricecompare');
  const list = priceItems.slice().sort((a,b)=> b.createdAt-a.createdAt);

  el.innerHTML = `
    <h1 class="serif">比价</h1>
    <div class="sub">记下同一件东西每次的价格，涨跌一眼看清</div>

    <div class="box">
      <div class="row">
        <span style="color:var(--brand);">＋</span>
        <input type="text" id="priceItemName" placeholder="东西的名字，比如「屈臣氏洗发水」" style="flex:1;" />
        <button class="add-btn" id="addPriceItemBtn">添加</button>
      </div>
    </div>

    <div id="priceItemList">
      ${list.length===0 ? `<div class="empty">还没有记录，先加一个要比价的东西吧</div>` : list.map(priceItemHtml).join('')}
    </div>
  `;

  el.querySelector('#addPriceItemBtn').addEventListener('click', addPriceItem);
  onEnter(el.querySelector('#priceItemName'), addPriceItem);

  el.querySelector('#priceItemList').addEventListener('input', e=>{
    if(e.target.classList.contains('priceAmountInput')) e.target.value = e.target.value.replace(/[^0-9.]/g,'');
  });
  el.querySelector('#priceItemList').addEventListener('click', e=>{
    const box = e.target.closest('.price-group');
    if(!box) return;
    const item = priceItems.find(x=>x.id===box.dataset.id);
    if(!item) return;

    if(e.target.closest('[data-act=delItem]')){
      if(editingPriceId && (item.prices||[]).some(p=>p.id===editingPriceId)) editingPriceId = null;
      removeWithUndo(()=>priceItems, item.id, persistPriceItems, renderPriceCompare, '这个比价记录');
      return;
    }
    if(e.target.closest('[data-act=renameItem]')){
      const name = (prompt('改个名字', item.name) || '').trim();
      if(!name) return;
      item.name = name;
      persistPriceItems(); renderPriceCompare();
      return;
    }
    const delPriceBtn = e.target.closest('[data-act=delPrice]');
    if(delPriceBtn){
      const idx = item.prices.findIndex(p=>p.id===delPriceBtn.dataset.pid);
      if(idx<0) return;
      if(editingPriceId===delPriceBtn.dataset.pid) editingPriceId = null;
      const [rec] = item.prices.splice(idx,1);
      persistPriceItems(); renderPriceCompare();
      toast('这条价格已删除', ()=>{ item.prices.splice(idx,0,rec); persistPriceItems(); renderPriceCompare(); });
      return;
    }
    if(e.target.closest('[data-act=addPrice]')){
      const amt = parseFloat(box.querySelector('.priceAmountInput').value);
      if(!amt || amt<=0) return;
      const date = box.querySelector('.priceDateInput').value || todayStr();
      (item.prices = item.prices||[]).push({id:uid(), date, amount:amt});
      persistPriceItems(); renderPriceCompare();
      return;
    }
    if(e.target.closest('[data-act=savePrice]')){
      const amt = parseFloat(box.querySelector('.priceAmountInput').value);
      if(!amt || amt<=0) return;
      const date = box.querySelector('.priceDateInput').value || todayStr();
      const p = item.prices.find(x=>x.id===editingPriceId);
      if(p){ p.amount = amt; p.date = date; }
      editingPriceId = null;
      persistPriceItems(); renderPriceCompare();
      return;
    }
    if(e.target.closest('[data-act=cancelPriceEdit]')){
      editingPriceId = null; renderPriceCompare();
      return;
    }
    const row = e.target.closest('.price-row');
    if(row){ editingPriceId = row.dataset.pid; renderPriceCompare(); }
  });
}

function addPriceItem(){
  const input = document.getElementById('priceItemName');
  const name = input.value.trim();
  if(!name) return;
  priceItems.unshift({id:uid(), name, prices:[], createdAt:Date.now()});
  persistPriceItems();
  renderPriceCompare();
}

function priceItemHtml(item){
  const prices = (item.prices||[]).slice().sort((a,b)=> a.date<b.date?-1:1);
  const first = prices[0], last = prices[prices.length-1];
  const diff = (first && last && first!==last) ? last.amount-first.amount : 0;
  const diffPct = (diff && first.amount>0) ? Math.round(diff/first.amount*100) : 0;
  const editingPrice = (item.prices||[]).find(p=>p.id===editingPriceId);
  return `
  <div class="box price-group" data-id="${item.id}">
    <div class="row" style="justify-content:space-between;">
      <div style="font-weight:600;font-size:13.5px;cursor:pointer;" data-act="renameItem" title="点击改名">${escapeHtml(item.name)}</div>
      <div class="row" style="gap:10px;">
        ${diff!==0?`<span class="mono" style="font-size:12px;color:${diff>0?'var(--expense)':'var(--income)'};">${diff>0?'↑':'↓'}${Math.abs(diffPct)}%</span>`:''}
        <button data-act="delItem" title="删除这个比价记录" style="color:var(--faint);font-size:12px;">🗑</button>
      </div>
    </div>
    ${prices.length===0 ? `<div class="empty" style="padding:8px 0;font-size:12px;">还没记过价格</div>` : prices.map(p=>`
    <div class="row price-row" data-pid="${p.id}" style="justify-content:space-between;font-size:12.5px;padding:4px 0;color:var(--ink-soft);cursor:pointer;" title="点击编辑这条">
      <span class="mono">${p.date}</span>
      <span class="row" style="gap:6px;">
        <span class="mono">RM ${fmtMoney(p.amount)}</span>
        <button data-act="delPrice" data-pid="${p.id}" title="删除这条" style="color:var(--faint);font-size:11px;">✕</button>
      </span>
    </div>`).join('')}
    <div class="row" style="margin-top:8px;gap:8px;">
      <span class="mono" style="color:var(--brand);">RM</span>
      <input type="text" class="mono priceAmountInput" inputmode="decimal" placeholder="价格" value="${editingPrice?editingPrice.amount:''}" style="width:70px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--soft);" />
      <input type="date" class="priceDateInput" value="${editingPrice?editingPrice.date:todayStr()}" />
      ${editingPrice?`<button data-act="cancelPriceEdit" style="font-size:11px;color:var(--muted);">取消</button>`:''}
      <button class="add-btn" data-act="${editingPrice?'savePrice':'addPrice'}" style="margin-left:auto;padding:6px 12px;font-size:12px;">${editingPrice?'保存修改':'记一次'}</button>
    </div>
  </div>`;
}
