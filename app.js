// Spray & Wash Operations App V4.0.46
const EQUIPMENT_TYPES=[
  "Harness","Rope","Roofers Rope Set","Helmet","Carabiner / Connector","Round Sling","Rope Slider / Fall Arrest Device",
  "Straight Lanyard","Shock-Absorbing Lanyard","Temporary Anchor - T-Bar","Temporary Anchor - Parapet Clamp","Other"
];

const CHECKLISTS={
  "Harness":["Label present and legible","Serial number matches register","Webbing free from cuts, abrasion, burns, UV damage and contamination","Stitching intact","D-rings free from cracks, distortion, corrosion and excessive wear","Buckles and adjusters operate correctly","No evidence of fall arrest loading"],
  "Rope":["Rope ID/label present and legible","Serial number or rope ID matches register","Length recorded and suitable for use","Free from cuts, abrasion, glazing, burns, contamination and UV damage","No soft spots, hard spots, lumps, flat areas or exposed core","Consistent diameter and handling feel","Terminations intact"],
  "Roofers Rope Set":["Set ID/label present and legible","Rope length recorded","Rope free from cuts, abrasion, glazing, burns, contamination and UV damage","Integrated hook/carabiner body free from cracks, distortion, corrosion and wear","Gate closes and locking mechanism operates correctly","Slider/grab moves freely and locks correctly on compatible rope","Terminations and stitching intact","No evidence of shock loading"],
  "Helmet":["Helmet ID/label present and legible","Shell free from cracks, deformation, UV damage and chemical damage","Suspension/harness secure and adjustable","Chin strap and buckle operate correctly","No unauthorised holes, stickers or modifications that affect safety","Within manufacturer service life"],
  "Carabiner / Connector":["Identification/batch marking present and legible","Body free from cracks, distortion, corrosion and excessive wear","Gate opens, closes and aligns correctly","Auto-close and locking mechanism operate correctly","Pins, rivets, hinges and springs secure","No side loading or impact damage"],
  "Round Sling":["Identification label present and legible","Rating and service life acceptable","Outer sleeve free from cuts, abrasion, burns and chemical damage","No exposed core or broken fibres","No knots, unauthorised repairs or modifications","No evidence of shock loading"],
  "Rope Slider / Fall Arrest Device":["Identification present and legible","Compatible with rope type and diameter","Body free from cracks, distortion, corrosion and wear","Cam/locking mechanism moves freely and locks correctly","Springs, pins and moving parts secure","Function check completed on compatible rope"],
  "Straight Lanyard":["Label present and legible","Serial number matches register","Rope/webbing free from cuts, abrasion, burns and contamination","No knots or unauthorised alterations","Terminations intact","Connectors operate correctly","No evidence of shock loading"],
  "Shock-Absorbing Lanyard":["Label present and legible","Energy absorber pack intact and not deployed","Cover/pouch secure and undamaged","No tearing, elongation or exposed absorber webbing","Webbing free from cuts, abrasion, burns and contamination","Connectors operate correctly"],
  "Temporary Anchor - T-Bar":["Identification label/serial number present and legible","Manufacturer rating and intended use acceptable","T-bar body and arms free from cracks, bends, corrosion and wear","Sliding/adjustment parts move correctly","Fasteners, pins, rivets and retainers secure","Roof sheet contact surfaces undamaged","Anchor eye/ring free from cracks or distortion"],
  "Temporary Anchor - Parapet Clamp":["Identification label/serial number present and legible","Manufacturer rating and intended use acceptable","Main frame and jaws free from cracks, bends, corrosion and wear","Clamp adjustment mechanism operates smoothly","Pins, bolts, threaded parts and retainers secure","Jaw faces or bearing plates intact","Anchor eye/ring free from cracks or distortion"],
  "Other":["Identification present and legible","Serial number matches register","Within manufacturer service life","Load-bearing parts free from damage and corrosion","Moving parts operate correctly","No unauthorised modification or signs requiring quarantine"]
};

let sb,currentUser=null,equipment=[],inspections=[],photos=[],inspectionPhotos=[],certificates=[],auditLogs=[],appSettings={};
let currentRoles=[],userProfiles=[],roleAssignments=[];
const ROLE_DEFS=["Admin","Inspector","Equipment Manager","Certificate Approver","Office / Reports","Viewer"];
let activeFilter={mode:"active",value:"active"};
let equipmentFilterState={type:"",status:"",result:"",due:"",q:""};
let equipmentFiltersBound=false;
let pendingEquipmentPhotos=[];
let pendingInspectionPhotos=[];
let cropState=null;
let photoQueue=[];
let busyDepth=0;
let companyLogoDataUrl="",companyLogoPath="";
try{companyLogoDataUrl=localStorage.getItem("swCompanyLogoDataUrl")||"";companyLogoPath=localStorage.getItem("swCompanyLogoPath")||"";}catch(_){/* local cache is optional */}
function setBusy(on,msg="Working..."){
  const overlay=document.getElementById("busyOverlay");
  const text=document.getElementById("busyText");
  if(on) busyDepth++; else busyDepth=Math.max(0,busyDepth-1);
  if(text) text.textContent=msg;
  if(overlay) overlay.classList.toggle("hidden",busyDepth===0);
}
async function withBusy(msg,fn){
  setBusy(true,msg);
  try{return await fn();}
  finally{setBusy(false,msg);}
}
document.addEventListener("click",e=>{
  const btn=e.target.closest("button,.buttonLike,.uploadBtn");
  if(!btn || btn.disabled)return;
  btn.classList.add("clicked");
  setTimeout(()=>btn.classList.remove("clicked"),140);
});


function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function today(){return new Date().toISOString().slice(0,10);}
function nowIso(){return new Date().toISOString();}
function addMonths(d,m){let x=new Date((d||today())+"T00:00:00");x.setMonth(x.getMonth()+m);return x.toISOString().slice(0,10);}
function isArchived(e){return e.archived===true || e.status==="Retired" || !!e.disposed_at;}
function latest(serial){return inspections.filter(x=>x.serial===serial).sort((a,b)=>(b.inspection_date||"").localeCompare(a.inspection_date||""))[0];}
function isDue(e){let l=latest(e.serial);return !isArchived(e) && (!l || (l.next_due && l.next_due<=today()) || l?.result?.includes("Fail") || e.status==="Quarantined");}
function isFailed(e){let l=latest(e.serial);return !isArchived(e) && (e.status==="Quarantined" || l?.result?.includes("Fail"));}
function pill(t){let v=String(t||"");let c=v==="Pass"||v==="In Service"?"pass":v.includes("Fail")||v==="Quarantined"?"fail":v==="Retired"||v==="Archived"?"retired":"due";return `<span class="pill ${c}">${esc(v)}</span>`;}
function typeNeedsLength(type){return type==="Rope"||type==="Roofers Rope Set";}

function getNotificationLeadDays(){return parseInt((appSettings.notification_lead_days ?? localStorage.getItem("hsrNotifyLeadDays") ?? "30"),10)||30;}
function setNotificationLeadDays(days){localStorage.setItem("hsrNotifyLeadDays",String(days));renderNotifications();}
function parseDateOnly(d){return d?new Date(d+"T00:00:00"):null;}
function daysUntilDate(d){const target=parseDateOnly(d); if(!target)return null; const now=parseDateOnly(today()); return Math.ceil((target-now)/86400000);}
function nextDueForEquipment(e){return latest(e.serial)?.next_due||null;}
function isOverdueEquipment(e){const due=nextDueForEquipment(e); const days=daysUntilDate(due); return !isArchived(e)&&days!==null&&days<0;}
function isDueSoonEquipment(e){const days=daysUntilDate(nextDueForEquipment(e)); const lead=getNotificationLeadDays(); return !isArchived(e)&&days!==null&&days>=0&&days<=lead;}
function hasEquipmentPhoto(e){return photos.some(p=>p.equipment_id===e.id);}
function latestInspectionHasPhoto(e){const l=latest(e.serial); return !!l && inspectionPhotos.some(p=>p.inspection_id===l.id);}
function getNotificationSummary(){
  const active=equipment.filter(e=>!isArchived(e));
  const overdue=active.filter(isOverdueEquipment);
  const dueSoon=active.filter(isDueSoonEquipment).filter(e=>!overdue.some(o=>o.id===e.id));
  const failed=active.filter(isFailed);
  const noInspection=active.filter(e=>!latest(e.serial));
  const noEquipmentPhotos=active.filter(e=>!hasEquipmentPhoto(e));
  const noInspectionPhotos=active.filter(e=>latest(e.serial)&&!latestInspectionHasPhoto(e));
  const high=overdue.length+failed.length+noInspection.length;
  const medium=dueSoon.length;
  const low=noEquipmentPhotos.length+noInspectionPhotos.length;
  return {active,overdue,dueSoon,failed,noInspection,noEquipmentPhotos,noInspectionPhotos,high,medium,low,total:high+medium+low,lead:getNotificationLeadDays()};
}
function notificationRows(){
  const n=getNotificationSummary();
  const rows=[];
  if(n.failed.length) rows.push({level:"high",title:`${n.failed.length} failed / quarantined item${n.failed.length===1?"":"s"}`,body:"Items are not for use and need action.",filter:["failed","failed"]});
  if(n.overdue.length) rows.push({level:"high",title:`${n.overdue.length} overdue inspection${n.overdue.length===1?"":"s"}`,body:"Inspection due date has passed.",filter:["overdue","overdue"]});
  if(n.noInspection.length) rows.push({level:"high",title:`${n.noInspection.length} item${n.noInspection.length===1?" has":"s have"} no inspection history`,body:"These items should receive an initial inspection before use.",filter:["noInspection","noInspection"]});
  if(n.dueSoon.length) rows.push({level:"medium",title:`${n.dueSoon.length} item${n.dueSoon.length===1?"":"s"} due within ${n.lead} days`,body:"Plan inspections before the due date.",filter:["dueSoon","dueSoon"]});
  if(n.noEquipmentPhotos.length) rows.push({level:"low",title:`${n.noEquipmentPhotos.length} item${n.noEquipmentPhotos.length===1?" has":"s have"} no equipment photos`,body:"Photos help identify equipment and labels.",filter:["noPhotos","noPhotos"]});
  if(n.noInspectionPhotos.length) rows.push({level:"low",title:`${n.noInspectionPhotos.length} latest inspection${n.noInspectionPhotos.length===1?" has":"s have"} no photos`,body:"Inspection photos add evidence to the record and certificates.",filter:["noInspectionPhotos","noInspectionPhotos"]});
  if(!rows.length) rows.push({level:"ok",title:"No current notifications",body:"All active items are currently clear based on your notification settings.",filter:null});
  return rows;
}
function toggleNotificationPanel(){const p=document.getElementById("notificationPanel"); if(!p)return; p.classList.toggle("hidden"); if(!p.classList.contains("hidden")) renderNotifications(); const ap=document.getElementById("accountPanel"); if(ap)ap.classList.add("hidden");}
function openNotificationFilter(mode,value){if(mode&&value)setRegisterFilter(mode,value); const p=document.getElementById("notificationPanel"); if(p)p.classList.add("hidden");}
function renderNotifications(){
  const badge=document.getElementById("notifyBadge"), panel=document.getElementById("notificationPanelContent"), digest=document.getElementById("notificationDigest");
  if(!currentUser||!equipment.length){if(badge)badge.classList.add("hidden"); if(panel)panel.innerHTML='<p class="muted">Notifications will appear after equipment loads.</p>'; if(digest)digest.innerHTML='<p class="muted">Notifications will appear after equipment loads.</p>'; return;}
  const n=getNotificationSummary();
  const count=n.high+n.medium;
  if(badge){badge.textContent=String(count); badge.classList.toggle("hidden",count===0);}
  const rows=notificationRows();
  const rowHtml=rows.map(r=>`<div class="notifyItem ${r.level}" ${r.filter?`onclick="openNotificationFilter('${r.filter[0]}','${r.filter[1]}')"`:""}><div class="notifyItemTop"><b>${esc(r.title)}</b><span class="notifyLevel ${r.level}">${r.level==="ok"?"clear":r.level}</span></div><div class="muted">${esc(r.body)}</div></div>`).join("");
  if(panel) panel.innerHTML=`<h2>Notifications</h2><p class="muted">In-app reminders based on active equipment and inspection dates.</p>${rowHtml}<div class="notifySettings"><label>Due soon lead time</label><select onchange="setNotificationLeadDays(this.value)"><option value="7" ${n.lead===7?"selected":""}>7 days</option><option value="14" ${n.lead===14?"selected":""}>14 days</option><option value="30" ${n.lead===30?"selected":""}>30 days</option><option value="60" ${n.lead===60?"selected":""}>60 days</option><option value="90" ${n.lead===90?"selected":""}>90 days</option></select><p class="muted">These notifications appear inside the app only. They do not send phone push notifications or emails.</p></div>`;
  if(digest) digest.innerHTML=`<div class="digestItem ${n.high?"high":"ok"}" onclick="toggleNotificationPanel()"><b>${n.high}</b><span>High priority</span><div class="muted">failed, overdue, or no inspection</div></div><div class="digestItem ${n.medium?"medium":"ok"}" onclick="openNotificationFilter('dueSoon','dueSoon')"><b>${n.dueSoon.length}</b><span>Due soon</span><div class="muted">within ${n.lead} days</div></div><div class="digestItem ${n.noEquipmentPhotos.length?"low":"ok"}" onclick="openNotificationFilter('noPhotos','noPhotos')"><b>${n.noEquipmentPhotos.length}</b><span>No equipment photos</span><div class="muted">active items</div></div><div class="digestItem ${n.noInspectionPhotos.length?"low":"ok"}" onclick="openNotificationFilter('noInspectionPhotos','noInspectionPhotos')"><b>${n.noInspectionPhotos.length}</b><span>No inspection photos</span><div class="muted">latest inspections</div></div>`;
}

