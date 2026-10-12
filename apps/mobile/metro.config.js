/* eslint-env node */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace: Metro has to be told about the root so `@ahlan/shared`
// resolves, and told not to walk up past it.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays on: `node-linker=hoisted` in .npmrc puts the
// dependencies in the root node_modules, which is exactly what it walks up to.

module.exports = withNativeWind(config, { input: './global.css' });
