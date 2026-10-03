# MALGacha

Roll anime and manga characters from your MyAnimeList collection. Import a public profile, build a character pool, and use it for a lottery, team comparisons, or a starting team in Jobber Journeys.

[Try MALGacha](https://malgacha-production.up.railway.app/)

![MALGacha character lottery](https://i.imgur.com/77kCcWy.png)

## Modes

### Lottery

Enter a MAL username or profile URL to import its anime and manga lists. Characters from those entries form your pool; a character appearing in several series is counted only once.

Draw 5–10 characters at a time, or enable the popularity filter to set a minimum number of MAL favorites. You can start drawing while an import is still running. Larger collections take longer to prepare, but subsequent draws use the collected pool.

Characters display their series, favorites, and rarity: N, R, SR, SSR, or UR. Rarity follows MAL favorite counts.

### MALchups

Import two profiles and roll a team on each side. Both sides use the same draw size, and you can use the same profile for both players. Choose one of the three comparison modes, then press FIGHT.

![MALchups profile and team selection](https://i.imgur.com/diq6Tgt.png)

#### Powerscaling

Compares the strongest ranked character on each team using tiers from VS Battles Wiki. For a matched character, MALGacha takes the highest tier listed on their page. Characters without a matching page or usable tier remain unranked.

Matching is imperfect, particularly when characters have several versions or share a name. The linked wiki page lets you check which version was used. This is a tier comparison, not a simulation of how their abilities would interact.

![MALchups powerscaling](https://i.imgur.com/n0YWZC3.png)

#### Cloutscaling

Adds up each team's MAL character favorites. The team with the higher total wins; equal totals are a draw.

![MALchups cloutscaling](https://i.imgur.com/ETsFRd2.png)

#### Writingscaling

Compares the MAL community scores of the series behind each team. Each character contributes the highest-rated anime or manga among their titles in the imported collection, so every character contributes one score. These are community scores, not the profile owner's personal ratings.

Both imports must finish, and every character needs a rated source before the teams can be compared.

![MALchups writingscaling](https://i.imgur.com/qHX3NZQ.png)

### Jobber Journeys — WIP

A browser idle battler built around characters rolled from your MAL collection. The idea is to start with five random characters, then take that team through encounters and gradually build it up.

Each character gets randomly distributed HP, Attack, Defense, and Speed. Higher rarities have a larger base stat total, but a character's canonical strength does not decide their build. Rolled stats belong to that particular character instance and stay the same when you reload your saved team.

Unique passive abilities are intended to give familiar characters their own identity: Naruto's Shadow Clones, Goku's Super Saiyan, or Light's Death Note, for example. At least one member of the starting team is guaranteed to have a listed passive, provided the imported pool contains an eligible character.

Team rolls, saved base stats, and ability descriptions are available to try. Idle combat and ability effects are still planned; the descriptions currently serve as previews. Account sign-in and cross-device saves are not available yet.

![Jobber Journeys](https://i.imgur.com/1E2iTf0.png)

## Run locally

Requires Node.js 20.17 or later and npm. Open a terminal in the project directory and install the dependencies:

```sh
npm install
```

Copy `.env.example` to `.env`. In PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```sh
cp .env.example .env
```

For real profile imports, [register an application with MyAnimeList](https://myanimelist.net/apiconfig) and add its client ID to `.env`:

```dotenv
MAL_CLIENT_ID=your_client_id
```

Start the development server:

```sh
npm run dev
```

Open the address printed in the terminal, normally `http://127.0.0.1:5173`. Restart the server after changing `.env`. Keep that file out of version control.

You can also use the built-in demo without a MAL client ID. It uses a small offline collection with placeholder portraits. Real imports require public anime and manga lists; private lists are not supported.

## Build and deploy

Create a production build and start the Node server:

```sh
npm run build
npm start
```

Set these environment variables on your host:

| Variable | Value |
| --- | --- |
| `MAL_CLIENT_ID` | Your MyAnimeList application's client ID |
| `ORIGIN` | Your site's public origin, such as `https://your-site.example` |
| `PORT` | The port supplied by your host; defaults to `3000` |

`npm start` reads the host's environment variables and does not require a local `.env` file. To run the production build locally with `.env`, use `npm run start:local`; the example file sets `ORIGIN=http://localhost:3000` for this.

Run one long-lived Node process with a writable, persistent `.data` directory. Imports, cached character data, and saved teams are stored there as JSON files, so no separate database is needed for the current version. Without persistent storage, a redeploy may lose saved teams. The import worker is not suited to short-lived serverless functions or multiple instances sharing the same directory.

The browser remembers its last import. This is not an account system, and it does not provide cross-device access.

## Development

Built with SvelteKit and TypeScript. To check types and run tests:

```sh
npm run check
npm test
```

Character lists come from [MyAnimeList](https://myanimelist.net/), cast data from [Tenrai](https://api.tenrai.org/), and powerscaling tiers from [VS Battles Wiki](https://vsbattles.fandom.com/). Import and lookup availability depend on those services. Failed imports can be resumed without discarding characters already collected.
