# Einrichtung: GitHub → Vercel → Supabase

Diese Anleitung beschreibt, wie die App „Maler Brinkmann“ aufgesetzt ist und wie man sie
(neu) einrichtet. Befehle im **PowerShell-Terminal** mit `npm.cmd` / `npx.cmd`, weil
Windows dort PowerShell-Skripte sperrt.

## Überblick: Was liegt wo?

| Dienst | Wofür | Adresse |
|---|---|---|
| **GitHub** | Der Code (privates Repo) | github.com/mikabrinkmann12-star/maler-brinkmann |
| **Vercel** | Hosting: baut und veröffentlicht die App bei jedem Push auf `main` | vercel.com → Projekt `maler-brinkmann` |
| **Supabase `brinkmann-dev`** | Datenbank zum Entwickeln und Testen (Demo-Daten) | Ref `akbqdpwajeaynwqczfkg`, Frankfurt |
| **Supabase `brinkmann-live`** | Echte Datenbank für den Betrieb (nie Testdaten!) | Ref `tezveryzixrysviapmal`, Frankfurt |

```
PC (Code) ──git push──▶ GitHub ──automatisch──▶ Vercel (Frankfurt) ──▶ Supabase brinkmann-live
                                                    └─ Preview-Deployments ──▶ Supabase brinkmann-dev
```

---

## 1. Einmalig auf dem PC

1. **Node.js 24** und **Git für Windows** installieren (beides ist schon installiert).
2. Im Projektordner die Pakete installieren:
   ```bash
   npm.cmd install
   ```
3. `.env.example` nach `.env.local` kopieren und mit den Werten von **brinkmann-dev** füllen
   (Supabase → Project Settings → API Keys):
   ```bash
   copy .env.example .env.local
   ```
   `.env.local` ist in `.gitignore` und landet nie auf GitHub.
4. App starten: `npm.cmd run dev` → http://localhost:3000

## 2. Supabase-Projekte

Beide Projekte: Region **Central EU (Frankfurt)**. In **beiden** unter
**Authentication → Sign In / Providers** einstellen:
- „Allow new users to sign up“ **aus** (Nutzer legt nur der Admin an)
- **Email** → „Minimum password length“ **10**

### Datenbank-Änderungen (Migrationen) einspielen

Migrationen liegen in `supabase/migrations/`. Der Ordner ist normalerweise mit
**brinkmann-dev** verknüpft.

```bash
npx.cmd supabase login
```
(einmalig, öffnet den Browser)

**In dev einspielen:**
```bash
npx.cmd supabase db push --dry-run
```
```bash
npx.cmd supabase db push
```

**In live einspielen** (kurz auf live umschalten, danach SOFORT zurück auf dev):
```bash
npx.cmd supabase link --project-ref tezveryzixrysviapmal
```
```bash
npx.cmd supabase db push --dry-run
```
```bash
npx.cmd supabase db push
```
```bash
npx.cmd supabase link --project-ref akbqdpwajeaynwqczfkg
```

Nach jeder Migration die TypeScript-Typen aktualisieren: `npm.cmd run db:types`.

## 3. Admin-Zugänge anlegen

**In dev:** `npm.cmd run admin:anlegen`

**In live:** Eine Datei `.env.live` im Projektordner anlegen (wird wegen `.env*` nicht
committet) und mit den Werten von **brinkmann-live** füllen:
```
NEXT_PUBLIC_SUPABASE_URL=https://tezveryzixrysviapmal.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
LOGIN_EMAIL_DOMAIN=login.maler-brinkmann.de
```
**Kein** `APP_ENV=development` in `.env.live`, damit dort nie Testdaten landen können. Dann:
```bash
npm.cmd run admin:anlegen -- .env.live
```
Das Skript zeigt oben an, in welche Datenbank es schreibt. Bitte kurz prüfen!
Alle weiteren Nutzer legst du danach in der App an (Einstellungen → Benutzer & Rollen).

## 4. GitHub

Einmalig verknüpfen und hochladen:
```bash
git remote add origin https://github.com/mikabrinkmann12-star/maler-brinkmann.git
```
```bash
git push -u origin main
```
Beim ersten Push öffnet sich ein Fenster zum Anmelden bei GitHub (Git Credential Manager).

