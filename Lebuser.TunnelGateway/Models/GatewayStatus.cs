namespace Lebuser.TunnelGateway.Models;

public sealed record GatewayStatus(
    bool Connected,
    bool DryRun,
    string Transport,
    string? PortName,
    string? LastError,
    DateTimeOffset CheckedAt);
