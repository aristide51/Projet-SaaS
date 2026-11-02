"use client";

import { useEffect, useRef } from "react";
import type { Mesh, MeshStandardMaterial, WebGLRenderer } from "three";

/**
 * Scène Three.js décorative pour le panneau de gauche des pages
 * (connexion, annuaire, etc.). Animations légères, respectueuses
 * des préférences de réduction des mouvements.
 */
export function HeroScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const mountElement = mount;

    let disposed = false;
    let animationFrame: number | null = null;
    let renderer: WebGLRenderer | null = null;
    let mesh: Mesh | null = null;
    let material: MeshStandardMaterial | null = null;

    async function init() {
      const THREE = await import("three");
      if (disposed || !mountElement.isConnected) return;

      const size = mountElement.clientWidth;
      const aspect = size / Math.max(size, 1);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf7f8f6);

      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
      camera.position.set(0, 2, 6);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setSize(size, Math.max(size * 0.7, 240));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mountElement.appendChild(renderer.domElement);

      const geometry = new THREE.SphereGeometry(1.6, 48, 48);
      material = new THREE.MeshStandardMaterial({
        color: 0x08782f,
        roughness: 0.35,
        metalness: 0.18,
        emissive: 0x08782f,
        emissiveIntensity: 0.08,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.y = 0.4;
      mesh.position.y = -0.4;
      scene.add(mesh);

      const light = new THREE.DirectionalLight(0x08782f, 1.2);
      light.position.set(3, 5, 4);
      scene.add(light);

      const ambient = new THREE.AmbientLight(0x08782f, 0.35);
      scene.add(ambient);

      const animate = () => {
        if (disposed || !renderer || !mesh) return;

        mesh.rotation.y += 0.008;
        mesh.rotation.x = Math.sin(Date.now() * 0.0003) * 0.06;
        renderer.render(scene, camera);
        animationFrame = requestAnimationFrame(animate);
      };

      animationFrame = requestAnimationFrame(animate);
    }

    void init();

    return () => {
      disposed = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      mesh?.geometry.dispose();
      material?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="auth-hero-scene__mount"
      aria-hidden="true"
    />
  );
}
