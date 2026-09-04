const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value||0));
const date = value => value ? new Intl.DateTimeFormat("en-US",{month:"short",day:"2-digit",year:"numeric"}).format(new Date(`${value}T12:00:00`)) : "—";
const timestamp = value => value ? new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"2-digit",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value)) : "—";
const esc = value => String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const scopeClass = company => /animate/i.test(company)?"animate":/potential/i.test(company)?"potential":"";
const initials = company => company.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();

function wave(){const slashes="////////////////////////////////////////////////////////////////";return `<div class="slash-ribbon"><span>${slashes}</span><span aria-hidden="true">${slashes}</span></div>`;}
function pill(status,extra=""){return `<span class="pill ${extra}">${esc(status)}</span>`;}
function protectedMoney(value,locked,extra=""){return locked?`<button type="button" class="sensitive-value ${extra}" data-unlock aria-label="Unlock protected financial value">••••••</button>`:`<span class="${extra}">${money(value)}</span>`;}

function dayKey(value){return new Date(`${value}T12:00:00`);}
function renderGantt(items=[]){
  const wrap=$(".milestone-gantt");
  wrap.hidden=!items.length;
  if(!items.length)return;
  const starts=items.map(x=>dayKey(x.start).getTime()),ends=items.map(x=>dayKey(x.end||x.start).getTime());
  const first=new Date(Math.min(...starts)),last=new Date(Math.max(...ends));
  const dayMs=86400000,days=Math.max(1,Math.round((last-first)/dayMs)+1);
  const offset=value=>Math.round((dayKey(value)-first)/dayMs)+1;
  const labels=Array.from({length:days},(_,i)=>{const d=new Date(first.getTime()+i*dayMs);return `<span><b>${d.toLocaleDateString("en-US",{weekday:"short"})}</b>${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>`;}).join("");
  const rows=items.map(item=>{const start=offset(item.start),span=Math.max(1,offset(item.end||item.start)-start+1);return `<div class="gantt-row"><div class="gantt-label"><strong>${esc(item.name)}</strong><span>${esc(item.party)} · ${esc(item.status)}</span></div><div class="gantt-track" style="--days:${days}"><i class="gantt-bar" style="--start:${start};--span:${span}" title="${esc(item.name)} — ${date(item.start)}"></i></div></div>`;}).join("");
  $(".gantt-chart").innerHTML=`<div class="gantt-dates"><span></span><div style="--days:${days}">${labels}</div></div>${rows}`;
}

