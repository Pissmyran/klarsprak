# AGENTS.md – klarsprak

En sajt som jämför vardagssvenska med juridiskt och myndighetsspråk, plus en Docker-bild för egen drift.

Läs de gemensamma reglerna i början av varje session: [GOVERNANCE.md](https://raw.githubusercontent.com/pissmyran/.github/main/GOVERNANCE.md) och [SERVICES.md](https://raw.githubusercontent.com/pissmyran/.github/main/SERVICES.md). Läs [docs/architecture.md](docs/architecture.md) och [docs/operations.md](docs/operations.md) före större ändringar.

## Kommandon

```bash
npm install && node --test
npx wrangler deploy --dry-run
```

Båda krävs före push.

## Regler

- **Arbeta självständigt:** gör uppgiften själv i stället för att lämna tillbaka steg till användaren. Fråga bara om beslut som verkligen är deras. Är något blockerat, säg tydligt vad och varför; säg aldrig åt användaren att göra jobbet eller kontrollera sådant du kan kontrollera själv.
- **Ingång:** `src/index.js`. Hanterare: fetch. Bindningar: D1, Assets.
- **API:** publika `/api/terms` och `/api/submit` (Turnstile) och en granskningskö i `/admin` med bearer-token.
- **Routing:** behåll att Workern går först (`run_worker_first`); den styr värdnamn, admin, SEO och säkerhetshuvuden. `/admin` släpps igenom till de statiska filerna, som serverar `admin.html` där; skriv inte om den till `/admin.html`.
- **Ett förslag** publiceras aldrig utan granskningssteget.
- **Dokumentationen** publiceras också under `/docs` av appens egen Worker: Workers Builds kör `node tools/render.mjs - build && (sh tools/docs-cloudflare.sh build/public || echo "docs skipped")`, och Workern ger sajtens inline-skript CSP-noncen (`isDocsPath` i `src/index.js`).
- **Docker-bild:** publiceras som `docker.io/pissmyran/klarsprak` av `.github/workflows/docker.yml`. `docker-compose.yml` låser den med tagg och digest; håll taggen, digesten, `docker/README.md` och `README.md` i synk. Publiceringen pushar först den exakta versionen och försöker sedan alla rörliga taggar (`minor`, `major`, `latest`); en misslyckad push av en rörlig tagg stoppar inte de andra men gör jobbet rött, och en omkörning pushar alla taggar igen. Alla releaser delar en concurrency-grupp.
- **Release:** versionen finns i `package.json`.
- **Extra noggrant:** inskick och Turnstile, admin-token, CSP och migreringar.

## CodeRabbit

`.coderabbit.yaml` ärver `pissmyran/coderabbit` och innehåller repots riskområden, testvägledning, svensk/engelsk dokumentationsmappning och länkar till relaterade tjänsterepon. Verifiera den upplösta konfigurationen och åtkomsten till länkade repon enligt [docs/operations.md](docs/operations.md#coderabbit).
