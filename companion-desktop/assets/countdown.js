function renderCountdown(c){
 const root=document.getElementById('countdown');root.hidden=!c?.visible;if(!c?.visible)return;
 document.querySelector('.hud-caption').textContent=c.phase==='launch'?'GAME STARTED':c.phase==='awareness'?'PLAYED TODAY':'TIME LEFT';
 root.dataset.phase=c.phase;root.classList.toggle('urgent',!!c.urgent);
 document.getElementById('hud-title').textContent=c.title;
 document.getElementById('hud-game').textContent=c.game;
 document.getElementById('hud-detail').textContent=c.detail;
 document.getElementById('hud-clock').textContent=c.clock;
 document.getElementById('hud-progress').style.width=Math.max(0,Math.min(100,c.seconds/Math.max(1,c.total)*100))+'%';
}
