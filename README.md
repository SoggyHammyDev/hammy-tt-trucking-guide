# Hammy TT Trucking Guide

Interactive Transport Tycoon trucking guide designed for GitHub Pages and eventual FiveM userapp use.

## Features

- Wiki-backed trucking progression and routes
- Trailer + cargo capacity calculator
- Live player connection through the Transport Tycoon API
- vRP ID + private API key support
- Uses the `X-Tycoon-Key` request header
- Reads `/data/{vRPid}` for trucking XP, job/sub-job and inventory
- Shows remaining API charges when TT returns `X-Tycoon-Charges`
- API key is kept only in the current browser tab
- Responsive layout for desktop and in-game userapp use

## GitHub Pages

Enable **Settings → Pages → Deploy from a branch**, then choose `main` and `/ (root)`.

Expected URL:

`https://soggyhammydev.github.io/hammy-tt-trucking-guide/`

## TT API

The app attempts to load the current server list from:

`https://cdn.tycoon.community/servers.json`

If that request or format fails, documented CFX server fallbacks plus a custom API-base option are available.

## Data

`data/trucking.json` contains the normalized frontend guide dataset.

Wiki source:

`https://dash.tycoon.community/wiki/index.php/Trucking`
