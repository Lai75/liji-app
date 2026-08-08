/* ================= GADGETS ================= */
function gadgetCat(id){ return GADGET_CATS.find(c=>c.id===id) || GADGET_CATS[GADGET_CATS.length-1]; }

function renderGadgets(){
  const el = document.getElementById('view-gadgets');
  // 同记账本:重渲染前留住表单值
  const keep = {
    name: el.querySelector('#gadgetName')?.value || '',
    brand: el.querySelector('#gadgetBrand')?.value || '',
    price: el.querySelector('#gadgetPrice')?.value || '',
    date: el.querySelector('#gadgetDate')?.value || todayStr(),
  };
  let list = gadgets.slice();
  if(gadgetFilter!=='all') list = list.filter(g=>g.categoryId===gadgetFilter);
  list.sort((a,b)=> (b.purchaseDate||'').localeCompare(a.purchaseDate||'') || b.createdAt-a.createdAt);

  const totalValue = gadgets.reduce((s,g)=>s+g.price,0);
  const totalCount = gadgets.length;

  el.innerHTML = `
    <h3>📱 数码库</h3>

    <div class="box gadget-form">
      <div class="row">
        <span style="color:var(--gadget);">＋</span>
        <input type="text" id="gadgetName" placeholder="产品名称，比如 iPhone 15 Pro" />
      </div>
      <div class="row" style="margin-top:10px;">
        <select id="gadgetCatSelect">
          ${GADGET_CATS.map(c=>`<option value="${c.id}" ${c.id===gadgetFormCat?'selected':''}>${c.icon} ${c.name}</option>`).join('')}
        </select>
        <input type="text" id="gadgetBrand" placeholder="品牌型号（可选）" />
      </div>
      <div class="row" style="margin-top:10px;">
        <span class="mono" style="color:var(--gadget);">RM</span>
        <input type="text" id="gadgetPrice" class="price mono" inputmode="decimal" placeholder="购入价格" />
        <input type="date" id="gadgetDate" value="${todayStr()}" />
      </div>
      <div class="chiprow" id="channelchips" style="margin-top:10px;margin-bottom:0;">
        ${CHANNELS.map(c=>`<button class="chip ${gadgetFormChannel===c?'active':''}" data-channel="${c}" style="${gadgetFormChannel===c?'border-color:var(--gadget);background:var(--gadget-soft);color:var(--gadget);':''}">${c}</button>`).join('')}
      </div>
      <div class="row" style="margin-top:10px;">
        ${editingGadget?`<button id="cancelGadgetEdit" style="font-size:12px;color:var(--muted);margin-left:auto;">取消</button>`:''}
        <button class="add-btn" id="addGadgetBtn" style="${editingGadget?'':'margin-left:auto;'}">${editingGadget?'保存修改':'添加记录'}</button>
      </div>
    </div>

    <div class="summary2">
      <div class="stat"><div class="l">数量</div><div class="v mono">${totalCount} 件</div></div>
      <div class="stat"><div class="l">总值</div><div class="v mono" style="color:var(--gadget);">RM ${fmtMoney(totalValue)}</div></div>
    </div>

    <div class="chiprow" id="gadgetFilterChips">
      <button class="chip ${gadgetFilter==='all'?'active':''}" data-filter="all" style="${gadgetFilter==='all'?'border-color:var(--gadget);background:var(--gadget-soft);color:var(--gadget);':''}">全部</button>
      ${GADGET_CATS.map(c=>`<button class="chip ${gadgetFilter===c.id?'active':''}" data-filter="${c.id}" style="${gadgetFilter===c.id?'border-color:var(--gadget);background:var(--gadget-soft);color:var(--gadget);':''}">${c.icon} ${c.name}</button>`).join('')}
    </div>

    <div id="gadgetList">
      ${list.length===0 ? `<div class="empty">还没有记录，添加第一件数码产品吧</div>` : list.map(gadgetCardHtml).join('')}
    </div>
  `;

  el.querySelector('#gadgetCatSelect').addEventListener('change', e=>{ gadgetFormCat = e.target.value; });
  el.querySelector('#gadgetPrice').addEventListener('input', e=>{ e.target.value = e.target.value.replace(/[^0-9.]/g,''); });
  onEnter(el.querySelector('#gadgetName'), addGadget);
  el.querySelectorAll('#channelchips .chip').forEach(b=>b.addEventListener('click',()=>{ gadgetFormChannel=b.dataset.channel; renderGadgets(); }));
  el.querySelector('#addGadgetBtn').addEventListener('click', addGadget);
  el.querySelectorAll('#gadgetFilterChips .chip').forEach(b=>b.addEventListener('click',()=>{ gadgetFilter=b.dataset.filter; renderGadgets(); }));
  const cancelGadget = el.querySelector('#cancelGadgetEdit');
  if(cancelGadget) cancelGadget.addEventListener('click',()=>{
    editingGadget=null;
    ['gadgetName','gadgetBrand','gadgetPrice'].forEach(i=>el.querySelector('#'+i).value='');
    el.querySelector('#gadgetDate').value=todayStr();
    renderGadgets();
  });
  el.querySelector('#gadgetList').addEventListener('click', e=>{
    const card = e.target.closest('.gadget-card');
    if(!card) return;
    const id = card.dataset.id;
    if(e.target.dataset.act==='delete'){
      if(editingGadget===id) editingGadget=null;
      removeWithUndo(()=>gadgets, id, persistGadgets, renderOverview, '这条记录');
      return;
    }
    const g = gadgets.find(x=>x.id===id);
    editingGadget = id;
    gadgetFormCat = g.categoryId;
    gadgetFormChannel = CHANNELS.includes(g.channel) ? g.channel : CHANNELS[0];
    el.querySelector('#gadgetName').value = g.name;
    el.querySelector('#gadgetBrand').value = g.brand||'';
    el.querySelector('#gadgetPrice').value = g.price||'';
    el.querySelector('#gadgetDate').value = g.purchaseDate||todayStr();
    renderGadgets();
  });
  el.querySelector('#gadgetName').value = keep.name;
  el.querySelector('#gadgetBrand').value = keep.brand;
  el.querySelector('#gadgetPrice').value = keep.price;
  el.querySelector('#gadgetDate').value = keep.date;
}

