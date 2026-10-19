import AppKit
import ApplicationServices

/// Contexto de uso: app em primeiro plano, e (se permitido) pasta e nome do arquivo da janela ativa.
struct Context: Equatable {
    let app: String
    let bundle: String
    let doc: String?
    let folder: String?
}

/// Observa o app em primeiro plano e a ociosidade. Não grava nada sozinho: entrega segmentos para o site,
/// que transforma em sugestão. Segmentos com menos de 2 minutos são descartados.
final class ActivityMonitor {
    var onSegment: ((Date, Date, Context) -> Void)?
    var onIdle: ((Date, Date) -> Void)?

    private let defaults = UserDefaults.standard
    private var current: Context?
    private var segStart = Date()
    private var idleStart: Date?
    private let idleLimit: TimeInterval = 60
    private let minSegment: TimeInterval = 60
    private let selfBundle = Bundle.main.bundleIdentifier ?? "TempoMac"

    private var captureFileNames: Bool { defaults.bool(forKey: "captureFileNames") }
    private var captureFolders: Bool { defaults.object(forKey: "captureFolders") as? Bool ?? true }
    private var excluded: Set<String> { Set(defaults.stringArray(forKey: "excludedApps") ?? []) }

    private var sleptAt: Date?

    func start() {
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
            self.onIdle?(start, now)
            self.segStart = now
        }
        Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.tick() }
        tick()
    }

    func tick() {
        let now = Date()
        let idle = idleSeconds()
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
        let ctx = currentContext()
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
        ("Behance", "Behance"), ("Pinterest", "Pinterest"), ("Magnific", "Magnific"),
        ("Claude", "Claude"), ("ChatGPT", "ChatGPT"),
        ("Google Meet", "Reunião"), ("Meet –", "Reunião"),
    ]

    private func currentContext() -> Context? {
        guard let app = NSWorkspace.shared.frontmostApplication, let name = app.localizedName else { return nil }
        let bundle = app.bundleIdentifier ?? name
        // o próprio Tempo também aparece na linha do tempo, como "Tempo"
        if bundle == selfBundle { return Context(app: "Tempo", bundle: bundle, doc: nil, folder: nil) }
        if bundle == "com.google.Chrome" {
            // Chrome só conta quando a aba ativa é um dos sites da lista; outros sites não são registrados.
            guard AXIsProcessTrusted(), let site = chromeSite(app.processIdentifier) else { return nil }
            return Context(app: name, bundle: bundle, doc: site, folder: nil)
        }
        var doc: String?
        var folder: String?
        // Pasta e nome do arquivo exigem permissão de Acessibilidade. Sem ela, só o nome do app é registrado.
        if AXIsProcessTrusted() {
            let axApp = AXUIElementCreateApplication(app.processIdentifier)
            // um app travado não pode segurar o Tempo: no máximo 0,5 s por leitura
            AXUIElementSetMessagingTimeout(axApp, 0.5)
            var winRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &winRef) == .success, let winRef = winRef {
                let win = winRef as! AXUIElement
                var docRef: CFTypeRef?
                if AXUIElementCopyAttributeValue(win, kAXDocumentAttribute as CFString, &docRef) == .success,
                   let s = docRef as? String, let url = URL(string: s), url.isFileURL {
                    if captureFolders { folder = (url.path as NSString).deletingLastPathComponent }
                    if captureFileNames { doc = url.lastPathComponent }
                }
                if doc == nil && captureFileNames {
                    var titleRef: CFTypeRef?
                    if AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &titleRef) == .success {
                        doc = titleRef as? String
                    }
                }
            }
        }
        return Context(app: name, bundle: bundle, doc: doc, folder: folder)
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
