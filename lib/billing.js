// ZarinPal is optional. No local or unsigned callback may mark an invoice paid.
export function paymentConfigured(){return process.env.PAYMENT_PROVIDER==='zarinpal' && !!process.env.ZARINPAL_MERCHANT_ID;}
function base(){return process.env.ZARINPAL_SANDBOX==='true'?'https://sandbox.zarinpal.com':'https://payment.zarinpal.com';}
async function rpc(action,params){
 const res=await fetch(`${base()}/pg/v4/payment/${action}.json`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(params),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
 const obj=await res.json();if(!obj||typeof obj!=='object')throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE');
 return obj;
}
export function tomanToRial(amount){const value=Number(amount);if(!Number.isSafeInteger(value)||value<=0||value>Number.MAX_SAFE_INTEGER/10)throw new Error('INVALID_AMOUNT');return value*10;}
export async function initiatePayment({amountToman,invoiceId,callbackBase,email}){
 if(!paymentConfigured()) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
 const call=new URL('/api/payments/zarinpal',callbackBase);
 call.searchParams.set('invoice',invoiceId);
 if(call.protocol!=='https:' && process.env.NODE_ENV==='production')throw new Error('INVALID_CALLBACK_URL');
 const result=await rpc('request',{merchant_id:process.env.ZARINPAL_MERCHANT_ID,amount:tomanToRial(amountToman),callback_url:call.toString(),description:`اشتراک دایرا - صورت‌حساب ${invoiceId}`,metadata:email?{email}:undefined});
 if(Number(result?.data?.code)!==100||!result.data.authority)throw new Error('PAYMENT_REQUEST_REJECTED');
 const start=process.env.ZARINPAL_SANDBOX==='true'?'https://sandbox.zarinpal.com':'https://www.zarinpal.com';
 return {authority:String(result.data.authority),redirectUrl:`${start}/pg/StartPay/${encodeURIComponent(String(result.data.authority))}`};
}
export async function verifyPayment({authority,amountToman}){
 if(!paymentConfigured())throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
 const result=await rpc('verify',{merchant_id:process.env.ZARINPAL_MERCHANT_ID,authority,amount:tomanToRial(amountToman)});
 return {valid:[100,101].includes(Number(result?.data?.code)),code:Number(result?.data?.code),ref:String(result?.data?.ref_id||'')};
}
