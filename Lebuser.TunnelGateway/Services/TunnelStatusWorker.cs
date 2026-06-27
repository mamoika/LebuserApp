using Microsoft.Extensions.Options;

namespace Lebuser.TunnelGateway.Services;

public sealed class TunnelStatusWorker(
    IPlcTransport transport,
    ITunnelTelemetry telemetry,
    IOptions<GatewayOptions> optionsAccessor,
    ILogger<TunnelStatusWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var options = optionsAccessor.Value.Supabase;
        if (!options.Enabled)
        {
            return;
        }

        var intervalSeconds = Math.Clamp(options.StatusIntervalSeconds, 1, 300);
        var delay = TimeSpan.FromSeconds(intervalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var status = await transport.GetStatusAsync(stoppingToken);
                await telemetry.PublishStatusAsync(status, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Tunnel status publish failed.");
            }

            await Task.Delay(delay, stoppingToken);
        }
    }
}
