import { sql, transaction, audit, emitEvent } from '../../../lib/db.js';
import { getUser, requireMember, hashPassword, verifyPassword, startSession, endSession, hashToken, randomToken, consumeRate, encrypt } from '../../../lib/auth.js';
import { safeMutation } from '../../../lib/csrf.js';
import {after} from 'next/server';
import { paymentConfigured,initiatePayment } from '../../../lib/billing.js';
import { invoiceTotal,isAccessActive } from '../../../lib/lifecycle.js';
import { providerStatus } from '../../../lib/providers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ok = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail = (message, status=400) => ok({error:message},status);
const err = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const id = value => typeof value === 'string' && /^[\da-f-]{36}$/i.test(value);
const clean = (value,limit=120) => String(value||'').trim().slice(0,limit);
const email = value => clean(value,254).toLowerCase();
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const roleLevels={viewer:0,member:1,manager:2,admin:3,owner:4};
const restrictedRole = value => ['admin','manager','member','viewer'].includes(value);
const products = [
 {code:'crm',name:'مدیریت ارتباط با مشتری',desc:'مدیریت مشتریان، فروش و سرنخ‌ها'},
 {code:'projects',name:'مدیریت پروژه',desc:'تسک، تیم و زمان‌بندی پروژه‌ها'},
 {code:'erp',name:'ERP فروشگاهی',desc:'انبار، سفارش و زنجیره تأمین'},
 {code:'booking',name:'رزرو و نوبت‌دهی',desc:'ظرفیت، تقویم و نوبت‌ها'},
 {code:'finance',name:'مدیریت مالی',desc:'اسناد و گزارش‌های مالی'},
 {code:'learning',name:'آموزش و اشتراک',desc:'دوره، دانشجو و دسترسی'},
 {code:'analytics',name:'تحلیل و گزارش‌گیری',desc:'داشبوردهای تحلیل عملکرد'}
];
function safeWebhookUrl(input) {
  let url; try { url = new URL(String(input)); } catch { err('نشانی وب‌هوک معتبر نیست.'); }
  if(url.protocol!=='https:' || url.username || url.password || url.port && url.port !== '443') err('برای وب‌هوک نشانی HTTPS معتبر لازم است.');
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost')|| /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) err('وب‌هوک به نشانی‌های داخلی یا IP مجاز نیست.');
  return url.href;
}
async function plans() { const {rows}=await sql('SELECT * FROM plans ORDER BY price_monthly,code'); return rows; }

