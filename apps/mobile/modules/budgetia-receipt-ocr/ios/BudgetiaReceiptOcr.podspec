Pod::Spec.new do |s|
  s.name           = 'BudgetiaReceiptOcr'
  s.version        = '1.0.0'
  s.summary        = 'Private on-device receipt OCR for Budgetia'
  s.description    = 'Recognizes receipt text locally with Apple Vision.'
  s.author         = 'Budgetia'
  s.homepage       = 'https://github.com/gneed49/budgetia'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
