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
    let resizeObserver: ResizeObserver | undefined;
    let cleanup = () => {};
    let cancelled = false;

    async function initializeScene() {
      const THREE = await import("three");
      if (cancelled || !mount) return;

      scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.z = 5;

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

      const group = new THREE.Group();
      const geometry = new THREE.IcosahedronGeometry(1.18, 2);
      const material = new THREE.MeshStandardMaterial({
        color: 0xd2f284,
        metalness: 0.18,
        roughness: 0.34,
        flatShading: true,
      });
      const solid = new THREE.Mesh(geometry, material);
      const wireframeGeometry = new THREE.IcosahedronGeometry(1.33, 1);
      const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
      });
      const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
      group.add(solid, wireframe);
      scene.add(group);

      scene.add(new THREE.HemisphereLight(0xf6ffe8, 0x617c42, 2.3));
      const keyLight = new THREE.DirectionalLight(0xffffff, 3);
      keyLight.position.set(2.5, 3, 4);
      scene.add(keyLight);

      const resize = () => {
        if (!mount || !renderer) return;
        const width = Math.max(mount.clientWidth, 1);
        const height = Math.max(mount.clientHeight, 1);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      const render = (time = 0) => {
        if (!renderer || !scene) return;
        if (!motionPreference.matches) {
          group.rotation.y = time * 0.00018;
          group.rotation.x = Math.sin(time * 0.00022) * 0.12;
        }
        renderer.render(scene, camera);
        if (!motionPreference.matches) {
          frame = window.requestAnimationFrame(render);
        }
      };

      render();
      cleanup = () => {
        window.cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        geometry.dispose();
        material.dispose();
        wireframeGeometry.dispose();
        wireframeMaterial.dispose();
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

  return <div aria-hidden="true" className="three-scene" ref={mountRef} />;
}
