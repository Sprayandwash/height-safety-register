
const EQUIPMENT_TYPES=[
"Harness","Rope","Carabiner / Connector","Round Sling","Rope Slider / Fall Arrest Device",
"Straight Lanyard","Shock-Absorbing Lanyard","Temporary Anchor - T-Bar","Temporary Anchor - Parapet Clamp","Other"
];

const CHECKLISTS={
"Harness":["Label present and legible","Serial number matches register","Webbing free from cuts, abrasion, burns, UV damage and contamination","Stitching intact","D-rings free from cracks, distortion, corrosion and excessive wear","Buckles and adjusters operate correctly","No evidence of fall arrest loading"],
"Rope":["Rope ID/label present and legible","Serial number or rope ID matches register","Free from cuts, abrasion, glazing, burns, contamination and UV damage","No soft spots, hard spots, lumps, flat areas or exposed core","Consistent diameter and handling feel","Terminations intact"],
"Carabiner / Connector":["Identification/batch marking present and legible","Body free from cracks, distortion, corrosion and excessive wear","Gate opens, closes and aligns correctly","Auto-close and locking mechanism operate correctly","Pins, rivets, hinges and springs secure","No side loading or impact damage"],
"Round Sling":["Identification label present and legible","Rating and service life acceptable","Outer sleeve free from cuts, abrasion, burns and chemical damage","No exposed core or broken fibres","No knots, unauthorised repairs or modifications","No evidence of shock loading"],
"Rope Slider / Fall Arrest Device":["Identification present and legible","Compatible with rope type and diameter","Body free from cracks, distortion, corrosion and wear","Cam/locking mechanism moves freely and locks correctly","Springs, pins and moving parts secure","Function check completed on compatible rope"],
"Straight Lanyard":["Label present and legible","Serial number matches register","Rope/webbing free from cuts, abrasion, burns and contamination","No knots or unauthorised alterations","Terminations intact","Connectors operate correctly","No evidence of shock loading"],
"Shock-Absorbing Lanyard":["Label present and legible","Energy absorber pack intact and not deployed","Cover/pouch secure and undamaged","No tearing, elongation or exposed absorber webbing","Webbing free from cuts, abrasion, burns and contamination","Connectors operate correctly"],
"Temporary Anchor - T-Bar":["Identification label/serial number present and legible","Manufacturer rating and intended use acceptable","T-bar body and arms free from cracks, bends, corrosion and wear","Sliding/adjustment parts move correctly","Fasteners, pins, rivets and retainers secure","Roof sheet contact surfaces undamaged","Anchor eye/ring free from cracks or distortion"],
"Temporary Anchor - Parapet Clamp":["Identification label/serial number present and legible","Manufacturer rating and intended use acceptable","Main frame and jaws free from cracks, bends, corrosion and wear","Clamp adjustment mechanism operates smoothly","Pins, bolts, threaded parts and retainers secure","Jaw faces or bearing plates intact","Anchor eye/ring free from cracks or distortion"],
"Other":["Identification present and legible","Serial number matches register","Within manufacturer service life","Load-bearing parts free from damage and corrosion","Moving parts operate correctly","No unauthorised modification or signs requiring quarantine"]
};

let sb,currentUser=null,equipment=[],inspections=[];

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function today(){return new Date().toISOString().slice(0,10);}
function addMonths(d,m){let x=new Date((d||today())+"T00:00:00");x.setMonth(x.getMonth()+m);return x.toISOString().slice(0,10);}
function pill(t){let c=t==="Pass"||t==="In Service"?"pass":t==="Fail"||t==="Quarantined"?"fail":t==="Retired"?"retired":"due";return `<span class="pill ${c}">${esc(t||"")}</span>`;}
function latest(serial){return inspections.filter(x=>x.serial===serial).sort((a,b)=>(b.inspection_date||"").localeCompare(a.inspection_date||""))[0];}

document.addEventListener("DOMContentLoaded",init);

async function init(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("PASTE_")) configWarning.classList.remove("hidden");
  sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  fillTypes(); inDate.value=today(); inNextDue.value=addMonths(today(),6); renderChecklist();
  const {data:{session}}=await sb.auth.getSession(); currentUser=session?.user||null; updateAuthUI();
  if(currentUser) await loadData();
}

function fillTypes(){let o=EQUIPMENT_TYPES.map(t=>`<option>${esc(t)}</option>`).join(""); eqType.innerHTML=o; inType.innerHTML=o;}
function updateAuthUI(){signedOut.classList.toggle("hidden",!!currentUser); signedIn.classList.toggle("hidden",!currentUser); appMain.classList.toggle("hidden",!currentUser); userEmail.textContent=currentUser?.email||"";}

