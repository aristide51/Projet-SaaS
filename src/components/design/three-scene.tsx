"use client";

import { useEffect, useRef } from "react";

export default function ThreeScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let frame = 0;
    let renderer: import("three").WebGLRenderer | undefined;
    let scene: import("three").Scene | undefined;
    let camera: import("three").PerspectiveCamera | undefined;
    let group: import("three").Group | undefined;
    let particles: import("three").Points | undefined;
    let coreGeometry: import("three").IcosahedronGeometry | undefined;
    let coreMaterial: import("three").MeshStandardMaterial | undefined;
    let ringGeometry: import("three").TorusGeometry | undefined;
    let ringMaterial: import("three").MeshStandardMaterial | undefined;
    let particleGeometry: import("three").BufferGeometry | undefined;
    let particleMaterial: import("three").PointsMaterial | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let cancelled = false;
    let cleanup = () => {};

    async function initializeScene() {
      const THREE = await import("three");
      if (cancelled || !mount) return;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x111a15, 0.045);

      camera = new THREE.PerspectiveCamera(
        36,
        mount.clientWidth / Math.max(mount.clientHeight, 1),
        0.1,
        100,
      );
      camera.position.set(0, 1.2, 5.2);

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.setAttribute("role", "presentation");
      mount.appendChild(renderer.domElement);

      group = new THREE.Group();

      coreGeometry = new THREE.IcosahedronGeometry(1.05, 1);
      coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xd2f284,
        metalness: 0.22,
        roughness: 0.28,
        flatShading: true,
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      group.add(core);

      ringGeometry = new THREE.TorusGeometry(1.55, 0.035, 16, 64);
      ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.4,
        roughness: 0.18,
        transparent: true,
        opacity: 0.42,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      scene.add(group);

      const particleCount = motionPreference.matches ? 40 : 160;
      particleGeometry = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount * 3; i++) {
        particlePositions[i] = (Math.random() - 0.5) * 14;
      }
      particleGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(particlePositions, 3),
      );
      particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: motionPreference.matches ? 0.04 : 0.055,
        transparent: true,
        opacity: 0.55,
        sizeAttenuation: true,
      });
      particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);

      scene.add(new THREE.HemisphereLight(0xf6ffe8, 0x617c42, 1.8));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
      keyLight.position.set(3, 4, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xd2f284, 1.2);
      fillLight.position.set(-3, 1, -3);
      scene.add(fillLight);

      const resize = () => {
        if (!mount || !renderer || !camera) return;
        const width = Math.max(mount.clientWidth, 1);
        const height = Math.max(mount.clientHeight, 1);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      let mouseX = 0;
      let mouseY = 0;
      const onMouseMove = (event: MouseEvent) => {
        if (motionPreference.matches) return;
        mouseX = (event.clientX / mount.clientWidth) * 2 - 1;
        mouseY = -(event.clientY / mount.clientHeight) * 2 + 1;
      };
      window.addEventListener("mousemove", onMouseMove);

      const render = (time = 0) => {
        if (!renderer || !scene || !camera || !group || !particles) return;

        const elapsed = time * 0.001;

        if (!motionPreference.matches) {
          group.rotation.y = elapsed * 0.16;
          group.rotation.x = Math.sin(elapsed * 0.22) * 0.1;
          group.rotation.y += mouseX * 0.05;
          group.rotation.x += mouseY * 0.05;

          const positions = particles.geometry.attributes
            .position as import("three").BufferAttribute;
          const count = positions.count;
          for (let i = 0; i < count; i++) {
            let y = positions.getY(i);
            y -= elapsed * 0.06;
            if (y < -7) y += 14;
            positions.setY(i, y);
          }
          positions.needsUpdate = true;
        }

        renderer.render(scene, camera);

        if (!motionPreference.matches) {
          frame = window.requestAnimationFrame(render);
        }
      };

      render();

      cleanup = () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("mousemove", onMouseMove);
        resizeObserver?.disconnect();
        coreGeometry?.dispose();
        coreMaterial?.dispose();
        ringGeometry?.dispose();
        ringMaterial?.dispose();
        particleGeometry?.dispose();
        particleMaterial?.dispose();
        renderer?.dispose();
        renderer?.domElement.remove();
      };
    }

    void initializeScene();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="three-scene"
      ref={mountRef}
      style={{ minHeight: 420 }}
    />
  );
}
