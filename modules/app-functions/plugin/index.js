const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

function withAppFunctions(config) {
  return withAppBuildGradle(config, mod => {
    if (!mod.modResults.contents.includes('compileSdkVersion')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /targetSdkVersion.*/,
        match => `${match}\n        compileSdkVersion 36`,
      );
    }
    return mod;
  });
}

module.exports = createRunOncePlugin(withAppFunctions, 'app-functions', '1.0.0');
