import AppKit
import Foundation
import SQLite3
import PDFKit
import Vision
import CryptoKit
import ImageIO

/// Arquivos de Terapias na pasta do iCloud:
/// <iCloud>/_RAFAEL/_Terapias/<Ano_Mes>/ (antes: <iCloud>/Terapias)
/// NotaFiscal_<Ano_Mes>_<Terapeuta>.pdf e Comprovante_<Ano_Mes>_<Terapeuta>.png
enum ICloudTerapias {
    static let root = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
    static var disponivel: Bool { FileManager.default.fileExists(atPath: root.path) }
    /// Pasta das terapias: _RAFAEL/_Terapias (a antiga Terapias só vale se a nova ainda não existir).
    static var terapias: URL {
        let nova = root.appendingPathComponent("_RAFAEL").appendingPathComponent("_Terapias")
        let antiga = root.appendingPathComponent("Terapias")
        let fm = FileManager.default
        if !fm.fileExists(atPath: nova.path) && fm.fileExists(atPath: antiga.path) { return antiga }
        return nova
    }

    /// 'Aloma Silva' -> 'AlomaSilva' (só letras, números e _).
    static func nomeTerapeuta(_ texto: String) -> String {
        String(texto.filter { $0.isLetter || $0.isNumber || $0 == "_" })
    }

    /// tipo: "nota" ou "comprovante". anoMes: "AAAA_MM". ext: extensão do arquivo que chegou (nota em foto vale).
    static func nomeArquivo(tipo: String, anoMes: String, terapeuta: String, ext: String) -> String? {
        let nome = nomeTerapeuta(terapeuta)
        let extensao = ["pdf", "png", "jpg", "jpeg"].contains(ext) ? ext : ""
        guard !nome.isEmpty, !extensao.isEmpty, anoMes.range(of: "^\\d{4}_\\d{2}$", options: .regularExpression) != nil else { return nil }
        // Nome da terapia primeiro: Aloma_2026_11_Nota.pdf, Aloma_2026_11_Comprovante.png (extensão do arquivo original)
        if tipo == "nota" { return "\(nome)_\(anoMes)_Nota.\(extensao)" }
        if tipo == "comprovante" { return "\(nome)_\(anoMes)_Comprovante.\(extensao)" }
        return nil
    }

