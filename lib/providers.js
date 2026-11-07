// Credential-free provider contracts. Never imply successful delivery when unconfigured.
export class ProviderNotConfigured extends Error {
  constructor(kind) { super(`${kind}_PROVIDER_NOT_CONFIGURED`); this.code='PROVIDER_NOT_CONFIGURED'; this.kind=kind; }
}
export function providerStatus(){return {
  email: !!(process.env.MAIL_HTTP_ENDPOINT && process.env.MAIL_HTTP_TOKEN),
  sms: !!(process.env.SMS_HTTP_ENDPOINT && process.env.SMS_HTTP_TOKEN),
  payment: process.env.PAYMENT_PROVIDER==='zarinpal' && !!process.env.ZARINPAL_MERCHANT_ID
};}
function endpoint(raw){let u;try{u=new URL(raw);}catch{throw new Error('PROVIDER_URL_INVALID');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw new Error('PROVIDER_URL_INVALID');
 return u;
}
async function deliver(kind,params){
 const upper=kind==='email'?'MAIL':'SMS';
 const url=process.env[`${upper}_HTTP_ENDPOINT`];const token=process.env[`${upper}_HTTP_TOKEN`];
 if(!url||!token) throw new ProviderNotConfigured(kind);
 const res=await fetch(endpoint(url),{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(params),signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
 if(!res.ok) throw new Error(`${kind.toUpperCase()}_DELIVERY_FAILED_${res.status}`);
 return true;
}
export async function sendEmail({to,subject,text}){return deliver('email',{to,subject,text});}
export async function sendSms({to,text,template}){return deliver('sms',{to,text,template});}
