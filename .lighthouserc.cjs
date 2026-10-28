module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 120000,
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH,
      url: [
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/lhci-boutique",
        "http://127.0.0.1:3000/lhci-boutique/products/b0000000-0000-4000-8000-000000000001",
        "http://127.0.0.1:3000/shops?ville=Ouagadougou",
      ],
      settings: {
        formFactor: "mobile",
        throttlingMethod: "simulate",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
    },
    assert: {
      preset: "lighthouse:recommended",
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "resource-summary:script:size": ["error", { maxNumericValue: 200000 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
