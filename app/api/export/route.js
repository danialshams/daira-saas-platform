import {getUser,requireMember} from '../../../lib/auth.js';
import {sql} from '../../../lib/db.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
function quote(v){const str=String(v??'');const safe=/^[=+@-]/.test(str)?"'"+str:str;return '"'+safe.replace(/"/g,'""')+'"';}
export async function GET(request){
 try{
  const u=new URL(request.url),wid=u.searchParams.get('workspace'),kind=u.searchParams.get('kind');
  if(!['invoices','usage','team','activity'].includes(kind))return Response.json({error:'Invalid report'},{status:400});
  const user=await getUser();await requireMember(user,wid,kind==='invoices'?'owner':'admin');
  const statements={
   invoices:['SELECT id,plan_code,amount,discount_amount,currency,status,created_at,paid_at FROM invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 10000',['id','plan_code','amount','discount_amount','currency','status','created_at','paid_at']],
   usage:['SELECT feature,day,amount FROM usage_daily WHERE workspace_id=$1 ORDER BY day DESC,feature LIMIT 10000',['feature','day','amount']],
   team:['SELECT u.name,u.email,m.role,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY m.created_at',['name','email','role','created_at']],
   activity:['SELECT action,metadata,created_at FROM audit_logs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 10000',['action','metadata','created_at']]
  };
  const [query,columns]=statements[kind];const {rows}=await sql(query,[wid]);
  const csv='\ufeff'+[columns.map(quote).join(','),...rows.map(r=>columns.map(k=>quote(typeof r[k]==='object'&&r[k]!==null?JSON.stringify(r[k]):r[k])).join(','))].join('\r\n');
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="daira-${kind}.csv"`,'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e.status?e.message:'Export unavailable'},{status:e.status||503});}
}
