const state={
  guide:null,player:null,charges:null,premium:null,
  apiKey:"",vrpId:"",server:"",
  benchmark:null,benchmarkTimer:null
};

const $=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString(undefined,{maximumFractionDigits:2}):"—";
const money=n=>"$"+Number(n).toLocaleString();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const base=s=>String(s||"").trim().replace(/\/$/,"");

function status(msg,type=""){const e=$("connectStatus");e.textContent=msg;e.className="status "+type;}
function amount(inv,id){const x=inv?.[id];return typeof x==="number"?x:Number(x?.amount||0);}

async function loadGuide(){
  const r=await fetch("data/trucking.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Could not load trucking guide data.");
  state.guide=await r.json();
  renderStatic();
}

async function loadServers(){
  const sel=$("serverSelect");
  sel.innerHTML='<option value="">Choose server…</option>';
  [
    {name:"Main",url:"https://api.tycoon.community"},
    {name:"Beta",url:"https://apibeta.tycoon.community"}
  ].forEach(s=>{
    const o=document.createElement("option");
    o.value=s.url;o.textContent=s.name;sel.appendChild(o);
  });
  const custom=document.createElement("option");
  custom.value="__custom";custom.textContent="Custom API base URL…";sel.appendChild(custom);
}

function dataUrl(server,vrp){
  server=base(server);
  if(!server)throw new Error("Choose a TT server.");
  return server+"/data/"+encodeURIComponent(vrp);
}

function parsePlayer(raw){
  const d=raw?.data??raw;
  const inv=d.inventory||{};
  const groups=d.groups||{};
  const vehicle=d.vehicle||{};
  const xp=Number(d.gaptitudes_v?.trucking?.trucking||0);

  let sub="Commercial";
  if(groups.trucker_master)sub="Master";
  else if(groups.trucker_illegal)sub="Illegal";
  else if(groups.trucker_military)sub="Military";
  else if(groups.trucker_petrochemical)sub="Petrochemical";
  else if(groups.trucker_refrigerated)sub="Refrigerated";

  return {
    xp,
    job:groups.trucker?"Trucker":"Not currently a Trucker",
    sub,
    rawTokens:amount(inv,"exp_token|trucking|trucking"),
    bonusTokens:amount(inv,"exp_token_a|trucking|trucking"),
    premium:!!(groups.license_premium||d.licenses?.premium),
    master:!!groups.trucker_master,
    vehicleName:vehicle.vehicle_name||vehicle.vehicle_spawn||"—",
    vehicleSpawn:vehicle.vehicle_spawn||"—",
    trailer:vehicle.trailer||vehicle.owned_vehicles?.trailer||"—",
    hasTrailer:!!vehicle.has_trailer
  };
}

async function fetchLivePlayer(){
  if(!state.apiKey||!state.vrpId||!state.server)throw new Error("Connect your TT account first.");
  const r=await fetch(dataUrl(state.server,state.vrpId),{
    headers:{"X-Tycoon-Key":state.apiKey,"Accept":"application/json"}
  });
  state.charges=r.headers.get("X-Tycoon-Charges");
  if(r.status===401)throw new Error("TT says this route requires a private key.");
  if(r.status===402)throw new Error("This API key has no charges remaining.");
  if(r.status===403)throw new Error("TT rejected the API key.");
  if(!r.ok)throw new Error("TT API returned HTTP "+r.status+".");
  const p=parsePlayer(await r.json());
  state.player=p;state.premium=p.premium;
  renderPlayer();
  return p;
}

async function connect(){
  const vrp=$("vrpId").value.trim(),key=$("apiKey").value.trim();
  let server=$("serverSelect").value;
  if(server==="__custom")server=$("customServer").value.trim();
  if(!/^\d+$/.test(vrp))throw new Error("Enter a valid numeric vRP ID.");
  if(!key)throw new Error("Enter your TT private API key.");
  state.apiKey=key;state.vrpId=vrp;state.server=server;
  status("Connecting to TT…");
  await fetchLivePlayer();
  sessionStorage.setItem("hammyTT.vrpId",vrp);
  sessionStorage.setItem("hammyTT.server",server);
  status("Connected. Personalized trucking advice is ready.","ok");
}

function effectiveLevel(){
  if(state.player?.master||state.player?.xp>=1000000)return 631.96;
  return Math.max(0,Number($("manualLevel").value)||0);
}

