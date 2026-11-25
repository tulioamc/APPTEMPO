import AppKit
import ApplicationServices
import Carbon.HIToolbox

/// Aviso para salvar. Olha só o programa em primeiro plano (Photoshop, Illustrator, After Effects, Cinema 4D) e conta
/// apenas o tempo em que você está de fato trabalhando naquele arquivo: programa na frente + mouse/teclado em uso.
/// Arquivo aberto e parado, ou outro programa na frente, não conta (e esconde o aviso).
/// - Aos 20 min de trabalho sem salvar aparece um painel pequeno, sem tirar o foco do programa, com
///   [Salvar] [Daqui a 5 min] [Não avisar deste arquivo]. Se continuar sem salvar, volta a cada 5 min de trabalho.
/// - Photoshop (que nunca salva sozinho) avisa em qualquer arquivo. Illustrator, After Effects e Cinema 4D têm
///   salvamento automático depois do primeiro Salvar: só avisam enquanto o arquivo for novo / sem título.
/// - [Salvar] manda ⌘S ao programa; se o arquivo é novo e o site informou a pasta do projeto, tenta abrir o
///   "Salvar como" já nessa pasta (⇧⌘G + caminho).
/// - "Não avisar deste arquivo" fica guardado por caminho/nome (arquivo novo só vale até fechar o Tempo).
/// Depende da permissão de Acessibilidade (a mesma que já lê a pasta e o arquivo da janela).
final class SalvarLembrete: NSObject {
    static let primeiroAviso: TimeInterval = 20 * 60
    static let repetir: TimeInterval = 5 * 60
    private static let passo: TimeInterval = 5
    private static let parado: TimeInterval = 60   // sem mouse nem teclado por 1 min: não está trabalhando

    /// Pasta do projeto em andamento (vem do site); usada para abrir o "Salvar como" já nela.
    var pasta: String?

    private struct Programa { let nome: String; let insistente: Bool }
    private struct Arquivo { let nome: String; let caminho: String?; let novo: Bool; let editado: Bool }
    private struct Estado { var trabalhado: TimeInterval = 0; var proximo: TimeInterval = SalvarLembrete.primeiroAviso }

    private let defaults = UserDefaults.standard
    private var timer: Timer?
    private var ultimo = Date()
    private var estados: [String: Estado] = [:]
    private var ignoradosSessao = Set<String>()

    private var painel: NSPanel?
    private var ocultar: Timer?
    private var chavePainel: String?
    private var appPainel: NSRunningApplication?
    private var novoPainel = false

    private static let semNome = #"untitled|sem t[ií]tulo|sem nome|novo (arquivo|documento|projeto)|new (project|document|file)|unnamed|unsaved|^documento ?\d*$"#
    private static let comExtensao = #"\.[A-Za-z0-9]{2,5}$"#

