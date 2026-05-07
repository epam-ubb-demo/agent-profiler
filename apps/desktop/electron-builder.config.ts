import type { Configuration } from 'electron-builder';

/**
 * Electron-builder configuration for Agent Profiler.
 *
 * Code signing is optional — the build succeeds unsigned when
 * CSC_LINK / CSC_KEY_PASSWORD env vars are absent.
 */
const config: Configuration = {
  appId: 'com.epam.agent-profiler',
  productName: 'Agent Profiler',
  directories: {
    output: 'dist-release',
    buildResources: 'build',
  },
  files: ['out/**/*', 'package.json'],

  // ─── macOS ───────────────────────────────────────────────
  mac: {
    category: 'public.app-category.developer-tools',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: false, // Enable when Apple credentials are configured
  },

  // ─── Windows ─────────────────────────────────────────────
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    signingHashAlgorithms: ['sha256'],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },

  // ─── Linux ───────────────────────────────────────────────
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Development',
    maintainer: 'EPAM UBB <ubb@epam.com>',
  },

  // ─── Publishing (GitHub Releases for auto-update) ────────
  publish: {
    provider: 'github',
    owner: 'epam-ubb-demo',
    repo: 'agent-profiler',
  },
};

export default config;
