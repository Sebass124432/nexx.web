(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = innerWidth;
  let H = canvas.height = innerHeight;

  // UI
  const healthEl = document.getElementById('health');
  const weaponEl = document.getElementById('weapon');
  const startBtn = document.getElementById('startBtn');
  const overlay = document.getElementById('overlay');
  const message = document.getElementById('message');
  const restart = document.getElementById('restart');

  window.addEventListener('resize', ()=>{ W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

  // Player
  const player = {
    x: W/2, y: H/2, r: 14, speed: 220, vx:0, vy:0, health: 100, moving:false
  };

  // weapons
  const weapons = {
    ak: {name:'AK', fireRate:0.12, damage:12, bulletSpeed:800, spread:0.06, auto:true},
    franco: {name:'FRANCO', fireRate:0.9, damage:120, bulletSpeed:1400, spread:0.002, auto:false},
    escopeta: {name:'ESCOPETA', fireRate:0.9, damage:18, bullets:8, spread:0.8, bulletSpeed:900, auto:false}
  };
  let currentWeapon = weapons.ak;
  weaponEl.textContent = 'Arma: ' + currentWeapon.name;

  // bullets and enemies
  const bullets = [];
  const enemies = [];

  let keys = {};
  let mouse = {x:W/2,y:H/2,down:false};

  // controls
  addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if(e.key === '1') selectWeapon('franco'); if(e.key === '2') selectWeapon('ak'); if(e.key === '3') selectWeapon('escopeta'); });
  addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('mousemove', e=>{ const r=canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener('mousedown', e=>{ mouse.down = true; });
  canvas.addEventListener('mouseup', e=>{ mouse.down = false; });

  function selectWeapon(k){ currentWeapon = weapons[k]; weaponEl.textContent = 'Arma: ' + currentWeapon.name; }

  // shooting
  let lastShot = 0;
  function playerShoot(t){
    if(t - lastShot < currentWeapon.fireRate) return;
    lastShot = t;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    if(currentWeapon === weapons.escopeta){
      for(let i=0;i<currentWeapon.bullets;i++){
        const spread = (Math.random()-0.5) * currentWeapon.spread;
        const a = ang + spread;
        bullets.push({x:player.x, y:player.y, vx:Math.cos(a)*currentWeapon.bulletSpeed, vy:Math.sin(a)*currentWeapon.bulletSpeed, damage:currentWeapon.damage, owner:'player', life:2});
      }
    } else {
      const spread = (Math.random()-0.5) * (currentWeapon.spread||0);
      const a = ang + spread;
      bullets.push({x:player.x, y:player.y, vx:Math.cos(a)*currentWeapon.bulletSpeed, vy:Math.sin(a)*currentWeapon.bulletSpeed, damage:currentWeapon.damage, owner:'player', life:4});
    }
  }

  // enemy spawn
  function spawnEnemy(){
    const side = Math.floor(Math.random()*4);
    let x=0,y=0;
    if(side===0){ x = Math.random()*W; y = -40; }
    if(side===1){ x = Math.random()*W; y = H+40; }
    if(side===2){ x = -40; y = Math.random()*H; }
    if(side===3){ x = W+40; y = Math.random()*H; }
    enemies.push({x,y,r:12,health:60,speed:80+Math.random()*40, lastShot:0, shootInterval:1.1 - Math.random()*0.6});
  }
  for(let i=0;i<4;i++) spawnEnemy();

  // enemy behavior: move toward player; if player moving, they shoot
  function enemyUpdate(enemy, dt, t){
    const dx = player.x - enemy.x; const dy = player.y - enemy.y; const dist = Math.hypot(dx,dy);
    const nx = dx/dist, ny = dy/dist;
    enemy.x += nx * enemy.speed * dt;
    enemy.y += ny * enemy.speed * dt;
    // shoot only when player is moving
    if(player.moving && dist < 700){
      if(t - enemy.lastShot > enemy.shootInterval){ enemy.lastShot = t; // fire towards player
        const a = Math.atan2(dy,dx); bullets.push({x: enemy.x, y: enemy.y, vx: Math.cos(a)*420, vy: Math.sin(a)*420, damage:14, owner:'enemy', life:4});
      }
    }
  }

  // update loop
  let last = performance.now();
  let gameRunning = false;
  function loop(ts){
    const dt = (ts - last)/1000; last = ts;
    if(gameRunning){
      update(dt, ts/1000);
      render();
    }
    requestAnimationFrame(loop);
  }

  function update(dt, t){
    // player movement
    let mvx=0, mvy=0;
    if(keys['w']) mvy -= 1; if(keys['s']) mvy +=1; if(keys['a']) mvx -=1; if(keys['d']) mvx +=1;
    const len = Math.hypot(mvx,mvy);
    if(len>0){ player.vx = (mvx/len)*player.speed; player.vy = (mvy/len)*player.speed; player.moving = true; }
    else { player.vx = 0; player.vy = 0; player.moving = false; }
    player.x += player.vx * dt; player.y += player.vy * dt;
    // bounds
    player.x = Math.max(20, Math.min(W-20, player.x)); player.y = Math.max(20, Math.min(H-20, player.y));

    // shooting
    if(mouse.down){ if(currentWeapon.auto) playerShoot(t); else { if(lastShot===0 || (t - lastShot) > currentWeapon.fireRate) playerShoot(t); } }

    // update bullets
    for(let i=bullets.length-1;i>=0;i--){ const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if(b.life<=0 || b.x<-50 || b.x>W+50 || b.y<-50 || b.y>H+50) bullets.splice(i,1); }

    // enemies
    for(let i=enemies.length-1;i>=0;i--){ const e = enemies[i]; enemyUpdate(e, dt, t); if(e.health<=0){ enemies.splice(i,1); spawnEnemy(); } }

    // collisions bullets->enemies
    for(let i=bullets.length-1;i>=0;i--){ const b=bullets[i]; if(b.owner==='player'){ for(let j=enemies.length-1;j>=0;j--){ const e=enemies[j]; const d=Math.hypot(e.x-b.x,e.y-b.y); if(d < e.r+3){ e.health -= b.damage; bullets.splice(i,1); break; } } } else { // enemy bullet -> player
        const d = Math.hypot(player.x-b.x, player.y-b.y); if(d < player.r+3){ player.health -= b.damage; bullets.splice(i,1); if(player.health<=0){ endGame(); } break; } }
    }

    healthEl.textContent = 'Salud: ' + Math.max(0, Math.round(player.health));
    // spawn occasionally
    if(Math.random() < 0.01) spawnEnemy();
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    // background subtle
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0,0,W,H);
    // player
    ctx.save(); ctx.translate(player.x, player.y);
    // body
    ctx.fillStyle = '#9be7ff'; ctx.beginPath(); ctx.arc(0,0,player.r,0,Math.PI*2); ctx.fill();
    // gun direction
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    ctx.rotate(ang);
    ctx.fillStyle = '#222'; ctx.fillRect(10,-6,18,12);
    ctx.restore();

    // enemies
    enemies.forEach(e=>{
      ctx.beginPath(); ctx.fillStyle = '#ff9b9b'; ctx.arc(e.x, e.y, e.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = '10px sans-serif'; ctx.fillText(Math.max(0,Math.round(e.health)), e.x - 10, e.y - e.r - 6);
    });

    // bullets
    bullets.forEach(b=>{
      ctx.beginPath(); ctx.fillStyle = b.owner==='player' ? '#fff' : '#ffef9b'; ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    });

    // HUD weapon
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(12,H-64,180,44);
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText('Arma: ' + currentWeapon.name, 20, H-40);
  }

  function endGame(){ gameRunning = false; message.textContent = 'Game Over'; overlay.classList.remove('hidden'); }

  // start/restart
  startBtn.addEventListener('click', ()=>{ overlay.classList.add('hidden'); startBtn.classList.add('hidden'); gameRunning = true; last = performance.now(); });
  restart.addEventListener('click', ()=>{ location.reload(); });

  // expose simple API for testing
  window._shooter = { player, enemies, bullets, spawnEnemy };

  requestAnimationFrame(loop);
})();
