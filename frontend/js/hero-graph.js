/**
 * hero-graph.js — 3D Parallax Graph Coloring Animation
 * Placed ONLY in the hero section of the home page.
 *
 * Features:
 *   • 22-node graph rendered on canvas behind the hero title
 *   • Greedy graph coloring revealed node-by-node in BFS order
 *   • Orange / White / Light-orange colour classes (matches brand)
 *   • Per-depth parallax layer on mouse movement
 *   • Soft floating motion + glow pulses
 *   • Seamless reset loop
 */
(function () {
  const canvas = document.getElementById('hero-graph');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H;
  let time = 0;
  let coloringIdx = 0;
  let coloringQueue = [];
  let resetClock = 0;

  // Smooth mouse target
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  // The 3 brand colours used as graph "colours"
  const PALETTE = ['#ff6b00', '#ffffff', '#ff8c38'];

  const NODE_COUNT = 22;
  let nodes = [];
  let edges = [];

  /* ── Resize + rebuild ─────────────────────────── */
  function resize() {
    const hero = canvas.parentElement;
    W = canvas.width  = hero.offsetWidth;
    H = canvas.height = hero.offsetHeight;
    buildGraph();
  }

  /* ── Build random planar-ish graph ───────────── */
  function buildGraph() {
    nodes = [];
    edges = [];
    coloringIdx = 0;
    resetClock   = 0;
    time         = 0;

    for (let i = 0; i < NODE_COUNT; i++) {
      // Three depth layers for parallax
      const depth = [0.28, 0.58, 1.0][i % 3];

      // Organic scatter around center with some structure
      const angle = (i / NODE_COUNT) * Math.PI * 2 + Math.random() * 0.6;
      const rx = W * (0.18 + Math.random() * 0.28);
      const ry = H * (0.16 + Math.random() * 0.24);

      nodes.push({
        x: W * 0.5 + Math.cos(angle) * rx + (Math.random() - 0.5) * W * 0.10,
        y: H * 0.5 + Math.sin(angle) * ry + (Math.random() - 0.5) * H * 0.10,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r:  3.5 + Math.random() * 7,
        depth,
        color:       -1,   // uncoloured
        targetColor: 0,
        alpha:        0,   // fades in when colored
        phase:       Math.random() * Math.PI * 2,
        phaseSpeed:  0.012 + Math.random() * 0.016,
      });
    }

    // Spanning tree → connected graph
    const visited = new Set([0]);
    while (visited.size < NODE_COUNT) {
      const from = [...visited][Math.floor(Math.random() * visited.size)];
      let to;
      do { to = Math.floor(Math.random() * NODE_COUNT); } while (visited.has(to));
      edges.push([from, to]);
      visited.add(to);
    }

    // Extra random edges (~0.6 × N)
    const extra = Math.round(NODE_COUNT * 0.6);
    for (let e = 0; e < extra; e++) {
      const a = Math.floor(Math.random() * NODE_COUNT);
      const b = Math.floor(Math.random() * NODE_COUNT);
      if (a !== b && !edges.some(([x, y]) =>
          (x === a && y === b) || (x === b && y === a))) {
        edges.push([a, b]);
      }
    }

    greedyColor();
    buildBFSOrder();
  }

  /* ── Greedy graph colouring ──────────────────── */
  function greedyColor() {
    const col = new Array(NODE_COUNT).fill(-1);
    for (let i = 0; i < NODE_COUNT; i++) {
      const used = new Set();
      edges.forEach(([a, b]) => {
        if (a === i && col[b] >= 0) used.add(col[b]);
        if (b === i && col[a] >= 0) used.add(col[a]);
      });
      let c = 0;
      while (used.has(c)) c++;
      col[i] = c % PALETTE.length;
    }
    col.forEach((c, i) => { nodes[i].targetColor = c; });
  }

  /* ── BFS reveal order ────────────────────────── */
  function buildBFSOrder() {
    const seen = new Set([0]);
    const q = [0];
    coloringQueue = [];
    while (q.length) {
      const n = q.shift();
      coloringQueue.push(n);
      edges.forEach(([a, b]) => {
        const nb = a === n ? b : b === n ? a : -1;
        if (nb !== -1 && !seen.has(nb)) { seen.add(nb); q.push(nb); }
      });
    }
  }

  /* ── Helpers ─────────────────────────────────── */
  function isDark() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }

  function hexAlpha(hex, a) {
    // Append 2-char hex alpha to a 6-char hex colour
    const byte = Math.max(0, Math.min(255, Math.round(a * 255)));
    return hex + byte.toString(16).padStart(2, '0');
  }

  function nodePos(n) {
    const dx = (mouse.x - W * 0.5) * n.depth * 0.022;
    const dy = (mouse.y - H * 0.5) * n.depth * 0.016;
    return { x: n.x + dx, y: n.y + dy };
  }

  /* ── Main render loop ────────────────────────── */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    time++;

    // Smooth mouse lerp
    mouse.x += (mouse.tx - mouse.x) * 0.055;
    mouse.y += (mouse.ty - mouse.y) * 0.055;

    // Reveal one node every 10 frames
    if (coloringIdx < coloringQueue.length && time % 10 === 0) {
      nodes[coloringQueue[coloringIdx]].color = nodes[coloringQueue[coloringIdx]].targetColor;
      coloringIdx++;
    }

    // Reset loop after all coloured + short pause
    if (coloringIdx >= coloringQueue.length) {
      resetClock++;
      if (resetClock > 200) buildGraph();
    }

    const dark = isDark();

    /* — Float & alpha — */
    nodes.forEach(n => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 30 || n.x > W - 30) n.vx *= -1;
      if (n.y < 30 || n.y > H - 30) n.vy *= -1;
      n.phase += n.phaseSpeed;
      n.alpha = n.color >= 0
        ? Math.min(1, n.alpha + 0.06)
        : Math.max(0, n.alpha - 0.03);
    });

    /* ─ Draw edges ─ */
    edges.forEach(([a, b]) => {
      const na = nodes[a], nb = nodes[b];
      const pa = nodePos(na), pb = nodePos(nb);

      const bothOn  = na.color >= 0 && nb.color >= 0;
      const conflict = bothOn && na.color === nb.color;
      const baseA   = Math.min(na.alpha, nb.alpha);

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);

      if (conflict) {
        ctx.strokeStyle = `rgba(255,50,50,${0.55 * baseA})`;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 5]);
      } else if (bothOn) {
        ctx.strokeStyle = dark
          ? `rgba(255,107,0,${0.14 * baseA})`
          : `rgba(180,60,0,${0.11 * baseA})`;
        ctx.lineWidth = 0.9;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
      }

      ctx.stroke();
      ctx.setLineDash([]);
    });

    /* ─ Draw nodes ─ */
    nodes.forEach(n => {
      const p = nodePos(n);
      const pulse = 1 + 0.20 * Math.sin(n.phase);
      const r = n.r * pulse;

      let colour;
      if (n.color >= 0) {
        colour = PALETTE[n.color];
      } else {
        colour = dark ? '#ffffff' : '#444444';
      }
      const bodyAlpha = n.color >= 0 ? 0.85 * n.alpha : 0.07;

      /* Glow halo for coloured nodes */
      if (n.color >= 0 && n.alpha > 0.05) {
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.8);
        grd.addColorStop(0, hexAlpha(colour, n.alpha * 0.38));
        grd.addColorStop(1, hexAlpha(colour, 0));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3.8, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      /* Node disc */
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(colour, bodyAlpha);
      ctx.fill();

      /* Thin ring for coloured nodes */
      if (n.color >= 0 && n.alpha > 0.25) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.28 * n.alpha})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    });

    requestAnimationFrame(draw);
  }

  /* ── Mouse tracking ──────────────────────────── */
  document.addEventListener('mousemove', e => {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
  });

  /* ── Resize handler ──────────────────────────── */
  let _rt;
  window.addEventListener('resize', () => {
    clearTimeout(_rt);
    _rt = setTimeout(resize, 150);
  });

  resize();
  draw();
})();
