import AppKit
import ApplicationServices
import CoreAudio

/// Contexto de uso: app em primeiro plano, e (se permitido) pasta e nome do arquivo da janela ativa.
struct Context: Equatable {
    let app: String
    let bundle: String
    let doc: String?
    let folder: String?
}

/// Observa o app em primeiro plano e a ociosidade. Não grava nada sozinho: entrega segmentos para o site
/// (pela fila do AppDelegate). Segmentos com menos de 10 segundos são descartados.
final class ActivityMonitor {
    var onSegment: ((Date, Date, Context) -> Void)?
    var onIdle: ((Date, Date) -> Void)?
    /// Chamada começou (true) ou terminou (false), com a hora em que aconteceu.
    var onReuniao: ((Bool, Date) -> Void)?
    /// Tempo com o computador dormindo (tampa fechada): é um motivo de pausa próprio.
    var onSleepEnd: ((Date, Date) -> Void)?
    /// Ao abrir o app: intervalo entre o último uso registrado (app fechado, Mac desligado ou dormindo sem o app)
    /// e agora. O Bool diz se o Mac dormiu ou foi ligado nesse meio-tempo (vira "sono"; senão é ociosidade).
    var onGapAtLaunch: ((Date, Date, Bool) -> Void)?

    private let defaults = UserDefaults.standard
    private var current: Context?
    private var segStart = Date()
    private var idleStart: Date?
    private let idleLimit: TimeInterval = 60
    private let minSegment: TimeInterval = 10
    private let selfBundle = Bundle.main.bundleIdentifier ?? "TempoMac"

    // padrão ligado, igual ao item "Guardar nome do arquivo" do menu (antes lia padrão desligado e não gravava o arquivo)
    private var captureFileNames: Bool { defaults.object(forKey: "captureFileNames") as? Bool ?? true }
    private var captureFolders: Bool { defaults.object(forKey: "captureFolders") as? Bool ?? true }
    private var excluded: Set<String> { Set(defaults.stringArray(forKey: "excludedApps") ?? []) }

    private var sleptAt: Date?

    /// Último sinal de uso de verdade (mouse/teclado), gravado uma vez por minuto para sobreviver ao app fechado.
    private let lastActiveKey = "lastActiveAt"
    private var lastSaved = Date.distantPast

    /// Horário em que o Mac foi ligado ou acordou pela última vez (sysctl kern.boottime / kern.waketime).
    private static func sysctlTime(_ name: String) -> Date? {
        var tv = timeval(), size = MemoryLayout<timeval>.size
        guard sysctlbyname(name, &tv, &size, nil, 0) == 0, tv.tv_sec > 0 else { return nil }
        return Date(timeIntervalSince1970: Double(tv.tv_sec) + Double(tv.tv_usec) / 1_000_000)
    }

    /// Ao abrir: o tempo parado desde o último uso vira pausa (o site só aplica se houver cronômetro rodando
    /// e nunca por cima de atividade já registrada).
    private func reportLaunchGap() {
        let last = defaults.double(forKey: lastActiveKey)
        guard last > 0 else { return }
        let from = Date(timeIntervalSince1970: last)
        let to = Date().addingTimeInterval(-idleSeconds())
        guard to.timeIntervalSince(from) >= idleLimit else { return }
        let dormiu = [Self.sysctlTime("kern.boottime"), Self.sysctlTime("kern.waketime")].contains { ($0 ?? .distantPast) > from }
        onGapAtLaunch?(from, max(to, from), dormiu)
    }

