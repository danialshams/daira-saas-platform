import {sql,transaction} from '../../../lib/db.js';
import {getUser,consumeRate,startSession,hashToken} from '../../../lib/auth.js';
import {normalizedIranMobile,generateOtp,smsCodeHash} from '../../../lib/phone.js';
import {providerStatus,sendSms} from '../../../lib/providers.js';
import {safeMutation} from '../../../lib/csrf.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const response=(obj,status=200)=>Response.json(obj,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 try{
  if(!safeMutation(request))return response({error:'INVALID_ORIGIN'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'JSON_REQUIRED'},415);
  const raw=await request.text();if(raw.length>4096)return response({error:'TOO_LARGE'},413);
  const p=JSON.parse(raw),action=p?.action,phone=normalizedIranMobile(p.phone);
  if(!providerStatus().sms)return response({error:'ارسال پیامک هنوز پیکربندی نشده است.'},503);
  if(!phone)return response({error:'شماره موبایل معتبر نیست.'},400);
  const ip=hashToken(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown');
  const rateKey='sms:'+hashToken(phone);
  if(!await consumeRate(rateKey,5,3600)||!await consumeRate('sms-ip:'+ip,20,3600))return response({error:'درخواست‌های زیادی ثبت شده است.'},429);
  if(action==='request-login'||action==='request-phone-verification'){
   let user;
   if(action==='request-login'){
    const {rows:[found]}=await sql('SELECT id FROM users WHERE phone=$1 AND phone_verified_at IS NOT NULL',[phone]);
    if(!found)return response({success:true,message:'در صورت وجود شماره تأییدشده، کد ارسال می‌شود.'});
    user=found;
   }else{
    user=await getUser();if(!user)return response({error:'ابتدا وارد حساب شوید.'},401);
    const {rows:[conflict]}=await sql('SELECT id FROM users WHERE phone=$1 AND id<>$2',[phone,user.id]);
    if(conflict)return response({error:'این شماره قبلاً ثبت شده است.'},409);
   }
   const purpose=action==='request-login'?'login':'verify_phone';
   const code=generateOtp();
   const {rows:[challenge]}=await sql("INSERT INTO phone_challenges(user_id,phone,purpose,code_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 minutes') RETURNING id",[user.id,phone,purpose,'0'.repeat(64)]);
   await sql('UPDATE phone_challenges SET code_hash=$2 WHERE id=$1',[challenge.id,smsCodeHash(challenge.id,code)]);
   try{await sendSms({to:phone,text:`کد یک‌بارمصرف دایرا: ${code}\nاین کد ۲ دقیقه اعتبار دارد.`,template:'daira_otp'});}
   catch(e){await sql('DELETE FROM phone_challenges WHERE id=$1',[challenge.id]);throw e;}
   return response({success:true,message:'کد یک‌بارمصرف ارسال شد.'});
  }
  if(action==='confirm-login'||action==='confirm-phone'){
   const code=String(p.code||'');if(!/^\d{6}$/.test(code))return response({error:'کد معتبر نیست.'},400);
   const purpose=action==='confirm-login'?'login':'verify_phone';
   const caller=purpose==='verify_phone'?await getUser():null;
   if(purpose==='verify_phone'&&!caller)return response({error:'ابتدا وارد حساب شوید.'},401);
   const userId=await transaction(async client=>{
    const {rows:[c]}=await client.query(`SELECT id,user_id,code_hash,attempts FROM phone_challenges
      WHERE phone=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[phone,purpose]);
    if(!c||c.attempts>=5||caller&&c.user_id!==caller.id)throw Object.assign(new Error('کد منقضی یا نامعتبر است.'),{status:400});
    if(smsCodeHash(c.id,code)!==c.code_hash){await client.query('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=$1',[c.id]);return null;}
    await client.query('UPDATE phone_challenges SET consumed_at=now() WHERE id=$1',[c.id]);
    if(purpose==='verify_phone')await client.query('UPDATE users SET phone=$2,phone_verified_at=now(),updated_at=now() WHERE id=$1',[c.user_id,phone]);
    await client.query("INSERT INTO security_events(user_id,event_type) VALUES($1,$2)",[c.user_id,purpose==='login'?'login.sms':'phone.verified']);
    return c.user_id;
   });
   if(!userId)return response({error:'کد صحیح نیست.'},401);
   if(purpose==='login')await startSession(userId);
   return response({success:true,message:purpose==='login'?'ورود موفق بود.':'شماره موبایل تأیید شد.'});
  }
  return response({error:'ACTION_NOT_FOUND'},400);
 }catch(e){if(!e.status)console.error('sms',e.message);return response({error:e.status?e.message:'عملیات پیامکی انجام نشد.'},e.status||503);}
}
