export type SampleShopType =
  | "hardware"
  | "auto_parts"
  | "garage"
  | "salon";

export type SampleProduct = {
  name: string;
  description: string;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  compatibility: string | null;
  stock: number | null;
  status: "available" | "out_of_stock" | "hidden";
  category_name: string;
  variant_name: string | null;
  variant_price: number | null;
  variant_stock: number | null;
};

export type SampleService = {
  name: string;
  description: string;
  duration_min: number;
  price: number;
  deposit_amount: number;
};

export type SampleCatalog = {
  shopType: SampleShopType;
  title: string;
  products: SampleProduct[];
  services: SampleService[];
};

const baseCategory = (shopType: SampleShopType) => {
  switch (shopType) {
    case "hardware":
      return "Quincaillerie";
    case "auto_parts":
      return "Pièces détachées";
    case "garage":
      return "Entretien";
    case "salon":
      return "Coiffure";
  }
};

const hardwareProducts: SampleProduct[] = [
  {
    name: "Marteau de charpentier 500 g",
    description: "Marteau à griffe avec manche en bois, idéal pour la menuiserie.",
    price: 6500,
    compare_at_price: 8000,
    sku: "QMC-MAR-001",
    compatibility: "Bois, clous",
    stock: 15,
    status: "available",
    category_name: "Outillage",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Tournevis cruciforme Phillips PH2",
    description: "Tournevis à tête cruciforme pour vis Phillips, manche isolé.",
    price: 2500,
    compare_at_price: null,
    sku: "QMC-TRN-002",
    compatibility: "Vis Phillips PH2",
    stock: 30,
    status: "available",
    category_name: "Outillage",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Paquet de clous 2,5 x 50 mm (500 g)",
    description: "Clous de charpente galvanisés, sachet de 500 g.",
    price: 3200,
    compare_at_price: null,
    sku: "QMC-CLO-003",
    compatibility: "Bois",
    stock: 40,
    status: "available",
    category_name: "Fixation",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Plaque de plâtre BA13 250 x 60 x 2 cm",
    description: "Plaque de plâtre à bords amincis pour cloisons et plafonds.",
    price: 4500,
    compare_at_price: null,
    sku: "QMC-PLA-004",
    compatibility: "Cloisons sèches",
    stock: 25,
    status: "available",
    category_name: "Matériaux",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Peinture murale mat blanc 10 L",
    description: "Peinture acrylique mat pour murs intérieurs, blanc éclatant.",
    price: 12000,
    compare_at_price: 15000,
    sku: "QMC-PNT-005",
    compatibility: "Murs intérieurs",
    stock: 12,
    status: "available",
    category_name: "Peinture",
    variant_name: "Finition satinée",
    variant_price: 13500,
    variant_stock: 8,
  },
];

