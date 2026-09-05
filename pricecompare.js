/* ================= PRICE COMPARE ================= */
// 备注写法一样(去空格/大小写)的支出记录归成一组,只看买过 2 次以上的,方便看涨跌
function priceGroups(){
  const groups = {};
  txns.filter(t=>t.type==='expense' && (t.note||'').trim()).forEach(t=>{
    const key = t.note.trim().toLowerCase();
    (groups[key] = groups[key] || []).push(t);
  });
  return Object.values(groups)
    .filter(g=>g.length>=2)
    .map(g=>g.slice().sort((a,b)=> a.date<b.date?-1:1))
    .sort((a,b)=> b[b.length-1].date.localeCompare(a[a.length-1].date));
}

function renderPriceCompare(){
  const el = document.getElementById('view-pricecompare');
  const groups = priceGroups();
  el.innerHTML = `
    <h1 class="serif">比价</h1>
    <div class="sub">记账时备注写一样的名字，买第二次这里就会自动列出来对比</div>
    ${groups.length===0 ? `<div class="empty">还没有重复买过的东西</div>` : groups.map(g=>{
      const name = g[g.length-1].note.trim();
      const first = g[0], last = g[g.length-1];
      const diff = last.amount - first.amount;
      const diffPct = first.amount>0 ? Math.round(diff/first.amount*100) : 0;
      return `
      <div class="box price-group">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:600;font-size:13.5px;">${escapeHtml(name)}</div>
          ${diff!==0?`<span class="mono" style="font-size:12px;color:${diff>0?'var(--expense)':'var(--income)'};">${diff>0?'↑':'↓'}${Math.abs(diffPct)}%</span>`:''}
        </div>
        ${g.map(t=>`
        <div class="row" style="justify-content:space-between;font-size:12.5px;padding:4px 0;color:var(--ink-soft);">
          <span class="mono">${t.date}</span>
          <span class="mono">RM ${fmtMoney(t.amount)}</span>
        </div>`).join('')}
      </div>`;
    }).join('')}
  `;
}
