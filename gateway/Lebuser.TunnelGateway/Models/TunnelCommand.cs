namespace Lebuser.TunnelGateway.Models;

public sealed record TunnelCommand
{
    public string CommandId { get; init; } = "";
    public string BagId { get; init; } = "";
    public string HotelName { get; init; } = "";
    public int ProgramNumber { get; init; }
    public int TrackNumber { get; init; }
    public string Priority { get; init; } = "normal";
    public string RequestedBy { get; init; } = "";
    public DateTimeOffset RequestedAt { get; init; } = DateTimeOffset.UtcNow;
}
