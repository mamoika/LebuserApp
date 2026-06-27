using System.Collections.Concurrent;
using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

public sealed class GatewayState
{
    private const int MaxRecentCommands = 100;
    private readonly ConcurrentQueue<GatewayCommandLog> _recent = new();

    public void Record(TunnelCommand command, CommandReceipt receipt)
    {
        _recent.Enqueue(new GatewayCommandLog(command, receipt));
        while (_recent.Count > MaxRecentCommands && _recent.TryDequeue(out _))
        {
        }
    }

    public IReadOnlyCollection<GatewayCommandLog> Recent()
    {
        return _recent.ToArray();
    }
}

public sealed record GatewayCommandLog(TunnelCommand Command, CommandReceipt Receipt);