function renderPlayer(){
  const p=state.player;
  $("truckingXp").textContent=p?fmt(p.xp):"—";
  $("masterState").textContent=p?(p.master?"Master Trucker active":(p.xp>=1000000?"Master threshold reached":"Live XP loaded")):"Connect for live XP";
  $("jobName").textContent=p?p.job:"—";
  $("subjobName").textContent=p?(p.sub+" • "+p.vehicleName+(p.hasTrailer?" + "+p.trailer:"")):"—";
  $("truckTokens").textContent=p?fmt(p.bonusTokens):"—";
  $("truckTokenDetail").textContent=p?(p.rawTokens?fmt(p.rawTokens)+" raw EXP Tokens • ":"")+"≈ "+fmt(p.bonusTokens*.1)+" bonus XP available":"Converted Bonus EXP in inventory";
  $("apiCharges").textContent=state.charges??"—";
  $("connectionBadge").textContent=p?"Live TT connected":"Offline guide";
  $("connectionBadge").className="badge "+(p?"online":"muted");
  $("disconnectBtn").classList.toggle("hidden",!p);
  if(p?.master||p?.xp>=1000000)$("manualLevel").value="631.96";
  renderProgression();
  renderPersonal();
}

function benchmarkKey(){
  return "hammyTT.benchmarks."+(state.vrpId||"guest");
}

function getBenchmarks(){
  try{return JSON.parse(localStorage.getItem(benchmarkKey())||"[]");}catch(_){return [];}
}

function saveBenchmarks(rows){
  localStorage.setItem(benchmarkKey(),JSON.stringify(rows.slice(-100)));
}

function aggregateBenchmarks(){
  const map=new Map();
  for(const r of getBenchmarks()){
    if(!Number.isFinite(r.seconds)||!Number.isFinite(r.xpGained)||r.seconds<=0||r.xpGained<0)continue;
    const a=map.get(r.activityId)||{activityId:r.activityId,xp:0,seconds:0,runs:0,last:0};
    a.xp+=r.xpGained;a.seconds+=r.seconds;a.runs++;a.last=Math.max(a.last,r.timestamp||0);
    map.set(r.activityId,a);
  }
  return [...map.values()].map(a=>({...a,xpPerHour:a.seconds? a.xp/a.seconds*3600:0})).sort((a,b)=>b.xpPerHour-a.xpPerHour);
}

function eligibleActivities(){
  if(!state.guide?.activities)return[];
  const lvl=effectiveLevel();
  return state.guide.activities.filter(a=>lvl>=a.level&&(!a.premium||state.player?.premium));
}

function activityById(id){return state.guide?.activities?.find(a=>a.id===id);}

function recommendation(){
  const eligible=eligibleActivities();
  const measured=aggregateBenchmarks().filter(b=>eligible.some(a=>a.id===b.activityId));
  if(measured.length){
    const best=measured[0];
    return {activity:activityById(best.activityId),measured:true,rate:best.xpPerHour,runs:best.runs};
  }
  const candidate=[...eligible].sort((a,b)=>(b.candidatePriority||0)-(a.candidatePriority||0))[0];
  return {activity:candidate,measured:false,rate:null,runs:0};
}

