export default {
  meta: { title: "Chat Runner", description: "Jump with !jump; moderators can tune the runner safely.", width: 480, height: 280, x: 0, y: 0, anchor: "center" },
  mount(api) {
    const palettes={night:"#182033",purple:"#302044",forest:"#173b35",sunset:"#482a31"};
    const speeds={slow:1800,normal:1200,fast:800};
    const obstacleTypes=["spike","crate","rock"];
    const saved=api.storage.get("chat-runner")||{};
    const savedConfig=saved.config&&typeof saved.config==="object"?saved.config:{};
    const config={background:palettes[savedConfig.background]?savedConfig.background:"night",speed:speeds[savedConfig.speed]?savedConfig.speed:"normal",obstacles:Array.isArray(savedConfig.obstacles)?savedConfig.obstacles.filter((type)=>obstacleTypes.includes(type)).slice(0,3):["spike","crate"],nightMode:savedConfig.nightMode!==false};
    const scores={};
    if(saved.scores&&typeof saved.scores==="object")for(const [player,score]of Object.entries(saved.scores))if(/^Player [a-f0-9]{5}$/u.test(player)&&Number.isInteger(score)&&score>=0&&score<100000)scores[player]=score;
    const cooldowns=new Map();const limits=new Map();let step=0;let jumping=false;
    const title=document.createElement("h2");title.textContent="🏃 Chat Runner";
    const lane=document.createElement("div");lane.className="runner-lane";
    const player=document.createElement("span");player.className="runner-player";player.textContent="🏃";
    const obstacle=document.createElement("span");obstacle.className="runner-obstacle";
    lane.append(player,obstacle);
    const scoreLine=document.createElement("p");
    const ticker=document.createElement("p");ticker.className="runner-ticker";ticker.textContent="Chat: !jump";
    const board=document.createElement("ol");board.className="runner-leaderboard";
    const hint=document.createElement("p");hint.className="runner-hint";hint.textContent="Mods: !runner bg <night|purple|forest|sunset> · speed <slow|normal|fast> · obstacle <add|remove> <spike|crate|rock> · night <on|off>";
    api.root.append(title,lane,scoreLine,ticker,board,hint);
    const persist=()=>api.storage.set("chat-runner",{config:{...config,obstacles:[...config.obstacles]},scores});
    const draw=()=>{
      lane.style.backgroundColor=palettes[config.background];lane.classList.toggle("night",config.nightMode);
      lane.style.setProperty("--runner-speed",`${speeds[config.speed]}ms`);
      obstacle.textContent=config.obstacles.length?({spike:"🔺",crate:"📦",rock:"🪨"}[config.obstacles[step%config.obstacles.length]]):"";
      obstacle.style.transform=`translateX(${(step%4)*18}px)`;
      const ordered=Object.entries(scores).sort((a,b)=>b[1]-a[1]).slice(0,5);
      scoreLine.textContent=`Speed ${config.speed} · Score ${Object.values(scores).reduce((sum,value)=>sum+value,0)}`;
      board.replaceChildren();for(const [name,score]of ordered){const row=document.createElement("li");row.textContent=`${name} · ${score}`;board.append(row);}
    };
    let lastStep=Date.now();const tick=()=>{const now=Date.now();if(now-lastStep<speeds[config.speed])return;lastStep=now;step++;if(!jumping)lane.dataset.motion=String(step%2);draw();};
    const tickId=api.timers.setInterval(tick,200);
    api.on("chat",(event)=>{
      const message=String(event.message||"").trim().toLowerCase();const playerName=/^Player [a-f0-9]{5}$/u.test(String(event.user||""))?String(event.user):"Chat player";
      if(message==="!jump"){
        const now=Date.now();const last=cooldowns.get(playerName)||0;const actions=limits.get(playerName)||[];const recent=actions.filter((time)=>now-time<60000);
        if(now-last<1200||recent.length>=20)return;
        if(!limits.has(playerName)&&limits.size>=1000){const oldest=limits.keys().next().value;limits.delete(oldest);cooldowns.delete(oldest);}
        cooldowns.set(playerName,now);limits.set(playerName,[...recent,now]);scores[playerName]=Math.min(99999,(scores[playerName]||0)+10);const topPlayers=Object.entries(scores).sort((a,b)=>b[1]-a[1]).slice(0,50);for(const player of Object.keys(scores))if(!topPlayers.some(([name])=>name===player))delete scores[player];jumping=true;player.classList.add("jump");api.timers.setTimeout(()=>{jumping=false;player.classList.remove("jump");},Math.max(300,Math.floor(speeds[config.speed]/2)));persist();draw();return;
      }
      if(event.isMod!==true)return;
      let accepted="";let match=/^!runner\s+bg\s+(night|purple|forest|sunset)$/u.exec(message);if(match){config.background=match[1];accepted=`background ${match[1]}`;}
      match=/^!runner\s+speed\s+(slow|normal|fast)$/u.exec(message);if(match){config.speed=match[1];accepted=`speed ${match[1]}`;}
      match=/^!runner\s+obstacle\s+(add|remove)\s+(spike|crate|rock)$/u.exec(message);if(match){const [,_action,type]=match;if(_action==="add"&&!config.obstacles.includes(type)&&config.obstacles.length<3){config.obstacles.push(type);accepted=`obstacle add ${type}`;}if(_action==="remove"&&config.obstacles.includes(type)){config.obstacles=config.obstacles.filter((item)=>item!==type);accepted=`obstacle remove ${type}`;}}
      match=/^!runner\s+night\s+(on|off)$/u.exec(message);if(match){config.nightMode=match[1]==="on";accepted=`night ${match[1]}`;}
      if(accepted){ticker.textContent=`mod: ${accepted} - by ${playerName}`;persist();draw();}
    });
    api.on("follow",()=>{ticker.textContent="New runner joined the stream!";});
    api.root.dataset.timer=String(tickId);
    draw();
  },
};
