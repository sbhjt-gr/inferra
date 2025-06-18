const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.resolver.assetExts.push(
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'mp4',
  'mp3',
  'json',
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
defaultConfig.resolver.unstable_conditionNames = ['require', 'node', 'default'];

defaultConfig.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

defaultConfig.resolver.platforms = ['ios', 'android', 'native'];

module.exports = defaultConfig; 