    /// Nome antigo (NotaFiscal_2026_11_Aloma.pdf) → novo (Aloma_2026_11_Nota.pdf). nil se não for do formato antigo.
    static func nomeNovo(_ antigo: String) -> String? {
        let re = try! NSRegularExpression(pattern: "^(NotaFiscal|Comprovante)_(\\d{4})_(\\d{2})_(.+?)(\\s\\(\\d+\\))?\\.([A-Za-z0-9]+)$")
        let ns = antigo as NSString
        guard let m = re.firstMatch(in: antigo, range: NSRange(location: 0, length: ns.length)) else { return nil }
        let g = { (i: Int) -> String in m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i)) }
        let tipo = g(1) == "NotaFiscal" ? "Nota" : "Comprovante"
        return "\(g(4))_\(g(2))_\(g(3))_\(tipo)\(g(5)).\(g(6))"
    }

    /// Uma vez por abertura do app: renomeia para o formato novo os arquivos que ainda estão no antigo. Nunca sobrescreve.
    static func renomearAntigos() {
        let fm = FileManager.default
        let base = terapias
        guard let meses = try? fm.contentsOfDirectory(at: base, includingPropertiesForKeys: nil) else { return }
        for mes in meses {
            guard let arqs = try? fm.contentsOfDirectory(at: mes, includingPropertiesForKeys: nil) else { continue }
            for a in arqs {
                guard let novo = nomeNovo(a.lastPathComponent) else { continue }
                let destino = mes.appendingPathComponent(novo)
                if !fm.fileExists(atPath: destino.path) { try? fm.moveItem(at: a, to: destino) }
            }
            // todo PDF ganha uma cópia em JPG ao lado (a primeira página), inclusive os que já estavam lá
            for a in (try? fm.contentsOfDirectory(at: mes, includingPropertiesForKeys: nil)) ?? [] where a.pathExtension.lowercased() == "pdf" {
                garantirJPG(a)
            }
        }
    }

    /// Cópia em JPG de um PDF, com o mesmo nome (Aloma_2026_11_Nota.pdf → Aloma_2026_11_Nota.jpg). Não refaz se já existir.
    /// Nota com várias páginas: só a primeira vira JPG (a nota fiscal costuma ter uma página).
    @discardableResult
    static func garantirJPG(_ pdf: URL) -> URL? {
        let jpg = pdf.deletingPathExtension().appendingPathExtension("jpg")
        if FileManager.default.fileExists(atPath: jpg.path) { return jpg }
        guard let doc = PDFDocument(url: pdf), let pagina = doc.page(at: 0) else { return nil }
        let b = pagina.bounds(for: .mediaBox)
        let escala: CGFloat = 2.5   // ~180 dpi: legível para conferir valores
        let w = Int(b.width * escala), h = Int(b.height * escala)
        guard w > 0, h > 0, w < 12000, h < 12000,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(CGColor(gray: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.scaleBy(x: escala, y: escala)
        pagina.draw(with: .mediaBox, to: ctx)
        guard let img = ctx.makeImage(),
              let dest = CGImageDestinationCreateWithURL(jpg as CFURL, "public.jpeg" as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        return CGImageDestinationFinalize(dest) ? jpg : nil
    }

    static func pasta(_ anoMes: String) -> URL { terapias.appendingPathComponent(anoMes) }

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
        if destino.pathExtension.lowercased() == "pdf" { garantirJPG(destino) }   // PDF sempre ganha a cópia em JPG ao lado
        return destino
    }
}

/// WhatsApp Desktop: mensagens que você mandou (por contato e por dia) e notas fiscais / comprovantes
/// enviados nas conversas de terapia. Lê só nome da conversa, tipo, data e se a mensagem foi sua;
/// o texto das mensagens (ZTEXT) nunca é lido (exceção: na conversa da Alice, só as mensagens dela com "menstru…" ou "cistite"). Os arquivos (PDF/foto) são lidos no próprio Mac.
/// Precisa de Acesso Total ao Disco para o Tempo (Ajustes do Sistema > Privacidade e Segurança).
final class WhatsAppMonitor {
    /// Contagem de hoje e de ontem -> window.TempoBridge.reportWhatsApp (chamado na thread principal).
    var sendCounts: (([[String: Any]]) -> Void)?
    /// Notas pendentes -> window.TempoBridge.reportNfse; o site devolve os ids recebidos (thread principal).
    var sendNotes: (([[String: Any]], @escaping ([String]) -> Void) -> Void)?
    /// Conversas (última recebida/enviada, resposta média) e horários das mensagens enviadas nas últimas 24 h
    /// -> window.TempoBridge.reportWhatsAppConversas (thread principal).
    var sendConversas: (([String: Any]) -> Void)?
    /// PDF de conversa que não é de terapia (a pasta de notas emitidas confere se é nota sua).
    var onPdf: ((Data) -> Void)?
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
        // dentista do Rafa: só comprovante (não tem nota nem reembolso); pode vir de qualquer uma das duas conversas
        "Cristiana da Fonte (Dentista Rafa)": "Dentista",
        "CrescerOdonto Dentista": "Dentista",
    ]
    /// Nome da conversa sem diferença de maiúsculas, acentos, espaços e marcas invisíveis do WhatsApp.
    static func chave(_ s: String) -> String {
        let limpo = s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "pt_BR"))
            .unicodeScalars.filter { !(0x200E...0x200F).contains($0.value) && !(0x202A...0x202E).contains($0.value) && !(0x2066...0x2069).contains($0.value) }
        return String(String.UnicodeScalarView(limpo)).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }
    private static let notasPorChave: [String: String] = Dictionary(uniqueKeysWithValues: notasContatos.map { (chave($0.key), $0.value) })

    private let queue = DispatchQueue(label: "tempo.whatsapp")
    /// Fila separada: a consulta de "com quem eu estava falando" não pode esperar a leitura das notas.
    private let lookupQueue = DispatchQueue(label: "tempo.whatsapp.lookup")
    private var avisado = false
    /// No modo foco lê a cada minuto (para a mensagem de cliente avisar logo).
    var rapido = false

    func start() {
        queue.async { ICloudTerapias.renomearAntigos() }
        queue.asyncAfter(deadline: .now() + 20) { [weak self] in self?.cycle() }   // deixa o site carregar
    }

    /// Menu "Ler WhatsApp agora".
    func runNow() { queue.async { [weak self] in self?.run() } }

    /// Menu "Reler notas dos últimos 3 meses": lê de novo as notas e comprovantes, mesmo os que já estão no registro,
    /// para salvar no iCloud o que faltar. O site não duplica: o que já foi lançado só ganha o link do arquivo.
    func relerNotas(done: @escaping (Int) -> Void) {
        queue.async { [weak self] in
            guard let self = self else { return }
            let n = self.lerNotas(desde: Date().addingTimeInterval(-90 * 86400).timeIntervalSince1970, reler: true)
            self.run()
            DispatchQueue.main.async { done(n) }
        }
    }

    private func cycle() {
        run()
        // enquanto o site não confirmou tudo (página ainda carregando), tenta de novo em 30 s
        let espera: TimeInterval = pendentes().isEmpty ? (rapido ? 60 : 300) : 30
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
        if let conv = lerConversas(agora: agora.timeIntervalSince1970) { DispatchQueue.main.async { self.sendConversas?(conv) } }
        lerNotas(desde: agora.addingTimeInterval(-60 * 86400).timeIntervalSince1970)
        let pend = pendentes()
        if !pend.isEmpty {
            DispatchQueue.main.async {
                self.sendNotes?(pend) { ids in self.queue.async { self.marcarEnviadas(ids) } }
            }
        }
    }

    // MARK: - Banco do WhatsApp (somente leitura)

    /// Varredura da Alice (1x por dia pelo horário do site, ou na hora pelo botão "Procurar agora"). `desde` = último id de mensagem
    /// já lido (0 = primeira vez: olha os últimos 400 dias). `auto` = veio do agendamento: espera o WhatsApp estar aberto e sincronizado.
    /// done (thread principal): ["ok": Bool, "motivo": "fechado"|"acesso", "itens": [...], "ultimoId": Int, "auto": Bool].
    func procurarAlice(desde: Int64, auto: Bool, done: @escaping ([String: Any]) -> Void) {
        queue.async { [weak self] in
            guard let self = self else { return }
            func fim(_ r: [String: Any]) { DispatchQueue.main.async { done(r) } }
            if auto && !self.whatsappPronto() { fim(["ok": false, "motivo": "fechado", "auto": true]); return }
            guard let r = self.lerAlice(depoisDe: desde) else { fim(["ok": false, "motivo": "acesso", "auto": auto]); return }
            fim(["ok": true, "itens": r.itens, "ultimoId": r.ultimoId, "auto": auto])
        }
    }

    /// WhatsApp aberto há pelo menos 1 minuto (deu tempo de sincronizar as mensagens novas).
    private func whatsappPronto() -> Bool {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "net.whatsapp.WhatsApp").first else { return false }
        guard let aberto = app.launchDate else { return true }
        return Date().timeIntervalSince(aberto) >= 60
    }

    /// Ciclo da Alice: na conversa dela (nome em defaults "aliceNome", padrão "Alice"), só as mensagens DELA que falam
    /// de menstruação ou cistite e que chegaram depois de `depoisDe` (id da mensagem). Mensagem curta (até 60 letras) vai com o texto,
    /// para o site achar a data ("menstruei dia 20"); mensagem longa vai sem texto: o site só pergunta se é para marcar.
    /// Nada de outras conversas é lido. nil = não conseguiu abrir o banco.
    private func lerAlice(depoisDe: Int64) -> (itens: [[String: Any]], ultimoId: Int64)? {
        let nome = UserDefaults.standard.string(forKey: "aliceNome") ?? "Alice"
        guard !nome.isEmpty else { return ([], 0) }
        guard let db = abrir() else { return nil }
        defer { sqlite3_close(db) }
        let sql = """
        select m.Z_PK, m.ZMESSAGEDATE + ?, m.ZTEXT
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION = s.Z_PK
        where s.ZSESSIONTYPE = 0 and s.ZPARTNERNAME like ? and m.ZISFROMME = 0 and m.ZMESSAGEDATE + ? >= ? and m.Z_PK > ?
          and (m.ZTEXT like '%menstru%' or m.ZTEXT like '%cistite%' or m.ZTEXT like '%cistíte%')
        order by m.Z_PK
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        sqlite3_bind_double(stmt, 1, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_text(stmt, 2, "%\(nome)%", -1, transient)
        sqlite3_bind_double(stmt, 3, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_double(stmt, 4, Date().addingTimeInterval(-400 * 86400).timeIntervalSince1970)
        sqlite3_bind_int64(stmt, 5, depoisDe)
        var out: [[String: Any]] = []
        var ultimo: Int64 = 0
        while sqlite3_step(stmt) == SQLITE_ROW {
            let pk = sqlite3_column_int64(stmt, 0)
            let t = texto(stmt, 2) ?? ""
            let tipo = t.range(of: "menstru", options: [.caseInsensitive, .diacriticInsensitive]) != nil ? "M" : "C"
            var item: [String: Any] = ["id": "wa\(pk)", "ts": sqlite3_column_double(stmt, 1), "tipo": tipo, "curta": t.count <= 60]
            if t.count <= 60 { item["texto"] = t }
            out.append(item)
            ultimo = max(ultimo, pk)
        }
        return (out, ultimo)
    }

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

    /// Conversas com mensagem entre `desde` e `ate` (Unix), com quantas foram enviadas por você.
    /// Conversa em que você só recebeu também entra (com zero), senão não dá para classificá-la no site.
    /// nil = não conseguiu ler o banco.
    private func lerContagens(desde: Double, ate: Double) -> [[String: Any]]? {
        guard let db = abrir() else { return nil }
        defer { sqlite3_close(db) }
        let sql = """
        select s.ZCONTACTJID, s.ZPARTNERNAME, s.ZSESSIONTYPE,
               date(m.ZMESSAGEDATE + ?, 'unixepoch', 'localtime') as dia,
               sum(case when m.ZISFROMME = 1 then 1 else 0 end) as enviadas,
               max(m.ZMESSAGEDATE) as ultima
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION = s.Z_PK
        where s.ZSESSIONTYPE != ?
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
                // hora da última mensagem (Unix): o site ordena os contatos como o WhatsApp
                "ultima": sqlite3_column_double(stmt, 5) + WhatsAppMonitor.epocaCoreData,
            ])
        }
        return out
    }

    /// Últimos 30 dias, por conversa: última mensagem recebida e enviada, tempo médio de resposta
    /// (da primeira mensagem dele sem resposta até a sua próxima, ignorando mais de 72 h) e os horários
    /// das mensagens que você mandou nas últimas 24 h, de qualquer aparelho (o celular sincroniza com o Mac).
    /// Só horários e nomes; o texto nunca é lido.
    private func lerConversas(agora: Double) -> [String: Any]? {
        guard let db = abrir() else { return nil }
        defer { sqlite3_close(db) }
        let sql = """
        select s.ZCONTACTJID, s.ZPARTNERNAME, s.ZSESSIONTYPE, m.ZMESSAGEDATE + ?, m.ZISFROMME
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION = s.Z_PK
        where s.ZSESSIONTYPE != ? and m.ZMESSAGEDATE + ? >= ?
        order by s.ZCONTACTJID, m.ZMESSAGEDATE
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_double(stmt, 1, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_int(stmt, 2, WhatsAppMonitor.tipoStatus)
        sqlite3_bind_double(stmt, 3, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_double(stmt, 4, agora - 30 * 86400)
        struct Conv { var name = ""; var grupo = false; var lastIn = 0.0; var lastOut = 0.0; var pend: Double? = nil; var soma = 0.0; var n = 0; var sem7 = 0; var fora = 0 }
        // fora do horário: fim de semana ou antes das 9h / depois das 19h (horário do Mac)
        let cal = Calendar.current
        func foraDoHorario(_ t: Double) -> Bool {
            let d = Date(timeIntervalSince1970: t); let wd = cal.component(.weekday, from: d); let h = cal.component(.hour, from: d)
            return wd == 1 || wd == 7 || h < 9 || h >= 19
        }
        var conv: [String: Conv] = [:]
        var ordem: [String] = []
        var enviadas: [[String: Any]] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let jid = texto(stmt, 0), !jid.isEmpty else { continue }
            let t = sqlite3_column_double(stmt, 3)
            let meu = sqlite3_column_int(stmt, 4) == 1
            if conv[jid] == nil { conv[jid] = Conv(name: texto(stmt, 1) ?? jid, grupo: sqlite3_column_int(stmt, 2) == 1); ordem.append(jid) }
            var c = conv[jid]!
            if t >= agora - 7 * 86400 { c.sem7 += 1 }
            if foraDoHorario(t) { c.fora += 1 }
            if meu {
                c.lastOut = max(c.lastOut, t)
                if let p = c.pend, !c.grupo { let d = t - p; if d > 0 && d < 72 * 3600 { c.soma += d; c.n += 1 } }
                c.pend = nil
                if t >= agora - 86400 && enviadas.count < 500 { enviadas.append(["name": c.name, "t": t]) }
            } else {
                c.lastIn = max(c.lastIn, t)
                if c.pend == nil { c.pend = t }
            }
            conv[jid] = c
        }
        let lista: [[String: Any]] = ordem.compactMap { jid in
            guard let c = conv[jid] else { return nil }
            return ["jid": jid, "name": c.name, "grupo": c.grupo, "lastIn": c.lastIn, "lastOut": c.lastOut,
                    "respMed": c.n > 0 ? c.soma / Double(c.n) : 0, "respN": c.n, "sem7": c.sem7, "fora30": c.fora]
        }
        return ["conversas": lista, "enviadas": enviadas]
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

    /// Com quem era a conversa neste período (a que teve mais mensagens, enviadas ou recebidas).
    /// O site usa o nome para saber se o tempo no WhatsApp foi trabalho (cliente) ou pausa.
    /// Só o nome da conversa; o texto das mensagens nunca é lido.
    func conversaDoPeriodo(de: Date, ate: Date, done: @escaping (String?) -> Void) {
        lookupQueue.async {
            let margem: TimeInterval = 120   // mensagem logo antes ou logo depois ainda é a mesma conversa
            let nome = self.conversaTop(desde: de.timeIntervalSince1970 - margem, ate: ate.timeIntervalSince1970 + margem)
            DispatchQueue.main.async { done(nome) }
        }
    }

    private func conversaTop(desde: Double, ate: Double) -> String? {
        guard let db = abrir() else { return nil }
        defer { sqlite3_close(db) }
        let sql = """
        select s.ZPARTNERNAME, count(*) as n
        from ZWAMESSAGE m join ZWACHATSESSION s on m.ZCHATSESSION = s.Z_PK
        where s.ZSESSIONTYPE != ? and m.ZMESSAGEDATE + ? between ? and ?
        group by s.ZPARTNERNAME order by n desc limit 1
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, WhatsAppMonitor.tipoStatus)
        sqlite3_bind_double(stmt, 2, WhatsAppMonitor.epocaCoreData)
        sqlite3_bind_double(stmt, 3, desde)
        sqlite3_bind_double(stmt, 4, ate)
        guard sqlite3_step(stmt) == SQLITE_ROW, let nome = texto(stmt, 0), !nome.isEmpty else { return nil }
        return nome
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
    /// guarda uma cópia no iCloud (_RAFAEL/_Terapias/Ano_Mes) e deixa o item na fila até o site confirmar o recebimento.
    @discardableResult
    private func lerNotas(desde: Double, reler: Bool = false) -> Int {
        let linhas = lerMidia(desde: desde)
        guard !linhas.isEmpty else { return 0 }
        var lidos = 0
        var reg = carregarRegistro()
        var mudou = false
        let fm = FileManager.default
        let diaFmt = DateFormatter()
        diaFmt.locale = Locale(identifier: "en_US_POSIX")
        diaFmt.dateFormat = "yyyy-MM-dd"
        for (nome, caminho, coreData) in linhas {
            let candidatos = [WhatsAppMonitor.midia.appendingPathComponent(caminho),
                              WhatsAppMonitor.shared.appendingPathComponent(caminho)]
            guard let linha = WhatsAppMonitor.notasPorChave[WhatsAppMonitor.chave(nome)] else {
                // outras conversas (ex.: contabilidade): PDF pode ser nota fiscal emitida por você -> pasta de notas
                if caminho.lowercased().hasSuffix(".pdf"), let notaEmitida = onPdf,
                   let arq = candidatos.first(where: { fm.fileExists(atPath: $0.path) }), let d = try? Data(contentsOf: arq) {
                    notaEmitida(d)
                }
                continue
            }
            guard let arquivo = candidatos.first(where: { fm.fileExists(atPath: $0.path) }),   // apagado ou ainda não baixado
                  let dados = try? Data(contentsOf: arquivo) else { continue }
            let sha = WhatsAppMonitor.sha256(dados)
            if let r = reg[sha] as? [String: Any] {
                // já lido: só volta a ler no "Reler", e nunca o que ainda está na fila para o site
                if !reler || (r["enviado"] as? Bool) != true { continue }
            }
            guard let texto = textoDoArquivo(arquivo, dados) else { continue }
            guard let tipo = tipoDoDocumento(texto) else {
                reg[sha] = ["enviado": true]   // foto ou PDF que não é nota nem comprovante: não lê de novo
                mudou = true
                continue
            }
            let data = Date(timeIntervalSince1970: coreData + WhatsAppMonitor.epocaCoreData)
            let anoMes = janelaMes(data)
            var salvo: String?
            // nota ou comprovante em foto também ganha cópia no iCloud, com a extensão que chegou
            if ICloudTerapias.disponivel,
               let nomeFinal = ICloudTerapias.nomeArquivo(tipo: tipo, anoMes: anoMes, terapeuta: linha, ext: arquivo.pathExtension.lowercased()) {
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
            lidos += 1
        }
        if mudou { salvarRegistro(reg) }
        return lidos
    }
}
