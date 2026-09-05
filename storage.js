/* ---------------- data & storage ---------------- */
const LISTS = [
  {id:'inbox',name:'收件箱',color:'#B08F4A'},
  {id:'work',name:'工作',color:'#7A8CA3'},
  {id:'life',name:'生活',color:'#B27E52'},
  {id:'study',name:'学习',color:'#74997F'},
];
const EXPENSE_CATS = ['餐饮','交通','购物','娱乐','居住','医疗','人情','其他'];
const INCOME_CATS = ['工资','奖金','理财','红包','报销','其他'];
const SAVING_CATS = ['应急金','旅行基金','投资','教育金','其他'];
const LEDGER_CATS = {expense:EXPENSE_CATS, income:INCOME_CATS, saving:SAVING_CATS};
const PRIORITIES = [
  {id:'high',label:'高',color:'#BE6B50'},
  {id:'medium',label:'中',color:'#C99B3F'},
  {id:'low',label:'低',color:'#7A8CA3'},
  {id:'none',label:'无',color:'#8C8779'},
];
const PIE_COLORS = ['#C9A961','#BE6B50','#74997F','#9C8EC4','#B27E52','#7A8CA3','#8C8779','#D9B15C'];

const HABIT_COLORS = ['#9C8EC4','#BE6B50','#74997F','#C99B3F','#B08F4A','#B27E52'];
// 旧版习惯颜色 → 新配色(习惯颜色存在数据里,载入时迁移)
const OLD_HABIT_COLORS = {'#6B5B95':'#9C8EC4','#B54834':'#BE6B50','#4C7A5E':'#74997F','#D9A441':'#C99B3F','#3D5A6C':'#B08F4A','#8C7A5B':'#B27E52'};
const WEEKDAYS = ['日','一','二','三','四','五','六'];
const MOODS = ['😄','🙂','😐','😞','😭'];

const ACCOUNT_ICONS = ['💳','🏦','💵','📱','🐷','📈','🪙','💎'];

const GADGET_CATS = [
  {id:'phone',name:'手机',icon:'📱'},
  {id:'computer',name:'电脑',icon:'💻'},
  {id:'tablet',name:'平板',icon:'🔲'},
  {id:'audio',name:'耳机音响',icon:'🎧'},
  {id:'camera',name:'相机',icon:'📷'},
  {id:'wearable',name:'智能穿戴',icon:'⌚'},
  {id:'game',name:'游戏机',icon:'🎮'},
  {id:'other',name:'其他',icon:'📦'},
];
const CHANNELS = ['线上','线下'];

/* 用本地时区拼日期;toISOString 是 UTC,在 UTC+8 每天 0-8 点会把“今天”算成昨天 */
const localDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = () => localDateStr(new Date());
console.assert(todayStr() === new Date().toLocaleDateString('sv'), '本地日期计算与系统不一致');

let tasks = [];
let txns = [];
let habits = [];
let gadgets = [];
let accounts = [];
let editingTxn = null;
let editingGadget = null;
let editingAccount = null;
let accountFormIcon = ACCOUNT_ICONS[0];
let customCats = {expense:[], income:[], saving:[]};
let recurring = []; // 定期账单规则 {id,type,amount,category,note,day,start,lastPosted}
let priceItems = []; // 比价:{id,name,createdAt,prices:[{id,date,amount}]},在"比价"页自己加,不依赖记账本
let ledgerSearch = '';
let budget = 0;
let categoryBudgets = {}; // 分类 -> 该分类本月预算上限 (RM)
let budgetExcludedCats = []; // 这些分类不计入总预算(比如给家人的钱)
let habitHeatYear = {}; // id -> 是否显示年视图(会话内有效即可,不持久化)
let habitMonthOffset = {}; // id -> 月视图往前翻了几个月(会话内有效即可,不持久化)
let gadgetFilter = 'all';
let gadgetFormCat = GADGET_CATS[0].id;
let gadgetFormChannel = CHANNELS[0];
let habitFreqType = 'daily'; // daily | weekly | weeklyCount
let habitSelectedDays = [1,2,3,4,5]; // default weekdays for weekly picker
let habitWeeklyTarget = 3; // 「每周 N 次」的默认次数
let journal = {}; // 'YYYY-MM-DD' -> {mood, text} 心情随笔
let editingJournalDate = null; // 点了某条历史随笔时设为该日期,回到今天设回 null
let journalHidden = localStorage.getItem('shiji-journal-hidden')!=='0'; // 默认打码,点一下才看
function toggleJournalHidden(){
  journalHidden = !journalHidden;
  localStorage.setItem('shiji-journal-hidden', journalHidden?'1':'0');
}
let taskView = 'list'; // list | cal
let calCursor = todayStr().slice(0,7);
let calSelected = todayStr();
let activeTab = 'tasks';
let taskFilter = 'active';
let taskList = 'all';
let expandedTask = null;
let ledgerCursor = todayStr().slice(0,7);
let ledgerType = 'expense';
let ledgerCategory = EXPENSE_CATS[0];
let reimburseFlag = false; // 记支出时勾选"待报销",在记账本顶部的待报销清单里track,一键核销时自动补一笔"报销"收入
let pieChart=null, barChart=null;

