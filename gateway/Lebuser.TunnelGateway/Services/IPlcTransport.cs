using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

public interface IPlcTransport
{
    Task<GatewayStatus> GetStatusAsync(CancellationToken cancellationToken);
    Task<CommandReceipt> SendAsync(TunnelCommand command, CancellationToken cancellationToken);
}
