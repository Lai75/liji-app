/* ---------------- 启动胶水:主题、导航、init(依赖上面全部文件) ---------------- */
/* ---------------- theme ---------------- */
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  document.getElementById('themeBtn').textContent = t==='dark'?'☀️':'🌙';
  document.querySelector('meta[name=theme-color]').content = t==='dark'?'#131417':'#F7F4EC';
  if(activeTab==='overview') renderOverview();
}
applyTheme(localStorage.getItem('shiji-theme') || 'dark');
document.getElementById('themeBtn').addEventListener('click',()=>{
  const next = document.documentElement.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('shiji-theme', next);
  applyTheme(next);
});

/* ---------------- nav ---------------- */
// 手机底栏「记账/账户」共用一个槽位:在其中一页时再点一下切到另一页(data-tab 动态翻转实现)
let lastMoneyTab = 'ledger';
function setTab(tab){
  activeTab = tab;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const money = document.getElementById('moneyNavBtn');
  const onMoney = tab==='ledger' || tab==='accounts';
  if(onMoney) lastMoneyTab = tab;
  const shown = onMoney ? tab : lastMoneyTab;
  money.dataset.tab = tab==='ledger' ? 'accounts' : tab==='accounts' ? 'ledger' : lastMoneyTab;
  money.innerHTML = shown==='ledger' ? `💰<span>记账${onMoney?' ⇄':''}</span>` : `💳<span>账户${onMoney?' ⇄':''}</span>`;
  money.classList.toggle('active', onMoney);
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+tab).classList.add('active');
  if(tab==='tasks') renderTasks();
  if(tab==='habits') renderHabits();
  if(tab==='ledger') renderLedger();
  if(tab==='accounts') renderAccounts();
  if(tab==='overview') renderOverview();
}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));

/* ================= INIT ================= */

async function init(){
  await loadAll();
  applyRecurring(); // 定期账单:把打开期间错过的月份补上
  // 请求持久存储,降低浏览器空间紧张时自动清掉数据的概率
  navigator.storage?.persist?.().catch(()=>{});
  setTab('tasks');
  syncNow(); // 已登录则后台同步,完成后自动刷新
}
init();

// 挂过夜后回到前台,"今天"已变,重渲染当前页(打卡/到期判断才正确);回前台顺便同步
let lastDay = todayStr();
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState!=='visible') return;
  if(todayStr()!==lastDay){ lastDay = todayStr(); applyRecurring(); setTab(activeTab); }
  syncNow();
});

// PWA:file:// 打开时 SW 不可用,静默跳过
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

/* ---------------- 安装到桌面/主屏幕 ---------------- */
let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if(!deferredInstallPrompt) return;
  installBtn.hidden = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
