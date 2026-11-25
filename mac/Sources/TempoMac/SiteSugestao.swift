import AppKit

/// Chrome numa aba que não é de um site da lista: conta como "Outros sites" (o título da aba não é guardado).
/// Para sugerir sites novos, o Mac soma localmente (fica só neste Mac, nunca vai para o banco) quanto tempo cada nome
/// de site (o fim do título da aba, como "Figma" em "Projeto – Figma") ficou na frente. Quando um site passa de 1 h
/// somada em pelo menos 3 dias diferentes, pergunta uma vez se você quer registrar o tempo nele. Sim: o site entra
/// na lista (aparece no Tempo com o nome dele); Não: não pergunta mais.
final class SiteSugestao {
    static let shared = SiteSugestao()
    static let outros = "Outros sites"
    private let d = UserDefaults.standard
    private var perguntando = false

    /// Sites que você aceitou registrar.
    var extras: [String] { d.stringArray(forKey: "chromeSitesExtras") ?? [] }
    private var recusados: [String] { d.stringArray(forKey: "chromeSitesNao") ?? [] }

    /// Nome do site a partir do título da aba: o último pedaço depois de " - ", " – ", " — " ou " | ".
    static func nomeDoSite(_ titulo: String) -> String? {
        var t = titulo
        for suf in [" - Google Chrome", " – Google Chrome", " — Google Chrome"] where t.hasSuffix(suf) { t = String(t.dropLast(suf.count)) }
        var melhor: String?
        for sep in [" - ", " – ", " — ", " | "] {
            if let r = t.range(of: sep, options: .backwards) {
                let n = String(t[r.upperBound...]).trimmingCharacters(in: .whitespaces)
                if melhor == nil || n.count < melhor!.count { melhor = n }
            }
        }
        guard let n = melhor, n.count >= 2, n.count <= 40 else { return nil }
        return n
    }

    /// Site aceito que aparece no título (para registrar com o nome dele).
    func siteAceito(_ titulo: String) -> String? {
        let t = titulo.lowercased()
        return extras.first { t.contains($0.lowercased()) }
    }

    /// Chamado a cada amostra (10 s) com o Chrome na frente numa aba fora da lista.
    func contar(_ titulo: String, segundos: Double = 10) {
        guard let site = SiteSugestao.nomeDoSite(titulo) else { return }
        let chave = site.lowercased()
        if extras.contains(where: { $0.lowercased() == chave }) || recusados.contains(where: { $0.lowercased() == chave }) { return }
        var seg = d.dictionary(forKey: "chromeSiteSeg") as? [String: Double] ?? [:]
        seg[chave, default: 0] += segundos
        d.set(seg, forKey: "chromeSiteSeg")
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let dia = f.string(from: Date())
        var dias = d.dictionary(forKey: "chromeSiteDias") as? [String: [String]] ?? [:]
        if !(dias[chave] ?? []).contains(dia) { dias[chave, default: []].append(dia); d.set(dias, forKey: "chromeSiteDias") }
        if (seg[chave] ?? 0) >= 3600, (dias[chave]?.count ?? 0) >= 3, !perguntando {
            perguntando = true
            DispatchQueue.main.async { [weak self] in self?.perguntar(site) }
        }
    }

    private func perguntar(_ site: String) {
        let horas = Int(((d.dictionary(forKey: "chromeSiteSeg") as? [String: Double] ?? [:])[site.lowercased()] ?? 0) / 3600)
        let alerta = NSAlert()
        alerta.messageText = "Registrar o tempo no \(site)?"
        alerta.informativeText = "Você passou \(horas > 0 ? "\(horas) h" : "bastante tempo") no \(site) em vários dias. Hoje ele conta como \"Outros sites\" do Chrome. Quer que o Tempo registre esse site com o nome dele?"
        alerta.addButton(withTitle: "Registrar")
        alerta.addButton(withTitle: "Não, deixar em Outros sites")
        NSApp.activate(ignoringOtherApps: true)
        let r = alerta.runModal()
        if r == .alertFirstButtonReturn { d.set(extras + [site], forKey: "chromeSitesExtras") }
        else { d.set(recusados + [site], forKey: "chromeSitesNao") }
        perguntando = false
    }
}
