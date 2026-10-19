import AppKit
import ApplicationServices
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var web: WKWebView!
    private var statusItem: NSStatusItem!
    private let monitor = ActivityMonitor()
    private let defaults = UserDefaults.standard
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()

    /// Endereço do site. Ajuste com: defaults write com.tulio.tempomac siteURL "https://SEU-SITE.vercel.app"
    private var siteURL: URL {
        URL(string: defaults.string(forKey: "siteURL") ?? "https://SEU-SITE.vercel.app")!
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "tempo")   // página chama window.webkit.messageHandlers.tempo.postMessage({title, body})
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Tempo"
        window.contentView = web
        window.center()
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: siteURL))

        setupMenu()

        if !AXIsProcessTrusted() {
            let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(opts)
        }

        monitor.onSegment = { [weak self] from, to, ctx in
            self?.callBridge("reportActivity", [[
                "from": self?.iso(from) ?? "", "to": self?.iso(to) ?? "",
                "app": ctx.app, "doc": ctx.doc ?? NSNull(), "folder": ctx.folder ?? NSNull()
            ]])
        }
        monitor.onIdle = { [weak self] from, to in
            self?.callBridge("reportIdle", [self?.iso(from) ?? "", self?.iso(to) ?? "", NSNull()])
        }
        monitor.start()
    }

    /// Notificação do macOS vinda do site. Usa osascript, que funciona sem empacotar o app em .app.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any], let title = d["title"] as? String, let body = d["body"] as? String else { return }
        func q(_ x: String) -> String { x.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") }
        let script = "display notification \"\(q(body))\" with title \"\(q(title))\""
        let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript"); p.arguments = ["-e", script]
        try? p.run()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    private func iso(_ d: Date) -> String { isoFormatter.string(from: d) }

    /// Chama window.TempoBridge.<fn>(args...) na página. Se a página não estiver carregada, a chamada é ignorada.
    private func callBridge(_ fn: String, _ args: [Any]) {
        let literals = args.map { jsonLiteral($0) }.joined(separator: ",")
        web.evaluateJavaScript("window.TempoBridge && window.TempoBridge.\(fn) && window.TempoBridge.\(fn)(\(literals))", completionHandler: nil)
    }

    private func jsonLiteral(_ v: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [v]),
              let s = String(data: data, encoding: .utf8) else { return "null" }
        return String(s.dropFirst().dropLast())
    }

    // MARK: - Menu da barra

    private func setupMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "⏱"
        let m = NSMenu()
        m.addItem(withTitle: "Mostrar Tempo", action: #selector(showWindow), keyEquivalent: "")
        m.addItem(withTitle: "Recarregar", action: #selector(reload), keyEquivalent: "r")
        m.addItem(.separator())
        m.addItem(toggleItem("Guardar pasta da janela ativa", key: "captureFolders", defaultOn: true, action: #selector(toggleFolders)))
        m.addItem(toggleItem("Guardar nome do arquivo (desligado por padrão)", key: "captureFileNames", defaultOn: false, action: #selector(toggleFiles)))
        m.addItem(.separator())
        m.addItem(withTitle: "Sair", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = m
    }

    private func toggleItem(_ title: String, key: String, defaultOn: Bool, action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        item.state = (defaults.object(forKey: key) as? Bool ?? defaultOn) ? .on : .off
        item.representedObject = key
        return item
    }

    @objc private func toggleFolders(_ sender: NSMenuItem) { flip(sender, "captureFolders", defaultOn: true) }
    @objc private func toggleFiles(_ sender: NSMenuItem) { flip(sender, "captureFileNames", defaultOn: false) }

    private func flip(_ sender: NSMenuItem, _ key: String, defaultOn: Bool) {
        let now = !(defaults.object(forKey: key) as? Bool ?? defaultOn)
        defaults.set(now, forKey: key)
        sender.state = now ? .on : .off
    }

    @objc private func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc private func reload() { web.reload() }
}
