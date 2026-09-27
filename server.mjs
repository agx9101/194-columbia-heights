import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const VERSION = '2025-09-03'; // Deliberately pinned, not a claim to be the latest API version.
const TTL = 30_000, SESSION = 12 * 60 * 60 * 1000;
const sourceKeys = { scopes:'SCOPES', payments:'PAYMENTS', assets:'ASSETS', updates:'UPDATES', milestones:'MILESTONES', ffe:'FFE' };
const norm = id => String(id || '').replaceAll('-', '').toLowerCase();
const uuid = id => /^[0-9a-f]{32}$/i.test(norm(id));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const val = p => {
  if (!p) return null;
  if (p.type === 'title' || p.type === 'rich_text') return (p[p.type] || []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
  if (p.type === 'select' || p.type === 'status') return p[p.type]?.name ?? null;
  if (p.type === 'date') return p.date?.start ?? null;
  if (p.type === 'relation') return (p.relation || []).map(x => x.id);
  if (p.type === 'people') return (p.people || []).map(x => ({name:x.name || '', avatar:safeURL(x.avatar_url)}));
  return ['number','checkbox','url'].includes(p.type) ? p[p.type] : null;
};
export function safeURL(raw) { try { const u = new URL(raw); return u.protocol === 'https:' ? u.href : null; } catch { return null; } }
const files = (p, key) => (p?.[key]?.files || []).map(f => ({name:f.name || 'File', url:safeURL(f.file?.url || f.external?.url)})).filter(f => f.url);
const number = p => { const n=val(p); return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const sum = list => Math.round(list.reduce((a,b)=>a+(b || 0),0)*100)/100;
const sameSecret = (a,b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
const header = {
  'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow, noarchive, nosnippet, noimageindex',
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function reply(res, status, data, extra={}) { res.writeHead(status, {...header,'Content-Type':'application/json; charset=utf-8',...extra}); res.end(JSON.stringify(data)); }

// Defense in depth: query filters AND serialization filters both enforce tenant/visibility boundaries.
export function buildProject(page, records, projectId) {
  if (norm(page.id) !== norm(projectId) || val(page.properties?.['Client Visible']) !== true || page.archived || page.in_trash) throw new Error('Project unavailable');
  const p = page.properties || {};
  const selected = key => (records[key] || []).filter(r => !r.archived && !r.in_trash && val(r.properties?.['Client Visible']) === true && (val(r.properties?.Project) || []).some(id => norm(id) === norm(projectId)));
  const showFinancials = val(p['Show Financials']) === true, showFFE = val(p['Show FFE']) === true, showSchedule = val(p['Show Schedule']) === true;
  const scopesRaw = selected('scopes');
  const scopeIds = new Set(scopesRaw.map(r=>norm(r.id)));
  const financeIds = new Set(scopesRaw.filter(r=>showFinancials && val(r.properties?.['Show Financials'])===true).map(r=>norm(r.id)));
  const paymentRows = selected('payments').filter(r => (val(r.properties?.Scope)||[]).some(id=>financeIds.has(norm(id))));
  const payments = paymentRows.map(r=>{const q=r.properties;return {id:r.id,name:val(q.Payment),type:val(q.Type),amount:number(q.Amount),status:val(q.Status),scopeIds:val(q.Scope)||[],invoice:val(q['Invoice #']),due:val(q['Due Date']),paidDate:val(q['Paid Date'])};}).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  const scopes = scopesRaw.map(r=>{
    const q=r.properties, financial=financeIds.has(norm(r.id));
    const received=sum(payments.filter(x=>x.status==='Paid' && x.scopeIds.some(id=>norm(id)===norm(r.id))).map(x=>x.amount));
    const fee=financial?number(q.Fee):null, progress=number(q['Progress %']);
    return {id:r.id,name:val(q.Scope),company:val(q.Company),status:val(q.Status),milestone:val(q['Current Milestone']),progress:progress===null?null:Math.max(0,Math.min(100,progress)),fee,received:financial?received:null,remaining:fee===null?null:Math.round((fee-received)*100)/100,showFinancials:financial};
  });
  const assets = selected('assets').filter(r=>val(r.properties.Current)===true && val(r.properties.Status)==='Current').map(r=>{const q=r.properties;return {id:r.id,name:val(q.Asset),category:val(q.Category),status:val(q.Status),issued:val(q['Issue Date']),description:val(q.Description),order:number(q['Sort Order'])??999,url:safeURL(val(q['External URL'])),files:files(q,'File')};}).sort((a,b)=>a.order-b.order);
  const downloads = scopesRaw.filter(r=>financeIds.has(norm(r.id))).flatMap(r=>files(r.properties,'Files').map(f=>({...f,context:val(r.properties.Scope)})));
  const updates = selected('updates').map(r=>{const q=r.properties;return {name:val(q.Update),date:val(q.Date),summary:val(q.Summary),status:val(q.Status),pinned:val(q.Pinned)===true};}).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||String(b.date||'').localeCompare(a.date||''));
  const milestones = showSchedule ? selected('milestones').map(r=>{const q=r.properties;return {name:val(q.Milestone),status:val(q.Status),party:val(q['Responsible Party']),date:val(q['Target Date']),completed:val(q['Completed Date']),notes:val(q.Notes),sequence:number(q.Sequence)??999};}).sort((a,b)=>a.sequence-b.sequence) : [];
  const ffe = showFFE ? selected('ffe').map(r=>{const q=r.properties;return {name:val(q['FFE Item']),type:val(q.Type),room:val(q.Room),qty:number(q.Qty),unit:val(q.Unit),vendor:val(q.Vendor),procuredBy:val(q['Procured By']),manufacturer:val(q.Manufacturer),model:val(q.Model),price:showFinancials&&val(q['Show Pricing'])===true?number(q['Unit Price']):null,url:safeURL(val(q['Purchase URL'])),image:files(q,'Image')[0]||null,approved:val(q.Approved)===true,ordered:val(q.Ordered)===true,delivered:val(q.Delivered)===true,eta:val(q.ETA),notes:val(q.Notes)};}).filter(x=>x.name) : [];
  const hero = files(p,'Files & media').find(f=>/\.(jpe?g|png|webp|gif)(?:$|\?)/i.test(f.name)) || null;
  return { project:{ name:val(p.Project)||'Client Project',address:val(p.Address),summary:val(p['Project Summary']),status:val(p.Status),phase:val(p.Phase),milestone:val(p['Current Milestone']),lead:(val(p['Project Lead'])||[])[0]||null,lastUpdated:val(p['Last Client Update']),area:number(p['Area SF']),allowance:showFinancials?number(p['FFE Allowance']):null,procurement:val(p['Procurement Status']),hero,polycam:safeURL(val(p.Polycam)),cintoo:safeURL(val(p.Cintoo)),acc:safeURL(val(p.ACC)),showFinancials,showFFE,showSchedule }, scopes,payments,assets,downloads,updates,milestones,ffe,syncedAt:new Date().toISOString() };
}

export function makeServer(env=process.env, transport=fetch) {
  const projectId=env.NOTION_PROJECT_PAGE_ID;
  const sources=Object.fromEntries(Object.entries(sourceKeys).map(([k,v])=>[k,env[`NOTION_${v}_DATA_SOURCE_ID`]]));
  const authReady=Boolean(env.PORTAL_PASSWORD && env.PORTAL_PASSWORD.length>=12 && env.PORTAL_SESSION_SECRET?.length>=32 && uuid(projectId));
  const dataReady=Boolean(env.NOTION_API_TOKEN && uuid(projectId) && Object.values(sources).every(uuid));
  const secure=env.NODE_ENV==='production' || Boolean(env.RENDER);
  const cookie=(value,age)=>`portal_session=${value}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}`;
  const signed=expiry=>`${expiry}.${createHmac('sha256',env.PORTAL_SESSION_SECRET||'').update(`${norm(projectId)}:${expiry}`).digest('hex')}`;
  const authenticated=req=>{
    if (!authReady) return false;
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('portal_session='))?.slice(15);
    if (!token || token.length>100) return false;
    const exp=token.split('.')[0], now=Date.now();
    return /^\d+$/.test(exp) && Number(exp)>now && Number(exp)<=now+SESSION && sameSecret(token,signed(exp));
  };
  const attempts=new Map(); let cache=null, cacheAt=0, pending=null, queue=Promise.resolve(), lastRequest=0;
  async function notion(path, options={}) {
    const run=async()=>{
      for(let attempt=0;attempt<3;attempt++) {
        await wait(Math.max(0,350-(Date.now()-lastRequest))); lastRequest=Date.now();
        const response=await transport(`https://api.notion.com/v1${path}`,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.NOTION_API_TOKEN}`,'Notion-Version':VERSION,'Content-Type':'application/json'}});
        if(response.status===429 || response.status>=500) { const sec=Number(response.headers.get('retry-after'))||1; if(attempt<2){await wait(Math.min(10,sec)*1000);continue;} }
        if(!response.ok) throw new Error(`Notion request failed (${response.status})`);
        return response.json();
      }
    };
    const task=queue.then(run,run); queue=task.catch(()=>{}); return task;
  }
  async function query(id) {
    const rows=[]; let cursor;
    for(let page=0;page<100;page++) {
      const result=await notion(`/data_sources/${id}/query`,{method:'POST',body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{}),filter:{and:[{property:'Project',relation:{contains:projectId}},{property:'Client Visible',checkbox:{equals:true}}]}})});
      rows.push(...(result.results||[]));
      if(!result.has_more) return rows;
      if(!result.next_cursor || result.next_cursor===cursor) throw new Error('Invalid pagination');
      cursor=result.next_cursor;
    }
    throw new Error('Data source exceeds configured page limit');
  }
  async function project() {
    if(!dataReady) throw new Error('Project integration not configured');
    if(cache && Date.now()-cacheAt<TTL) return cache;
    if(pending) return pending;
    pending=(async()=>{
      const page=await notion(`/pages/${projectId}`);
      if(val(page.properties?.['Client Visible'])!==true || page.archived || page.in_trash) throw new Error('Project unavailable');
      const records={};
      for(const [key,id] of Object.entries(sources)) {
        const skip=(key==='ffe'&&val(page.properties?.['Show FFE'])!==true)||(key==='milestones'&&val(page.properties?.['Show Schedule'])!==true)||(key==='payments'&&val(page.properties?.['Show Financials'])!==true);
        records[key]=skip?[]:await query(id);
      }
      const result=buildProject(page,records,projectId); cache=result; cacheAt=Date.now(); return result;
    })();
    try{return await pending;}finally{pending=null;}
  }
  async function payload(req) {
    let size=0; const parts=[];
    for await(const part of req){size+=part.length;if(size>8192)throw new Error('Request too large');parts.push(part);}
    return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
  }
  const staticFiles={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/portal.css':['portal.css','text/css'],'/robots.txt':['robots.txt','text/plain']};
  const server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='POST'){
        if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return reply(res,403,{error:'Request rejected'});
        if(req.headers['sec-fetch-site']==='cross-site')return reply(res,403,{error:'Request rejected'});
      }
      if(path==='/health'&&req.method==='GET')return reply(res,200,{ok:true});
      if(path==='/api/session'&&req.method==='GET')return reply(res,200,{authenticated:authenticated(req),ready:authReady&&dataReady});
      if(path==='/api/login'&&req.method==='POST'){
        if(!authReady||!dataReady)return reply(res,503,{error:'This portal is awaiting configuration.'});
        const now=Date.now(),ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();
        for(const [key,value]of attempts){if(now-value.start>600000)attempts.delete(key);}
        const rec=attempts.get(ip)||{start:now,count:0};
        if(rec.count>=8 || attempts.size>1000)return reply(res,429,{error:'Too many attempts. Try again later.'},{'Retry-After':'600'});
        let body;try{body=await payload(req);}catch{return reply(res,400,{error:'Invalid request'});}
        if(typeof body.password!=='string'||!sameSecret(body.password,env.PORTAL_PASSWORD)){attempts.set(ip,{...rec,count:rec.count+1});return reply(res,401,{error:'Incorrect project password.'});}
        attempts.delete(ip);return reply(res,200,{ok:true},{'Set-Cookie':cookie(signed(now+SESSION),SESSION/1000)});
      }
      if(path==='/api/logout'&&req.method==='POST')return reply(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
      if(path==='/api/project'&&req.method==='GET'){
        if(!authenticated(req))return reply(res,401,{error:'Project password required.'});
        return reply(res,200,await project());
      }
      if((req.method==='GET'||req.method==='HEAD')&&staticFiles[path]){
        const [name,type]=staticFiles[path];const bytes=await readFile(join(ROOT,name));res.writeHead(200,{...header,'Content-Type':`${type}; charset=utf-8`});return res.end(req.method==='HEAD'?undefined:bytes);
      }
      return reply(res,404,{error:'Not found'});
    } catch(error) { console.error('Portal request failed:',error.name); if(!res.headersSent)return reply(res,503,{error:'Project data is temporarily unavailable. Please retry shortly.'});res.end(); }
  });
  server.requestTimeout=20000;server.headersTimeout=15000;
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) makeServer().listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Animate Lot client portal listening'));