function roleLabel(role){return role||"";}
function hasAdmin(){return currentRoles.includes("Admin");}
function hasRole(role){return hasAdmin()||currentRoles.includes(role);}
function hasAnyRoles(roles){return hasAdmin()||roles.some(r=>currentRoles.includes(r));}
function canManageUsers(){return hasAdmin();}
function canEditEquipment(){return hasAnyRoles(["Equipment Manager"]);}
function canInspect(){return hasAnyRoles(["Inspector"]);}
function canAddPhotos(){return hasAnyRoles(["Equipment Manager","Inspector"]);}
function canArchive(){return hasAnyRoles(["Equipment Manager"]);}
function canExport(){return hasAnyRoles(["Office / Reports","Certificate Approver"]);}
function canCertificates(){return hasAnyRoles(["Office / Reports","Certificate Approver"]);}
function canAdminControls(){return hasAdmin();}
function currentRoleText(){return currentRoles.length?currentRoles.join(", "):"Viewer / no roles assigned";}
function requirePerm(ok,msg){if(!ok){alert(msg||"Your account does not have permission for this action.");return false;}return true;}
function toggleAccountPanel(){const panel=document.getElementById("accountPanel");if(panel)panel.classList.toggle("hidden");const np=document.getElementById("notificationPanel");if(np)np.classList.add("hidden");}


function appSettingValue(key,fallback=""){return appSettings && appSettings[key]!==undefined ? appSettings[key] : fallback;}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(reader.error||new Error("Could not read image."));reader.readAsDataURL(blob);});}
function getCompanyLogoDataUrl(){return companyLogoDataUrl||"";}
function companyLogoMarkup(className="certificateLogo"){
  const safeClass=String(className||"certificateLogo").replace(/[^a-zA-Z0-9 _-]/g,"");
  return companyLogoDataUrl?`<img class="${safeClass}" src="${esc(companyLogoDataUrl)}" alt="${esc(appSettingValue("company_name","Spray & Wash"))} logo">`:"";
}
function applyCompanyLogo(){
  const banner=document.querySelector("header .logo");
  if(banner) banner.src=companyLogoDataUrl||"assets/logo.png";
  const preview=document.getElementById("opsCompanyLogoPreview");
  if(preview){preview.src=companyLogoDataUrl||"assets/logo.png";preview.classList.remove("hidden");}
  const status=document.getElementById("opsCompanyLogoStatus");
  if(status) status.textContent=companyLogoDataUrl?`Current logo: ${appSettingValue("company_logo_file_name","Uploaded company logo")}`:"Using the packaged Spray & Wash logo.";
}
async function loadCompanyLogo(force=false){
  const path=String(appSettingValue("company_logo_path","")||"");
  if(!path){companyLogoDataUrl="";companyLogoPath="";try{localStorage.removeItem("swCompanyLogoDataUrl");localStorage.removeItem("swCompanyLogoPath");}catch(_){}applyCompanyLogo();return;}
  if(!force&&path===companyLogoPath&&companyLogoDataUrl){applyCompanyLogo();return;}
  try{
    const downloaded=await sb.storage.from("inspection-photos").download(path);
    if(downloaded.error)throw downloaded.error;
    if(!downloaded.data||downloaded.data.size<=0)throw new Error("The saved logo file is empty.");
    const dataUrl=await blobToDataUrl(downloaded.data);
    if(!dataUrl.startsWith("data:image/"))throw new Error("The saved logo is not a readable image.");
    companyLogoDataUrl=dataUrl;companyLogoPath=path;
    try{localStorage.setItem("swCompanyLogoDataUrl",dataUrl);localStorage.setItem("swCompanyLogoPath",path);}catch(_){}
  }catch(err){
    console.warn("Company logo not loaded",err);
    if(path!==companyLogoPath){
      companyLogoDataUrl="";companyLogoPath="";
      try{localStorage.removeItem("swCompanyLogoDataUrl");localStorage.removeItem("swCompanyLogoPath");}catch(_){}
    }
  }
  applyCompanyLogo();
}
async function loadAppSettings(){
  appSettings={};
  try{
    const r=await sb.from("app_settings").select("key,value,updated_at,updated_by");
    if(!r.error){(r.data||[]).forEach(row=>{appSettings[row.key]=row.value;});}
  }catch(err){console.warn("App settings not loaded",err);}
  await loadCompanyLogo();
}
async function refreshAuditLogs(){
  if(!currentUser)return;
  try{
    const r=await sb.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(250);
    if(r.error){console.warn("Audit log not loaded",r.error.message); auditLogs=[];}
    else auditLogs=r.data||[];
  }catch(err){console.warn("Audit log not loaded",err); auditLogs=[];}
}
async function logAudit(action,entityType="",entityId=null,summary="",details={}){
  if(!sb||!currentUser)return;
  try{
    await sb.from("audit_logs").insert({
      actor_user_id:currentUser.id,
      actor_email:currentUser.email||"",
      action,entity_type:entityType||null,entity_id:entityId||null,
      summary:summary||action,details:details||{}
    });
  }catch(err){console.warn("Audit log skipped",err);}
}
function adminSettingsSnapshot(){return {
  notificationLeadDays:getNotificationLeadDays(),
  defaultInspectionFrequency:appSettingValue("default_inspection_frequency","6 monthly"),
  companyName:appSettingValue("company_name","Spray & Wash"),
  certificateFooter:appSettingValue("certificate_footer","This certificate was generated from the Spray & Wash Height Safety Register. Verify against the live register before relying on expired downloaded copies."),
  logoDataUrl:getCompanyLogoDataUrl(),
  logoFileName:appSettingValue("company_logo_file_name","")
};}
async function saveAdminSettingsFromOperations(event){
  event?.preventDefault?.();
  if(!requirePerm(canAdminControls(),"Only Admin users can save settings."))return;
  const lead=document.getElementById("opsAdminNotifyLead");
  const frequency=document.getElementById("opsAdminDefaultFrequency");
  const company=document.getElementById("opsAdminCompanyName");
  const footer=document.getElementById("opsAdminCertFooter");
  const rows=[
    {key:"notification_lead_days",value:Number(lead?.value||30)},
    {key:"default_inspection_frequency",value:frequency?.value||"6 monthly"},
    {key:"company_name",value:company?.value.trim()||"Spray & Wash"},
    {key:"certificate_footer",value:footer?.value.trim()||""}
  ].map(r=>({...r,updated_by:currentUser.id,updated_at:nowIso()}));
  const res=await sb.from("app_settings").upsert(rows,{onConflict:"key"});
  if(res.error)return alert("Settings were not saved: "+res.error.message);
  localStorage.setItem("hsrNotifyLeadDays",String(lead?.value||30));
  await logAudit("settings_updated","settings",null,"Admin settings updated",Object.fromEntries(rows.map(r=>[r.key,r.value])));
  await loadAppSettings();renderNotifications();alert("App settings saved.");
}
async function uploadCompanyLogo(file){
  if(!requirePerm(canAdminControls(),"Only Admin users can upload the company logo."))return false;
  if(!file)return alert("Choose a logo image first."),false;
  if(!file.size)return alert("The selected logo file is empty."),false;
  if(!String(file.type||"").startsWith("image/"))return alert("Choose a PNG, JPEG, WebP or other image file."),false;
  if(file.size>5*1024*1024)return alert("Choose a logo image smaller than 5 MB."),false;
  return withBusy("Uploading and verifying company logo...",async()=>{
    const oldPath=String(appSettingValue("company_logo_path","")||"");
    const extension=(String(file.name||"").split(".").pop()||"png").replace(/[^a-zA-Z0-9]/g,"").toLowerCase()||"png";
    const path=`app-branding/company-logo-${Date.now()}.${extension}`;
    const uploaded=await sb.storage.from("inspection-photos").upload(path,file,{cacheControl:"3600",contentType:file.type,upsert:false});
    if(uploaded.error){alert("Logo upload failed: "+uploaded.error.message);return false;}
    const verified=await sb.storage.from("inspection-photos").download(path);
    if(verified.error||!verified.data||verified.data.size<=0){await sb.storage.from("inspection-photos").remove([path]);alert("The uploaded logo could not be verified and was not saved.");return false;}
    const dataUrl=await blobToDataUrl(verified.data);
    if(!dataUrl.startsWith("data:image/")){await sb.storage.from("inspection-photos").remove([path]);alert("The uploaded file was not a readable image and was not saved.");return false;}
    const rows=[
      {key:"company_logo_path",value:path,updated_by:currentUser.id,updated_at:nowIso()},
      {key:"company_logo_file_name",value:file.name||"company-logo",updated_by:currentUser.id,updated_at:nowIso()}
    ];
    const saved=await sb.from("app_settings").upsert(rows,{onConflict:"key"});
    if(saved.error){await sb.storage.from("inspection-photos").remove([path]);alert("The logo setting was not saved: "+saved.error.message);return false;}
    appSettings.company_logo_path=path;appSettings.company_logo_file_name=file.name||"company-logo";
    companyLogoPath=path;companyLogoDataUrl=dataUrl;
    try{localStorage.setItem("swCompanyLogoDataUrl",dataUrl);localStorage.setItem("swCompanyLogoPath",path);}catch(_){}
    applyCompanyLogo();
    if(oldPath&&oldPath!==path)await sb.storage.from("inspection-photos").remove([oldPath]);
    await logAudit("company_logo_updated","settings",null,"Company logo updated",{file_name:file.name||"company-logo",storage_path:path});
    alert("Company logo uploaded and verified.");
    return true;
  });
}
window.adminSettingsSnapshot=adminSettingsSnapshot;
window.saveAdminSettingsFromOperations=saveAdminSettingsFromOperations;
window.uploadCompanyLogo=uploadCompanyLogo;
window.getCompanyLogoDataUrl=getCompanyLogoDataUrl;
window.companyLogoMarkup=companyLogoMarkup;

