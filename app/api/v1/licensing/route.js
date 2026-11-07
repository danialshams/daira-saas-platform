// Downstream modules can validate a tenant's product entitlement using a scoped API key.
import { sql } from '../../../../lib/db.js';
import { hashToken,consumeRate } from '../../../../lib/auth.js';
import { isAccessActive } from '../../../../lib/lifecycle.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 try{
  const bearer=request.headers.get('authorization')||'';
  if(!/^Bearer dk_[A-Za-z0-9_-]{30,}$/.test(bearer))return json({error:'UNAUTHORIZED'},401);
  const product=new URL(request.url).searchParams.get('product');
  if(!['crm','projects','erp','booking','finance','learning','analytics'].includes(product))return json({error:'INVALID_PRODUCT'},400);
  const {rows:[key]}=await sql('SELECT id,workspace_id,scopes FROM api_keys WHERE token_hash=$1 AND revoked_at IS NULL',[hashToken(bearer.slice(7))]);
  if(!key||!key.scopes.includes('license:read'))return json({error:'FORBIDDEN'},403);
  if(!await consumeRate('license:'+key.id,120,60))return json({error:'RATE_LIMITED'},429);
  const {rows:[entitlement]}=await sql(`SELECT s.plan_code,s.status,s.trial_ends_at,s.current_period_ends_at,p.seat_limit,p.api_limit,p.storage_mb,p.product_limit,
    EXISTS(SELECT 1 FROM workspace_products wp WHERE wp.workspace_id=s.workspace_id AND wp.product_code=$2 AND (SELECT count(*) FROM workspace_products older WHERE older.workspace_id=wp.workspace_id AND (older.enabled_at,older.product_code) <= (wp.enabled_at,wp.product_code)) <= p.product_limit) AS product_enabled,
    w.slug AS workspace_slug FROM subscriptions s JOIN plans p ON p.code=s.plan_code JOIN workspaces w ON w.id=s.workspace_id
    WHERE s.workspace_id=$1 AND w.archived_at IS NULL`,[key.workspace_id,product]);
  if(!entitlement)return json({error:'WORKSPACE_NOT_FOUND'},404);
  await sql('UPDATE api_keys SET last_used_at=now() WHERE id=$1',[key.id]);
  const enabled=isAccessActive(entitlement)&&entitlement.product_enabled;
  return json({workspaceId:key.workspace_id,slug:entitlement.workspace_slug,product,enabled,plan:entitlement.plan_code,status:entitlement.status,limits:{seats:entitlement.seat_limit,api:entitlement.api_limit,storageMb:entitlement.storage_mb,products:entitlement.product_limit}});
 }catch(e){console.error('GET /api/v1/licensing',e.message);return json({error:'UNAVAILABLE'},503);}
}
