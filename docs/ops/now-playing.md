# Now playing: connect, switch on, pause, reconnect, disconnect

"Now playing" shows what Matthew is playing on Spotify, on the landing page at `/` (below the publication links, above "Updates sign-up opens soon") and on `/vibes` in the full build. Design and limits: ADR 0009. It ships off: `NOW_PLAYING_ENABLED` stays unset until step 7.

Matthew does every step by hand. Nothing here is automated, and no build session runs any of it or sees any value. This guide uses variable **names** only. Never paste a client secret, code or token into a chat, an issue, a pull request or this repository.

## What the site does and never does

- It makes two kinds of request, from the server only: it exchanges the refresh token for an access token (`POST https://accounts.spotify.com/api/token`, refresh grant) and asks what is playing (`GET https://api.spotify.com/v1/me/player/currently-playing`). The code cannot build any other request.
- It asks Spotify at most once every 30 seconds, however many people visit; everyone in between gets the same answer. The browser asks the site, never Spotify.
- It keeps only the track name, the artist names, the album name, their Spotify links, and whether it is playing. A podcast shows only "Listening to a podcast". No album art, device, progress or listening times are kept or shown.
- Tokens stay in memory. Nothing is written to a database.

## Variables

All in Vercel → Project → Settings → Environment Variables, **Production only**, each marked **Sensitive**. Never set any of them for Preview or Development; the code ignores them outside Production anyway.

| Name | What it holds |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | the Spotify app's client ID |
| `SPOTIFY_CLIENT_SECRET` | the Spotify app's client secret |
| `SPOTIFY_REFRESH_TOKEN` | the refresh token from step 3 |
| `SPOTIFY_AUTHORIZED_AT` | the date of step 2, as `YYYY-MM-DD` |
| `NOW_PLAYING_ENABLED` | `true` to show the feature (step 7); anything else, or unset, is off |
| `NOW_PLAYING_SHARING` | unset to share; `off` to pause (step 8) |

Vercel applies a changed variable only to a new deployment, so every change below ends with a redeploy of Production.

## 1. The Spotify app

Your app exists (Web API only). In the Spotify developer dashboard, open it → Settings:

- **Redirect URIs:** add exactly `http://127.0.0.1:8888/callback`. Spotify allows `http` only for a loopback address, and refuses `localhost`. Nothing needs to be listening on that port.
- **APIs used:** Web API only.
- The account that owns the app must keep Spotify Premium; Spotify stops Development Mode apps whose owner's Premium lapses.

## 2. Authorize, once, in your browser

Signed in to Spotify as yourself, open this address, with your client ID in place of `<client-id>` and any random word in place of `<state>`:

```
https://accounts.spotify.com/authorize?client_id=<client-id>&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&scope=user-read-currently-playing&state=<state>
```

The consent screen must ask for one thing only: what you are currently playing. If it asks for anything else, stop. Approve.

The browser then tries to open `http://127.0.0.1:8888/callback?code=…&state=…` and shows an error, because nothing is listening there. That is expected. From the **address bar**, check that `state` is your word, then copy the value after `code=` (up to `&state`). Use it at once; it is single-use and short-lived. Note today's date for `SPOTIFY_AUTHORIZED_AT`.

## 3. Exchange the code, in a terminal on your own machine

The values are typed without echo and kept out of your shell history and the process list:

```
read -rs CLIENT_ID; read -rs CLIENT_SECRET; read -rs CODE
curl -sS https://accounts.spotify.com/api/token \
  --config <(printf 'user = "%s:%s"\n' "$CLIENT_ID" "$CLIENT_SECRET") \
  -d grant_type=authorization_code \
  --data-urlencode "code=$CODE" \
  --data-urlencode "redirect_uri=http://127.0.0.1:8888/callback"
unset CLIENT_ID CLIENT_SECRET CODE
```

Each `read -rs` waits for you to paste one value and press Enter; nothing shows. The answer is JSON. Check that `scope` is exactly `user-read-currently-playing`. Copy `refresh_token` straight into Vercel (step 4); ignore `access_token`, which expires within the hour. Then clear the terminal and its scrollback.

