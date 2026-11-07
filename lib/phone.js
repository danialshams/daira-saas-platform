import crypto from 'node:crypto';
export function normalizedIranMobile(input){
 const v=String(input||'').trim().replace(/[\s-]/g,'').replace(/^\+98/,'0').replace(/^98/,'0');
 return /^09\d{9}$/.test(v)?v:null;
}
export function smsCodeHash(challengeId,code){
 if(!process.env.APP_SECRET||process.env.APP_SECRET.length<32)throw new Error('APP_SECRET_NOT_CONFIGURED');
 return crypto.createHmac('sha256',process.env.APP_SECRET).update(`${challengeId}:${code}`).digest('hex');
}
export function generateOtp(){return String(crypto.randomInt(100000,1000000));}