window.addEventListener("DOMContentLoaded",init);
async function init(){
  if("serviceWorker" in navigator){navigator.serviceWorker.register("./service-worker.js").catch(console.warn);}
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("PASTE_")) configWarning.classList.remove("hidden");
  sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  applyCompanyLogo();
  fillTypes(); inDate.value=today(); inNextDue.value=addMonths(today(),6); renderChecklist(); initDateParts(); bindCropCanvas(); bindRecentInspectionLimit();
  const {data:{session}}=await sb.auth.getSession(); currentUser=session?.user||null; updateAuthUI(); if(currentUser){await ensureCurrentProfile(); await loadRoles(); await loadAppSettings(); await loadData(); await refreshAuditLogs();}
}
function fillTypes(){let opts=EQUIPMENT_TYPES.map(t=>`<option>${esc(t)}</option>`).join(""); eqType.innerHTML=opts; inType.innerHTML=opts;}
function updateAuthUI(){signedOut.classList.toggle("hidden",!!currentUser); signedIn.classList.toggle("hidden",!currentUser); appMain.classList.toggle("hidden",!currentUser); userEmail.textContent=currentUser?.email||""; if(window.userRolesText) userRolesText.textContent=currentRoleText(); applyPermissions();}
async function signIn(){let email=loginEmail.value.trim(),password=loginPassword.value;if(!email||!password)return alert("Enter email and password.");let {error}=await sb.auth.signInWithPassword({email,password});if(error)return alert(error.message);let {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;updateAuthUI();await ensureCurrentProfile();await loadRoles();await loadAppSettings();await loadData();await refreshAuditLogs();}
async function signUp(){let email=loginEmail.value.trim(),password=loginPassword.value;if(!email||!password)return alert("Enter email and password.");let {error}=await sb.auth.signUp({email,password});if(error)return alert(error.message);alert("Account created. If email confirmation is enabled, check your email before signing in.");}
async function signOut(){await sb.auth.signOut();currentUser=null;currentRoles=[];userProfiles=[];roleAssignments=[];equipment=[];inspections=[];photos=[];updateAuthUI();renderAll();}

async function ensureCurrentProfile(){
  if(!currentUser)return;
  try{
    const email=currentUser.email||"";
    await sb.from("profiles").upsert({user_id:currentUser.id,email,display_name:email.split("@")[0]||email,last_seen_at:nowIso()},{onConflict:"user_id"});
  }catch(err){console.warn("Profile sync skipped",err);}
}
async function loadRoles(){
  currentRoles=[];
  if(!currentUser)return;
  try{
    const r=await sb.from("user_roles").select("role").eq("user_id",currentUser.id).order("role");
    if(r.error){console.warn("Role loading issue",r.error.message);}
    currentRoles=(r.data||[]).map(x=>x.role).filter(Boolean);
  }catch(err){console.warn("Role loading skipped",err);}
  updateAuthUI();
}
function applyPermissions(){
  const byId=id=>document.getElementById(id);
  if(byId("userRolesText")) byId("userRolesText").textContent=currentRoleText();
  if(byId("usersTabButton")) byId("usersTabButton").classList.toggle("hidden",!canManageUsers());
  if(byId("adminTabButton")) byId("adminTabButton").classList.toggle("hidden",!canAdminControls());
  if(byId("inspectTabButton")) byId("inspectTabButton").classList.toggle("hidden",!canInspect());
  if(byId("exportTabButton")) byId("exportTabButton").classList.toggle("hidden",!canExport());
  if(byId("certificateTabButton")) byId("certificateTabButton").classList.toggle("hidden",!canCertificates());
  if(byId("addItemButton")) byId("addItemButton").classList.toggle("hidden",!canEditEquipment());
}
async function loadUsers(){
  if(!requirePerm(canManageUsers(),"Only Admin users can manage accounts and roles."))return;
  const p=await sb.from("profiles").select("user_id,email,display_name,created_at,last_seen_at").order("email");
  if(p.error)return alert("Could not load users: "+p.error.message);
  const r=await sb.from("user_roles").select("id,user_id,role,created_at").order("role");
  if(r.error)return alert("Could not load roles: "+r.error.message);
  userProfiles=p.data||[]; roleAssignments=r.data||[]; renderUsers();
}
function rolesForUser(userId){return roleAssignments.filter(x=>x.user_id===userId).map(x=>x.role);}
function renderUsers(){
  if(!window.userList)return;
  const roleSummary=currentRoles.length?currentRoles.join(", "):"No roles";
  adminRoleSummary.textContent=roleSummary;
  userList.innerHTML=userProfiles.map(u=>{
    const rs=rolesForUser(u.user_id);
    const checks=ROLE_DEFS.map(role=>`<label class="roleCheck"><input type="checkbox" ${rs.includes(role)?"checked":""} onchange="toggleUserRole('${u.user_id}','${escAttr(role)}',this.checked,this)"> ${esc(role)}</label>`).join("");
    return `<div class="userCard"><div><b>${esc(u.display_name||u.email||"User")}</b><div class="muted">${esc(u.email||"")}</div><div class="muted">Last seen: ${esc(u.last_seen_at||"—")}</div></div><div class="roleGrid">${checks}</div></div>`;
  }).join("") || `<p class="muted">No users found. Users appear here after they create an account and sign in once.</p>`;
}
async function toggleUserRole(userId,role,checked,el){
  if(!requirePerm(canManageUsers(),"Only Admin users can manage roles.")){if(el)el.checked=!checked;return;}
  const existing=roleAssignments.find(x=>x.user_id===userId && x.role===role);
  if(!checked && role==="Admin"){
    const adminCount=roleAssignments.filter(x=>x.role==="Admin").length;
    if(adminCount<=1){alert("Cannot remove the last Admin role.");if(el)el.checked=true;return;}
  }
  let res;
  if(checked && !existing) res=await sb.from("user_roles").insert({user_id:userId,role,assigned_by:currentUser.id});
  if(!checked && existing) res=await sb.from("user_roles").delete().eq("id",existing.id);
  if(res?.error){alert(res.error.message);if(el)el.checked=!checked;return;}
  await logAudit(checked?"user_role_assigned":"user_role_removed","user_role",null,`${checked?"Assigned":"Removed"} ${role} role`,{target_user_id:userId,role});
  if(userId===currentUser.id) await loadRoles();
  await loadUsers();
}

async function loadData(){
  let eq=await sb.from("equipment").select("*").order("serial"); if(eq.error)return alert(eq.error.message);
  let ins=await sb.from("inspections").select("*").order("inspection_date",{ascending:false}); if(ins.error)return alert(ins.error.message);
  let ph=await sb.from("equipment_photos").select("*").order("created_at",{ascending:false}); if(ph.error) console.warn(ph.error.message);
  let iph=await sb.from("inspection_photos").select("*").order("created_at",{ascending:false}); if(iph.error) console.warn("Inspection photo table issue: "+iph.error.message);
  let cert=await sb.from("certificates").select("*").order("created_at",{ascending:false}); if(cert.error) console.warn("Certificate table issue: "+cert.error.message);
  await loadAppSettings();
  try{let al=await sb.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(250); if(!al.error) auditLogs=al.data||[];}catch(e){console.warn("Audit log skipped",e);}
  equipment=eq.data||[]; inspections=ins.data||[]; photos=ph.data||[]; inspectionPhotos=iph.data||[]; certificates=cert.data||[]; renderAll(); renderSuggestions();
}
function renderAll(){renderDashboard();renderEquipment();renderInspections();renderNotifications();applyPermissions();if(window.reportTypeFilter) fillReportFilterOptions();if(window.certTypeFilter) fillCertificateFilterOptions();if(window.certificateHistory) renderCertificateHistory();if(window.certMode) updateCertificateUI();}
function showTab(id){if(id==="certificates")window.SWOperationsV4?.installCertificatesV424?.();document.querySelectorAll(".tabpane").forEach(x=>x.classList.add("hidden"));const pane=document.getElementById(id);if(!pane)return;pane.classList.remove("hidden");document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));let t=document.querySelector(`[data-tab="${id}"]`);if(t)t.classList.add("active");if(id==="export")renderReportsHome();setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),10);}
function recentInspectionLimit(){
  const value=Number(document.getElementById("heightRecentLimit")?.value||10);
  return [10,20,30,50].includes(value)?value:10;
}
function renderRecentInspectionHistory(){
  const target=document.getElementById("dashRecent");
  if(!target)return;
  const limit=recentInspectionLimit();
  const rows=inspections.slice(0,limit);
  target.innerHTML=rows.map(i=>`<div class="lineItem" onclick="openItemBySerial('${escAttr(i.serial)}')"><b>${esc(i.serial)}</b><span class="hideMobile">${esc(i.equipment_type)}</span><span>${pill(i.result)}</span></div>`).join("") || `<p class="muted">No inspections yet.</p>`;
}
function bindRecentInspectionLimit(){
  const selector=document.getElementById("heightRecentLimit");
  if(!selector||selector.dataset.appRecentBound==="1")return;
  selector.dataset.appRecentBound="1";
  selector.value=["10","20","30","50"].includes(selector.value)?selector.value:"10";
  selector.addEventListener("change",renderRecentInspectionHistory);
}
function renderDashboard(){
  const active=equipment.filter(e=>!isArchived(e)); const due=active.filter(isDue); const failed=active.filter(isFailed); const archived=equipment.filter(isArchived);
  dashTotal.textContent=equipment.length; dashInService.textContent=active.filter(e=>e.status==="In Service").length; dashDue.textContent=due.length; dashFailed.textContent=failed.length; dashArchived.textContent=archived.length;
  dashNextDue.innerHTML=due.slice(0,7).map(e=>`<div class="lineItem" onclick="openItem('${e.id}')"><b>${esc(e.serial)}</b><span class="hideMobile">${esc(e.type)}</span><span>${esc(latest(e.serial)?.next_due||"No inspection")}</span></div>`).join("") || `<p class="muted">No active equipment due.</p>`;
  bindRecentInspectionLimit();
  renderRecentInspectionHistory();
  let counts={};EQUIPMENT_TYPES.forEach(t=>counts[t]=0);active.forEach(e=>counts[e.type||"Other"]=(counts[e.type||"Other"]||0)+1);
  if(window.dashTypes) dashTypes.innerHTML=EQUIPMENT_TYPES.map((t,i)=>`<div class="typeTile type-${i%5}" onclick="setRegisterFilter('type','${escAttr(t)}')"><span>${esc(t)}</span><b>${counts[t]||0}</b></div>`).join("");
}
function escAttr(s){return String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,"&quot;");}
function equipmentFilterEls(){
  return {
    type:document.getElementById("equipmentFilterType"),
    status:document.getElementById("equipmentFilterStatus"),
    result:document.getElementById("equipmentFilterResult"),
    due:document.getElementById("equipmentFilterDue"),
    q:document.getElementById("equipmentFilterSearch"),
    clear:document.getElementById("equipmentFilterClear"),
    count:document.getElementById("equipmentFilterCount"),
    list:document.getElementById("equipmentList")
  };
}
function readEquipmentFilterState(){
  const el=equipmentFilterEls();
  equipmentFilterState={
    type:el.type?.value||"",
    status:el.status?.value||"",
    result:el.result?.value||"",
    due:el.due?.value||"",
    q:(el.q?.value||"").trim().toLowerCase()
  };
  return equipmentFilterState;
}
function writeEquipmentFilterState(){
  const el=equipmentFilterEls();
  if(el.type) el.type.value=equipmentFilterState.type||"";
  if(el.status) el.status.value=equipmentFilterState.status||"";
  if(el.result) el.result.value=equipmentFilterState.result||"";
  if(el.due) el.due.value=equipmentFilterState.due||"";
  if(el.q) el.q.value=equipmentFilterState.q||"";
}
function populateEquipmentFilterOptions(){
  const el=equipmentFilterEls();
  if(!el.type||!el.status)return;
  const typeValue=equipmentFilterState.type||el.type.value||"";
  const statusValue=equipmentFilterState.status||el.status.value||"";
  const types=[...new Set(equipment.map(e=>e.type).filter(Boolean))].sort();
  const statuses=[...new Set(equipment.map(e=>isArchived(e)?"Archived / disposed":e.status).filter(Boolean))].sort();
  el.type.innerHTML=`<option value="">All types</option>`+types.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  el.status.innerHTML=`<option value="">All statuses</option>`+statuses.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  el.type.value=types.includes(typeValue)?typeValue:"";
  el.status.value=statuses.includes(statusValue)?statusValue:"";
}
function equipmentDueState(e){
  const l=latest(e.serial);
  if(!l)return "no_inspection";
  return isDue(e)?"due":"ok";
}
function applyLegacyEquipmentFilter(rows){
  const m=activeFilter.mode,v=activeFilter.value;
  if(m==="active") return rows.filter(e=>!isArchived(e));
  if(m==="all") return rows;
  if(m==="status") return rows.filter(e=>!isArchived(e)&&e.status===v);
  if(m==="due") return rows.filter(isDue);
  if(m==="dueSoon") return rows.filter(isDueSoonEquipment);
  if(m==="overdue") return rows.filter(isOverdueEquipment);
  if(m==="noInspection") return rows.filter(e=>!isArchived(e)&&!latest(e.serial));
  if(m==="noPhotos") return rows.filter(e=>!isArchived(e)&&!hasEquipmentPhoto(e));
  if(m==="noInspectionPhotos") return rows.filter(e=>!isArchived(e)&&latest(e.serial)&&!latestInspectionHasPhoto(e));
  if(m==="failed") return rows.filter(isFailed);
  if(m==="archived") return rows.filter(isArchived);
  if(m==="type") return rows.filter(e=>!isArchived(e)&&e.type===v);
  if(m==="manufacturer") return rows.filter(e=>!isArchived(e)&&(e.manufacturer||"")===v);
  if(m==="model") return rows.filter(e=>!isArchived(e)&&(e.model||"")===v);
  return rows;
}
function filteredEquipment(){
  let rows=applyLegacyEquipmentFilter([...equipment]);
  const f=equipmentFilterState;
  if(f.type) rows=rows.filter(e=>e.type===f.type);
  if(f.status) rows=rows.filter(e=>(isArchived(e)?"Archived / disposed":e.status)===f.status);
  if(f.result) rows=rows.filter(e=>latest(e.serial)?.result===f.result);
  if(f.due) rows=rows.filter(e=>equipmentDueState(e)===f.due);
  if(f.q) rows=rows.filter(e=>JSON.stringify(e).toLowerCase().includes(f.q));
  return rows;
}
function renderEquipmentResults(){
  const el=equipmentFilterEls();
  if(!el.list)return;
  const rows=filteredEquipment();
  if(el.count) el.count.textContent=`${rows.length} item${rows.length===1?"":"s"} shown.`;
  el.list.innerHTML=rows.map(e=>{let l=latest(e.serial), count=photos.filter(p=>p.equipment_id===e.id).length;return `<div class="listItem" onclick="openItem('${e.id}')"><div class="listItemTop"><div><b>${esc(e.serial)}</b> ${pill(isArchived(e)?"Archived":e.status)}<div class="muted">${esc(e.type)} • ${esc(e.manufacturer||"")} ${esc(e.model||"")}</div></div><span class="badge">${count} photos</span></div><div class="muted">Last: ${l?esc(l.inspection_date+" - "+l.result):"None"} ${l?.next_due?"• Next due: "+esc(l.next_due):""}</div></div>`;}).join("") || `<p class="muted">No equipment found.</p>`;
  if(window.serials) serials.innerHTML=equipment.map(e=>`<option value="${esc(e.serial)}"></option>`).join("");
}
function bindEquipmentFilters(){
  if(equipmentFiltersBound)return;
  const el=equipmentFilterEls();
  if(!el.type||!el.status||!el.result||!el.due||!el.q)return;
  const update=e=>{
    e?.stopPropagation?.();
    activeFilter={mode:"active",value:"active"};
    readEquipmentFilterState();
    renderEquipmentResults();
  };
  el.type.addEventListener("change",update);
  el.status.addEventListener("change",update);
  el.result.addEventListener("change",update);
  el.due.addEventListener("change",update);
  el.q.addEventListener("input",update);
  el.clear?.addEventListener("click",e=>{
    e.preventDefault();e.stopPropagation();
    activeFilter={mode:"active",value:"active"};
    equipmentFilterState={type:"",status:"",result:"",due:"",q:""};
    writeEquipmentFilterState();
    renderEquipmentResults();
  });
  equipmentFiltersBound=true;
}
function setRegisterFilter(mode,value){
  activeFilter={mode,value};
  equipmentFilterState={type:"",status:"",result:"",due:"",q:""};
  if(mode==="type") equipmentFilterState.type=value;
  if(mode==="status") equipmentFilterState.status=value;
  if(mode==="due"||mode==="overdue"||mode==="dueSoon") equipmentFilterState.due="due";
  if(mode==="noInspection") equipmentFilterState.due="no_inspection";
  showTab("equipment");
  renderEquipment();
}
function clearFilter(){
  activeFilter={mode:"active",value:"active"};
  equipmentFilterState={type:"",status:"",result:"",due:"",q:""};
  writeEquipmentFilterState();
  renderEquipmentResults();
}
function filterLabelText(){return "";}
function renderEquipment(){
  populateEquipmentFilterOptions();
  writeEquipmentFilterState();
  bindEquipmentFilters();
  renderEquipmentResults();
}
window.renderEquipmentCore=renderEquipment;
async function firstPhotoUrl(equipmentId){let p=photos.find(x=>x.equipment_id===equipmentId); if(!p)return null; let r=await sb.storage.from("equipment-photos").createSignedUrl(p.file_path,3600); return r.error?null:r.data.signedUrl;}
async function openItem(id){let e=equipment.find(x=>x.id===id); if(!e)return; showTab("detail"); await renderDetail(e);}
function openItemBySerial(serial){let e=equipment.find(x=>x.serial===serial); if(e) openItem(e.id);}
async function renderDetail(e){
  detailContent.innerHTML=`<div class="card"><p class="muted">Loading item...</p></div>`;
  let l=latest(e.serial); let url=await firstPhotoUrl(e.id);
  let history=inspections.filter(i=>i.serial===e.serial).sort((a,b)=>(b.inspection_date||"").localeCompare(a.inspection_date||""));
  let actions=`<button onclick="showTab('equipment')">← Register</button>`;
  if(canInspect()) actions+=`<button class="primary" onclick="startInspection('${e.id}')">Inspect</button>`;
  if(canCertificates() && l) actions+=`<button class="primary" onclick="window.SWOperationsV4?.printEquipmentCertificateV433?SWOperationsV4.printEquipmentCertificateV433('${escAttr(e.id)}'):generateCertificateForInspection('${escAttr(l.id)}')">Print Certificate</button>`;
  if(canEditEquipment()) actions+=`<button onclick="editEquipment('${e.id}')">Edit</button>`;
  if(canAddPhotos()) actions+=`<label class="uploadBtn">Take photo<input type="file" accept="image/*" capture="environment" onchange="selectExistingEquipmentPhotos('${e.id}', this.files);this.value=''"></label><label class="uploadBtn">Choose from gallery<input type="file" accept="image/*" multiple onchange="selectExistingEquipmentPhotos('${e.id}', this.files);this.value=''"></label>`;
  if(canArchive()) actions+=isArchived(e)?`<button onclick="restoreItem('${e.id}')">Restore</button>`:`<button class="danger" onclick="archiveItem('${e.id}')">Archive / dispose</button>`;
  detailContent.innerHTML=`<div class="card"><div class="row">${actions}</div>${currentRoles.length?"":`<p class="warning">Your account currently has no assigned roles, so this item is view-only.</p>`}</div>
  <div class="card detailHero"><div class="heroPhoto">${url?`<img src="${url}" alt="Equipment photo">`:`<span class="muted">No photo yet</span>`}</div><div><h2>${esc(e.serial)} ${pill(isArchived(e)?"Archived":e.status)}</h2><div class="kv"><b>Type</b><span class="quickLink" onclick="setRegisterFilter('type','${escAttr(e.type)}')">${esc(e.type)}</span></div><div class="kv"><b>Manufacturer</b><span>${e.manufacturer?`<span class="quickLink" onclick="setRegisterFilter('manufacturer','${escAttr(e.manufacturer)}')">${esc(e.manufacturer)}</span>`:"—"}</span></div><div class="kv"><b>Model</b><span>${e.model?`<span class="quickLink" onclick="setRegisterFilter('model','${escAttr(e.model)}')">${esc(e.model)}</span>`:"—"}</span></div><div class="kv"><b>Rope length</b><span>${e.rope_length_m?esc(e.rope_length_m)+" m":"—"}</span></div><div class="kv"><b>Manufactured</b><span>${esc(e.date_manufactured||"—")}</span></div><div class="kv"><b>First used</b><span>${esc(e.date_first_used||"—")}</span></div><div class="kv"><b>Retirement</b><span>${esc(e.retirement_date||"—")}</span></div><div class="kv"><b>Last inspection</b><span>${l?`${esc(l.inspection_date)} ${pill(l.result)}`:"No inspection recorded"}</span></div><div class="kv"><b>Next due</b><span>${esc(l?.next_due||"—")}</span></div><div class="kv"><b>Notes</b><span>${esc(e.notes||"—")}</span></div>${isArchived(e)?`<div class="kv"><b>Disposed</b><span>${esc(e.disposed_at||e.archived_at||"—")}</span></div><div class="kv"><b>Reason</b><span>${esc(e.disposal_reason||"—")}</span></div>`:""}</div></div>
  <div class="card"><h2>Photos</h2><div id="detailPhotos"></div></div><div class="card"><h2>Inspection History</h2>${history.map(i=>{let pc=inspectionPhotos.filter(p=>p.inspection_id===i.id).length;return `<div class="lineItem" onclick="openInspectionDetail('${i.id}')"><b>${esc(i.inspection_date)}</b><span>${pill(i.result)}</span><span>${pc} photos</span></div><p class="muted">${esc(i.notes||"")}</p>`}).join("")||`<p class="muted">No inspections yet.</p>`}</div>`;
  await renderPhotoGallery(e.id,"detailPhotos");
}
async function renderPhotoGallery(equipmentId,targetId){
  let target=document.getElementById(targetId); let rows=photos.filter(p=>p.equipment_id===equipmentId); if(!rows.length){target.innerHTML=`<p class="muted">No photos yet.</p>`;return;}
  let parts=[]; for(const p of rows){let signed=await sb.storage.from("equipment-photos").createSignedUrl(p.file_path,3600); if(signed.error){parts.push(`<div class="warning">Could not load ${esc(p.file_name||"photo")}</div>`);continue;} parts.push(`<div class="photoCard"><img src="${signed.data.signedUrl}" alt="${esc(p.file_name||"Equipment photo")}">${canAddPhotos()?`<button class="danger" onclick="deleteEquipmentPhoto('${p.id}','${escAttr(p.file_path)}')">Delete</button>`:""}</div>`);} target.innerHTML=`<div class="photoGrid">${parts.join("")}</div>`;
}
function newEquipment(){if(!requirePerm(canEditEquipment(),"Only Admin or Equipment Manager users can add equipment."))return;clearEquipmentForm();equipmentFormTitle.textContent="Add Equipment";showTab("editEquipment");}
function editEquipment(id){if(!requirePerm(canEditEquipment(),"Only Admin or Equipment Manager users can edit equipment."))return;let e=equipment.find(x=>x.id===id);if(!e)return;equipmentFormTitle.textContent="Edit Equipment";eqId.value=e.id;eqSerial.value=e.serial;eqType.value=e.type;eqMaker.value=e.manufacturer||"";eqModel.value=e.model||"";setDateParts("eqMade",e.date_manufactured||"");setDateParts("eqFirstUsed",e.date_first_used||"");setDateParts("eqRetire",e.retirement_date||"");eqFreq.value=e.inspection_frequency||appSettingValue("default_inspection_frequency","6 monthly");eqStatus.value=e.status||"In Service";eqNotes.value=e.notes||"";eqRopeLength.value=e.rope_length_m||"";eqServiceLifeYears.value=eqServiceLifeYears.value||"10";pendingEquipmentPhotos=[];renderPendingPhotos();toggleRopeLengthField();showTab("editEquipment");}
function clearEquipmentForm(){["eqId","eqSerial","eqMaker","eqModel","eqNotes","eqRopeLength"].forEach(id=>document.getElementById(id).value="");setDateParts("eqMade","");setDateParts("eqFirstUsed","");setDateParts("eqRetire","");eqServiceLifeYears.value="10";eqRetireBasis.value="manufactured";eqAutoRetire.checked=true;eqType.value="Harness";eqFreq.value=appSettingValue("default_inspection_frequency","6 monthly");eqStatus.value="In Service";pendingEquipmentPhotos=[];renderPendingPhotos();toggleRopeLengthField();}
function toggleRopeLengthField(){ropeLengthWrap.classList.toggle("hidden",!typeNeedsLength(eqType.value));}