function renderPersonal(){
  if(!state.guide)return;
  const p=state.player;
  const rec=recommendation();

  if(!p){
    $("recommendTitle").textContent="Connect to get your recommendation";
    $("recommendWhy").textContent="The guide will use your real trucking XP, Master/Premium access, current rig, Bonus EXP, and your measured XP/hr history.";
    $("recommendMeta").innerHTML="";
    $("recommendSteps").innerHTML="";
    $("setupFacts").innerHTML='<div class="fact"><span>Status</span><strong>Not connected</strong></div>';
  }else{
    if(rec.activity){
      $("recommendTitle").textContent=rec.measured?"Best measured: "+rec.activity.name:"Benchmark first: "+rec.activity.name;
      $("recommendMeta").innerHTML=[
        '<span class="meta-chip good">'+(rec.measured?fmt(rec.rate)+" XP/hr":"High-priority candidate")+'</span>',
        '<span class="meta-chip">'+esc(rec.activity.category||"Trucking")+'</span>',
        '<span class="meta-chip">Lvl '+rec.activity.level+'+</span>',
        rec.activity.premium?'<span class="meta-chip">Premium</span>':""
      ].join("");
      $("recommendWhy").textContent=rec.measured
        ?"This is your highest measured eligible activity on this browser, based on "+rec.runs+" completed benchmark"+(rec.runs===1?"":"s")+"."
        :"You qualify for this activity with your current account. We do not have a measured XP/hr result for you yet, so the guide is prioritizing it as a test candidate rather than pretending it is definitively fastest.";
      $("recommendSteps").innerHTML=(rec.activity.steps||[]).map((x,i)=>'<div class="step"><span class="step-num">'+(i+1)+'</span><div>'+esc(x)+'</div></div>').join("");
    }else{
      $("recommendTitle").textContent="No eligible activity found";
      $("recommendWhy").textContent="Check the manual trucking level or reconnect your TT account.";
      $("recommendMeta").innerHTML="";$("recommendSteps").innerHTML="";
    }

    const rig=p.vehicleName+(p.hasTrailer?" + "+p.trailer:"");
    $("setupFacts").innerHTML=[
      ['Master',p.master?'Yes':'No'],
      ['Premium',p.premium?'Yes':'No'],
      ['Rig',rig],
      ['Trucking XP',fmt(p.xp)],
      ['Bonus EXP',fmt(p.bonusTokens)],
      ['Bonus XP reserve','≈ '+fmt(p.bonusTokens*.1)]
    ].map(x=>'<div class="fact"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join("");
  }

  renderBenchmarkPicker();
  renderLeaderboard();
  renderActivityCards();
}

function renderBenchmarkPicker(){
  if(!state.guide)return;
  const activities=state.player?eligibleActivities():state.guide.activities||[];
  const current=$("benchmarkActivity").value;
  $("benchmarkActivity").innerHTML=activities.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");
  if(activities.some(a=>a.id===current))$("benchmarkActivity").value=current;
}

function renderLeaderboard(){
  const rows=aggregateBenchmarks();
  if(!rows.length){
    $("benchmarkLeaderboard").innerHTML='<div class="route-pill"><small>No measured activities yet. Run a benchmark and this becomes your personal XP/hr ranking.</small></div>';
    return;
  }
  $("benchmarkLeaderboard").innerHTML=rows.map((b,i)=>{
    const a=activityById(b.activityId);
    return '<div class="leader-row"><div><strong>#'+(i+1)+' '+esc(a?.name||b.activityId)+'</strong><small>'+b.runs+' run'+(b.runs===1?'':'s')+' • '+fmt(b.xp)+' XP measured</small></div><div class="leader-rate">'+fmt(b.xpPerHour)+' XP/hr</div></div>';
  }).join("");
}

function renderActivityCards(){
  if(!state.guide)return;
  const activities=state.player?eligibleActivities():state.guide.activities||[];
  const measured=new Map(aggregateBenchmarks().map(x=>[x.activityId,x]));
  const sorted=[...activities].sort((a,b)=>{
    const ma=measured.get(a.id),mb=measured.get(b.id);
    if(ma&&mb)return mb.xpPerHour-ma.xpPerHour;
    if(ma)return -1;if(mb)return 1;
    return (b.candidatePriority||0)-(a.candidatePriority||0);
  });
  $("personalActivityCards").innerHTML=sorted.map(a=>{
    const m=measured.get(a.id);
    const mini=(a.steps||[]).slice(0,3).map((s,i)=>'<div>'+(i+1)+'. '+esc(s)+'</div>').join("");
    return '<article class="card"><h3>'+esc(a.name)+'</h3><p>'+esc(a.description)+'</p>'+
      (m?'<div class="metric">'+fmt(m.xpPerHour)+' XP/hr</div><div class="candidate">'+m.runs+' measured run'+(m.runs===1?'':'s')+'</div>':'<div class="candidate">Needs XP/hr benchmark</div>')+
      '<div class="steps-mini">'+mini+'</div><div class="req">Level '+a.level+(a.premium?' • Premium':'')+'</div></article>';
  }).join("");
}

function benchmarkElapsed(){
  if(!state.benchmark)return 0;
  return Math.max(0,(Date.now()-state.benchmark.startedAt)/1000);
}

function updateBenchmarkLive(){
  if(!state.benchmark)return;
  const sec=benchmarkElapsed();
  const mins=Math.floor(sec/60),s=Math.floor(sec%60).toString().padStart(2,"0");
  $("benchmarkLive").innerHTML='<strong>'+mins+':'+s+'</strong><span>'+esc(activityById(state.benchmark.activityId)?.name||state.benchmark.activityId)+' • starting XP '+fmt(state.benchmark.startXp)+'</span>';
}

function startBenchmark(){
  if(!state.player){status("Connect your TT account before benchmarking.","error");return;}
  const activityId=$("benchmarkActivity").value;
  if(!activityId)return;
  state.benchmark={activityId,startXp:state.player.xp,startedAt:Date.now()};
  $("benchmarkState").textContent="Running";
  $("benchmarkState").className="badge online";
  $("benchmarkStart").disabled=true;$("benchmarkStop").disabled=false;
  updateBenchmarkLive();
  clearInterval(state.benchmarkTimer);
  state.benchmarkTimer=setInterval(updateBenchmarkLive,1000);
}

async function stopBenchmark(){
  if(!state.benchmark)return;
  $("benchmarkStop").disabled=true;
  $("benchmarkState").textContent="Reading TT XP…";
  try{
    const end=await fetchLivePlayer();
    const seconds=benchmarkElapsed();
    const xpGained=end.xp-state.benchmark.startXp;
    const rate=seconds>0?xpGained/seconds*3600:0;
    const activityId=state.benchmark.activityId;
    clearInterval(state.benchmarkTimer);state.benchmarkTimer=null;state.benchmark=null;
    $("benchmarkState").textContent="Complete";$("benchmarkState").className="badge online";
    $("benchmarkStart").disabled=false;$("benchmarkStop").disabled=true;
    if(xpGained>0&&seconds>=5){
      const rows=getBenchmarks();
      rows.push({activityId,xpGained,seconds,xpPerHour:rate,timestamp:Date.now()});
      saveBenchmarks(rows);
      $("benchmarkLive").innerHTML='<strong>'+fmt(rate)+' XP/hr</strong><span>'+fmt(xpGained)+' XP gained in '+fmt(seconds/60)+' minutes.</span>';
    }else{
      $("benchmarkLive").innerHTML='<strong>No usable result</strong><span>'+fmt(xpGained)+' XP gained. Run the activity for at least a few seconds and make sure Trucking XP increases.</span>';
    }
    renderPersonal();
  }catch(err){
    $("benchmarkState").textContent="Error";$("benchmarkState").className="badge muted";
    $("benchmarkStart").disabled=false;$("benchmarkStop").disabled=false;
    status(err.message||String(err),"error");
  }
}

function pill(r){return '<div class="route-pill"><strong>'+esc(r.name)+'</strong><small>Level '+r.level+(r.premium?" • Premium":"")+'</small></div>';}

function renderProgression(){
  if(!state.guide)return;
  const lvl=effectiveLevel(),xp=state.player?.xp||0;
  $("milestones").innerHTML=state.guide.milestones.map(m=>{
    const unlocked=m.xp?xp>=m.xp:lvl>=m.level;
    const label=m.xp?m.displayLevel+" lvl":"Lvl "+m.level;
    return '<div class="milestone '+(unlocked?"unlocked":"locked")+'"><div class="level">'+label+'</div><div><strong>'+esc(m.text)+'</strong><small>'+(unlocked?"Unlocked":"Locked")+'</small></div></div>';
  }).join("");
  const available=state.guide.routes.filter(r=>lvl>=r.level&&(!r.premium||state.player?.premium));
  const next=state.guide.routes.filter(r=>lvl<r.level).sort((a,b)=>a.level-b.level).slice(0,4);
  $("availableRoutes").innerHTML=available.length?available.map(pill).join(""):'<div class="route-pill"><small>No routes match the current level/access.</small></div>';
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
  renderRoutes();renderCapacity();renderProgression();renderPersonal();
}

function disconnect(){
  clearInterval(state.benchmarkTimer);
  state.benchmarkTimer=null;state.benchmark=null;
  state.player=null;state.charges=null;state.premium=null;state.apiKey="";
  $("apiKey").value="";
  status("Disconnected.");
  renderPlayer();
}

document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".tabpage").forEach(x=>x.classList.toggle("active",x.id===b.dataset.tab));
}));
$("serverSelect").addEventListener("change",()=>$("customServerWrap").classList.toggle("hidden",$("serverSelect").value!=="__custom"));
$("connectForm").addEventListener("submit",async e=>{e.preventDefault();try{await connect();}catch(err){status(err.message||String(err),"error");}});
$("disconnectBtn").addEventListener("click",disconnect);
$("manualLevel").addEventListener("input",()=>{renderProgression();renderPersonal();});
$("trailerSelect").addEventListener("change",renderCapacity);
$("cargoSelect").addEventListener("change",renderCapacity);
$("capacityOverride").addEventListener("input",renderCapacity);
$("routeSearch").addEventListener("input",renderRoutes);
$("benchmarkStart").addEventListener("click",startBenchmark);
$("benchmarkStop").addEventListener("click",stopBenchmark);
$("clearBenchmarks").addEventListener("click",()=>{
  if(!confirm("Clear the saved XP/hr benchmarks for this vRP ID on this browser?"))return;
  localStorage.removeItem(benchmarkKey());renderPersonal();
});

(async()=>{
  $("vrpId").value=sessionStorage.getItem("hammyTT.vrpId")||"";
  try{await Promise.all([loadGuide(),loadServers()]);}
  catch(err){status(err.message||String(err),"error");}
  const s=sessionStorage.getItem("hammyTT.server");
  if(s&&[...$("serverSelect").options].some(o=>o.value===s))$("serverSelect").value=s;
})();