async function signIn(){let email=loginEmail.value.trim(),password=loginPassword.value;if(!email||!password)return alert("Enter email and password.");let {error}=await sb.auth.signInWithPassword({email,password});if(error)return alert(error.message);let {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;updateAuthUI();await loadData();}
async function signUp(){let email=loginEmail.value.trim(),password=loginPassword.value;if(!email||!password)return alert("Enter email and password.");let {error}=await sb.auth.signUp({email,password});if(error)return alert(error.message);alert("Account created. If email confirmation is enabled, check your email before signing in.");}
async function signOut(){await sb.auth.signOut();currentUser=null;equipment=[];inspections=[];updateAuthUI();renderAll();}

async function loadData(){
  let eq=await sb.from("equipment").select("*").order("serial");
  if(eq.error)return alert(eq.error.message);
  let ins=await sb.from("inspections").select("*").order("inspection_date",{ascending:false});
  if(ins.error)return alert(ins.error.message);
  equipment=eq.data||[]; inspections=ins.data||[]; renderAll();
}

function showTab(id){document.querySelectorAll(".tabpane").forEach(x=>x.classList.add("hidden"));document.getElementById(id).classList.remove("hidden");document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelector(`[data-tab="${id}"]`).classList.add("active");}
function renderChecklist(){let items=CHECKLISTS[inType.value]||CHECKLISTS.Other;checklist.innerHTML=items.map(i=>`<label><input class="chk" type="checkbox" value="${esc(i)}"> ${esc(i)}</label>`).join("");}

function renderAll(){renderDashboard();renderEquipment();renderInspections();renderDue();}

function renderDashboard(){
  dashTotal.textContent=equipment.length;
  dashInService.textContent=equipment.filter(e=>e.status==="In Service").length;
  dashFailed.textContent=equipment.filter(e=>e.status==="Quarantined"||e.status==="Retired").length;
  let due=equipment.filter(e=>{let l=latest(e.serial);return !l || (l.next_due && l.next_due<=today()) || l?.result==="Fail" || e.status==="Quarantined";});
  dashDue.textContent=due.length;
  dashNextDue.innerHTML=due.slice(0,5).map(e=>`<div class="item"><b>${esc(e.serial)}</b><span>${esc(e.type)}</span><span>${esc(latest(e.serial)?.next_due||"No inspection")}</span></div>`).join("") || `<p class="muted">No equipment due.</p>`;
  let counts={};EQUIPMENT_TYPES.forEach(t=>counts[t]=0);equipment.forEach(e=>counts[e.type||"Other"]=(counts[e.type||"Other"]||0)+1);
  dashTypes.innerHTML=EQUIPMENT_TYPES.map(t=>`<div class="typeTile"><span>${esc(t)}</span><b>${counts[t]||0}</b></div>`).join("");
  dashRecent.innerHTML=inspections.slice(0,5).map(i=>`<div class="item"><b>${esc(i.serial)}</b><span>${esc(i.equipment_type)}</span><span>${pill(i.result)}</span></div>`).join("") || `<p class="muted">No inspections yet.</p>`;
}

function renderEquipment(){
  let q=(search.value||"").toLowerCase();
  let rows=equipment.filter(e=>JSON.stringify(e).toLowerCase().includes(q));
  equipmentList.innerHTML=rows.map(e=>{let l=latest(e.serial);return `<div class="card"><b>${esc(e.serial)}</b> ${pill(e.status)}<div class="muted">${esc(e.type)} • ${esc(e.manufacturer||"")} ${esc(e.model||"")}</div><div class="muted">Last: ${l?esc(l.inspection_date+" - "+l.result):"None"} ${l?.next_due?"• Next due: "+esc(l.next_due):""}</div><div class="row"><button onclick="editEquipment('${e.id}')">Edit</button><button onclick="startInspection('${e.id}')">Inspect</button><button class="danger" onclick="deleteEquipment('${e.id}')">Delete</button></div></div>`;}).join("") || `<p class="muted">No equipment yet.</p>`;
  serials.innerHTML=equipment.map(e=>`<option value="${esc(e.serial)}"></option>`).join("");
}

function editEquipment(id){let e=equipment.find(x=>x.id===id);if(!e)return;eqId.value=e.id;eqSerial.value=e.serial;eqType.value=e.type;eqMaker.value=e.manufacturer||"";eqModel.value=e.model||"";eqMade.value=e.date_manufactured||"";eqFirstUsed.value=e.date_first_used||"";eqRetire.value=e.retirement_date||"";eqFreq.value=e.inspection_frequency||"6 monthly";eqStatus.value=e.status||"In Service";eqNotes.value=e.notes||"";showTab("equipment");}
function clearEquipmentForm(){["eqId","eqSerial","eqMaker","eqModel","eqMade","eqFirstUsed","eqRetire","eqNotes"].forEach(id=>document.getElementById(id).value="");eqType.value="Harness";eqFreq.value="6 monthly";eqStatus.value="In Service";}
async function saveEquipment(){
  let serial=eqSerial.value.trim();if(!serial)return alert("Serial number required.");
  let row={serial,type:eqType.value,manufacturer:eqMaker.value.trim(),model:eqModel.value.trim(),date_manufactured:eqMade.value||null,date_first_used:eqFirstUsed.value||null,retirement_date:eqRetire.value||null,inspection_frequency:eqFreq.value,status:eqStatus.value,notes:eqNotes.value.trim()};
  let r=eqId.value?await sb.from("equipment").update(row).eq("id",eqId.value):await sb.from("equipment").insert(row);
  if(r.error)return alert(r.error.message);clearEquipmentForm();await loadData();showTab("dashboard");
}
async function deleteEquipment(id){if(!confirm("Delete equipment and all inspections?"))return;let {error}=await sb.from("equipment").delete().eq("id",id);if(error)return alert(error.message);await loadData();}
function startInspection(id){let e=equipment.find(x=>x.id===id);if(!e)return;inSerial.value=e.serial;inType.value=e.type;renderChecklist();showTab("inspect");}
function loadEquipmentForInspection(){let e=equipment.find(x=>x.serial.toLowerCase()===inSerial.value.trim().toLowerCase());if(e){inType.value=e.type;renderChecklist();}}

async function saveInspection(){
  let serial=inSerial.value.trim();if(!serial)return alert("Serial number required.");
  let e=equipment.find(x=>x.serial.toLowerCase()===serial.toLowerCase());
  if(!e){let r=await sb.from("equipment").insert({serial,type:inType.value,status:"In Service",inspection_frequency:"6 monthly"}).select().single();if(r.error)return alert(r.error.message);e=r.data;}
  let checks=[...document.querySelectorAll(".chk:checked")].map(x=>x.value);
  let row={equipment_id:e.id,serial,equipment_type:inType.value,inspection_date:inDate.value||today(),inspector:inInspector.value.trim(),result:inResult.value,next_due:inNextDue.value||null,checklist:checks,notes:inNotes.value.trim()};
  let r=await sb.from("inspections").insert(row);if(r.error)return alert(r.error.message);
  if(inResult.value==="Fail") await sb.from("equipment").update({status:"Quarantined",type:inType.value}).eq("id",e.id); else await sb.from("equipment").update({type:inType.value}).eq("id",e.id);
  clearInspectionForm();await loadData();showTab("dashboard");
}
function clearInspectionForm(){inSerial.value="";inDate.value=today();inNextDue.value=addMonths(today(),6);inResult.value="Pass";inNotes.value="";inType.value="Harness";renderChecklist();}
function renderInspections(){inspectionList.innerHTML=inspections.map(i=>`<div class="card"><b>${esc(i.inspection_date)}</b> ${pill(i.result)}<div>${esc(i.serial)} • ${esc(i.equipment_type)}</div><div class="muted">${esc(i.notes||"")}</div></div>`).join("") || `<p class="muted">No inspections yet.</p>`;}
function renderDue(){let rows=equipment.filter(e=>{let l=latest(e.serial);return e.status!=="In Service"||!l||(l.next_due&&l.next_due<=today())||l.result==="Fail";});dueList.innerHTML=rows.map(e=>`<div class="card"><b>${esc(e.serial)}</b> ${pill(e.status)}<div>${esc(e.type)}</div><div class="muted">Due: ${esc(latest(e.serial)?.next_due||"No inspection recorded")}</div></div>`).join("") || `<p class="muted">No due or failed items.</p>`;}
function exportCSV(kind){let rows=kind==="equipment"?equipment:inspections.map(i=>({...i,checklist:JSON.stringify(i.checklist||[])}));if(!rows.length)return alert("Nothing to export.");let h=Object.keys(rows[0]);let csv=[h.join(","),...rows.map(r=>h.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\\n");let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=kind+".csv";a.click();}
