using System.Net.Http.Headers;
using System.Net.Http.Json;
using Lebuser.TunnelGateway.Models;
using Microsoft.Extensions.Options;

namespace Lebuser.TunnelGateway.Services;

public sealed class SupabaseTunnelTelemetry(
    HttpClient httpClient,
    IOptions<GatewayOptions> optionsAccessor,
    ILogger<SupabaseTunnelTelemetry> logger) : ITunnelTelemetry
{
    public async Task PublishStatusAsync(GatewayStatus status, CancellationToken cancellationToken)
    {
        var options = optionsAccessor.Value.Supabase;
        if (!IsConfigured(options))
        {
            return;
        }

        var row = new Dictionary<string, object?>
        {
            ["gateway_id"] = options.GatewayId,
            ["connected"] = status.Connected,
            ["dry_run"] = status.DryRun,
            ["transport"] = status.Transport,
            ["port_name"] = status.PortName,
            ["last_error"] = status.LastError,
            ["checked_at"] = status.CheckedAt,
            ["updated_at"] = DateTimeOffset.UtcNow
        };

        await SendAsync(
            options,
            "tunnel_gateway_status?on_conflict=gateway_id",
            row,
            prefer: "resolution=merge-duplicates,return=minimal",
            cancellationToken);
    }

    public async Task PublishCommandAsync(TunnelCommand command, CommandReceipt receipt, CancellationToken cancellationToken)
    {
        var options = optionsAccessor.Value.Supabase;
        if (!IsConfigured(options))
        {
            return;
        }

        var row = new Dictionary<string, object?>
        {
            ["gateway_id"] = options.GatewayId,
            ["event_type"] = "command_sent",
            ["command_id"] = receipt.Id,
            ["bag_id"] = command.BagId,
            ["hotel_name"] = command.HotelName,
            ["program_number"] = command.ProgramNumber,
            ["track_number"] = command.TrackNumber,
            ["accepted"] = receipt.Accepted,
            ["dry_run"] = receipt.DryRun,
            ["transport"] = receipt.Transport,
            ["message"] = receipt.Message,
            ["created_at"] = receipt.Timestamp,
            ["payload"] = new
            {
                command.Priority,
                command.RequestedBy,
                command.RequestedAt,
                receipt.Response,
                receipt.Frame
            }
        };

        await SendAsync(
            options,
            "tunnel_events",
            row,
            prefer: "return=minimal",
            cancellationToken);
    }

    public async Task PublishBagAsync(Bag bag, CancellationToken cancellationToken)
    {
        var options = optionsAccessor.Value.Supabase;
        if (!IsConfigured(options))
        {
            return;
        }

        var row = new Dictionary<string, object?>
        {
            ["id"] = bag.Id,
            ["gateway_id"] = options.GatewayId,
            ["code"] = bag.Code,
            ["hotel_name"] = bag.HotelName,
            ["client_id"] = bag.ClientId,
            ["program_number"] = bag.ProgramNumber,
            ["track_number"] = bag.TrackNumber,
            ["status"] = bag.Status,
            ["stage_index"] = bag.StageIndex,
            ["command_id"] = bag.CommandId,
            ["last_message"] = bag.LastMessage,
            ["dry_run"] = bag.DryRun,
            ["requested_by"] = bag.RequestedBy,
            ["created_at"] = bag.CreatedAt,
            ["sent_at"] = bag.SentAt,
            ["done_at"] = bag.DoneAt,
            ["updated_at"] = bag.UpdatedAt
        };

        await SendAsync(
            options,
            "tunnel_bags?on_conflict=id",
            row,
            prefer: "resolution=merge-duplicates,return=minimal",
            cancellationToken);
    }

    private async Task SendAsync(
        SupabaseOptions options,
        string tablePath,
        object payload,
        string prefer,
        CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"{options.Url.TrimEnd('/')}/rest/v1/{tablePath}")
            {
                Content = JsonContent.Create(payload)
            };

            request.Headers.TryAddWithoutValidation("apikey", options.ServiceRoleKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ServiceRoleKey);
            request.Headers.TryAddWithoutValidation("Prefer", prefer);

            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Supabase tunnel telemetry failed with {StatusCode}: {Body}", response.StatusCode, body);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Supabase tunnel telemetry publish failed.");
        }
    }

    private static bool IsConfigured(SupabaseOptions options)
    {
        return options.Enabled
            && Uri.TryCreate(options.Url, UriKind.Absolute, out _)
            && !string.IsNullOrWhiteSpace(options.ServiceRoleKey)
            && !string.IsNullOrWhiteSpace(options.GatewayId);
    }
}
