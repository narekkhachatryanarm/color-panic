# Color Panic 🎨

A local-network multiplayer party reaction game. One laptop hosts the game;
players join from their phones on the same Wi-Fi.

## Setup

```bash
cd color-panic
npm install
npm start
```

Then:

1. On the **host laptop**, open `http://localhost:3344` and click **Create Room as Host**.
2. The host screen shows a 4-letter room code and a join URL like `http://192.168.1.42:3344`.
3. On each **phone** (same Wi-Fi), open that join URL, tap **Join Room as Player**, enter the code and a name.
4. Once everyone is in, host taps **Start Game**.
5. 10 rounds, 5 seconds each. Tap fast, tap smart. Winner is shown at the end.

## Round types

- **Everyone Tap Color** — everyone races to tap the named color.
- **Only Player Tap Color** — only the named player should tap; others lose points if they tap anything.
- **Avoid Color** — tap any color *except* the named one.
- **Word vs Color** — Stroop-style: the word says one color, displayed in another. Tap the **word**.

## Scoring

- Correct: **+10**
- Wrong: **−5**
- Fastest correct each round: **+5 bonus**
- No answer: **0**

## Troubleshooting local network access

- **Phone can't reach the host URL.** Make sure laptop and phone are on the same Wi-Fi (not guest network / VLAN isolated).
- **macOS firewall.** System Settings → Network → Firewall: allow incoming connections for `node`. Or temporarily disable firewall to test.
- **Windows firewall.** When you first run `npm start`, Windows asks to allow Node.js on Private networks — click Allow.
- **Corporate / hotel Wi-Fi often blocks peer connections.** Use a personal hotspot from your phone instead.
- **VPN active?** Disable it on the host machine — VPNs frequently break LAN routing.
- **Find the right IP manually.** On macOS: `ipconfig getifaddr en0`. On Windows: `ipconfig`. On Linux: `hostname -I`.
- **Port 3344 already in use.** Edit `PORT` near the top of `server.js`.
