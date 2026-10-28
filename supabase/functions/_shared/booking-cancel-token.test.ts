import {
  signBookingCancelToken,
  verifyBookingCancelToken,
} from "./booking-cancel-token.ts";

Deno.test("booking cancellation token detects a modified signature", async () => {
  const token = await signBookingCancelToken(
    {
      booking_id: "00000000-0000-4000-8000-000000000001",
      reminder_stage: "24_hours",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    "a".repeat(32),
  );

  if (await verifyBookingCancelToken(token, "b".repeat(32))) {
    throw new Error("A token signed with another key was accepted.");
  }
});

Deno.test("booking cancellation token rejects expired links", async () => {
  const token = await signBookingCancelToken(
    {
      booking_id: "00000000-0000-4000-8000-000000000001",
      reminder_stage: "2_hours",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    },
    "a".repeat(32),
  );

  if (await verifyBookingCancelToken(token, "a".repeat(32))) {
    throw new Error("An expired booking cancellation token was accepted.");
  }
});
