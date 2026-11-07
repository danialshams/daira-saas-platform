/** Optional NON-PRODUCTION sample data for demos and UI testing.
 * Never run on a customer database. No payment provider or real messaging calls.
 */
import pg from 'pg';
import {hashPassword} from '../lib/crypto.js';
const {DATABASE_URL,DEMO_PASSWORD,ALLOW_DEMO_SEED,NODE_ENV}=process.env;
if(ALLOW_DEMO_SEED!=='true'||NODE_ENV==='production'||!DATABASE_URL||!DEMO_PASSWORD||DEMO_PASSWORD.length<10){
 console.error('Demo seeding requires ALLOW_DEMO_SEED=true, NODE_ENV!=production, DATABASE_URL, DEMO_PASSWORD (10+ chars).');
 process.exit(1);
}
const pool=new pg.Pool({connectionString:DATABASE_URL,ssl:/^(db|localhost|127\.0\.0\.1)$/.test(new URL(DATABASE_URL).hostname)?false:{rejectUnauthorized:true},max:2});
const client=await pool.connect();
const names=['سپهر تجارت','نورا دیجیتال','آریا سیستم','چابک گستر','مهتاب سرویس','ایران اکسپرس','آفتاب توسعه','پارس تکنولوژی','سیمای نو','خانه هنر','پویا مارکت','فراز سیستم','آرمان سلامت','راهکار یکپارچه','ویستا شاپ','هما سرویس','شهر کالا','سپیدار گستر','نقطه آبی','پژواک داده','ایده نو','بوم کسب‌وکار','آسان رزرو','همراه تجارت'];
const products=['crm','projects','erp','booking','finance','learning','analytics'];
const planCodes=['free','pro','business'];
let count=0;
try{
 const pwd=await hashPassword(DEMO_PASSWORD);
 await client.query('BEGIN');
 for(let i=0;i<names.length;i++){
  const email=`demo-${String(i+1).padStart(2,'0')}@example.test`;
  const {rows:[user]}=await client.query(`INSERT INTO users(name,email,password_hash,email_verified_at) VALUES($1,$2,$3,now()) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[names[i]+' | مدیر',email,pwd]);
  const slug=`demo-space-${String(i+1).padStart(2,'0')}`;
  const {rows:[w]}=await client.query(`INSERT INTO workspaces(name,slug,owner_id) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[names[i],slug,user.id]);
  await client.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",[w.id,user.id]);
  const plan=planCodes[i%3];
  await client.query(`INSERT INTO subscriptions(workspace_id,plan_code,status,current_period_ends_at) VALUES($1,$2,'active',now()+interval '30 days') ON CONFLICT(workspace_id) DO NOTHING`,[w.id,plan]);
  const productCount=plan==='free'?1:plan==='pro'?3:5;
  for(let n=0;n<productCount;n++)await client.query('INSERT INTO workspace_products(workspace_id,product_code) VALUES($1,$2) ON CONFLICT DO NOTHING',[w.id,products[(i+n)%products.length]]);
  const {rows:[existing]}=await client.query("SELECT 1 FROM audit_logs WHERE workspace_id=$1 AND action='demo.initialized'",[w.id]);
  if(existing)continue;
  for(let n=0;n<12;n++){
   await client.query(`INSERT INTO usage_daily(workspace_id,feature,day,amount) VALUES($1,$2,current_date-$3::int,$4) ON CONFLICT(workspace_id,feature,day) DO NOTHING`,[w.id,['api_calls','messages','documents'][n%3],Math.floor(n/3),120+i*17+n*6]);
  }
  for(let n=0;n<4;n++){
   const {rows:[ticket]}=await client.query("INSERT INTO tickets(workspace_id,created_by,subject,status,priority) VALUES($1,$2,$3,$4,$5) RETURNING id",[w.id,user.id,['درخواست راهنمایی اتصال','سؤال درباره اشتراک','گزارش عملکرد','درخواست اطلاعات API'][n],['open','pending','resolved','open'][n],['normal','high','low','normal'][n]]);
   await client.query('INSERT INTO ticket_messages(ticket_id,user_id,message) VALUES($1,$2,$3)',[ticket.id,user.id,'درخواست نمونه برای بررسی امکانات پنل پشتیبانی.']);
  }
  for(let n=0;n<3;n++){
   await client.query("INSERT INTO invoices(workspace_id,plan_code,amount,status,due_at) VALUES($1,$2,$3,'pending',now()+interval '7 days')",[w.id,plan,plan==='free'?0:plan==='pro'?590000:1990000]);
  }
  for(let n=0;n<8;n++)await client.query('INSERT INTO audit_logs(workspace_id,user_id,action,metadata) VALUES($1,$2,$3,$4)',[w.id,user.id,['demo.initialized','product.toggled','ticket.created','workspace.renamed'][n%4],JSON.stringify({demo:true,sequence:n})]);
  for(let n=0;n<3;n++)await client.query('INSERT INTO notifications(workspace_id,user_id,title,body) VALUES($1,$2,$3,$4)',[w.id,user.id,['خوش آمدید','گزارش هفتگی','وضعیت اشتراک'][n],'این یک اعلان نمایشی است.']);
  count++;
 }
 await client.query('COMMIT');console.log(`Seeded ${count} new demo workspaces, ${names.length} demo accounts in a NON-PRODUCTION database.`);
}catch(error){await client.query('ROLLBACK');console.error(error);process.exitCode=1;}finally{client.release();await pool.end()}
