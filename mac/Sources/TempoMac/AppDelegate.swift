import AppKit
import ApplicationServices
import WebKit
import Carbon.HIToolbox
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    private var window: NSWindow!
    private var web: WKWebView!
    private var statusItem: NSStatusItem!
    private var quickTodoKey: EventHotKeyRef?
    private var ajusteKey: EventHotKeyRef?
    private var ajustePasteCount = -1
    private var timerRunning = false
    private var timerPaused = false
    private var timerMs: Double = 0
    private var timerSyncedAt = Date()
    private var barTicker: Timer?
    private let monitor = ActivityMonitor()
    private let whatsapp = WhatsAppMonitor()
    private let foco = FocoController()
    private let salvar = SalvarLembrete()
    private let notas = NotasEmitidas()
    private let agenda = AgendaApple()
    private var focoItem: NSMenuItem?
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
        web.uiDelegate = self   // necessário para o <input type="file"> abrir o seletor (ex.: enviar fonte)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Tempo"
        window.delegate = self
        window.contentView = web
        // abre sempre ocupando a tela inteira (menos a barra de menus e o Dock), sem virar outra "mesa" do macOS
        // janela de 1920x1080 contando a barra de título (ou o máximo que cabe na tela), colada no topo e centralizada
        if let tela = NSScreen.main ?? NSScreen.screens.first {
            let v = tela.visibleFrame
            let w = min(1920, v.width), h = min(1080, v.height)
            window.setFrame(NSRect(x: v.minX + (v.width - w) / 2, y: v.maxY - h, width: w, height: h), display: true)
        } else { window.center() }
        window.minSize = NSSize(width: 1280, height: 720)
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: siteURL))

        setupMenu()
        prepararAvisos()

        if !AXIsProcessTrusted() {
            let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(opts)
        }

        monitor.onSegment = { [weak self] from, to, ctx in
            guard let self = self else { return }
            let enviar: (String?) -> Void = { conversa in
                let payload: [String: Any] = [
                    "from": self.iso(from), "to": self.iso(to),
                    "app": ctx.app, "doc": conversa ?? ctx.doc ?? NSNull(), "folder": ctx.folder ?? NSNull()
                ]
                self.enqueue("reportActivity", [payload])
            }
            // WhatsApp: manda também com quem era a conversa, para o site saber se foi trabalho ou pausa
            if ctx.bundle.lowercased().contains("whatsapp") {
                self.whatsapp.conversaDoPeriodo(de: from, ate: to) { enviar($0) }
            } else {
                enviar(nil)
            }
        }
        monitor.onReuniao = { [weak self] comecou, quando in
            self?.enqueue("reportReuniao", [comecou, self?.iso(quando) ?? ""])
        }
        monitor.onIdle = { [weak self] from, to in
            self?.enqueue("reportIdle", [self?.iso(from) ?? "", self?.iso(to) ?? "", NSNull()])
        }
        monitor.onSleepEnd = { [weak self] from, to in
            self?.enqueue("reportIdle", [self?.iso(from) ?? "", self?.iso(to) ?? "", "sono"])
        }
        monitor.onGapAtLaunch = { [weak self] from, to, dormiu in
            let motivo: Any = dormiu ? ("sono" as Any) : (NSNull() as Any)
            self?.enqueue("reportIdle", [self?.iso(from) ?? "", self?.iso(to) ?? "", motivo])
        }
        // ao abrir, procura atualização em segundo plano (sem fazer nada se não houver mudança)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.runUpdate(manual: false) }
        // e de 15 em 15 minutos, mas só quando você está longe do Mac há 5 min (a troca fecha e reabre o app)
        Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: true) { [weak self] _ in
            let parado = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
            if parado >= 300 { self?.runUpdate(manual: false) }
        }
        barTicker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.refreshBar() }
        monitor.start()
        setupWhatsApp()
        setupNotas()
        // Calendário da Apple → Calendário do Tempo (só leitura; traz agendas que não passam pelo Google, como a da Brenda)
        agenda.enviar = { [weak self] itens in
            guard let self = self, let json = self.jsonString(itens) else { return }
            self.web.evaluateJavaScript("window.TempoBridge && window.TempoBridge.reportAgendaMac && window.TempoBridge.reportAgendaMac(\(json)); true", completionHandler: nil)
        }
        agenda.start()
        foco.onAbriu = { [weak self] nome in self?.enqueue("focoAbriu", [nome]) }
        foco.aviso = { [weak self] t, b in self?.showNotice(t, b) }
        foco.start()
        salvar.start()
    }

    // MARK: - WhatsApp, notas, lembretes e iCloud (antes ficavam no app em Python)

    private func jsonString(_ obj: Any) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func setupWhatsApp() {
        whatsapp.sendCounts = { [weak self] linhas in
            guard let self = self, let json = self.jsonString(linhas) else { return }
            self.web.evaluateJavaScript("window.TempoBridge && window.TempoBridge.reportWhatsApp && window.TempoBridge.reportWhatsApp(\(json)); true", completionHandler: nil)
        }
        whatsapp.sendConversas = { [weak self] dados in
            guard let self = self, let json = self.jsonString(dados) else { return }
            self.web.evaluateJavaScript("window.TempoBridge && window.TempoBridge.reportWhatsAppConversas && window.TempoBridge.reportWhatsAppConversas(\(json)); true", completionHandler: nil)
        }
        whatsapp.sendNotes = { [weak self] itens, done in
            guard let self = self, let json = self.jsonString(itens) else { done([]); return }
            let js = "(function(){ var b = window.TempoBridge; if (!b || typeof b.reportNfse !== 'function') return '[]'; return JSON.stringify(b.reportNfse(\(json)) || []); })()"
            self.web.evaluateJavaScript(js) { result, _ in
                var ids: [String] = []
                if let s = result as? String, let d = s.data(using: .utf8),
                   let arr = (try? JSONSerialization.jsonObject(with: d)) as? [String] { ids = arr }
                done(ids)
            }
        }
        whatsapp.onNoAccess = { [weak self] in
            self?.showNotice("Tempo: WhatsApp", "Não consegui ler o WhatsApp. Ative Acesso Total ao Disco para o Tempo nos Ajustes do Sistema.")
        }
        whatsapp.start()
    }

    /// Notas fiscais emitidas (pasta _FINANCEIRO/NOTAS FISCAIS no iCloud) -> TempoBridge.reportNotasEmitidas.
    private func setupNotas() {
        notas.aviso = { [weak self] t, b in self?.showNotice(t, b) }
        notas.enviar = { [weak self] itens, inventario, done in
            guard let self = self, let a = self.jsonString(itens), let b = self.jsonString(inventario) else { done([], []); return }
            let js = "(function(){ var b = window.TempoBridge; if (!b || typeof b.reportNotasEmitidas !== 'function') return '{}'; return JSON.stringify(b.reportNotasEmitidas(\(a), \(b)) || {}); })()"
            self.web.evaluateJavaScript(js) { result, _ in
                var ids: [String] = [], ren: [[String: String]] = []
                if let s = result as? String, let d = s.data(using: .utf8),
                   let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
                    ids = o["ids"] as? [String] ?? []
                    ren = o["renomear"] as? [[String: String]] ?? []
                }
                done(ids, ren)
            }
        }
        whatsapp.onPdf = { [weak self] dados in self?.notas.talvezSalvarDoWhatsApp(dados) }
        notas.start()
    }

    @objc private func readWhatsAppNow() { whatsapp.runNow() }

    /// Varredura do WhatsApp da Alice (agendada pelo site ou "Procurar agora"): devolve o resultado em TempoBridge.aliceResultado.
    /// Se a página não receber, o site pergunta de novo no minuto seguinte; nada fica marcado como lido no Mac.
    private func handleAlice(_ d: [String: Any]) {
        let desde = (d["desde"] as? NSNumber)?.int64Value ?? 0
        let auto = (d["auto"] as? Bool) ?? false
        whatsapp.procurarAlice(desde: desde, auto: auto) { [weak self] r in
            guard let self = self, let json = self.jsonString(r) else { return }
            self.web.evaluateJavaScript("window.TempoBridge && window.TempoBridge.aliceResultado && window.TempoBridge.aliceResultado(\(json)); true", completionHandler: nil)
        }
    }
    @objc private func rereadNotes() {
        showNotice("Tempo", "Relendo notas e comprovantes dos últimos 3 meses…")
        whatsapp.relerNotas { [weak self] n in
            self?.showNotice("Tempo", n == 0 ? "Nenhuma nota ou comprovante encontrado nas conversas." : "\(n) notas e comprovantes lidos e salvos no iCloud.")
        }
    }

    /// Cria um lembrete com alarme no app Lembretes (lista "Tempo"); sincroniza com o iPhone.
    /// quando: "AAAA-MM-DDTHH:MM" (hora local). Avisa o site se deu certo (TempoBridge.reminderDone).
    private func handleReminder(_ d: [String: Any]) {
        guard let id = d["id"] as? String, let titulo = d["title"] as? String, let quando = d["when"] as? String else { return }
        let responder: (Bool) -> Void = { [weak self] ok in
            DispatchQueue.main.async {
                guard let self = self, let arg = self.jsonString([id]) else { return }
                let js = "window.TempoBridge && window.TempoBridge.reminderDone && window.TempoBridge.reminderDone(\(arg)[0], \(ok ? "true" : "false")); true"
                self.web.evaluateJavaScript(js, completionHandler: nil)
            }
        }
        let partes = quando.split(separator: "T")
        let dia = (partes.first ?? "").split(separator: "-").compactMap { Int($0) }
        let hora = partes.count > 1 ? partes[1].prefix(5).split(separator: ":").compactMap { Int($0) } : []
        guard dia.count == 3, hora.count == 2 else { responder(false); return }
        let t = titulo.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let linhas = [
            "tell application \"Reminders\"",
            "  if not (exists list \"Tempo\") then make new list with properties {name:\"Tempo\"}",
            "  set d to current date",
            "  set day of d to 1",
            "  set year of d to \(dia[0])",
            "  set month of d to \(dia[1])",
            "  set day of d to \(dia[2])",
            "  set hours of d to \(hora[0])",
            "  set minutes of d to \(hora[1])",
            "  set seconds of d to 0",
            "  tell list \"Tempo\" to make new reminder with properties {name:\"\(t)\", remind me date:d}",
            "end tell",
        ]
        let script = linhas.joined(separator: "\n")
        DispatchQueue.global().async {
            let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript"); p.arguments = ["-e", script]
            p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
            do { try p.run(); p.waitUntilExit(); responder(p.terminationStatus == 0) } catch { responder(false) }
        }
    }

    /// Abre um arquivo a pedido do site (link da nota fiscal ou do comprovante na Anotação).
    /// Só abre o que está dentro do iCloud Drive, onde o Tempo guarda esses arquivos.
    private func handleOpen(_ d: [String: Any]) {
        guard let caminho = (d["path"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !caminho.isEmpty else { return }
        var url = URL(fileURLWithPath: (caminho as NSString).expandingTildeInPath).standardizedFileURL
        // só abre arquivos do iCloud do Tempo ou da pasta do Dropbox (orçamentos)
        let dropbox = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("BAQUER Dropbox").standardizedFileURL.path
        guard url.path.hasPrefix(ICloudTerapias.root.standardizedFileURL.path) || url.path.hasPrefix(dropbox) else { return }
        if (d["abrir"] as? Bool) == true, FileManager.default.fileExists(atPath: url.path) { NSWorkspace.shared.open(url); return }
        let fm = FileManager.default
        // link antigo de um arquivo que já foi renomeado para o formato novo
        if !fm.fileExists(atPath: url.path), let novo = ICloudTerapias.nomeNovo(url.lastPathComponent) {
            url = url.deletingLastPathComponent().appendingPathComponent(novo)
        }
        if fm.fileExists(atPath: url.path) {
            NSWorkspace.shared.activateFileViewerSelecting([url])   // abre o Finder com o arquivo selecionado
        } else if fm.fileExists(atPath: url.deletingLastPathComponent().path) {
            NSWorkspace.shared.open(url.deletingLastPathComponent())   // o arquivo sumiu: abre ao menos a pasta do mês
        } else {
            showNotice("Tempo", "Não encontrei esse arquivo no iCloud.")
        }
    }

    /// Modo foco: o site manda até quando (ou nada para desligar) e as listas de apps e sites de distração.
    private func handleFoco(_ d: [String: Any]) {
        var ate: Date?
        if let s = d["ate"] as? String {
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            ate = f.date(from: s) ?? isoFormatter.date(from: s)
        }
        foco.atualizar(ate: ate, apps: (d["apps"] as? [String]) ?? [], sites: (d["sites"] as? [String]) ?? [])
        whatsapp.rapido = foco.ativo
        atualizarMenuFoco()
        refreshBar()
    }

    private func atualizarMenuFoco() {
        guard let item = focoItem else { return }
        item.title = foco.ativo ? "Foco: faltam \(foco.minutosRestantes) min" : "Ativar foco"
        let sub = NSMenu()
        if foco.ativo {
            sub.addItem(withTitle: "Encerrar foco", action: #selector(focoEncerrar), keyEquivalent: "").target = self
        } else {
            for m in [30, 60, 90, 120] {
                let it = NSMenuItem(title: "\(m) min", action: #selector(focoLigar(_:)), keyEquivalent: "")
                it.tag = m; it.target = self
                sub.addItem(it)
            }
        }
        item.submenu = sub
    }
    @objc private func focoLigar(_ sender: NSMenuItem) { enqueue("focoMenu", [sender.tag]) }
    @objc private func focoEncerrar() { enqueue("focoMenu", [0]) }

    /// Relatório da aba Análises em PDF: o site manda o HTML pronto; salva em iCloud/Tempo/Análises e abre.
    private func handlePDF(_ d: [String: Any]) {
        guard let html = d["html"] as? String, !html.isEmpty else { return }
        let nome = (d["nome"] as? String) ?? "Analise"
        let sub = ((d["pasta"] as? String) ?? "").isEmpty ? "Análises" : (d["pasta"] as! String)
        let abrir = (d["abrir"] as? Bool) ?? true
        PDFExport.gerar(html: html, nome: nome, pasta: sub, dir: d["dir"] as? String) { [weak self] url in
            if let url = url, abrir { NSWorkspace.shared.open(url) }
            else { self?.showNotice("Tempo", "Não consegui gerar o PDF.") }
            let ok = url != nil
            self?.web.evaluateJavaScript("window.TempoBridge && window.TempoBridge.pdfDone && window.TempoBridge.pdfDone(\(ok))", completionHandler: nil)
        }
    }

    /// Renomeia um PDF já gravado na pasta escolhida (ex.: 1021_… vira 1021A_… quando sai a versão B).
    private func handlePDFRenomear(_ d: [String: Any]) {
        guard let dir = d["dir"] as? String, let de = d["de"] as? String, let para = d["para"] as? String,
              !de.isEmpty, !para.isEmpty, !de.contains("/"), !para.contains("/") else { return }
        let pasta = URL(fileURLWithPath: (dir as NSString).expandingTildeInPath)
        let a = pasta.appendingPathComponent(de + ".pdf"), b = pasta.appendingPathComponent(para + ".pdf")
        guard FileManager.default.fileExists(atPath: a.path), !FileManager.default.fileExists(atPath: b.path) else { return }
        try? FileManager.default.moveItem(at: a, to: b)
    }

    /// Grava nota fiscal (PDF) ou comprovante (PNG) em iCloud/_RAFAEL/_Terapias/<Ano_Mes>, a pedido do site.
    private func handleTerapia(_ d: [String: Any]) {
        guard let tipo = d["tipo"] as? String, let anoMes = d["anoMes"] as? String, let terapeuta = d["terapeuta"] as? String,
              let b64 = d["base64"] as? String, let dados = Data(base64Encoded: b64), ICloudTerapias.disponivel,
              let nome = ICloudTerapias.nomeArquivo(tipo: tipo, anoMes: anoMes, terapeuta: terapeuta, ext: (d["ext"] as? String) ?? (tipo == "nota" ? "pdf" : "png")),
              (try? ICloudTerapias.salvar(anoMes: anoMes, nome: nome, dados: dados)) != nil else {
            showNotice("Tempo", "Não consegui gravar o arquivo no iCloud."); return
        }
    }

    /// Notificação do macOS vinda do site. Usa osascript, que funciona sem empacotar o app em .app.
    // Abre o seletor de arquivos quando a página usa <input type="file">
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.begin { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any] else { return }
        switch d["type"] as? String {
        case "timer": handleTimer(d); return
        case "reminder": handleReminder(d); return
        case "terapia": handleTerapia(d); return
        case "update": runUpdate(manual: true); return
        case "open": handleOpen(d); return
        case "pdf": handlePDF(d); return
        case "pdfRenomear": handlePDFRenomear(d); return
        case "foco": handleFoco(d); return
        case "focoRevogar": foco.revogar(); return
        case "salvar": salvar.pasta = d["pasta"] as? String; return   // pasta do projeto atual, para o Salvar como
        case "nfReler": notas.reler(); return
        case "aliceProcurar": handleAlice(d); return
        case "print": handlePrint(); return
        default: break
        }
        guard let title = d["title"] as? String, let body = d["body"] as? String else { return }
        showNotice(title, body)
    }

    /// Print da página do app (pedido pela janelinha de ajustes, que se esconde antes). Devolve um JPEG em window.TempoPrint.
    private func handlePrint() {
        web.takeSnapshot(with: nil) { [weak self] img, _ in
            guard let self = self else { return }
            var js = "window.TempoPrint && window.TempoPrint(null)"
            if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) {
                js = "window.TempoPrint && window.TempoPrint('data:image/jpeg;base64,\(jpg.base64EncodedString())')"
            }
            self.web.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    /// Avisos saem pelo próprio macOS em nome do Tempo (ícone do Tempo; clicar traz o app para frente).
    /// Só usa o osascript se o app estiver rodando fora do Tempo.app ou se os avisos do Tempo estiverem bloqueados,
    /// porque por esse caminho o macOS atribui o aviso ao Editor de Script.
    private var avisosNativos = false

    private func prepararAvisos() {
        guard Bundle.main.bundleIdentifier != nil, Bundle.main.bundlePath.hasSuffix(".app") else { return }
        let c = UNUserNotificationCenter.current()
        c.delegate = self
        c.requestAuthorization(options: [.alert, .sound]) { ok, _ in
            DispatchQueue.main.async { self.avisosNativos = ok }
        }
    }

    func showNotice(_ title: String, _ body: String) {
        if avisosNativos {
            let conteudo = UNMutableNotificationContent()
            conteudo.title = title
            conteudo.body = body
            conteudo.sound = .default
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: conteudo, trigger: nil))
            return
        }
        func q(_ x: String) -> String { x.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") }
        let script = "display notification \"\(q(body))\" with title \"\(q(title))\""
        let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript"); p.arguments = ["-e", script]
        try? p.run()
    }

    // mostra o aviso mesmo com o Tempo na frente
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    // clicar no aviso traz a janela do Tempo para frente
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            NSApp.activate(ignoringOtherApps: true)
            self.window.makeKeyAndOrderFront(nil)
        }
        completionHandler()
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
        let focoTxt = foco.ativo ? " ◎ \(foco.minutosRestantes)m" : ""
        // o título do item do menu só muda quando o minuto muda (ou quando o foco acaba)
        let tituloFoco = foco.ativo ? "Foco: faltam \(foco.minutosRestantes) min" : "Ativar foco"
        if let it = focoItem, it.title != tituloFoco { atualizarMenuFoco() }
        guard timerRunning || timerPaused else { button.title = focoTxt; return }
        let elapsed = timerMs / 1000 + (timerRunning ? Date().timeIntervalSince(timerSyncedAt) : 0)
        let s = Int(elapsed)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        // até 59:59 mostra minutos:segundos; a partir de 1 hora mostra horas:minutos
        let txt = h > 0 ? String(format: "%d:%02d", h, m) : String(format: "%02d:%02d", m, sec)
        button.title = (timerPaused ? " ⏸ " : " ") + txt + focoTxt
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

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // avisa o site que o aviso de salvar é feito aqui no Mac (o site deixa de fazer o dele, que só via o registro depois)
        web.evaluateJavaScript("window.TempoMacSalvar = true; true", completionHandler: nil)
        flush()
    }

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
        m.addItem(withTitle: "Ajuste no app… (⌃⌥F)", action: #selector(abrirAjuste), keyEquivalent: "")
        let fi = NSMenuItem(title: "Ativar foco", action: nil, keyEquivalent: "")
        m.addItem(fi)
        focoItem = fi
        atualizarMenuFoco()
        m.addItem(.separator())
        m.addItem(withTitle: "Recarregar", action: #selector(reload), keyEquivalent: "r")
        m.addItem(withTitle: "Atualizar app", action: #selector(updateNow), keyEquivalent: "u")
        m.addItem(withTitle: "Ler WhatsApp agora", action: #selector(readWhatsAppNow), keyEquivalent: "")
        m.addItem(withTitle: "Reler notas dos últimos 3 meses", action: #selector(rereadNotes), keyEquivalent: "")
        m.addItem(.separator())
        m.addItem(toggleItem("Guardar pasta da janela ativa", key: "captureFolders", defaultOn: true, action: #selector(toggleFolders)))
        m.addItem(toggleItem("Guardar nome do arquivo", key: "captureFileNames", defaultOn: true, action: #selector(toggleFiles)))
        m.addItem(.separator())
        let avisoSalvar = toggleItem("Avisar para salvar (20 min sem salvar)", key: "salvarAviso", defaultOn: true, action: #selector(toggleSalvar))
        avisoSalvar.toolTip = "Avisa quando você trabalha 20 min no mesmo arquivo sem salvar (Photoshop sempre; Illustrator, After e Cinema 4D só em arquivo novo)"
        m.addItem(avisoSalvar)
        m.addItem(withTitle: "Aviso de salvar: ver o que o Tempo lê…", action: #selector(salvarDiagnostico), keyEquivalent: "").toolTip = "Mostra o que o Tempo consegue ler da janela do programa em primeiro plano (para conferir se o aviso vai funcionar)"
        m.addItem(withTitle: "Voltar a avisar nos arquivos ignorados", action: #selector(salvarReativar), keyEquivalent: "").toolTip = "Desfaz todos os \"Não avisar deste arquivo\""
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
        appMenu.addItem(withTitle: "Nova to-do… (⌃⌥T de qualquer tela)", action: #selector(quickTodo), keyEquivalent: "")
        appMenu.addItem(withTitle: "Ajuste no app… (⌃⌥F de qualquer tela)", action: #selector(abrirAjuste), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sair", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        // Menu Editar: sem ele o WebView não recebe ⌘A, ⌘C, ⌘V, ⌘X e ⌘Z nos campos de texto.
        let editItem = NSMenuItem()
        main.addItem(editItem)
        let editMenu = NSMenu(title: "Editar")
        editMenu.addItem(withTitle: "Desfazer", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Refazer", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Recortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Colar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Selecionar tudo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        NSApp.mainMenu = main
        registerQuickTodoHotKey()
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
    @objc private func toggleSalvar(_ sender: NSMenuItem) { flip(sender, "salvarAviso", defaultOn: true) }
    @objc private func salvarReativar() {
        salvar.limparIgnorados()
        showNotice("Tempo", "Voltei a avisar para salvar em todos os arquivos.")
    }
    /// Troque para o Photoshop (ou outro) e, em 4 segundos, mostra o que o Tempo lê da janela dele.
    @objc private func salvarDiagnostico() {
        showNotice("Tempo: aviso de salvar", "Troque agora para o programa de criação. Em 4 segundos mostro o que leio da janela dele.")
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
            guard let self = self else { return }
            let texto = self.salvar.diagnostico()
            NSApp.activate(ignoringOtherApps: true)
            let alerta = NSAlert()
            alerta.messageText = "O que o Tempo lê da janela"
            alerta.informativeText = texto
            alerta.addButton(withTitle: "OK")
            alerta.runModal()
        }
    }

    private func flip(_ sender: NSMenuItem, _ key: String, defaultOn: Bool) {
        let now = !(defaults.object(forKey: key) as? Bool ?? defaultOn)
        defaults.set(now, forKey: key)
        sender.state = now ? .on : .off
    }

    @objc private func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc private func reload() { web.reload() }
    /* ⌃⌥T em qualquer app: abre a caixinha de to-do (Carbon: atalho global sem permissão extra). */
    private func registerQuickTodoHotKey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, userData -> OSStatus in
            guard let userData = userData else { return noErr }
            var hk = EventHotKeyID()
            if let event = event {
                GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hk)
            }
            let app = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { if hk.id == 2 { app.abrirAjuste() } else { app.quickTodo() } }
            return noErr
        }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
        let id = EventHotKeyID(signature: OSType(0x54445430), id: 1)   // 'TDT0'
        RegisterEventHotKey(UInt32(kVK_ANSI_T), UInt32(controlKey | optionKey), id, GetApplicationEventTarget(), 0, &quickTodoKey)
        // ⌃⌥F: janelinha de ajuste do app (F de feedback); não choca com atalhos do sistema
        let idF = EventHotKeyID(signature: OSType(0x54445430), id: 2)
        RegisterEventHotKey(UInt32(kVK_ANSI_F), UInt32(controlKey | optionKey), idF, GetApplicationEventTarget(), 0, &ajusteKey)
    }
    /* ⌃⌥F: traz o Tempo para a frente e abre a janelinha de ajuste. Se tiver uma imagem copiada nova (print com
       ⌃⇧⌘4), ela já entra anexada; a mesma imagem não entra duas vezes. */
    @objc func abrirAjuste() {
        showWindow()
        var img = "null"
        let pb = NSPasteboard.general
        if pb.changeCount != ajustePasteCount, pb.types?.contains(where: { $0 == .png || $0 == .tiff }) == true,
           let im = NSImage(pasteboard: pb), let tiff = im.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
           let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) {
            img = "\"data:image/jpeg;base64,\(jpg.base64EncodedString())\""
        }
        ajustePasteCount = pb.changeCount
        web.evaluateJavaScript("window.TempoAjuste && window.TempoAjuste(\(img)); true", completionHandler: nil)
    }
    /* ⌃⌥T: caixinha para anotar uma to-do sem trocar de tela; o texto vai para o To-do do app. */
    @objc private func quickTodo() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Nova to-do"
        alert.informativeText = "Ex.: Pegar Rafa às 16h · [30min] · !seg,qua"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        alert.accessoryView = field
        alert.addButton(withTitle: "Adicionar")
        alert.addButton(withTitle: "Cancelar")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let data = try? JSONSerialization.data(withJSONObject: [text]), let arr = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.todoQuickAdd && window.todoQuickAdd(\(arr)[0])", completionHandler: nil)
    }
}
