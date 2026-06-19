import AppKit
import ApplicationServices
import Foundation

func copyAttribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    guard result == .success else {
        return nil
    }
    return value as AnyObject?
}

func sanitize(_ value: String) -> String {
    return value
        .replacingOccurrences(of: "\t", with: " ")
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
}

func boolValue(_ value: AnyObject?) -> Bool {
    if let number = value as? NSNumber {
        return number.boolValue
    }
    return false
}

func rectValue(_ value: AnyObject?) -> CGRect? {
    guard let value = value, CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }
    let axValue = value as! AXValue

    var rect = CGRect.zero
    if AXValueGetType(axValue) == .cgRect && AXValueGetValue(axValue, .cgRect, &rect) {
        return rect
    }

    return nil
}

func pointValue(_ value: AnyObject?) -> CGPoint? {
    guard let value = value, CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }
    let axValue = value as! AXValue

    var point = CGPoint.zero
    if AXValueGetType(axValue) == .cgPoint && AXValueGetValue(axValue, .cgPoint, &point) {
        return point
    }

    return nil
}

func sizeValue(_ value: AnyObject?) -> CGSize? {
    guard let value = value, CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }
    let axValue = value as! AXValue

    var size = CGSize.zero
    if AXValueGetType(axValue) == .cgSize && AXValueGetValue(axValue, .cgSize, &size) {
        return size
    }

    return nil
}

func emit(_ appName: String, _ isFullscreen: Bool, _ rect: CGRect) {
    let fields = [
        sanitize(appName),
        isFullscreen ? "true" : "false",
        String(Int(rect.origin.x.rounded())),
        String(Int(rect.origin.y.rounded())),
        String(Int(rect.size.width.rounded())),
        String(Int(rect.size.height.rounded())),
    ]
    print(fields.joined(separator: "\t"))
}

guard let app = NSWorkspace.shared.frontmostApplication else {
    emit("", false, .zero)
    exit(0)
}

let appName = app.localizedName ?? app.bundleIdentifier ?? String(app.processIdentifier)
let appElement = AXUIElementCreateApplication(app.processIdentifier)

guard
    let windows = copyAttribute(appElement, "AXWindows") as? NSArray,
    windows.count > 0
else {
    emit(appName, false, .zero)
    exit(0)
}

let frontWindow = windows.object(at: 0) as! AXUIElement
let isFullscreen = boolValue(copyAttribute(frontWindow, "AXFullScreen"))

if let frame = rectValue(copyAttribute(frontWindow, "AXFrame")) {
    emit(appName, isFullscreen, frame)
    exit(0)
}

let position = pointValue(copyAttribute(frontWindow, "AXPosition")) ?? .zero
let size = sizeValue(copyAttribute(frontWindow, "AXSize")) ?? .zero
emit(appName, isFullscreen, CGRect(origin: position, size: size))
