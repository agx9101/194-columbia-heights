const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value||0));
const date = value => value ? new Intl.DateTimeFormat("en-US",{month:"short",day:"2-digit",year:"numeric"}).format(new Date(`${value}T12:00:00`)) : "—";
const timestamp = value => value ? new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"2-digit",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value)) : "—";
const esc = value => String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const scopeClass = company => /animate/i.test(company)?"animate":/potential/i.test(company)?"potential":"";
const initials = company => company.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();

function wave(){const slashes="////////////////////////////////////////////////////////////////";return `<div class="slash-ribbon"><span>${slashes}</span><span aria-hidden="true">${slashes}</span></div>`;}
function pill(status,extra=""){return `<span class="pill ${extra}">${esc(status)}</span>`;}

function render(data){
  const p=data.project;
  $(".mast-meta span:last-child").textContent=`Last updated ${timestamp(p.lastEditedAt)}`;
  $(".hero h1").innerHTML=esc(p.name).replace(" Columbia","<br>Columbia");
  $(".status-line strong").textContent=p.status;
  $(".status-line span:last-child").textContent=p.phase;
  $(".overview article:nth-child(1) h2").textContent=p.status;
  $(".overview article:nth-child(1) p:last-child").textContent=data.scopes[0]?.milestone||p.milestone;
  $(".overview article:nth-child(2) p:last-child").textContent=p.milestone;
  if(p.cintoo)$(".access a:nth-child(1)").href=p.cintoo;
  if(p.acc)$(".access a:nth-child(2)").href=p.acc;
  if(p.lead){$(".lead-person").lastChild.textContent=p.lead.name||"";const img=$(".lead-person img");if(p.lead.avatar)img.src=p.lead.avatar;}

  $(".progress-grid").innerHTML=data.scopes.map(s=>`<article class="progress-card ${scopeClass(s.company)}"><div class="company">${esc(s.company)}</div><h3>${esc(s.scope)}</h3><p>${esc(s.milestone)}</p>${pill(s.status)}<div class="scope-progress" style="--progress:${s.progress}%" aria-label="${s.progress} percent complete"><div class="scope-progress-meta"><span>Progress</span><strong>${s.progress}%</strong></div><div class="wave-track"><div class="wave-fill" aria-hidden="true">${wave()}</div></div></div></article>`).join("");

  const rows=data.deliverables.map(d=>`<div class="tr" role="row"><div><strong>${esc(d.name)}</strong><small>${esc(d.category)}</small></div><div>${esc(d.discipline)}</div><div>${date(d.issued)}</div><div>${pill(d.status,"neutral")}</div></div>`).join("");
  $(".deliverables").innerHTML='<div class="tr th" role="row"><div>Deliverable</div><div>Discipline</div><div>Issued</div><div>Status</div></div>'+rows;

  const downloadsWrap=$(".downloads-wrap");
  const downloads=data.downloads||[];
  downloadsWrap.hidden=!downloads.length;
  if(downloads.length){
    $(".downloads").innerHTML='<div class="tr th" role="row"><div>File</div><div>Attached to</div><div>Type</div><div>Download</div></div>'+downloads.map(file=>`<a class="tr download-row" role="row" href="${esc(file.url)}" target="_blank" rel="noopener" aria-label="Download ${esc(file.name)}"><div><strong>${esc(file.name)}</strong></div><div>${esc(file.context)}</div><div>${esc(file.type)}</div><div><span class="download-link">Download ↗</span></div></a>`).join("");
  }

  const financial=data.scopes.filter(s=>s.showFinancials);
  $(".collapsible-section .collapse-content").innerHTML=financial.map(s=>`<div class="scope-block ${scopeClass(s.company)}"><div class="scope-title"><div><span>${initials(s.company)}</span><p>${esc(s.company)}</p></div>${pill(s.status)}</div><div class="scope-grid"><div><small>Scope</small><strong>${esc(s.scope)}</strong></div><div><small>Contract fee</small><strong>${money(s.fee)}</strong></div><div><small>Paid to date</small><strong class="paid-money">${money(s.paidToDate)}</strong></div><div><small>Balance</small><strong>${money(s.balance)}</strong></div></div></div>`).join("");

  const schedule=$(".payments-section .collapse-content");
  schedule.innerHTML=financial.map(s=>{const rows=data.payments.filter(x=>x.scopeIds.includes(s.id)).map(x=>`<div class="tr ${/paid/i.test(x.status)?"paid":""}"><div><strong>${esc(x.name)}</strong></div><div>${esc(x.type)}</div><div>${money(x.amount)}</div><div>${pill(/paid/i.test(x.status)?"✓ Paid":x.status,/paid/i.test(x.status)?"paid-pill":"draft")}</div></div>`).join("");return `<h3 class="table-group ${scopeClass(s.company)}-text">${esc(s.company)} · ${esc(s.scope)}</h3><div class="data-table payments"><div class="tr th"><div>Payment</div><div>Type</div><div>Amount</div><div>Status</div></div>${rows}</div>`;}).join("");
  document.body.dataset.synced="true";
}

async function sync(){try{const response=await fetch("/api/project",{cache:"no-store"});if(response.ok)render(await response.json());}catch{}}
sync();setInterval(sync,10000);
