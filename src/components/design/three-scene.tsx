"use client";

import { useEffect, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";

type ThreeSceneProps = Readonly<{
  onUnavailable?: () => void;
}>;

export default function ThreeScene({ onUnavailable }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let frame = 0;
    let renderer: WebGLRenderer | undefined;
    let scene: Scene | undefined;
    let camera: PerspectiveCamera | undefined;
    let group: Group | undefined;
    let particles: Points | undefined;
    let coreGeometry: IcosahedronGeometry | undefined;
    let coreMaterial: MeshStandardMaterial | undefined;
    let ringGeometry: TorusGeometry | undefined;
    let ringMaterial: MeshStandardMaterial | undefined;
    let particleGeometry: BufferGeometry | undefined;
    let particleMaterial: PointsMaterial | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let visibilityObserver: IntersectionObserver | undefined;
    let cancelled = false;
    let isVisible = false;
    let cleanup = () => {};

    function initializeScene() {
      if (cancelled || !mount) return;

      scene = new Scene();
      scene.fog = new FogExp2(0x035c23, 0.045);

      camera = new PerspectiveCamera(
        36,
        mount.clientWidth / Math.max(mount.clientHeight, 1),
        0.1,
        100,
      );
      camera.position.set(0, 1.2, 5.2);

      try {
        renderer = new WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.setAttribute("role", "presentation");
        mount.appendChild(renderer.domElement);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Error creating WebGL context."
        ) {
          onUnavailable?.();
          return;
        }
        throw error;
      }

      group = new Group();

      coreGeometry = new IcosahedronGeometry(1.05, 1);
      coreMaterial = new MeshStandardMaterial({
        color: 0xe10b17,
        metalness: 0.22,
        roughness: 0.28,
        flatShading: true,
      });
      const core = new Mesh(coreGeometry, coreMaterial);
      group.add(core);

      ringGeometry = new TorusGeometry(1.55, 0.035, 16, 64);
      ringMaterial = new MeshStandardMaterial({
        color: 0xf6e400,
        metalness: 0.4,
        roughness: 0.18,
        transparent: true,
        opacity: 0.42,
      });
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      scene.add(group);

      const particleCount = motionPreference.matches ? 40 : 160;
      particleGeometry = new BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount * 3; i++) {
        particlePositions[i] = (Math.random() - 0.5) * 14;
      }
      particleGeometry.setAttribute(
        "position",
        new BufferAttribute(particlePositions, 3),
      );
      particleMaterial = new PointsMaterial({
        color: 0xffffff,
        size: motionPreference.matches ? 0.04 : 0.055,
        transparent: true,
        opacity: 0.55,
        sizeAttenuation: true,
      });
      particles = new Points(particleGeometry, particleMaterial);
      scene.add(particles);

      scene.add(new HemisphereLight(0xf7f8f6, 0x035c23, 1.8));
      const keyLight = new DirectionalLight(0xffffff, 2.6);
      keyLight.position.set(3, 4, 5);
      scene.add(keyLight);
      const fillLight = new DirectionalLight(0xf6e400, 1.2);
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
      visibilityObserver = new IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible && !motionPreference.matches && !frame) {
          frame = window.requestAnimationFrame(render);
        } else if (!isVisible && frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      });
      visibilityObserver.observe(mount);

      let mouseX = 0;
      let mouseY = 0;
      const onMouseMove = (event: MouseEvent) => {
        if (motionPreference.matches) return;
        mouseX = (event.clientX / mount.clientWidth) * 2 - 1;
        mouseY = -(event.clientY / mount.clientHeight) * 2 + 1;
      };
      window.addEventListener("mousemove", onMouseMove);

      const render = (time = 0) => {
        frame = 0;
        if (!renderer || !scene || !camera || !group || !particles) return;

        const elapsed = time * 0.001;

        if (!motionPreference.matches) {
          group.rotation.y = elapsed * 0.16;
          group.rotation.x = Math.sin(elapsed * 0.22) * 0.1;
          group.rotation.y += mouseX * 0.05;
          group.rotation.x += mouseY * 0.05;

          const positions = particles.geometry.attributes
            .position as BufferAttribute;
          const count = positions.count;
          for (let i = 0; i < count; i++) {
            positions.setY(i, Math.sin(elapsed * 0.14 + i) * 0.035);
          }
          positions.needsUpdate = true;
        }

        renderer.render(scene, camera);

        if (isVisible && !motionPreference.matches) {
          frame = window.requestAnimationFrame(render);
        }
      };

      const onMotionPreferenceChange = () => {
        if (motionPreference.matches && frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        } else if (isVisible && !frame) {
          frame = window.requestAnimationFrame(render);
        }
      };
      motionPreference.addEventListener("change", onMotionPreferenceChange);
      if (!motionPreference.matches)
        frame = window.requestAnimationFrame(render);

      cleanup = () => {
        if (frame) window.cancelAnimationFrame(frame);
        window.removeEventListener("mousemove", onMouseMove);
        motionPreference.removeEventListener(
          "change",
          onMotionPreferenceChange,
        );
        resizeObserver?.disconnect();
        visibilityObserver?.disconnect();
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
  }, [onUnavailable]);

  return <div aria-hidden="true" className="three-scene" ref={mountRef} />;
}
