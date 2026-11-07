import {getDemoDashboard,getDemoTicket,getDemoAdmin} from '../../../lib/demo-data.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request){
 const url=new URL(request.url);
 const headers={'Cache-Control':'public, max-age=30, s-maxage=60','X-Demo-Mode':'read-only','X-Content-Type-Options':'nosniff'};
 if(url.searchParams.get('admin')==='1')return Response.json(getDemoAdmin(),{headers});
 const workspaceId=url.searchParams.get('workspace')||'';
 const ticketId=url.searchParams.get('ticket');
 if(ticketId){const ticket=getDemoTicket(workspaceId,ticketId);return Response.json(ticket?{demo:true,ticket}:{error:'درخواست نمایشی یافت نشد.'},{status:ticket?200:404,headers});}
 return Response.json(getDemoDashboard(workspaceId),{headers});
}
export async function POST(){return Response.json({error:'این محیط فقط برای نمایش است.'},{status:405,headers:{Allow:'GET'}})}
