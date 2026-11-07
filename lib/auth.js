import {cookies} from 'next/headers';
import {sql} from './db.js';
import {hashToken,randomToken} from './crypto.js';
export {hashToken,randomToken,hashPassword,verifyPassword,encrypt,decrypt} from './crypto.js';

export async function startSession(userId) {
  const token = randomToken();
  await sql('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + interval \'30 days\')',[hashToken(token), userId]);
  const store = await cookies();
  store.set('daira_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:2592000,priority:'high'});
}
export async function endSession() {
  const store = await cookies();
  const token = store.get('daira_session')?.value;
  if(token) await sql('DELETE FROM sessions WHERE token_hash=$1',[hashToken(token)]);
  store.delete('daira_session');
}
export async function getUser() {
  const store = await cookies();
  const token = store.get('daira_session')?.value;
  if (!token) return null;
  const { rows } = await sql(`SELECT u.id,u.name,u.email,u.email_verified_at,u.phone, EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id) AS is_platform_admin
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() LIMIT 1`,[hashToken(token)]);
  return rows[0] || null;
}

const rank = {viewer:0,member:1,manager:2,admin:3,owner:4};
export async function requireMember(user, workspaceId, minimum='viewer') {
  if (!user) throw Object.assign(new Error('لطفاً وارد حساب شوید.'),{status:401});
  if (typeof workspaceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(workspaceId)) throw Object.assign(new Error('فضای کاری نامعتبر است.'),{status:400});
  const { rows } = await sql('SELECT role FROM memberships WHERE user_id=$1 AND workspace_id=$2',[user.id,workspaceId]);
  const membership = rows[0];
  if (!membership || rank[membership.role] < rank[minimum]) throw Object.assign(new Error('به این عملیات دسترسی ندارید.'),{status:403});
  return membership.role;
}

export async function consumeRate(key, limit, seconds) {
  // Fixed windows with an atomic INSERT..ON CONFLICT UPDATE. No in-memory state across instances.
  const windowSeconds = Math.floor(Date.now() / (seconds * 1000)) * seconds;
  const { rows } = await sql(`INSERT INTO rate_limits(rate_key,window_start,hits)
    VALUES ($1,to_timestamp($2),1)
    ON CONFLICT(rate_key,window_start) DO UPDATE SET hits=rate_limits.hits+1 RETURNING hits`,[key,windowSeconds]);
  return rows[0].hits <= limit;
}

