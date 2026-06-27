using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

public interface ITunnelTelemetry
{
    Task PublishStatusAsync(GatewayStatus status, CancellationToken cancellationToken);
    Task PublishCommandAsync(TunnelCommand command, CommandReceipt receipt, CancellationToken cancellationToken);
    Task PublishBagAsync(Bag bag, CancellationToken cancellationToken);
}

public sealed class NullTunnelTelemetry : ITunnelTelemetry
{
    public static readonly NullTunnelTelemetry Instance = new();

    private NullTunnelTelemetry()
    {
    }

    public Task PublishStatusAsync(GatewayStatus status, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task PublishCommandAsync(TunnelCommand command, CommandReceipt receipt, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task PublishBagAsync(Bag bag, CancellationToken cancellationToken) => Task.CompletedTask;
}