export async function GET(request) {
 try {
  const user=await getUser();
  const planRows=await plans();
  if(!user) return ok({authenticated:false,plans:planRows,products,providers:providerStatus()});
  const {rows:spaces}=await sql(`SELECT w.id,w.name,w.slug,w.created_at,m.role FROM memberships m
    JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.created_at`,[user.id]);
  const requested=new URL(request.url).searchParams.get('workspace');
  const active=spaces.find(x=>x.id===requested)||spaces[0];
  if(!active) return ok({authenticated:true,user,workspaces:[],plans:planRows,products,providers:providerStatus()});
  const wid=active.id;
  const requestedTicket=new URL(request.url).searchParams.get('ticket');
  if(requestedTicket){
   if(!id(requestedTicket)) return fail('شناسه درخواست نامعتبر است.',400);
   await requireMember(user,wid,'member');
   const {rows:[ticket]}=await sql('SELECT id,subject,status,priority,created_at FROM tickets WHERE id=$1 AND workspace_id=$2',[requestedTicket,wid]);
   if(!ticket)return fail('درخواست پیدا نشد.',404);
   const {rows:messages}=await sql('SELECT tm.id,tm.message,tm.created_at,u.name FROM ticket_messages tm JOIN users u ON u.id=tm.user_id WHERE tm.ticket_id=$1 ORDER BY tm.created_at',[ticket.id]);
   return ok({ticket:{...ticket,messages}});
  }
  const results=await Promise.all([
   sql(`SELECT s.*,p.name AS plan_name,p.seat_limit,p.api_limit,p.storage_mb,p.product_limit,p.features,p.price_monthly FROM subscriptions s JOIN plans p ON p.code=s.plan_code WHERE workspace_id=$1`,[wid]),
   sql(`SELECT m.user_id,m.role,m.created_at,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,u.name`,[wid]),
   sql(`SELECT id,email,role,created_at,expires_at FROM invitations WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 30`,[wid]),
   sql(`SELECT feature,COALESCE(sum(amount),0)::bigint AS amount FROM usage_daily WHERE workspace_id=$1 AND day >= date_trunc('month',now())::date GROUP BY feature`,[wid]),
   sql(`SELECT id,label,key_prefix,scopes,last_used_at,created_at FROM api_keys WHERE workspace_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 30`,[wid]),
   sql(`SELECT id,label,url,events,enabled,created_at FROM webhooks WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 30`,[wid]),
   sql(`SELECT id,subject,status,priority,created_at,updated_at FROM tickets WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 30`,[wid]),
   sql(`SELECT id,plan_code,amount,discount_amount,currency,status,created_at,due_at,paid_at FROM invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 40`,[wid]),
   sql(`SELECT id,action,metadata,created_at FROM audit_logs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 25`,[wid]),
   sql(`SELECT id,title,body,read_at,created_at FROM notifications WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 35`,[wid,user.id]),
   sql(`SELECT product_code,enabled_at FROM workspace_products WHERE workspace_id=$1`,[wid]),
   sql(`SELECT id,hostname,verification_token,verified_at,created_at FROM domains WHERE workspace_id=$1 ORDER BY created_at DESC`,[wid]),
   sql(`SELECT id,title,body,published_at FROM announcements WHERE published_at <= now() ORDER BY published_at DESC LIMIT 5`),
   sql(`SELECT COALESCE(sum(amount),0)::bigint AS balance FROM credit_ledger WHERE workspace_id=$1`,[wid]),
   sql(`SELECT count(*)::int AS count FROM webhook_deliveries WHERE workspace_id=$1 AND status='failed'`,[wid]),
  ]);
  const keys=['subscription','team','invitations','usage','apiKeys','webhooks','tickets','invoices','activity','notifications','activeProducts','domains','announcements','credit','failedWebhooks'];
  const data=Object.fromEntries(keys.map((key,i)=>[key,results[i].rows]));
  return ok({authenticated:true,user,workspaces:spaces,workspace:active,plans:planRows,products,providers:providerStatus(),...data,
    ...{subscription:data.subscription[0]||null,credit:data.credit[0]?.balance||'0',failedWebhooks:data.failedWebhooks[0]?.count||0}});
 }catch(error){console.error('GET /api/app',error.message);return fail(error.message==='DATABASE_NOT_CONFIGURED'?'دیتابیس متصل نشده است.':'دریافت اطلاعات ناموفق بود.',503);}
}