function initDateParts(){
  ["eqMade","eqFirstUsed","eqRetire"].forEach(prefix=>{
    ["Day","Month","Year"].forEach(part=>{
      const el=document.getElementById(prefix+part);
      if(!el)return;
      el.addEventListener("input",()=>{
        syncHiddenDate(prefix);
        if(prefix==="eqMade"||prefix==="eqFirstUsed") maybeAutoCalculateRetire();
        if(prefix==="eqRetire" && document.activeElement===el && window.eqAutoRetire) eqAutoRetire.checked=false;
      });
      el.addEventListener("change",()=>{
        syncHiddenDate(prefix);
        if(prefix==="eqMade"||prefix==="eqFirstUsed") maybeAutoCalculateRetire();
      });
    });
  });
  if(window.eqServiceLifeYears) eqServiceLifeYears.addEventListener("input",maybeAutoCalculateRetire);
  if(window.eqRetireBasis) eqRetireBasis.addEventListener("change",maybeAutoCalculateRetire);
  if(window.eqAutoRetire) eqAutoRetire.addEventListener("change",maybeAutoCalculateRetire);
}
function syncHiddenDate(prefix){
  const dayEl=document.getElementById(prefix+"Day"),monthEl=document.getElementById(prefix+"Month"),yearEl=document.getElementById(prefix+"Year"),hidden=document.getElementById(prefix);
  if(!dayEl||!monthEl||!yearEl||!hidden)return;
  const y=String(yearEl.value||"").trim(),m=String(monthEl.value||"").trim(),d=String(dayEl.value||"01").trim().padStart(2,"0");
  hidden.value=(y&&m)?`${y}-${m}-${d}`:"";
}
function setDateParts(prefix,iso){
  const dayEl=document.getElementById(prefix+"Day"),monthEl=document.getElementById(prefix+"Month"),yearEl=document.getElementById(prefix+"Year"),hidden=document.getElementById(prefix);
  if(!dayEl||!monthEl||!yearEl||!hidden)return;
  hidden.value=iso||"";
  const match=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  yearEl.value=match?match[1]:""; monthEl.value=match?match[2]:""; dayEl.value=match?String(Number(match[3])):"";
}
function addYearsIso(iso,years){
  if(!iso||!years)return "";
  const d=new Date(iso+"T00:00:00");
  if(Number.isNaN(d.getTime()))return "";
  d.setFullYear(d.getFullYear()+Number(years));
  return d.toISOString().slice(0,10);
}
function maybeAutoCalculateRetire(){if(window.eqAutoRetire && eqAutoRetire.checked) calculateRetirementDate();}
function calculateRetirementDate(){
  const years=Number(eqServiceLifeYears?.value||0);
  if(!years)return;
  const base=eqRetireBasis.value==="first_used"?eqFirstUsed.value:eqMade.value;
  const result=addYearsIso(base,years);
  if(result)setDateParts("eqRetire",result);
}

