# Lebuser Tunnel Gateway

Small Windows-side gateway for the future tunnel integration.

The browser app never talks to COM/RS232/RS485 directly. It sends an HTTP request to this gateway, and the gateway translates it into a serial frame. The default configuration is safe: `DryRun` is `true`, so no bytes are written to the serial port.

## Run locally on Windows

```powershell
cd gateway\Lebuser.TunnelGateway
dotnet restore
dotnet run -f net8.0
```

If only the .NET 11 preview runtime is installed on the machine, use:

```powershell
dotnet run -f net11.0
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:5055/health
```

Send a test command in dry-run mode:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:5055/api/tunnel/send `
  -ContentType "application/json" `
  -Body '{"bagId":"BAG-001","hotelName":"Hotel Test","programNumber":3,"trackNumber":2,"priority":"normal","requestedBy":"operator"}'
```

## Browser integration

In `react-app/.env`, set:

```text
VITE_TUNNEL_GATEWAY_URL=http://127.0.0.1:5055
VITE_TUNNEL_GATEWAY_KEY=
```

If `Gateway:ApiKey` is set in `appsettings.json`, the same key must be placed in `VITE_TUNNEL_GATEWAY_KEY`.

## Going live later

Do not switch `DryRun` to `false` until the real protocol is known and tested with the machine isolated or approved by an automation technician. The current serial frame is only a placeholder:

```text
CMD=...;BAG=...;HOTEL=...;PROGRAM=...;TRACK=...;PRIORITY=0;REQ=1
```

After we identify the WinWash/PLC protocol, `LegacyFrameBuilder` is the place to replace this frame with the real one.
