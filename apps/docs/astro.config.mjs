import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://epam-ubb-demo.github.io',
  base: '/agent-profiler/',
  integrations: [
    starlight({
      title: 'Agent Profiler',
      description: 'Visualise AI coding-agent sessions',
      plugins: [
        starlightLinksValidator({
          errorOnRelativeLinks: false,
          errorOnLocalLinks: false,
        }),
        starlightLlmsTxt(),
      ],
      customCss: [],
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#5b21b6' },
        },
        {
          tag: 'style',
          content: `
            .sl-banner {
              background-color: #78350f;
              color: #fef3c7;
              text-align: center;
              padding: 0.5rem 1rem;
              font-size: 0.875rem;
            }
            header.header { border-top: 3px solid #d97706; }
          `,
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/epam-ubb-demo/agent-profiler',
        },
      ],
      sidebar: [
        {
          label: 'Getting started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'User guide',
          autogenerate: { directory: 'user-guide' },
        },
        {
          label: 'Adapter reference',
          autogenerate: { directory: 'adapters' },
        },
        {
          label: 'Architecture & ADRs',
          autogenerate: { directory: 'architecture' },
        },
        {
          label: 'Contributing & operations',
          autogenerate: { directory: 'contributing' },
        },
      ],
      components: {
        Footer: './src/components/Footer.astro',
      },
    }),
    sitemap(),
  ],
});
