using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

public sealed class DryRunPlcTransport(GatewayOptions options, ILogger<DryRunPlcTransport> logger) : IPlcTransport
{
    public Task<GatewayStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(new GatewayStatus(
            Connected: true,
            DryRun: true,
            Transport: "dry-run",
            PortName: options.Serial.PortName,
            LastError: null,
            CheckedAt: DateTimeOffset.UtcNow));
    }

    public Task<CommandReceipt> SendAsync(TunnelCommand command, CancellationToken cancellationToken)
    {
        var frame = LegacyFrameBuilder.Build(command);
        logger.LogInformation("Dry-run PLC frame: {Frame}", frame.TrimEnd());

        return Task.FromResult(new CommandReceipt(
            Id: command.CommandId,
            Accepted: true,
            DryRun: true,
            Transport: "dry-run",
            Frame: frame,
            Response: "DRY_RUN_ACK",
            Message: "Command accepted in dry-run mode. Nothing was written to the serial port.",
            Timestamp: DateTimeOffset.UtcNow));
    }
}
