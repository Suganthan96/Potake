'use client';
import React, { useEffect, useRef } from 'react';

export interface ValidatorData {
  id: string; uptimeBps: number; commissionBps: number;
  totalStake: bigint; healthy: boolean; shareBps: number;
}
interface Props {
  validators: ValidatorData[];
  era: number;
  totalStake: bigint;
  hasPolicy: boolean;
  onSelect?: (name: string) => void;
}

interface CameraAPI { zoomIn: () => void; zoomOut: () => void; reset: () => void; }

export default function WorldCanvas({ validators, era, totalStake, hasPolicy, onSelect }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const labelsRef  = useRef<HTMLDivElement>(null);
  const cameraAPI  = useRef<CameraAPI | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const labelsEl = labelsRef.current;
    if (!mount) return;

    let THREE: typeof import('three');
    let renderer: import('three').WebGLRenderer;
    let animId: number;

    async function init() {
      THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js' as any);

      const W = mount!.clientWidth, H = mount!.clientHeight;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.setClearColor(0x080b12);
      mount!.appendChild(renderer.domElement);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
      camera.position.set(10, 14, 14);
      camera.lookAt(0, 1.5, 0);

      // ── Lighting ────────────────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0x1a2030, 1.2));
      const key = new THREE.DirectionalLight(0xfff8ee, 2.0);
      key.position.set(8, 16, 10); key.castShadow = true; scene.add(key);
      const rim = new THREE.DirectionalLight(0x8fb9a8, 0.6);
      rim.position.set(-8, 4, -8); scene.add(rim);
      const fill = new THREE.DirectionalLight(0xf3a35d, 0.25);
      fill.position.set(0, 2, 10); scene.add(fill);

      // ── Grid floor ───────────────────────────────────────────────────────
      const grid = new THREE.GridHelper(40, 40, 0x1a2535, 0x111920);
      grid.position.y = -0.01;
      scene.add(grid);

      // Floor plane (receives shadows)
      const floorGeo = new THREE.PlaneGeometry(40, 40);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x07090f, roughness: 1 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
      scene.add(floor);

      // ── Helper: floor tile ───────────────────────────────────────────────
      function tile(cx: number, cz: number, w: number, d: number, color: number, opacity = 0.25) {
        const g = new THREE.PlaneGeometry(w, d);
        const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 1 });
        const mesh = new THREE.Mesh(g, m);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cx, 0.005, cz);
        scene.add(mesh);
      }

      // ── Helper: voxel building ───────────────────────────────────────────
      function box(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
        const g = new THREE.BoxGeometry(w, h, d);
        const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y + h / 2, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh); return mesh;
      }

      // ── THE POT (centre piece — lathe geometry) ──────────────────────────
      const potPts: import('three').Vector2[] = [
        [0.00, 0.00], [0.25, 0.00], [0.45, 0.12],
        [0.75, 0.42], [1.05, 0.90], [1.28, 1.52],
        [1.28, 2.05], [1.08, 2.55], [0.72, 2.92],
        [0.50, 3.10], [0.44, 3.26], [0.52, 3.40],
        [0.62, 3.45],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const potGeo = new THREE.LatheGeometry(potPts, 48);
      const potMat = new THREE.MeshStandardMaterial({
        color: 0x8fb9a8, roughness: 0.30, metalness: 0.06,
        envMapIntensity: 0.8,
      });
      const pot = new THREE.Mesh(potGeo, potMat);
      pot.scale.setScalar(0.9);
      pot.position.set(0, 0, 0);
      pot.castShadow = true;
      scene.add(pot);
      tile(0, 0, 3.2, 3.2, 0x8fb9a8, 0.12);

      // Pot base ring
      const ringGeo = new THREE.TorusGeometry(0.58, 0.04, 8, 32);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x6fa090, roughness: 0.4 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
      scene.add(ring);

      // ── ORACLE TOWER (back-left) ─────────────────────────────────────────
      tile(-5.5, -4.5, 3.5, 3.5, 0x8fb9a8, 0.20);
      box(-5.5, 0, -4.5, 2.2, 0.3, 2.2, 0x0d1f1a);   // base slab
      box(-5.5, 0.3, -4.5, 1.8, 3.0, 1.8, 0x142820);  // main tower
      box(-5.5, 3.3, -4.5, 2.0, 0.25, 2.0, 0x1c3d30); // cap
      box(-5.5, 3.55, -4.5, 0.4, 0.6, 0.4, 0x8fb9a8); // antenna
      // server light strips
      for (let i = 0; i < 5; i++) {
        const sg = new THREE.BoxGeometry(1.4, 0.08, 0.05);
        const sm = new THREE.MeshStandardMaterial({ color: 0x8fb9a8, emissive: 0x4a8070, emissiveIntensity: 1.2 });
        const s  = new THREE.Mesh(sg, sm);
        s.position.set(-5.5, 0.5 + i * 0.52, -5.38); scene.add(s);
      }

      // ── REGISTRY BUILDING (back-right) ───────────────────────────────────
      tile(5.0, -4.0, 3.8, 3.0, 0xf3a35d, 0.18);
      box(5.0, 0, -4.0, 2.6, 0.25, 2.0, 0x1f1408);   // base
      box(5.0, 0.25, -4.0, 2.2, 2.0, 1.6, 0x2a1c0a); // body
      box(5.0, 2.25, -4.0, 2.4, 0.25, 1.8, 0x3a2810); // ledge
      box(5.0, 2.5, -4.0, 1.8, 0.8, 1.3, 0x2a1c0a);  // upper
      // ledger lines
      for (let i = 0; i < 4; i++) {
        const lg = new THREE.BoxGeometry(1.6, 0.06, 0.04);
        const lm = new THREE.MeshStandardMaterial({ color: 0xf3a35d, emissive: 0xc87941, emissiveIntensity: 0.8 });
        const l  = new THREE.Mesh(lg, lm);
        l.position.set(5.0, 0.6 + i * 0.42, -3.01); scene.add(l);
      }

      // ── VAULT (front-right) ──────────────────────────────────────────────
      tile(4.5, 4.0, 3.5, 3.5, 0xe8e0d4, 0.15);
      box(4.5, 0, 4.0, 2.8, 0.25, 2.8, 0x18161200);  // pad
      const vaultBase = box(4.5, 0.25, 4.0, 2.4, 1.8, 2.4, 0x1e1c16);
      box(4.5, 2.05, 4.0, 2.6, 0.25, 2.6, 0x2a2820); // roof
      // vault door circle
      const doorGeo = new THREE.CircleGeometry(0.55, 24);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.3, metalness: 0.5 });
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(4.5, 1.1, 5.25); scene.add(door);
      const doorRimGeo = new THREE.TorusGeometry(0.55, 0.06, 8, 24);
      const doorRimMat = new THREE.MeshStandardMaterial({ color: 0xd4c9b5 });
      const doorRim = new THREE.Mesh(doorRimGeo, doorRimMat);
      doorRim.position.set(4.5, 1.1, 5.26); scene.add(doorRim);
      // spokes
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sg = new THREE.BoxGeometry(0.06, 0.9, 0.04);
        const sm = new THREE.MeshStandardMaterial({ color: 0xa08c70 });
        const sv = new THREE.Mesh(sg, sm);
        sv.position.set(4.5, 1.1, 5.27);
        sv.rotation.z = a; scene.add(sv);
      }

      // ── VALIDATOR PILLARS ────────────────────────────────────────────────
      const validatorMeshes: import('three').Mesh[] = [];
      const vCount = Math.max(validators.length, 2);
      const vSlots = vCount;
      for (let i = 0; i < vSlots; i++) {
        const v = validators[i];
        const angle = (i / vSlots) * Math.PI - Math.PI / 2;
        const r = 3.2;
        const vx = Math.cos(angle) * r - 1;
        const vz = Math.sin(angle) * r + 1;
        const healthy = v?.healthy ?? true;
        const h = 0.6 + (v ? (v.uptimeBps / 10000) * 1.4 : 1.2);
        const col = healthy ? 0x4a9e7a : 0xc87941;

        tile(vx, vz, 1.4, 1.4, col, 0.22);

        // hex pillar (6-sided)
        const pg = new THREE.CylinderGeometry(0.28, 0.35, h, 6);
        const pm = new THREE.MeshStandardMaterial({
          color: col, roughness: 0.45, metalness: 0.15,
          emissive: col, emissiveIntensity: 0.15,
        });
        const pillar = new THREE.Mesh(pg, pm);
        pillar.position.set(vx, h / 2, vz);
        pillar.castShadow = true; scene.add(pillar);
        validatorMeshes.push(pillar);

        // glow cap
        const cg = new THREE.CylinderGeometry(0.20, 0.28, 0.1, 6);
        const cm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.8 });
        const cap = new THREE.Mesh(cg, cm);
        cap.position.set(vx, h + 0.05, vz); scene.add(cap);
      }

      // ── AGENT SPHERE ─────────────────────────────────────────────────────
      const agentGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const agentMat = new THREE.MeshStandardMaterial({
        color: 0xf3a35d, emissive: 0xc87941, emissiveIntensity: 0.8,
        roughness: 0.3, metalness: 0.2,
      });
      const agent = new THREE.Mesh(agentGeo, agentMat);
      agent.position.set(-5.5, 0.5, -4.5);
      agent.castShadow = true;
      scene.add(agent);
      // agent glow ring
      const agRingGeo = new THREE.TorusGeometry(0.35, 0.03, 8, 24);
      const agRingMat = new THREE.MeshStandardMaterial({ color: 0xf3a35d, emissive: 0xf3a35d, emissiveIntensity: 1 });
      const agRing = new THREE.Mesh(agRingGeo, agRingMat);
      agRing.rotation.x = Math.PI / 2; agent.add(agRing);

      // ── LABEL POSITIONS ───────────────────────────────────────────────────
      const labelDefs = [
        { id: 'pot',       pos: new THREE.Vector3(0, 4.2, 0),      text: 'STAKED POT',   sub: `ERA ${era}` },
        { id: 'oracle',    pos: new THREE.Vector3(-5.5, 5.0, -4.5), text: 'STAKING ORACLE', sub: '0x0bfB…C619' },
        { id: 'registry',  pos: new THREE.Vector3(5.0, 4.0, -4.0),  text: 'POLICY REGISTRY', sub: '0x6828…509f' },
        { id: 'vault',     pos: new THREE.Vector3(4.5, 3.4, 4.0),   text: 'GATED VAULT', sub: '0x9d80…429c' },
        { id: 'agent',     pos: new THREE.Vector3(-5.5, 2.0, -4.5), text: 'POLICY AGENT', sub: hasPolicy ? 'ACTIVE' : 'IDLE' },
      ];

      // ── HTML LABELS SETUP ────────────────────────────────────────────────
      const labelEls: HTMLDivElement[] = [];
      if (labelsEl) {
        labelsEl.innerHTML = '';
        for (const def of labelDefs) {
          const el = document.createElement('div');
          el.style.cssText = `
            position:absolute; pointer-events:none; transform:translate(-50%,-100%);
            display:flex; flex-direction:column; align-items:center; gap:3px;
          `;
          el.innerHTML = `
            <div style="
              font-family:monospace; font-size:9px; letter-spacing:0.14em;
              color:#e8e0d4; background:rgba(8,11,18,0.82); padding:4px 10px;
              border:1px solid rgba(232,224,212,0.18); white-space:nowrap;
            ">${def.text}</div>
            <div style="
              font-family:monospace; font-size:8px; color:#8fb9a8; opacity:0.8;
            ">${def.sub}</div>
            <div style="width:1px; height:14px; background:rgba(232,224,212,0.3);"></div>
          `;
          labelsEl.appendChild(el);
          labelEls.push(el);
        }

        // validator labels
        for (let i = 0; i < Math.min(validators.length, vSlots); i++) {
          const v = validators[i];
          const el = document.createElement('div');
          el.style.cssText = 'position:absolute; pointer-events:none; transform:translate(-50%,-100%);';
          el.innerHTML = `<div style="
            font-family:monospace; font-size:8px; letter-spacing:0.1em;
            color:${v.healthy ? '#8fb9a8' : '#f3a35d'};
            background:rgba(8,11,18,0.7); padding:3px 8px;
            border:1px solid ${v.healthy ? 'rgba(143,185,168,0.3)' : 'rgba(243,163,93,0.3)'};
            white-space:nowrap;
          ">V${i} ${(v.uptimeBps / 100).toFixed(0)}%</div>`;
          labelsEl.appendChild(el);
          labelEls.push(el);
        }
      }

      // ── Connection lines ─────────────────────────────────────────────────
      function drawLine(from: [number,number,number], to: [number,number,number], color: number) {
        const pts = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
        scene.add(new THREE.Line(geo, mat));
      }
      drawLine([-5.5, 0.5, -4.5], [0, 1.5, 0],  0x8fb9a8); // oracle → pot
      drawLine([5.0, 0.5, -4.0],  [0, 1.5, 0],  0xf3a35d); // registry → pot
      drawLine([4.5, 0.5, 4.0],   [0, 1.5, 0],  0xe8e0d4); // vault → pot

      // ── OrbitControls ─────────────────────────────────────────────────────
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.5, 0);
      controls.enableDamping    = true;
      controls.dampingFactor    = 0.06;
      controls.rotateSpeed      = 0.55;
      controls.zoomSpeed        = 0.8;
      controls.panSpeed         = 0.6;
      controls.minDistance      = 5;
      controls.maxDistance      = 35;
      controls.maxPolarAngle    = Math.PI / 2.1;  // can't go below ground
      controls.enablePan        = true;
      controls.mouseButtons     = { LEFT: 0, MIDDLE: 1, RIGHT: 2 }; // left=orbit, right=pan
      controls.update();

      // ── Camera API (for UI buttons) ───────────────────────────────────────
      // Use OrbitControls' internal dolly methods so the spherical coord system stays in sync
      const ctrl = controls as any;
      cameraAPI.current = {
        zoomIn:  () => { ctrl.dollyIn  && ctrl.dollyIn(1.25);  controls.update(); },
        zoomOut: () => { ctrl.dollyOut && ctrl.dollyOut(1.25); controls.update(); },
        reset:   () => { camera.position.set(10, 14, 14); controls.target.set(0, 1.5, 0); controls.update(); },
      };

      // ── Resize ───────────────────────────────────────────────────────────
      const onResize = () => {
        if (!mount) return;
        const W2 = mount.clientWidth, H2 = mount.clientHeight;
        camera.aspect = W2 / H2; camera.updateProjectionMatrix();
        renderer.setSize(W2, H2);
      };
      window.addEventListener('resize', onResize);

      // ── Animate ───────────────────────────────────────────────────────────
      let t = 0;
      const agentPath = [
        [-5.5, -4.5], [0, 0], [5.0, -4.0], [4.5, 4.0], [-5.5, -4.5]
      ];

      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.008;

        controls.update();  // damping needs update every frame

        // Pot slow rotation
        pot.rotation.y = t * 0.3;
        ring.rotation.z = t * 0.15;

        // Validator pillar breathing
        validatorMeshes.forEach((m, i) => {
          m.scale.y = 1 + Math.sin(t * 0.9 + i * 1.2) * 0.06;
        });

        // Agent path movement
        const pathT  = (t * 0.12) % 1;
        const seg    = Math.floor(pathT * (agentPath.length - 1));
        const segT   = (pathT * (agentPath.length - 1)) % 1;
        const p0     = agentPath[seg], p1 = agentPath[seg + 1] || agentPath[0];
        agent.position.x = p0[0] + (p1[0] - p0[0]) * segT;
        agent.position.z = p0[1] + (p1[1] - p0[1]) * segT;
        agent.position.y = 0.5 + Math.sin(t * 3) * 0.12;
        agRing.rotation.z = t * 2;

        renderer.render(scene, camera);

        // Update HTML labels
        if (labelsEl) {
          const allDefs = [
            ...labelDefs,
            ...validators.slice(0, vSlots).map((v, i) => {
              const angle = (i / vSlots) * Math.PI - Math.PI / 2;
              const r = 3.2;
              return {
                id: `v${i}`,
                pos: new THREE.Vector3(
                  Math.cos(angle) * r - 1,
                  2.5,
                  Math.sin(angle) * r + 1
                ),
              };
            }),
          ];
          allDefs.forEach((def, idx) => {
            const el = labelEls[idx];
            if (!el) return;
            const v = def.pos.clone().project(camera);
            const W3 = mount!.clientWidth, H3 = mount!.clientHeight;
            const sx = (v.x * 0.5 + 0.5) * W3;
            const sy = (-v.y * 0.5 + 0.5) * H3;
            if (v.z > 1) { el.style.display = 'none'; return; }
            el.style.display = 'block';
            el.style.left = sx + 'px';
            el.style.top  = sy + 'px';
          });
        }
      };
      animate();

      return () => {
        window.removeEventListener('resize', onResize);
        controls.dispose();
        cancelAnimationFrame(animId);
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    const cleanupP = init();
    return () => { cleanupP.then(fn => fn && fn()); };
  }, [validators, era, hasPolicy]);

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36,
    background: 'rgba(8,11,18,0.75)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(232,224,212,0.14)',
    color: 'rgba(232,224,212,0.7)', cursor: 'pointer',
    fontFamily: 'monospace', fontSize: 18, lineHeight: 1,
    transition: 'background 0.15s, color 0.15s',
    userSelect: 'none',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div ref={labelsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* ── Camera controls overlay ── */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        display: 'flex', flexDirection: 'column', gap: 4,
        zIndex: 10,
      }}>
        <button title="Zoom in"  style={btnBase} onClick={() => cameraAPI.current?.zoomIn()}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(143,185,168,0.18)'; (e.target as HTMLElement).style.color = '#8fb9a8'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(8,11,18,0.75)';   (e.target as HTMLElement).style.color = 'rgba(232,224,212,0.7)'; }}>
          +
        </button>
        <button title="Zoom out" style={btnBase} onClick={() => cameraAPI.current?.zoomOut()}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(143,185,168,0.18)'; (e.target as HTMLElement).style.color = '#8fb9a8'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(8,11,18,0.75)';   (e.target as HTMLElement).style.color = 'rgba(232,224,212,0.7)'; }}>
          −
        </button>
        <div style={{ height: 1, background: 'rgba(232,224,212,0.1)', margin: '2px 0' }} />
        <button title="Reset view" style={{ ...btnBase, fontSize: 13, letterSpacing: '0.05em' }} onClick={() => cameraAPI.current?.reset()}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(143,185,168,0.18)'; (e.target as HTMLElement).style.color = '#8fb9a8'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(8,11,18,0.75)';   (e.target as HTMLElement).style.color = 'rgba(232,224,212,0.7)'; }}>
          ⟳
        </button>
      </div>

      {/* ── Hint text ── */}
      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em',
        color: 'rgba(232,224,212,0.22)', pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        DRAG TO ORBIT · SCROLL TO ZOOM · RIGHT-DRAG TO PAN
      </div>
    </div>
  );
}
