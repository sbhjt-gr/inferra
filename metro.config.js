const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.watchFolders = [
  ...(defaultConfig.watchFolders || []),
  path.resolve(__dirname, 'modules/react-native-rag'),
];

defaultConfig.resolver.assetExts.push(
  'woff',
  'woff2',
  'md',
  'html',
  'obj',
  'mtl',
  'JPG',
  'JPEG',
  'PNG',
  'GIF',
  'WEBP',
  'pdf'
);

defaultConfig.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

defaultConfig.resolver.sourceExts.push('cjs');
defaultConfig.resolver.unstable_enablePackageExports = false;

defaultConfig.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

defaultConfig.resolver.platforms = ['ios', 'android', 'native'];

defaultConfig.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = defaultConfig;
