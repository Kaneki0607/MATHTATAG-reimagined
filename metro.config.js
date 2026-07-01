const path = require('path');

// Use the metro-config bundled with this project's Expo SDK. Without this, Node can
// resolve a global ~/node_modules/@expo/metro-config that pulls worklets 0.6.0.
const expoPackageRoot = path.dirname(require.resolve('expo/package.json'));
const { getDefaultConfig } = require(
  require.resolve('@expo/metro-config', { paths: [expoPackageRoot] })
);

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { resolver, transformer } = config;
  resolver.sourceExts = Array.from(new Set([...(resolver.sourceExts || []), 'cjs']));
  resolver.unstable_enablePackageExports = false;

  resolver.alias = {
    ...(resolver.alias || {}),
    '@': path.resolve(__dirname),
  };

  transformer.minifierConfig = {
    keep_fnames: true,
    mangle: { keep_fnames: true },
  };

  return config;
})();