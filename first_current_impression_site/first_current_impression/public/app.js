const $=id=>document.getElementById(id);let token=localStorage.getItem("fic_admin_token")||"",state=null,results=[];
const socket=io();
function headers(){return {"Content-Type":"application/json","x-admin-token":token}}
function show(id,on){$(id).classList.toggle("hidden",!on)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function phaseLabel(p){return ({setup:"준비 중",writing:"작성 중",reveal:"결과 공개",closed:"라운드 마감"})[p]||p}
function msg(id,t){$(id).textContent=t}
async function api(url,body){const r=await fetch(url,{method:body?"POST":"GET",headers:headers(),body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error||"요청 실패");return d}
async function updatePublic(){
 try{
  const [s,r]=await Promise.all([fetch("/api/state").then(x=>x.json()),fetch("/api/public-results").then(x=>x.json())]);
  state=s;$("roomBadge").textContent="ROOM "+s.roomCode;$("phaseBadge").textContent=phaseLabel(s.phase);
  $("publicTarget").textContent=s.target?`오늘의 주인공 · ${s.target.name}`:"주인공을 기다리는 중";
  $("publicStatus").textContent=s.phase==="writing"?"작성 시간이 열렸어요. 첫인상과 현인상을 남겨 주세요.":s.phase==="reveal"?"결과를 공개하고 있어요. 공개된 글을 함께 읽어보세요.":s.phase==="closed"?"이번 라운드가 마감됐어요.":"진행자가 주인공을 선정하고 작성 시간을 열 예정이에요.";
  show("entryPanel",s.phase==="writing"&&!!s.target);
  $("resultCount").textContent=`${r.results.length}개 공개`;
  $("publicResults").innerHTML=r.results.length?r.results.map((x,i)=>`<article class="publiccard"><div class="resulthead"><span class="chip">익명 메시지 ${String(i+1).padStart(2,"0")}</span><span class="muted">작성자 비공개</span></div><div class="resultcols"><div><b>첫인상</b><p>${esc(x.first)}</p></div><div><b>현인상</b><p>${esc(x.current)}</p></div></div></article>`).join(""):'<div class="empty">아직 공개된 글이 없어요.<br>공개가 시작되면 이곳에 표시됩니다.</div>';
  if(token&& !$("hostConsole").classList.contains("hidden")){renderHostState(s);await refreshResults();}
 }catch(e){console.error(e)}
}
function renderHostState(s){
 $("participantList").innerHTML=s.participants.map(p=>`<span class="chip">${esc(p.name)}</span>`).join("")||'<span class="muted">참가자를 등록해 주세요.</span>';
 $("targetChoices").innerHTML=s.participants.map(p=>`<button class="choice ${s.target?.id===p.id?"selected":""}" data-target="${p.id}">${esc(p.name)}${s.target?.id===p.id?" ✓":""}</button>`).join("")||'<p class="muted">먼저 참가자를 등록하세요.</p>';
 $("targetChoices").querySelectorAll("[data-target]").forEach(b=>b.onclick=()=>setTarget(b.dataset.target));
}
async function refreshResults(){if(!token)return;try{const d=await api("/api/results");results=d.results;renderResults()}catch(e){}}
function renderResults(){$("results").innerHTML=results.map((r,i)=>`<article class="resultcard"><div class="resulthead"><span class="chip">미공개 글 ${i+1}</span><span class="muted">${r.revealed?"공개 완료":"진행자 전용"}</span></div><div class="resultcols"><div><b>첫인상</b><p>${esc(r.first)}</p></div><div><b>현인상</b><p>${esc(r.current)}</p></div></div><button class="btn ${r.revealed?"secondary":"primary"} revealbtn" data-reveal="${r.id}" ${r.revealed?"disabled":""}>${r.revealed?"공개 완료":"모두에게 공개"}</button></article>`).join("")||'<p class="muted">아직 제출된 글이 없습니다.</p>';
 $("results").querySelectorAll("[data-reveal]").forEach(b=>b.onclick=async()=>{try{await api("/api/admin/reveal",{id:b.dataset.reveal});await updatePublic()}catch(e){alert(e.message)}})}
async function setTarget(id){try{await api("/api/admin/target",{targetId:id});msg("targetMsg","주인공을 선택했어요. 작성 시작을 눌러 주세요.");await updatePublic()}catch(e){msg("targetMsg",e.message)}}
$("entryForm").addEventListener("submit",async e=>{e.preventDefault();if(!state?.target)return;const btn=e.submitter;btn.disabled=true;msg("formMsg","제출 중...");
 try{const r=await fetch("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({participantName:$("participantName").value,first:$("first").value,current:$("current").value,targetId:state.target.id})});const d=await r.json();if(!r.ok)throw new Error(d.error||"제출 실패");$("entryForm").reset();msg("formMsg","제출 완료! 글은 익명으로 저장됐어요.");}catch(err){msg("formMsg",err.message)}finally{btn.disabled=false}
});
$("hostToggle").onclick=()=>{if(token){show("hostLoginPanel",false);show("hostConsole",!$("hostConsole").classList.contains("hidden")?false:true);if(!$("hostConsole").classList.contains("hidden"))updatePublic();return}show("hostLoginPanel",!$("hostLoginPanel").classList.contains("hidden"))};
$("loginForm").onsubmit=async e=>{e.preventDefault();try{const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("password").value})});const d=await r.json();if(!r.ok)throw new Error(d.error);token=d.token;localStorage.setItem("fic_admin_token",token);show("hostLoginPanel",false);show("hostConsole",true);msg("loginMsg","");await updatePublic()}catch(err){msg("loginMsg",err.message)}};
$("saveParticipants").onclick=async()=>{try{const names=$("names").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);await api("/api/admin/participants",{names});msg("participantMsg",`${names.length}명 등록 완료.`);await updatePublic()}catch(e){msg("participantMsg",e.message)}};
$("pickRandom").onclick=()=>{if(!state?.participants?.length)return msg("targetMsg","참가자를 먼저 등록하세요.");const opts=state.participants.filter(p=>p.id!==state.target?.id);if(!opts.length)return msg("targetMsg","참가자가 두 명 이상 필요합니다.");setTarget(opts[Math.floor(Math.random()*opts.length)].id)};
document.querySelectorAll("[data-phase]").forEach(b=>b.onclick=async()=>{try{await api("/api/admin/phase",{phase:b.dataset.phase});msg("phaseMsg","상태: "+phaseLabel(b.dataset.phase));await updatePublic()}catch(e){msg("phaseMsg",e.message)}});
$("reset").onclick=async()=>{if(!confirm("현재 라운드의 글과 공개 상태를 초기화할까요?"))return;try{await api("/api/admin/reset",{});msg("phaseMsg","라운드를 초기화했어요.");await updatePublic()}catch(e){msg("phaseMsg",e.message)}};
socket.on("state",()=>updatePublic());
updatePublic();
setInterval(updatePublic,4000);