    func start() {
        reportLaunchGap()
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] _ in
            self?.tick()
        }
        // computador dormiu (ou fechou a tampa): o tempo do sono vira ociosidade, do jeito que o Tempo espera
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            let now = Date()
            self.closeSegment(at: now)
            self.current = nil
            self.sleptAt = now
        }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, let start = self.sleptAt else { return }
            self.sleptAt = nil
            let now = Date()
            self.onSleepEnd?(start, now)
            self.segStart = now
        }
        Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.tick() }
        tick()
    }

    /// Microfone em uso por algum app (Meet, Zoom, Teams, FaceTime, ligação do WhatsApp…): está em reunião.
    static func microfoneEmUso() -> Bool {
        var dev = AudioDeviceID(0); var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultInputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &dev) == noErr, dev != 0 else { return false }
        var running: UInt32 = 0; size = UInt32(MemoryLayout<UInt32>.size)
        addr.mSelector = kAudioDevicePropertyDeviceIsRunningSomewhere
        guard AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, &running) == noErr else { return false }
        return running != 0
    }
    /// Apps e sites onde ficar de mãos paradas com o microfone ligado é reunião.
    private static let appsDeReuniao: Set<String> = ["com.google.Chrome", "com.apple.Safari", "company.thebrowser.Browser", "us.zoom.xos", "com.microsoft.teams", "com.microsoft.teams2", "com.apple.FaceTime", "net.whatsapp.WhatsApp", "desktop.WhatsApp", "com.hnc.Discord", "com.tinyspeck.slackmacgap"]
    private var emReuniao = false
    /// Apps que são a própria chamada (com microfone ligado, estar aberto já é reunião).
    private static let appsDeChamada: Set<String> = ["us.zoom.xos", "com.microsoft.teams", "com.microsoft.teams2", "com.apple.FaceTime"]
    private var naChamada = false
    private var chamadaSim = 0, chamadaNao = 0
    private var chamadaDesde: Date? = nil

    func tick() {
        let now = Date()
        var idle = idleSeconds()
        // Reunião: microfone ligado → mouse e teclado parados não são pausa. Sem mexer em nada (ou com o app da chamada
        // na frente), o tempo vira "Reunião"; usando outro programa durante a chamada, conta o programa normalmente.
        let mic = Self.microfoneEmUso()
        let frente = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
        // Chamada de verdade (Meet/Zoom/Teams aberto e microfone ligado): tudo é reunião, qualquer app que esteja na frente.
        let chamadaAgora = mic && (chamadaNoChrome() != nil || NSWorkspace.shared.runningApplications.contains { Self.appsDeChamada.contains($0.bundleIdentifier ?? "") })
        if chamadaAgora { chamadaSim += 1; chamadaNao = 0; if chamadaDesde == nil { chamadaDesde = now } } else { chamadaNao += 1; chamadaSim = 0 }
        if !naChamada && chamadaSim >= 2 { naChamada = true; onReuniao?(true, chamadaDesde ?? now) }          // 2 leituras seguidas (~20 s)
        if naChamada && chamadaNao >= 6 { naChamada = false; onReuniao?(false, now.addingTimeInterval(-60)); chamadaDesde = nil }   // 1 min sem chamada
        if !chamadaAgora && !naChamada { chamadaDesde = nil }
        emReuniao = naChamada || (mic && (idle >= idleLimit || Self.appsDeReuniao.contains(frente)))
        if mic { idle = 0 }
        if now.timeIntervalSince(lastSaved) >= 60 {   // grava o último uso no máximo uma vez por minuto
            lastSaved = now
            defaults.set(now.addingTimeInterval(-idle).timeIntervalSince1970, forKey: lastActiveKey)
        }
        if idle >= idleLimit {
            if idleStart == nil {
                let start = now.addingTimeInterval(-idle)
                idleStart = start
                closeSegment(at: start)
            }
            return
        }
        if let start = idleStart {
            onIdle?(start, now)
            idleStart = nil
            current = nil
            segStart = now
        }
        let ctx = emReuniao ? reuniaoContext() : currentContext()
        if ctx != current {
            closeSegment(at: now)
            current = ctx
            segStart = now
        }
    }

    private func closeSegment(at end: Date) {
        guard let ctx = current else { return }
        let long = end.timeIntervalSince(segStart) >= minSegment
        if long && !excluded.contains(ctx.bundle) {
            onSegment?(segStart, end, ctx)
        }
        current = nil
    }

    /// Segundos desde o último mouse ou teclado (não precisa de permissão especial).
    private func idleSeconds() -> TimeInterval {
        CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
    }

    /// Sites do Chrome que contam. Só o título da aba ativa é lido (não há endereço, histórico nem outros sites).
    /// (texto que aparece no título da aba, nome que aparece no Tempo)
    static let chromeSites: [(match: String, label: String)] = [
        ("Google Meet", "Reunião"), ("Meet –", "Reunião"), ("Meet -", "Reunião"), ("meet.google.com", "Reunião"),
        ("Behance", "Behance"), ("Pinterest", "Pinterest"), ("Magnific", "Magnific"),
        ("Claude", "Claude"), ("ChatGPT", "ChatGPT"),
        ("Google Docs", "Docs"), ("Documentos Google", "Docs"), ("Google Sheets", "Sheets"), ("Planilhas Google", "Sheets"),
        ("Google Slides", "Slides"), ("Apresentações Google", "Slides"), ("Gmail", "Gmail"), ("Google Drive", "Drive"),
    ]

    private func currentContext() -> Context? {
        guard let app = NSWorkspace.shared.frontmostApplication, let name = app.localizedName else { return nil }
        let bundle = app.bundleIdentifier ?? name
        // o próprio Tempo também aparece na linha do tempo, como "Tempo"
        if bundle == selfBundle { return Context(app: "Tempo", bundle: bundle, doc: nil, folder: nil) }
        // o Finder só conta como app: não guarda pasta nem nome de arquivo
        if bundle == "com.apple.finder" { return Context(app: name, bundle: bundle, doc: nil, folder: nil) }
        if bundle == "com.google.Chrome" {
            // Chrome: site da lista (ou aceito por você) vai com o nome dele; qualquer outro conta como "Outros sites"
            // (o título da aba não é guardado; só serve para sugerir sites novos, contando aqui no Mac).
            guard AXIsProcessTrusted() else { return Context(app: name, bundle: bundle, doc: SiteSugestao.outros, folder: nil) }
            if let site = chromeSite(app.processIdentifier) { return Context(app: name, bundle: bundle, doc: site, folder: nil) }
            if let titulo = chromeTitle(app.processIdentifier) {
                if let aceito = SiteSugestao.shared.siteAceito(titulo) { return Context(app: name, bundle: bundle, doc: aceito, folder: nil) }
                SiteSugestao.shared.contar(titulo)
            }
            return Context(app: name, bundle: bundle, doc: SiteSugestao.outros, folder: nil)
        }
        var doc: String?
        var folder: String?
        // Pasta e nome do arquivo exigem permissão de Acessibilidade. Sem ela, só o nome do app é registrado.
        if AXIsProcessTrusted() {
            let axApp = AXUIElementCreateApplication(app.processIdentifier)
            // um app travado não pode segurar o Tempo: no máximo 0,5 s por leitura
            AXUIElementSetMessagingTimeout(axApp, 0.5)
            if let win = frontWindow(axApp) {
                var docRef: CFTypeRef?
                if AXUIElementCopyAttributeValue(win, kAXDocumentAttribute as CFString, &docRef) == .success,
                   let s = docRef as? String, let url = URL(string: s), url.isFileURL {
                    if captureFolders { folder = (url.path as NSString).deletingLastPathComponent }
                    if captureFileNames { doc = url.lastPathComponent }
                }
                if doc == nil && captureFileNames {
                    var titleRef: CFTypeRef?
                    if AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &titleRef) == .success,
                       let title = titleRef as? String, !title.isEmpty {
                        // Adobe põe o zoom e o modo no título ("Logo.ai @ 66,7% (RGB/Preview)"): fica só o nome
                        doc = title.components(separatedBy: " @ ").first ?? title
                    }
                }
            }
        }
        return Context(app: name, bundle: bundle, doc: doc, folder: folder)
    }

    /// Contexto de reunião. Se alguma aba do Chrome (mesmo atrás, em outra janela) está numa chamada — Meet, Zoom,
    /// Teams —, a reunião é do Chrome; senão, do app da frente. O "site/arquivo" é sempre "Reunião", como o Meet no Chrome.
    private func reuniaoContext() -> Context {
        if let site = chamadaNoChrome() { return Context(app: "Google Chrome", bundle: "com.google.Chrome", doc: site, folder: nil) }
        let app = NSWorkspace.shared.frontmostApplication
        return Context(app: app?.localizedName ?? "Chamada", bundle: app?.bundleIdentifier ?? "tempo.reuniao", doc: "Reunião", folder: nil)
    }

    private var chamadaCache: (at: Date, site: String?) = (.distantPast, nil)
    /// Procura nas abas abertas do Chrome (todas as janelas) um endereço de chamada. Pergunta ao Chrome no máximo a cada 30 s;
    /// na primeira vez o macOS pede permissão ("Tempo quer controlar o Google Chrome").
    private func chamadaNoChrome() -> String? {
        if Date().timeIntervalSince(chamadaCache.at) < 30 { return chamadaCache.site }
        var achou: String? = nil
        if NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome").first != nil {
            let script = "tell application \"Google Chrome\" to get URL of every tab of every window"
            var err: NSDictionary?
            if let out = NSAppleScript(source: script)?.executeAndReturnError(&err) {
                var urls: [String] = []
                func junta(_ d: NSAppleEventDescriptor) {
                    if d.numberOfItems > 0 { for i in 1...d.numberOfItems { if let x = d.atIndex(i) { junta(x) } } }
                    else if let t = d.stringValue { urls.append(t) }
                }
                junta(out)
                let chamadas = ["meet.google.com/", "zoom.us/wc", "app.zoom.us", "teams.microsoft.com", "teams.live.com", "whereby.com", "discord.com/channels"]
                if urls.contains(where: { u in chamadas.contains { u.contains($0) } && !u.hasSuffix("meet.google.com/") && !u.contains("meet.google.com/landing") }) { achou = "Reunião" }
            }
        }
        chamadaCache = (Date(), achou)
        return achou
    }

    /// Janela do app: a em foco; se o app não informa, a janela principal; se também não, a primeira aberta.
    /// Adobe e outros apps às vezes não respondem à janela em foco.
    private func frontWindow(_ axApp: AXUIElement) -> AXUIElement? {
        for attr in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
            var ref: CFTypeRef?
            if AXUIElementCopyAttributeValue(axApp, attr as CFString, &ref) == .success, let ref = ref {
                return (ref as! AXUIElement)
            }
        }
        var list: CFTypeRef?
        if AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &list) == .success,
           let wins = list as? [AXUIElement], let first = wins.first {
            return first
        }
        return nil
    }

    /// Título da aba ativa do Chrome (só para reconhecer o site; não é guardado).
    private func chromeTitle(_ pid: pid_t) -> String? {
        let axApp = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(axApp, 0.5)
        var winRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &winRef) == .success, let winRef = winRef else { return nil }
        var titleRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(winRef as! AXUIElement, kAXTitleAttribute as CFString, &titleRef) == .success else { return nil }
        return titleRef as? String
    }

    /// Nome do site da lista se o título da janela do Chrome mencionar um deles; senão nil.
    private func chromeSite(_ pid: pid_t) -> String? {
        let axApp = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(axApp, 0.5)
        var winRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &winRef) == .success, let winRef = winRef else { return nil }
        var titleRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(winRef as! AXUIElement, kAXTitleAttribute as CFString, &titleRef) == .success,
              let title = titleRef as? String else { return nil }
        return ActivityMonitor.chromeSites.first { title.range(of: $0.match, options: .caseInsensitive) != nil }?.label
    }
}
