import Foundation
import SQLite3
import PDFKit
import Vision
import CryptoKit
import ImageIO

/// Arquivos de Terapias na pasta do iCloud:
/// <iCloud>/Terapias/<Ano_Mes>/NotaFiscal_<Ano_Mes>_<Terapeuta>.pdf e Comprovante_<Ano_Mes>_<Terapeuta>.png
enum ICloudTerapias {
    static let root = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
    static var disponivel: Bool { FileManager.default.fileExists(atPath: root.path) }

    /// 'Aloma Silva' -> 'AlomaSilva' (só letras, números e _).
    static func nomeTerapeuta(_ texto: String) -> String {
        String(texto.filter { $0.isLetter || $0.isNumber || $0 == "_" })
    }

    /// tipo: "nota" ou "comprovante". anoMes: "AAAA_MM".
    static func nomeArquivo(tipo: String, anoMes: String, terapeuta: String) -> String? {
        let nome = nomeTerapeuta(terapeuta)
        guard !nome.isEmpty, anoMes.range(of: "^\\d{4}_\\d{2}$", options: .regularExpression) != nil else { return nil }
        if tipo == "nota" { return "NotaFiscal_\(anoMes)_\(nome).pdf" }
        if tipo == "comprovante" { return "Comprovante_\(anoMes)_\(nome).png" }
        return nil
    }

    static func pasta(_ anoMes: String) -> URL { root.appendingPathComponent("Terapias").appendingPathComponent(anoMes) }

    /// O mesmo arquivo já está na pasta do mês (de uma leitura anterior)? Evita cópias "(2)".
    static func jaSalvo(anoMes: String, nome: String, sha: String) -> URL? {
        let dir = pasta(anoMes)
        let base = (nome as NSString).deletingPathExtension, ext = (nome as NSString).pathExtension
        guard let itens = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return nil }
        for u in itens where u.lastPathComponent.hasPrefix(base) && u.pathExtension == ext {
            if let d = try? Data(contentsOf: u), WhatsAppMonitor.sha256(d) == sha { return u }
        }
        return nil
    }

    /// Grava sem sobrescrever: acrescenta (2), (3)…
    static func salvar(anoMes: String, nome: String, dados: Data) throws -> URL {
        let dir = pasta(anoMes)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let base = (nome as NSString).deletingPathExtension, ext = (nome as NSString).pathExtension
        var destino = dir.appendingPathComponent(nome)
        var n = 2
        while FileManager.default.fileExists(atPath: destino.path) {
            destino = dir.appendingPathComponent("\(base) (\(n)).\(ext)")
            n += 1
        }
        try dados.write(to: destino)
        return destino
    }
}

/// WhatsApp Desktop: mensagens que você mandou (por contato e por dia) e notas fiscais / comprovantes
/// enviados nas conversas de terapia. Lê só nome da conversa, tipo, data e se a mensagem foi sua;
/// o texto das mensagens (ZTEXT) nunca é lido. Os arquivos (PDF/foto) são lidos no próprio Mac.
/// Precisa de Acesso Total ao Disco para o Tempo (Ajustes do Sistema > Privacidade e Segurança).
final class WhatsAppMonitor {
    /// Contagem de hoje e de ontem -> window.TempoBridge.reportWhatsApp (chamado na thread principal).
    var sendCounts: (([[String: Any]]) -> Void)?
    /// Notas pendentes -> window.TempoBridge.reportNfse; o site devolve os ids recebidos (thread principal).
    var sendNotes: (([[String: Any]], @escaping ([String]) -> Void) -> Void)?
    /// Não conseguiu abrir o banco do WhatsApp (avisa uma vez só).
    var onNoAccess: (() -> Void)?