    var ligado: Bool { defaults.object(forKey: "salvarAviso") as? Bool ?? true }
    private var ignoradosFixos: [String] { defaults.stringArray(forKey: "salvarIgnorados") ?? [] }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: SalvarLembrete.passo, repeats: true) { [weak self] _ in self?.tique() }
    }

    func limparIgnorados() {
        defaults.removeObject(forKey: "salvarIgnorados")
        ignoradosSessao.removeAll()
    }

    // MARK: - Contagem

    private func programa(_ app: NSRunningApplication) -> Programa? {
        let nome = (app.localizedName ?? "").lowercased()
        let bundle = (app.bundleIdentifier ?? "").lowercased()
        if nome.contains("photoshop") || bundle.contains("photoshop") { return Programa(nome: "Photoshop", insistente: true) }
        if nome.contains("illustrator") || bundle.contains("illustrator") { return Programa(nome: "Illustrator", insistente: false) }
        if nome.contains("after effects") || bundle.contains("aftereffects") { return Programa(nome: "After Effects", insistente: false) }
        if nome.contains("cinema 4d") || bundle.contains("cinema4d") || bundle.contains("maxon.cinema") { return Programa(nome: "Cinema 4D", insistente: false) }
        return nil
    }

    private func tique() {
        let agora = Date()
        let dt = min(agora.timeIntervalSince(ultimo), 15)   // computador dormindo não vira tempo de trabalho
        ultimo = agora
        guard ligado, AXIsProcessTrusted(),
              let app = NSWorkspace.shared.frontmostApplication, let prog = programa(app) else { esconder(); return }
        guard let arq = ler(app.processIdentifier) else { return }
        let chave = (app.bundleIdentifier ?? prog.nome) + "|" + (arq.caminho ?? arq.nome.lowercased())
        if let c = chavePainel, c != chave { esconder() }   // trocou de arquivo: o aviso era do outro
        if !arq.editado {
            estados[chave] = nil   // salvou (ou nada mudou): recomeça do zero
            if chavePainel == chave { esconder() }
            return
        }
        if !prog.insistente && !arq.novo { return }   // o salvamento automático cuida
        if ignorado(chave, novo: arq.novo) { return }
        let ocioso = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
        if ocioso >= SalvarLembrete.parado { return }   // mãos paradas: não conta
        var st = estados[chave] ?? Estado()
        st.trabalhado += dt
        if st.trabalhado >= st.proximo {
            st.proximo = st.trabalhado + SalvarLembrete.repetir
            estados[chave] = st
            mostrar(prog: prog, arq: arq, chave: chave, app: app, trabalhado: st.trabalhado)
        } else {
            estados[chave] = st
        }
    }

    private func ignorado(_ chave: String, novo: Bool) -> Bool {
        ignoradosSessao.contains(chave) || ignoradosFixos.contains(chave)
    }

    // MARK: - Leitura da janela

    private func ler(_ pid: pid_t) -> Arquivo? {
        let ax = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(ax, 0.5)
        guard let win = janela(ax) else { return nil }
        let titulo = texto(win, kAXTitleAttribute) ?? ""
        var docPath: String?
        if let s = texto(win, kAXDocumentAttribute), let url = URL(string: s), url.isFileURL { docPath = url.path }
        return SalvarLembrete.interpretar(titulo: titulo, docPath: docPath, axEditado: lerEditado(win))
    }

    /// Título da janela → arquivo. Exemplos: "Logo.ai* @ 66,7% (RGB/Preview)", "Untitled-1 @ 50% (RGB/8) *",
    /// "Adobe After Effects 2025 - /Users/x/Reel.aep *", "Cinema 4D 2025 - [Untitled 1 *] - Main".
    private static func interpretar(titulo: String, docPath: String?, axEditado: Bool?) -> Arquivo? {
        var s = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
        let baixo = s.lowercased()
        if baixo.hasPrefix("adobe ") || baixo.hasPrefix("cinema 4d") {
            guard let r = s.range(of: " - ") else { return nil }   // só o nome do programa: ainda sem arquivo na janela
            s = String(s[r.upperBound...])
        }
        if let r = s.range(of: " @ ") { s = String(s[..<r.lowerBound]) }
        if s.hasPrefix("["), let fim = s.firstIndex(of: "]") { s = String(s[s.index(after: s.startIndex)..<fim]) }
        s = s.replacingOccurrences(of: "*", with: "").replacingOccurrences(of: "•", with: "").replacingOccurrences(of: "●", with: "")
        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        var caminho = docPath
        if s.contains("/") {
            if caminho == nil { caminho = s }
            s = (s as NSString).lastPathComponent
        }
        if s.isEmpty {
            guard let c = caminho else { return nil }
            s = (c as NSString).lastPathComponent
        }
        let semTitulo = s.range(of: SalvarLembrete.semNome, options: [.regularExpression, .caseInsensitive]) != nil
        let temExtensao = s.range(of: SalvarLembrete.comExtensao, options: .regularExpression) != nil
        let novo = caminho == nil && (semTitulo || !temExtensao)
        let t = titulo.lowercased()
        let marcado = titulo.contains("*") || titulo.contains("•") || titulo.contains("●") || t.contains("— edit")
        return Arquivo(nome: s, caminho: caminho, novo: novo, editado: marcado || (axEditado ?? false) || novo)
    }

    private func lerEditado(_ win: AXUIElement) -> Bool? {
        for attr in ["AXEdited", "AXIsEdited"] { if let b = booleano(win, attr) { return b } }
        if let botao = elemento(win, kAXCloseButtonAttribute) {
            for attr in ["AXEdited", "AXIsEdited"] { if let b = booleano(botao, attr) { return b } }
        }
        return nil
    }

    private func janela(_ ax: AXUIElement) -> AXUIElement? {
        for attr in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
            if let w = elemento(ax, attr) { return w }
        }
        var lista: CFTypeRef?
        if AXUIElementCopyAttributeValue(ax, kAXWindowsAttribute as CFString, &lista) == .success,
           let wins = lista as? [AXUIElement], let primeira = wins.first { return primeira }
        return nil
    }

    private func elemento(_ el: AXUIElement, _ attr: String) -> AXUIElement? {
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, attr as CFString, &ref) == .success, let r = ref,
              CFGetTypeID(r) == AXUIElementGetTypeID() else { return nil }
        return (r as! AXUIElement)
    }

    private func texto(_ el: AXUIElement, _ attr: String) -> String? {
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, attr as CFString, &ref) == .success else { return nil }
        return ref as? String
    }

    private func booleano(_ el: AXUIElement, _ attr: String) -> Bool? {
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, attr as CFString, &ref) == .success, let r = ref else { return nil }
        return (r as? NSNumber)?.boolValue
    }

    /// Para conferir no menu da barra o que o Tempo está lendo da janela do programa em primeiro plano.
    func diagnostico() -> String {
        guard AXIsProcessTrusted() else { return "O Tempo ainda não tem a permissão de Acessibilidade (Ajustes do Sistema → Privacidade e Segurança → Acessibilidade)." }
        guard let app = NSWorkspace.shared.frontmostApplication else { return "Nenhum programa em primeiro plano." }
        let nome = app.localizedName ?? "?"
        var linhas = ["Programa na frente: \(nome)"]
        guard let prog = programa(app) else {
            linhas.append("Esse programa não está na lista do aviso (Photoshop, Illustrator, After Effects, Cinema 4D).")
            return linhas.joined(separator: "\n")
        }
        linhas.append(prog.insistente ? "Avisa em qualquer arquivo sem salvar." : "Avisa só em arquivo novo / sem título (depois o salvamento automático cuida).")
        let ax = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(ax, 0.5)
        guard let win = janela(ax) else { linhas.append("Não consegui ler a janela."); return linhas.joined(separator: "\n") }
        let titulo = texto(win, kAXTitleAttribute) ?? ""
        let doc = texto(win, kAXDocumentAttribute) ?? "(nenhum)"
        linhas.append("Título da janela: \(titulo.isEmpty ? "(vazio)" : titulo)")
        linhas.append("Documento da janela: \(doc)")
        let ed = lerEditado(win)
        linhas.append("Marca de editado (Acessibilidade): \(ed == nil ? "não informada" : (ed! ? "sim" : "não"))")
        if let a = SalvarLembrete.interpretar(titulo: titulo, docPath: texto(win, kAXDocumentAttribute).flatMap { URL(string: $0)?.path }, axEditado: ed) {
            linhas.append("Arquivo lido: \(a.nome)\(a.novo ? " (novo, sem título)" : "")")
            linhas.append(a.editado ? "Estado: sem salvar" : "Estado: salvo")
        } else {
            linhas.append("Não achei o nome do arquivo no título; sem ele não há aviso.")
        }
        return linhas.joined(separator: "\n")
    }

    // MARK: - Painel

    private func mostrar(prog: Programa, arq: Arquivo, chave: String, app: NSRunningApplication, trabalhado: TimeInterval) {
        esconder()
        let minutos = max(1, Int((trabalhado / 60).rounded()))
        let largura: CGFloat = 360, altura: CGFloat = 128
        let p = PainelAviso(contentRect: NSRect(x: 0, y: 0, width: largura, height: altura),
                            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.level = .floating
        p.isFloatingPanel = true
        p.hidesOnDeactivate = false
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = true
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let fundo = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: largura, height: altura))
        fundo.material = .hudWindow
        fundo.state = .active
        fundo.appearance = NSAppearance(named: .vibrantDark)
        fundo.wantsLayer = true
        fundo.layer?.cornerRadius = 12
        fundo.layer?.masksToBounds = true

        let titulo = NSTextField(labelWithString: "Hora de salvar · \(prog.nome)")
        titulo.font = NSFont.boldSystemFont(ofSize: 13)
        titulo.frame = NSRect(x: 16, y: altura - 34, width: largura - 32, height: 20)
        let detalhe = NSTextField(wrappingLabelWithString: arq.novo
            ? "\(arq.nome)\nArquivo ainda sem nome, há \(minutos) min de trabalho."
            : "\(arq.nome)\nHá \(minutos) min de trabalho sem salvar.")
        detalhe.font = NSFont.systemFont(ofSize: 12)
        detalhe.textColor = .secondaryLabelColor
        detalhe.maximumNumberOfLines = 2
        detalhe.lineBreakMode = .byTruncatingMiddle
        detalhe.frame = NSRect(x: 16, y: altura - 74, width: largura - 32, height: 36)

        let btnSalvar = NSButton(title: "Salvar", target: self, action: #selector(clicouSalvar))
        btnSalvar.bezelStyle = .rounded
        btnSalvar.keyEquivalent = "\r"
        btnSalvar.toolTip = arq.novo
            ? "Manda ⌘S ao \(prog.nome) e tenta abrir o Salvar como na pasta do projeto"
            : "Manda ⌘S ao \(prog.nome) agora"
        btnSalvar.frame = NSRect(x: 16, y: 14, width: 76, height: 28)
        let btnDepois = NSButton(title: "Daqui a 5 min", target: self, action: #selector(clicouDepois))
        btnDepois.bezelStyle = .rounded
        btnDepois.toolTip = "Fecha o aviso; se continuar sem salvar, avisa de novo em 5 min de trabalho"
        btnDepois.frame = NSRect(x: 100, y: 14, width: 108, height: 28)
        let btnNunca = NSButton(title: "Não avisar deste arquivo", target: self, action: #selector(clicouIgnorar))
        btnNunca.bezelStyle = .rounded
        btnNunca.toolTip = "Para de avisar sobre este arquivo (para voltar a avisar: \"Voltar a avisar nos arquivos ignorados\", no menu do Tempo)"
        btnNunca.frame = NSRect(x: 216, y: 14, width: 132, height: 28)

        for v in [titulo, detalhe, btnSalvar, btnDepois, btnNunca] as [NSView] { fundo.addSubview(v) }
        p.contentView = fundo
        if let tela = NSScreen.main {
            let f = tela.visibleFrame
            p.setFrameOrigin(NSPoint(x: f.maxX - largura - 16, y: f.maxY - altura - 16))
        }
        p.orderFrontRegardless()
        NSSound(named: NSSound.Name("Tink"))?.play()
        painel = p
        chavePainel = chave
        appPainel = app
        novoPainel = arq.novo
        // não fica cobrindo o programa: some em 30 s e volta no próximo aviso (5 min de trabalho)
        ocultar = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in self?.esconder() }
    }

    private func esconder() {
        ocultar?.invalidate(); ocultar = nil
        painel?.orderOut(nil); painel = nil
        chavePainel = nil
    }

    @objc private func clicouSalvar() {
        let app = appPainel, novo = novoPainel
        esconder()
        guard let alvo = app else { return }
        salvar(alvo, novo: novo)
    }

    @objc private func clicouDepois() { esconder() }   // o próximo aviso já ficou marcado para 5 min de trabalho

    @objc private func clicouIgnorar() {
        if let chave = chavePainel {
            if novoPainel { ignoradosSessao.insert(chave) }
            else { defaults.set(ignoradosFixos + [chave], forKey: "salvarIgnorados") }
        }
        esconder()
    }

    // MARK: - Salvar

    private func salvar(_ app: NSRunningApplication, novo: Bool) {
        app.activate(options: [.activateIgnoringOtherApps])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.tecla(CGKeyCode(kVK_ANSI_S), flags: .maskCommand)
            guard novo else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self?.irParaPasta(app) }
        }
    }

    private func tecla(_ k: CGKeyCode, flags: CGEventFlags) {
        let origem = CGEventSource(stateID: .hidSystemState)
        let baixo = CGEvent(keyboardEventSource: origem, virtualKey: k, keyDown: true)
        let cima = CGEvent(keyboardEventSource: origem, virtualKey: k, keyDown: false)
        baixo?.flags = flags
        cima?.flags = flags
        baixo?.post(tap: .cghidEventTap)
        cima?.post(tap: .cghidEventTap)
    }

    /// Com o "Salvar como" aberto, vai para a pasta do projeto (⇧⌘G, caminho, Enter). O nome do arquivo fica com você.
    private func irParaPasta(_ app: NSRunningApplication) {
        guard let destino = pasta, !destino.isEmpty, FileManager.default.fileExists(atPath: destino),
              dialogoAberto(app.processIdentifier) else { return }
        let pb = NSPasteboard.general
        let antes = pb.string(forType: .string)
        pb.clearContents()
        pb.setString(destino, forType: .string)
        tecla(CGKeyCode(kVK_ANSI_G), flags: [.maskCommand, .maskShift])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.tecla(CGKeyCode(kVK_ANSI_V), flags: .maskCommand)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self?.tecla(CGKeyCode(kVK_Return), flags: [])
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    if let a = antes { pb.clearContents(); pb.setString(a, forType: .string) }
                }
            }
        }
    }

    private func dialogoAberto(_ pid: pid_t) -> Bool {
        let ax = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(ax, 0.5)
        guard let win = janela(ax) else { return false }
        let sub = texto(win, kAXSubroleAttribute) ?? ""
        let papel = texto(win, kAXRoleAttribute) ?? ""
        if sub == "AXDialog" || sub == "AXSystemDialog" || papel == "AXSheet" { return true }
        var filhos: CFTypeRef?
        if AXUIElementCopyAttributeValue(win, kAXChildrenAttribute as CFString, &filhos) == .success,
           let lista = filhos as? [AXUIElement] {
            for f in lista where texto(f, kAXRoleAttribute) == "AXSheet" { return true }
        }
        return false
    }
}

/// Painel que não rouba o foco do programa de criação (os cliques nos botões funcionam sem ativar o Tempo).
private final class PainelAviso: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
