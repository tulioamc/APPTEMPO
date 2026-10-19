import AppKit
import ApplicationServices
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var web: WKWebView!
    private var statusItem: NSStatusItem!
    private var timerRunning = false
    private var timerPaused = false
    private var timerMs: Double = 0
    private var timerSyncedAt = Date()
    private var barTicker: Timer?
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
        window.delegate = self
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
            let payload: [String: Any] = [
                "from": self?.iso(from) ?? "", "to": self?.iso(to) ?? "",
                "app": ctx.app, "doc": ctx.doc ?? NSNull(), "folder": ctx.folder ?? NSNull()
            ]
            self?.enqueue("reportActivity", [payload])
        }
        monitor.onIdle = { [weak self] from, to in
            self?.enqueue("reportIdle", [self?.iso(from) ?? "", self?.iso(to) ?? "", NSNull()])
        }
        // ao abrir, procura atualização em segundo plano (sem fazer nada se não houver mudança)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.runUpdate(manual: false) }
        barTicker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.refreshBar() }
        monitor.start()
    }

    /// Notificação do macOS vinda do site. Usa osascript, que funciona sem empacotar o app em .app.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any] else { return }
        if (d["type"] as? String) == "timer" { handleTimer(d); return }
        guard let title = d["title"] as? String, let body = d["body"] as? String else { return }
        showNotice(title, body)
    }

    func showNotice(_ title: String, _ body: String) {
        func q(_ x: String) -> String { x.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") }
        let script = "display notification \"\(q(body))\" with title \"\(q(title))\""
        let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript"); p.arguments = ["-e", script]
        try? p.run()
    }

    /// Atualiza pelo ~/APPTEMPO/mac/update.sh (git pull + build). Se mudou, reabre a versão nova.
    func runUpdate(manual: Bool) {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let script = home + "/APPTEMPO/mac/update.sh"
        guard FileManager.default.fileExists(atPath: script) else {
            if manual { showNotice("Tempo", "Pasta ~/APPTEMPO não encontrada. Clone o repositório primeiro.") }
            return
        }
        DispatchQueue.global().async {
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/bash"); p.arguments = [script]
            let out = Pipe(); p.standardOutput = out; p.standardError = out
            try? p.run(); p.waitUntilExit()
            let text = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            DispatchQueue.main.async {
                if p.terminationStatus != 0 {
                    self.showNotice("Tempo: atualização falhou", "Abra o Terminal e rode ~/APPTEMPO/mac/update.sh para ver o erro.")
                } else if text.contains("ATUALIZADO") {
                    self.showNotice("Tempo atualizado", "Reabrindo com a versão nova.")
                    let appPath = home + "/Applications/Tempo.app"
                    let relaunch = Process(); relaunch.executableURL = URL(fileURLWithPath: "/bin/bash")
                    relaunch.arguments = ["-c", "sleep 1; open \"\(appPath)\""]
                    try? relaunch.run()
                    NSApp.terminate(nil)
                } else if manual {
                    self.showNotice("Tempo", "Já está na versão mais nova.")
                }
            }
        }
    }

    @objc private func updateNow() { runUpdate(manual: true) }

    /// Estado do cronômetro vindo do site: mostra o tempo na barra enquanto houver sessão rodando.
    private func handleTimer(_ d: [String: Any]) {
        timerRunning = d["running"] as? Bool ?? false
        timerPaused = d["paused"] as? Bool ?? false
        timerMs = (d["ms"] as? Double) ?? Double(d["ms"] as? Int ?? 0)
        timerSyncedAt = Date()
        refreshBar()
    }

    private func refreshBar() {
        guard let button = statusItem?.button else { return }
        guard timerRunning || timerPaused else { button.title = ""; return }
        let elapsed = timerMs / 1000 + (timerRunning ? Date().timeIntervalSince(timerSyncedAt) : 0)
        let s = Int(elapsed)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        // até 59:59 mostra minutos:segundos; a partir de 1 hora mostra horas:minutos
        let txt = h > 0 ? String(format: "%d:%02d", h, m) : String(format: "%02d:%02d", m, sec)
        button.title = (timerPaused ? " ⏸ " : " ") + txt
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// Fechar a janela só esconde: o app continua rodando na barra de menus e o site segue ativo.
    func windowShouldClose(_ sender: NSWindow) -> Bool { sender.orderOut(nil); return false }

    /// Clicar no ícone do Dock mostra a mesma janela que "Mostrar Tempo" na barra de menus.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow(); return true
    }

    private func iso(_ d: Date) -> String { isoFormatter.string(from: d) }

    /// Fila de eventos para window.TempoBridge. Fica guardada no Mac até a página confirmar o recebimento:
    /// se a página ainda não carregou ou o computador estava dormindo, nada se perde.
    private var outbox: [[String: String]] {
        get { defaults.array(forKey: "outbox") as? [[String: String]] ?? [] }
        set { defaults.set(newValue, forKey: "outbox") }
    }
    private var flushing = false

    private func enqueue(_ fn: String, _ args: [Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: args),
              let json = String(data: data, encoding: .utf8) else { return }
        var q = outbox
        q.append(["fn": fn, "json": json])
        if q.count > 500 { q.removeFirst(q.count - 500) }   // limite: a fila não cresce para sempre
        outbox = q
        flush()
    }

    /// Entrega o primeiro evento da fila. Só tira da fila quando a página responde que recebeu.
    private func flush() {
        guard !flushing, let item = outbox.first, let fn = item["fn"], let json = item["json"] else { return }
        flushing = true
        let js = "(function(){ var b = window.TempoBridge; if (!b || typeof b.\(fn) !== 'function') return false; b.\(fn).apply(null, \(json)); return true; })()"
        web.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            self.flushing = false
            if (result as? Bool) == true {
                var q = self.outbox
                if !q.isEmpty { q.removeFirst() }
                self.outbox = q
                self.flush()
            } else {
                // página ainda não está pronta: tenta de novo em instantes
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.flush() }
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { flush() }

    // MARK: - Menu da barra

    private func setupMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        // ícone simples do sistema (cronômetro), no mesmo tamanho dos outros ícones da barra
        if let img = NSImage(systemSymbolName: "timer", accessibilityDescription: "Tempo") {
            img.isTemplate = true
            statusItem.button?.image = img
        } else {
            statusItem.button?.title = "T"
        }
        let m = NSMenu()
        m.addItem(withTitle: "Mostrar Tempo", action: #selector(showWindow), keyEquivalent: "")
        m.addItem(withTitle: "Recarregar", action: #selector(reload), keyEquivalent: "r")
        m.addItem(withTitle: "Atualizar app", action: #selector(updateNow), keyEquivalent: "u")
        m.addItem(.separator())
        m.addItem(toggleItem("Guardar pasta da janela ativa", key: "captureFolders", defaultOn: true, action: #selector(toggleFolders)))
        m.addItem(toggleItem("Guardar nome do arquivo", key: "captureFileNames", defaultOn: true, action: #selector(toggleFiles)))
        m.addItem(.separator())
        m.addItem(withTitle: "Sair", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = m

        // Atalhos (⌘U, ⌘R, ⌘Q) só funcionam com um menu principal do app; o menu da barra não basta.
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu(title: "Tempo")
        appMenu.addItem(withTitle: "Mostrar Tempo", action: #selector(showWindow), keyEquivalent: "")
        appMenu.addItem(withTitle: "Recarregar", action: #selector(reload), keyEquivalent: "r")
        appMenu.addItem(withTitle: "Atualizar app", action: #selector(updateNow), keyEquivalent: "u")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sair", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        NSApp.mainMenu = main
    }

    private func toggleItem(_ title: String, key: String, defaultOn: Bool, action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        item.state = (defaults.object(forKey: key) as? Bool ?? defaultOn) ? .on : .off
        item.representedObject = key
        return item
    }

    @objc private func toggleFolders(_ sender: NSMenuItem) { flip(sender, "captureFolders", defaultOn: true) }
    @objc private func toggleFiles(_ sender: NSMenuItem) { flip(sender, "captureFileNames", defaultOn: true) }

    private func flip(_ sender: NSMenuItem, _ key: String, defaultOn: Bool) {
        let now = !(defaults.object(forKey: key) as? Bool ?? defaultOn)
        defaults.set(now, forKey: key)
        sender.state = now ? .on : .off
    }

    @objc private func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc private func reload() { web.reload() }
}
