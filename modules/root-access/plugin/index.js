const { withProjectBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

function ensureJitPack(contents) {
  if (contents.includes('jitpack.io')) {
    return contents;
  }
  return contents.replace(
    /allprojects\s*\{\s*repositories\s*\{/,
    `allprojects {\n    repositories {\n        maven { url 'https://jitpack.io' }`,
  );
}

function withRootAccess(config) {
  return withProjectBuildGradle(config, mod => {
    mod.modResults.contents = ensureJitPack(mod.modResults.contents);
    return mod;
  });
}

module.exports = createRunOncePlugin(withRootAccess, 'root-access', '1.0.0');
