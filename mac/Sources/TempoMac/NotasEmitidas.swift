import Foundation
import PDFKit
import Vision
import CryptoKit

/// Notas fiscais EMITIDAS por você (NFS-e da sua empresa), guardadas no iCloud em FINANCEIRO/NOTAS FISCAIS.
/// - Lê a pasta (com subpastas) de 10 em 10 minutos e manda o texto de cada PDF novo para o site
///   (window.TempoBridge.reportNotasEmitidas). O site devolve os recebidos e, se for o caso, nomes novos para os arquivos.
/// - Nota que chega pelo WhatsApp (ex.: conversa da contabilidade) e é sua: salva uma cópia na pasta, se ainda não tiver.
/// O documento não sai do Mac: vai só o texto lido, e só para o seu próprio site.
final class NotasEmitidas {
    static let meuCNPJ = "55504134000131"
    static var pasta: URL {
        let custom = UserDefaults.standard.string(forKey: "nfPasta")
        if let c = custom, !c.isEmpty { return URL(fileURLWithPath: (c as NSString).expandingTildeInPath) }
        return ICloudTerapias.root.appendingPathComponent("FINANCEIRO").appendingPathComponent("NOTAS FISCAIS")
    }
    /// (itens, inventário, resposta) -> o site devolve ids recebidos e renomeações [{de, para}]
    var enviar: (([[String: Any]], [[String: String]], @escaping ([String], [[String: String]]) -> Void) -> Void)?
    var aviso: ((String, String) -> Void)?

    private let queue = DispatchQueue(label: "tempo.notasemitidas")
    private let defaults = UserDefaults.standard
    /// caminho|tamanho|data -> sha (não recalcula o hash de arquivo que não mudou)
    private var cacheSha: [String: String] {
        get { defaults.dictionary(forKey: "nfCacheSha") as? [String: String] ?? [:] }
        set { defaults.set(newValue, forKey: "nfCacheSha") }
    }
    /// sha dos arquivos que o site já confirmou
    private var enviados: Set<String> {
        get { Set(defaults.stringArray(forKey: "nfEnviados") ?? []) }
        set { defaults.set(Array(newValue), forKey: "nfEnviados") }
    }
    /// sha de PDFs do WhatsApp já conferidos (nota sua ou não): não lê de novo
    private var vistosWhatsApp: Set<String> {
        get { Set(defaults.stringArray(forKey: "nfWaVistos") ?? []) }
        set { defaults.set(Array(newValue), forKey: "nfWaVistos") }
    }

    func start() {
        queue.asyncAfter(deadline: .now() + 25) { [weak self] in self?.ciclo() }
    }
    /// Botão "Reler pasta" do site: manda tudo de novo (o site não duplica).
    func reler() { queue.async { [weak self] in self?.enviados = []; self?.rodar() } }

    private func ciclo() {
        rodar()
        queue.asyncAfter(deadline: .now() + 600) { [weak self] in self?.ciclo() }
    }

    static func sha256(_ d: Data) -> String { SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined() }

