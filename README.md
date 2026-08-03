# HitsIt

A solo practice version of the music timeline game. A song plays face down; you
slot it into your timeline where you think it belongs by release year. Land it
right and you keep the card — ten cards wins.

Mobile-first PWA. React + Vite + TypeScript.

## Running it

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

It is playable immediately using a small built-in fixture deck. The fixture has
no real Spotify URIs, so there is no audio until you build a real deck.

```bash
npm test             # placement rules
npm run typecheck
```

## Connecting Spotify

Full-track playback needs **Spotify Premium**. Thirty-second previews were
removed from the Web API for new apps in November 2024, so the Web Playback SDK
is the only route — it is browser-only and Premium-only.

1. Create an app at <https://developer.spotify.com/dashboard>.
   Add both redirect URIs:
   - `http://127.0.0.1:5173/callback` — the game
   - `http://127.0.0.1:8888/callback` — the deck builder sign-in
2. `cp .env.example .env` and set `VITE_SPOTIFY_CLIENT_ID`.

The client ID is public by design; the app uses PKCE and has no secret.

> Development Mode allows 5 authorised users and requires the app owner to hold
> Premium. Solo play needs exactly one, so this is not a constraint here.

## Building the deck

```bash
npm run auth:deck    # once — opens a browser to authorise
npm run build:deck   # writes src/data/deck.json
```

`DECK_PLAYLIST_ID` in `.env` must be a playlist **you own**. Development Mode
apps cannot read another user's playlist, and following one into your library
does not change its owner — make a copy.

### Why the deck is built offline

Spotify's `album.release_date` is the release date of the album a track sits
on, which for catalogue music is usually a remaster or a compilation. A Diana
Ross anthology reports 2003 for a 1980 single. Since the whole game is guessing
years, that would break it outright.

Years are therefore resolved against MusicBrainz once, offline, and the result
is committed as static JSON. The game never makes a metadata call.

Resolution does **not** work by searching and taking the earliest hit. That
approach fails invisibly: MusicBrainz search is relevance-ranked, capped at 100
results per page, and unstable across requests. One song in this playlist
reports 307 recordings, and paging through them returns a different subset each
sweep — so the "earliest" you compute changes between runs, and a year wrong by
one is indistinguishable from a hard question while playing.

Instead the builder asks a question the server can answer exactly: *how many
matching recordings were first released on or before year Y?* That is a
`firstreleasedate` range query returning a count, with no paging and no
ordering. Binary searching Y finds the true earliest year in about nine calls
and gives the same answer every time.

Spotify's own year is passed in as an upper bound, since the original release
is always at or before whatever album the track was found on.

### Reviewing flagged years

Anything the builder cannot corroborate is written to `data/deck.review.csv`
with each candidate year side by side, and **excluded from the deck** rather
than shipped as fact. To include those tracks, put the correct years in
`data/year-overrides.json` keyed by Spotify track id and re-run. Overrides are
applied before any lookup, so corrected tracks are never re-queried and your
review work survives rebuilds.

Responses are cached in `data/.musicbrainz-cache.json`, so a rebuild after
editing overrides costs almost nothing. A first full run is roughly an hour for
300 tracks, held to one request per second as MusicBrainz asks.

## Layout

```
scripts/build-deck.ts      playlist → deck.json, with triage
scripts/musicbrainz.ts     year resolution (binary search)
scripts/spotify-login.ts   one-time PKCE sign-in for the builder
src/lib/rules.ts           placement rules, shared by store and tests
src/store/game.ts          game state machine
src/components/            timeline rail, card flip, transport
```

## Known caveat

If Spotify is open on another device, its UI shows the track and artist, which
gives away the answer. Keep the in-app player as the active device.

## Not yet built

Tokens, HITSTER steals, buy-a-card, Pro/Expert/Co-op modes, and multiplayer.
