import assert from "node:assert/strict";
import { TwitchClipManager } from "../dist/twitch/clips.js";

let now=1_000_000, count=0, created=0, enabled=true, scope=true, live=true, status=202;
const calls=[];
const fetcher=async(input,init={})=>{const url=new URL(String(input));calls.push({url,init});if(url.pathname.endsWith("/streams"))return new Response(JSON.stringify({data:live?[{id:"stream-1"}]:[]}),{status:200});if(url.pathname.endsWith("/clips"))return new Response(JSON.stringify({data:[{id:"clip-1",edit_url:"https://clips.twitch.tv/clip-1/edit"}]}),{status});throw new Error("unexpected fake endpoint");};
const manager=new TwitchClipManager({clientId:"fake-client",broadcasterId:()=>"broadcaster-1",getAccessToken:async()=>"fake-token",hasClipScope:()=>scope,enabled:()=>enabled,sessionCount:()=>count,sessionCap:()=>2,cooldownSeconds:()=>120,onCreated:()=>{created++;count++;},fetcher,now:()=>now});
assert.deepEqual(await manager.getLiveStatus(),{live:true,status:"live"});assert.equal(calls[0].url.searchParams.get("user_id"),"broadcaster-1");
const first=await manager.createClip();assert.equal(first.ok,true);assert.equal(created,1);assert.equal(calls[2].url.searchParams.get("broadcaster_id"),"broadcaster-1");assert.equal(calls[2].init.method,"POST");assert.equal(calls[2].init.headers.authorization,"Bearer fake-token");
assert.equal((await manager.createClip()).code,"CLIP_COOLDOWN");now+=120_001;count=2;assert.equal((await manager.createClip()).code,"CLIP_SESSION_CAP");count=0;live=false;assert.equal((await manager.createClip()).code,"CLIP_NOT_LIVE");live=true;now+=120_001;scope=false;assert.equal((await manager.createClip()).code,"CLIP_SCOPE_MISSING");scope=true;now+=120_001;status=429;assert.equal((await manager.createClip()).code,"CLIP_RATE_LIMIT");enabled=false;assert.equal((await manager.createClip()).code,"CLIP_DISABLED");
console.log("PASS fake Twitch endpoints verify stream status, authenticated clip creation, scope/live gates, global cooldown, session cap, and rate-limit handling.");
