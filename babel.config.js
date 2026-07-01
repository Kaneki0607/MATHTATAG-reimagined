const path = require('path');
const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');

// Pin to this project's worklets plugin (0.5.1). A global install at ~/node_modules
// can resolve to 0.6.0 and break Expo Go on SDK 54.
const workletsPlugin = require.resolve('react-native-worklets/plugin', {
  paths: [__dirname],
});

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { worklets: false }]],
    plugins: [
      // Re-apply after preset plugins so EXPO_ROUTER_APP_ROOT is inlined for require.context.
      expoRouterBabelPlugin,
      workletsPlugin,
    ],
  };
};