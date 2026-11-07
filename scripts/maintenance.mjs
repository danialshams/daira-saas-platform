import pg from 'pg';
const localHost=url=>/^(localhost|127\.0\.0\.1|db)$/i.test(new URL(url).hostname);
export async function runMaintenance(client){
 // One runner per DB, safe across scaled worker processes.
 const lock=await client.query('SELECT pg_try_advisory_lock(728182828) AS ok');
 if(!lock.rows[0].ok)return {skipped:true};
 try{
  await client.query('BEGIN');
  const trial=await client.query(`UPDATE subscriptions SET plan_code='free',status='active',trial_ends_at=NULL,
    current_period_ends_at=now()+interval '30 days',updated_at=now()
    WHERE status='trialing' AND trial_ends_at<=now() RETURNING workspace_id`);
  const canceled=await client.query(`UPDATE subscriptions SET plan_code='free',status='active',cancel_at_period_end=false,
    current_period_ends_at=now()+interval '30 days',updated_at=now()
    WHERE status='active' AND cancel_at_period_end=true AND current_period_ends_at<=now() RETURNING workspace_id`);
  const overdue=await client.query(`UPDATE subscriptions SET status='past_due',updated_at=now()
    WHERE status='active' AND plan_code NOT IN ('free') AND cancel_at_period_end=false AND current_period_ends_at<=now() RETURNING workspace_id,plan_code`);
  for(const item of [...trial.rows,...canceled.rows]){
   await client.query("INSERT INTO audit_logs(workspace_id,action,metadata) VALUES($1,'subscription.downgraded', $2)",[item.workspace_id,JSON.stringify({reason:'period_ended'})]);
   await client.query(`INSERT INTO notifications(workspace_id,user_id,title,body)
     SELECT $1,m.user_id,'تغییر اشتراک','دوره اشتراک پایان یافت و پلن رایگان فعال شد.' FROM memberships m WHERE m.workspace_id=$1 AND m.role='owner'`,[item.workspace_id]);
  }
  for(const item of overdue.rows){
   await client.query('INSERT INTO invoices(workspace_id,plan_code,amount,status,due_at) SELECT $1,p.code,p.price_monthly,\'pending\',now()+interval \'7 days\' FROM plans p WHERE p.code=$2',[item.workspace_id,item.plan_code]);
   await client.query(`INSERT INTO notifications(workspace_id,user_id,title,body)
     SELECT $1,m.user_id,'تمدید اشتراک','دوره اشتراک پایان یافته و برای تمدید پیش‌فاکتور ثبت شده است.' FROM memberships m WHERE m.workspace_id=$1 AND m.role='owner'`,[item.workspace_id]);
  }
  await client.query(`UPDATE webhook_deliveries SET status='pending',next_attempt_at=now(),last_error='WORKER_TIMEOUT'
    WHERE status='processing' AND processing_started_at<now()-interval '5 minutes' AND attempts<6`);
  await client.query(`UPDATE webhook_deliveries SET status='failed',last_error='RETRY_EXHAUSTED'
    WHERE status='processing' AND processing_started_at<now()-interval '5 minutes' AND attempts>=6`);
  await client.query("DELETE FROM sessions WHERE expires_at < now()-interval '7 days'");
  await client.query("DELETE FROM account_tokens WHERE expires_at < now()-interval '7 days'");
  await client.query("DELETE FROM rate_limits WHERE window_start < now()-interval '2 days'");
  await client.query("DELETE FROM usage_idempotency WHERE created_at < now()-interval '90 days'");
  await client.query("DELETE FROM webhook_deliveries WHERE status IN ('succeeded','failed') AND created_at<now()-interval '90 days'");
  await client.query('COMMIT');
  return {trial:trial.rowCount,canceled:canceled.rowCount,overdue:overdue.rowCount};
 }catch(e){await client.query('ROLLBACK');throw e;}
 finally{await client.query('SELECT pg_advisory_unlock(728182828)');}
}
if(import.meta.url===`file://${process.argv[1]}`){
 if(!process.env.DATABASE_URL){try{process.loadEnvFile('.env.local')}catch{}}
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:localHost(process.env.DATABASE_URL)?false:{rejectUnauthorized:true}});
 await client.connect();try{console.log(await runMaintenance(client));}finally{await client.end()}
}
