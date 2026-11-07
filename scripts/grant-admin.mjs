// Admin assignment requires database-owner access and an existing account.
import pg from 'pg';
const mail=process.argv[2]?.toLowerCase();
if(!mail||!process.env.DATABASE_URL){console.error('Usage: DATABASE_URL=... node scripts/grant-admin.mjs owner@example.com');process.exit(1)}
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)?false:{rejectUnauthorized:true}});
try{await db.connect();const x=await db.query('INSERT INTO platform_admins(user_id) SELECT id FROM users WHERE email=$1 ON CONFLICT DO NOTHING RETURNING user_id',[mail]);console.log(x.rowCount?'Administrator enabled':'User not found or already admin')}finally{await db.end()}
