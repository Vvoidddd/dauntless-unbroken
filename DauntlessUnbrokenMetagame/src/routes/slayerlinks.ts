import {Router} from "express";
import {HasDauntlessUnbrokenMetagameAuth} from "../middleware/HasDauntlessUnbrokenMetagameAuth";
import {PlayerTokenOnly} from "../middleware/PlayerAuth";
import {SlayerLinks} from "../features";
import {AnswerSlayerLinkInvite,DeleteSlayerLink,DeleteSlayerLinkInvites,InviteToSlayerLink,ListSlayerLinkInvites,ListSlayerLinks,SlayerLinkAvailability,SlayerLinkReply,SlayerLinkStatus} from "../controllers/slayerlinks";
import {DeleteLinkEntries,StoreLinkPools,GetLinkRewards,SlayerLinkError} from "../controllers/slayerlinklifecycle";

export const slayerLinksRouter=Router();
function SlayerLinksOn(req:any,res:any,next:any){next(SlayerLinks()?undefined:"route");}
function Send(res:any,reply:SlayerLinkReply){res.status(reply.Status).json(reply.Body);}
function LinkReply(res:any,action:()=>unknown){
    try{res.json({code:null,message:"OK",payload:action()});}
    catch(error){if(error instanceof SlayerLinkError)res.status(error.status).json({code:String(error.status),message:error.message,payload:null});else throw error;}
}
slayerLinksRouter.get("/slayerlink/status_good",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,SlayerLinkStatus(req.AuthData.userId)));
slayerLinksRouter.get("/slayerlink/invites",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,ListSlayerLinkInvites(req.AuthData.userId)));
slayerLinksRouter.get("/slayerlink/links",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,ListSlayerLinks(req.AuthData.userId)));
slayerLinksRouter.put("/slayerlink/invite",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>
    Send(res,req.body?.action!==undefined?AnswerSlayerLinkInvite(req.AuthData.userId,req.body):InviteToSlayerLink(req.AuthData.userId,req.body)));
slayerLinksRouter.post("/slayerlink/invite",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,AnswerSlayerLinkInvite(req.AuthData.userId,req.body)));
slayerLinksRouter.delete("/slayerlink/invites/:accountId",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,DeleteSlayerLinkInvites(req.AuthData.userId,req.params.accountId)));
// Native deletion is a batch; a primitive social-panel request remains player-only.
slayerLinksRouter.delete("/slayerlink/links",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,(req:any,res,next)=>{
    if(!Array.isArray(req.body?.links)){next("route");return;}
    LinkReply(res,()=>DeleteLinkEntries(req.AuthData,req.body.links));
});
slayerLinksRouter.delete("/slayerlink/links",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,DeleteSlayerLink(req.AuthData.userId,req.body,req.query)));
slayerLinksRouter.post("/slayerlink/availability",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,PlayerTokenOnly,(req:any,res)=>Send(res,SlayerLinkAvailability(req.AuthData.userId,req.body)));
slayerLinksRouter.put("/slayerlink/links/rewards",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,(req:any,res)=>LinkReply(res,()=>StoreLinkPools(req.AuthData,req.body)));
slayerLinksRouter.get("/slayerlink/links/rewards/:accountId/:slot",SlayerLinksOn,HasDauntlessUnbrokenMetagameAuth,(req:any,res)=>LinkReply(res,()=>GetLinkRewards(req.AuthData,req.params.accountId,Number(req.params.slot))));
