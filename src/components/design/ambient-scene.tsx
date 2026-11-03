"use client";

import { useEffect, useRef } from "react";

const BRAND_COLORS = [0xe10b18, 0x087a3a, 0xffe500, 0x087a3a, 0xe10b18];

/**
 * Fond Three.js discret partagé par toutes les pages de l'application
 * (connexion, espace client, tableau de bord). Formes flottantes aux couleurs
 * de la marque, parallaxe à la souris et au défilement. Désactivé si
 * l'utilisateur préfère réduire les animations.
 */
export function AmbientScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mount || preference.matches) return;
    const mountElement = mount;

    let disposed = false;
    let frame: number | null = null;
    let cleanupScene: (() => void) | undefined;

    async function init() {
      const THREE = await import("three");
      if (disposed || !mountElement.isConnected) return;

      const isSmall = window.innerWidth < 768;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        100,
      );
      camera.position.set(0, 0, 14);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mountElement.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
      keyLight.position.set(4, 6, 8);
      scene.add(keyLight);

      const geometries = [
        new THREE.IcosahedronGeometry(1.4, 0),
        new THREE.TorusGeometry(1.1, 0.32, 16, 48),
        new THREE.OctahedronGeometry(1.1, 0),
        new THREE.TorusKnotGeometry(0.8, 0.22, 80, 12),
        new THREE.DodecahedronGeometry(1, 0),
      ];
      const materials: Array<InstanceType<typeof THREE.MeshStandardMaterial>> =
        [];
      const shapes: Array<{
        mesh: InstanceType<typeof THREE.Mesh>;
        baseY: number;
        speed: number;
        phase: number;
      }> = [];

      const positions: Array<[number, number, number]> = [
        [-8.5, 3.6, -2],
        [8.8, 2.4, -3],
        [-7.2, -3.8, -1],
        [7.6, -3.4, -2],
        [0.5, 5.6, -6],
      ];
      const count = isSmall ? 3 : positions.length;

      for (let index = 0; index < count; index += 1) {
        const position = positions[index];
        const color = BRAND_COLORS[index];
        if (!position || color === undefined) continue;
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.45,
          metalness: 0.15,
          transparent: true,
          opacity: 0.22,
          wireframe: index % 2 === 0,
        });
        materials.push(material);
        const mesh = new THREE.Mesh(geometries[index], material);
        const [x, y, z] = position;
        mesh.position.set(isSmall ? x * 0.55 : x, y, z);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        scene.add(mesh);
        shapes.push({
          mesh,
          baseY: y,
          speed: 0.25 + index * 0.06,
          phase: index,
        });
      }

      const particleCount = isSmall ? 60 : 140;
      const particlePositions = new Float32Array(particleCount * 3);
      for (let index = 0; index < particleCount; index += 1) {
        particlePositions[index * 3] = (Math.random() - 0.5) * 30;
        particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 18;
        particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 10 - 4;
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(particlePositions, 3),
      );
      const particleMaterial = new THREE.PointsMaterial({
        color: 0x087a3a,
        size: 0.06,
        transparent: true,
        opacity: 0.45,
      });
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);

      const pointer = { x: 0, y: 0 };
      const handlePointer = (event: PointerEvent) => {
        pointer.x = event.clientX / window.innerWidth - 0.5;
        pointer.y = event.clientY / window.innerHeight - 0.5;
      };
      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        if (document.hidden) {
          frame = requestAnimationFrame(animate);
          return;
        }
        const elapsed = clock.getElapsedTime();
        const scroll = window.scrollY * 0.0015;

        for (const shape of shapes) {
          shape.mesh.rotation.x += 0.0025 * shape.speed * 4;
          shape.mesh.rotation.y += 0.003 * shape.speed * 4;
          shape.mesh.position.y =
            shape.baseY +
            Math.sin(elapsed * shape.speed + shape.phase) * 0.45 -
            scroll;
        }
        particles.rotation.y = elapsed * 0.015;

        camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.04;
        camera.position.y += (-pointer.y * 1.1 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };

      window.addEventListener("pointermove", handlePointer, { passive: true });
      window.addEventListener("resize", handleResize);
      frame = requestAnimationFrame(animate);

      cleanupScene = () => {
        window.removeEventListener("pointermove", handlePointer);
        window.removeEventListener("resize", handleResize);
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        particleGeometry.dispose();
        particleMaterial.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    void init();

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      cleanupScene?.();
    };
  }, []);

  return <div aria-hidden="true" className="site-ambient" ref={mountRef} />;
}
