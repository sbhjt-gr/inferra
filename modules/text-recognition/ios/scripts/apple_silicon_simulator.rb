# Relabels ML Kit arm64 slices per build so the same Pods install works on
# Apple Silicon iOS simulators and physical devices. Adapted from
# flutter-ml/google_ml_kit_flutter. Upstream:
# https://issuetracker.google.com/issues/178965151
# https://github.com/flutter-ml/google_ml_kit_flutter/issues/825

require 'fileutils'

MLKIT_STATE_DIR = 'MLKitAppleSiliconSimulator'.freeze
MLKIT_PATCHER = 'patch_arm64_simulator.py'.freeze
MLKIT_PHASE_NAME = '[ML Kit] Relabel arm64 slice for current platform'.freeze
MLKIT_EXCLUDED_RE = /^(\s*EXCLUDED_ARCHS\[sdk=iphonesimulator\*\]\s*=\s*)(.*?)\s*$/
MLKIT_FRAMEWORKS = %w[
  MLImage
  MLKitCommon
  MLKitTextRecognition
  MLKitTextRecognitionChinese
  MLKitTextRecognitionCommon
  MLKitTextRecognitionDevanagari
  MLKitTextRecognitionJapanese
  MLKitTextRecognitionKorean
  MLKitVision
].freeze

def mlkit_apple_silicon_simulator_patch(installer)
  pods_dir = File.expand_path(installer.sandbox.root.to_s)

  framework_dirs = Dir.glob(File.join(pods_dir, '{MLKit*,MLImage*}'))
                      .select { |d| File.directory?(d) }
  return if framework_dirs.empty?

  _mlkit_copy_patcher(pods_dir)
  _mlkit_strip_simulator_arm64_exclusion(pods_dir)
  _mlkit_clear_target_excluded_archs(installer)
  _mlkit_restore_framework_ldflags(pods_dir)
  _mlkit_install_build_phase(installer)
  installer.pods_project.save

  installer.aggregate_targets.each do |aggregate|
    user_project = aggregate.user_project
    next unless user_project

    _mlkit_install_phase_on_targets(user_project.targets)
    user_project.save
  end

  Pod::UI.puts ''
  Pod::UI.puts "[ml_kit] Apple Silicon simulator support enabled for " \
               "#{framework_dirs.size} framework(s) (auto-toggles per build)."
rescue => e
  raise "[ml_kit] failed to enable Apple Silicon simulator support: #{e.message}"
end

def _mlkit_copy_patcher(pods_dir)
  state_dir = File.join(pods_dir, MLKIT_STATE_DIR)
  FileUtils.rm_rf(state_dir)
  FileUtils.mkdir_p(state_dir)
  FileUtils.cp(File.expand_path(MLKIT_PATCHER, __dir__), state_dir)
end

def _mlkit_strip_simulator_arm64_exclusion(pods_dir)
  Dir.glob(File.join(pods_dir, 'Target Support Files', '**', '*.xcconfig'))
     .each do |xcconfig|
    changed = false
    new_text = File.read(xcconfig).each_line.map do |line|
      match = line.match(MLKIT_EXCLUDED_RE)
      next line unless match

      tokens = match[2].split(/\s+/).reject(&:empty?)
      next line unless tokens.include?('arm64')

      changed = true
      kept = tokens.reject { |t| t == 'arm64' }
      kept.empty? ? '' : "#{match[1]}#{kept.join(' ')}\n"
    end.join
    File.write(xcconfig, new_text) if changed
  end
end

def _mlkit_clear_target_excluded_archs(installer)
  installer.pods_project.targets.each do |target|
    next unless target.name.match?(/^(Google)?ML(Kit|Image)/)

    target.build_configurations.each do |config|
      config.build_settings.delete('EXCLUDED_ARCHS[sdk=iphonesimulator*]')
    end
  end
end

# Undo previous device-only ML Kit link flags so simulator builds also
# pull in the vendored frameworks.
def _mlkit_restore_framework_ldflags(pods_dir)
  Dir.glob(File.join(pods_dir, 'Target Support Files', 'Pods-*', '*.xcconfig'))
     .each do |xcconfig|
    text = File.read(xcconfig)
    device_line = text[/^OTHER_LDFLAGS\[sdk=iphoneos\*\]\s*=\s*(.*)$/, 1]
    next unless device_line

    extras = MLKIT_FRAMEWORKS
             .select { |fw| device_line =~ /-framework\s+"#{Regexp.escape(fw)}"/ }
             .map { |fw| "-framework \"#{fw}\"" }
    next if extras.empty?

    cleaned = text.gsub(/^OTHER_LDFLAGS\[sdk=iphoneos\*\]\s*=\s*.*\n?/, '')
    cleaned = cleaned.gsub(/^OTHER_LDFLAGS\[sdk=iphonesimulator\*\]\s*=\s*.*\n?/, '')

    if cleaned =~ /^OTHER_LDFLAGS\s*=\s*(.*)$/
      ldflags = Regexp.last_match(1).strip
      extras.each do |flag|
        ldflags = "#{ldflags} #{flag}" unless ldflags.include?(flag)
      end
      cleaned.sub!(/^OTHER_LDFLAGS\s*=\s*.*$/, "OTHER_LDFLAGS = #{ldflags}")
    end

    File.write(xcconfig, cleaned) if cleaned != text
  end
end

def _mlkit_phase_script
  <<~SH
    set -euo pipefail
    : "${PLATFORM_NAME:?PLATFORM_NAME is not set}"
    PODS_ROOT_DIR="${PODS_ROOT:-${SRCROOT}}"
    if [ ! -d "${PODS_ROOT_DIR}/#{MLKIT_STATE_DIR}" ] && [ -d "${SRCROOT}/Pods/#{MLKIT_STATE_DIR}" ]; then
      PODS_ROOT_DIR="${SRCROOT}/Pods"
    fi
    if [ ! -d "${PODS_ROOT_DIR}/#{MLKIT_STATE_DIR}" ] && [ -d "${SRCROOT}/#{MLKIT_STATE_DIR}" ]; then
      PODS_ROOT_DIR="${SRCROOT}"
    fi
    /usr/bin/env python3 "${PODS_ROOT_DIR}/#{MLKIT_STATE_DIR}/#{MLKIT_PATCHER}" \\
      --platform "${PLATFORM_NAME}" \\
      --pods-root "${PODS_ROOT_DIR}"
  SH
end

def _mlkit_install_phase_on_targets(targets)
  script = _mlkit_phase_script
  targets.each do |target|
    phase = target.shell_script_build_phases.find { |p| p.name == MLKIT_PHASE_NAME }
    phase ||= target.new_shell_script_build_phase(MLKIT_PHASE_NAME)
    phase.shell_path = '/bin/sh'
    phase.shell_script = script
    phase.always_out_of_date = '1' if phase.respond_to?(:always_out_of_date=)

    phases = target.build_phases
    phases.move(phase, 0) if phases.include?(phase)
  end
end

def _mlkit_install_build_phase(installer)
  installer.aggregate_targets.each do |aggregate|
    target = installer.pods_project.targets.find { |t| t.name == aggregate.label }
    next unless target

    _mlkit_install_phase_on_targets([target])
  end
end
