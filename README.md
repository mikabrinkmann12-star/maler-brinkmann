# Maler Brinkmann – Handwerker-Software

Eigene Software für den Maler Betrieb Ralf Brinkmann (Saterland), die Plancraft ablösen soll.

- Projektziel, Regeln, Datenmodell und Phasenplan: [CLAUDE.md](CLAUDE.md)
- Einrichtung (GitHub, Supabase, Vercel): `docs/SETUP.md` (folgt in Schritt 0.7)

## Schnellstart (lokal)

```bash
npm install
npm run dev
```

Danach http://localhost:3000 im Browser öffnen.

## Wichtige Befehle

| Befehl | Was er macht |
|---|---|
| `npm run dev` | Entwicklungsserver starten |
| `npm run build` | Produktions-Build (prüft auch TypeScript) |
| `npm run lint` | Code-Prüfung (ESLint) |
| `npm test` | Tests einmal ausführen |
