import { useEffect, useRef, type RefObject } from "react";

type GsapContext = {
  revert: () => void;
  current: gsap.Core | null;
};

/**
 * Hook GSAP — encapsule `gsap.context()` et s'assure que le contexte
 * est restauré proprement à l'unmount. Aucun `gsap` importé globalement
 * : on importe dans chaque composant (`import { gsap } from "gsap"`).
 */
export function useGsap(
  factory: (context: {
    revert: () => void;
    gsap: gsap.Core;
  }) => void,
) {
  const contextRef = useRef<GsapContext | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [{ gsap }, { default: scrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelled) return;

      const context = gsap.context(
        () => {
          factory({ revert: contextRef.current?.revert ?? (() => undefined), gsap });
        },
        undefined,
        (ctx) => {
          contextRef.current = ctx;
        },
      );

      if (cancelled) {
        context.revert();
      }
    }

    void init();

    return () => {
      cancelled = true;
      contextRef.current?.revert();
    };
  }, [factory]);

  return contextRef as RefObject<GsapContext>;
}
