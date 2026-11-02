import { useEffect, useRef, type RefObject } from "react";

type GsapContext = {
  revert: () => void;
  current: gsap.Context | null;
};

/**
 * Hook GSAP — encapsule `gsap.context()` et s'assure que le contexte
 * est restauré proprement à l'unmount. Aucun `gsap` importé globalement
 * : on importe dans chaque composant (`import { gsap } from "gsap"`).
 */
export function useGsap(
  factory: (context: {
    revert: () => void;
    gsap: typeof import("gsap").gsap;
  }) => void,
) {
  const contextRef = useRef<GsapContext | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);
      const context = gsap.context((ctx) => {
        factory({ revert: () => ctx.revert(), gsap });
      });
      contextRef.current = {
        current: context,
        revert: () => context.revert(),
      };

      if (cancelled) {
        context.revert();
        contextRef.current = null;
      }
    }

    void init();

    return () => {
      cancelled = true;
      contextRef.current?.revert();
      contextRef.current = null;
    };
  }, [factory]);

  return contextRef as RefObject<GsapContext>;
}
