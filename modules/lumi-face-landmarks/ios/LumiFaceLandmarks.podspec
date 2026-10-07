Pod::Spec.new do |s|
  s.name           = 'LumiFaceLandmarks'
  s.version        = '1.0.0'
  s.summary        = 'Face landmarks for Lumi retouch (Apple Vision)'
  s.description    = 'Detects faces and their landmarks with Apple Vision for the Lumi editor.'
  s.license        = 'MIT'
  s.author         = 'Lumi'
  s.homepage       = 'https://github.com/yurimeeee/lumi-camera'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