function render(data){
  const p=data.project;
  $(".mast-meta span:last-child").textContent=`Last updated ${timestamp(p.lastEditedAt)}`;
  $(".hero h1").innerHTML=esc(p.name).replace(" Columbia","<br>Columbia");
  $(".status-line strong").textContent=p.status;
  $(".status-line span:last-child").textContent=p.phase;
  const projectStatus=$(".overview article:nth-child(1) h2");
  projectStatus.classList.toggle("active-heading",/^active$/i.test(p.status));
  projectStatus.innerHTML=/^active$/i.test(p.status)?`<span class="status-dot" aria-hidden="true"></span><span>${esc(p.status)}</span>`:esc(p.status);
  $(".overview article:nth-child(1) p:last-child").textContent=data.scopes[0]?.milestone||p.milestone;
  $(".overview article:nth-child(2) p:last-child").textContent=p.milestone;
  if(p.cintoo)$(".access a:nth-child(1)").href=p.cintoo;
  if(p.acc)$(".access a:nth-child(2)").href=p.acc;
  if(p.lead){$(".lead-person").lastChild.textContent=p.lead.name||"";const img=$(".lead-person img");if(p.lead.avatar)img.src=p.lead.avatar;}

  $(".progress-grid").innerHTML=data.scopes.map(s=>`<article class="progress-card ${scopeClass(s.company)}"><div class="company">${esc(s.company)}</div><h3>${esc(s.scope)}</h3><p>${esc(s.milestone)}</p>${pill(s.status)}<div class="scope-progress" style="--progress:${s.progress}%" aria-label="${s.progress} percent complete"><div class="scope-progress-meta"><span>Progress</span><strong>${s.progress}%</strong></div><div class="wave-track"><div class="wave-fill" aria-hidden="true">${wave()}</div></div></div></article>`).join("");
  renderGantt(data.milestones||[]);

  const rows=data.deliverables.map(d=>`<div class="tr" role="row"><div><strong>${esc(d.name)}</strong><small>${esc(d.category)}</small></div><div>${esc(d.discipline)}</div><div>${date(d.issued)}</div><div>${pill(d.status,"neutral")}</div></div>`).join("");
  $(".deliverables").innerHTML='<div class="tr th" role="row"><div>Deliverable</div><div>Discipline</div><div>Issued</div><div>Status</div></div>'+rows;

  const downloadsWrap=$(".downloads-wrap");
  const downloads=data.downloads||[];
  downloadsWrap.hidden=!downloads.length;
  if(downloads.length){
    $(".downloads").innerHTML='<div class="tr th" role="row"><div>File</div><div>Attached to</div><div>Type</div><div>Download</div></div>'+downloads.map(file=>data.locked?`<button type="button" class="tr download-row locked-download" role="row" data-unlock aria-label="Unlock ${esc(file.name)}"><div><strong>${esc(file.name)}</strong></div><div>${esc(file.context)}</div><div>${esc(file.type)}</div><div><span class="download-link">Protected ↗</span></div></button>`:`<a class="tr download-row" role="row" href="${esc(file.url)}" target="_blank" rel="noopener" aria-label="Download ${esc(file.name)}"><div><strong>${esc(file.name)}</strong></div><div>${esc(file.context)}</div><div>${esc(file.type)}</div><div><span class="download-link">Download ↗</span></div></a>`).join("");
  }

  const financial=data.scopes.filter(s=>s.showFinancials);
  $(".financials-section .collapse-content").innerHTML=financial.map(s=>`<div class="scope-block ${scopeClass(s.company)}"><div class="scope-title"><div><span>${initials(s.company)}</span><p>${esc(s.company)}</p></div>${pill(s.status)}</div><div class="scope-grid"><div><small>Scope</small><strong>${esc(s.scope)}</strong></div><div><small>Contract fee</small><strong>${protectedMoney(s.fee,data.locked)}</strong></div><div><small>Paid to date</small><strong>${protectedMoney(s.paidToDate,data.locked,"paid-money")}</strong></div><div><small>Balance</small><strong>${protectedMoney(s.balance,data.locked)}</strong></div></div></div>`).join("");

  const schedule=$(".payments-section .collapse-content");
  schedule.innerHTML=financial.map(s=>{const rows=data.payments.filter(x=>x.scopeIds.includes(s.id)).map(x=>`<div class="tr ${/paid/i.test(x.status)?"paid":""}"><div><strong>${esc(x.name)}</strong></div><div>${esc(x.type)}</div><div>${protectedMoney(x.amount,data.locked)}</div><div>${pill(/paid/i.test(x.status)?"✓ Paid":x.status,/paid/i.test(x.status)?"paid-pill":"draft")}</div></div>`).join("");return `<h3 class="table-group ${scopeClass(s.company)}-text">${esc(s.company)} · ${esc(s.scope)}</h3><div class="data-table payments"><div class="tr th"><div>Payment</div><div>Type</div><div>Amount</div><div>Status</div></div>${rows}</div>`;}).join("");
  document.body.dataset.synced="true";
}

async function sync(){try{const response=await fetch("/api/project",{cache:"no-store"});if(response.ok)render(await response.json());}catch{}}
const dialog=$(".value-dialog");
document.addEventListener("click",event=>{if(event.target.closest("[data-unlock]")){dialog.showModal();dialog.querySelector("input").focus();}});
dialog.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
dialog.querySelector("form").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector("button"),message=form.querySelector(".gate-message");
    button.disabled=true;message.textContent="Checking…";
    try{
      const response=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:new FormData(form).get("password")})});
      if(response.ok){dialog.close();form.reset();message.textContent="";await sync();return;}
      message.textContent=response.status===429?"Too many attempts. Try again shortly.":"Incorrect password.";
    }catch{message.textContent="Unable to connect. Try again.";}
    button.disabled=false;form.password.focus();
});
sync();setInterval(sync,10000);