const autoPartsProducts: SampleProduct[] = [
  {
    name: "Filtre à huile compatible Toyota Corolla",
    description: "Filtre à huile de rechange pour moteurs Toyota Corolla générations récentes.",
    price: 4500,
    compare_at_price: null,
    sku: "AP-FIL-001",
    compatibility: "Toyota Corolla",
    stock: 20,
    status: "available",
    category_name: "Filtres",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Plaquettes de frein avant (paire)",
    description: "Plaquettes de frein avant pour voitures de tourisme, jeu de 2.",
    price: 8500,
    compare_at_price: 10500,
    sku: "AP-PLA-002",
    compatibility: "Véhicules légers",
    stock: 10,

const garageProducts: SampleProduct[] = [
  {
    name: "Pneu 175/65 R14 neuf",
    description: "Pneu tourisme neuf, marque qualité, montage possible en atelier.",
    price: 12000,
    compare_at_price: 14500,
    sku: "GR-PNE-001",
    compatibility: "Citadines",
    stock: 8,
    status: "available",
    category_name: "Pneumatiques",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Bougie d'allumage NGK",
    description: "Bougie d'allumage pour moteurs essence, filetage standard.",
    price: 3500,
    compare_at_price: null,
    sku: "GR-BOU-002",
    compatibility: "Essence",
    stock: 15,
    status: "available",
    category_name: "Allumage",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Kit de distribution complet",
    description: "Kit courroie + galets + pompe à eau pour moteurs 1.5L essence.",
    price: 35000,
    compare_at_price: null,
    sku: "GR-KIT-003",
    compatibility: "Moteurs 1.5L",
    stock: 3,
    status: "available",
    category_name: "Distribution",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Liquide de frein DOT 4 1 L",
    description: "Liquide de frein synthétique DOT 4, bidon d'un litre.",
    price: 5500,
    compare_at_price: null,
    sku: "GR-LIQ-004",
    compatibility: "Freins hydrauliques",
    stock: 12,
    status: "available",
    category_name: "Liquides",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Balai d'essuie-glace 650 mm",
    description: "Balai d'essuie-glace avant, longueur 650 mm, fixation universelle.",
    price: 4500,
    compare_at_price: null,
    sku: "GR-BAL-005",
    compatibility: "Pare-brise avant",
    stock: 10,
    status: "available",
    category_name: "Visibilité",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
];

const salonProducts: SampleProduct[] = [
  {

const hardwareServices: SampleService[] = [
  {
    name: "Découpe de bois sur mesure",
    description: "Découpe précise de planches et panneaux selon vos dimensions.",
    duration_min: 30,
    price: 3000,
    deposit_amount: 0,
  },
];

const autoPartsServices: SampleService[] = [
  {
    name: "Vidange moteur",
    description: "Vidange complète avec remplacement du filtre à huile.",
    duration_min: 45,
    price: 15000,
    deposit_amount: 0,
  },
];

const garageServices: SampleService[] = [
  {
    name: "Vidange et filtre",
    description: "Vidange moteur avec remplacement du filtre à huile et contrôle des niveaux.",
    duration_min: 45,
    price: 18000,
    deposit_amount: 0,
  },
  {
    name: "Plaquettes de frein (pose comprise)",
    description: "Remplacement des plaquettes de frein avant avec contrôle des disques.",
    duration_min: 60,
    price: 25000,
    deposit_amount: 0,
  },
];

const salonServices: SampleService[] = [
  {
    name: "Coupe homme",
    description: "Coupe classique ou moderne avec tondeuse et ciseaux.",
    duration_min: 30,
    price: 3000,
    deposit_amount: 0,
  },
  {
    name: "Coupe femme avec brushing",
    description: "Coupe et mise en plis avec brushing pour une finition soignée.",
    duration_min: 60,
    price: 8000,
    deposit_amount: 2000,
  },
];

export const SAMPLE_CATALOGS: Record<SampleShopType, SampleCatalog> = {
  hardware: {
    shopType: "hardware",
    title: "Matériaux, outils et équipements",
    products: hardwareProducts,
    services: hardwareServices,
  },
  auto_parts: {
    shopType: "auto_parts",
    title: "Pièces et accessoires automobiles",
    products: autoPartsProducts,
    services: autoPartsServices,
  },
  garage: {
    shopType: "garage",
    title: "Réparation et entretien",
    products: garageProducts,
    services: garageServices,
  },
  salon: {
    shopType: "salon",
    title: "Coiffure et soins",
    products: salonProducts,
    services: salonServices,
  },
};

export function getSampleCatalog(shopType: SampleShopType): SampleCatalog {
  return SAMPLE_CATALOGS[shopType];
}
    name: "Shampoing doux 500 ml",
    description: "Shampoing pour tous types de cheveux, formule douce sans parabène.",
    price: 6500,
    compare_at_price: null,
    sku: "SL-SHA-001",
    compatibility: "Tous cheveux",
    stock: 20,
    status: "available",
    category_name: "Hygiène capillaire",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Après-shampoing démêlant 400 ml",
    description: "Après-shampoing qui facilite le coiffage et réduit les nœuds.",
    price: 7500,
    compare_at_price: null,
    sku: "SL-APR-002",
    compatibility: "Cheveux longs",
    stock: 15,
    status: "available",
    category_name: "Hygiène capillaire",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Teinture cheveux noir naturel",
    description: "Coloration permanente sans ammoniaque, teinte noir naturel.",
    price: 9500,
    compare_at_price: null,
    sku: "SL-TEI-003",
    compatibility: "Cheveux foncés",
    stock: 10,
    status: "available",
    category_name: "Coloration",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Sérum hydratant 100 ml",
    description: "Sérum sans rinçage pour cheveux secs et cassants.",
    price: 8500,
    compare_at_price: 10500,
    sku: "SL-SER-004",
    compatibility: "Cheveux secs",
    stock: 8,
    status: "available",
    category_name: "Soins",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Cape de coiffure noire",
    description: "Cape de protection imperméable pour coupe et couleur.",
    price: 5500,
    compare_at_price: null,
    sku: "SL-CAP-005",
    compatibility: "Adultes",
    stock: 6,
    status: "available",
    category_name: "Accessoires",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
];
    status: "available",
    category_name: "Freinage",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Batterie 12V 60Ah",
    description: "Batterie automobile 12 volts, 60 ampères-heure, avec borne positive à droite.",
    price: 45000,
    compare_at_price: null,
    sku: "AP-BAT-003",
    compatibility: "Voitures de tourisme",
    stock: 6,
    status: "available",
    category_name: "Électricité",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Ampoule phare H7 12V 55W",
    description: "Ampoule de phare halogène H7, 12 volts, 55 watts, vente à l'unité.",
    price: 3200,
    compare_at_price: null,
    sku: "AP-AMP-004",
    compatibility: "Phares avant",
    stock: 25,
    status: "available",
    category_name: "Éclairage",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
  {
    name: "Huile moteur 15W40 5 L",
    description: "Huile moteur minérale pour essence et diesel, bidon de 5 litres.",
    price: 15000,
    compare_at_price: 17500,
    sku: "AP-HUI-005",
    compatibility: "Essence, Diesel",
    stock: 18,
    status: "available",
    category_name: "Lubrifiants",
    variant_name: null,
    variant_price: null,
    variant_stock: null,
  },
];