## 4. Vercel

Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` and `SPOTIFY_AUTHORIZED_AT` for Production, Sensitive. Do **not** add `NOW_PLAYING_ENABLED` yet. Leave `NOW_PLAYING_SHARING` unset.

## 5. Dry run, with the feature still off

Redeploy Production. Then:

- `/` looks exactly as before; there is no "What is Matty vibing to?".
- `/api/now-playing` answers 404.
- `/privacy` says `Version landing-1`.

## 6. Before switching on: the Spotify logo

Spotify's design guidelines ask for its logo beside its content. The site does not draw it; it waits for the official file, from Spotify's own design resources. Until that file is in the repository, the component shows a placeholder where the logo goes, and the release check refuses any build with `NOW_PLAYING_ENABLED=true`. Supply the file to a build session; a pull request adds it and removes the `spotifyLogo` placeholder. After it is merged, on your machine on `main`:

```
NOW_PLAYING_ENABLED=true node scripts/check-release.mjs
```

It must end with `release check: now playing: passed.`

## 7. Switch on

Add `NOW_PLAYING_ENABLED` = `true` for Production and redeploy. Then:

- The build log shows `release check: now playing: passed.` If it shows `FAILED`, the deployment did not build; nothing changed on the live site.
- `/` shows "What is Matty vibing to?" below the links, with one of: Playing, Paused, Nothing playing, Listening to a podcast. Play something and reload after 30 seconds; it follows.
- `/privacy` says `Version landing-2` and has a short Spotify section.
- `/api/now-playing` answers JSON.
- In the runtime logs (Vercel → Logs), there is **no** `Spotify reconnect needed`, no `credentials are not set`, and **no** `Runtime Cache unavailable in this environment`. That last line would mean the shared cache is not in use, so the 30-second bound would hold per instance only; switch off and report it.
- Vercel → Project → Settings → Functions: note the function region. The 30-second bound is shared within one region (ADR 0009); keep a single region.

## 8. Pause and resume

- **Pause:** set `NOW_PLAYING_SHARING` = `off` and redeploy. The page says "Not sharing right now", and the site stops asking Spotify.
- **Resume:** delete `NOW_PLAYING_SHARING` (or set it to `on`) and redeploy.
- **Hide it entirely:** delete `NOW_PLAYING_ENABLED` and redeploy. The page is exactly as before and `/privacy` returns to `landing-1`.

## 9. Reconnect every six months

Spotify's refresh tokens expire six months after you authorize, and using them does not extend that. The site estimates the date as `SPOTIFY_AUTHORIZED_AT` plus six months.

- **Calendar reminder:** when you set `SPOTIFY_AUTHORIZED_AT`, add a reminder for **five months** after that date: "Reconnect Spotify for vt-infinite.com".
- In the last 30 days, every token refresh logs `Spotify needs reconnecting by <date>`.
- To reconnect: repeat steps 2 to 4, replacing `SPOTIFY_REFRESH_TOKEN` and `SPOTIFY_AUTHORIZED_AT`, redeploy, and move the reminder.
- If the logs show `Spotify reconnect needed`, Spotify refused the refresh token (expired or revoked). Visitors see "Can’t reach Spotify right now" and the site stops asking until the token changes. Reconnect as above.
- If the logs show `Spotify issued a new refresh token; reconnect may be needed`, Spotify replaced the token. The site uses the new one only in memory, and loses it on the next cold start or deployment, so reconnect soon.

## 10. Disconnect

1. Delete `NOW_PLAYING_ENABLED`, `NOW_PLAYING_SHARING`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` and `SPOTIFY_AUTHORIZED_AT` from Vercel.
2. Redeploy Production. Check that `/` is as before, `/api/now-playing` is 404 and `/privacy` is `landing-1`.
3. At `https://www.spotify.com/account/apps/`, remove the app's access. The site assumes no other revocation route.
4. Optionally, delete the app in the Spotify developer dashboard.

## What the log lines mean

| Line | Meaning | Do |
| --- | --- | --- |
| `Spotify reconnect needed` | The refresh token was refused (`invalid_grant`). The site stopped asking. | Step 9 |
| `Spotify reconnect needed (client credentials refused)` | The client ID or secret was refused. | Check both values; then step 9 |
| `Spotify needs reconnecting by <date>` | Within 30 days of the estimated expiry. | Step 9 before that date |
| `Spotify issued a new refresh token; reconnect may be needed` | Spotify replaced the refresh token. | Step 9 soon |
| `now playing: Spotify rate limit; waiting N s` | Spotify asked the site to slow down. The last answer is shown meanwhile. | Nothing, unless it repeats |
| `now playing: Spotify quota exceeded; waiting N s` | Your developer account's quota is used up. | Check other apps on your account |
| `now playing: Spotify credentials are not set` | A `SPOTIFY_*` variable is missing in Production. | Step 4 |
| `now playing: shared cache unavailable; using this instance's memory` | Vercel's Runtime Cache did not answer. The 30-second bound holds per instance until it does. | Report it if it persists |
| `now playing: track details withheld (…)` | A name tripped a display guard; the page shows only the state. The line names the rule, never the text. | Nothing |
