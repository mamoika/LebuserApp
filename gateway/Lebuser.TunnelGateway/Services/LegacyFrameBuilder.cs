using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

internal static class LegacyFrameBuilder
{
    public static string Build(TunnelCommand command)
    {
        var priority = string.Equals(command.Priority, "urgent", StringComparison.OrdinalIgnoreCase) ? "1" : "0";
        return string.Join(';',
            $"CMD={Clean(command.CommandId, 32)}",
            $"BAG={Clean(command.BagId, 24)}",
            $"HOTEL={Clean(command.HotelName, 64)}",
            $"PROGRAM={command.ProgramNumber}",
            $"TRACK={command.TrackNumber}",
            $"PRIORITY={priority}",
            "REQ=1") + "\r\n";
    }

    private static string Clean(string? value, int maxLength)
    {
        var cleaned = new string((value ?? "")
            .Where(c => c >= 32 && c != ';' && c != '\r' && c != '\n')
            .ToArray())
            .Trim();

        return cleaned.Length <= maxLength ? cleaned : cleaned[..maxLength];
    }
}
