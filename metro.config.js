const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Add 'mjs' and 'cjs' to sourceExts so Metro resolves ESM modules like lucide-react-native
config.resolver.sourceExts.push('mjs', 'cjs');

module.exports = withNativeWind(config, { input: "./src/global.css" });
