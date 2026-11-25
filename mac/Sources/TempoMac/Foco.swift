import AppKit
import ApplicationServices

/// Modo foco no Mac. Quem liga é o Tulio (tela inicial do site ou menu da barra); o estado vem do site
/// (mensagem "foco": até quando, apps e sites de distração). Durante o foco:
/// - apps de distração (WhatsApp, Telegram, Mensagens…) ficam escondidos; ao abrir um, pergunta antes;
/// - navegador com aba de distração (Instagram, YouTube…) em primeiro plano também pergunta;
/// - liga o "Não perturbe" pelo atalho "Tempo Foco" do app Atalhos (e desliga com "Tempo Fim do Foco"), se existirem.
/// Nada é bloqueado: "Abrir por 10 min" libera aquele app por 10 minutos e fica registrado no foco. Passados os
/// 10 minutos ele volta a ser escondido (mesmo que continue aberto na frente) e pergunta de novo; da segunda vez no
/// mesmo dia aparece também "Liberar por hoje", que deixa aquele app/site livre até a meia-noite.
final class FocoController {
    private(set) var ate: Date?
    private var apps: [String] = []
    private var sites: [String] = []
    private var liberado: [String: Date] = [:]
    /// Quantas vezes cada app/site foi aberto no foco hoje e quais foram liberados até o fim do dia (sobrevive a reabrir o app).
    private var vezesHoje: [String: Int] {
        get { (UserDefaults.standard.dictionary(forKey: "focoVezes.\(FocoController.hoje())") as? [String: Int]) ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "focoVezes.\(FocoController.hoje())") }
    }
    private var livresHoje: [String] {
        get { UserDefaults.standard.stringArray(forKey: "focoLivre.\(FocoController.hoje())") ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: "focoLivre.\(FocoController.hoje())") }
    }
    private static func hoje() -> String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }
    private func livre(_ chave: String) -> Bool { livresHoje.contains(chave) || (liberado[chave] ?? .distantPast) > Date() }
    private var perguntando = false
    /// Ao perguntar, o Tempo vem para a frente e o macOS avisa que ele ficou ativo: essa ativação não conta como "abrir o Tempo".
    private var ignorarTempoAte = Date.distantPast
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

    /// "Tempo" marcado na lista do foco: abrir o próprio Tempo também pergunta (é onde dá vontade de criar funcionalidade em vez de trabalhar).
    private var tempoNaLista: Bool { apps.contains("tempo") }

    private func esconderDistracoes() {
        // o Tempo não se esconde ao ligar o foco: é por ele que você liga e encerra
        for app in NSWorkspace.shared.runningApplications where app.bundleIdentifier != selfBundle && ehDistracao(app) { app.hide() }
    }

    private func ativou(_ app: NSRunningApplication) {
        if app.bundleIdentifier == selfBundle {
            guard ativo, tempoNaLista, !perguntando, Date() > ignorarTempoAte, !livre("tempo") else { return }
            perguntarTempo()
            return
        }
        guard ativo else { ultimoAppTrabalho = app; return }
        if ehDistracao(app) {
            let chave = (app.localizedName ?? "app").lowercased()
            if livre(chave) { return }
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
        // o Tempo ficou na frente depois que os 10 minutos liberados acabaram: pergunta de novo (só se você já o tinha liberado antes)
        if ativo, tempoNaLista, !perguntando, Date() > ignorarTempoAte, liberado["tempo"] != nil, !livre("tempo"),
           NSWorkspace.shared.frontmostApplication?.bundleIdentifier == selfBundle {
            perguntarTempo()
            return
        }
        // app de distração que ficou na frente depois que os 10 minutos acabaram: esconde e pergunta de novo
        if ativo, !perguntando, let frente = NSWorkspace.shared.frontmostApplication, frente.bundleIdentifier != selfBundle, ehDistracao(frente) {
            let chave = (frente.localizedName ?? "app").lowercased()
            if !livre(chave) { frente.hide(); perguntar(nome: frente.localizedName ?? "esse app", chave: chave, app: frente, site: false) }
            return
        }
        guard ativo, !perguntando, let app = NSWorkspace.shared.frontmostApplication, navegador(app), AXIsProcessTrusted() else { return }
        guard let titulo = FocoController.tituloJanela(app.processIdentifier)?.lowercased(),
              let site = sites.first(where: { !$0.isEmpty && titulo.contains($0) }) else { return }
        if livre(site) { return }
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
        ignorarTempoAte = Date().addingTimeInterval(3600)
        let hora = DateFormatter.localizedString(from: ate ?? Date(), dateStyle: .none, timeStyle: .short)
        NSApp.activate(ignoringOtherApps: true)
        let vezes = vezesHoje[chave] ?? 0
        let alerta = NSAlert()
        alerta.messageText = "Você está no foco até \(hora)"
        alerta.informativeText = vezes > 0
            ? "Você já abriu \(site ? nome : "o " + nome) \(vezes == 1 ? "1 vez" : "\(vezes) vezes") hoje no foco. Liberar por hoje ou só por mais 10 minutos?"
            : (site ? "Abrir \(nome) mesmo assim? (fica liberado por 10 minutos)" : "Abrir o \(nome) mesmo assim? (fica liberado por 10 minutos)")
        alerta.addButton(withTitle: "Continuar no foco")
        alerta.addButton(withTitle: "Abrir por 10 min")
        if vezes > 0 { alerta.addButton(withTitle: "Liberar por hoje") }
        let r = alerta.runModal()
        perguntando = false
        ignorarTempoAte = Date().addingTimeInterval(2)
        if r == .alertSecondButtonReturn || r == .alertThirdButtonReturn {
            if r == .alertThirdButtonReturn { livresHoje = livresHoje + [chave] }
            else { liberado[chave] = Date().addingTimeInterval(600) }
            var v = vezesHoje; v[chave] = vezes + 1; vezesHoje = v
            app.unhide()
            app.activate(options: [.activateIgnoringOtherApps])
            onAbriu?(nome)
        } else {
            ultimoAppTrabalho?.activate(options: [.activateIgnoringOtherApps])   // volta para o que estava fazendo
        }
    }

    /// Abriu o Tempo no foco. "Continuar no foco" esconde o Tempo e volta ao que você estava fazendo.
    private func perguntarTempo() {
        guard !perguntando else { return }
        perguntando = true
        ignorarTempoAte = Date().addingTimeInterval(3600)   // enquanto o painel está aberto, ativações do próprio Tempo não contam
        let hora = DateFormatter.localizedString(from: ate ?? Date(), dateStyle: .none, timeStyle: .short)
        NSApp.activate(ignoringOtherApps: true)
        let vezes = vezesHoje["tempo"] ?? 0
        let alerta = NSAlert()
        alerta.messageText = "Você está no foco até \(hora)"
        alerta.informativeText = vezes > 0
            ? "Você já abriu o Tempo \(vezes == 1 ? "1 vez" : "\(vezes) vezes") hoje no foco. Liberar por hoje ou só por mais 10 minutos?"
            : "Abrir o Tempo mesmo assim? (fica liberado por 10 minutos)"
        alerta.addButton(withTitle: "Continuar no foco")
        alerta.addButton(withTitle: "Abrir por 10 min")
        if vezes > 0 { alerta.addButton(withTitle: "Liberar por hoje") }
        let r = alerta.runModal()
        perguntando = false
        ignorarTempoAte = Date().addingTimeInterval(2)
        if r == .alertSecondButtonReturn || r == .alertThirdButtonReturn {
            if r == .alertThirdButtonReturn { livresHoje = livresHoje + ["tempo"] }
            else { liberado["tempo"] = Date().addingTimeInterval(600) }
            var v = vezesHoje; v["tempo"] = vezes + 1; vezesHoje = v
            onAbriu?("Tempo")
        } else {
            NSApp.hide(nil)
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
