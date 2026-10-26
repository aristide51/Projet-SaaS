import Link from "next/link";
import { HeroAnimation } from "@/components/design/hero-animation";
import { DesignMotion } from "@/components/design/design-motion";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col canvas">
      <HeroAnimation />

      <section className="py-20 px-4 border-t border-border canvas">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 design-reveal">
            <span className="eyebrow design-reveal">Pourquoi choisir Faso Studio ?</span>
            <h2 className="mt-4 text-3xl font-display font-bold text-ink design-reveal">
              Tout ce dont un commerçant a besoin
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3 design-stagger">
            <article className="p-8 surface rounded-xl border border-border hover:shadow-floating transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary-soft flex items-center justify-center mb-6 text-primary">
                <span aria-hidden="true">📦</span>
              </div>
              <h3 className="font-display font-bold text-lg mb-3">Catalogue produits</h3>
              <p className="text-sm text-muted leading-relaxed">
                Ajoutez vos produits, variantes, prix et stocks. Tout est géré
                depuis votre tableau de bord.
              </p>
            </article>

            <article className="p-8 surface rounded-xl border border-border hover:shadow-floating transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary-soft flex items-center justify-center mb-6 text-primary">
                <span aria-hidden="true">📅</span>
              </div>
              <h3 className="font-display font-bold text-lg mb-3">Rendez-vous</h3>
              <p className="text-sm text-muted leading-relaxed">
                Proposez des créneaux de réservation pour vos services. Vos
                clients bookent en ligne.
              </p>
            </article>

            <article className="p-8 surface rounded-xl border border-border hover:shadow-floating transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary-soft flex items-center justify-center mb-6 text-primary">
                <span aria-hidden="true">💳</span>
              </div>
              <h3 className="font-display font-bold text-lg mb-3">Mobile Money</h3>
              <p className="text-sm text-muted leading-relaxed">
                Encaissez par Orange Money ou Moov. Paiement par code USSD
                vérifié par vous-même au MVP.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <div className="design-reveal">
              <span className="eyebrow design-reveal">Une scène 3D légère</span>
              <h2 className="mt-4 text-3xl font-display font-bold text-ink design-reveal">
                Du relief, sans ralentir le quotidien
              </h2>
              <p className="mt-6 text-muted leading-relaxed design-reveal">
                GSAP et ScrollTrigger guident le regard. Une scène Three.js
                souligne les moments clés — jamais les tâches du commerçant.
              </p>
            </div>
            <div className="relative h-[400px] w-full design-reveal">
              <DesignMotion />
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 canvas border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-display font-bold text-ink mb-6 design-reveal">
            Prêt à lancer votre boutique ?
          </h2>
          <p className="text-muted mb-10 leading-relaxed design-reveal">
            Rejoignez les boutiques pilotes et bénéficiez de 3 mois gratuits.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center design-reveal">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-primary text-on-primary rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/auth/login"
              className="px-8 py-4 border border-border rounded-lg font-medium text-sm text-ink hover:bg-surface-raised transition-colors"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
