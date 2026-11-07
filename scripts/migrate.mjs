import fs from 'node:fs/promises';
import pg from 'pg';
if(!process.env.DATABASE_URL){try{process.loadEnvFile('.env.local')}catch{}}
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is missing');
const isLocal=/^(localhost|127\.0\.0\.1|db)$/i.test(new URL(process.env.DATABASE_URL).hostname);
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:isLocal?false:{rejectUnauthorized:true}});
await client.connect();
try{
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
 const dir=new URL('../database/',import.meta.url);
 const scripts=(await fs.readdir(dir)).filter(p=>/^\d+_[a-z0-9_]+\.sql$/.test(p)).sort();
 for(const name of scripts){
  const {rows:[found]}=await client.query('SELECT version FROM schema_migrations WHERE version=$1',[name]);
  if(found)continue;
  const source=await fs.readFile(new URL(name,dir),'utf8');
  await client.query(source);
  await client.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',[name]);
  console.log('Applied migration:',name);
 }
}finally{await client.end()}
