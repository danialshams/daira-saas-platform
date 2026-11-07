// A portable PostgreSQL outbox worker. Run separately on a VPS/container.
// Vercel does not run this background loop. Schedule one-shot execution on an external job runner.
import pg from 'pg';
import crypto from 'node:crypto';
import {decrypt} from '../lib/crypto.js';
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import {runMaintenance} from './maintenance.mjs';

let pool;
function getPool(){
 // Lazy initialization: Next.js imports the cron module during `next build`.
 // Credentials are required only when worker execution actually begins.
 if(!process.env.DATABASE_URL){try{process.loadEnvFile('.env.local')}catch{}}
 if(!process.env.DATABASE_URL||!process.env.APP_SECRET)throw new Error('DATABASE_URL and APP_SECRET are required');
 if(!pool)pool=new pg.Pool({connectionString:process.env.DATABASE_URL,
  ssl:/^(localhost|127\.0\.0\.1|db)$/i.test(new URL(process.env.DATABASE_URL).hostname)?false:{rejectUnauthorized:true},max:4});
 return pool;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function forbidden(address) {
 if(net.isIP(address)===4){const a=address.split('.').map(Number);
  return a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127);}
 if(net.isIP(address)===6) { const lower=address.toLowerCase();
  if(lower.startsWith('::ffff:'))return forbidden(lower.slice(7));
  return lower==='::1'||lower==='::'||lower.startsWith('fe80:')||lower.startsWith('fc')||lower.startsWith('fd')||lower.startsWith('ff')||lower.startsWith('2001:db8:');
 }
 return true;
}
async function safeAddress(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password) throw new Error('UNSAFE_WEBHOOK_URL');
 const addresses=await dns.lookup(u.hostname,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(x=>forbidden(x.address))) throw new Error('PRIVATE_NETWORK_TARGET');
 return {url:u, pinned:addresses[0]};
}
export async function drainOnce(){
 const client=await getPool().connect();let delivery;
 try{
  await client.query('BEGIN');
  const result=await client.query(`SELECT d.*,w.url,w.secret_ciphertext FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id
    WHERE d.status='pending' AND d.next_attempt_at<=now() AND w.enabled=true ORDER BY d.created_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED`);
  delivery=result.rows[0];
  if(delivery) await client.query(`UPDATE webhook_deliveries SET status='processing',processing_started_at=now(),attempts=attempts+1 WHERE id=$1`,[delivery.id]);
  await client.query('COMMIT');
 }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
 if(!delivery)return false;
 try {
  // Resolve once, validate the resolved address and pin the outbound socket to that IP.
  // This prevents a hostname from rebinding to an internal IP between validation and connection.
  const target=await safeAddress(delivery.url);
  const payload=JSON.stringify({id:delivery.id,event:delivery.event_name,data:delivery.payload,created_at:delivery.created_at});
  const ts=Math.floor(Date.now()/1000).toString();
  const signature=crypto.createHmac('sha256',decrypt(delivery.secret_ciphertext)).update(ts+'.'+payload).digest('hex');
  const response=await new Promise((resolve,reject)=>{
   const req=https.request(target.url,{
    method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),
     'X-Daira-Event':delivery.event_name,'X-Daira-Timestamp':ts,
     'X-Daira-Signature':'sha256='+signature,'X-Daira-Delivery':delivery.id},
    lookup:(_hostname,_options,cb)=>cb(null,target.pinned.address,target.pinned.family),
    agent:false,
   },res=>{res.resume();res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode}));res.on('error',reject)});
   req.on('error',reject);req.setTimeout(8000,()=>req.destroy(new Error('TIMEOUT')));
   req.end(payload);
  });
  if(!response.ok)throw new Error('HTTP_'+response.status);
  await getPool().query(`UPDATE webhook_deliveries SET status='succeeded',processing_started_at=NULL,last_error=NULL WHERE id=$1`,[delivery.id]);
 }catch(e){
  const next=delivery.attempts+1>=6?'failed':'pending';
  const delay=Math.min(3600,30*Math.pow(2,delivery.attempts));
  await getPool().query(`UPDATE webhook_deliveries SET status=$2,processing_started_at=NULL,last_error=$3,next_attempt_at=now()+($4::text||' seconds')::interval WHERE id=$1`,[delivery.id,next,String(e.message).slice(0,200),delay]);
 }
 return true;
}
if(import.meta.url===`file://${process.argv[1]}`){
 const once=process.argv.includes('--once');
 let lastMaintenance=0;
 do{
  if(Date.now()-lastMaintenance>60000){lastMaintenance=Date.now();const c=await getPool().connect();try{await runMaintenance(c)}catch(e){console.error('maintenance:',e.message)}finally{c.release()}}
  let didWork=false;
  try{didWork=await drainOnce()}catch(e){console.error('worker:',e.message);if(once)process.exitCode=1}
  if(once)break;
  await sleep(didWork?150:2500);
 }while(true);
 await getPool().end();
}
