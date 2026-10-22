import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
      <div>
        <p className="text-sm font-medium text-neutral-500">Burkina Faso</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Les commerces locaux, en ligne.
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="ui-button ui-button--primary"
            href="/auth/signup"
          >
            Créer un compte
          </Link>
          <Link
            className="ui-button ui-button--secondary"
            href="/auth/login"
          >
            Se connecter
          </Link>
        </div>
      </div>
    </main>
  );
}
