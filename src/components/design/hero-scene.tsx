"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Scène Three.js décorative pour le panneau de gauche des pages
 * (connexion, annuaire, etc.). Animations légères, respectueuses
 * des préférences de réduction des mouvements.
 */
export function HeroScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const init = useCallback(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const size = mount.clientWidth;
    const aspect = size / Math.max(size, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f8f6);

    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    camera.position.set(0, 2, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(size, Math.max(size * 0.7, 240));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Sphère subtile + plan de fond polymère
    const geometry = new THREE.SphereGeometry(1.6, 48, 48);
    const material = new THREE.MeshStandardMaterial({
      color: 0x08782f,
      roughness: 0.35,
      metalness: 0.18,
      emissive: 0x08782f,
      emissiveIntensity: 0.08,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = 0.4;
    mesh.position.y = -0.4;
    scene.add(mesh);

    // Rayonnement de lumière ambiante
    const light = new THREE.DirectionalLight(0x08782f, 1.2);
    light.position.set(3, 5, 4);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0x08782f, 0.35);
    scene.add(ambient);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    meshRef.current = mesh;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    init();

    const animate = () => {
      const mesh = meshRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!mesh || !scene || !camera) return;

      mesh.rotation.y += 0.008;
      mesh.rotation.x = Math.sin(Date.now() * 0.0003) * 0.06;

      rendererRef.current?.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      animFrameRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current?.domElement.remove();
    };
  }, [init]);

  return (
    <div ref={mountRef} className="auth-hero-scene__mount" aria-hidden="true" />
  );
}
