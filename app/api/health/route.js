import { sql } from '../../../lib/db.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await sql('SELECT 1'); return Response.json({ok:true,database:'connected',checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}}); }
  catch { return Response.json({ok:false,database:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