async function saveEquipment(){
  if(!requirePerm(canEditEquipment(),"Only Admin or Equipment Manager users can save equipment."))return;
  let serial=eqSerial.value.trim();if(!serial)return alert("Serial number required.");
  let row={serial,type:eqType.value,manufacturer:eqMaker.value.trim(),model:eqModel.value.trim(),date_manufactured:eqMade.value||null,date_first_used:eqFirstUsed.value||null,retirement_date:eqRetire.value||null,inspection_frequency:eqFreq.value,status:eqStatus.value,notes:eqNotes.value.trim(),rope_length_m:typeNeedsLength(eqType.value)&&(eqRopeLength.value!=="")?Number(eqRopeLength.value):null};
  let savedId=eqId.value;
  const wasNew=!savedId;
  if(savedId){let r=await sb.from("equipment").update(row).eq("id",savedId).select().single();if(r.error)return alert(r.error.message);}
  else{let r=await sb.from("equipment").insert({...row,initial_inspection_required:true}).select().single();if(r.error)return alert(r.error.message);savedId=r.data.id;}
  await logAudit(wasNew?"equipment_created":"equipment_updated","equipment",savedId,`${wasNew?"Created":"Updated"} equipment ${serial}`,row);
  if(pendingEquipmentPhotos.length){for(const p of pendingEquipmentPhotos){await uploadBlobToEquipment(savedId,p.blob,p.fileName);}pendingEquipmentPhotos=[];}
  await loadData();
  const isNew=!eqId.value; clearEquipmentForm();
  if(isNew && confirm("Item saved. Start the initial inspection now?")){startInspection(savedId,"Initial Commissioning Inspection");return;}
  openItem(savedId);
}
function renderSuggestions(){let makers=[...new Set(equipment.map(e=>e.manufacturer).filter(Boolean))].sort();let models=[...new Set(equipment.map(e=>e.model).filter(Boolean))].sort();manufacturerSuggestions.innerHTML=makers.map(x=>`<option value="${esc(x)}"></option>`).join("");modelSuggestions.innerHTML=models.map(x=>`<option value="${esc(x)}"></option>`).join("");}
function renderChecklist(){let items=CHECKLISTS[inType.value]||CHECKLISTS.Other;checklist.innerHTML=items.map(i=>`<label><input class="chk" type="checkbox" value="${esc(i)}"> ${esc(i)}</label>`).join("");}
function startInspection(id,title="New Inspection"){if(!requirePerm(canInspect(),"Only Admin or Inspector users can start inspections."))return;let e=equipment.find(x=>x.id===id);if(!e)return;inspectTitle.textContent=title;inSerial.value=e.serial;inType.value=e.type;inDate.value=today();inNextDue.value=addMonths(today(),6);inResult.value="Pass";renderChecklist();showTab("inspect");setTimeout(()=>inDate.focus(),250);}
function loadEquipmentForInspection(){let e=equipment.find(x=>x.serial.toLowerCase()===inSerial.value.trim().toLowerCase());if(e){inType.value=e.type;renderChecklist();}}
async function saveInspection(){
  if(!requirePerm(canInspect(),"Only Admin or Inspector users can save inspections."))return;
  let serial=inSerial.value.trim();if(!serial)return alert("Serial number required.");
  let e=equipment.find(x=>x.serial.toLowerCase()===serial.toLowerCase());
  if(!e){let r=await sb.from("equipment").insert({serial,type:inType.value,status:"In Service",inspection_frequency:"6 monthly"}).select().single();if(r.error)return alert(r.error.message);e=r.data;}
  let checks=[...document.querySelectorAll(".chk:checked")].map(x=>x.value);
  let row={equipment_id:e.id,serial,equipment_type:inType.value,inspection_date:inDate.value||today(),inspector:inInspector.value.trim(),result:inResult.value,next_due:inNextDue.value||null,checklist:checks,notes:inNotes.value.trim()};
  let r=await sb.from("inspections").insert(row).select().single();if(r.error)return alert(r.error.message);
  const savedInspection=r.data;
  if(pendingInspectionPhotos.length){for(const p of pendingInspectionPhotos){await uploadBlobToInspection(savedInspection.id,e.id,p.blob,p.fileName);}pendingInspectionPhotos=[];}
  let update={type:inType.value,initial_inspection_required:false};
  if(inResult.value==="Pass") update.status="In Service";
  if(inResult.value==="Fail - Repair Required") update.status="Quarantined";
  if(inResult.value==="Fail - Remove From Service / Disposal"){update.status="Retired";update.archived=true;update.archived_at=nowIso();update.disposed_at=nowIso();update.disposal_reason=inNotes.value.trim()||"Failed inspection - remove from service/disposal";}
  await sb.from("equipment").update(update).eq("id",e.id);
  await logAudit("inspection_created","inspection",savedInspection.id,`Inspection ${inResult.value} for ${serial}`,{equipment_id:e.id,result:inResult.value,next_due:inNextDue.value||null});
  clearInspectionForm();await loadData();openItem(e.id);
}
function clearInspectionForm(){inspectTitle.textContent="New Inspection";inSerial.value="";inDate.value=today();inNextDue.value=addMonths(today(),6);inResult.value="Pass";inNotes.value="";inType.value="Harness";pendingInspectionPhotos=[];if(window.inspectionPhotoPreview) inspectionPhotoPreview.innerHTML="";renderChecklist();}
function renderInspections(){inspectionList.innerHTML=inspections.slice(0,10).map(i=>{let pc=inspectionPhotos.filter(p=>p.inspection_id===i.id).length;return `<div class="listItem" onclick="openInspectionDetail('${i.id}')"><b>${esc(i.inspection_date)}</b> ${pill(i.result)}<div>${esc(i.serial)} • ${esc(i.equipment_type)} • ${pc} photos</div><div class="muted">${esc(i.notes||"")}</div></div>`}).join("") || `<p class="muted">No inspections yet.</p>`;}
async function archiveItem(id){if(!requirePerm(canArchive(),"Only Admin or Equipment Manager users can archive equipment."))return;let e=equipment.find(x=>x.id===id);let reason=prompt("Reason for archive/disposal?",""); if(reason===null)return; let method=prompt("Disposal method / notes?",""); let r=await sb.from("equipment").update({archived:true,archived_at:nowIso(),disposed_at:nowIso(),disposal_reason:reason,disposal_method:method,status:"Retired"}).eq("id",id); if(r.error)return alert(r.error.message); await logAudit("equipment_archived","equipment",id,`Archived/disposed ${e?.serial||id}`,{reason,method}); await loadData(); openItem(id);}
async function restoreItem(id){if(!requirePerm(canArchive(),"Only Admin or Equipment Manager users can restore equipment."))return;if(!confirm("Restore this item to the active register?"))return; let e=equipment.find(x=>x.id===id); let r=await sb.from("equipment").update({archived:false,archived_at:null,disposed_at:null,disposal_reason:null,disposal_method:null,status:"In Service"}).eq("id",id); if(r.error)return alert(r.error.message); await logAudit("equipment_restored","equipment",id,`Restored ${e?.serial||id}`,{}); await loadData(); openItem(id);}