    private static let shared = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Group Containers/group.net.whatsapp.WhatsApp.shared")
    private static let banco = shared.appendingPathComponent("ChatStorage.sqlite")
    private static let midia = shared.appendingPathComponent("Message")
    /// Mesmo registro do app antigo em Python: arquivos já lidos (sha256) e fila de envio. Nada é lido duas vezes.
    private static let registro = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Tempo/wa_notas_v2.json")
    private static let epocaCoreData: Double = 978307200   // 2001-01-01 em segundos Unix
    private static let tipoStatus: Int32 = 3                // status/broadcast: não é conversa
    /// Conversa do WhatsApp -> nome da linha na tabela de reembolsos.
    private static let notasContatos: [String: String] = [
        "Carol AT": "AT",
        "Dra Raquel Barreto Psicopedagoga": "Raquel",
        "Aloma Consultório": "Aloma",
        "Erika Gomes (Clau/Aconchego)": "Claudiane",
        "Homero Futebol/ Bicicleta/ Skate": "Homero",
        "ARGOS FINANCEIRO HUGO VIANA": "Patrícia",
    ]

    private let queue = DispatchQueue(label: "tempo.whatsapp")
    private var avisado = false

    func start() {
        queue.asyncAfter(deadline: .now() + 20) { [weak self] in self?.cycle() }   // deixa o site carregar
    }

    /// Menu "Ler WhatsApp agora".
    func runNow() { queue.async { [weak self] in self?.run() } }

    private func cycle() {
        run()
        // enquanto o site não confirmou tudo (página ainda carregando), tenta de novo em 30 s
        let espera: TimeInterval = pendentes().isEmpty ? 300 : 30
        queue.asyncAfter(deadline: .now() + espera) { [weak self] in self?.cycle() }
    }

    private func run() {
        let agora = Date()
        let ontem = Calendar.current.startOfDay(for: agora.addingTimeInterval(-86400))
        guard let linhas = lerContagens(desde: ontem.timeIntervalSince1970, ate: agora.timeIntervalSince1970) else {
            if !avisado { avisado = true; DispatchQueue.main.async { self.onNoAccess?() } }
            return
        }
        if !linhas.isEmpty { DispatchQueue.main.async { self.sendCounts?(linhas) } }
        lerNotas(desde: agora.addingTimeInterval(-60 * 86400).timeIntervalSince1970)
        let pend = pendentes()
        if !pend.isEmpty {
            DispatchQueue.main.async {
                self.sendNotes?(pend) { ids in self.queue.async { self.marcarEnviadas(ids) } }
            }
        }
    }

    // MARK: - Banco do WhatsApp (somente leitura)

    private func abrir() -> OpaquePointer? {
        var db: OpaquePointer?
        if sqlite3_open_v2(WhatsAppMonitor.banco.path, &db, SQLITE_OPEN_READONLY, nil) != SQLITE_OK {
            sqlite3_close(db)
            return nil
        }
        sqlite3_busy_timeout(db, 2000)
        return db
    }

    private func texto(_ stmt: OpaquePointer?, _ col: Int32) -> String? {
        guard let c = sqlite3_column_text(stmt, col) else { return nil }
        return String(cString: c)
    }

