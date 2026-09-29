const state={guide:null,player:null,charges:null,premium:null};
const $=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString(undefined,{maximumFractionDigits:2}):"—";
const money=n=>"$"+Number(n).toLocaleString();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const base=s=>String(s||"").trim().replace(/\/$/,"");

function status(msg,type=""){const e=$("connectStatus");e.textContent=msg;e.className="status "+type;}
function deepFind(o,k){if(!o||typeof o!=="object")return undefined;if(Object.prototype.hasOwnProperty.call(o,k))return o[k];for(const v of Object.values(o)){const f=deepFind(v,k);if(f!==undefined)return f;}}
function findPremium(o){if(!o||typeof o!=="object")return false;for(const [k,v] of Object.entries(o)){if(/premium/i.test(k+" "+(typeof v==="string"?v:"")))return true;if(v&&typeof v==="object"&&findPremium(v))return true;}return false;}
function inventory(o){return deepFind(o,"inventory")||{};}
function amount(inv,id){const x=inv[id];return typeof x==="number"?x:Number(x?.amount||0);}

async function loadGuide(){
  const r=await fetch("data/trucking.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Could not load trucking guide data.");
  state.guide=await r.json();
  renderStatic();
}

async function loadServers(){
  const sel=$("serverSelect");
  sel.innerHTML='<option value="">Choose server…</option>';

  const servers=[
    {name:"Main",url:"https://api.tycoon.community"},
    {name:"Beta",url:"https://apibeta.tycoon.community"}
  ];

  servers.forEach(s=>{
    const o=document.createElement("option");
    o.value=s.url;
    o.textContent=s.name;
    sel.appendChild(o);
  });

  const custom=document.createElement("option");
  custom.value="__custom";
  custom.textContent="Custom API base URL…";
  sel.appendChild(custom);
}

function apiUrl(server,vrp){
  server=base(server);
  if(!server)throw new Error("Choose a TT server.");
  const endpoint="data/"+encodeURIComponent(vrp);
  if(server.includes("{endpoint}"))return server.replace("{endpoint}",endpoint);
  if(server.includes("[endpoint]"))return server.replace("[endpoint]",endpoint);
  return server+"/"+endpoint;
}

function parsePlayer(raw){
  const d=raw?.data??raw;
  const inv=inventory(d);
  return {
    xp:Number(deepFind(d,"exp_trucking_trucking")||0),
    job:deepFind(d,"job_title")||deepFind(d,"job_name")||deepFind(d,"job")||"Unknown",
    sub:deepFind(d,"subjob_name")||deepFind(d,"subjob")||"—",
    tokens:amount(inv,"exp_token|trucking|trucking")+amount(inv,"exp_token_a|trucking|trucking"),
    premium:findPremium(d)
  };
}

async function connect(){
  const vrp=$("vrpId").value.trim(),key=$("apiKey").value.trim();
  let server=$("serverSelect").value;
  if(server==="__custom")server=$("customServer").value.trim();
  if(!/^\d+$/.test(vrp))throw new Error("Enter a valid numeric vRP ID.");
  if(!key)throw new Error("Enter your TT private API key.");
  status("Connecting to TT…");
  const r=await fetch(apiUrl(server,vrp),{headers:{"X-Tycoon-Key":key,"Accept":"application/json"}});
  state.charges=r.headers.get("X-Tycoon-Charges");
  if(r.status===401)throw new Error("TT says this route requires a private key.");
  if(r.status===402)throw new Error("This API key has no charges remaining.");
  if(r.status===403)throw new Error("TT rejected the API key.");
  if(!r.ok)throw new Error("TT API returned HTTP "+r.status+".");
  state.player=parsePlayer(await r.json());
  state.premium=state.player.premium;
  sessionStorage.setItem("hammyTT.vrpId",vrp);
  sessionStorage.setItem("hammyTT.server",server);
  renderPlayer();status("Connected. Live TT data loaded.","ok");
}

function renderPlayer(){
  const p=state.player;
  $("truckingXp").textContent=p?fmt(p.xp):"—";
  $("masterState").textContent=p?(p.xp>=1000000?"Master threshold reached":"Below 1M Master threshold"):"Connect for live XP";
  $("jobName").textContent=p?p.job:"—";$("subjobName").textContent=p?p.sub:"—";
  $("truckTokens").textContent=p?fmt(p.tokens):"—";$("apiCharges").textContent=state.charges??"—";
  $("connectionBadge").textContent=p?"Live TT connected":"Offline guide";
  $("connectionBadge").className="badge "+(p?"online":"muted");
  $("disconnectBtn").classList.toggle("hidden",!p);renderProgression();
}

