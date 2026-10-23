import {Router,json} from 'express';
import {rateLimit} from 'express-rate-limit';
import {ClientRateLimitKey,HealthReadRateLimit,AdminMutationRateLimit} from '../middleware/RateLimits';
import {HasDauntlessUnbrokenAdminApiKey} from '../middleware/HasDauntlessUnbrokenAdminApiKey';
import {GetUserInfoForApiKey} from '../controllers/unbrokenapi';
import {RefuseAdminKeyThroughProxy} from '../middleware/RequestOrigin';
import {SaveSupportReport,SupportReports,SupportReport,ReviewSupportReport,DeleteSupportReport} from '../controllers/supportreports';
export const supportReportsRouter=Router();
const uploadLimit=rateLimit({keyGenerator:ClientRateLimitKey,windowMs:10*60000,limit:3,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'rate_limited'}});
const globalLimit=rateLimit({keyGenerator:()=>'support-global',windowMs:3600000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'rate_limited'}});
supportReportsRouter.post('/SupportReport',uploadLimit,globalLimit,json({limit:'128kb'}),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 let identity;const key=req.headers['x-dauntless-unbroken-user-api-key'];
 if(typeof key==='string'&&key.length<=1024)identity=await GetUserInfoForApiKey(key);
 if(identity?.IsAdmin&&RefuseAdminKeyThroughProxy(req,res))return;
 try{res.status(201).json(SaveSupportReport(req.body?.id,req.body,identity,identity&&typeof key==='string'?key:undefined));}
 catch{res.status(400).json({error:'invalid_report'});}
});
supportReportsRouter.get('/SupportReports',HasDauntlessUnbrokenAdminApiKey,HealthReadRateLimit,(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.json(SupportReports(typeof req.query.q==='string'?req.query.q:''));
});
supportReportsRouter.get('/SupportReports/:id',HasDauntlessUnbrokenAdminApiKey,HealthReadRateLimit,(req,res)=>{
 res.setHeader('Cache-Control','no-store');const report=SupportReport(String(req.params.id));if(!report){res.status(404).json({error:'not_found'});return;}res.json(report);
});
supportReportsRouter.post('/SupportReports/:id/review',HasDauntlessUnbrokenAdminApiKey,AdminMutationRateLimit,(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.status(ReviewSupportReport(String(req.params.id))?200:404).json({ok:true});
});
supportReportsRouter.post('/SupportReports/:id/delete',HasDauntlessUnbrokenAdminApiKey,AdminMutationRateLimit,(req,res)=>{
 res.setHeader('Cache-Control','no-store');const removed=DeleteSupportReport(String(req.params.id));res.status(removed?200:404).json({ok:removed});
});
supportReportsRouter.use((error:any,_req:any,res:any,next:any)=>{if(error?.type==='entity.too.large'||error?.type==='entity.parse.failed'){res.status(error.type==='entity.too.large'?413:400).json({error:'invalid_report'});return;}next(error);});
