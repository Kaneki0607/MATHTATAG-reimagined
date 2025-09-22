const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  // Support CommonJS (.cjs) – needed by some Firebase RN internals
  const { resolver, transformer } = config;
  resolver.sourceExts = Array.from(new Set([...(resolver.sourceExts || []), 'cjs']));
  resolver.unstable_enablePackageExports = false; // stabilize Firebase resolution on SDK 53

  // Keep useful aliases
  resolver.alias = {
    ...(resolver.alias || {}),
    '@': './',
  };

  // Reasonable minifier defaults (optional)
  transformer.minifierConfig = {
    keep_fnames: true,
    mangle: { keep_fnames: true },
  };

  // Do NOT override resolver.platforms and do NOT disable package exports.
  // Expo Router and Firebase rely on default platform resolution/package exports.

  return config;
})();
