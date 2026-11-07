/** Public, synthetic, read-only demo. No database access and no personal records. */
export const demoProducts = [
 {code:'crm',name:'مدیریت ارتباط با مشتری',desc:'مدیریت مشتریان، فروش و سرنخ‌ها'},
 {code:'projects',name:'مدیریت پروژه',desc:'تسک، تیم و زمان‌بندی پروژه‌ها'},
 {code:'erp',name:'ERP فروشگاهی',desc:'انبار، سفارش و زنجیره تأمین'},
 {code:'booking',name:'رزرو و نوبت‌دهی',desc:'ظرفیت، تقویم و نوبت‌ها'},
 {code:'finance',name:'مدیریت مالی',desc:'اسناد و گزارش‌های مالی'},
 {code:'learning',name:'آموزش و اشتراک',desc:'دوره، دانشجو و دسترسی'},
 {code:'analytics',name:'تحلیل و گزارش‌گیری',desc:'داشبوردهای تحلیل عملکرد'}
];
export const demoPlans = [
 {code:'free',name:'رایگان',price_monthly:'0',seat_limit:2,api_limit:1000,storage_mb:256,product_limit:1,features:{api:true,webhooks:false,custom_domain:false}},
 {code:'pro',name:'حرفه‌ای',price_monthly:'590000',seat_limit:10,api_limit:50000,storage_mb:10240,product_limit:5,features:{api:true,webhooks:true,custom_domain:true}},
 {code:'business',name:'سازمانی',price_monthly:'1990000',seat_limit:50,api_limit:500000,storage_mb:102400,product_limit:7,features:{api:true,webhooks:true,custom_domain:true}},
 {code:'custom',name:'سفارشی',price_monthly:'0',seat_limit:150,api_limit:1000000,storage_mb:200000,product_limit:7,features:{api:true,webhooks:true,custom_domain:true}}
];
const companyNames = ['سپهر تجارت','نورا دیجیتال','آریا سیستم','چابک گستر','مهتاب سرویس','پارس نوآوران','آفتاب توسعه','چشم‌انداز داده','سیمای نو','خانه هنر','پویا مارکت','فراز سیستم','آرمان سلامت','راهکار یکپارچه','ویستا شاپ','هما سرویس','شهر کالا','سپیدار گستر','نقطه آبی','پژواک داده','ایده نو','بوم کسب‌وکار','آسان رزرو','همراه تجارت','دنیای فناوری','پارس اکسپرس','نیک اندیش','کالای ایرانی','آسمان مدرن','ره‌آورد تجارت','فردا مارکت','نقش دیجیتال','دیدار هوشمند','آبان تجارت','نوین افزار','نسترن استودیو','پیام پرداز','بازار روشن','کارا سیستم','فروشگاه مهر'];
const personNames = ['پارسا رضایی','الهام احمدی','سارا شریفی','امیر محمدی','نیلوفر کریمی','محمد موسوی','آوا حسینی','کیان نادری','آرمین رستمی','مریم امیری','علی رفیعی','مهسا مرادی','مهدی یوسفی','هانیه صادقی','پرهام رحیمی'];
const ticketSubjects = ['راهنمای اتصال به سیستم CRM','افزایش سهمیه درخواست‌های API','بررسی صورت‌حساب دوره جاری','تنظیم دامنه اختصاصی','تنظیم دسترسی اعضای تیم','آموزش استفاده از وب‌هوک','گزارش مصرف دوره گذشته','انتقال داده‌ها به سرور اختصاصی','درخواست بهبود ابزارهای گزارش‌گیری','سؤال درباره تغییر پلن','بررسی اعلان‌های سیستم','درخواست مستندات API'];
const ticketStatus = ['open','resolved','pending','open','pending','resolved'];
const actions = ['workspace.created','member.invited','apikey.created','webhook.created','subscription.plan_requested','product.toggled','domain.added','ticket.created','member.joined','subscription.downgraded','demo.initialized'];
const now = Date.now();
const stamp=(days=0,hours=0)=>new Date(now-days*86400000-hours*3600000).toISOString();
const future=(days=0)=>new Date(now+days*86400000).toISOString();
const uuid=(num)=>`d0e0a000-0000-4000-8000-${Number(num).toString(16).padStart(12,'0')}`;
const planFor=(i)=>demoPlans[[2,1,1,0,2,1,3,1][i%8]];
const statusFor=(i)=>i%17===0?'paused':i%13===0?'canceled':i%7===0?'trialing':'active';
const fakeEmail=(i,j)=>`demo-person-${i+1}-${j+1}@example.test`;
export const demoWorkspaces=companyNames.map((name,i)=>({id:uuid(100+i),name,slug:`demo-${String(i+1).padStart(2,'0')}`,role:'owner',created_at:stamp(180-i*3),archived_at:null}));
const demoAnnouncementList=[
 {id:uuid(87001),title:'نسخه نمایشی دایرا کلود',body:'تمام اطلاعات این محیط ساختگی‌اند. این محیط برای معرفی رابط کاربری ایجاد شده و امکان ثبت تغییرات واقعی ندارد.',published_at:stamp(1)},
 {id:uuid(87002),title:'قابلیت‌های مدیریت اشتراک',body:'مدیریت ظرفیت، صورتحساب، کلید API و اعضای تیم در هسته SaaS قرار دارد.',published_at:stamp(5)},
 {id:uuid(87003),title:'سازگاری با سرور اختصاصی',body:'هسته مبتنی بر PostgreSQL و Next.js است و مهاجرت با Docker پیش‌بینی شده است.',published_at:stamp(18)}
];
function teamFor(i,plan){const count=Math.min(plan.seat_limit,1+((i*7+5)%16));return Array.from({length:count},(_,j)=>({user_id:uuid(100000+i*100+j),name:personNames[(i+j*3)%personNames.length],email:fakeEmail(i,j),role:j===0?'owner':j===1?'admin':j%5===0?'manager':j%3===0?'viewer':'member',created_at:stamp(90-j*4)}));}
function ticketFor(i,n,userId){const id=uuid(200000+i*100+n);return {id,workspace_id:demoWorkspaces[i].id,subject:ticketSubjects[(i+n)%ticketSubjects.length],status:ticketStatus[(n+i)%ticketStatus.length],priority:n%5===0?'high':n%4===0?'low':'normal',created_by:userId,created_at:stamp(26-n*2,2),updated_at:stamp(25-n*2),workspace_name:demoWorkspaces[i].name,created_by_name:personNames[i%personNames.length]};}
function invoiceFor(i,n,plan){const status=n%7===0?'void':n%3===0?'pending':'paid';const amount=plan.code==='free'?0:plan.code==='custom'?2990000:Number(plan.price_monthly);return {id:uuid(300000+i*100+n),workspace_id:demoWorkspaces[i].id,workspace_name:demoWorkspaces[i].name,plan_code:plan.code,amount:String(amount),discount_amount:String(n%4===0?Math.round(amount*.1):0),currency:'IRT',status:amount===0?'void':status,created_at:stamp(210-n*28),due_at:future(7),paid_at:status==='paid'&&amount>0?stamp(210-n*28-2):null};}
function snap(i){
 const workspace=demoWorkspaces[i],plan=planFor(i),status=statusFor(i),team=teamFor(i,plan);
 const requests=Math.floor(plan.api_limit*(.15+(i%6)*.12));
 const apiKeys=Array.from({length:3+i%4},(_,j)=>({id:uuid(400000+i*100+j),label:['اتصال به CRM','سرویس ثبت سفارش','سیستم گزارش‌گیری','محیط تست توسعه','اپلیکیشن موبایل','سرویس حسابداری'][(i+j)%6],key_prefix:`dk_demo_${String(i+1).padStart(2,'0')}_${j+1}`,scopes:['usage:write','licensing:read'],last_used_at:stamp(j+1),created_at:stamp(60+j*4)}));
 const webhooks=Array.from({length:2+i%4},(_,j)=>({id:uuid(500000+i*100+j),label:['ثبت سفارش جدید','به‌روزرسانی اشتراک','اعلان پرداخت','تغییر وضعیت مشتری','رویدادهای API'][(i+j)%5],url:`https://hooks-${i+1}.example.test/events/${j+1}`,events:['invoice.paid','subscription.updated'],enabled:j%4!==3,created_at:stamp(40+j*3)}));
 const tickets=Array.from({length:8+i%5},(_,j)=>ticketFor(i,j,team[0].user_id));
 const invoices=Array.from({length:9+i%5},(_,j)=>invoiceFor(i,j,plan));
 const notifications=Array.from({length:16},(_,j)=>({id:uuid(600000+i*100+j),title:['وضعیت اشتراک','دعوت همکار جدید','گزارش مصرف API','ایجاد تیکت','محدودیت سهمیه','آپدیت محصول','گزارش دوره‌ای','اطلاعیه مدیریت'][j%8],body:['اطلاعات نمایشی برای بررسی نحوه نمایش اعلان‌ها.','یک فعالیت نمونه در فضای کاری ثبت شده است.','گزارش مربوط به فضای کاری به‌روزرسانی شده است.'][j%3],read_at:j%3===0?null:stamp(j),created_at:stamp(j)}));
 const activity=Array.from({length:25},(_,j)=>({id:j+1,action:actions[(i+j)%actions.length],metadata:{demo:true,sequence:j},created_at:stamp(j/3)}));
 const domains=Array.from({length:2+i%2},(_,j)=>({id:uuid(700000+i*10+j),hostname:`${workspace.slug}-${j+1}.example.test`,verification_token:`demo-verification-${i+1}-${j+1}`,verified_at:j%2===0?stamp(11):null,created_at:stamp(32-j*3)}));
 const invitations=Array.from({length:4},(_,j)=>({id:uuid(750000+i*10+j),email:`invite-${i}-${j}@example.test`,role:j===0?'admin':j===1?'manager':j===2?'viewer':'member',created_at:stamp(1+j),expires_at:future(2+j)}));
 const activeProducts=demoProducts.slice(0,plan.product_limit).map((p,j)=>({product_code:demoProducts[(i+j)%demoProducts.length].code,enabled_at:stamp(60-j*2)}));
 return {
  demo:true,authenticated:false,user:{id:team[0].user_id,name:'بازدیدکننده نسخه نمایشی',email:'demo-viewer@example.test',is_platform_admin:true},
  workspace,workspaces:demoWorkspaces,plans:demoPlans,products:demoProducts,providers:{sms:false,email:false,payment:false},
  subscription:{workspace_id:workspace.id,plan_code:plan.code,plan_name:plan.name,status,current_period_ends_at:future(20+i%15),trial_ends_at:status==='trialing'?future(14):null,cancel_at_period_end:false,...plan},
  team,invitations,usage:[{feature:'api_calls',amount:String(requests)},{feature:'messages',amount:String(3500+i*201)},{feature:'documents',amount:String(380+i*47)},{feature:'webhook_deliveries',amount:String(870+i*51)},{feature:'notifications',amount:String(120+i*16)}],
  apiKeys,webhooks,tickets,invoices,activity,notifications,activeProducts,domains,
  announcements:demoAnnouncementList,credit:String(i%4===0?50000:0),failedWebhooks:i%6===0?2:0
 };
}
export const getDemoDashboard=(id)=>{const i=demoWorkspaces.findIndex(w=>w.id===id||w.slug===id);return snap(i<0?0:i)};
export const getDemoTicket=(workspaceId,ticketId)=>{
 const data=getDemoDashboard(workspaceId);const ticket=data.tickets.find(t=>t.id===ticketId);
 if(!ticket)return null;
 return {...ticket,messages:Array.from({length:5},(_,i)=>({id:uuid(840000+i),name:i%2?'کارشناس پشتیبانی':'بازدیدکننده نمونه',message:['سلام، درباره روش فعال‌سازی این قابلیت سؤال داشتم.','درخواست شما دریافت شد و در حال بررسی است.','لطفاً راهنمای اتصال API را ارسال کنید.','در نسخه عملی، پاسخ از سمت تیم پشتیبانی ثبت می‌شود.','متشکرم؛ توضیحات کافی بود.'][i],created_at:stamp(4-i/5)}))};
};
export const getDemoAdmin=()=>{
 const spaces=demoWorkspaces.map((w,i)=>{const p=planFor(i),data=snap(i);return {...w,plan_code:p.code,status:data.subscription.status,members:data.team.length}});
 const tickets=spaces.flatMap((w,i)=>Array.from({length:7},(_,j)=>ticketFor(i,j,uuid(100000+i*100)))).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 const invoices=spaces.flatMap((w,i)=>Array.from({length:5},(_,j)=>invoiceFor(i,j,planFor(i)))).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const paid=invoices.filter(i=>i.status==='paid');
 const planDistribution=demoPlans.map(p=>({plan_code:p.code,count:spaces.filter(w=>w.plan_code===p.code).length}));
 const totals={workspaces:spaces.length,users:spaces.reduce((s,w)=>s+w.members,0),active_subscriptions:spaces.filter(w=>['active','trialing'].includes(w.status)).length,trials:spaces.filter(w=>w.status==='trialing').length,canceled:spaces.filter(w=>w.status==='canceled').length,mrr:String(spaces.filter(w=>w.status==='active').reduce((s,w)=>s+Number(demoPlans.find(p=>p.code===w.plan_code).price_monthly),0)),paid_revenue:String(paid.reduce((s,i)=>s+Number(i.amount)-Number(i.discount_amount),0)),open_tickets:tickets.filter(t=>t.status!=='resolved').length};
 const coupons=Array.from({length:15},(_,i)=>({code:`DAIRA${String(10+i*5)}`,percent_off:10+i%6*5,max_redemptions:100+i*60,redemptions:14+i*9,expires_at:future(100-i*3),active:i%5!==4}));
 const revenueHistory=Array.from({length:12},(_,i)=>({month:new Date(now-(11-i)*30*86400000).toISOString(),revenue:String(4800000+i*730000+(i%4)*390000)}));
 return {demo:true,totals,planDistribution,recent:spaces,tickets:tickets.slice(0,120),invoices:invoices.slice(0,130),coupons,announcements:demoAnnouncementList,planCatalog:demoPlans,revenueHistory};
};
