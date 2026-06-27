namespace Lebuser.TunnelGateway.Models;

public sealed record CommandReceipt(
    string Id,
    bool Accepted,
    bool DryRun,
    string Transport,
    string Frame,
    string? Response,
    string Message,
    DateTimeOffset Timestamp);
