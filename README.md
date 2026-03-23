# 🏭 Ideenschmiede — KI-Firmen-Simulation

Autonome KI-Agenten simulieren eine Produktentwicklungs-Firma mit CMO, Produkt-Managern und zwei parallelen Spezialisten-Teams. Fokus: **SaaS / Software / AI für KMU (DACH)**.

## Schnellstart

### 1. API-Key eintragen
```bash
cp .env.example .env
# ANTHROPIC_API_KEY=sk-ant-... in .env eintragen
```

### 2. Starten
```bash
npm run dev
```

### 3. Dashboard öffnen
```
http://localhost:3000
```

---

## Architektur

```
CMO-Agent (alle 10 Min, gründliche Web-Recherche)
  └─► Ideen-Backlog (data/Ideenbacklog.md)
        ├─► PM-1 (alle 2 Min, B2C-KMU-Fokus)
        ├─► PM-2 (alle 2 Min, B2B-KMU-Fokus)   → Product-Backlog
        └─► PM-3 (alle 2 Min, Plattform-Fokus)
              ├─► Team-Orchestrator 1 (alle 1 Min) ─┐
              └─► Team-Orchestrator 2 (alle 1 Min) ─┘  (parallel)
                    ├─► SW-Engineer       ─┐
                    ├─► Cloud-Architekt    ├─ parallel
                    ├─► Market-Researcher ─┘
                    └─► Controller (nutzt alle 3 Outputs)
                          └─► Detaillierter Produktplan (data/plans/PLAN-NNN.md)
```

## Kosten-Modell (Haiku 4.5)

| Typ | Preis |
|---|---|
| Input-Tokens | $1.00 / MTok |
| Output-Tokens | $5.00 / MTok |
| Web-Suche (CMO) | $10.00 / 1.000 Suchen |

## Umgebungsvariablen (.env)

| Variable | Standard | Beschreibung |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Pflicht** |
| `PORT` | `3000` | Server-Port |
| `CMO_INTERVAL_MS` | `600000` | CMO-Loop (10 Min, gründlicher) |
| `PM_INTERVAL_MS` | `120000` | PM-Loop (2 Min) |
| `SPECIALIST_INTERVAL_MS` | `60000` | Spezialisten-Loop (1 Min, 2× Teams) |

## Rollen-Profile

Alle Agenten-Profile in `agents/`:
- `CMO.Agent.md` — Trend-Recherche, Ideen-Generierung (SaaS/AI für KMU, DACH)
- `ProductManager.Agent.md` — Produkt-Briefings (3 Perspektiven: B2C/B2B/Plattform)
- `SoftwareEngineer.Agent.md` — Technische Machbarkeit, Architektur
- `CloudArchitect.Agent.md` — Cloud-Architektur (AWS/GCP/Azure), Infrastruktur-Kosten, DSGVO
- `MarketResearcher.Agent.md` — TAM/SAM/SOM, Wettbewerb, KMU-Markt
- `Controller.Agent.md` — Business Case, NPV, IRR, Break-Even

## Datenhaltung

Alle Daten in `data/`:
- `Ideenbacklog.md` — CMO-Ideen (FIFO-Queue)
- `ProductBacklog.md` — PM-Produktbriefings
- `plans/PLAN-NNN.md` — Je ein Detaillierter Produktplan pro Datei
- `costs.json` — API-Kosten per Agent (kumulativ)

## Dashboard-Features

- **Agenten-Status** — Live-Statusanzeige aller 6 Agenten via SSE
- **Ideen- & Product-Backlog** — Karten-Ansicht mit Status-Badges
- **DPD-Tabelle** — Alle fertigen Produktpläne, sortiert nach kommerzieller Priorität (✅ Investieren → ⚠️ Bedingt → ❌ Nicht) — Klick öffnet den vollständigen Plan im Browser
- **Kosten-Aufschlüsselung** — Token-Verbrauch und Kosten je Agent in Echtzeit
- **Aktivitäts-Log** — Live-Feed aller Agent-Aktionen