const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);
let moneyHidden = localStorage.getItem('shiji-money-hidden')==='1'; // 长按记账本标题切换,隐藏金额防偷窥
function toggleMoneyHidden(){
  moneyHidden = !moneyHidden;
  localStorage.setItem('shiji-money-hidden', moneyHidden?'1':'0');
}
const fmtMoney = n => moneyHidden ? '••••' : (Math.round(n*100)/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
function daysFromToday(dateStr){
  if(!dateStr) return null;
  const d=new Date(dateStr+'T00:00:00'), t=new Date(todayStr()+'T00:00:00');
  return Math.round((d-t)/86400000);
}
function dueLabel(dateStr){
  const diff = daysFromToday(dateStr);
  if(diff===null) return null;
  if(diff===0) return {text:'今天',tone:'warn'};
  if(diff===1) return {text:'明天',tone:'normal'};
  if(diff<0) return {text:`逾期 ${-diff} 天`,tone:'danger'};
  if(diff<=7) return {text:`${diff} 天后`,tone:'normal'};
  return {text:dateStr.slice(5),tone:'normal'};
}

async function loadKey(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw===null) return fallback;
    const v = JSON.parse(raw);
    if(REC_KEYS.includes(key)) return v.filter(r=>!r.del);
    if(key==='shiji-journal') return Object.fromEntries(Object.entries(v).filter(([,e])=>!e || !e.del));
    return v;
  }catch(e){ return fallback; }
}
async function saveKey(key,value){
  try{ localStorage.setItem(key, JSON.stringify(stampRecords(key,value))); }
  catch(e){ console.error('保存失败',e); }
  if(SYNC_KEYS.includes(key)){
    syncMeta[key] = Date.now();
    dirty.add(key); saveSyncState();
    if(session) pushKey(key).then(()=>{ dirty.delete(key); saveSyncState(); }).catch(()=>{});
  }
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

let toastTimer = null;
function toast(msg, undoFn){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  if(undoFn){
    const btn = document.createElement('button');
    btn.textContent = '撤销';
    btn.addEventListener('click', ()=>{ t.classList.remove('show'); undoFn(); });
    t.appendChild(btn);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), undoFn ? 5000 : 2400);
}
// 删除不再 confirm,改为可撤销:先删掉,toast 给 5 秒反悔机会(同步层的行级合并保证撤销跨设备也正确)
// getArr 传 getter 而非数组:撤销窗口内若同步拉取,loadAll 会把全局数组整个换新,闭包里的旧数组就成孤儿了
function removeWithUndo(getArr, id, persist, render, label){
  const arr = getArr();
  const idx = arr.findIndex(x=>x.id===id);
  if(idx<0) return;
  const [rec] = arr.splice(idx,1);
  persist(); render();
  toast(label+'已删除', ()=>{ const cur = getArr(); cur.splice(Math.min(idx,cur.length),0,rec); persist(); render(); });
}

// 手机输入法回车时 keydown 常报 'Unidentified'(keyCode 229),beforeinput 的 insertLineBreak 在单行 input 上也不触发;
// 唯一可靠的是表单提交:输入法的"前往/完成"键必定触发 submit,桌面回车走隐式提交,同一条路
function onEnter(input, fn){
  const form = document.createElement('form');
  form.style.display = 'contents';
  input.replaceWith(form);
  form.appendChild(input);
  form.addEventListener('submit', e=>{ e.preventDefault(); fn(); });
}

async function persistTasks(){ await saveKey('shiji-tasks', tasks); }
async function persistTxns(){ await saveKey('shiji-transactions', txns); }
async function persistHabits(){ await saveKey('shiji-habits', habits); }
async function persistGadgets(){ await saveKey('shiji-gadgets', gadgets); }
async function persistAccounts(){ await saveKey('shiji-accounts', accounts); }
async function persistJournal(){ await saveKey('shiji-journal', journal); }
async function persistRecurring(){ await saveKey('shiji-recurring', recurring); }
async function persistPriceItems(){ await saveKey('shiji-price-items', priceItems); }

async function loadAll(){
  tasks = await loadKey('shiji-tasks', []);
  txns = await loadKey('shiji-transactions', []);
  habits = await loadKey('shiji-habits', []);
  gadgets = await loadKey('shiji-gadgets', []);
  accounts = await loadKey('shiji-accounts', []);
  customCats = await loadKey('shiji-custom-cats', {expense:[], income:[], saving:[]});
  customCats.saving = customCats.saving || []; // 旧数据没有 saving 分类,补上避免后面 .concat 报错
  budget = await loadKey('shiji-budget', 0);
  categoryBudgets = await loadKey('shiji-category-budgets', {});
  budgetExcludedCats = await loadKey('shiji-budget-excluded-cats', []);
  journal = await loadKey('shiji-journal', {});
  recurring = await loadKey('shiji-recurring', []);
  priceItems = await loadKey('shiji-price-items', []);
  habits.forEach(h=>{ if(OLD_HABIT_COLORS[h.color]) h.color = OLD_HABIT_COLORS[h.color]; });
}