    /// Mensagens enviadas por conversa e dia, entre `desde` e `ate` (Unix). nil = não conseguiu ler o banco.
    private func lerContagens(desde: Double, ate: Double) -> [[String: Any]]? {
        guard let db = abrir() else { return nil }
        defer { sqlite3_close(db) }
        let sql = """
        select s.ZCONTACTJID, s.ZPARTNERNAME, s.ZSESSIONTYPE,
               date(m.ZMESSAGEDATE + ?, 'unixepoch', 'localtime') as dia,
               count(*) as enviadas
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION = s.Z_PK
        where m.ZISFROMME = 1 and s.ZSESSIONTYPE != ?
          and m.ZMESSAGEDATE + ? between ? and ?
        group by s.ZCONTACTJID, dia
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_double(stmt, 1, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_int(stmt, 2, WhatsAppMonitor.tipoStatus)
        sqlite3_bind_double(stmt, 3, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_double(stmt, 4, desde)
        sqlite3_bind_double(stmt, 5, ate)
        var out: [[String: Any]] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let jid = texto(stmt, 0), !jid.isEmpty, let dia = texto(stmt, 3) else { continue }
            let nome = texto(stmt, 1) ?? ""
            out.append([
                "jid": jid, "name": nome.isEmpty ? jid : nome,
                "grupo": sqlite3_column_int(stmt, 2) == 1,
                "dia": dia, "enviadas": Int(sqlite3_column_int64(stmt, 4)),
            ])
        }
        return out
    }

    /// (conversa, caminho do arquivo, data Core Data) dos PDFs e fotos desde `desde` (Unix).
    private func lerMidia(desde: Double) -> [(String, String, Double)] {
        guard let db = abrir() else { return [] }
        defer { sqlite3_close(db) }
        let sql = """
        select s.ZPARTNERNAME, mi.ZMEDIALOCALPATH, m.ZMESSAGEDATE
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION = s.Z_PK
        join ZWAMEDIAITEM mi on m.ZMEDIAITEM = mi.Z_PK
        where (mi.ZMEDIALOCALPATH like '%.pdf' or mi.ZMEDIALOCALPATH like '%.png'
               or mi.ZMEDIALOCALPATH like '%.jpg' or mi.ZMEDIALOCALPATH like '%.jpeg')
          and m.ZMESSAGEDATE + ? >= ?
        order by m.ZMESSAGEDATE
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_double(stmt, 1, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_double(stmt, 2, desde)
        var out: [(String, String, Double)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let nome = texto(stmt, 0), let caminho = texto(stmt, 1), !caminho.isEmpty else { continue }
            out.append((nome, caminho, sqlite3_column_double(stmt, 2)))
        }
        return out
    }

    // MARK: - Registro (arquivos lidos e fila de envio)

    private func carregarRegistro() -> [String: Any] {
        guard let d = try? Data(contentsOf: WhatsAppMonitor.registro),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return [:] }
        return o
    }

    private func salvarRegistro(_ reg: [String: Any]) {
        let url = WhatsAppMonitor.registro
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let d = try? JSONSerialization.data(withJSONObject: reg) { try? d.write(to: url, options: .atomic) }
    }

    /// Itens lidos que o site ainda não confirmou.
    private func pendentes() -> [[String: Any]] {
        carregarRegistro().values.compactMap { v in
            guard let d = v as? [String: Any], (d["enviado"] as? Bool) != true, let item = d["item"] as? [String: Any] else { return nil }
            return item
        }
    }

    /// O site confirmou estes itens: saem da fila (o texto do documento é apagado do registro).
    private func marcarEnviadas(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        var reg = carregarRegistro()
        for i in ids where reg[i] != nil { reg[i] = ["enviado": true] }
        salvarRegistro(reg)
    }

    // MARK: - Notas e comprovantes

    static func sha256(_ d: Data) -> String {
        SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined()
    }

