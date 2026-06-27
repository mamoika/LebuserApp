# LEBUSER WinWash (Tunnel Station)

Desktop app for the laundry tunnel station PC. One window bundles:

- the **WinWash live dashboard** (tunnel view), and
- the **local gateway** that talks to the tunnel PLC over a serial port (COM) and,
  optionally, mirrors status to Supabase.

Under the hood it is an ASP.NET Core service hosting a WebView2 window. The rest of
the LEBUSER logistics app stays a web app on Vercel; only this station screen is a
desktop app, because a browser cannot open the serial/PLC port directly.

## Run during development

```powershell
dotnet run                 # opens the WinWash window
dotnet run -- --headless   # server only, no window (background bridge / service)
```

The gateway listens on `http://127.0.0.1:5055` and the window opens `/winwash.html`.

Window keys: **F5** reload, **F11** full screen, **Esc** leave full screen.

## Configuration

`appsettings.json` (or environment variables) under the `Gateway` section:

| Setting | Meaning |
| --- | --- |
| `DryRun` | `true` = simulate, nothing is written to the serial port. Set `false` on the real station. |
| `Serial.PortName` | PLC serial port, e.g. `COM1`. |
| `ListenUrl` | Local listen address, default `http://127.0.0.1:5055`. |
| `ApiKey` | Optional shared key required in the `X-Lebuser-Gateway-Key` header. |

Override via environment variables (no file edit needed), e.g.:

```powershell
$env:Gateway__DryRun = "false"
$env:Gateway__Serial__PortName = "COM3"
```

## Build a distributable

Self-contained build — the station does **not** need .NET installed:

```powershell
.\publish.ps1
# output: bin\Release\net10.0-windows\win-x64\publish\Lebuser.TunnelGateway.exe
```

### Option A - portable

Copy the whole `publish` folder to the station and run `Lebuser.TunnelGateway.exe`.
Right-click the exe -> "Show more options" -> "Send to" -> "Desktop" for a shortcut.

### Option B - installer (setup.exe)

Needs [Inno Setup 6](https://jrsoftware.org/isdl.php). After `publish.ps1`:

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" .\installer\Lebuser.WinWash.iss
# output: installer\dist\LebuserWinWash-Setup-1.0.0.exe
```

The installer creates a Start Menu entry, an optional Desktop shortcut, and an
optional "start with Windows" entry, with a clean uninstaller.

## Station requirements

- Windows 10/11 x64.
- **Microsoft Edge WebView2 Runtime** - preinstalled on Windows 11. On older
  Windows 10 install the Evergreen runtime from Microsoft if the window stays blank.

## Live Status Through Supabase

Run the SQL migration first:

```sql
react-app/db/migrations/tunnel_realtime_migration.sql
```

Then enable Supabase publishing in the gateway. Prefer environment variables
or a local, uncommitted settings file for secrets:

```powershell
$env:Gateway__Supabase__Enabled="true"
$env:Gateway__Supabase__Url="https://your-project-ref.supabase.co"
$env:Gateway__Supabase__ServiceRoleKey="your-service-role-key"
$env:Gateway__Supabase__GatewayId="main-tunnel"
```

The `ServiceRoleKey` must stay on the gateway machine only. Do not put it in
React, Vercel, or any browser-visible configuration.

With publishing enabled, the gateway writes:

- `tunnel_gateway_status` - current gateway status, updated every few seconds.
- `tunnel_events` - command/event stream for the Tunnel tab.