Commits laufen unter der anonymen Adresse
`296533198+mikabrinkmann12-star@users.noreply.github.com` (in `git config user.email`).

## 5. Vercel

### Erstes Einrichten
1. vercel.com → **Add New… → Project** → GitHub-Repo `maler-brinkmann` → **Import**.
2. Framework: **Next.js** (wird erkannt). Root Directory: `./`. Build-Einstellungen nicht ändern.
3. Unter **Environment Variables** die Werte von **brinkmann-live** eintragen, bevor du deployst
   (Next.js baut die `NEXT_PUBLIC_…`-Werte beim Build fest ein):

   | Name | Wert |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://tezveryzixrysviapmal.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` von **live** |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` von **live** |
   | `LOGIN_EMAIL_DOMAIN` | `login.maler-brinkmann.de` |

   **Nicht** setzen: `APP_ENV`, `SEED_PASSWORT`.
4. **Deploy**. Nach 1–2 Minuten bekommst du eine Adresse wie `https://maler-brinkmann.vercel.app`.

### Danach: Vorschau-Versionen auf dev umleiten (wichtig!)
Vercel baut für jeden anderen Branch eine **Preview**. Die darf nie mit echten Daten arbeiten.
**Settings → Environment Variables:**
1. Bei den drei Supabase-Variablen auf **Edit** gehen und nur **Production** anhaken.
2. Die drei Variablen nochmal mit den **brinkmann-dev**-Werten anlegen, diesmal nur für **Preview**.
3. Den Schlüssel `SUPABASE_SECRET_KEY` jeweils als **Sensitive** markieren.

### Region
`vercel.json` legt die Server-Funktionen nach **Frankfurt (`fra1`)**, nah an der Datenbank.

## 6. Updates ausrollen

```bash
git push
```
→ Vercel baut automatisch (Status unter vercel.com → Deployments). Alle, die die App gerade
offen haben, sehen innerhalb von 5 Minuten bzw. beim nächsten Öffnen unten den Hinweis
**„Neue Version – Neu laden“**.

## 7. App auf dem Handy installieren (Android)

1. Die Vercel-Adresse in **Chrome** öffnen und anmelden.
2. Unter **Mehr** gibt es den Knopf „App auf dem Handy installieren“. Alternativ: ⋮ → **App installieren**
   bzw. **Zum Startbildschirm hinzufügen**.
3. Danach liegt „Maler Brinkmann“ mit dem MB-Icon auf dem Homescreen und öffnet sich ohne
   Adressleiste.

## 8. Testdaten und Tests (nur dev)

- `npm.cmd run seed`: Demo-Zugänge, Kunden und Projekte in **brinkmann-dev** (Passwort: `SEED_PASSWORT` in `.env.local`)
- `npm.cmd test`: Unit-Tests
- `npm.cmd run test:rls`: Rechte-Tests gegen brinkmann-dev (höchstens ca. 2× in 5 Minuten, Login-Limit)

## 9. Vor dem echten Betrieb (Go-Live-Checkliste)

- [ ] **Vercel Pro** (Hobby ist laut Vercel nur für nicht-kommerzielle Nutzung)
- [ ] **Supabase Pro** für `brinkmann-live` (tägliche Backups)
- [ ] Zusätzlicher Datenbank-Export + Wiederherstellungs-Anleitung (wird noch gebaut)
- [ ] AVV/DPA mit Supabase und Vercel abschließen
- [ ] Preview-Variablen zeigen auf **dev** (siehe 5.)
- [ ] Admin-Zugänge für Ralf und Mika in **live** angelegt

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „Ausführung von Skripts ist deaktiviert“ | `npm.cmd` / `npx.cmd` statt `npm` / `npx` |
| Dev-Server zeigt „… is not a function“ nach Änderungen | Dev-Server neu starten |
| `test:rls` meldet „Zu viele Versuche“ / Login-Fehler | 5 Minuten warten (Supabase-Login-Limit) |
| Vercel-Build schlägt fehl: Variable fehlt | Unter Settings → Environment Variables prüfen, dann **Redeploy** |
| Login online klappt nicht | Gibt es den Nutzer in **live**? (dev-Nutzer gibt es online nicht) |
