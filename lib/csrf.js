// Origin + Fetch Metadata guard for cookie-authenticated mutation APIs.
export function safeMutation(request){
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 const expected=new URL(request.url).origin;
 if(site==='cross-site')return false;
 if(origin && origin!==expected)return false;
 if(!origin && site && site!=='same-origin' && site!=='none')return false;
 // Browser clients send Origin; non-browser API clients must authenticate independently.
 return true;
}
