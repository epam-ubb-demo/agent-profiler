import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import astroMermaid from "astro-mermaid";

export default defineConfig({
  site: "https://epam-ubb-demo.github.io",
  base: "/agent-profiler",
  integrations: [
    starlight({
      title: "Agent Profiler",
      description:
        "Desktop application for visualising AI agent session logs and OpenTelemetry traces.",
      favicon: "/favicon.svg",
      plugins: [starlightLinksValidator(), starlightLlmsTxt()],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/epam-ubb-demo/agent-profiler",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "guides" },
        },
        {
          label: "OTel Gateway",
          autogenerate: { directory: "otel-gateway" },
        },
        {
          label: "Desktop App",
          autogenerate: { directory: "desktop" },
        },
        {
          label: "Adapters",
          autogenerate: { directory: "adapters" },
        },
        {
          label: "Architecture Decisions",
          autogenerate: { directory: "decisions" },
        },
        {
          label: "Operations",
          autogenerate: { directory: "operations" },
        },
        {
          label: "Contributing",
          autogenerate: { directory: "contributing" },
        },
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      pagination: true,
      expressiveCode: true,
      customCss: ["./src/styles/custom.css"],
    }),
    astroMermaid(),
  ],
});
