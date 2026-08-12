// FPS minimal con Three.js: mapa con casas, 3 armas y bots simples
(function(){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);

  const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
  camera.position.y = 1.7;

  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(innerWidth, innerHeight);
  // Mejor rendimiento: desactivar sombras por defecto (puedes activar en equipos potentes)
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 0.6); scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(100,200,100); dir.castShadow=false; scene.add(dir);

  // ground
  const groundGeo = new THREE.PlaneGeometry(2000,2000); const groundMat = new THREE.MeshStandardMaterial({color:0x222226});
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI/2; ground.receiveShadow=true; scene.add(ground);

  // pointer lock controls
  const controls = new THREE.PointerLockControls(camera, renderer.domElement);
  const blocker = document.getElementById('blocker'); const instructions = document.getElementById('instructions');
  instructions.addEventListener('click', ()=>{ controls.lock(); });
  controls.addEventListener('lock', ()=>{ blocker.style.display='none'; });
  controls.addEventListener('unlock', ()=>{ blocker.style.display='flex'; });
  scene.add(controls.getObject());

  // player state
  const player = { velocity: new THREE.Vector3(), speed: 6.5, health:100 };

  const keys = {};
  addEventListener('keydown', e=>{ keys[e.code]=true; if(e.code==='Digit1') selectWeapon('franco'); if(e.code==='Digit2') selectWeapon('ak'); if(e.code==='Digit3') selectWeapon('escopeta'); });
  addEventListener('keyup', e=>{ keys[e.code]=false; });

  // weapons
  const weapons = {
    ak: {name:'AK', rate:0.09, damage:12, spread:0.04, auto:true},
    franco:{name:'FRANCO', rate:0.9, damage:120, spread:0.001, auto:false},
    escopeta:{name:'ESCOPETA', rate:0.9, damage:20, pellets:8, spread:0.6, auto:false}
  };
  let curWeap = weapons.ak;
  document.getElementById('wep').textContent = 'Arma: '+curWeap.name;

  function selectWeapon(k){ curWeap = weapons[k]; document.getElementById('wep').textContent = 'Arma: '+curWeap.name; }

  // map: many houses (usamos InstancedMesh para reducir draw calls)
  const houseMat = new THREE.MeshStandardMaterial({color:0x33333a, metalness:0.05, roughness:0.9});
  const roofMat = new THREE.MeshStandardMaterial({color:0x2b2b2b, metalness:0.02, roughness:0.9});
  const houseBaseGeo = new THREE.BoxGeometry(1,1,1);
  const roofGeo = new THREE.BoxGeometry(1,0.6,1);
  const instanceMatrices = [];
  const instanceRoofMatrices = [];
  const grid = 30; const spacing = 12;
  for(let i=-grid;i<=grid;i++){
    for(let j=-grid;j<=grid;j++){
      if(Math.random() < 0.18){
        const w = 4 + Math.random()*8; const d = 4 + Math.random()*8; const h = 3 + Math.random()*6;
        const mx = new THREE.Matrix4(); mx.compose(new THREE.Vector3(i*spacing + (Math.random()-0.5)*3, h/2, j*spacing + (Math.random()-0.5)*3), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
        instanceMatrices.push(mx);
        const rm = new THREE.Matrix4(); rm.compose(new THREE.Vector3(mx.elements[12], h+0.3, mx.elements[14]), new THREE.Quaternion(), new THREE.Vector3(w+0.5, 0.6, d+0.5));
        instanceRoofMatrices.push(rm);
      }
    }
  }
  const houseCount = instanceMatrices.length;
  const houseInst = new THREE.InstancedMesh(houseBaseGeo, houseMat, houseCount);
  for(let k=0;k<houseCount;k++) houseInst.setMatrixAt(k, instanceMatrices[k]);
  houseInst.instanceMatrix.needsUpdate = true;
  scene.add(houseInst);
  const roofInst = new THREE.InstancedMesh(roofGeo, roofMat, houseCount);
  for(let k=0;k<houseCount;k++) roofInst.setMatrixAt(k, instanceRoofMatrices[k]);
  roofInst.instanceMatrix.needsUpdate = true;
  scene.add(roofInst);

  // enemies
  // enemy pool (reutilizamos mallas para reducir GC y overhead)
  const enemies = [];
  const enemyGeo = new THREE.SphereGeometry(0.7, 6, 6); // menos segmentos para rendimiento
  const enemyMat = new THREE.MeshStandardMaterial({color:0xff6b6b});
  const maxEnemies = 24;
  for(let i=0;i<maxEnemies;i++){
    const m = new THREE.Mesh(enemyGeo, enemyMat);
    m.position.set(0,-20,0); m.visible = false; m.health = 0; m.speed = 0; scene.add(m); enemies.push(m);
  }
  function spawnEnemy(){
    for(let i=0;i<enemies.length;i++){
      const e = enemies[i]; if(e.visible) continue;
      e.position.set((Math.random()-0.5)*500, 0.7, (Math.random()-0.5)*500);
      e.health = 80; e.speed = 1.2 + Math.random()*1.6; e.visible = true; return e;
    }
    return null; // pool exhausted
  }
  for(let i=0;i<12;i++) spawnEnemy();

  // bullets handled as instantaneous raycasts (hitscan) and visual tracers
  // tracer pool para líneas de disparo (reutilizables)
  const tracerPool = [];
  const maxTracers = 36;
  for(let i=0;i<maxTracers;i++){
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(6); geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({color:0xffffee, linewidth:1});
    const line = new THREE.Line(geom, mat); line.visible = false; scene.add(line); tracerPool.push({mesh:line, life:0});
  }
  let tracerIndex = 0;

  let lastShot = 0;
  let mouseDown = false;
  addEventListener('mousedown', ()=>{ mouseDown=true; shoot(); });
  addEventListener('mouseup', ()=>{ mouseDown=false; });

  function shoot(){ const now = performance.now()/1000; if(now - lastShot < curWeap.rate) return; lastShot = now;
    const origin = controls.getObject().position.clone(); origin.y += 0.1;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    if(curWeap === weapons.escopeta){ for(let i=0;i<curWeap.pellets;i++){ const d = dir.clone(); d.x += (Math.random()-0.5)*curWeap.spread; d.y += (Math.random()-0.5)*curWeap.spread; d.z += (Math.random()-0.5)*curWeap.spread; fireRay(origin,d,curWeap.damage); } }
    else { const d = dir.clone(); d.x += (Math.random()-0.5)*curWeap.spread; d.y += (Math.random()-0.5)*curWeap.spread; d.z += (Math.random()-0.5)*curWeap.spread; fireRay(origin,d,curWeap.damage); }
  }

  function fireRay(origin, dir, damage){ const ray = new THREE.Raycaster(origin, dir.normalize(), 0, 1200);
    // check enemies (only visible ones)
    const hits = ray.intersectObjects(enemies, false);
    if(hits.length>0){ const hit = hits[0]; const obj = hit.object; if(obj.visible){ obj.health -= damage; if(obj.health<=0){ obj.visible = false; spawnEnemy(); } } }
    // tracer (reuse from pool)
    const t = tracerPool[tracerIndex]; tracerIndex = (tracerIndex+1) % maxTracers;
    const p0 = origin; const p1 = origin.clone().add(dir.clone().multiplyScalar(60));
    const arr = t.mesh.geometry.attributes.position.array; arr[0]=p0.x; arr[1]=p0.y; arr[2]=p0.z; arr[3]=p1.x; arr[4]=p1.y; arr[5]=p1.z; t.mesh.geometry.attributes.position.needsUpdate = true;
    t.mesh.visible = true; t.life = 0.06;
  }

  // enemy behavior
  function updateEnemies(dt){
    const ppos = controls.getObject().position;
    for(let i=0;i<enemies.length;i++){
      const e = enemies[i]; if(!e.visible) continue;
      const dx = ppos.x - e.position.x; const dz = ppos.z - e.position.z; const dist = Math.hypot(dx,dz) || 1;
      e.position.x += (dx/dist) * e.speed * dt * 15; e.position.z += (dz/dist) * e.speed * dt * 15;
      if(dist < 40 && (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD'])){
        if(Math.random() < 0.008) { const dir = new THREE.Vector3(); dir.copy(controls.getObject().position).sub(e.position).normalize(); fireRay(e.position.clone().add(new THREE.Vector3(0,0.5,0)), dir, 8); }
      }
    }
  }

  // HUD update
  function updateHUD(){ document.getElementById('hp').textContent = 'Salud: '+Math.max(0,Math.floor(player.health)); }

  // game loop
  let prev = performance.now(); function animate(){ const now = performance.now(); const dt = (now - prev)/1000; prev = now;
    // movement
    if(controls.isLocked===true){ const dir = new THREE.Vector3(); const forward = (keys['KeyW']?1:0)-(keys['KeyS']?1:0); const right = (keys['KeyD']?1:0)-(keys['KeyA']?1:0);
      if(forward||right){ dir.set(right,0,forward).normalize(); const speed = player.speed; const angle = camera.rotation.y; const vx = dir.x * speed; const vz = dir.z * speed; controls.getObject().position.x += (vx * dt * 35); controls.getObject().position.z += (vz * dt * 35); player.moving=true; }
      else player.moving=false;
      // shooting auto
      if(mouseDown && curWeap.auto) shoot();
      // allow semi-auto presses
    }
    // update tracers pool
    for(let i=0;i<tracerPool.length;i++){ const t = tracerPool[i]; if(t.mesh.visible){ t.life -= dt; if(t.life<=0){ t.mesh.visible = false; } } }

    updateEnemies(dt);
    updateHUD();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // basic damage from enemy tracers: check recent tracers
  setInterval(()=>{
    tracers.forEach(tr=>{
      // sample midpoint
      const p1 = tr.mesh.geometry.attributes.position.array.slice(0,3); const p2 = tr.mesh.geometry.attributes.position.array.slice(3,6);
      const mx = (p1[0]+p2[0])/2, my = (p1[1]+p2[1])/2, mz = (p1[2]+p2[2])/2;
      const pd = controls.getObject().position; const d = Math.hypot(pd.x-mx, pd.y-my, pd.z-mz);
      if(d < 1.2){ player.health -= 6; if(player.health<=0){ document.getElementById('blocker').style.display='flex'; document.getElementById('instructions').innerHTML='<h2>Has muerto</h2><p>Refresca para reiniciar</p>'; } }
    });
  }, 120);

  // resize
  addEventListener('resize', ()=>{ camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  // allow clicking on HUD to spawn more enemies for testing
  document.getElementById('info').addEventListener('click', ()=>{ for(let i=0;i<4;i++) spawnEnemy(); });

})();
