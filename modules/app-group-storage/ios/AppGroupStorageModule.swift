import ExpoModulesCore
import UIKit
import WidgetKit

// App Group UserDefaults bridge for the "Cast Your Vote" widget. All values
// are JSON strings; the shapes are defined by client/lib/widget.ts and
// targets/widget/index.swift.
public class AppGroupStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupStorage")

    Function("getItem") { (appGroup: String, key: String) -> String? in
      UserDefaults(suiteName: appGroup)?.string(forKey: key)
    }

    Function("setItem") { (appGroup: String, key: String, value: String) in
      UserDefaults(suiteName: appGroup)?.set(value, forKey: key)
    }

    Function("removeItem") { (appGroup: String, key: String) in
      UserDefaults(suiteName: appGroup)?.removeObject(forKey: key)
    }

    Function("reloadWidgets") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    // Private backup uses the user's own iCloud key-value store: no app
    // account, no developer-readable CloudKit database, and no subscription
    // or device identifier in the payload.
    Function("isICloudAvailable") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }

    Function("getICloudItem") { (key: String) -> String? in
      NSUbiquitousKeyValueStore.default.synchronize()
      return NSUbiquitousKeyValueStore.default.string(forKey: key)
    }

    Function("setICloudItem") { (key: String, value: String) in
      NSUbiquitousKeyValueStore.default.set(value, forKey: key)
    }

    Function("removeICloudItem") { (key: String) in
      NSUbiquitousKeyValueStore.default.removeObject(forKey: key)
    }

    Function("synchronizeICloud") { () -> Bool in
      NSUbiquitousKeyValueStore.default.synchronize()
    }

    Function("supportsAlternateIcons") { () -> Bool in
      UIApplication.shared.supportsAlternateIcons
    }

    Function("getAlternateIconName") { () -> String? in
      UIApplication.shared.alternateIconName
    }

    AsyncFunction("setAlternateIconName") { (name: String?, promise: Promise) in
      DispatchQueue.main.async {
        guard UIApplication.shared.supportsAlternateIcons else {
          promise.resolve(false)
          return
        }
        UIApplication.shared.setAlternateIconName(name) { error in
          promise.resolve(error == nil)
        }
      }
    }
  }
}
