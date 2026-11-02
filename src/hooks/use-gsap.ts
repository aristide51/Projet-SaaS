import { useEffect, useRef } from "react";

type GsapContext = gsap.Context;
type GsapApi = typeof import("gsap").gsap;

/**
 * Hook GSAP — encapsule `gsap.context()` et restaure proprement le contexte
 * au démontage. GSAP et ScrollTrigger sont chargés uniquement côté client.
 */
export function useGsap(
  factory: (context: { revert: () => void; gsap: GsapApi }) => void,
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

      gsap.registerPlugin(scrollTrigger);
      const context = gsap.context(() => {
        factory({
          revert: () => contextRef.current?.revert(),
          gsap,
        });
      });
      contextRef.current = context;

      if (cancelled) context.revert();
    }

    void init();

    return () => {
      cancelled = true;
      contextRef.current?.revert();
      contextRef.current = null;
    };
  }, [factory]);

  return contextRef;
}
