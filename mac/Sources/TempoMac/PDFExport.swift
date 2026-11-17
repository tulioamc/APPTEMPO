import AppKit
import WebKit

/// PDF em A4 de uma página HTML pronta (relatório da aba Análises).
/// O site manda o HTML completo (estilo embutido); o app desenha numa vista fora da tela, salva em
/// iCloud Drive/Tempo/Análises/<nome>.pdf e abre o arquivo. Sem iCloud, salva em Documentos/Tempo/Análises.
final class PDFExport: NSObject, WKNavigationDelegate {
    private var web: WKWebView?
    private var janela: NSWindow?
    private var destino: URL?
    private var done: ((URL?) -> Void)?
    private var euMesmo: PDFExport?   // segura o objeto vivo até terminar

    static func pasta(_ sub: String = "Análises") -> URL {
        if ICloudTerapias.disponivel { return ICloudTerapias.root.appendingPathComponent("Tempo/\(sub)") }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/Tempo/\(sub)")
    }

    /// dir: pasta absoluta escolhida pelo site (ex.: ~/BAQUER Dropbox/.../Orçamento); sem ela, iCloud/Tempo/<sub>.
    static func gerar(html: String, nome: String, pasta sub: String = "Análises", dir absoluto: String? = nil, done: @escaping (URL?) -> Void) {
        let e = PDFExport()
        e.euMesmo = e
        e.done = done
        let limpo = nome.components(separatedBy: CharacterSet(charactersIn: "/:\\")).joined(separator: "-")
        let dir = (absoluto?.isEmpty == false) ? URL(fileURLWithPath: (absoluto! as NSString).expandingTildeInPath) : pasta(sub)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        e.destino = dir.appendingPathComponent((limpo.isEmpty ? "Analise" : limpo) + ".pdf")
        let w = WKWebView(frame: NSRect(x: 0, y: 0, width: 794, height: 1123))
        w.navigationDelegate = e
        // a vista precisa estar numa janela (fora da tela) para a impressão desenhar as páginas
        let j = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 794, height: 1123), styleMask: [.borderless], backing: .buffered, defer: false)
        j.isReleasedWhenClosed = false
        j.contentView = w
        e.web = w
        e.janela = j
        w.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // tempo para as fontes e os gráficos terminarem de desenhar
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in self?.imprimir() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { terminar(nil) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { terminar(nil) }

    private func imprimir() {
        guard let w = web, let j = janela, let url = destino else { return terminar(nil) }
        try? FileManager.default.removeItem(at: url)
        let info = NSPrintInfo(dictionary: [NSPrintInfo.AttributeKey.jobSavingURL: url])
        info.jobDisposition = .save
        info.paperSize = NSSize(width: 595.28, height: 841.89)   // A4 em pontos
        info.topMargin = 0; info.bottomMargin = 0; info.leftMargin = 0; info.rightMargin = 0
        info.horizontalPagination = .fit
        info.verticalPagination = .automatic
        info.isHorizontallyCentered = false
        info.isVerticallyCentered = false
        let op = w.printOperation(with: info)
        op.showsPrintPanel = false
        op.showsProgressPanel = false
        op.view?.frame = w.bounds
        op.runModal(for: j, delegate: self, didRun: #selector(impresso(_:success:contextInfo:)), contextInfo: nil)
    }

    @objc private func impresso(_ op: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        guard let url = destino else { return terminar(nil) }
        let tamanho = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        if success && tamanho > 0 { return terminar(url) }
        reserva()
    }

    /// Plano B: uma página longa (createPDF), se a impressão em A4 não gerou o arquivo.
    private func reserva() {
        guard let w = web, let url = destino else { return terminar(nil) }
        w.evaluateJavaScript("document.documentElement.scrollHeight") { [weak self] altura, _ in
            guard let self = self else { return }
            let h = max(1123, (altura as? Double) ?? 1123)
            w.frame = NSRect(x: 0, y: 0, width: 794, height: h)
            let cfg = WKPDFConfiguration()
            cfg.rect = NSRect(x: 0, y: 0, width: 794, height: h)
            w.createPDF(configuration: cfg) { resultado in
                if case .success(let dados) = resultado, (try? dados.write(to: url)) != nil { self.terminar(url) }
                else { self.terminar(nil) }
            }
        }
    }

    private func terminar(_ url: URL?) {
        let cb = done
        done = nil
        janela?.contentView = nil
        janela?.close()
        janela = nil
        web = nil
        DispatchQueue.main.async {
            cb?(url)
            self.euMesmo = nil
        }
    }
}
