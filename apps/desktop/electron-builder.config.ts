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

  // Use productName, not the scoped package name (`@agent-profiler/desktop`),
  // for output filenames — otherwise fpm/deb tries to create an
  // `@agent-profiler/` directory and fails.
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',

  // ─── macOS ───────────────────────────────────────────────
  mac: {
    category: 'public.app-category.developer-tools',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // identity:null disables code-signing when no CSC_LINK is provided
    // (dry-run / CI without certificates). electron-builder otherwise
    // tries to find a system identity and aborts with a cryptic
    // "not a file" error.
    identity: process.env.CSC_LINK ? undefined : null,
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
