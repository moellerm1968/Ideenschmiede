# 🏭 Ideenschmiede — KI-Firmen-Simulation

Autonome KI-Agenten simulieren eine Produktentwicklungs-Firma mit CMO, Produkt-Managern und zwei parallelen Spezialisten-Teams. Fokus: **SaaS / Software / AI für KMU (DACH)**.

LLM-Zugang ausschließlich über das **[GitHub Copilot SDK](https://github.com/github/copilot-sdk)** — kein direkter API-Key nötig, Authentifizierung über die GitHub Copilot CLI.

## Voraussetzungen

- Node.js 18+
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installiert und eingeloggt:
  ```bash
  gh extension install github/gh-copilot
  gh auth login
  ```

## Schnellstart

```bash
cp .env.example .env
npm install
npm run dev
```

Dashboard öffnen: [http://localhost:3000](http://localhost:3000)

---

## Architektur

```
CMO-Agent
  └─► Ideen-Backlog (data/Ideenbacklog.md)
        ├─► PM-1 (B2C-Fokus)
        ├─► PM-2 (B2B/Enterprise-Fokus)   → Product-Backlog (data/ProductBacklog.md)
        └─► PM-3 (Plattform-Fokus)
              ├─► Team-Orchestrator 1 ─┐
              └─► Team-Orchestrator 2 ─┘  (parallel)
                    ├─► SW-Engineer       ─┐
                    ├─► Cloud-Architekt    ├─ parallel
                    ├─► Market-Researcher ─┘
                    └─► Controller (nutzt alle 3 Outputs)
                          └─► Detaillierter Produktplan (data/plans/PLAN-NNN.md)
```

## Umgebungsvariablen (.env)

| Variable | Standard | Beschreibung |
|---|---|---|
| `COPILOT_MODEL` | `gpt-4o-mini` | LLM-Modell (z. B. `gpt-4.1`, `gpt-4o-mini`) |
| `PORT` | `3000` | Server-Port |
| `CMO_INTERVAL_MS` | `600000` | CMO-Loop-Intervall (ms) |
| `PM_INTERVAL_MS` | `120000` | Product-Manager-Loop-Intervall (ms) |
| `SPECIALIST_INTERVAL_MS` | `60000` | Spezialisten-Teams-Intervall (ms) |

## Rollen-Profile

Alle Agenten-Profile in `agents/`:

| Datei | Rolle |
|---|---|
| `CMO.Agent.md` | Trend-Recherche, Ideen-Generierung (SaaS/AI für KMU, DACH) |
| `ProductManager.Agent.md` | Produkt-Briefings (3 Perspektiven: B2C / B2B / Plattform) |
| `SoftwareEngineer.Agent.md` | Technische Machbarkeit, Architektur, Aufwand |
| `CloudArchitect.Agent.md` | Cloud-Architektur (AWS/GCP/Azure), Infra-Kosten, DSGVO |
| `MarketResearcher.Agent.md` | TAM/SAM/SOM, Wettbewerb, KMU-Markt DACH |
| `Controller.Agent.md` | Business Case, NPV, IRR, Break-Even |

## Datenhaltung

| Pfad | Inhalt |
|---|---|
| `data/Ideenbacklog.md` | CMO-Ideen (FIFO-Queue, PENDING → IN_PROGRESS → DONE) |
| `data/ProductBacklog.md` | PM-Produktbriefings (PENDING_REVIEW → IN_REVIEW → REVIEWED) |
| `data/plans/PLAN-NNN.md` | Je ein vollständiger Detaillierter Produktplan |
| `data/costs.json` | API-Aufruf-Zähler je Agent (kumulativ) |

## Dashboard

- **Agenten-Status** — Live-Statusanzeige aller Agenten via SSE
- **Ideen- & Product-Backlog** — Karten-Ansicht mit Status-Badges
- **Produktpläne** — Tabelle aller fertigen Pläne (✅ Investieren / ⚠️ Bedingt / ❌ Nicht), Klick öffnet den vollständigen Plan
- **API-Aufrufe** — Call-Zähler je Agent in Echtzeit
- **Aktivitäts-Log** — Live-Feed aller Agent-Aktionen

## Technischer Stack

- **Runtime:** Node.js + TypeScript (`tsx` für Dev)
- **LLM-Zugang:** `@github/copilot-sdk`
- **Server:** Express + SSE
- **Concurrency:** `async-mutex` (je eine Mutex pro Backlog-Datei)
