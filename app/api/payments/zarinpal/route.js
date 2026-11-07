import { sql,transaction,audit,emitEvent } from '../../../../lib/db.js';
import { paymentConfigured,verifyPayment } from '../../../../lib/billing.js';
import { invoiceTotal } from '../../../../lib/lifecycle.js';
import {after} from 'next/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
function destination(request,kind){const u=new URL('/',request.url);u.searchParams.set('payment',kind);return Response.redirect(u,303);}
export async function GET(request){
 if(!paymentConfigured())return destination(request,'unavailable');
 const q=new URL(request.url).searchParams;
 const id=q.get('invoice'),authority=q.get('Authority'),status=q.get('Status');
 if(!/^[0-9a-f-]{36}$/i.test(id||'')||!authority||authority.length>120)return destination(request,'invalid');
 try{
  const {rows:[invoice]}=await sql('SELECT * FROM invoices WHERE id=$1 AND provider=$2 AND payment_authority=$3',[id,'zarinpal',authority]);
  if(!invoice)return destination(request,'invalid');
  if(invoice.status==='paid')return destination(request,'paid');
  if(status!=='OK'){
   await sql("INSERT INTO payment_events(invoice_id,provider,kind,reference) VALUES($1,'zarinpal','returned_cancelled',$2)",[id,authority]);
   return destination(request,'cancelled');
  }
  const verification=await verifyPayment({authority,amountToman:invoiceTotal(invoice)});
  if(!verification.valid)return destination(request,'failed');
  const settled=await transaction(async client=>{
   const {rows:[row]}=await client.query('SELECT id,workspace_id,plan_code,status FROM invoices WHERE id=$1 FOR UPDATE',[invoice.id]);
   if(row.status==='paid')return {changed:false,workspaceId:row.workspace_id};
   if(row.status!=='pending'||!row.plan_code)throw new Error('INVOICE_NOT_PAYABLE');
   await client.query("UPDATE invoices SET status='paid',paid_at=now(),payment_ref=$2,provider_reference=COALESCE(provider_reference,$2) WHERE id=$1",[row.id,verification.ref||authority]);
   await client.query(`UPDATE subscriptions SET plan_code=$2,status='active',trial_ends_at=NULL,
     current_period_ends_at=GREATEST(now(),COALESCE(current_period_ends_at,now()))+interval '30 days',cancel_at_period_end=false,updated_at=now()
     WHERE workspace_id=$1`,[row.workspace_id,row.plan_code]);
   await client.query("INSERT INTO payment_events(invoice_id,provider,kind,reference) VALUES($1,'zarinpal','verified',$2)",[row.id,verification.ref||authority]);
   return {changed:true,workspaceId:row.workspace_id};
  });
  if(settled.changed){await audit(settled.workspaceId,null,'subscription.paid',{invoiceId:id});await emitEvent(settled.workspaceId,'invoice.paid',{invoiceId:id});after(async()=>{try{const {drainOnce}=await import('../../../../scripts/worker.mjs');await drainOnce()}catch(e){console.error('event delivery',e.message)}});}
  return destination(request,'paid');
 }catch(e){console.error('payment verify',e.message);return destination(request,'failed');}
}
