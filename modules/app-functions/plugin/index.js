const {
  withAppBuildGradle,
  withProjectBuildGradle,
  createRunOncePlugin,
} = require('@expo/config-plugins');

function addKspClasspath(contents) {
  if (contents.includes('com.google.devtools.ksp')) {
    return contents;
  }
  if (contents.includes('dependencies {')) {
    return contents.replace(
      /dependencies\s*\{/,
      `dependencies {\n        classpath("com.google.devtools.ksp:com.google.devtools.ksp.gradle.plugin:2.0.21-1.0.28")`,
    );
  }
  return `${contents}\nbuildscript {\n  dependencies {\n    classpath("com.google.devtools.ksp:com.google.devtools.ksp.gradle.plugin:2.0.21-1.0.28")\n  }\n}\n`;
}

function withAppFunctions(config) {
  config = withProjectBuildGradle(config, mod => {
    mod.modResults.contents = addKspClasspath(mod.modResults.contents);
    return mod;
  });

  config = withAppBuildGradle(config, mod => {
    if (!mod.modResults.contents.includes('compileSdkVersion')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /targetSdkVersion.*/,
        match => `${match}\n        compileSdkVersion 36`,
      );
    }
    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(withAppFunctions, 'app-functions', '1.0.0');
