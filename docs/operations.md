# Drift

## Lokal utveckling

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

Repot har ingen `package-lock.json`, så installera med `npm install`, inte `npm ci`.

## Kontroller före push

```bash
npm test
npx wrangler deploy --dry-run
```

Prova dessutom flödena för hand när en ändring rör routing, förslag eller admin.

## Driftsättning

Produktionen driftsätts från en renderad kopia, antingen från din dator eller med Workers Builds när en PR mergas till `main`; se `README.md`.

## Publicera Docker-imagen

`.github/workflows/docker.yml` bygger och publicerar imagen när en versionstagg (`v1.2.3`) pushas, eller när `release.yml` anropar den.

- **Namn:** Docker Hub-namnrymden kommer från repo-variabeln `DOCKERHUB_USERNAME` och repo-namnet från GitHub (`github.event.repository.name`). Inget av dem står i workflowen. Imagen heter `docker.io/<DOCKERHUB_USERNAME>/<repo>`.
- **Token:** hemligheten `DOCKERHUB_TOKEN` ligger i miljön `release`.
- **Saknad variabel:** körningen stoppas direkt med ett tydligt fel, innan något byggs eller publiceras. GitHub-releasen finns redan då. Sätt variabeln och kör om workflowen.
- **Taggar:** den exakta versionen pushas först. De rörliga taggarna (`minor`, `major`, `latest`) flyttas bara av den nyaste stabila releasen de står för; en prerelease flyttar ingen, och en äldre stabil release flyttar bara de av `minor`- och `major`-taggarna i sin egen serie där den fortfarande är nyast, aldrig `latest`. En misslyckad push av en rörlig tagg stoppar inte de andra men gör jobbet rött, och en omkörning pushar den exakta versionen och bara de rörliga taggar releasen fortfarande har rätt att flytta. Om listan över releasetaggar inte kan hämtas blir jobbet rött och rörliga taggar som redan pushats ligger kvar. En version som ännu saknar `v`-releasetagg (till exempel en manuell körning på en outgiven version) flyttar ingen rörlig tagg, och det gör inte heller en version vars tagg pekar på en annan commit än den som publiceras. Tidigare pushar av rörliga taggar kan redan ha lyckats när en uppslagning misslyckas, så kontrollera de rörliga taggarna innan du åtgärdar.
- **Samtidighet:** varje release har en egen körning, och ingen körning ersätts eller avbryts. Före och efter varje push av en rörlig tagg görs en ny uppslagning av releasetaggarna; dyker en nyare release upp medan taggen pushas blir jobbet rött, och den nyare releasens workflow körs om så att taggen pekar på den.
- **Missad release:** `release.yml` körs vid varje push till `main` men skapar bara en release när versionen saknar `v`-tagg. Dess `release`-grupp rymmer en väntande körning, så om flera versionshöjningar mergas inom några sekunder kan en tidigare väntande körning ersättas och den versionen får varken tagg, release eller image. Vänta tills varje versions `Release`-körning är klar innan nästa versionshöjning mergas. Åtgärda inom 30 dagar genom att köra om den ersatta `Release`-körningen under Actions. Finns taggen redan men imagen saknas hoppar en omkörning över Docker; kör då workflowen `Docker` manuellt på versionstaggen. Efter 30 dagar lägger du motsvarande avsnitt ur `CHANGELOG.md` i en anteckningsfil, skapar den saknade releasen med `gh release create v<version> --target <ursprunglig commit> --title v<version> --notes-file <anteckningsfil> --generate-notes` och kör sedan `Docker` manuellt på den taggen. Finns taggen men GitHub-releasen saknas, skapar du releasen mot den befintliga taggen med samma kommando (utan `--target`) och kör `Docker` bara om imagen saknas.

## Migreringar

Workers Builds kör inte D1-migreringarna, så de körs för hand från en renderad kopia:

```bash
node tools/render.mjs <din-fil.env> build
npx wrangler d1 migrations apply DB --remote --cwd build
```

- Schemaändringar görs bara med nya migreringar, aldrig direkt i produktionen.
- En migrering som lägger till körs före deployen av den nya Workern, en som tar bort efter.

## Kontroll efter driftsättning

Från samma renderade kopia:

```bash
node build/scripts/check-production-domain.mjs
```

Den kontrollerar att startsidan svarar `200`, att `/api/terms` ger JSON med en lista med termer och, om `ALIAS_HOST` är satt, att aliasdomänen skickar vidare till huvuddomänen med `301`. Varje kontroll görs upp till fem gånger.

Kontrollera också:

- **Förslag:** att ett förslag hamnar i granskningskön utan att publiceras, och att CSP:n tillåter Turnstile men inte `'unsafe-inline'` i `script-src`.
- **Admin:** att `/admin/api/…` kräver `ADMIN_TOKEN` och att publicering och arkivering bara sker med uttryckliga steg.
- **SEO:** att de publika sidorna har canonical och robots, och att `/admin` varken indexeras eller cacheas.

## D1

- Databasen ska vara skapad med `jurisdiction=eu`. Det går inte att ändra efteråt, så ett byte görs som export och import till en ny EU-databas innan bindningen byts.
- Läsrepliker får vara påslagna (`auto`), eftersom Workern använder Sessions API. Replikerna stannar inom EU.

## Felsökning

**Tom eller fel termlista:** kontrollera i den här ordningen domän och route, `/api/terms`, de publicerade termerna i D1 och sist sidan själv.

**Förslag misslyckas:** kontrollera förslagets data, Turnstile (nycklar och `TURNSTILE_HOSTNAMES`), skrivningen till D1 och Workerns logg.

**Admin fungerar inte:** kontrollera `ADMIN_TOKEN` och, om du använder den, Access-applikationen för `/admin` innan du ändrar någon data. Gör aldrig admin-API:t mer publikt för att lösa ett åtkomstproblem.

Frågesträngarna maskeras i loggarna även vid felsökning; lägg aldrig känsliga parametrar i loggar.

## CodeRabbit

`.coderabbit.yaml` använder `inheritance: true` för att ärva `pissmyran/coderabbit`. Lokala granskningsinstruktioner kompletterar de centrala. Listor slås ihop per nyckel: samma `path` ersätter motsvarande central instruktion, medan unika centrala sökvägar behålls. Lokala inställningar ändrar inte skannrar, rådgivande förhandskontroller, godkännanden eller fakturering.

Efter en konfigurationsändring, skriv `@coderabbitai configuration` i en egen PR-kommentar. Kontrollera i svaret att centrala instruktioner, skannrar och rådgivande förhandskontroller finns kvar. YAML-validering visar inte den effektiva konfigurationen från alla nivåer.

Länkarna till `pissmyran/dumpen`, `pissmyran/jobb` och `pissmyran/politiker` ger granskningskontext när ändringen berör gemensamma verktyg. Kontrollera åtkomst genom CodeRabbits PR-granskning: läs granskningssammanfattningens varningar om otillgängliga repon eller plangränser och eventuell kontext under Review details. Om åtkomsten inte bekräftas är verifieringen ofullständig; frånvaro av fynd bevisar inte åtkomst. Konfigurationen ger inga abonnemangsrättigheter. Aktivera inte betalning eller betalfunktioner för att verifiera länkarna.