function selectNewEquipmentPhoto(file){if(!file)return;selectNewEquipmentPhotos([file]);}
function selectExistingEquipmentPhoto(equipmentId,file){if(!file)return;selectExistingEquipmentPhotos(equipmentId,[file]);}
function selectNewEquipmentPhotos(files){if(!requirePerm(canAddPhotos(),"Only Admin, Equipment Manager or Inspector users can add photos."))return;beginPhotoQueue(files,{mode:"pending"});}
function selectExistingEquipmentPhotos(equipmentId,files){if(!requirePerm(canAddPhotos(),"Only Admin, Equipment Manager or Inspector users can add photos."))return;beginPhotoQueue(files,{mode:"existing",equipmentId});}
function selectInspectionPhotos(files){if(!requirePerm(canInspect(),"Only Admin or Inspector users can add inspection photos."))return;beginPhotoQueue(files,{mode:"pendingInspection"});}
function selectExistingInspectionPhotos(inspectionId,equipmentId,files){if(!requirePerm(canInspect(),"Only Admin or Inspector users can add inspection photos."))return;beginPhotoQueue(files,{mode:"existingInspection",inspectionId,equipmentId});}
function beginPhotoQueue(files,target){
  const list=Array.from(files||[]).filter(f=>String(f.type||"").startsWith("image/"));
  if(!list.length)return;
  photoQueue=list.map(file=>({file,target}));
  processNextPhoto();
}
function processNextPhoto(){
  if(!photoQueue.length)return;
  const next=photoQueue.shift();
  openCropper(next.file,next.target);
}
function openCropper(file,target){
  let img=new Image();let url=URL.createObjectURL(file);
  img.onload=()=>{
    cropState={file,target,img,url,rotation:0,crop:{left:0,right:0,top:0,bottom:0}};
    [cropLeft,cropRight,cropTop,cropBottom].forEach(x=>x.value=0);
    cropQueueInfo.classList.toggle("hidden",photoQueue.length===0);
    cropQueueInfo.textContent=photoQueue.length?`Cropping 1 photo now. ${photoQueue.length} more queued after this.`:"";
    cropModal.classList.remove("hidden");
    drawCrop();
  };
  img.onerror=()=>{URL.revokeObjectURL(url);alert("Could not open this image.");processNextPhoto();};
  img.src=url;
}
function closeCropModal(){if(cropState?.url)URL.revokeObjectURL(cropState.url);cropState=null;cropModal.classList.add("hidden");}
function cancelCrop(){photoQueue=[];closeCropModal();}
function setCropZoom(v){drawCrop();}
function rotateCrop(){if(!cropState)return;cropState.rotation=(cropState.rotation+90)%360;drawCrop();}
function resetCrop(){if(!cropState)return;cropState.crop={left:0,right:0,top:0,bottom:0};[cropLeft,cropRight,cropTop,cropBottom].forEach(x=>x.value=0);drawCrop();}
function setCropEdge(edge,value){
  if(!cropState)return;
  cropState.crop[edge]=Number(value);
  if(cropState.crop.left+cropState.crop.right>90){if(edge==="left")cropState.crop.right=90-cropState.crop.left;else cropState.crop.left=90-cropState.crop.right;cropLeft.value=cropState.crop.left;cropRight.value=cropState.crop.right;}
  if(cropState.crop.top+cropState.crop.bottom>90){if(edge==="top")cropState.crop.bottom=90-cropState.crop.top;else cropState.crop.top=90-cropState.crop.bottom;cropTop.value=cropState.crop.top;cropBottom.value=cropState.crop.bottom;}
  drawCrop();
}
function bindCropCanvas(){/* Cropping is controlled with side sliders for reliable phone use. */}
function buildRotatedCanvas(){
  const img=cropState.img,rot=cropState.rotation%360;
  const c=document.createElement("canvas"),ctx=c.getContext("2d");
  if(rot===90||rot===270){c.width=img.height;c.height=img.width;}else{c.width=img.width;c.height=img.height;}
  ctx.translate(c.width/2,c.height/2);ctx.rotate(rot*Math.PI/180);ctx.drawImage(img,-img.width/2,-img.height/2);
  return c;
}
function drawCrop(){
  if(!cropState)return;
  const c=cropCanvas,ctx=c.getContext("2d"),src=buildRotatedCanvas();
  ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle="#111827";ctx.fillRect(0,0,c.width,c.height);
  const scale=Math.min(c.width/src.width,c.height/src.height);
  const dw=src.width*scale,dh=src.height*scale,dx=(c.width-dw)/2,dy=(c.height-dh)/2;
  ctx.drawImage(src,dx,dy,dw,dh);
  const cr=cropState.crop;
  const x1=dx+dw*cr.left/100,y1=dy+dh*cr.top/100,x2=dx+dw*(1-cr.right/100),y2=dy+dh*(1-cr.bottom/100);
  ctx.fillStyle="rgba(15,23,42,.55)";ctx.fillRect(dx,dy,dw,y1-dy);ctx.fillRect(dx,y2,dw,dy+dh-y2);ctx.fillRect(dx,y1,x1-dx,y2-y1);ctx.fillRect(x2,y1,dx+dw-x2,y2-y1);
  ctx.strokeStyle="rgba(255,255,255,.95)";ctx.lineWidth=6;ctx.strokeRect(x1,y1,x2-x1,y2-y1);
}
async function saveCrop(){
  if(!cropState)return;
  const source=buildRotatedCanvas(),cr=cropState.crop;
  let sx=Math.round(source.width*cr.left/100),sy=Math.round(source.height*cr.top/100);
  let sw=Math.round(source.width*(1-(cr.left+cr.right)/100)),sh=Math.round(source.height*(1-(cr.top+cr.bottom)/100));
  sw=Math.max(1,sw);sh=Math.max(1,sh);
  const maxDim=2200,scale=Math.min(1,maxDim/Math.max(sw,sh));
  const out=document.createElement("canvas");out.width=Math.round(sw*scale);out.height=Math.round(sh*scale);
  out.getContext("2d").drawImage(source,sx,sy,sw,sh,0,0,out.width,out.height);
  out.toBlob(async blob=>{
    let fileName=(cropState.file.name||"equipment-photo.jpg").replace(/\.[^.]+$/,"")+"-cropped.jpg";
    let target=cropState.target;closeCropModal();
    if(target.mode==="pending"){
      let dataUrl=await blobToDataUrl(blob);pendingEquipmentPhotos.push({blob,fileName,preview:dataUrl});renderPendingPhotos();processNextPhoto();
    }else if(target.mode==="pendingInspection"){
      let dataUrl=await blobToDataUrl(blob);pendingInspectionPhotos.push({blob,fileName,preview:dataUrl});renderPendingInspectionPhotos();processNextPhoto();
    }else if(target.mode==="existingInspection"){
      await uploadBlobToInspection(target.inspectionId,target.equipmentId,blob,fileName);await loadData();if(photoQueue.length)processNextPhoto();else await openInspectionDetail(target.inspectionId);
    }else{
      await uploadBlobToEquipment(target.equipmentId,blob,fileName);await loadData();if(photoQueue.length)processNextPhoto();else await openItem(target.equipmentId);
    }
  },"image/jpeg",0.9);
}
function blobToDataUrl(blob){return new Promise(res=>{let r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(blob);});}
function renderPendingPhotos(){newPhotoPreview.innerHTML=pendingEquipmentPhotos.map((p,i)=>`<div class="previewCard"><img src="${p.preview}" alt="Pending photo"><button class="danger" onclick="removePendingPhoto(${i})">Remove</button></div>`).join("");}
function removePendingPhoto(i){pendingEquipmentPhotos.splice(i,1);renderPendingPhotos();}
async function uploadBlobToEquipment(equipmentId,blob,fileName){const clean=(fileName||"photo.jpg").replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${equipmentId}/${Date.now()}-${clean}`;let up=await sb.storage.from("equipment-photos").upload(path,blob,{contentType:"image/jpeg",cacheControl:"3600",upsert:false});if(up.error){alert("Photo upload failed: "+up.error.message);return;}let ins=await sb.from("equipment_photos").insert({equipment_id:equipmentId,file_path:path,file_name:fileName}).select().single();if(ins.error)alert("Photo record failed: "+ins.error.message);else await logAudit("equipment_photo_added","equipment_photo",ins.data.id,"Added equipment photo",{equipment_id:equipmentId,file_name:fileName});}
async function deleteEquipmentPhoto(photoId,filePath){if(!requirePerm(canAddPhotos(),"Only Admin, Equipment Manager or Inspector users can delete photos."))return;if(!confirm("Delete this photo?"))return;await sb.storage.from("equipment-photos").remove([filePath]);let r=await sb.from("equipment_photos").delete().eq("id",photoId);if(r.error)return alert(r.error.message);await logAudit("equipment_photo_deleted","equipment_photo",photoId,"Deleted equipment photo",{file_path:filePath});await loadData();}

function renderPendingInspectionPhotos(){if(!window.inspectionPhotoPreview)return;inspectionPhotoPreview.innerHTML=pendingInspectionPhotos.map((p,i)=>`<div class="previewCard"><img src="${p.preview}" alt="Pending inspection photo"><button class="danger" onclick="removePendingInspectionPhoto(${i})">Remove</button></div>`).join("");}
function removePendingInspectionPhoto(i){pendingInspectionPhotos.splice(i,1);renderPendingInspectionPhotos();}
async function uploadBlobToInspection(inspectionId,equipmentId,blob,fileName){const clean=(fileName||"inspection-photo.jpg").replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${equipmentId}/${inspectionId}/${Date.now()}-${clean}`;let up=await sb.storage.from("inspection-photos").upload(path,blob,{contentType:"image/jpeg",cacheControl:"3600",upsert:false});if(up.error){alert("Inspection photo upload failed: "+up.error.message);return;}let ins=await sb.from("inspection_photos").insert({inspection_id:inspectionId,equipment_id:equipmentId,file_path:path,file_name:fileName}).select().single();if(ins.error)alert("Inspection photo record failed: "+ins.error.message);else await logAudit("inspection_photo_added","inspection_photo",ins.data.id,"Added inspection photo",{inspection_id:inspectionId,equipment_id:equipmentId,file_name:fileName});}
async function deleteInspectionPhoto(photoId,filePath,inspectionId){if(!requirePerm(canInspect(),"Only Admin or Inspector users can delete inspection photos."))return;if(!confirm("Delete this inspection photo?"))return;await sb.storage.from("inspection-photos").remove([filePath]);let r=await sb.from("inspection_photos").delete().eq("id",photoId);if(r.error)return alert(r.error.message);await logAudit("inspection_photo_deleted","inspection_photo",photoId,"Deleted inspection photo",{inspection_id:inspectionId,file_path:filePath});await loadData();await openInspectionDetail(inspectionId);}
async function renderInspectionPhotoGallery(inspectionId,targetId){let target=document.getElementById(targetId); if(!target)return; let rows=inspectionPhotos.filter(p=>p.inspection_id===inspectionId); if(!rows.length){target.innerHTML=`<p class="muted">No inspection photos yet.</p>`;return;} let parts=[]; for(const p of rows){let signed=await sb.storage.from("inspection-photos").createSignedUrl(p.file_path,3600); if(signed.error){parts.push(`<div class="warning">Could not load ${esc(p.file_name||"photo")}</div>`);continue;} parts.push(`<div class="photoCard"><img src="${signed.data.signedUrl}" alt="${esc(p.file_name||"Inspection photo")}">${canInspect()?`<button class="danger" onclick="deleteInspectionPhoto('${p.id}','${escAttr(p.file_path)}','${inspectionId}')">Delete</button>`:""}</div>`);} target.innerHTML=`<div class="photoGrid">${parts.join("")}</div>`;}
async function openInspectionDetail(id){let i=inspections.find(x=>x.id===id); if(!i)return; let e=equipment.find(x=>x.id===i.equipment_id)||equipment.find(x=>x.serial===i.serial); showTab("inspectionDetail"); inspectionDetailContent.innerHTML=`<div class="card"><p class="muted">Loading inspection...</p></div>`; let checks=Array.isArray(i.checklist)?i.checklist:[]; inspectionDetailContent.innerHTML=`<div class="card"><div class="row"><button onclick="${e?`openItem('${e.id}')`:`showTab('equipment')`}">← Equipment</button>${canCertificates()?`<button class="primary" onclick="generateCertificateForInspection('${i.id}')">Generate certificate</button>`:""}${canInspect()?`<label class="uploadBtn">Take photo<input type="file" accept="image/*" capture="environment" onchange="selectExistingInspectionPhotos('${i.id}','${i.equipment_id||e?.id||""}',this.files);this.value=''"></label><label class="uploadBtn">Choose from gallery<input type="file" accept="image/*" multiple onchange="selectExistingInspectionPhotos('${i.id}','${i.equipment_id||e?.id||""}',this.files);this.value=''"></label>`:""}</div></div><div class="card"><h2>Inspection ${esc(i.inspection_date)}</h2><div class="kv"><b>Serial</b><span>${esc(i.serial)}</span></div><div class="kv"><b>Type</b><span>${esc(i.equipment_type)}</span></div><div class="kv"><b>Inspector</b><span>${esc(i.inspector||"—")}</span></div><div class="kv"><b>Result</b><span>${pill(i.result)}</span></div><div class="kv"><b>Next due</b><span>${esc(i.next_due||"—")}</span></div><div class="kv"><b>Notes</b><span>${esc(i.notes||"—")}</span></div></div><div class="card"><h2>Checklist</h2>${checks.length?checks.map(x=>`<div class="lineItem"><b>✓</b><span>${esc(x)}</span><span></span></div>`).join(""):`<p class="muted">No checklist items recorded.</p>`}</div><div class="card"><h2>Inspection Photos</h2><div id="inspectionDetailPhotos"></div></div>`; await renderInspectionPhotoGallery(id,"inspectionDetailPhotos");}



