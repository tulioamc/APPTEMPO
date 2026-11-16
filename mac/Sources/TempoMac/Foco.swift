import AppKit
import ApplicationServices

/// Modo foco no Mac. Quem liga é o Tulio (tela inicial do site ou menu da barra); o estado vem do site
/// (mensagem "foco": até quando, apps e sites de distração). Durante o foco:
/// - apps de distração (WhatsApp, Telegram, Mensagens…) ficam escondidos; ao abrir um, pergunta antes;
/// - navegador com aba de distração (Instagram, YouTube…) em primeiro plano também pergunta;
/// - liga o "Não perturbe" pelo atalho "Tempo Foco" do app Atalhos (e desliga com "Tempo Fim do Foco"), se existirem.
/// Nada é bloqueado: "Abrir mesmo assim" libera aquele app por 10 minutos e fica registrado no foco.
final class FocoController {
    private(set) var ate: Date?
    private var apps: [String] = []
    private var sites: [String] = []
    private var liberado: [String: Date] = [:]
    private var perguntando = false
    private var ultimoAppTrabalho: NSRunningApplication?
    private var vigia: Timer?
    private let selfBundle = Bundle.main.bundleIdentifier ?? "TempoMac"

    /// O Tulio abriu um app ou site de distração mesmo no foco (vai para o registro do foco no site).
    var onAbriu: ((String) -> Void)?
    var aviso: ((String, String) -> Void)?

    var ativo: Bool { (ate ?? .distantPast) > Date() }
    var minutosRestantes: Int { max(0, Int(((ate ?? Date()).timeIntervalSinceNow / 60).rounded(.up))) }

    func start() {
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] n in
            guard let self = self, let app = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
            self.ativou(app)
        }
    }

    /// Estado vindo do site. ate = nil desliga.
    func atualizar(ate novo: Date?, apps: [String], sites: [String]) {
        let estava = ativo
        ate = novo
        self.apps = apps.map { $0.lowercased() }
        self.sites = sites.map { $0.lowercased() }
        if ativo && !estava {
            liberado = [:]
            esconderDistracoes()
            atalho("Tempo Foco")
            vigia?.invalidate()
            // navegador: confere a aba em primeiro plano a cada 5 s
            vigia = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.conferirNavegador() }
        } else if !ativo && estava {
            vigia?.invalidate(); vigia = nil
            atalho("Tempo Fim do Foco")
        }
    }

    private func ehDistracao(_ app: NSRunningApplication) -> Bool {
        let nome = (app.localizedName ?? "").lowercased(), bundle = (app.bundleIdentifier ?? "").lowercased()
        return apps.contains(nome) || (bundle.contains("whatsapp") && apps.contains("whatsapp"))
    }

    private func esconderDistracoes() {
        for app in NSWorkspace.shared.runningApplications where ehDistracao(app) { app.hide() }
    }

    private func ativou(_ app: NSRunningApplication) {
        if app.bundleIdentifier == selfBundle { return }
        guard ativo else { ultimoAppTrabalho = app; return }
        if ehDistracao(app) {
            let chave = (app.localizedName ?? "app").lowercased()
            if (liberado[chave] ?? .distantPast) > Date() { return }
            app.hide()
            perguntar(nome: app.localizedName ?? "esse app", chave: chave, app: app, site: false)
        } else if !navegador(app) {
            ultimoAppTrabalho = app
        }
    }

    private func navegador(_ app: NSRunningApplication) -> Bool {
        let b = app.bundleIdentifier ?? ""
        return ["com.google.Chrome", "com.apple.Safari", "com.microsoft.edgemac", "company.thebrowser.Browser", "com.brave.Browser"].contains(b)
    }

    private func conferirNavegador() {
        guard ativo, !perguntando, let app = NSWorkspace.shared.frontmostApplication, navegador(app), AXIsProcessTrusted() else { return }
        guard let titulo = FocoController.tituloJanela(app.processIdentifier)?.lowercased(),
              let site = sites.first(where: { !$0.isEmpty && titulo.contains($0) }) else { return }
        if (liberado[site] ?? .distantPast) > Date() { return }
        perguntar(nome: site.capitalized, chave: site, app: app, site: true)
    }

    /// Título da janela em primeiro plano (só o título; nada mais da página é lido).
    static func tituloJanela(_ pid: pid_t) -> String? {
        let ax = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(ax, 0.5)
        var win: CFTypeRef?
        guard AXUIElementCopyAttributeValue(ax, kAXFocusedWindowAttribute as CFString, &win) == .success, let w = win else { return nil }
        var t: CFTypeRef?
        guard AXUIElementCopyAttributeValue(w as! AXUIElement, kAXTitleAttribute as CFString, &t) == .success else { return nil }
        return t as? String
    }

    private func perguntar(nome: String, chave: String, app: NSRunningApplication, site: Bool) {
        guard !perguntando else { return }
        perguntando = true
        let hora = DateFormatter.localizedString(from: ate ?? Date(), dateStyle: .none, timeStyle: .short)
        NSApp.activate(ignoringOtherApps: true)
        let alerta = NSAlert()
        alerta.messageText = "Você está no foco até \(hora)"
        alerta.informativeText = site ? "Abrir \(nome) mesmo assim?" : "Abrir o \(nome) mesmo assim? (fica liberado por 10 minutos)"
        alerta.addButton(withTitle: "Continuar no foco")
        alerta.addButton(withTitle: "Abrir mesmo assim")
        let r = alerta.runModal()
        perguntando = false
        if r == .alertSecondButtonReturn {
            liberado[chave] = Date().addingTimeInterval(600)
            app.unhide()
            app.activate(options: [.activateIgnoringOtherApps])
            onAbriu?(nome)
        } else {
            ultimoAppTrabalho?.activate(options: [.activateIgnoringOtherApps])   // volta para o que estava fazendo
        }
    }

    /// Roda um atalho do app Atalhos, se existir (é assim que o "Não perturbe" liga e desliga; o foco do
    /// iPhone acompanha quando "Compartilhar entre dispositivos" está ligado nos Ajustes de Foco).
    private func atalho(_ nome: String) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let lista = FocoController.rodar(["list"]) else { return }
            let existe = lista.split(separator: "\n").contains { $0.trimmingCharacters(in: .whitespaces) == nome }
            if existe { _ = FocoController.rodar(["run", nome]); return }
            let chave = "focoAvisoAtalho"
            if nome == "Tempo Foco", !UserDefaults.standard.bool(forKey: chave) {
                UserDefaults.standard.set(true, forKey: chave)
                DispatchQueue.main.async {
                    self?.aviso?("Tempo: Não perturbe", "Para o Não perturbe ligar junto com o foco, crie no app Atalhos os atalhos \"Tempo Foco\" e \"Tempo Fim do Foco\".")
                }
            }
        }
    }

    private static func rodar(_ args: [String]) -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/shortcuts")
        p.arguments = args
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do { try p.run() } catch { return nil }
        p.waitUntilExit()
        return String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
    }
}
