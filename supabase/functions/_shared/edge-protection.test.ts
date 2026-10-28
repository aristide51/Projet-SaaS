import {
  edgeRateLimitPolicies,
  withEdgeProtection,
} from "./edge-protection.ts";

Deno.test(
  "limites par IP et utilisateur, CORS, taille et Retry-After",
  async () => {
    const originalFetch = globalThis.fetch;
    const originalOrigins = Deno.env.get("EDGE_ALLOWED_ORIGINS");
    const originalUrl = Deno.env.get("SUPABASE_URL");
    const originalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const counts = new Map<string, number>();
    let rpcCalls = 0;

    Deno.env.set("EDGE_ALLOWED_ORIGINS", "https://shop.example");
    Deno.env.set("SUPABASE_URL", "https://project.example");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    globalThis.fetch = async (_input, init) => {
      rpcCalls += 1;
      const args = JSON.parse(String(init?.body)) as {
        p_policy: string;
        p_subject_hash: string;
        p_limit: number;
      };
      const key = `${args.p_policy}:${args.p_subject_hash}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Response.json([
        { allowed: count <= args.p_limit, retry_after: 17 },
      ]);
    };

    const request = (ip: string) =>
      new Request("https://edge.example/function", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://shop.example",
          "X-Forwarded-For": ip,
        },
        body: "{}",
      });

    try {
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await withEdgeProtection(
          request("192.0.2.10"),
          { policy: "login" },
          async () => Response.json({ ok: true }),
        );
        if (attempt < 10) {
          assert(response.status === 200, "requête IP sous le quota acceptée");
        } else {
          assert(response.status === 429, "dépassement IP refusé");
          assert(
            response.headers.get("Retry-After") === "17",
            "Retry-After fourni",
          );
          assert(
            response.headers.get("Access-Control-Allow-Origin") ===
              "https://shop.example",
            "origine autorisée renvoyée explicitement",
          );
          const payload = await response.json();
          assert(payload.error.code === "RATE_LIMITED", "erreur uniforme");
        }
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await withEdgeProtection(
          request("192.0.2.11"),
          { policy: "booking" },
          async (context) =>
            (await context.limitUser("user-123")) ??
            Response.json({ ok: true }),
        );
        assert(
          response.status === (attempt < 5 ? 200 : 429),
          "quota utilisateur respecté",
        );
      }

      const policyCases = [
        ["order_creation", 5],
        ["payment_declaration", 3],
        ["booking", 5],
        ["review", 3],
        ["invoice_receipt", 5],
      ] as const;
      for (const [policy, expectedLimit] of policyCases) {
        assert(
          edgeRateLimitPolicies[policy].userLimit === expectedLimit,
          `quota utilisateur configuré pour ${policy}`,
        );
        for (let attempt = 0; attempt <= expectedLimit; attempt += 1) {
          const response = await withEdgeProtection(
            request(
              `192.0.2.${
                20 + policyCases.findIndex(([name]) => name === policy)
              }`,
            ),
            { policy },
            async (context) =>
              (await context.limitUser(`user-${policy}`)) ??
              Response.json({ ok: true }),
          );
          assert(
            response.status === (attempt < expectedLimit ? 200 : 429),
            `quota dépassé correctement pour ${policy}`,
          );
        }
      }

      const callsBeforeRejectedRequests = rpcCalls;
      const badOrigin = await withEdgeProtection(
        new Request("https://edge.example/function", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://attacker.example",
          },
          body: "{}",
        }),
        { policy: "review" },
        async () => Response.json({ ok: true }),
      );
      assert(badOrigin.status === 403, "origine inconnue refusée");

      const oversized = await withEdgeProtection(
        new Request("https://edge.example/function", {
          method: "POST",
          headers: {
            "Content-Length": "8193",
            "Content-Type": "application/json",
            Origin: "https://shop.example",
          },
          body: "{}",
        }),
        { policy: "login" },
        async () => Response.json({ ok: true }),
      );
      assert(oversized.status === 413, "corps trop volumineux refusé");
      assert(
        rpcCalls === callsBeforeRejectedRequests,
        "origine et taille invalides rejetées avant l’appel au compteur",
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOrigins === undefined)
        Deno.env.delete("EDGE_ALLOWED_ORIGINS");
      else Deno.env.set("EDGE_ALLOWED_ORIGINS", originalOrigins);
      if (originalUrl === undefined) Deno.env.delete("SUPABASE_URL");
      else Deno.env.set("SUPABASE_URL", originalUrl);
      if (originalServiceKey === undefined) {
        Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      } else {
        Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", originalServiceKey);
      }
    }
  },
);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
