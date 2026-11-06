/* ============================================
   js/brain.js — Maya AI Brain (3D, Three.js r128)
   Add ONE line before assistant.js:
   <script src="js/brain.js"></script>
   Self-loads Three.js + css/brain.css. Hooks immersive.setCore().
   ============================================ */
(() => {
  'use strict';

  const BASE = new URL('..', document.currentScript.src).href;
  const IMG = BASE + 'assets/maya-brain.jpg';
  const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = BASE + 'css/brain.css';
  document.head.appendChild(css);

  // energy = glow/pulse strength, speed = motion rate, tint = RGB 0-1
  const STATES = {
    idle:      { energy: 0.35, speed: 0.6, tint: [1.0, 0.16, 0.52] },
    listening: { energy: 0.85, speed: 1.3, tint: [0.13, 0.83, 0.93] },
    thinking:  { energy: 1.0,  speed: 2.5, tint: [0.55, 0.36, 0.96] },
    speaking:  { energy: 0.9,  speed: 1.6, tint: [1.0, 0.72, 0.35] },
    error:     { energy: 0.6,  speed: 0.4, tint: [0.94, 0.27, 0.27] },
  };

  let current = 'idle';
  let api = null;
  let overlay;

  const loadThree = () =>
    window.THREE
      ? Promise.resolve()
      : new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = THREE_SRC;
          s.onload = res;
          s.onerror = () => rej(new Error('Could not load Three.js'));
          document.head.appendChild(s);
        });

  // ---------- UI ----------
  function buildUI() {
    overlay = document.createElement('section');
    overlay.id = 'brain-overlay';
    overlay.className = 'brain-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Maya AI brain');
    overlay.innerHTML = `
      <div class="brain-stage" id="brain-stage" title="Tap the core to speak"></div>
      <header class="brain-top">
        <div class="brain-title"><small>Neural core · live</small><h2>Maya Brain</h2></div>
        <button class="btn-icon" id="brain-close" aria-label="Close brain view">✕</button>
      </header>
      <dl class="brain-hud">
        <div><dt>State</dt><dd id="brain-state">idle</dd></div>
        <div><dt>Neurons</dt><dd id="brain-nodes">–</dd></div>
        <div><dt>Synapses</dt><dd id="brain-syn">–</dd></div>
        <div><dt>FPS</dt><dd id="brain-fps">–</dd></div>
      </dl>
      <p class="brain-caption" id="brain-caption" aria-live="polite">Tap the core and speak, or type below.</p>
      <form class="brain-dock" id="brain-form">
        <button type="button" class="btn-mic" id="brain-mic" aria-label="Speak to Maya">◉</button>
        <input id="brain-input" placeholder="Ask Maya's brain anything…" autocomplete="off" aria-label="Message" />
        <button class="btn-send" aria-label="Send">➤</button>
      </form>`;
    document.body.appendChild(overlay);

    const btn = document.createElement('button');
    btn.id = 'enter-brain-btn';
    btn.className = 'btn-brain';
    btn.title = 'Open AI Brain';
    btn.innerHTML = '<span class="brain-glyph">🧠</span><span class="brain-label">AI Brain</span>';
    document.querySelector('.header-actions')?.prepend(btn);

    btn.addEventListener('click', open);
    $('brain-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !overlay.hidden && close());
    $('brain-mic').addEventListener('click', () => window.handleMicButton?.());
    $('brain-stage').addEventListener('click', () => window.handleMicButton?.());
    $('brain-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('brain-input');
      const text = input.value.trim();
      if (text && window.sendMessage) {
        window.sendMessage(text);
        input.value = '';
      }
    });

    // Mirror the latest chat message into the brain caption (no assistant.js edits needed)
    const feed = $('messages');
    if (feed) {
      new MutationObserver((list) => {
        list.forEach((m) =>
          m.addedNodes.forEach((n) => {
            if (!n.classList || n.id === 'typing-indicator') return;
            const text = n.querySelector('.message-bubble > span:last-child')?.textContent;
            if (text) $('brain-caption').textContent = text;
          })
        );
      }).observe(feed, { childList: true });
    }
  }

  function setState(name) {
    if (!STATES[name]) name = 'idle';
    current = name;
    if (!overlay) return;
    $('brain-state').textContent = name;
    $('brain-mic').classList.toggle('listening', name === 'listening');
    overlay.dataset.state = name;
    api?.setTarget(STATES[name]);
  }

  async function open() {
    overlay.hidden = false;
    document.body.classList.add('brain-open');
    try {
      await loadThree();
      if (!api) api = initScene($('brain-stage'));
      api.setTarget(STATES[current]);
      api.start();
    } catch (err) {
      $('brain-stage').style.backgroundImage = `url(${IMG})`;
      $('brain-caption').textContent = '3D unavailable on this device. Showing the static brain.';
      window.showToast?.(err.message, 'error');
    }
    $('brain-input').focus({ preventScroll: true });
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('brain-open');
    api?.stop();
  }

  // ---------- 3D SCENE ----------
  function initScene(stage) {
    const T = THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    stage.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(50, 1, 0.1, 200);
    const root = new T.Group();
    scene.add(root);
    const add = T.AdditiveBlending;

    // The image IS the brain: three stacked shader layers give it depth and a live pulse
    const U = {
      uMap: { value: null },
      uTime: { value: 0 },
      uEnergy: { value: 0.35 },
      uTint: { value: new T.Color(1, 0.16, 0.52) },
    };
    const vert = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
    const frag = `
      uniform sampler2D uMap;uniform float uTime,uEnergy,uAlpha;uniform vec3 uTint;varying vec2 vUv;
      void main(){
        vec2 c=vUv-.5;float d=length(c*vec2(1.,.9));
        float mask=smoothstep(.52,.2,d);
        float pulse=.5+.5*sin(uTime*(1.5+uEnergy*3.)-d*14.);
        vec2 off=c*(.004+.01*uEnergy)*pulse;
        vec3 col=vec3(texture2D(uMap,vUv+off).r,texture2D(uMap,vUv).g,texture2D(uMap,vUv-off).b);
        float sweep=smoothstep(.03,0.,abs(fract(uTime*.12)-vUv.y));
        col*=1.+uEnergy*.55*pulse;
        col+=uTint*(sweep*.35+pulse*.06*uEnergy)*mask;
        gl_FragColor=vec4(col*mask,uAlpha);
      }`;
    const layers = [[-1.2, 0.94, 0.55], [0, 1, 1], [1.2, 1.06, 0.35]].map(([z, s, a]) => {
      const mat = new T.ShaderMaterial({
        uniforms: { ...U, uAlpha: { value: a } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: add,
      });
      const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
      mesh.position.z = z;
      mesh.userData.s = s;
      mesh.visible = false;
      root.add(mesh);
      return mesh;
    });
    new T.TextureLoader().load(IMG, (tex) => {
      tex.minFilter = T.LinearFilter;
      U.uMap.value = tex;
      const aspect = tex.image.width / tex.image.height;
      layers.forEach((m) => {
        m.scale.set(13 * aspect * m.userData.s, 13 * m.userData.s, 1);
        m.visible = true;
      });
    });

    // Orbit rings echo the gold / cyan / pink rings in the artwork
    const rings = [[7.8, 0xffc95a], [8.8, 0x22d3ee], [9.8, 0xff2a85]].map(([r, c], i) => {
      const m = new T.Mesh(
        new T.TorusGeometry(r, 0.025, 8, 240),
        new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: add, depthWrite: false })
      );
      m.rotation.set(1.15 + i * 0.3, 0.3 * i, i);
      root.add(m);
      return m;
    });

    // Neurons + synapses inside the brain silhouette
    const N = 150;
    const P = Array.from({ length: N }, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      return new T.Vector3(Math.cos(a) * r * 6.4, Math.sin(a) * r * 4.8, (Math.random() - 0.5) * 4);
    });
    const E = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (P[i].distanceTo(P[j]) < 2.3) E.push([i, j]);

    const lp = new Float32Array(E.length * 6);
    E.forEach(([a, b], i) => {
      P[a].toArray(lp, i * 6);
      P[b].toArray(lp, i * 6 + 3);
    });
    const lineGeo = new T.BufferGeometry();
    lineGeo.setAttribute('position', new T.BufferAttribute(lp, 3));
    const lines = new T.LineSegments(
      lineGeo,
      new T.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.14, blending: add, depthWrite: false })
    );
    const nodeGeo = new T.BufferGeometry().setFromPoints(P);
    const nodes = new T.Points(
      nodeGeo,
      new T.PointsMaterial({ size: 0.13, color: 0xffffff, transparent: true, opacity: 0.9, blending: add, depthWrite: false })
    );
    root.add(lines, nodes);

    // Signals travelling along synapses
    const pulses = Array.from({ length: 70 }, () => ({ e: (Math.random() * E.length) | 0, t: Math.random(), v: 0.4 + Math.random() * 0.8 }));
    const pGeo = new T.BufferGeometry();
    pGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(pulses.length * 3), 3));
    const pMat = new T.PointsMaterial({ size: 0.26, color: 0xff8ec7, transparent: true, opacity: 0.95, blending: add, depthWrite: false });
    root.add(new T.Points(pGeo, pMat));

    // Deep-space particle shell
    const S = 1800;
    const sp = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) {
      const r = 14 + Math.random() * 14;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      sp[i * 3 + 2] = r * Math.cos(ph);
    }
    const shellGeo = new T.BufferGeometry();
    shellGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
    const shell = new T.Points(
      shellGeo,
      new T.PointsMaterial({ size: 0.05, color: 0x9be7ff, transparent: true, opacity: 0.7, blending: add, depthWrite: false })
    );
    scene.add(shell);

    $('brain-nodes').textContent = N;
    $('brain-syn').textContent = E.length;

    // Animation state
    const cur = { energy: 0.35, speed: 0.6, tint: new T.Color(1, 0.16, 0.52) };
    let target = STATES.idle;
    let tgtColor = new T.Color(...target.tint);
    const mouse = { x: 0, y: 0 };
    let raf = 0, last = 0, t = 0, frames = 0, fpsClock = 0;

    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    });

    const resize = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.position.z = Math.max(15, 20 / camera.aspect);
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(stage);
    resize();

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const k = 1 - Math.pow(0.001, dt);
      cur.energy += (target.energy - cur.energy) * k;
      cur.speed += (target.speed - cur.speed) * k;
      cur.tint.lerp(tgtColor, k);
      t += dt * cur.speed;

      U.uTime.value += dt * (0.6 + cur.speed * 0.4);
      U.uEnergy.value = cur.energy;
      U.uTint.value.copy(cur.tint);

      rings.forEach((r, i) => {
        r.rotation.z += dt * cur.speed * (0.25 + i * 0.12) * (i % 2 ? -1 : 1);
        r.rotation.x += dt * cur.speed * 0.05;
        r.material.opacity = 0.45 + cur.energy * 0.45;
      });
      root.scale.setScalar(1 + Math.sin(t * 3) * 0.015 * cur.energy);
      lines.material.opacity = 0.08 + cur.energy * 0.17;
      lines.material.color.copy(cur.tint).lerp(new T.Color(0x22d3ee), 0.45);
      pMat.color.copy(cur.tint).lerp(new T.Color(0xffffff), 0.35);

      const pa = pGeo.attributes.position;
      pulses.forEach((p, i) => {
        p.t += dt * p.v * (0.5 + cur.speed);
        if (p.t >= 1) { p.t = 0; p.e = (Math.random() * E.length) | 0; }
        const [a, b] = E[p.e];
        pa.setXYZ(i, P[a].x + (P[b].x - P[a].x) * p.t, P[a].y + (P[b].y - P[a].y) * p.t, P[a].z + (P[b].z - P[a].z) * p.t);
      });
      pa.needsUpdate = true;

      if (!reduceMotion) {
        root.rotation.y += (mouse.x * 0.35 - root.rotation.y) * k;
        root.rotation.x += (mouse.y * 0.2 - root.rotation.x) * k;
        shell.rotation.y += dt * 0.02 * cur.speed;
      }
      renderer.render(scene, camera);

      frames++;
      if (now - fpsClock > 500) {
        $('brain-fps').textContent = Math.round((frames * 1000) / (now - fpsClock));
        frames = 0;
        fpsClock = now;
      }
    }

    return {
      setTarget(s) { target = s; tgtColor = new T.Color(...s.tint); },
      start() { cancelAnimationFrame(raf); last = fpsClock = performance.now(); raf = requestAnimationFrame(frame); },
      stop() { cancelAnimationFrame(raf); },
    };
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    buildUI();
    // Drive the brain from the app's existing core-state calls (idle / listening / thinking / speaking / error)
    window.immersive = window.immersive || { setCore() {} };
    const prev = window.immersive.setCore.bind(window.immersive);
    window.immersive.setCore = (s, ...rest) => {
      setState(s);
      return prev(s, ...rest);
    };
  });

  window.mayaBrain = { open, close, setState };
})();