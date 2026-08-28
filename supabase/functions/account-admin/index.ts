import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedRoles=['Admin','Height equipment manager','Height equipment user','Maintenance manager','Vehicle inspector'];
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}});

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'POST required'},405);
  const authorization=req.headers.get('Authorization')||'';
  const client=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{global:{headers:{Authorization:authorization}}});
  const service=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
  const {data:{user}}=await client.auth.getUser();
  if(!user) return json({error:'Unauthenticated'},401);
  const {data:callerRoles}=await service.from('user_roles').select('role').eq('user_id',user.id);
  const {data:callerAccess}=await service.from('app_user_access').select('status,must_change_password').eq('user_id',user.id).maybeSingle();
  const body=await req.json(); const action=body?.action;
  if(action==='complete_first_password'){
    if(!callerAccess?.must_change_password || typeof body.password!=='string' || body.password.length<12)return json({error:'A password of at least 12 characters is required.'},400);
    const {error}=await service.auth.admin.updateUserById(user.id,{password:body.password,ban_duration:'none'}); if(error)return json({error:error.message},400);
    await service.from('app_user_access').update({must_change_password:false,updated_at:new Date().toISOString(),updated_by:user.id}).eq('user_id',user.id);
    return json({ok:true});
  }
  if(!callerAccess || callerAccess.status!=='Active' || callerAccess.must_change_password || !(callerRoles||[]).some(r=>r.role==='Admin')) return json({error:'Admin access required'},403);
  const target=String(body.user_id||'');
  if(['block','unblock','sign_out_all','delete'].includes(action) && (!target || target===user.id))return json({error:'You cannot perform this action on your own account.'},400);
  if(action==='create'){
    const roles=Array.isArray(body.roles)?body.roles:[]; if(!body.email||!body.password||body.password.length<12||!body.first_name||!body.last_name||!roles.length||roles.some((r:string)=>!allowedRoles.includes(r)))return json({error:'Invalid account details.'},400);
    const {data,error}=await service.auth.admin.createUser({email:String(body.email).toLowerCase(),password:body.password,email_confirm:true,user_metadata:{first_name:body.first_name,last_name:body.last_name,full_name:`${body.first_name} ${body.last_name}`}}); if(error)return json({error:error.message},400);
    const id=data.user.id; await service.from('profiles').upsert({user_id:id,email:String(body.email).toLowerCase(),display_name:`${body.first_name} ${body.last_name}`});
    await service.from('app_user_access').upsert({user_id:id,status:'Active',must_change_password:true,updated_by:user.id});
    const {error:roleError}=await service.from('user_roles').insert(roles.map((role:string)=>({user_id:id,role,assigned_by:user.id}))); if(roleError){await service.auth.admin.deleteUser(id);return json({error:roleError.message},400);} return json({ok:true});
  }
  if(action==='sign_out_all'){const {error}=await service.auth.admin.signOut(target,'global');return error?json({error:error.message},400):json({ok:true});}
  if(action==='block'){const {error}=await service.auth.admin.updateUserById(target,{ban_duration:'876000h'});if(error)return json({error:error.message},400);await service.from('app_user_access').update({status:'Blocked',updated_at:new Date().toISOString(),updated_by:user.id}).eq('user_id',target);await service.auth.admin.signOut(target,'global');return json({ok:true});}
  if(action==='unblock'){const {error}=await service.auth.admin.updateUserById(target,{ban_duration:'none'});if(error)return json({error:error.message},400);await service.from('app_user_access').update({status:'Active',updated_at:new Date().toISOString(),updated_by:user.id}).eq('user_id',target);return json({ok:true});}
  if(action==='delete'){const {data:targetProfile}=await service.from('profiles').select('email').eq('user_id',target).maybeSingle();if(!targetProfile||String(body.confirmation_email||'').toLowerCase()!==String(targetProfile.email||'').toLowerCase())return json({error:'Email confirmation did not match.'},400);const {count}=await service.from('operations_maintenance_tasks').select('*',{count:'exact',head:true}).or(`created_by.eq.${target},completed_by.eq.${target}`);if(count)return json({error:'This account has operational history. Block it instead.'},400);const {error}=await service.auth.admin.deleteUser(target);return error?json({error:error.message},400):json({ok:true});}
  return json({error:'Unknown action'},400);
});
