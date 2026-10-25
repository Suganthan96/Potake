'use client';
import { useEffect, useRef } from 'react';

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let THREE: typeof import('three');
    let animId: number;
    let renderer: import('three').WebGLRenderer;

    async function init() {
      THREE = await import('three');

      renderer = new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
      camera.position.set(0, 10, 18);
      camera.lookAt(0, 0, -15);

      // Perspective grid via ShaderMaterial on a tilted plane
      const geo = new THREE.PlaneGeometry(120, 120, 1, 1);
      geo.rotateX(-Math.PI / 2);

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime:  { value: 0 },
          uMouse: { value: new THREE.Vector2(0, 0) },
        },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec2  uMouse;
          varying vec3  vWorld;

          float line(float v, float thickness) {
            return smoothstep(thickness, 0.0, abs(fract(v + 0.5) - 0.5));
          }

          void main() {
            float spacing = 4.0;
            float gx = line(vWorld.x / spacing, 0.025);
            float gz = line(vWorld.z / spacing, 0.025);
            float g  = max(gx, gz);

            // depth fade
            float dist = length(vWorld.xz);
            float fade = 1.0 - smoothstep(20.0, 55.0, dist);

            // horizon fade (negative Z goes to horizon)
            float hfade = 1.0 - smoothstep(0.0, 50.0, -vWorld.z);

            // breathing pulse
            float pulse = 0.65 + 0.35 * sin(uTime * 0.45);

            float alpha = g * fade * hfade * pulse * 0.55;

            // teal grid color #8FB9A8
            gl_FragColor = vec4(0.561, 0.725, 0.659, alpha);
          }
        `,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = -20;
      scene.add(mesh);

      // Subtle horizon glow
      const glowGeo = new THREE.PlaneGeometry(120, 18, 1, 1);
      const glowMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: mat.uniforms.uTime },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float glow = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
            glow *= 0.55 + 0.45 * sin(uTime * 0.45);
            float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
            gl_FragColor = vec4(0.561, 0.725, 0.659, glow * edge * 0.18);
          }
        `,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(0, 0, -40);
      glow.rotateX(-Math.PI / 6);
      scene.add(glow);

      // Mouse parallax
      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      const onMove = (e: MouseEvent) => {
        mouse.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
        mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('mousemove', onMove);

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.016;
        mat.uniforms.uTime.value = t;
        glowMat.uniforms.uTime.value = t;

        // smooth mouse follow
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        camera.position.x = mouse.x * 1.5;
        camera.position.y = 10 - mouse.y * 0.8;
        camera.lookAt(mouse.x * 0.3, 0, -15);

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(animId);
        renderer.dispose();
      };
    }

    const cleanup = init();
    return () => { cleanup.then(fn => fn && fn()); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
      aria-hidden
    />
  );
}
