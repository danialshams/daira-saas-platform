import {transaction} from '../../../../../lib/db.js';
import {hashToken,consumeRate} from '../../../../../lib/auth.js';
import {isAccessActive} from '../../../../../lib/lifecycle.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 try{
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON_REQUIRED'},415);
  const raw=await request.text();if(raw.length>2000)return reply({error:'TOO_LARGE'},413);
  const code=JSON.parse(raw)?.token;
  if(typeof code!=='string'||code.length<35||code.length>128)return reply({error:'INVALID_CODE'},400);
  if(!await consumeRate('integration-exchange:'+hashToken(code).slice(0,16),8,300))return reply({error:'RATE_LIMITED'},429);
  const out=await transaction(async client=>{
   const {rows:[t]}=await client.query(`SELECT t.workspace_id,t.product_code,t.created_by,s.plan_code,s.status,s.trial_ends_at,s.current_period_ends_at,
    EXISTS(SELECT 1 FROM workspace_products wp WHERE wp.workspace_id=t.workspace_id AND wp.product_code=t.product_code AND (SELECT count(*) FROM workspace_products older WHERE older.workspace_id=wp.workspace_id AND (older.enabled_at,older.product_code) <= (wp.enabled_at,wp.product_code)) <= (SELECT product_limit FROM plans WHERE code=s.plan_code)) AS product_enabled
    FROM integration_tokens t JOIN subscriptions s ON s.workspace_id=t.workspace_id
    JOIN workspaces w ON w.id=t.workspace_id AND w.archived_at IS NULL
    WHERE t.token_hash=$1 AND t.consumed_at IS NULL AND t.expires_at>now() FOR UPDATE OF t`,[hashToken(code)]);
   if(!t||!isAccessActive(t)||!t.product_enabled)return null;
   await client.query('UPDATE integration_tokens SET consumed_at=now() WHERE token_hash=$1',[hashToken(code)]);
   return {workspaceId:t.workspace_id,productCode:t.product_code,userId:t.created_by,plan:t.plan_code};
  });
  if(!out)return reply({error:'CODE_INVALID_OR_EXPIRED'},401);
  return reply({success:true,...out});
 }catch(e){console.error('integration exchange',e.message);return reply({error:'UNAVAILABLE'},503)}
}
