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
    const mountElement = mount;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let disposed = false;
    let initialized = false;
    let isVisible = false;
    let animationFrame: number | null = null;
    let renderer: WebGLRenderer | null = null;
    let mesh: Mesh | null = null;
    let material: MeshStandardMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let startAnimation: (() => void) | undefined;

    async function init() {
      if (initialized || motionPreference.matches) return;
      initialized = true;

      const THREE = await import("three");
      if (disposed || !mountElement.isConnected || motionPreference.matches) {
        initialized = false;
        return;
      }

      const width = Math.max(mountElement.clientWidth, 1);
      const height = Math.max(mountElement.clientHeight, 1);
      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 2, 6);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mountElement.appendChild(renderer.domElement);

      const geometry = new THREE.SphereGeometry(1.6, 48, 48);
      material = new THREE.MeshStandardMaterial({
        color: 0xe10b17,
        roughness: 0.35,
        metalness: 0.18,
        emissive: 0x5c0810,
        emissiveIntensity: 0.08,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.y = 0.4;
      mesh.position.y = -0.4;
      scene.add(mesh);

      const light = new THREE.DirectionalLight(0xffe500, 1.2);
      light.position.set(3, 5, 4);
      scene.add(light);

      const ambient = new THREE.AmbientLight(0xffffff, 0.35);
      scene.add(ambient);

      const render = () => {
        if (disposed || !renderer || !mesh) return;

        mesh.rotation.y += 0.008;
        mesh.rotation.x = Math.sin(Date.now() * 0.0003) * 0.06;
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(render);
      };
      startAnimation = () => {
        if (isVisible && animationFrame === null) {
          animationFrame = window.requestAnimationFrame(render);
        }
      };

      resizeObserver = new ResizeObserver(() => {
        if (!renderer) return;
        const nextWidth = Math.max(mountElement.clientWidth, 1);
        const nextHeight = Math.max(mountElement.clientHeight, 1);
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      });
      resizeObserver.observe(mountElement);
      visibilityObserver = new IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible && !motionPreference.matches) {
          startAnimation?.();
        } else if (!isVisible && animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
      });
      visibilityObserver.observe(mountElement);

      startAnimation();
    }

    function handleMotionPreferenceChange() {
      if (motionPreference.matches) {
        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        return;
      }

      if (startAnimation) {
        startAnimation();
      } else {
        void init();
      }
    }

    motionPreference.addEventListener("change", handleMotionPreferenceChange);
    if (!motionPreference.matches) void init();

    return () => {
      disposed = true;
      motionPreference.removeEventListener(
        "change",
        handleMotionPreferenceChange,
      );
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      mesh?.geometry.dispose();
      material?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div ref={mountRef} className="auth-hero-scene__mount" aria-hidden="true" />
  );
}
