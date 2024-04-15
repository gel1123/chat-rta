import { defineConfig } from "astro/config";
import aws from "astro-sst";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "server",
  adapter: aws({
    deploymentStrategy: "regional",
    // https://github.com/sst/ion/issues/196
    serverRoutes: ["api/*"],
  }),
  integrations: [tailwind()],
});
