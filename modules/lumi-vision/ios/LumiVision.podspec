Pod::Spec.new do |s|
  s.name           = 'LumiVision'
  s.version        = '1.0.0'
  s.summary        = 'Subject / person segmentation and HEIC export for Lumi (Apple Vision, ImageIO)'
  s.description    = 'Segments subjects and people with Apple Vision and encodes HEIC with ImageIO for the Lumi editor.'
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
  s.frameworks = 'Vision', 'ImageIO', 'CoreVideo', 'CoreGraphics', 'UniformTypeIdentifiers'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