export async function POST(request) {
 try {
  const origin=request.headers.get('origin');
  if(!safeMutation(request)) return fail('درخواست از مبدأ نامعتبر است.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json')) return fail('درخواست JSON لازم است.',415);
  if(Number(request.headers.get('content-length')||0)>65536) return fail('درخواست بیش از حد بزرگ است.',413);
  const p=await request.json();
  if(!p || typeof p!=='object' || Array.isArray(p)) return fail('داده نامعتبر است.');
  const action=clean(p.action,50);
  if(action==='register') {
   const name=clean(p.name,70),mail=email(p.email),password=String(p.password||'');
   if(name.length<2||!isEmail(mail)||password.length<10||password.length>128) err('نام، ایمیل و رمز حداقل ۱۰ کاراکتری وارد کنید.');
   const ip=hashToken(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown');
   if(!await consumeRate('register:'+ip,5,3600)) err('تعداد تلاش‌ها زیاد است؛ بعداً دوباره امتحان کنید.',429);
   const hashed=await hashPassword(password);
   const slug='ws-'+randomToken(7).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,11);
   let userId;
   try {
    userId=await transaction(async client=>{
     const {rows:[u]}=await client.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,mail,hashed]);
     const {rows:[w]}=await client.query('INSERT INTO workspaces(name,slug,owner_id) VALUES($1,$2,$3) RETURNING id',[name+' — فضای کاری',slug,u.id]);
     await client.query(`INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')`,[w.id,u.id]);
     await client.query(`INSERT INTO subscriptions(workspace_id,plan_code,status,trial_ends_at,current_period_ends_at)
       VALUES($1,'pro','trialing',now()+interval '14 days',now()+interval '14 days')`,[w.id]);
     await client.query(`INSERT INTO workspace_products(workspace_id,product_code) VALUES($1,'crm')`,[w.id]);
     await client.query(`INSERT INTO audit_logs(workspace_id,user_id,action) VALUES($1,$2,'workspace.created')`,[w.id,u.id]);
     return u.id;
    });
   } catch(e) { if(e.code==='23505') err('این ایمیل از قبل ثبت شده است.',409); throw e; }
   await startSession(userId);
   return ok({success:true,message:'حساب و فضای کاری ساخته شد.',emailVerificationRequired:true},201);
  }
  if(action==='login') {
   const mail=email(p.email),password=String(p.password||'');
   const ip=hashToken(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown');
   if(!await consumeRate('login:'+ip,20,900) || !await consumeRate('login-email:'+hashToken(mail),8,900)) err('تلاش‌های ورود بیش از حد مجاز است.',429);
   const {rows}=await sql('SELECT id,password_hash FROM users WHERE email=$1',[mail]);
   if(!rows[0] || !(await verifyPassword(password,rows[0].password_hash))) err('ایمیل یا رمز عبور صحیح نیست.',401);
   await startSession(rows[0].id);
   return ok({success:true});
  }
  if(action==='logout') { await endSession(); return ok({success:true}); }
  const user=await getUser();
  if(!user) err('ابتدا وارد حساب شوید.',401);
  if(!await consumeRate('mutation:'+user.id,180,60))err('درخواست‌های بیش از حد ثبت شده است.',429);
  if(action==='profile-update') {
   const name=clean(p.name,75);if(name.length<2)err('نام معتبر نیست.');
   await sql('UPDATE users SET name=$1,updated_at=now() WHERE id=$2',[name,user.id]);
   await sql("INSERT INTO security_events(user_id,event_type) VALUES($1,'profile.updated')",[user.id]);
   return ok({success:true});
  }
  if(action==='change-password') {
   const current=String(p.currentPassword||''),password=String(p.newPassword||'');
   if(password.length<10||password.length>128||password===current)err('رمز جدید باید متفاوت و حداقل ۱۰ کاراکتری باشد.');
   const {rows:[account]}=await sql('SELECT password_hash FROM users WHERE id=$1',[user.id]);
   if(!await verifyPassword(current,account?.password_hash))err('رمز فعلی صحیح نیست.',401);
   const hashed=await hashPassword(password);
   await transaction(async client=>{
    await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[hashed,user.id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
    await client.query("INSERT INTO security_events(user_id,event_type) VALUES($1,'password.changed')",[user.id]);
   });
   await endSession();
   return ok({success:true,logout:true,message:'رمز تغییر کرد؛ دوباره وارد شوید.'});
  }
  if(action==='logout-all'){
   await sql('DELETE FROM sessions WHERE user_id=$1',[user.id]);
   await endSession();return ok({success:true,logout:true});
  }
  if(action==='accept-invite') {
   const token=clean(p.token,200);
   const result=await transaction(async client=>{
    const {rows:[inv]}=await client.query(`SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE`,[hashToken(token)]);
    if(!inv||inv.email!==user.email) err('دعوت‌نامه نامعتبر، منقضی یا متعلق به ایمیل دیگری است.',403);
    if(!user.email_verified_at) err('برای عضویت از طریق دعوت‌نامه، ابتدا ایمیل حساب را تأیید کنید.',403);
    await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[inv.workspace_id]);
    const {rows:[sub]}=await client.query(`SELECT p.seat_limit FROM subscriptions s JOIN plans p ON p.code=s.plan_code WHERE s.workspace_id=$1`,[inv.workspace_id]);
    const {rows:[count]}=await client.query(`SELECT count(*)::int AS total FROM memberships WHERE workspace_id=$1`,[inv.workspace_id]);
    if(count.total>=sub.seat_limit) err('ظرفیت اعضای پلن تکمیل است.',409);
    await client.query(`INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[inv.workspace_id,user.id,inv.role]);
    await client.query('UPDATE invitations SET accepted_at=now() WHERE id=$1',[inv.id]);
    return inv.workspace_id;
   });
   await audit(result,user.id,'member.joined'); return ok({success:true,workspaceId:result});
  }
  if(action==='create-workspace') {
   const name=clean(p.name,70); if(name.length<2) err('نام فضای کاری کوتاه است.');
   const slug='ws-'+randomToken(8).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12);
   const wid=await transaction(async client=>{
    const {rows:[w]}=await client.query('INSERT INTO workspaces(name,slug,owner_id) VALUES($1,$2,$3) RETURNING id',[name,slug,user.id]);
    await client.query(`INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')`,[w.id,user.id]);
    await client.query(`INSERT INTO subscriptions(workspace_id,plan_code,status,current_period_ends_at) VALUES($1,'free','active',now()+interval '30 days')`,[w.id]);
    return w.id;
   });
   await audit(wid,user.id,'workspace.created'); return ok({success:true,workspaceId:wid},201);
  }
  const wid=p.workspaceId;
  const minimum={
   'workspace-rename':'admin','invite-member':'admin','revoke-invite':'admin','update-role':'admin','remove-member':'admin',
   'create-api-key':'admin','revoke-api-key':'admin','add-webhook':'admin','remove-webhook':'admin','test-webhook':'admin','retry-webhook':'admin','toggle-webhook':'admin','create-integration-token':'admin',
   'plan-request':'owner','cancel-subscription':'owner','resume-subscription':'owner','pay-invoice':'owner','add-domain':'owner','verify-domain':'owner','redeem-coupon':'owner','archive-workspace':'owner',
   'toggle-product':'admin','ticket-create':'member','ticket-reply':'member',
   'notification-read':'viewer'
  }[action];
  if(!minimum) err('عملیات پشتیبانی نمی‌شود.',400);
  const role=await requireMember(user,wid,minimum);
  const {rows:[subscription]}=await sql(`SELECT s.*,p.seat_limit,p.api_limit,p.product_limit,p.features,p.price_monthly FROM subscriptions s JOIN plans p ON p.code=s.plan_code WHERE workspace_id=$1`,[wid]);
  if(!subscription) err('اشتراک این فضای کاری موجود نیست.',404);
  if(!isAccessActive(subscription) && !['plan-request','pay-invoice','ticket-create','ticket-reply','notification-read','cancel-subscription','resume-subscription','archive-workspace'].includes(action))err('اشتراک فعال نیست؛ ابتدا دوره را تمدید یا پلن رایگان را فعال کنید.',402);
  const {rows:[workspaceInfo]}=await sql('SELECT archived_at FROM workspaces WHERE id=$1',[wid]);
  if(workspaceInfo?.archived_at)err('فضای کاری بایگانی شده است.',403);
  if(action==='archive-workspace'){
   const {rows:[owned]}=await sql('SELECT owner_id,slug FROM workspaces WHERE id=$1 AND archived_at IS NULL',[wid]);
   if(owned?.owner_id!==user.id)err('فقط مالک اصلی می‌تواند فضا را بایگانی کند.',403);
   if(clean(p.confirm,80)!=='ARCHIVE '+owned.slug)err('عبارت تأیید بایگانی را وارد کنید.',400);
   await transaction(async client=>{
    await client.query('UPDATE workspaces SET archived_at=now() WHERE id=$1',[wid]);
    await client.query("UPDATE subscriptions SET status='paused',updated_at=now() WHERE workspace_id=$1",[wid]);
    await client.query('UPDATE api_keys SET revoked_at=now() WHERE workspace_id=$1 AND revoked_at IS NULL',[wid]);
    await client.query('UPDATE webhooks SET enabled=false WHERE workspace_id=$1',[wid]);
    await client.query('INSERT INTO audit_logs(workspace_id,user_id,action) VALUES($1,$2,$3)',[wid,user.id,'workspace.archived']);
   });return ok({success:true});
  }
  if(action==='workspace-rename') {
   const name=clean(p.name,75);if(name.length<2) err('نام معتبر نیست.');
   await sql('UPDATE workspaces SET name=$1 WHERE id=$2',[name,wid]);
   await audit(wid,user.id,'workspace.renamed',{name}); return ok({success:true});
  }
  if(action==='invite-member') {
   const mail=email(p.email),newRole=clean(p.role,20);
   if(!isEmail(mail)||!restrictedRole(newRole)) err('ایمیل یا نقش نامعتبر است.');
   if(roleLevels[newRole]>=roleLevels[role]) err('اجازه دعوت در این سطح دسترسی ندارید.',403);
   const token=randomToken(32);
   await transaction(async client=>{
    await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[wid]);
    const {rows:[count]}=await client.query(`SELECT (SELECT count(*) FROM memberships WHERE workspace_id=$1)::int + (SELECT count(*) FROM invitations WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at>now())::int AS total`,[wid]);
    if(count.total>=subscription.seat_limit) err('ظرفیت کاربران پلن تکمیل شده است.',409);
    await client.query(`INSERT INTO invitations(workspace_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '7 days')`,[wid,mail,newRole,hashToken(token),user.id]);
   });
   await audit(wid,user.id,'member.invited',{email:mail,role:newRole});
   // If email transport is not configured, this one-time link is returned for manual sharing.
   const base=process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
   return ok({success:true,inviteUrl:`${base}/?invite=${encodeURIComponent(token)}`},201);
  }
  if(action==='revoke-invite'){
   if(!id(p.id))err('شناسه معتبر نیست.');
   const {rows:[invite]}=await sql('SELECT role FROM invitations WHERE workspace_id=$1 AND id=$2 AND accepted_at IS NULL',[wid,p.id]);
   if(!invite||roleLevels[invite.role]>=roleLevels[role])err('اجازه لغو این دعوت‌نامه را ندارید.',403);
   await sql('DELETE FROM invitations WHERE workspace_id=$1 AND id=$2',[wid,p.id]);
   await audit(wid,user.id,'member.invite_revoked',{inviteId:p.id});return ok({success:true});
  }
  if(action==='update-role' || action==='remove-member') {
   if(!id(p.userId) || p.userId===user.id) err('ویرایش نقش خودتان مجاز نیست.');
   const {rows:[member]}=await sql('SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2',[wid,p.userId]);
   if(!member||member.role==='owner'||roleLevels[member.role]>=roleLevels[role]) err('اجازه تغییر این عضو را ندارید.',403);
   if(action==='update-role') {
    if(!restrictedRole(p.role)||roleLevels[p.role]>=roleLevels[role]) err('نقش انتخاب‌شده مجاز نیست.',403);
    await sql('UPDATE memberships SET role=$3 WHERE workspace_id=$1 AND user_id=$2',[wid,p.userId,p.role]);
   }else await sql('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2',[wid,p.userId]);
   await audit(wid,user.id,action==='update-role'?'member.role_changed':'member.removed',{memberId:p.userId,role:p.role});
   return ok({success:true});
  }
  if(action==='create-api-key') {
   if(!subscription.features.api) err('API در پلن شما فعال نیست.',403);
   const label=clean(p.label,75);if(!label) err('نام کلید را وارد کنید.');
   const raw='dk_'+randomToken(32); const prefix=raw.slice(0,12);
   await sql(`INSERT INTO api_keys(workspace_id,label,key_prefix,token_hash,scopes) VALUES($1,$2,$3,$4,$5)`,[wid,label,prefix,hashToken(raw),JSON.stringify(['usage:write','license:read'])]);
   await audit(wid,user.id,'apikey.created',{label});
   return ok({success:true,apiKey:raw,message:'این کلید فقط یک بار نمایش داده می‌شود.'},201);
  }
  if(action==='create-integration-token'){
   const productCode=clean(p.productCode,25);
   if(!products.some(x=>x.code===productCode))err('محصول نامعتبر است.');
   if(!isAccessActive(subscription))err('اشتراک فعال نیست.',402);
   const {rows:[active]}=await sql('SELECT 1 FROM workspace_products WHERE workspace_id=$1 AND product_code=$2',[wid,productCode]);
   if(!active)err('این محصول در فضای کاری فعال نشده است.',403);
   const raw=randomToken(32);
   await sql("INSERT INTO integration_tokens(token_hash,workspace_id,product_code,created_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 minutes')",[hashToken(raw),wid,productCode,user.id]);
   await audit(wid,user.id,'integration.token_created',{product:productCode});
   return ok({success:true,integrationToken:raw,expiresInSeconds:120},201);
  }
  if(action==='revoke-api-key') {
   if(!id(p.id)) err('شناسه نامعتبر است.');
   const result=await sql('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL RETURNING id',[p.id,wid]);
   if(!result.rowCount) err('کلید پیدا نشد.',404);
   await audit(wid,user.id,'apikey.revoked'); return ok({success:true});
  }
  if(action==='add-webhook') {
   if(!subscription.features.webhooks) err('وب‌هوک در این پلن فعال نیست.',403);
   const url=safeWebhookUrl(p.url),label=clean(p.label,80)||'Webhook';
   const secret='whsec_'+randomToken(32);
   await sql('INSERT INTO webhooks(workspace_id,url,label,secret_ciphertext,events) VALUES($1,$2,$3,$4,$5)',[wid,url,label,encrypt(secret),JSON.stringify(['*'])]);
   await audit(wid,user.id,'webhook.created',{label});return ok({success:true,webhookSecret:secret},201);
  }
  if(action==='remove-webhook') {
   if(!id(p.id)) err('شناسه نامعتبر است.');
   await sql('DELETE FROM webhooks WHERE id=$1 AND workspace_id=$2',[p.id,wid]);
   await audit(wid,user.id,'webhook.deleted');return ok({success:true});
  }
  if(action==='toggle-webhook'){
   if(!id(p.id))err('شناسه معتبر نیست.');
   const res=await sql('UPDATE webhooks SET enabled=$3 WHERE workspace_id=$1 AND id=$2 RETURNING id',[wid,p.id,p.enabled===true]);
   if(!res.rowCount)err('وب‌هوک پیدا نشد.',404);
   await audit(wid,user.id,'webhook.toggled',{id:p.id,enabled:p.enabled===true});return ok({success:true});
  }
  if(action==='retry-webhook'){
   if(!id(p.id))err('شناسه معتبر نیست.');
   const res=await sql(`UPDATE webhook_deliveries SET status='pending',attempts=0,next_attempt_at=now(),last_error=NULL
      WHERE id=$1 AND workspace_id=$2 AND status='failed' RETURNING id`,[p.id,wid]);
   if(!res.rowCount)err('ارسال ناموفق پیدا نشد.',404);
   await audit(wid,user.id,'webhook.retried',{id:p.id});return ok({success:true});
  }
  if(action==='test-webhook') {
   if(!id(p.id)) err('شناسه نامعتبر است.');
   const {rows:[hook]}=await sql('SELECT id FROM webhooks WHERE id=$1 AND workspace_id=$2 AND enabled=true',[p.id,wid]);
   if(!hook) err('وب‌هوک پیدا نشد.',404);
   await sql(`INSERT INTO webhook_deliveries(workspace_id,webhook_id,event_name,payload) VALUES($1,$2,'test.ping',$3)`,[wid,hook.id,JSON.stringify({event:'test.ping',sentAt:new Date().toISOString(),workspaceId:wid})]);
   after(async()=>{try{const {drainOnce}=await import('../../../scripts/worker.mjs');await drainOnce()}catch(e){console.error('webhook delivery',e.message)}});
   return ok({success:true,message:'ارسال در صف قرار گرفت.'});
  }
  if(action==='plan-request') {
   const code=clean(p.planCode,20);
   if(code===subscription.plan_code) err('این پلن هم‌اکنون فعال است.');
   const {rows:[plan]}=await sql('SELECT code,price_monthly FROM plans WHERE code=$1',[code]);
   if(!plan || code==='custom') err('پلن نامعتبر است؛ برای پلن سفارشی با پشتیبانی تماس بگیرید.');
   if(code==='free') {
    if(subscription.plan_code==='free')err('پلن رایگان فعال است.');
    if(!isAccessActive(subscription)){
     await sql("UPDATE subscriptions SET plan_code='free',status='active',trial_ends_at=NULL,current_period_ends_at=now()+interval '30 days',cancel_at_period_end=false,updated_at=now() WHERE workspace_id=$1",[wid]);
     await audit(wid,user.id,'subscription.downgraded',{to:'free',reason:'expired'});return ok({success:true,message:'پلن رایگان فعال شد.'});
    }
    await sql('UPDATE subscriptions SET cancel_at_period_end=true,updated_at=now() WHERE workspace_id=$1',[wid]);
    await audit(wid,user.id,'subscription.downgrade_scheduled',{to:'free'});return ok({success:true,message:'تغییر به پلن رایگان در پایان دوره انجام می‌شود.'});
   }
   const {rows:[old]}=await sql("SELECT id FROM invoices WHERE workspace_id=$1 AND plan_code=$2 AND status='pending' AND due_at>now() ORDER BY created_at DESC LIMIT 1",[wid,code]);
   const {rows:[invoice]}=old?{rows:[old]}:await sql(`INSERT INTO invoices(workspace_id,plan_code,amount,status,due_at) VALUES($1,$2,$3,'pending',now()+interval '7 days') RETURNING id`,[wid,code,plan.price_monthly]);
   await audit(wid,user.id,'subscription.plan_requested',{plan:code,invoiceId:invoice.id});
   return ok({success:true,invoiceId:invoice.id,message:'پیش‌فاکتور ایجاد شد. فعال‌سازی پس از تأیید پرداخت انجام می‌شود.'});
  }
  if(action==='pay-invoice'){
   if(!paymentConfigured())err('درگاه پرداخت هنوز متصل نشده است.',503);
   if(!id(p.id))err('شناسه صورتحساب نامعتبر است.');
   const {rows:[invoice]}=await sql("SELECT * FROM invoices WHERE workspace_id=$1 AND id=$2 AND status='pending' AND due_at>now()",[wid,p.id]);
   if(!invoice)err('صورتحساب قابل پرداخت نیست.',404);
   if(invoiceTotal(invoice)<=0)err('مبلغ صورت‌حساب معتبر نیست.',400);
   if(invoice.payment_authority){
    const domain=process.env.ZARINPAL_SANDBOX==='true'?'https://sandbox.zarinpal.com':'https://www.zarinpal.com';
    return ok({success:true,redirectUrl:`${domain}/pg/StartPay/${encodeURIComponent(invoice.payment_authority)}`});
   }
   const base=process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
   const result=await initiatePayment({amountToman:invoiceTotal(invoice),invoiceId:invoice.id,callbackBase:base,email:user.email});
   const written=await sql(`UPDATE invoices SET provider='zarinpal',payment_authority=$3,payment_started_at=now()
       WHERE id=$1 AND workspace_id=$2 AND status='pending' AND payment_authority IS NULL RETURNING id`,[invoice.id,wid,result.authority]);
   if(!written.rowCount)err('پرداخت دیگری برای این صورتحساب شروع شده است؛ صفحه را تازه کنید.',409);
   await audit(wid,user.id,'invoice.payment_started',{invoiceId:invoice.id});
   return ok({success:true,redirectUrl:result.redirectUrl});
  }
  if(action==='resume-subscription'){
   await sql('UPDATE subscriptions SET cancel_at_period_end=false,updated_at=now() WHERE workspace_id=$1',[wid]);
   await audit(wid,user.id,'subscription.cancellation_revoked');return ok({success:true});
  }
  if(action==='cancel-subscription') {
   await sql('UPDATE subscriptions SET cancel_at_period_end=true,updated_at=now() WHERE workspace_id=$1',[wid]);
   await audit(wid,user.id,'subscription.cancel_scheduled');return ok({success:true});
  }
  if(action==='ticket-create') {
   const subject=clean(p.subject,150),message=clean(p.message,5000);
   if(subject.length<3||message.length<4) err('موضوع و متن درخواست را کامل کنید.');
   const {rows:[ticket]}=await transaction(async client=>{
    const res=await client.query('INSERT INTO tickets(workspace_id,created_by,subject) VALUES($1,$2,$3) RETURNING id',[wid,user.id,subject]);
    await client.query('INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES($1,$2,$3)',[res.rows[0].id,user.id,message]);return res;
   });
   await audit(wid,user.id,'ticket.created',{ticketId:ticket.id});return ok({success:true,ticketId:ticket.id},201);
  }
  if(action==='ticket-reply') {
   if(!id(p.id)) err('شناسه نامعتبر است.');
   const message=clean(p.message,5000);if(message.length<2) err('متن پاسخ کوتاه است.');
   const {rows:[ticket]}=await sql('SELECT id FROM tickets WHERE id=$1 AND workspace_id=$2',[p.id,wid]);
   if(!ticket) err('درخواست وجود ندارد.',404);
   await sql('INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES($1,$2,$3)',[ticket.id,user.id,message]);
   await sql('UPDATE tickets SET updated_at=now() WHERE id=$1',[ticket.id]);return ok({success:true});
  }
  if(action==='notification-read') {
   if(!id(p.id)) err('شناسه نامعتبر است.');
   await sql('UPDATE notifications SET read_at=now() WHERE id=$1 AND workspace_id=$2 AND user_id=$3',[p.id,wid,user.id]);return ok({success:true});
  }
  if(action==='toggle-product') {
   const code=clean(p.productCode,30);
   if(!products.some(x=>x.code===code)) err('محصول نامعتبر است.');
   if(p.enabled===true) {
    await transaction(async client=>{
     await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[wid]);
     const {rows:[count]}=await client.query('SELECT count(*)::int AS total FROM workspace_products WHERE workspace_id=$1',[wid]);
     const {rows:[exists]}=await client.query('SELECT 1 FROM workspace_products WHERE workspace_id=$1 AND product_code=$2',[wid,code]);
     if(!exists && count.total>=subscription.product_limit) err('تعداد محصولات مجاز پلن تکمیل است.',409);
     await client.query('INSERT INTO workspace_products(workspace_id,product_code) VALUES($1,$2) ON CONFLICT DO NOTHING',[wid,code]);
    });
   } else await sql('DELETE FROM workspace_products WHERE workspace_id=$1 AND product_code=$2',[wid,code]);
   await audit(wid,user.id,'product.toggled',{code,enabled:p.enabled===true});return ok({success:true});
  }
  if(action==='add-domain') {
   if(!subscription.features.custom_domain) err('دامنه اختصاصی در این پلن فعال نیست.',403);
   const host=clean(p.hostname,253).toLowerCase().replace(/\.$/,'');
   if(!/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)||host==='vercel.app'||host.endsWith('.vercel.app')) err('دامنه معتبر نیست.');
   const token='daira-verify-'+randomToken(16);
   try {await sql('INSERT INTO domains(workspace_id,hostname,verification_token) VALUES($1,$2,$3)',[wid,host,token]);}
   catch(e){if(e.code==='23505') err('این دامنه قبلاً ثبت شده است.',409);throw e;}
   await audit(wid,user.id,'domain.added',{hostname:host});return ok({success:true,dnsRecord:'_daira-verification.'+host,dnsValue:token},201);
  }
  if(action==='verify-domain') {
   if(!id(p.id)) err('شناسه نامعتبر است.');
   const {rows:[domain]}=await sql('SELECT id,hostname,verification_token FROM domains WHERE workspace_id=$1 AND id=$2',[wid,p.id]);
   if(!domain) err('دامنه پیدا نشد.',404);
   const {promises:dns}=await import('node:dns');
   let records=[];
   try{records=await dns.resolveTxt('_daira-verification.'+domain.hostname);}catch{}
   if(!records.some(parts=>parts.join('')===domain.verification_token)) err('رکورد TXT هنوز تأیید نشده است.',409);
   await sql('UPDATE domains SET verified_at=now() WHERE id=$1 AND workspace_id=$2',[domain.id,wid]);
   await audit(wid,user.id,'domain.dns_verified',{hostname:domain.hostname});
   return ok({success:true,message:'مالکیت DNS تأیید شد. اتصال دامنه به پراکسی استقرار جداگانه لازم است.'});
  }
  if(action==='redeem-coupon') {
   const code=clean(p.code,50).toUpperCase();
   const result=await transaction(async client=>{
    const {rows:[coupon]}=await client.query('SELECT * FROM coupons WHERE code=$1 AND active=true AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE',[code]);
    if(!coupon||coupon.redemptions>=coupon.max_redemptions) err('کد تخفیف معتبر نیست.',404);
    const {rows:[used]}=await client.query('SELECT 1 FROM coupon_redemptions WHERE workspace_id=$1 AND code=$2',[wid,code]);
    if(used) err('این کد قبلاً استفاده شده است.',409);
    const {rows:[invoice]}=await client.query(`SELECT id,amount FROM invoices WHERE workspace_id=$1 AND status='pending' AND discount_amount=0 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[wid]);
    if(!invoice) err('برای اعمال تخفیف ابتدا پیش‌فاکتور ایجاد کنید.',409);
    await client.query('UPDATE coupons SET redemptions=redemptions+1 WHERE code=$1',[code]);
    await client.query('INSERT INTO coupon_redemptions(workspace_id,code) VALUES($1,$2)',[wid,code]);
    const discount=Math.floor(Number(invoice.amount)*coupon.percent_off/100);
    await client.query('UPDATE invoices SET discount_amount=$2 WHERE id=$1',[invoice.id,discount]);
    return discount;
   });
   await audit(wid,user.id,'coupon.redeemed',{code});return ok({success:true,discountAmount:result});
  }
  return fail('عملیات ناشناخته است.',400);
 }catch(error){
  if(!error.status) console.error('POST /api/app',error.message,error.code||'');
  return fail(error.status?error.message:(error.code==='23505'?'رکورد تکراری است.':'عملیات انجام نشد. لطفاً دوباره تلاش کنید.'),error.status||500);
 }
}
