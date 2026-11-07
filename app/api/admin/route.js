import { getUser,consumeRate,hashToken } from '../../../lib/auth.js';
import { sql,transaction,audit } from '../../../lib/db.js';
import { safeMutation } from '../../../lib/csrf.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const deny=(msg='Forbidden',status=403)=>response({error:msg},status);
const text=(value,max=240)=>String(value||'').trim().slice(0,max);
const id=(value)=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
export async function GET(){
 try{
  if(process.env.PUBLIC_DEMO_ONLY==='true')return deny('Public demo only',403);
  const user=await getUser();if(!user?.is_platform_admin)return deny();
  const entries=await Promise.all([
   sql(`SELECT (SELECT count(*)::int FROM workspaces WHERE archived_at IS NULL) AS workspaces,
     (SELECT count(*)::int FROM users) AS users,
     (SELECT count(*)::int FROM subscriptions WHERE status IN ('active','trialing')) AS active_subscriptions,
     (SELECT count(*)::int FROM subscriptions WHERE status='trialing') AS trials,
     (SELECT count(*)::int FROM subscriptions WHERE status='canceled') AS canceled,
     (SELECT COALESCE(sum(p.price_monthly),0)::bigint FROM subscriptions s JOIN plans p ON p.code=s.plan_code
       WHERE s.status='active' AND s.plan_code NOT IN ('free','custom') AND s.current_period_ends_at>now()) AS mrr,
     (SELECT COALESCE(sum(amount-discount_amount),0)::bigint FROM invoices WHERE status='paid') AS paid_revenue,
     (SELECT count(*)::int FROM tickets WHERE status<>'resolved') AS open_tickets`),
   sql(`SELECT s.plan_code,count(*)::int AS count FROM subscriptions s GROUP BY s.plan_code ORDER BY count DESC`),
   sql(`SELECT w.id,w.name,w.slug,w.created_at,w.archived_at,s.plan_code,s.status,
      (SELECT count(*)::int FROM memberships WHERE workspace_id=w.id) AS members
      FROM workspaces w JOIN subscriptions s ON s.workspace_id=w.id ORDER BY w.created_at DESC LIMIT 100`),
   sql(`SELECT t.id,t.subject,t.status,t.priority,t.updated_at,t.workspace_id,w.name AS workspace_name,
     u.name AS created_by_name FROM tickets t JOIN workspaces w ON w.id=t.workspace_id
     JOIN users u ON u.id=t.created_by ORDER BY t.updated_at DESC LIMIT 100`),
   sql(`SELECT i.id,i.workspace_id,w.name AS workspace_name,i.plan_code,i.amount,i.discount_amount,i.status,i.created_at,i.paid_at
     FROM invoices i JOIN workspaces w ON w.id=i.workspace_id ORDER BY i.created_at DESC LIMIT 100`),
   sql(`SELECT code,percent_off,max_redemptions,redemptions,expires_at,active FROM coupons ORDER BY code LIMIT 100`),
   sql(`SELECT id,title,body,published_at,created_at FROM announcements ORDER BY created_at DESC LIMIT 50`),
   sql(`SELECT code,name,price_monthly,seat_limit,api_limit,storage_mb,product_limit,features FROM plans ORDER BY price_monthly,code`),
   sql(`SELECT date_trunc('month',paid_at)::date AS month,COALESCE(sum(amount-discount_amount),0)::bigint AS revenue
     FROM invoices WHERE status='paid' AND paid_at>=now()-interval '12 months' GROUP BY 1 ORDER BY 1`)
  ]);
  const keys=['totals','planDistribution','recent','tickets','invoices','coupons','announcements','planCatalog','revenueHistory'];
  const data=Object.fromEntries(keys.map((key,i)=>[key,i===0?entries[i].rows[0]:entries[i].rows]));
  return response(data);
 }catch(e){console.error('GET /api/admin',e.message);return deny('Unavailable',503);}
}
export async function POST(request){
 try{
  if(process.env.PUBLIC_DEMO_ONLY==='true')return deny('Public demo only',403);
  if(!safeMutation(request))return deny('Invalid origin');
  if(!request.headers.get('content-type')?.startsWith('application/json'))return deny('JSON required',415);
  const raw=await request.text();if(raw.length>16000)return deny('Too large',413);
  const user=await getUser();if(!user?.is_platform_admin)return deny();
  if(!await consumeRate('admin:'+user.id,60,60))return deny('Rate limited',429);
  const b=JSON.parse(raw),action=text(b?.action,50);
  if(action==='announcement-publish'){
   const title=text(b.title,120),body=text(b.body,4000);
   if(title.length<3||body.length<5)return deny('عنوان یا متن کوتاه است.',400);
   const {rows:[created]}=await sql('INSERT INTO announcements(title,body,published_at) VALUES($1,$2,now()) RETURNING id',[title,body]);
   return response({success:true,id:created.id},201);
  }
  if(action==='coupon-create'){
   const code=text(b.code,50).toUpperCase();const discount=Number(b.percentOff),max=Number(b.maxRedemptions||1);
   if(!/^[A-Z0-9_-]{3,50}$/.test(code)||!Number.isInteger(discount)||discount<1||discount>100||!Number.isInteger(max)||max<1||max>100000)return deny('اطلاعات کد تخفیف نامعتبر است.',400);
   await sql('INSERT INTO coupons(code,percent_off,max_redemptions) VALUES($1,$2,$3)',[code,discount,max]);
   return response({success:true},201);
  }
  if(action==='coupon-toggle'){
   const code=text(b.code,50).toUpperCase();const enabled=b.active===true;
   const r=await sql('UPDATE coupons SET active=$2 WHERE code=$1 RETURNING code',[code,enabled]);if(!r.rowCount)return deny('کد یافت نشد',404);
   return response({success:true});
  }
  if(action==='ticket-reply' || action==='ticket-status'){
   if(!id(b.ticketId))return deny('شناسه تیکت نامعتبر است.',400);
   await transaction(async client=>{
    const {rows:[ticket]}=await client.query('SELECT id,workspace_id FROM tickets WHERE id=$1 FOR UPDATE',[b.ticketId]);
    if(!ticket)throw Object.assign(new Error('تیکت پیدا نشد.'),{status:404});
    if(action==='ticket-reply'){
     const message=text(b.message,5000);if(message.length<2)throw Object.assign(new Error('متن پاسخ کوتاه است.'),{status:400});
     await client.query('INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES($1,$2,$3)',[ticket.id,user.id,message]);
     await client.query("UPDATE tickets SET status='pending',updated_at=now() WHERE id=$1",[ticket.id]);
     await client.query(`INSERT INTO notifications(workspace_id,user_id,title,body)
       SELECT $1,m.user_id,'پاسخ پشتیبانی',$2 FROM memberships m WHERE m.workspace_id=$1 AND m.role IN ('owner','admin')`,[ticket.workspace_id,'برای تیکت شما پاسخی ثبت شده است.']);
    }else{
     if(!['open','pending','resolved'].includes(b.status))throw Object.assign(new Error('وضعیت نامعتبر است.'),{status:400});
     await client.query('UPDATE tickets SET status=$2,updated_at=now() WHERE id=$1',[ticket.id,b.status]);
    }
    await client.query('INSERT INTO audit_logs(workspace_id,user_id,action,metadata) VALUES($1,$2,$3,$4)',[ticket.workspace_id,user.id,'platform.ticket.'+action,JSON.stringify({ticketId:ticket.id})]);
   });return response({success:true});
  }
  if(action==='plan-update'){
   const code=text(b.code,20);if(!['free','pro','business','custom'].includes(code))return deny('پلن نامعتبر است.',400);
   const fields=['price_monthly','seat_limit','api_limit','storage_mb','product_limit'];
   const nums=fields.map(k=>Number(b[k]));if(nums.some((v,i)=>!Number.isSafeInteger(v)||v<(i===0?0:1)))return deny('مقادیر پلن نامعتبر است.',400);
   const features=b.features;if(!features||typeof features!=='object'||Array.isArray(features)||['api','webhooks','custom_domain'].some(k=>typeof features[k]!=='boolean'))return deny('تنظیمات امکانات نامعتبر است.',400);
   await sql('UPDATE plans SET price_monthly=$2,seat_limit=$3,api_limit=$4,storage_mb=$5,product_limit=$6,features=$7 WHERE code=$1',[code,...nums,JSON.stringify(features)]);
   return response({success:true});
  }
  if(action==='workspace-suspend' || action==='workspace-resume'){
   if(!id(b.workspaceId))return deny('شناسه نامعتبر است.',400);
   await transaction(async client=>{
    const {rows:[workspace]}=await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[b.workspaceId]);
    if(!workspace)throw Object.assign(new Error('فضای کاری پیدا نشد.'),{status:404});
    if(action==='workspace-suspend')await client.query("UPDATE subscriptions SET status='paused',updated_at=now() WHERE workspace_id=$1",[workspace.id]);
    else await client.query("UPDATE subscriptions SET status=CASE WHEN trial_ends_at>now() THEN 'trialing' ELSE 'active' END,updated_at=now() WHERE workspace_id=$1 AND status='paused'",[workspace.id]);
    await client.query('INSERT INTO audit_logs(workspace_id,user_id,action) VALUES($1,$2,$3)',[workspace.id,user.id,'platform.'+action]);
   });return response({success:true});
  }
  return deny('Unknown operation',400);
 }catch(e){if(!e.status)console.error('POST /api/admin',e.message);return deny(e.status?e.message:e.code==='23505'?'رکورد تکراری است.':'Operation failed',e.status||500);}
}