let currentCertificatePacket={title:"",targets:[]};
function fillCertificateFilterOptions(){
  if(!window.certTypeFilter)return;
  const previous=certTypeFilter.value;
  certTypeFilter.innerHTML=`<option value="">Select type</option>`+EQUIPMENT_TYPES.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
  if(previous) certTypeFilter.value=previous;
  renderCertificateItemList();
  updateCertificateUI();
}
function renderCertificatesHome(){
  if(!requirePerm(canCertificates(),"Only Admin, Office / Reports or Certificate Approver users can generate certificates."))return;
  fillCertificateFilterOptions(); renderCertificateHistory(); updateCertificateUI();
}
function renderCertificateItemList(){
  if(!window.certItemList)return;
  const active=equipment.filter(e=>!isArchived(e)).sort((a,b)=>(a.serial||"").localeCompare(b.serial||""));
  certItemList.innerHTML=active.map(e=>{
    const has=!!latestInspectionForEquipment(e);
    const warn=has?"":`<span class="warnText">No inspection history</span>`;
    return `<label class="certItemCheckRow ${has?"":"noInspection"}"><input type="checkbox" class="certItemCheck" value="${esc(e.id)}" ${has?"":"disabled"} onchange="updateCertificateUI()"> <b>${esc(e.serial)}</b> <span class="muted">${esc(e.type)} ${esc(e.manufacturer||"")} ${esc(e.model||"")}</span>${warn}</label>`;
  }).join("")||`<p class="muted">No active equipment found.</p>`;
}
function selectAllCertItems(on){
  document.querySelectorAll(".certItemCheck").forEach(x=>{ if(!x.disabled) x.checked=!!on; });
  updateCertificateUI();
}
function setCertPanel(id,show){const el=document.getElementById(id); if(el) el.classList.toggle("hidden",!show);}
function setCertValidation(msg,state="warn"){
  const v=document.getElementById("certValidation"); if(!v)return;
  v.className="certValidation "+state; v.textContent=msg;
}
function selectedCertItemIds(){return [...document.querySelectorAll(".certItemCheck:checked")].map(x=>x.value);}
function updateCertificateUI(){
  if(!window.certMode)return;
  const kind=certMode.value;
  const selected=selectedCertItemIds().length;
  if(window.certSelectedCount) certSelectedCount.textContent=`${selected} selected`;
  setCertPanel("certItemsPanel",kind==="selected_items");
  setCertPanel("certTypePanel",kind==="type_latest");
  setCertPanel("certDatePanel",kind==="inspection_date_range");
  setCertPanel("certResultPanel",kind==="inspection_result");
  const help={
    selected_items:"Tick one or more items. Certificates use the latest inspection for each selected item.",
    type_latest:"Choose an equipment type. Certificates use the latest inspection for each active item of that type.",
    inspection_date_range:"Choose a start and/or end date. Certificates are generated for inspections within that range.",
    inspection_result:"Choose an inspection result. Certificates are generated for matching inspections.",
    due_overdue:"Certificates are generated for active items currently due or overdue, using their latest inspection."
  }[kind]||"Choose certificate options.";
  if(window.certModeHelp) certModeHelp.textContent=help;
  let ok=true,msg="Ready to generate certificates.";
  if(kind==="selected_items" && selected===0){ok=false;msg="Tick at least one item with inspection history.";}
  if(kind==="type_latest" && !(certTypeFilter?.value||"")){ok=false;msg="Choose an equipment type first.";}
  if(kind==="inspection_date_range" && !(certStartDate?.value||"") && !(certEndDate?.value||"")){ok=false;msg="Choose a start date, end date, or both.";}
  if(kind==="due_overdue" && !equipment.filter(e=>!isArchived(e)).some(isDue)){ok=false;msg="There are currently no due or overdue active items.";}
  const btn=document.getElementById("certGenerateBtn"); if(btn) btn.disabled=!ok;
  setCertValidation(msg,ok?"ready":"warn");
}
function latestInspectionForEquipment(e){return inspections.filter(i=>i.serial===e.serial).sort((a,b)=>(b.inspection_date||"").localeCompare(a.inspection_date||""))[0]||null;}
function certTargetsForKind(kind){
  const active=equipment.filter(e=>!isArchived(e));
  let pairs=[];
  if(kind==="selected_items"){
    const ids=selectedCertItemIds();
    if(!ids.length){alert("Please tick at least one item first.");return [];}
    pairs=ids.map(id=>equipment.find(e=>e.id===id)).filter(Boolean).map(e=>({equipment:e,inspection:latestInspectionForEquipment(e)}));
  }else if(kind==="type_latest"){
    const type=certTypeFilter?.value||""; if(!type){alert("Choose an equipment type first.");return [];}
    pairs=active.filter(e=>e.type===type).map(e=>({equipment:e,inspection:latestInspectionForEquipment(e)}));
  }else if(kind==="inspection_date_range"){
    const start=certStartDate?.value||"",end=certEndDate?.value||""; if(!start&&!end){alert("Choose a start and/or end date first.");return [];}
    pairs=inspections.filter(i=>withinDate(i.inspection_date,start,end)).map(i=>({inspection:i,equipment:equipment.find(e=>e.id===i.equipment_id)||equipment.find(e=>e.serial===i.serial)}));
  }else if(kind==="inspection_result"){
    const result=certResult?.value||"";
    pairs=inspections.filter(i=>i.result===result).map(i=>({inspection:i,equipment:equipment.find(e=>e.id===i.equipment_id)||equipment.find(e=>e.serial===i.serial)}));
  }else if(kind==="due_overdue"){
    pairs=active.filter(isDue).map(e=>({equipment:e,inspection:latestInspectionForEquipment(e)}));
  }else if(kind==="single_inspection"){
    return [];
  }
  const before=pairs.length;
  pairs=pairs.filter(p=>p.equipment && p.inspection);
  if(!pairs.length){
    const reason=before?"The selected items do not have inspection history yet.":"No matching items were found for the selected parameters.";
    alert(reason);
  }
  return pairs;
}
async function generateCertificateForInspection(inspectionId){
  if(!requirePerm(canCertificates(),"Only Admin, Office / Reports or Certificate Approver users can generate certificates."))return;
  await withBusy("Generating certificate...", async()=>{
    const i=inspections.find(x=>x.id===inspectionId); if(!i){alert("Inspection not found.");return;}
    const e=equipment.find(x=>x.id===i.equipment_id)||equipment.find(x=>x.serial===i.serial); if(!e){alert("Equipment not found.");return;}
    await buildCertificatePacket([{equipment:e,inspection:i}],"Single inspection certificate");
  });
}
async function generateCertificates(kind){
  if(!requirePerm(canCertificates(),"Only Admin, Office / Reports or Certificate Approver users can generate certificates."))return;
  updateCertificateUI();
  const btn=document.getElementById("certGenerateBtn");
  if(btn && btn.disabled)return;
  const pairs=certTargetsForKind(kind); if(!pairs.length){updateCertificateUI(); return;}
  const title={selected_items:"Selected item certificates",type_latest:"Equipment type certificates",inspection_date_range:"Date range inspection certificates",inspection_result:"Inspection result certificates",due_overdue:"Due / overdue certificates"}[kind]||"Inspection certificates";
  if(btn) btn.classList.add("working");
  try{
    await withBusy("Generating certificates...", async()=>{ await buildCertificatePacket(pairs,title); });
    setCertValidation(`Generated ${pairs.length} certificate${pairs.length===1?"":"s"}.`,"ready");
  }finally{
    if(btn) btn.classList.remove("working");
    updateCertificateUI();
  }
}
function certNumber(serial){const clean=String(serial||"ITEM").replace(/[^a-zA-Z0-9]+/g,"").slice(0,12)||"ITEM";const d=new Date();const stamp=d.toISOString().slice(0,10).replaceAll("-","");const suffix=String(Date.now()).slice(-6);return `SW-HSE-${stamp}-${clean}-${suffix}`;}
async function signedUrl(bucket,path){if(!path)return "";let r=await sb.storage.from(bucket).createSignedUrl(path,3600);return r.error?"":r.data.signedUrl;}
async function certImageUrls(e,i){
  const includeEq=(certIncludeEquipmentPhotos?.value||"yes")==="yes";
  const includeIns=(certIncludeInspectionPhotos?.value||"yes")==="yes";
  let equipmentUrls=[],inspectionUrls=[];
  if(includeEq){for(const p of photos.filter(p=>p.equipment_id===e.id).slice(0,3)){let u=await signedUrl("equipment-photos",p.file_path); if(u)equipmentUrls.push(u);}}
  if(includeIns){for(const p of inspectionPhotos.filter(p=>p.inspection_id===i.id).slice(0,6)){let u=await signedUrl("inspection-photos",p.file_path); if(u)inspectionUrls.push(u);}}
  return {equipmentUrls,inspectionUrls};
}
async function buildCertificatePacket(pairs,title){
  const records=[];
  for(const p of pairs){
    const number=certNumber(p.equipment.serial);
    const img=await certImageUrls(p.equipment,p.inspection);
    records.push({...p,certificate_number:number,images:img});
  }
  await saveCertificateHistory(records,title);
  currentCertificatePacket={title,targets:records};
  openCertificateWindow(records,title);
  await loadCertificateHistory();
}
async function saveCertificateHistory(records,summary){
  if(!records.length)return;
  const rows=records.map(r=>({certificate_number:r.certificate_number,equipment_id:r.equipment.id,inspection_id:r.inspection.id,generated_by:currentUser?.id||null,generated_by_email:currentUser?.email||"",filter_summary:summary,status:"Generated"}));
  const ins=await sb.from("certificates").insert(rows);
  if(ins.error) alert("Certificates were created, but certificate history was not saved: "+ins.error.message); else await logAudit("certificates_generated","certificate",null,`Generated ${records.length} certificate${records.length===1?"":"s"}`,{summary,count:records.length});
}
function checklistHtml(i){const checks=Array.isArray(i.checklist)?i.checklist:[];return checks.length?`<ul>${checks.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p>No checklist items recorded.</p>`;}
function photoStrip(urls){return urls.length?`<div class="photos">${urls.map(u=>`<img src="${u}">`).join("")}</div>`:`<p class="muted">No photos included.</p>`;}
function certificatePageHtml(records,title){
  const generated=new Date().toLocaleString();
  const body=records.map(r=>{const e=r.equipment,i=r.inspection;return `<section class="cert"><div class="certHeader"><div><h1>${esc(appSettingValue("company_name","Spray & Wash"))} Height Safety Inspection Certificate</h1><p>Certificate No: <b>${esc(r.certificate_number)}</b></p></div><div class="brand">${companyLogoMarkup("certificateLogo")||"SPRAY<br>&amp; WASH"}</div></div><div class="status ${String(i.result||"").includes("Fail")?"bad":"good"}">${esc(i.result)}</div><div class="grid"><div><h2>Equipment</h2><table><tr><th>Serial</th><td>${esc(e.serial)}</td></tr><tr><th>Type</th><td>${esc(e.type)}</td></tr><tr><th>Manufacturer</th><td>${esc(e.manufacturer||"—")}</td></tr><tr><th>Model</th><td>${esc(e.model||"—")}</td></tr><tr><th>Rope length</th><td>${e.rope_length_m?esc(e.rope_length_m)+" m":"—"}</td></tr><tr><th>Manufactured</th><td>${esc(e.date_manufactured||"—")}</td></tr><tr><th>First used</th><td>${esc(e.date_first_used||"—")}</td></tr><tr><th>Retirement date</th><td>${esc(e.retirement_date||"—")}</td></tr></table></div><div><h2>Inspection</h2><table><tr><th>Date</th><td>${esc(i.inspection_date)}</td></tr><tr><th>Inspector</th><td>${esc(i.inspector||"—")}</td></tr><tr><th>Result</th><td>${esc(i.result)}</td></tr><tr><th>Next due</th><td>${esc(i.next_due||"—")}</td></tr><tr><th>Generated</th><td>${esc(generated)}</td></tr></table></div></div><h2>Checklist</h2>${checklistHtml(i)}<h2>Inspection Notes</h2><p>${esc(i.notes||"No notes recorded.")}</p><div class="photoPage"><h2>Certificate Photos</h2><h3>Equipment Photos</h3>${photoStrip(r.images.equipmentUrls)}<h3>Inspection Photos</h3>${photoStrip(r.images.inspectionUrls)}</div><footer>${esc(appSettingValue("certificate_footer","This certificate was generated from the Spray & Wash Height Safety Register. Verify against the live register before relying on expired downloaded copies."))}</footer></section>`}).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:0;background:#f8fafc}.toolbar{position:sticky;top:0;background:#0f766e;color:white;padding:12px;display:flex;gap:8px;align-items:center;z-index:5}.toolbar button{border:0;border-radius:8px;padding:10px 14px;font-weight:800}.cert{background:white;margin:18px auto;padding:28px;max-width:900px;box-shadow:0 8px 30px #0001;page-break-after:always}.certHeader{display:flex;justify-content:space-between;gap:20px;border-bottom:4px solid #0f766e;padding-bottom:16px;margin-bottom:16px}.brand{background:#0f766e;color:white;border-radius:12px;padding:14px;font-weight:900;text-align:center}.certificateLogo{display:block;max-width:150px;max-height:70px;object-fit:contain;background:white;border-radius:8px}.status{display:inline-block;border-radius:999px;padding:8px 14px;font-weight:900;margin-bottom:12px}.good{background:#dcfce7;color:#166534}.bad{background:#fee2e2;color:#991b1b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}th{width:140px;color:#475569}ul{columns:2}.photoPage{page-break-before:always;margin-top:22px}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start}.photos img{width:100%;height:240px;object-fit:contain;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;padding:4px}.muted{color:#64748b}footer{margin-top:20px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:12px;color:#64748b}@media print{.toolbar{display:none}.cert{box-shadow:none;margin:0;max-width:none;page-break-after:always}body{background:white}}@media(max-width:700px){.grid{grid-template-columns:1fr}ul{columns:1}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button><span>${esc(title)} · ${records.length} certificate(s)</span></div>${body}</body></html>`;
}
function openCertificateWindow(records,title){const html=certificatePageHtml(records,title);const w=window.open("","_blank");if(!w){downloadBlob(html,"inspection-certificates.html","text/html");alert("Popup blocked. The certificate HTML file has been downloaded instead.");return;}w.document.open();w.document.write(html);w.document.close();}
async function loadCertificateHistory(){const r=await sb.from("certificates").select("*").order("created_at",{ascending:false}).limit(100);if(r.error){console.warn(r.error.message);return;}certificates=r.data||[];renderCertificateHistory();}
function renderCertificateHistory(){if(!window.certificateHistory)return; if(!certificates.length){certificateHistory.innerHTML=`<p class="muted">No certificate history yet.</p>`;return;} certificateHistory.innerHTML=certificates.slice(0,50).map(c=>{const e=equipment.find(x=>x.id===c.equipment_id);const i=inspections.find(x=>x.id===c.inspection_id);return `<div class="certHistoryItem"><div><b>${esc(c.certificate_number)}</b><div class="muted">${esc(e?.serial||"Unknown item")} · ${esc(i?.inspection_date||"Unknown inspection")} · ${esc(c.filter_summary||"")}</div><div class="muted">Generated: ${esc(c.created_at||"")} by ${esc(c.generated_by_email||"")}</div></div>${i?`<button onclick="generateCertificateForInspection('${i.id}')">Regenerate</button>`:""}</div>`;}).join("");}
function exportCertificatesCSV(){downloadRowsCSV((certificates||[]).map(c=>({certificate_number:c.certificate_number,equipment_serial:(equipment.find(e=>e.id===c.equipment_id)||{}).serial||"",inspection_date:(inspections.find(i=>i.id===c.inspection_id)||{}).inspection_date||"",generated_by:c.generated_by_email||"",generated_at:c.created_at||"",summary:c.filter_summary||"",status:c.status||""})),"certificate-history.csv");}

