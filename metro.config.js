const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add custom configurations for optimization
config.resolver.alias = {
  '@': './',
};

// Optimize bundle size
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

// Enable tree shaking
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;
