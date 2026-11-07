import crypto from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
export const hashToken = token=>crypto.createHash('sha256').update(token).digest('hex');
export const randomToken=(bytes=32)=>crypto.randomBytes(bytes).toString('base64url');
export async function hashPassword(password){
 const salt=crypto.randomBytes(16).toString('hex');
 const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1});
 return `scrypt$16384$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password,encoded){
 const [method,cost,salt,hash]=String(encoded||'').split('$');
 if(method!=='scrypt'||cost!=='16384'||!/^[a-f0-9]{32}$/i.test(salt||'')||!/^[a-f0-9]{128}$/i.test(hash||''))return false;
 const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1});
 return crypto.timingSafeEqual(Buffer.from(hash,'hex'),derived);
}
function appKey(){
 const secret=process.env.APP_SECRET;
 if(!secret||secret.length<32)throw new Error('APP_SECRET_NOT_CONFIGURED');
 return crypto.createHash('sha256').update(secret).digest();
}
export function encrypt(value){
 const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',appKey(),iv);
 const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),ciphertext].map(x=>x.toString('base64url')).join('.');
}
export function decrypt(input){
 const chunks=String(input||'').split('.');
 if(chunks.length!==3)throw new Error('INVALID_CIPHERTEXT');
 const [iv,tag,data]=chunks.map(x=>Buffer.from(x,'base64url'));
 if(iv.length!==12||tag.length!==16)throw new Error('INVALID_CIPHERTEXT');
 const cipher=crypto.createDecipheriv('aes-256-gcm',appKey(),iv);cipher.setAuthTag(tag);
 return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');
}
