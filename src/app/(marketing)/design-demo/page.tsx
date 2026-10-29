import { Button } from '@/components/ui/button-enhanced';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card-enhanced';
import { Counter } from '@/components/ui/counter';
import { Countdown } from '@/components/ui/countdown';
import { HeroSection } from '@/components/ui/hero-section';
import { NumberedSection } from '@/components/ui/numbered-section';
import Link from 'next/link';

export default function DesignDemoPage() {
  const rentree = new Date('2026-11-19T08:00:00');

  return (
    <div className="min-h-screen bg-[#f5f7f1] text-[#1e2c24]">
      <HeroSection
        title="La plateforme pour les commerces locaux du Burkina Faso"
        subtitle={
          "CrÃ©ez votre boutique, gÃ©rez votre catalogue, encaissez par mobile money et dÃ©veloppez votre activitÃ© avec des abonnements simples."
        }
        primaryAction={{ label: "CrÃ©er ma boutique", href: '/' }}
        secondaryAction={{ label: 'Voir les tarifs', href: '/tarifs' }}
        stats={[
          { value: '10+', label: 'Boutiques pilotes' },
          { value: '< 3 min', label: 'Pour commander' },
          { value: '0 FCFA', label: 'Frais de plateforme' },
          { value: '24/7', label: 'Support WhatsApp' },
        ]}
        badges={[
          'Paiement mobile money',
          'Sans abonnement cachÃ©',
          'ConÃ§u pour le Burkina Faso',
          'Mobile dâ€™abord'
        ]}
      />

      <section className="px-4 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-16 reveal fade-up">
          <h2 className="text-3xl md:text-4xl font-bold font-[Manrope]">Nos fonctionnalitÃ©s</h2>
          <p className="mt-4 text-[#58695e]">Tout ce dont un commerÃ§ant a besoin</p>
        </div>

        <NumberedSection
          number="01"
          title="Catalogue et produits"
          description="Ajoutez vos produits, gÃ©rez le stock, importez par CSV et organisez par catÃ©gories."
        >
          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <Card variant="product" className="p-6 card-lift">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">Gestion de stock</CardTitle>
                <CardDescription>Suivi en temps rÃ©el des quantitÃ©s disponibles.</CardDescription>
              </CardHeader>
            </Card>
            <Card variant="product" className="p-6 card-lift">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">Import CSV</CardTitle>
                <CardDescription>Importez votre catalogue en quelques clics.</CardDescription>
              </CardHeader>
            </Card>
            <Card variant="product" className="p-6 card-lift">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">Photos produits</CardTitle>
                <CardDescription>Upload d&apos;images WebP optimisÃ©es.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </NumberedSection>

        <NumberedSection
          number="02"
          title="Paiement mobile money"
          description="Encaissez par code USSD (Orange Money, Moov) vÃ©rifiÃ© par vous-mÃªme."
        >
          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <Card variant="elevated" className="p-6 card-lift">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">Code USSD</CardTitle>
                <CardDescription>Le client paie par code, vous confirmez.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="mt-6 p-4 bg-[#f0f4ed] rounded-lg border border-[#dce5dc]">
                  <p className="text-sm text-[#58695e]">RÃ©fÃ©rence unique par transaction.</p>
                </div>
              </CardContent>
            </Card>
            <Card variant="elevated" className="p-6 card-lift">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">Paiement en boutique</CardTitle>
                <CardDescription>EspÃ¨ces ou mobile money physique.</CardDescription>
              </CardHeader>
            </Card>
            <Card variant="elevated" className="p-6 card-lift">
              <CardHeader className="p-0">
                <CardTitle className="text-lg">AgrÃ©gateur (V2)</CardTitle>
                <CardDescription>Paiement automatique quand confirmÃ©.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </NumberedSection>

        <NumberedSection
          number="03"
          title="Rendez-vous et crÃ©neaux"
          description="Services, horaires, ressources et anti double-rÃ©servation garanti."
        >
          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <Card variant="featured" className="p-6 card-lift">
              <CardHeader className="p-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#155d42]" />
                  <span className="text-xs font-bold text-[#155d42] uppercase tracking-widest">Plan Pro</span>
                </div>
                <CardTitle className="text-lg">Configuration crÃ©neaux</CardTitle>
                <CardDescription>Horaires, plages, pauses, fermetures.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <Counter value="90" label="Jours Ã  l'avance" suffix=" max" />
              </CardContent>
            </Card>
          </div>
        </NumberedSection>
      </section>

      <section className="py-20 bg-white border-y border-[#dce5dc]">
        <div className="px-4 max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <Counter value="15" label="Produits gratuits" />
            <Counter value="7 500" label="FCFA / mois (Pro)" />
            <Counter value="7" label="Jours de grÃ¢ce" />
            <Counter value="3" label="Mois offerts (pilotes)" />
          </div>
        </div>
      </section>

      <section className="px-4 py-20 bg-[#155d42] text-white">
        <div className="max-w-2xl mx-auto text-center reveal fade-up">
          <h2 className="text-2xl md:text-3xl font-bold font-[Manrope] mb-4">
            Prochaine rentrÃ©e des boutiques pilotes
          </h2>
          <Countdown targetDate={rentree} label="Inscriptions ouvertes" />
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="amber" size="cta" asChild>
              <Link href="/">Je mâ€™inscris</Link>
            </Button>
            <Button variant="outline" size="cta" asChild>
              <Link href="/contact">Contactez-nous</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
