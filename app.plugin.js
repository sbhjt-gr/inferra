const { withPodfile, withXcodeProject, withAndroidManifest } = require('@expo/config-plugins');
const {
  injectMlkitSimPatch,
} = require('./modules/text-recognition/app.plugin');

function disableDeterministicPodUuids(contents) {
  const line = "install! 'cocoapods', :deterministic_uuids => false";

  if (contents.includes(line)) {
    return contents;
  }

  const anchor = 'prepare_react_native_project!';

  if (!contents.includes(anchor)) {
    return contents;
  }

  return contents.replace(anchor, `${line}\n\n${anchor}`);
}

function injectSpmRootFix(contents) {
  const block = [
    'if defined?(::SPMManager) && ::SPMManager.instance_methods.include?(:add_spm_to_target)',
    '  ::SPMManager.class_eval do',
    '    unless method_defined?(:inferrlm_add_spm_to_target)',
    '      alias_method :inferrlm_add_spm_to_target, :add_spm_to_target',
    '',
    '      def add_spm_to_target(project, target, url, requirement, products)',
    '        root = project.root_object',
    '        if root && project.objects_by_uuid[root.uuid] != root',
    '          root.add_referrer(project)',
    '        end',
    '',
    '        inferrlm_add_spm_to_target(project, target, url, requirement, products)',
    '      end',
    '    end',
    '  end',
    'end',
  ].join('\n');

  if (contents.includes('::SPMManager.class_eval do')) {
    return contents;
  }

  const anchor = 'prepare_react_native_project!';

  if (!contents.includes(anchor)) {
    return contents;
  }

  return contents.replace(anchor, `${block}\n\n${anchor}`);
}

function injectUseModularHeaders(contents) {
  const line = 'use_modular_headers!';

  if (contents.includes(line)) {
    return contents;
  }

  const anchor = 'target \'InferrLM\' do';

  if (!contents.includes(anchor)) {
    return contents;
  }

  return contents.replace(anchor, `${line}\n\n${anchor}`);
}

function injectMinDeploymentTarget(contents) {
  const block = [
    '    installer.pods_project.targets.each do |target|',
    '      target.build_configurations.each do |config|',
    '        current = config.build_settings[\'IPHONEOS_DEPLOYMENT_TARGET\']',
    '        if current && Gem::Version.new(current) < Gem::Version.new(\'15.0\')',
    '          config.build_settings[\'IPHONEOS_DEPLOYMENT_TARGET\'] = \'15.0\'',
    '        end',
    '      end',
    '    end',
  ].join('\n');

  if (contents.includes('IPHONEOS_DEPLOYMENT_TARGET\'] = \'15.0\'')) {
    return contents;
  }

  const anchor = 'react_native_post_install(';

  if (!contents.includes(anchor)) {
    return contents;
  }

  return contents.replace(
    /(react_native_post_install\([\s\S]*?\n    \))/,
    `$1\n${block}`
  );
}

function stripProjectBuildSettings(project) {
  const section = project.pbxXCBuildConfigurationSection();

  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) {
      continue;
    }

    const config = section[key];
    const buildSettings = config?.buildSettings;

    if (!buildSettings || buildSettings.PRODUCT_NAME) {
      continue;
    }

    delete buildSettings.LIBRARY_SEARCH_PATHS;
  }

  return project;
}

function setAutomaticSigning(project) {
  const section = project.pbxXCBuildConfigurationSection();

  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) {
      continue;
    }

    const config = section[key];
    const buildSettings = config?.buildSettings;

    if (!buildSettings || !buildSettings.PRODUCT_NAME) {
      continue;
    }

    if (!buildSettings.CODE_SIGN_STYLE) {
      buildSettings.CODE_SIGN_STYLE = 'Automatic';
    }
  }

  return project;
}

function injectLlamaBuildFromSource(contents) {
  const line = "ENV['RNLLAMA_BUILD_FROM_SOURCE'] = '1'";

  if (contents.includes("ENV['RNLLAMA_BUILD_FROM_SOURCE']")) {
    return contents;
  }

  const marker = "ENV['RNS_GAMMA_ENABLED']";
  if (contents.includes(marker)) {
    return contents.replace(
      /ENV\['RNS_GAMMA_ENABLED'\][^\n]*/,
      (match) => `${match}\n${line}`,
    );
  }

  return `${line}\n${contents}`;
}

function withIos(config) {
  config = withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = disableDeterministicPodUuids(modConfig.modResults.contents);
    modConfig.modResults.contents = injectSpmRootFix(modConfig.modResults.contents);
    modConfig.modResults.contents = injectUseModularHeaders(modConfig.modResults.contents);
    modConfig.modResults.contents = injectMinDeploymentTarget(modConfig.modResults.contents);
    modConfig.modResults.contents = injectMlkitSimPatch(modConfig.modResults.contents);
    modConfig.modResults.contents = injectLlamaBuildFromSource(modConfig.modResults.contents);
    return modConfig;
  });

  return withXcodeProject(config, (modConfig) => {
    stripProjectBuildSettings(modConfig.modResults);
    setAutomaticSigning(modConfig.modResults);
    return modConfig;
  });
}

function withAndroidSoftInput(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    if (!manifest) {
      return modConfig;
    }

    const application = manifest.application?.[0];
    if (!application) {
      return modConfig;
    }

    const mainActivity = application.activity?.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      mainActivity.$['android:windowSoftInputMode'] = 'adjustNothing';
    }

    return modConfig;
  });
}

function withApp(config) {
  config = withIos(config);
  config = withAndroidSoftInput(config);
  return config;
}

module.exports = withApp;
module.exports._helpers = {
  disableDeterministicPodUuids,
  injectSpmRootFix,
  injectMinDeploymentTarget,
};