function gadgetCardHtml(g){
  const cat = gadgetCat(g.categoryId);
  const held = g.purchaseDate ? Math.max(1, 1-daysFromToday(g.purchaseDate)) : 0;
  return `
  <div class="gadget-card" data-id="${g.id}">
    <div class="row" style="align-items:flex-start;">
      <span class="gadget-icon">${cat.icon}</span>
      <div style="flex:1;min-width:0;">
        <div class="gadget-name">${escapeHtml(g.name)}</div>
        <div class="gadget-meta">${cat.name}${g.brand?' · '+escapeHtml(g.brand):''}</div>
        ${held?`<div class="gadget-date">已持有 ${held} 天${g.price>0?` · RM ${fmtMoney(g.price/held)}/天`:''}</div>`:''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="gadget-price mono">RM ${fmtMoney(g.price)}</div>
        <div class="gadget-date mono">${g.purchaseDate||''}</div>
      </div>
      <button class="gadget-del" data-act="delete">🗑</button>
    </div>
    ${g.channel?`<div class="gadget-channel">购于 ${escapeHtml(g.channel)}</div>`:''}
  </div>`;
}

function addGadget(){
  const nameInput = document.getElementById('gadgetName');
  const brandInput = document.getElementById('gadgetBrand');
  const priceInput = document.getElementById('gadgetPrice');
  const dateInput = document.getElementById('gadgetDate');
  const name = nameInput.value.trim();
  if(!name) return;
  const price = parseFloat(priceInput.value) || 0;
  const rec = {
    name, categoryId:gadgetFormCat, brand:brandInput.value.trim(),
    price, purchaseDate:dateInput.value||todayStr(), channel:gadgetFormChannel
  };
  if(editingGadget){
    const g = gadgets.find(x=>x.id===editingGadget);
    if(g) Object.assign(g, rec);
    editingGadget = null;
  }else{
    gadgets.unshift({id:uid(), ...rec, createdAt:Date.now()});
  }
  nameInput.value=''; brandInput.value=''; priceInput.value='';
  persistGadgets();
  renderOverview();
  document.getElementById('gadgetName').focus();
}
