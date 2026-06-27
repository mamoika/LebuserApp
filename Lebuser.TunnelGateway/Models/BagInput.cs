namespace Lebuser.TunnelGateway.Models;

/// <summary>Payload the operator console sends to register a bag.</summary>
public sealed record BagInput
{
    public string Code { get; init; } = "";
    public string? HotelName { get; init; }
    public string? ClientId { get; init; }
    public int ProgramNumber { get; init; }
    public int TrackNumber { get; init; }
    public string? RequestedBy { get; init; }
}

public sealed record BagStatusInput
{
    public string? Status { get; init; }
}
