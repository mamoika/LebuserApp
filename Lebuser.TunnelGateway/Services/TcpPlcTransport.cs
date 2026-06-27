using System.Net.Sockets;
using System.Text;
using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

public sealed class TcpPlcTransport(GatewayOptions options, ILogger<TcpPlcTransport> logger) : IPlcTransport, IDisposable
{
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private TcpClient? _client;
    private NetworkStream? _stream;
    private StreamReader? _reader;
    private StreamWriter? _writer;
    private string? _lastError;

    public Task<GatewayStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(new GatewayStatus(
            Connected: _client?.Connected == true,
            DryRun: false,
            Transport: "tcp",
            PortName: $"{options.Network.IpAddress}:{options.Network.Port}",
            LastError: _lastError,
            CheckedAt: DateTimeOffset.UtcNow));
    }

    public async Task<CommandReceipt> SendAsync(TunnelCommand command, CancellationToken cancellationToken)
    {
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            var frame = LegacyFrameBuilder.Build(command);
            await EnsureConnectedAsync(cancellationToken);

            logger.LogInformation("Writing PLC frame to TCP {IpAddress}:{Port}: {Frame}", 
                options.Network.IpAddress, options.Network.Port, frame.TrimEnd());

            await _writer!.WriteAsync(frame.AsMemory(), cancellationToken);
            await _writer.FlushAsync(cancellationToken);

            string? response = null;
            try
            {
                var readTask = _reader!.ReadLineAsync(cancellationToken);
                var timeoutTask = Task.Delay(options.Network.ReadTimeoutMs, cancellationToken);
                
                var completedTask = await Task.WhenAny(readTask.AsTask(), timeoutTask);
                if (completedTask == readTask.AsTask())
                {
                    response = await readTask;
                }
            }
            catch (Exception ex) when (ex is TimeoutException or OperationCanceledException)
            {
                response = null;
            }

            _lastError = null;
            return new CommandReceipt(
                Id: command.CommandId,
                Accepted: true,
                DryRun: false,
                Transport: "tcp",
                Frame: frame,
                Response: response,
                Message: response is null ? "Frame written; no response before timeout." : "Frame written and response received.",
                Timestamp: DateTimeOffset.UtcNow);
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            logger.LogError(ex, "PLC TCP write failed.");
            Disconnect();
            throw;
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private async Task EnsureConnectedAsync(CancellationToken cancellationToken)
    {
        if (_client?.Connected == true && _stream != null && _writer != null && _reader != null)
        {
            return;
        }

        Disconnect();

        var netOptions = options.Network;
        _client = new TcpClient
        {
            SendTimeout = netOptions.WriteTimeoutMs,
            ReceiveTimeout = netOptions.ReadTimeoutMs
        };

        var connectTask = _client.ConnectAsync(netOptions.IpAddress, netOptions.Port, cancellationToken);
        var timeoutTask = Task.Delay(netOptions.ConnectTimeoutMs, cancellationToken);

        var completedTask = await Task.WhenAny(connectTask.AsTask(), timeoutTask);
        if (completedTask == timeoutTask)
        {
            throw new TimeoutException($"Timed out connecting to PLC at {netOptions.IpAddress}:{netOptions.Port}");
        }

        await connectTask; // Propagate exceptions if any

        _stream = _client.GetStream();
        // Use UTF8 without BOM, similar to ASCII for standard characters
        var encoding = new UTF8Encoding(false);
        _writer = new StreamWriter(_stream, encoding) { NewLine = "\r\n" };
        _reader = new StreamReader(_stream, encoding);
    }

    private void Disconnect()
    {
        _writer?.Dispose();
        _reader?.Dispose();
        _stream?.Dispose();
        _client?.Dispose();

        _writer = null;
        _reader = null;
        _stream = null;
        _client = null;
    }

    public void Dispose()
    {
        Disconnect();
        _sendLock.Dispose();
    }
}
