/**
 * bg3d.js — Enhanced 3D Background
 * Layers: rotating icosahedron wireframe + particle network + depth fog
 */
(function () {
  const canvas = document.getElementById('bg3d');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, angleX = 0, angleY = 0, angleZ = 0;
  let particles = [], RAF;
  let mouse = { x: 0, y: 0 };

  /* ── Config ── */
  const CFG = {
    PARTICLE_COUNT : 90,
    MAX_LINK_DIST  : 190,
    FOCAL          : 550,
    DEPTH          : 350,
    SPEED_Y        : 0.0018,
    SPEED_X        : 0.0008,
    SPEED_Z        : 0.0004,
    COLORS         : ['#ff6b00', '#ffffff', '#ff8c38', '#cc4a00', '#ffaa5a', '#ff6b00'],
    GEO_SCALE      : 0,   // set after resize
    GEO_SPEED_Y    : 0.004,
    GEO_SPEED_X    : 0.002,
  };

  /* ════════════════════════════════════════════
     ICOSAHEDRON GEOMETRY (20-face polyhedron)
  ════════════════════════════════════════════ */
  const PHI = (1 + Math.sqrt(5)) / 2;
  const RAW_VERTS = [
    [-1,  PHI,  0], [ 1,  PHI,  0], [-1, -PHI,  0], [ 1, -PHI,  0],
    [ 0, -1,  PHI], [ 0,  1,  PHI], [ 0, -1, -PHI], [ 0,  1, -PHI],
    [ PHI,  0, -1], [ PHI,  0,  1], [-PHI,  0, -1], [-PHI,  0,  1],
  ];
  const EDGES = [
    [0,1],[0,5],[0,7],[0,10],[0,11],
    [1,5],[1,7],[1,8],[1,9],
    [2,3],[2,4],[2,6],[2,10],[2,11],
    [3,4],[3,6],[3,8],[3,9],
    [4,5],[4,9],[4,11],
    [5,9],[5,11],
    [6,7],[6,8],[6,10],
    [7,8],[7,10],
    [8,9],[10,11],
  ];

  // Normalize vertices to unit sphere
  function normalize(v) {
    const len = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return v.map(x => x/len);
  }
  const UNIT_VERTS = RAW_VERTS.map(normalize);

  let geoAngleY = 0, geoAngleX = 0, geoAngleZ = 0;

  /* ── Rotation helpers ── */
  function rx(p, a) { return [p[0], p[1]*Math.cos(a)-p[2]*Math.sin(a), p[1]*Math.sin(a)+p[2]*Math.cos(a)]; }
  function ry(p, a) { return [p[0]*Math.cos(a)+p[2]*Math.sin(a), p[1], -p[0]*Math.sin(a)+p[2]*Math.cos(a)]; }
  function rz(p, a) { return [p[0]*Math.cos(a)-p[1]*Math.sin(a), p[0]*Math.sin(a)+p[1]*Math.cos(a), p[2]]; }

  /* ── Perspective projection ── */
  function project(x, y, z) {
    const s = CFG.FOCAL / (CFG.FOCAL + z + CFG.DEPTH);
    return { sx: x*s + W/2, sy: y*s + H/2, scale: s };
  }

  /* ── Particles ── */
  function initParticles() {
    particles = [];
    const spread = Math.min(W, H) * 0.48;
    for (let i = 0; i < CFG.PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2*Math.random() - 1);
      const r     = spread * (0.3 + 0.7*Math.cbrt(Math.random()));
      particles.push({
        ox: r * Math.sin(phi) * Math.cos(theta),
        oy: r * Math.sin(phi) * Math.sin(theta),
        oz: r * Math.cos(phi),
        r:  1.5 + Math.random() * 3.5,
        color: CFG.COLORS[Math.floor(Math.random()*CFG.COLORS.length)],
        phase: Math.random() * Math.PI * 2,
        phaseSpd: 0.008 + Math.random() * 0.025,
      });
    }
  }

  /* ── Resize ── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    CFG.GEO_SCALE = Math.min(W, H) * 0.28;
    initParticles();
  }

  /* ════════════════
     DRAW LOOP
  ════════════════ */
  function draw() {
    ctx.clearRect(0, 0, W, H);

    /* ── Icosahedron wireframe ── */
    geoAngleY += CFG.GEO_SPEED_Y + mouse.x * 0.000015;
    geoAngleX += CFG.GEO_SPEED_X + mouse.y * 0.000008;
    geoAngleZ += CFG.GEO_SPEED_Z;

    const sc = CFG.GEO_SCALE;
    const geoVerts = UNIT_VERTS.map(v => {
      let p = rx(v, geoAngleX);
      p = ry(p, geoAngleY);
      p = rz(p, geoAngleZ);
      return project(p[0]*sc, p[1]*sc, p[2]*sc - CFG.DEPTH*0.15);
    });

    // Outer ring glow — orange
    const grdRing = ctx.createRadialGradient(W/2,H/2,sc*0.3,W/2,H/2,sc*1.4);
    grdRing.addColorStop(0,'rgba(255,107,0,0.06)');
    grdRing.addColorStop(0.5,'rgba(255,140,56,0.04)');
    grdRing.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = grdRing;
    ctx.fillRect(0,0,W,H);

    // Draw edges
    EDGES.forEach(([a, b]) => {
      const va = geoVerts[a], vb = geoVerts[b];
      const midZ = (UNIT_VERTS[a][2] + UNIT_VERTS[b][2]) / 2;
      const depthAlpha = 0.06 + 0.22 * ((midZ + 1) / 2);

      ctx.beginPath();
      ctx.moveTo(va.sx, va.sy);
      ctx.lineTo(vb.sx, vb.sy);

      // Gradient edge: orange → light-orange
      const grad = ctx.createLinearGradient(va.sx,va.sy,vb.sx,vb.sy);
      grad.addColorStop(0, `rgba(255,107,0,${depthAlpha.toFixed(3)})`);
      grad.addColorStop(1, `rgba(255,140,56,${depthAlpha.toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1 + va.scale * 0.5;
      ctx.stroke();
    });

    // Draw icosahedron vertex dots
    geoVerts.forEach((v, i) => {
      const z = UNIT_VERTS[i][2];
      const alpha = 0.15 + 0.5 * ((z + 1) / 2);
      const r = 2.5 * v.scale;

      ctx.beginPath(); ctx.arc(v.sx, v.sy, r*2.5, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,107,0,${(alpha*0.38).toFixed(3)})`; ctx.fill();

      ctx.beginPath(); ctx.arc(v.sx, v.sy, r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,220,180,${alpha.toFixed(3)})`; ctx.fill();
    });

    /* ── Particle network ── */
    angleY += CFG.SPEED_Y;
    angleX += CFG.SPEED_X;
    angleZ += CFG.SPEED_Z;

    const projected = particles.map(p => {
      p.phase += p.phaseSpd;
      let v = [p.ox, p.oy, p.oz];
      v = [v[0], v[1]*Math.cos(angleX)-v[2]*Math.sin(angleX), v[1]*Math.sin(angleX)+v[2]*Math.cos(angleX)];
      v = [v[0]*Math.cos(angleY)+v[2]*Math.sin(angleY), v[1], -v[0]*Math.sin(angleY)+v[2]*Math.cos(angleY)];
      // Mouse parallax shift
      const shift = CFG.FOCAL / (CFG.FOCAL + v[2] + CFG.DEPTH);
      const sx = v[0]*shift + W/2 + (mouse.x - W/2) * 0.018 * shift;
      const sy = v[1]*shift + H/2 + (mouse.y - H/2) * 0.012 * shift;
      const depth = (v[2] + CFG.DEPTH) / (CFG.DEPTH*2);
      return { sx, sy, z:v[2], r:p.r, color:p.color, phase:p.phase, scale:shift, depth };
    });

    projected.sort((a,b) => a.z - b.z);

    // Links
    for (let i = 0; i < projected.length; i++) {
      for (let j = i+1; j < projected.length; j++) {
        const a = projected[i], b = projected[j];
        const dx = a.sx-b.sx, dy = a.sy-b.sy;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < CFG.MAX_LINK_DIST) {
          const alpha = (1 - dist/CFG.MAX_LINK_DIST) * 0.28 * Math.min(a.scale, b.scale);
          ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy);
          const lg = ctx.createLinearGradient(a.sx,a.sy,b.sx,b.sy);
          lg.addColorStop(0, a.color + Math.round(alpha*255).toString(16).padStart(2,'0'));
          lg.addColorStop(1, b.color + Math.round(alpha*255).toString(16).padStart(2,'0'));
          ctx.strokeStyle = lg; ctx.lineWidth = 0.9; ctx.stroke();
        }
      }
    }

    // Nodes
    projected.forEach(n => {
      const pulse = 1 + 0.25*Math.sin(n.phase);
      const radius = n.r * n.scale * pulse * 2.8;
      const alpha  = Math.max(0.1, Math.min(0.9, n.scale * 0.95));

      // Outer glow
      const g = ctx.createRadialGradient(n.sx,n.sy,0,n.sx,n.sy,radius*2.8);
      g.addColorStop(0, n.color + Math.round(alpha*0.5*255).toString(16).padStart(2,'0'));
      g.addColorStop(1, n.color+'00');
      ctx.beginPath(); ctx.arc(n.sx,n.sy,radius*2.8,0,Math.PI*2);
      ctx.fillStyle=g; ctx.fill();

      // Core
      ctx.beginPath(); ctx.arc(n.sx,n.sy,radius,0,Math.PI*2);
      ctx.fillStyle = n.color + Math.round(alpha*255).toString(16).padStart(2,'0');
      ctx.fill();

      // Specular highlight
      ctx.beginPath(); ctx.arc(n.sx-radius*0.3, n.sy-radius*0.3, radius*0.35, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${(alpha*0.4).toFixed(3)})`; ctx.fill();
    });

    /* ── Depth fog overlay (bottom-edge vignette) ── */
    const fogGrd = ctx.createLinearGradient(0, H*0.7, 0, H);
    const bgClr = document.documentElement.getAttribute('data-theme') === 'light' ? '255,255,255' : '13,13,13';
    fogGrd.addColorStop(0, `rgba(${bgClr},0)`);
    fogGrd.addColorStop(1, `rgba(${bgClr},0.55)`);
    ctx.fillStyle = fogGrd; ctx.fillRect(0, H*0.7, W, H*0.3);

    RAF = requestAnimationFrame(draw);
  }

  /* ── Mouse tracking (smooth) ── */
  window.addEventListener('mousemove', e => {
    mouse.x += (e.clientX - mouse.x) * 0.06;
    mouse.y += (e.clientY - mouse.y) * 0.06;
  });

  window.addEventListener('resize', () => { resize(); });

  resize();
  draw();
})();