function level(){return Math.max(0,Number($("manualLevel").value)||0);}
function pill(r){return '<div class="route-pill"><strong>'+esc(r.name)+'</strong><small>Level '+r.level+(r.premium?" • Premium":"")+'</small></div>';}

function renderProgression(){
  if(!state.guide)return;
  const lvl=level(),xp=state.player?.xp||0;
  $("milestones").innerHTML=state.guide.milestones.map(m=>{
    const unlocked=m.xp?xp>=m.xp:lvl>=m.level;
    const label=m.xp?m.displayLevel+" lvl":"Lvl "+m.level;
    return '<div class="milestone '+(unlocked?"unlocked":"locked")+'"><div class="level">'+label+'</div><div><strong>'+esc(m.text)+'</strong><small>'+(unlocked?"Unlocked":"Locked")+'</small></div></div>';
  }).join("");
  const available=state.guide.routes.filter(r=>lvl>=r.level&&(!r.premium||state.premium!==false));
  const next=state.guide.routes.filter(r=>lvl<r.level).sort((a,b)=>a.level-b.level).slice(0,4);
  $("availableRoutes").innerHTML=available.length?available.map(pill).join(""):'<div class="route-pill"><small>Raise the manual level to see unlocked routes.</small></div>';
  $("nextUnlocks").innerHTML=next.length?next.map(pill).join(""):'<div class="route-pill"><small>All listed level unlocks reached.</small></div>';
}

function renderCapacity(){
  if(!state.guide)return;
  const t=state.guide.trailers[Number($("trailerSelect").value)||0],c=state.guide.cargo[Number($("cargoSelect").value)||0];
  const override=Number($("capacityOverride").value),cap=override>0?override:t.capacityKg,count=Math.floor(cap/c.weightKg),used=count*c.weightKg;
  $("capacityResult").innerHTML="<strong>"+fmt(count)+" × "+esc(c.name)+"</strong><span>"+fmt(used)+" kg loaded • "+fmt(cap-used)+" kg free • "+fmt(cap)+" kg capacity</span>";
}

function renderRoutes(){
  if(!state.guide)return;
  const q=$("routeSearch").value.trim().toLowerCase();
  const rows=state.guide.routes.filter(r=>!q||(r.name+" "+r.description+" "+(r.subjob||"")).toLowerCase().includes(q));
  $("routeCards").innerHTML=rows.map(r=>'<article class="card"><h3>'+esc(r.name)+'</h3><p>'+esc(r.description)+'</p><div class="req">Level '+r.level+(r.premium?" • Premium":"")+(r.subjob?" • "+esc(r.subjob):"")+'</div></article>').join("");
}

function renderStatic(){
  const g=state.guide;
  $("trailerSelect").innerHTML=g.trailers.map((t,i)=>'<option value="'+i+'">'+esc(t.name)+' — '+fmt(t.capacityKg)+'kg</option>').join("");
  $("cargoSelect").innerHTML=g.cargo.map((c,i)=>'<option value="'+i+'">'+esc(c.name)+' — '+fmt(c.weightKg)+'kg</option>').join("");
  $("trailerRows").innerHTML=g.trailers.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+t.level+'</td><td>'+fmt(t.capacityKg)+' kg</td><td>'+money(t.price)+'</td></tr>').join("");
  renderRoutes();renderCapacity();renderProgression();
}

document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tabpage").forEach(x=>x.classList.toggle("active",x.id===b.dataset.tab));}));
$("serverSelect").addEventListener("change",()=>$("customServerWrap").classList.toggle("hidden",$("serverSelect").value!=="__custom"));
$("connectForm").addEventListener("submit",async e=>{e.preventDefault();try{await connect();}catch(err){status(err.message||String(err),"error");}});
$("disconnectBtn").addEventListener("click",()=>{state.player=null;state.charges=null;state.premium=null;$("apiKey").value="";status("Disconnected.");renderPlayer();});
$("manualLevel").addEventListener("input",renderProgression);
$("trailerSelect").addEventListener("change",renderCapacity);$("cargoSelect").addEventListener("change",renderCapacity);$("capacityOverride").addEventListener("input",renderCapacity);
$("routeSearch").addEventListener("input",renderRoutes);

(async()=>{ $("vrpId").value=sessionStorage.getItem("hammyTT.vrpId")||""; try{await Promise.all([loadGuide(),loadServers()]);}catch(err){status(err.message||String(err),"error");} const s=sessionStorage.getItem("hammyTT.server");if(s&&[...$("serverSelect").options].some(o=>o.value===s))$("serverSelect").value=s;})();