let currentReport={title:"",rows:[],kind:""};
function fillReportFilterOptions(){if(!window.reportTypeFilter)return; const typeOptions=`<option value="">Select type</option>`+EQUIPMENT_TYPES.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join(""); if(reportTypeFilter.options.length<2) reportTypeFilter.innerHTML=typeOptions; if(reportInspectionType.options.length<2) reportInspectionType.innerHTML=typeOptions; const makers=[...new Set(equipment.map(e=>e.manufacturer).filter(Boolean))].sort(); reportManufacturer.innerHTML=`<option value="">Select manufacturer</option>`+makers.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join(""); const models=[...new Set(equipment.map(e=>e.model).filter(Boolean))].sort(); reportModel.innerHTML=`<option value="">Select model</option>`+models.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");}
function renderReportsHome(){if(!requirePerm(canExport(),"Only Admin, Office / Reports or Certificate Approver users can view reports."))return;fillReportFilterOptions(); if(!currentReport.rows.length) runReport("equipment_register",false);}
function withinDate(value,start,end){if(!value)return false; if(start&&value<start)return false; if(end&&value>end)return false; return true;}
function datePlus(days){let d=new Date(today()+"T00:00:00"); d.setDate(d.getDate()+Number(days)); return d.toISOString().slice(0,10);}
function reportRows(kind){let active=equipment.filter(e=>!isArchived(e)); const start=reportStartDate?.value||"",end=reportEndDate?.value||""; if(kind==="equipment_register")return equipment; if(kind==="active_equipment")return active; if(kind==="due_overdue")return active.filter(isDue); if(kind==="failed_quarantined")return active.filter(isFailed); if(kind==="archived_disposed")return equipment.filter(isArchived); if(kind==="no_equipment_photos")return active.filter(e=>!photos.some(p=>p.equipment_id===e.id)); if(kind==="no_inspection_history")return active.filter(e=>!inspections.some(i=>i.serial===e.serial)); if(kind==="equipment_type")return active.filter(e=>e.type===(reportTypeFilter.value||"")); if(kind==="equipment_manufacturer")return active.filter(e=>(e.manufacturer||"")===(reportManufacturer.value||"")); if(kind==="equipment_model")return active.filter(e=>(e.model||"")===(reportModel.value||"")); if(kind==="inspection_history")return inspections; if(kind==="inspection_date_range")return inspections.filter(i=>withinDate(i.inspection_date,start,end)); if(kind==="inspection_result")return inspections.filter(i=>i.result===(reportResult.value||"")); if(kind==="inspection_type")return inspections.filter(i=>i.equipment_type===(reportInspectionType.value||"")); if(kind==="due_within") {let until=datePlus(reportDueDays.value||30); return active.filter(e=>{let l=latest(e.serial); return l?.next_due && l.next_due<=until;});} return [];}
function reportTitle(kind){return {equipment_register:"Equipment Register",active_equipment:"Active equipment",due_overdue:"Due / overdue items",failed_quarantined:"Failed / quarantined items",archived_disposed:"Archived / disposed items",no_equipment_photos:"Items with no equipment photos",no_inspection_history:"Items with no inspection history",equipment_type:`Equipment by type: ${reportTypeFilter.value||""}`,equipment_manufacturer:`Equipment by manufacturer: ${reportManufacturer.value||""}`,equipment_model:`Equipment by model: ${reportModel.value||""}`,inspection_history:"Inspection history",inspection_date_range:`Inspections from ${reportStartDate.value||"start"} to ${reportEndDate.value||"end"}`,inspection_result:`Inspections by result: ${reportResult.value||""}`,inspection_type:`Inspections by type: ${reportInspectionType.value||""}`,due_within:`Items due within ${reportDueDays.value||30} days`}[kind]||"Report";}
function normalizeReportRow(row){if(row.inspection_date!==undefined){return {inspection_date:row.inspection_date,serial:row.serial,equipment_type:row.equipment_type,result:row.result,inspector:row.inspector||"",next_due:row.next_due||"",inspection_photos:inspectionPhotos.filter(p=>p.inspection_id===row.id).length,notes:row.notes||""};} let l=latest(row.serial); return {serial:row.serial,type:row.type,manufacturer:row.manufacturer||"",model:row.model||"",status:isArchived(row)?"Archived":(row.status||""),rope_length_m:row.rope_length_m||"",last_inspection:l?.inspection_date||"",last_result:l?.result||"",next_due:l?.next_due||"",equipment_photos:photos.filter(p=>p.equipment_id===row.id).length,archived:row.archived?"Yes":"No",notes:row.notes||""};}
function runReport(kind,reveal=true){if(!requirePerm(canExport(),"Only Admin, Office / Reports or Certificate Approver users can run reports."))return; const rows=reportRows(kind); currentReport={title:reportTitle(kind),kind,rows:rows.map(normalizeReportRow)}; renderReportPreview(); const details=document.getElementById("reportResultsDetails"); if(details&&reveal)details.open=true;}
function renderReportPreview(){if(!window.reportPreview)return; reportTitleOut.textContent=currentReport.title||"Report"; const count=document.getElementById("reportCountOut"); if(count)count.textContent=`${currentReport.rows.length} rows`; if(!currentReport.rows.length){reportPreview.innerHTML=`<p class="muted">No records found.</p>`;return;} const cols=Object.keys(currentReport.rows[0]); const max=currentReport.rows.slice(0,200); reportPreview.innerHTML=`<div class="reportTableWrap"><table class="reportTable"><thead><tr>${cols.map(c=>`<th>${esc(c.replaceAll("_"," "))}</th>`).join("")}</tr></thead><tbody>${max.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${currentReport.rows.length>200?`<p class="muted">Showing first 200 rows. Export CSV for the full report.</p>`:""}`;}
function exportCurrentReportCSV(){if(!currentReport.rows.length)return alert("Run a report first.");downloadRowsCSV(currentReport.rows,(currentReport.title||"report").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+".csv");}
function downloadRowsCSV(rows,name){if(!rows.length)return alert("Nothing to export.");let h=Object.keys(rows[0]);let csv=[h.join(","),...rows.map(r=>h.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\n");downloadBlob(csv,name,"text/csv");}
function exportCSV(kind){if(!requirePerm(canExport(),"Only Admin, Office / Reports or Certificate Approver users can export data."))return;let rows=kind==="equipment"?equipment:inspections.map(i=>({...i,checklist:JSON.stringify(i.checklist||[])}));downloadRowsCSV(rows,kind+".csv");}
function exportJSONBackup(){if(!requirePerm(canExport(),"Only Admin, Office / Reports or Certificate Approver users can export data."))return;downloadBlob(JSON.stringify({exported_at:new Date().toISOString(),equipment,inspections,photos,inspectionPhotos,certificates,auditLogs,appSettings},null,2),"height-safety-full-backup.json","application/json");}
function downloadBlob(content,name,type){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