    /// Todos os PDFs da pasta, menos os que você pôs para apagar.
    private func arquivos() -> [URL] {
        let fm = FileManager.default
        guard let e = fm.enumerator(at: NotasEmitidas.pasta, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey], options: [.skipsHiddenFiles]) else { return [] }
        var out: [URL] = []
        for case let u as URL in e {
            if u.path.contains("_Repetidos") { continue }
            if u.pathExtension.lowercased() == "pdf" { out.append(u) }
        }
        return out
    }

    private func rodar() {
        guard FileManager.default.fileExists(atPath: NotasEmitidas.pasta.path) else { return }
        var cache = cacheSha, novos: [[String: Any]] = [], inventario: [[String: String]] = []
        let ja = enviados
        for u in arquivos() {
            let v = try? u.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            let k = "\(u.path)|\(v?.fileSize ?? 0)|\(v?.contentModificationDate?.timeIntervalSince1970 ?? 0)"
            var sha = cache[k]
            var dados: Data?
            if sha == nil {
                guard let d = try? Data(contentsOf: u) else { continue }   // ainda baixando do iCloud: tenta na próxima
                dados = d; sha = NotasEmitidas.sha256(d); cache[k] = sha
            }
            guard let s = sha else { continue }
            inventario.append(["id": s, "arquivo": u.path])
            if ja.contains(s) || novos.count >= 40 { continue }   // no máximo 40 por vez (o resto vai na próxima volta)
            if dados == nil { dados = try? Data(contentsOf: u) }
            guard let d = dados, let t = NotasEmitidas.texto(pdf: d), !t.isEmpty else { continue }
            novos.append(["id": s, "arquivo": u.path, "texto": t])
        }
        // o cache só guarda o que ainda existe
        let vivos = Set(inventario.map { $0["arquivo"] ?? "" })
        cacheSha = cache.filter { vivos.contains(String($0.key.split(separator: "|").first ?? "")) }
        guard !novos.isEmpty || !inventario.isEmpty else { return }
        let resposta: ([String], [[String: String]]) -> Void = { [weak self] ids, renomear in
            self?.queue.async {
                guard let me = self else { return }
                var e = me.enviados; ids.forEach { e.insert($0) }; me.enviados = e
                me.renomear(renomear)
            }
        }
        DispatchQueue.main.async { [weak self] in
            guard let enviar = self?.enviar else { return }
            enviar(novos, inventario, resposta)
        }
    }

    /// Renomeia dentro da pasta de notas (padrão "NF 36 - AGÊNCIA - CLIENTE - PROJETO"). Nunca sobrescreve.
    private func renomear(_ lista: [[String: String]]) {
        let base = NotasEmitidas.pasta.standardizedFileURL.path
        let fm = FileManager.default
        for r in lista {
            guard let de = r["de"], let para = r["para"], !para.isEmpty, !para.contains("/") else { continue }
            let origem = URL(fileURLWithPath: de).standardizedFileURL
            guard origem.path.hasPrefix(base), fm.fileExists(atPath: origem.path) else { continue }
            let destino = origem.deletingLastPathComponent().appendingPathComponent(para)
            if fm.fileExists(atPath: destino.path) { continue }
            try? fm.moveItem(at: origem, to: destino)
        }
    }

    /// PDF que chegou pelo WhatsApp: se for NFS-e emitida pela sua empresa e ainda não estiver na pasta, salva lá.
    /// Chamado pela leitura do WhatsApp (qualquer conversa; na prática, a da contabilidade).
    func talvezSalvarDoWhatsApp(_ dados: Data) {
        queue.async { [weak self] in
            guard let self = self else { return }
            let sha = NotasEmitidas.sha256(dados)
            if self.vistosWhatsApp.contains(sha) { return }
            var v = self.vistosWhatsApp; v.insert(sha); self.vistosWhatsApp = v
            guard let t = NotasEmitidas.texto(pdf: dados), let nota = NotasEmitidas.identificar(t) else { return }
            // já tem essa nota na pasta? (mesmo arquivo, ou mesma chave de acesso em outro arquivo)
            let fm = FileManager.default
            for u in self.arquivos() {
                if let d = try? Data(contentsOf: u) {
                    if NotasEmitidas.sha256(d) == sha { return }
                    if let c = nota.chave, let pdf = PDFDocument(data: d), (pdf.string ?? "").contains(c) { return }
                }
            }
            let ano = nota.ano ?? String(Calendar.current.component(.year, from: Date()))
            let dir = NotasEmitidas.pasta.appendingPathComponent("NFS-e Nacional").appendingPathComponent(ano)
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            // nome provisório: o site troca pelo padrão (NF 36 - AGÊNCIA - CLIENTE - PROJETO) quando reconhecer a nota
            var destino = dir.appendingPathComponent(String(format: "NF %02d - (nova).pdf", nota.numero))
            var n = 2
            while fm.fileExists(atPath: destino.path) { destino = dir.appendingPathComponent(String(format: "NF %02d - (nova) %d.pdf", nota.numero, n)); n += 1 }
            if (try? dados.write(to: destino)) != nil {
                DispatchQueue.main.async { self.aviso?("Tempo", String(format: "NF %02d salva na pasta de notas fiscais.", nota.numero)) }
                self.rodar()
            }
        }
    }

    /// NFS-e nacional emitida por você: número e ano saem da chave de acesso (50 dígitos).
    static func identificar(_ t: String) -> (numero: Int, chave: String?, ano: String?)? {
        guard let re = try? NSRegularExpression(pattern: "\\d{50}") else { return nil }
        let ns = t as NSString
        for m in re.matches(in: t, range: NSRange(location: 0, length: ns.length)) {
            let k = ns.substring(with: m.range)
            let cnpj = String(k.dropFirst(9).prefix(14))
            guard cnpj == meuCNPJ, let num = Int(String(k.dropFirst(23).prefix(13))) else { continue }
            // a primeira chave da nota é a dela; as outras (substituição) vêm depois
            return (num, k, "20" + String(k.dropFirst(36).prefix(2)))
        }
        return nil
    }

    /// Texto do PDF. Escaneado (sem texto): reconhecimento de texto do macOS na primeira página.
    static func texto(pdf dados: Data) -> String? {
        guard let doc = PDFDocument(data: dados) else { return nil }
        let t = (doc.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count >= 50 { return t }
        guard let pagina = doc.page(at: 0) else { return t }
        let b = pagina.bounds(for: .mediaBox)
        let escala: CGFloat = 2.5
        let w = Int(b.width * escala), h = Int(b.height * escala)
        guard w > 0, h > 0, w < 12000, h < 12000,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return t }
        ctx.setFillColor(CGColor(gray: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.scaleBy(x: escala, y: escala)
        pagina.draw(with: .mediaBox, to: ctx)
        guard let img = ctx.makeImage() else { return t }
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.recognitionLanguages = ["pt-BR"]
        req.usesLanguageCorrection = false
        do { try VNImageRequestHandler(cgImage: img, options: [:]).perform([req]) } catch { return t }
        let linhas = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return "[OCR]\n" + linhas.joined(separator: "\n")
    }
}
