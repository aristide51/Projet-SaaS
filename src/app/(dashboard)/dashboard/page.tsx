import Link from "next/link";
import { Button } from "@/components/ui/button-enhanced";
import { Card } from "@/components/ui/card-enhanced";
import { Counter } from "@/components/ui/counter";

export default function DashboardPage() {
  return (
    <main className="auth-main">
      <section className="auth-card">
        <p className="auth-eyebrow">Espace commerçant</p>
        <h1>Tableau de bord</h1>
        <p>Configurez votre boutique et gérez son catalogue depuis cet espace.</p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 reveal fade-up">
          <Counter value="0" label="Commandes en attente" />
          <Counter value="0" label="Rendez-vous aujourd'hui" />
          <Counter value="0 FCFA" label="Chiffre d'affaires" />
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 reveal fade-up" style={{ transitionDelay: '200ms' }}>
          <Card variant="elevated" className="p-6 card-lift">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-[#f0f4ed] text-[#155d42] flex items-center justify-center text-lg font-bold">📦</span>
              <div>
                <p className="text-sm text-[#58695e]">Catalogue</p>
                <p className="text-base font-semibold text-[#1e2c24]">Gérer les produits</p>
              </div>
            </div>
          </Card>
          <Card variant="elevated" className="p-6 card-lift">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-[#f0f4ed] text-[#155d42] flex items-center justify-center text-lg font-bold">📋</span>
              <div>
                <p className="text-sm text-[#58695e]">Commandes</p>
                <p className="text-base font-semibold text-[#1e2c24]">Suivre les demandes</p>
              </div>
            </div>
          </Card>
          <Card variant="elevated" className="p-6 card-lift">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-[#f0f4ed] text-[#155d42] flex items-center justify-center text-lg font-bold">📅</span>
              <div>
                <p className="text-sm text-[#58695e]">Rendez-vous</p>
                <p className="text-base font-semibold text-[#1e2c24]">Gérer les créneaux</p>
              </div>
            </div>
          </Card>
          <Card variant="elevated" className="p-6 card-lift">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-[#f0f4ed] text-[#155d42] flex items-center justify-center text-lg font-bold">💰</span>
              <div>
                <p className="text-sm text-[#58695e]">Abonnement</p>
                <p className="text-base font-semibold text-[#1e2c24]">Gérer le plan</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 reveal fade-up" style={{ transitionDelay: '300ms' }}>
          <Button variant="primary" size="cta" asChild>
            <Link href="/dashboard/onboarding">Ouvrir la mise en route</Link>
          </Button>
          <Button variant="secondary" size="lg" asChild>
            <Link href="/dashboard/catalog">Gérer le catalogue</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/dashboard/orders">Gérer les commandes</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/dashboard/bookings">Gérer les rendez-vous</Link>
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 reveal fade-up" style={{ transitionDelay: '400ms' }}>
          <Card variant="product" className="p-6 card-lift">
            <div>
              <p className="text-sm text-[#58695e]">Équipe</p>
              <p className="text-base font-semibold text-[#1e2c24]">Gérer mon équipe</p>
            </div>
          </Card>
          <Card variant="product" className="p-6 card-lift">
            <div>
              <p className="text-sm text-[#58695e]">Promotions</p>
              <p className="text-base font-semibold text-[#1e2c24]">Gérer les promotions</p>
            </div>
          </Card>
          <Card variant="product" className="p-6 card-lift">
            <div>
              <p className="text-sm text-[#58695e]">Avis</p>
              <p className="text-base font-semibold text-[#1e2c24]">Répondre aux avis</p>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
