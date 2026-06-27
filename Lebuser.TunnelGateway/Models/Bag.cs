namespace Lebuser.TunnelGateway.Models;

public sealed record Bag
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string GatewayId { get; init; } = "main-tunnel";
    public string Code { get; init; } = "";
    public string HotelName { get; init; } = "";
    public string? ClientId { get; init; }
    public int ProgramNumber { get; init; }
    public int TrackNumber { get; init; }
    public string Status { get; init; } = BagStatus.Queued;
    public int StageIndex { get; init; }
    public string? CommandId { get; init; }
    public string? LastMessage { get; init; }
    public bool DryRun { get; init; }
    public string RequestedBy { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? SentAt { get; init; }
    public DateTimeOffset? DoneAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public static class BagStatus
{
    public const string Queued = "queued";
    public const string Entry = "entry";
    public const string Wash = "wash";
    public const string Rinse = "rinse";
    public const string Dry = "dry";
    public const string Pack = "pack";
    public const string Done = "done";
    public const string Error = "error";
    public const string Cancelled = "cancelled";

    /// <summary>The five physical tunnel stages, in order; index maps to <see cref="Bag.StageIndex"/>.</summary>
    public static readonly string[] Stages = [Entry, Wash, Rinse, Dry, Pack];

    public static readonly string[] All =
        [Queued, Entry, Wash, Rinse, Dry, Pack, Done, Error, Cancelled];

    public static bool IsKnown(string status) => Array.Exists(All, s => s == status);
}
