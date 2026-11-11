import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  incrementalCache: "dummy",
  queue: "dummy",
  tagCache: "dummy",
});
