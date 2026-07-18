Pod::Spec.new do |s|
  s.name           = 'AppGroupStorage'
  s.version        = '1.0.0'
  s.summary        = 'App Group UserDefaults bridge for the widget'
  s.description    = 'Shares widget data and pending votes between the app and the ResolutionWidget extension via App Group UserDefaults.'
  s.author         = ''
  s.homepage       = 'https://resolutioncompanion.com'
  # Must match the app deployment target: a higher platform here makes Expo
  # autolinking silently skip the pod (which is how the 16.4-only
  # ExtensionStorage pod from @bacons/apple-targets never linked).
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
