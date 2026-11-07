import pg from 'pg';
import {runMaintenance} from '../../../../scripts/maintenance.mjs';
import {drainOnce} from '../../../../scripts/worker.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request){
 const secret=process.env.CRON_SECRET;
 if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`)
  return Response.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
 if(!process.env.DATABASE_URL)return Response.json({error:'DB_UNAVAILABLE'},{status:503});
 const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:/^(localhost|127\.0\.0\.1|db)$/i.test(new URL(process.env.DATABASE_URL).hostname)?false:{rejectUnauthorized:true}});
 let count=0;let maintenance;
 try{
  await db.connect();
  maintenance=await runMaintenance(db);
  const deadline=Date.now()+26000;
  while(Date.now()<deadline&&count<10&&await drainOnce())count++;
  return Response.json({success:true,maintenance,deliveries:count},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('cron maintenance',e.message);return Response.json({error:'MAINTENANCE_FAILED'},{status:503});}
 finally{await db.end().catch(()=>{});}
}
