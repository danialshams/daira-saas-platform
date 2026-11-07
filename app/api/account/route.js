import { sql,transaction } from '../../../lib/db.js';
import { getUser,hashToken,randomToken,hashPassword,verifyPassword,consumeRate,endSession } from '../../../lib/auth.js';
import { sendEmail,providerStatus,ProviderNotConfigured } from '../../../lib/providers.js';
import { safeMutation } from '../../../lib/csrf.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(v,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
const validPassword=v=>typeof v==='string'&&v.length>=10&&v.length<=128;
const mail=v=>String(v||'').trim().toLowerCase();
const isEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const routeUrl=request=>new URL(request.url).origin;
async function createToken(userId,purpose,payload={}){
 const token=randomToken(32);
 await transaction(async client=>{
  await client.query('UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',[userId,purpose]);
  await client.query("INSERT INTO account_tokens(token_hash,user_id,purpose,payload,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')",[hashToken(token),userId,purpose,JSON.stringify(payload)]);
 });return token;
}
export async function POST(request){
 try{
  if(!safeMutation(request))return reply({error:'مبدأ درخواست مجاز نیست.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON_REQUIRED'},415);
  const raw=await request.text();if(raw.length>8192)return reply({error:'PAYLOAD_TOO_LARGE'},413);
  const body=JSON.parse(raw);const action=String(body?.action||'');
  const host=routeUrl(request);
  if(action==='forgot-password'){
   const email=mail(body.email);
   if(!isEmail(email))return reply({error:'ایمیل معتبر نیست.'},400);
   if(!providerStatus().email)return reply({error:'سامانه ارسال ایمیل هنوز فعال نشده است.'},503);
   const ratelimit='recover:'+hashToken(email);
   if(!await consumeRate(ratelimit,3,3600))return reply({error:'درخواست‌های زیادی ثبت شده است.'},429);
   const {rows:[user]}=await sql('SELECT id,email FROM users WHERE email=$1',[email]);
   if(user){const token=await createToken(user.id,'reset_password');
    try{await sendEmail({to:user.email,subject:'بازیابی رمز عبور دایرا کلود',text:`برای تنظیم رمز جدید لینک زیر را باز کنید (۳۰ دقیقه اعتبار دارد):\n${host}/reset?token=${encodeURIComponent(token)}`});}
    catch(e){await sql('DELETE FROM account_tokens WHERE token_hash=$1',[hashToken(token)]);throw e;}
   }
   return reply({success:true,message:'در صورت وجود حساب، لینک بازیابی ارسال شد.'});
  }
  if(action==='reset-password'){
   const token=String(body.token||'');const password=body.password;
   if(token.length<32||token.length>128||!validPassword(password))return reply({error:'توکن یا رمز جدید معتبر نیست.'},400);
   const passwordHash=await hashPassword(password);
   await transaction(async client=>{
    const {rows:[t]}=await client.query("SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose='reset_password' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[hashToken(token)]);
    if(!t)throw Object.assign(new Error('لینک بازیابی نامعتبر یا منقضی است.'),{status:400});
    await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[passwordHash,t.user_id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1',[t.user_id]);
    await client.query('UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1',[t.user_id]);
    await client.query("INSERT INTO security_events(user_id,event_type) VALUES($1,'password.reset')",[t.user_id]);
   });
   return reply({success:true,message:'رمز عبور تغییر کرد. دوباره وارد شوید.'});
  }
  if(action==='send-verification'){
   const user=await getUser();if(!user)return reply({error:'وارد حساب شوید.'},401);
   if(!providerStatus().email)return reply({error:'سامانه ارسال ایمیل هنوز فعال نشده است.'},503);
   const {rows:[status]}=await sql('SELECT email_verified_at FROM users WHERE id=$1',[user.id]);
   if(status?.email_verified_at)return reply({success:true,message:'ایمیل قبلاً تأیید شده است.'});
   if(!await consumeRate('verify:'+user.id,3,3600))return reply({error:'تعداد ارسال بیش از حد مجاز است.'},429);
   const token=await createToken(user.id,'verify_email');
   try{await sendEmail({to:user.email,subject:'تأیید ایمیل دایرا کلود',text:`برای تأیید ایمیل لینک زیر را باز کنید:\n${host}/account/verify?token=${encodeURIComponent(token)}`});}
   catch(e){await sql('DELETE FROM account_tokens WHERE token_hash=$1',[hashToken(token)]);throw e;}
   return reply({success:true,message:'لینک تأیید ارسال شد.'});
  }
  if(action==='verify-email'){
   const token=String(body.token||'');if(token.length<32||token.length>128)return reply({error:'لینک نامعتبر است.'},400);
   await transaction(async client=>{
    const {rows:[t]}=await client.query("SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose='verify_email' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[hashToken(token)]);
    if(!t)throw Object.assign(new Error('لینک منقضی یا استفاده‌شده است.'),{status:400});
    await client.query('UPDATE users SET email_verified_at=now(),updated_at=now() WHERE id=$1',[t.user_id]);
    await client.query('UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2',[t.user_id,'verify_email']);
   });return reply({success:true,message:'ایمیل تأیید شد.'});
  }
  return reply({error:'عملیات نامعتبر است.'},400);
 }catch(e){if(e instanceof ProviderNotConfigured)return reply({error:'سامانه ارسال فعال نشده است.'},503);
  if(!e.status)console.error('recovery',e.message);return reply({error:e.status?e.message:'عملیات انجام نشد.'},e.status||500);}
}
