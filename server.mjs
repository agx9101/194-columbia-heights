import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 10000);
const ROOT = join(process.cwd(), "dist");
const PROJECT_ID = process.env.NOTION_PROJECT_PAGE_ID || "3cf19be7-b9d8-8188-82ff-f9e925ae0352";
const NOTION_VERSION = "2025-09-03";
const SOURCES = {
  progress: "43fb016c-d5ed-48cb-a652-8a794c2bef28",
  deliverables: "16d61f21-c120-4d12-b922-c108660d638f",
  scopes: "323e95e4-b890-4222-976e-f61c6b8199e2",
  payments: "017eab8a-7b7d-476c-8d6a-6554cb35ab06"
};

let cache = null;
let cacheTime = 0;
const CACHE_MS = 30_000;

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

function text(prop) {
  const parts = prop?.title || prop?.rich_text || [];
  return parts.map(item => item.plain_text || item.text?.content || "").join("");
}
function value(prop) {
  if (!prop) return null;
  if (prop.type === "title" || prop.type === "rich_text") return text(prop);
  if (prop.type === "url") return prop.url;
  if (prop.type === "number") return prop.number;
  if (prop.type === "checkbox") return prop.checkbox;
  if (prop.type === "select") return prop.select?.name || null;
  if (prop.type === "status") return prop.status?.name || null;
  if (prop.type === "date") return prop.date?.start || null;
  if (prop.type === "people") return (prop.people || []).map(p => ({ id:p.id, name:p.name, avatar:p.avatar_url }));
  if (prop.type === "relation") return (prop.relation || []).map(r => r.id);
  if (prop.type === "formula") return prop.formula?.number ?? prop.formula?.string ?? prop.formula?.boolean ?? null;
  if (prop.type === "rollup") return prop.rollup?.number ?? null;
  return null;
}

async function notion(path, options = {}) {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error("NOTION_API_TOKEN is not configured");
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Notion ${response.status}: ${await response.text()}`);
  return response.json();
}

async function querySource(id) {
  const body = { page_size: 100, filter: { property: "Project", relation: { contains: PROJECT_ID } } };
  const data = await notion(`/data_sources/${id}/query`, { method:"POST", body:JSON.stringify(body) });
  return data.results || [];
}

function visible(page) { return value(page.properties?.["Client Visible"]) !== false; }

async function loadProject() {
  const [project, scopesRaw, assetsRaw, paymentsRaw] = await Promise.all([
    notion(`/pages/${PROJECT_ID}`), querySource(SOURCES.scopes),
    querySource(SOURCES.deliverables), querySource(SOURCES.payments)
  ]);
  const p = project.properties || {};
  const scopes = scopesRaw.filter(visible).map(row => {
    const x = row.properties || {};
    return {
      id: row.id, scope:value(x.Scope) || "", company:value(x.Company) || "",
      milestone:value(x["Current Milestone"]) || "", fee:value(x.Fee) || 0,
      paidToDate:value(x["Paid To Date"]) || 0, balance:value(x.Balance) ?? 0,
      progress:Math.max(0,Math.min(100,Number(value(x["Progress %"]) || 0))),
      status:value(x.Status) || "", showFinancials:value(x["Show Financials"]) !== false
    };
  }).filter(scope => !/ffe/i.test(`${scope.scope} ${scope.company}`));
  const deliverables = assetsRaw.filter(visible).map(row => {
    const x=row.properties || {};
    return { name:value(x.Asset)||"", category:value(x.Category)||"", discipline:value(x.Discipline)||"",
      issued:value(x["Issue Date"]), status:value(x.Status)||"", current:value(x.Current)!==false,
      order:Number(value(x["Sort Order"])||0), url:value(x["External URL"])||null };
  }).filter(x=>x.current).sort((a,b)=>a.order-b.order);
  const payments = paymentsRaw.filter(visible).map(row => {
    const x=row.properties || {};
    return { id:row.id, name:value(x.Payment)||"", type:value(x.Type)||"", amount:Number(value(x.Amount)||0),
      status:value(x.Status)||"", scopeIds:value(x.Scope)||[] };
  });
  return {
    project: {
      name:value(p.Project)||"194 Columbia Heights", address:value(p.Address)||"", status:value(p.Status)||"",
      phase:value(p.Phase)||"", milestone:value(p["Current Milestone"])||"", lastUpdated:value(p["Last Client Update"]),
      cintoo:value(p.Cintoo)||null, acc:value(p.ACC)||null, lead:(value(p["Project Lead"])||[])[0]||null,
      showFinancials:value(p["Show Financials"])!==false, showSchedule:value(p["Show Schedule"])===true,
      showFFE:value(p["Show FFE"])===true
    }, scopes, deliverables, payments, syncedAt:new Date().toISOString()
  };
}

async function getProject(force=false) {
  if (!force && cache && Date.now()-cacheTime<CACHE_MS) return cache;
  cache=await loadProject(); cacheTime=Date.now(); return cache;
}

function json(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
function validSignature(raw,signature){
  const secret=process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  if(!secret||!signature)return false;
  const expected=`sha256=${createHmac("sha256",secret).update(raw).digest("hex")}`;
  const a=Buffer.from(expected),b=Buffer.from(signature);return a.length===b.length&&timingSafeEqual(a,b);
}

async function body(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return Buffer.concat(chunks);}

async function serveStatic(req,res){
  const requested=new URL(req.url,"http://localhost").pathname;
  const clean=normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/,"");
  let file=join(ROOT,clean==="/"?"index.html":clean);
  if(!file.startsWith(ROOT)){res.writeHead(403);res.end("Forbidden");return;}
  try{if((await stat(file)).isDirectory())file=join(file,"index.html");const data=await readFile(file);res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream","Cache-Control":extname(file)===".html"?"no-cache":"public, max-age=3600"});res.end(data);}catch{res.writeHead(404);res.end("Not found");}
}

createServer(async(req,res)=>{
  try{
    if(req.method==="GET"&&req.url.startsWith("/api/project")){return json(res,200,await getProject());}
    if(req.method==="GET"&&req.url==="/health"){return json(res,200,{ok:true,notionConfigured:Boolean(process.env.NOTION_API_TOKEN)});}
    if(req.method==="POST"&&req.url==="/api/notion-webhook"){
      const raw=await body(req);let payload={};try{payload=JSON.parse(raw.toString("utf8"));}catch{return json(res,400,{ok:false});}
      if(payload.verification_token){console.log(`NOTION_WEBHOOK_VERIFICATION_TOKEN=${payload.verification_token}`);return json(res,200,{ok:true});}
      if(!validSignature(raw,req.headers["x-notion-signature"]))return json(res,401,{ok:false});
      cache=null;getProject(true).catch(error=>console.error("Notion refresh failed",error.message));return json(res,200,{ok:true});
    }
    return serveStatic(req,res);
  }catch(error){console.error(error.message);return json(res,503,{error:"Project data is temporarily unavailable"});}
}).listen(PORT,()=>console.log(`194 Columbia Heights portal listening on ${PORT}`));
