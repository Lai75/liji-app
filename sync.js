/* ---------------- cloud sync (Supabase) ---------------- */
const SB_URL = 'https://xmiqcomltvkbodbqaycg.supabase.co';
const SB_KEY = 'sb_publishable_r6MiUsRs3CsmPggYhEqY0g_bh95lo5I';
const SYNC_KEYS = ['shiji-tasks','shiji-transactions','shiji-habits','shiji-gadgets','shiji-custom-cats','shiji-budget','shiji-journal'];
let session = JSON.parse(localStorage.getItem('shiji-session')||'null');
let syncMeta = JSON.parse(localStorage.getItem('shiji-sync-meta')||'{}'); // key -> 本地值的时间戳(ms)
let dirty = new Set(JSON.parse(localStorage.getItem('shiji-dirty')||'[]')); // 尚未推到云端的 key
let syncing = false;
let lastSyncAt = null;

function saveSession(s){
  if(s && !s.expires_at) s.expires_at = Math.floor(Date.now()/1000) + (s.expires_in||3600);
  session = s;
  s ? localStorage.setItem('shiji-session',JSON.stringify(s)) : localStorage.removeItem('shiji-session');
}
function saveSyncState(){ localStorage.setItem('shiji-sync-meta',JSON.stringify(syncMeta)); localStorage.setItem('shiji-dirty',JSON.stringify([...dirty])); }

async function sbAuth(path, body){
  const r = await fetch(`${SB_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.msg||d.error_description||d.message||('HTTP '+r.status));
  return d;
}
async function ensureSession(){
  if(!session) return null;
  if(Date.now() < (session.expires_at-60)*1000) return session;
  try{
    saveSession(await sbAuth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}));
    return session;
  }catch(e){
    if(/refresh/i.test(e.message)) saveSession(null); // refresh token 失效 → 视为已退出
    return null; // 网络错误则保留 session,本次跳过同步
  }
}
async function sbRest(path, opts={}){
  const s = await ensureSession();
  if(!s) throw new Error('未登录');
  const r = await fetch(`${SB_URL}/rest/v1/${path}`,{...opts,headers:{apikey:SB_KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',...(opts.headers||{})}});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.status===204 ? null : r.json();
}
async function pushKey(key){
  const raw = localStorage.getItem(key);
  if(raw===null) return;
  syncMeta[key] = syncMeta[key] || Date.now();
  await sbRest('kv?on_conflict=user_id,key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},
    body:JSON.stringify([{key, value:JSON.parse(raw), updated_at:new Date(syncMeta[key]).toISOString()}])});
}
/* 行级合并:存盘时集中给变过的记录盖 u(updatedAt)、给消失的 id 记墓碑(del),
   业务代码完全不用管;同步时按 id/日期逐条比 u,大的赢,墓碑同样参与所以删除也能同步。 */
const REC_KEYS = ['shiji-tasks','shiji-transactions','shiji-habits','shiji-gadgets'];
const TOMB_TTL = 90*86400000; // 墓碑留 90 天,防止老设备把删掉的记录同步回来
const stripU = r => JSON.stringify({...r, u:0});
function stampRecords(key, value){
  const now = Date.now();
  let prev; try{ prev = JSON.parse(localStorage.getItem(key)); }catch(e){ prev = null; }
  if(REC_KEYS.includes(key)){
    const old = new Map((prev||[]).map(r=>[r.id,r]));
    for(const r of value){
      const o = old.get(r.id); old.delete(r.id);
      r.u = o && stripU(o)===stripU(r) ? (o.u||now) : now;
    }
    const tombs = [...old.values()].map(r=> r.del ? r : {id:r.id, del:1, u:now}).filter(r=> now-(r.u||0) < TOMB_TTL);
    return [...value, ...tombs];
  }
  if(key==='shiji-journal'){
    const old = {...(prev||{})};
    const out = {};
    for(const [d,e] of Object.entries(value)){
      const o = old[d]; delete old[d];
      e.u = o && stripU(o)===stripU(e) ? (o.u||now) : now;
      out[d] = e;
    }
    for(const [d,o] of Object.entries(old)){
      const t = o && o.del ? o : {del:1, u:now};
      if(now-(t.u||0) < TOMB_TTL) out[d] = t;
    }
    return out;
  }
  return value;
}
// ponytail: 合并结果的排序以「key 级时间戳较新的一侧」为底,另一侧独有的追加在尾部;两台同时拖拽排序时后同步的赢
function mergeById(localArr, cloudArr, cloudNewer){
  const [base, other] = cloudNewer ? [cloudArr, localArr] : [localArr, cloudArr];
  const rest = new Map(other.map(r=>[r.id,r]));
  const out = base.map(r=>{
    const o = rest.get(r.id); rest.delete(r.id);
    return o && (o.u||0)>(r.u||0) ? o : r;
  });
  return [...out, ...rest.values()];
}
function mergeByDate(local, cloud){
  const out = {...local};
  for(const [d,e] of Object.entries(cloud)) if(!out[d] || (e.u||0)>(out[d].u||0)) out[d] = e;
  return out;
}
async function syncNow(){
  if(!session) return false;
  if(syncing) return true; // 已有一次同步在跑,视作成功
  syncing = true;
  try{
    const rows = await sbRest('kv?select=key,value,updated_at');
    const cloud = Object.fromEntries(rows.map(r=>[r.key,r]));
    let pulled = false;
    for(const key of SYNC_KEYS){
      const c = cloud[key];
      const cloudAt = c ? Date.parse(c.updated_at) : 0;
      const localAt = syncMeta[key] || 0;
      const raw = localStorage.getItem(key);
      const isRec = REC_KEYS.includes(key) && c && Array.isArray(c.value);
      const isJournal = key==='shiji-journal' && c && c.value && !Array.isArray(c.value);
      if(raw!==null && (isRec || isJournal)){
        const local = JSON.parse(raw);
        const merged = isRec ? mergeById(local, c.value, cloudAt>localAt) : mergeByDate(local, c.value);
        const mergedStr = JSON.stringify(merged);
        if(mergedStr !== JSON.stringify(local)){ localStorage.setItem(key, mergedStr); pulled = true; }
        if(mergedStr !== JSON.stringify(c.value)){ syncMeta[key] = Date.now(); await pushKey(key); }
        else syncMeta[key] = Math.max(localAt, cloudAt);
        dirty.delete(key);
      }else if(c && cloudAt > localAt){ // 非记录型 key(budget/customCats)仍按 key 级后写覆盖
        localStorage.setItem(key, JSON.stringify(c.value));
        syncMeta[key] = cloudAt; dirty.delete(key); pulled = true;
      }else if(raw!==null && (localAt > cloudAt || dirty.has(key))){
        await pushKey(key); dirty.delete(key);
      }
    }
    saveSyncState();
    lastSyncAt = new Date();
    if(pulled){ await loadAll(); setTab(activeTab); }
    else if(activeTab==='overview') renderOverview();
    return true;
  }catch(e){ console.warn('同步失败', e.message); return false; }
  finally{ syncing = false; }
}
window.addEventListener('online', ()=>syncNow());
setInterval(()=>{ if(document.visibilityState==='visible') syncNow(); }, 60000); // 页面开着也每分钟拉一次
