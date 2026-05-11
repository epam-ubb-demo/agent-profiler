import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import astroMermaid from "astro-mermaid";

export default defineConfig({
  site: "https://epam-ubb-demo.github.io",
  base: "/agent-profiler/tool",
  integrations: [
    starlight({
      title: "Agent Profiler — Tool",
      description:
        "OTel Gateway, desktop application, and adapter documentation for Agent Profiler.",
      favicon: "/favicon.svg",
      plugins: [
        starlightLinksValidator({
          exclude: ["/agent-profiler/project/**"],
        }),
        starlightLlmsTxt(),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/epam-ubb-demo/agent-profiler",
        },
      ],
      sidebar: [
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
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      pagination: true,
      expressiveCode: true,
      customCss: ["./src/styles/custom.css"],
    }),
    astroMermaid(),
  ],
});