    /// Notas de 20 do mês anterior a 19 do mês atual entram no mês atual; a partir do dia 20, no seguinte. "AAAA_MM".
    private func janelaMes(_ data: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: data)
        var ano = c.year ?? 2000, mes = c.month ?? 1
        if (c.day ?? 1) >= 20 {
            mes += 1
            if mes == 13 { ano += 1; mes = 1 }
        }
        return String(format: "%04d_%02d", ano, mes)
    }

    /// Reconhecimento de texto do macOS (Vision). Roda no Mac; o documento não sai do aparelho.
    private func ocr(_ imagem: CGImage) -> String? {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.recognitionLanguages = ["pt-BR"]
        req.usesLanguageCorrection = true
        do { try VNImageRequestHandler(cgImage: imagem, options: [:]).perform([req]) } catch { return nil }
        let linhas = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return linhas.joined(separator: "\n")
    }

    private func imagemDaPagina(_ pagina: PDFPage) -> CGImage? {
        let b = pagina.bounds(for: .mediaBox)
        let escala: CGFloat = 2
        let w = Int(b.width * escala), h = Int(b.height * escala)
        guard w > 0, h > 0, w < 12000, h < 12000,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.setFillColor(CGColor(gray: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.scaleBy(x: escala, y: escala)
        pagina.draw(with: .mediaBox, to: ctx)
        return ctx.makeImage()
    }

    /// PDF com texto: texto do próprio PDF. PDF escaneado: a primeira página vira imagem e vai para o reconhecimento.
    /// Foto (PNG/JPG): reconhecimento direto. nil = não conseguiu agora (tenta de novo na próxima volta).
    private func textoDoArquivo(_ url: URL, _ dados: Data) -> String? {
        if url.pathExtension.lowercased() == "pdf" {
            guard let doc = PDFDocument(data: dados) else { return "" }
            let t = (doc.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { return t }
            guard let pagina = doc.page(at: 0), let img = imagemDaPagina(pagina) else { return "" }
            return ocr(img)
        }
        guard let src = CGImageSourceCreateWithData(dados as CFData, nil),
              let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return "" }
        return ocr(img)
    }

    private func tipoDoDocumento(_ texto: String) -> String? {
        func tem(_ padrao: String) -> Bool { texto.range(of: padrao, options: [.regularExpression, .caseInsensitive]) != nil }
        if tem("CHAVE DE ACESSO DA NFS-e|NFS-e") { return "nota" }
        if texto.contains("R$") && tem("pix|comprovante|transfer") { return "comprovante" }
        return nil
    }

    /// Procura notas (PDF/foto) e comprovantes (PNG/JPG) novos nas conversas de terapia. Cada arquivo é lido uma vez:
    /// guarda uma cópia no iCloud (Terapias/Ano_Mes) e deixa o item na fila até o site confirmar o recebimento.
    private func lerNotas(desde: Double) {
        let linhas = lerMidia(desde: desde)
        guard !linhas.isEmpty else { return }
        var reg = carregarRegistro()
        var mudou = false
        let fm = FileManager.default
        let diaFmt = DateFormatter()
        diaFmt.locale = Locale(identifier: "en_US_POSIX")
        diaFmt.dateFormat = "yyyy-MM-dd"
        for (nome, caminho, coreData) in linhas {
            guard let linha = WhatsAppMonitor.notasContatos[nome] else { continue }
            let candidatos = [WhatsAppMonitor.midia.appendingPathComponent(caminho),
                              WhatsAppMonitor.shared.appendingPathComponent(caminho)]
            guard let arquivo = candidatos.first(where: { fm.fileExists(atPath: $0.path) }),   // apagado ou ainda não baixado
                  let dados = try? Data(contentsOf: arquivo) else { continue }
            let sha = WhatsAppMonitor.sha256(dados)
            if reg[sha] != nil { continue }
            guard let texto = textoDoArquivo(arquivo, dados) else { continue }
            guard let tipo = tipoDoDocumento(texto) else {
                reg[sha] = ["enviado": true]   // foto ou PDF que não é nota nem comprovante: não lê de novo
                mudou = true
                continue
            }
            let data = Date(timeIntervalSince1970: coreData + WhatsAppMonitor.epocaCoreData)
            let anoMes = janelaMes(data)
            var salvo: String?
            let ext = arquivo.pathExtension.lowercased()
            let extOk = (tipo == "nota" && ext == "pdf") || (tipo == "comprovante" && ext == "png")
            if extOk, ICloudTerapias.disponivel,
               let nomeFinal = ICloudTerapias.nomeArquivo(tipo: tipo, anoMes: anoMes, terapeuta: linha) {
                if let existente = ICloudTerapias.jaSalvo(anoMes: anoMes, nome: nomeFinal, sha: sha) {
                    salvo = existente.path
                } else {
                    salvo = (try? ICloudTerapias.salvar(anoMes: anoMes, nome: nomeFinal, dados: dados))?.path
                }
            }
            let item: [String: Any] = [
                "id": sha, "contato": nome, "tipo": tipo, "texto": texto,
                "data": diaFmt.string(from: data), "arquivo": salvo ?? NSNull(),
            ]
            reg[sha] = ["enviado": false, "item": item]
            mudou = true
        }
        if mudou { salvarRegistro(reg) }
    }
}
