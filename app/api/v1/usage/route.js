import { sql, transaction } from '../../../../lib/db.js';
import { hashToken, consumeRate } from '../../../../lib/auth.js';
import { isAccessActive } from '../../../../lib/lifecycle.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request){
 try{
  if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON_REQUIRED'},415);
  if(Number(request.headers.get('content-length')||0)>8192) return json({error:'PAYLOAD_TOO_LARGE'},413);
  const bearer=request.headers.get('authorization')||'';
  if(!/^Bearer dk_[A-Za-z0-9_-]{30,}$/.test(bearer)) return json({error:'API_KEY_REQUIRED'},401);
  const token=bearer.slice(7);
  const {rows:[key]}=await sql('SELECT workspace_id,scopes,id FROM api_keys WHERE token_hash=$1 AND revoked_at IS NULL',[hashToken(token)]);
  if(!key||!Array.isArray(key.scopes)||!key.scopes.includes('usage:write')) return json({error:'INVALID_API_KEY'},401);
  if(!await consumeRate('api:'+key.id,120,60)) return json({error:'RATE_LIMITED'},429);
  const payload=await request.json();
  const feature=String(payload?.feature||'').trim();
  const amount=Number(payload?.amount??1);
  const idem=String(request.headers.get('idempotency-key')||'').trim();
  if(!/^[a-z][a-z0-9_:-]{1,63}$/.test(feature)||!Number.isInteger(amount)||amount<1||amount>1000) return json({error:'INVALID_USAGE'},400);
  if(!idem || idem.length>128) return json({error:'IDEMPOTENCY_KEY_REQUIRED'},400);
  const result=await transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key.workspace_id]);
   const {rows:[plan]}=await client.query(`SELECT p.api_limit,s.status,s.trial_ends_at,s.current_period_ends_at,s.plan_code FROM subscriptions s JOIN plans p ON p.code=s.plan_code WHERE s.workspace_id=$1`,[key.workspace_id]);
   if(!isAccessActive(plan)) return {error:'SUBSCRIPTION_INACTIVE',status:402};
   const {rows:[previous]}=await client.query('SELECT 1 FROM usage_idempotency WHERE workspace_id=$1 AND request_id=$2',[key.workspace_id,idem]);
   if(previous) return {success:true,duplicate:true};
   const {rows:[sum]}=await client.query(`SELECT COALESCE(sum(amount),0)::bigint AS used FROM usage_daily WHERE workspace_id=$1 AND feature='api_calls' AND day>=date_trunc('month',now())::date`,[key.workspace_id]);
   if(Number(sum.used)+amount>plan.api_limit) return {error:'MONTHLY_QUOTA_EXCEEDED',status:429,limit:plan.api_limit,used:Number(sum.used)};
   await client.query('INSERT INTO usage_idempotency(workspace_id,request_id) VALUES($1,$2)',[key.workspace_id,idem]);
   await client.query(`INSERT INTO usage_daily(workspace_id,feature,day,amount) VALUES($1,'api_calls',CURRENT_DATE,$2) ON CONFLICT(workspace_id,feature,day) DO UPDATE SET amount=usage_daily.amount+EXCLUDED.amount`,[key.workspace_id,amount]);
   if(feature!=='api_calls') await client.query(`INSERT INTO usage_daily(workspace_id,feature,day,amount) VALUES($1,$2,CURRENT_DATE,$3) ON CONFLICT(workspace_id,feature,day) DO UPDATE SET amount=usage_daily.amount+EXCLUDED.amount`,[key.workspace_id,feature,amount]);
   return {success:true,used:Number(sum.used)+amount,limit:plan.api_limit};
  });
  if(result.success&&!result.duplicate) await sql('UPDATE api_keys SET last_used_at=now() WHERE id=$1',[key.id]);
  return json(result,result.status||200);
 }catch(e){console.error('POST /api/v1/usage',e.message);return json({error:'SERVER_ERROR'},500);}
}
