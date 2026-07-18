import ExpoModulesCore
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
  }
}
