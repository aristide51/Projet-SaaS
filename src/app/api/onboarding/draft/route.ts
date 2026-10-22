import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import { saveOnboardingSchema } from "@/features/onboarding/schemas";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > 32_768) {
    return NextResponse.json(
      { error: "Brouillon trop volumineux." },
      { status: 413 },
    );
  }

  const bodyText = await request.text();

  if (bodyText.length > 32_768) {
    return NextResponse.json(
      { error: "Brouillon trop volumineux." },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  const parsedDraft = parsedBody.success
    ? saveOnboardingSchema.safeParse(parsedBody.data.snapshot)
    : null;

  if (!parsedBody.success || !parsedDraft?.success) {
    return NextResponse.json({ error: "Brouillon invalide." }, { status: 400 });
  }

  const user = await getUser();

  if (!user?.email_confirmed_at) {
    return NextResponse.json(
      { error: "Authentification requise." },
      { status: 401 },
    );
  }

  const supabase = await createClient();
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id")
    .eq("id", parsedBody.data.shopId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (shopError) {
    await logError("shop_onboarding_save_failed", shopError);
    return NextResponse.json(
      { error: "Brouillon non enregistré." },
      { status: 500 },
    );
  }

  if (!shop) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("shop_onboarding")
    .update({
      current_step: parsedDraft.data.currentStep,
      draft: parsedDraft.data.draft,
    })
    .eq("shop_id", shop.id)
    .select("shop_id")
    .maybeSingle();

  if (error) {
    await logError("shop_onboarding_save_failed", error);
    return NextResponse.json(
      { error: "Brouillon non enregistré." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Brouillon introuvable." },
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

const bodySchema = z
  .object({
    shopId: z.string().uuid(),
    snapshot: z.unknown(),
  })
  .strict();
