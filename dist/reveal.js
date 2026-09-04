const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ease="cubic-bezier(.22,.61,.36,1)";

function copyLivePage(){
  const source=[document.querySelector("header.masthead"),document.querySelector("main"),document.querySelector("footer")];
  const page=document.createElement("div");
  page.className="reveal-page";
  source.forEach(node=>node&&page.append(node.cloneNode(true)));
  page.querySelectorAll("details").forEach(d=>d.open=true);
  page.querySelectorAll("a").forEach(a=>a.removeAttribute("href"));
  return page;
}

function fitScale(){
  const mobile=innerWidth<560;
  const base=mobile?390:innerWidth<900?760:1440;
  return Math.min((innerWidth*(mobile?.92:.88))/base, mobile?1.06:.9);
}

async function animateTo(page,{y=0,scale=1,rotate=0,duration=1500,opacity=1}){
  page.style.transition=`transform ${duration}ms ${ease},opacity ${duration}ms ${ease}`;
  page.style.opacity=opacity;
  page.style.transform=`translate3d(-50%,${y}px,0) scale(${scale}) rotateX(${rotate}deg)`;
  await sleep(duration);
}

async function runReveal(){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  if(new URLSearchParams(location.search).get("reveal")==="0")return;

  document.body.classList.add("reveal-running");
  const overlay=document.createElement("div");
  overlay.className="reveal-overlay";
  overlay.innerHTML=`<div class="reveal-brand">PROJECT OS / 194 COLUMBIA HEIGHTS</div><button class="reveal-skip" type="button">Skip</button><div class="reveal-stage"></div><div class="reveal-project">Brooklyn, New York · Active</div><div class="reveal-flash"></div>`;
  document.body.appendChild(overlay);
  const stage=overlay.querySelector(".reveal-stage");
  const page=copyLivePage();
  stage.appendChild(page);

  let cancelled=false;
  const finish=async()=>{
    if(cancelled)return;
    cancelled=true;
    overlay.classList.add("is-ending");
    await sleep(850);
    overlay.remove();
    document.body.classList.remove("reveal-running");
    scrollTo({top:0,behavior:"instant"});
  };
  overlay.querySelector(".reveal-skip").addEventListener("click",finish,{once:true});
  addEventListener("keydown",e=>{if(e.key==="Escape")finish()},{once:true});

  const base=fitScale();
  const mobile=innerWidth<560;
  const vh=innerHeight;
  page.style.opacity="0";
  page.style.transform=`translate3d(-50%,${vh*.18}px,0) scale(${base*.54}) rotateX(8deg)`;

  await sleep(500);
  if(cancelled)return;
  await animateTo(page,{y:mobile?24:18,scale:base*.92,rotate:0,duration:1800,opacity:1});
  if(cancelled)return;
  await sleep(520);

  // Hero close-up.
  await animateTo(page,{y:mobile?-90:-130,scale:base*1.19,duration:1450});
  if(cancelled)return;
  await sleep(350);

  // Pull out to reveal the dashboard composition.
  await animateTo(page,{y:mobile?-245:-390,scale:base*.76,duration:1500});
  if(cancelled)return;
  await sleep(280);

  // Current progress + live milestones.
  await animateTo(page,{y:mobile?-650:-930,scale:base*.88,duration:1650});
  if(cancelled)return;
  await sleep(420);

  // Deliverables / financial data sweep.
  await animateTo(page,{y:mobile?-1110:-1660,scale:base*.80,duration:1750});
  if(cancelled)return;
  await sleep(360);

  // Payment schedule / full document rhythm.
  await animateTo(page,{y:mobile?-1570:-2320,scale:base*.72,duration:1600});
  if(cancelled)return;
  await sleep(420);

  // Final product pullback.
  await animateTo(page,{y:mobile?-250:-500,scale:base*.49,duration:1900});
  if(cancelled)return;
  await sleep(450);
  const flash=overlay.querySelector(".reveal-flash");
  flash.style.transition="opacity 260ms ease";
  flash.style.opacity=".14";
  await sleep(220);
  flash.style.opacity="0";
  await sleep(260);
  await finish();
}

async function waitForLiveData(){
  const start=performance.now();
  while(!document.body.dataset.synced && performance.now()-start<2200)await sleep(80);
  runReveal();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",waitForLiveData,{once:true});
else waitForLiveData();
