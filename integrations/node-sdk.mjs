/** Server-only integration for independently hosted CRM/ERP/finance products.
 * Never expose the workspace API key to browsers. Fail closed on entitlement errors.
 */
const PRODUCTS = new Set(['crm','projects','erp','booking','finance','learning','analytics']);
const KEY_RE = /^dk_[A-Za-z0-9_-]{30,}$/;
function validated({baseUrl,apiKey}) {
 const url = new URL(baseUrl);
 if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('HTTPS_REQUIRED');
 if (!KEY_RE.test(apiKey)) throw new Error('SERVER_API_KEY_REQUIRED');
 return url.origin;
}
async function apiFetch(url,{apiKey,method='GET',body,requestId,fetchImpl=fetch}) {
 const headers = {'Authorization':`Bearer ${apiKey}`,'Accept':'application/json'};
 if(body !== undefined) headers['Content-Type']='application/json';
 if(requestId) headers['Idempotency-Key']=requestId;
 const result=await fetchImpl(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(7000),cache:'no-store',redirect:'error'});
 const response=await result.json();
 if(!result.ok)throw Object.assign(new Error(response.error||'DAIRA_PLATFORM_UNAVAILABLE'),{status:result.status});
 return response;
}
export async function requireProductLicense({baseUrl,apiKey,product,workspaceId,fetchImpl}) {
 if(!PRODUCTS.has(product))throw new Error('INVALID_PRODUCT');
 const origin=validated({baseUrl,apiKey});
 const response=await apiFetch(`${origin}/api/v1/licensing?product=${encodeURIComponent(product)}`,{apiKey,fetchImpl});
 if(response.workspaceId!==workspaceId || !response.enabled)throw Object.assign(new Error('LICENSE_NOT_ACTIVE'),{status:403});
 return response;
}
export async function recordUsage({baseUrl,apiKey,feature,amount=1,idempotencyKey,fetchImpl}) {
 if(!idempotencyKey || idempotencyKey.length>128)throw new Error('IDEMPOTENCY_KEY_REQUIRED');
 const origin=validated({baseUrl,apiKey});
 return apiFetch(`${origin}/api/v1/usage`,{apiKey,method:'POST',body:{feature,amount},requestId:idempotencyKey,fetchImpl});
}
/** One-time exchange is NOT authenticated with a workspace API key: it consumes a
 * user-created short-lived token and must be sent from your product backend. */
export async function exchangeIntegrationToken({baseUrl,token,fetchImpl=fetch}) {
 const url=new URL(baseUrl);
 if(url.protocol!=='https:' && url.hostname!=='localhost' && url.hostname!=='127.0.0.1')throw new Error('HTTPS_REQUIRED');
 if(typeof token!=='string'||token.length<35)throw new Error('INVALID_TOKEN');
 const res=await fetchImpl(`${url.origin}/api/v1/integrations/exchange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(7000),cache:'no-store',redirect:'error'});
 const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'EXCHANGE_FAILED'),{status:res.status});
 return data;
}
