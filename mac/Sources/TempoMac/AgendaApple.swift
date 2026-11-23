import Foundation
import EventKit

/// Lê o Calendário da Apple (todas as contas que estão nele: Brenda, iCloud, Gmail…) e manda para o site os
/// compromissos dos últimos 7 dias aos próximos 30. Só leitura. O site junta com os do Google (sem repetir).
/// Fica de fora: a agenda "Tempo" (é o próprio app), aniversários e feriados (o Tempo já tem os feriados).
final class AgendaApple {
    private let store = EKEventStore()
    var enviar: (([[String: Any]]) -> Void)?
    private var pedindo = false
    private var ultimo = ""

    func start() {
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { [weak self] _ in self?.ler(forcar: true) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { self.ler(forcar: true) }
        Timer.scheduledTimer(withTimeInterval: 5 * 60, repeats: true) { [weak self] _ in self?.ler(forcar: true) }
    }

    /// Lê e manda. Na primeira vez o macOS pergunta se o Tempo pode acessar o Calendário.
    func ler(forcar: Bool = false) {
        let st = EKEventStore.authorizationStatus(for: .event)
        if st.rawValue == 3 { coletar(forcar: forcar); return }      // acesso total (macOS 14+) ou autorizado (13)
        guard st == .notDetermined, !pedindo else { return }
        pedindo = true
        let fim: (Bool, Error?) -> Void = { [weak self] ok, _ in
            DispatchQueue.main.async { self?.pedindo = false; if ok { self?.coletar(forcar: true) } }
        }
        if #available(macOS 14.0, *) { store.requestFullAccessToEvents(completion: fim) }
        else { store.requestAccess(to: .event, completion: fim) }
    }

    private func coletar(forcar: Bool) {
        let ini = Date().addingTimeInterval(-7 * 86400), fim = Date().addingTimeInterval(31 * 86400)
        let cals = store.calendars(for: .event).filter { c in
            c.type != .birthday && c.title != "Tempo"
                && !c.title.localizedCaseInsensitiveContains("feriado") && !c.title.localizedCaseInsensitiveContains("holiday")
        }
        var out: [[String: Any]] = []
        if !cals.isEmpty {
            let iso = ISO8601DateFormatter()
            let pred = store.predicateForEvents(withStart: ini, end: fim, calendars: cals)
            for ev in store.events(matching: pred) {
                if ev.status == .canceled { continue }
                if let eu = ev.attendees?.first(where: { $0.isCurrentUser }), eu.participantStatus == .declined { continue }
                let uid = ev.calendarItemExternalIdentifier ?? ""
                out.append([
                    "id": "apple|" + (ev.eventIdentifier ?? uid) + "|" + iso.string(from: ev.startDate),
                    "uid": uid,
                    "ini": iso.string(from: ev.startDate), "fim": iso.string(from: ev.endDate),
                    "titulo": (ev.title?.isEmpty == false ? ev.title! : "Ocupado"),
                    "agenda": ev.calendar.title, "conta": ev.calendar.source.title,
                    "diaTodo": ev.isAllDay, "livre": ev.availability == .free,
                ])
            }
        }
        out.sort { ($0["ini"] as? String ?? "") < ($1["ini"] as? String ?? "") }
        let chave = out.map { "\($0["id"]!)\($0["fim"]!)\($0["titulo"]!)" }.joined(separator: "\n")
        if !forcar && chave == ultimo { return }
        ultimo = chave
        enviar?(out)
    }
}
