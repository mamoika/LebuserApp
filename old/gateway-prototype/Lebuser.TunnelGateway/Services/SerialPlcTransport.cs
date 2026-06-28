using System.IO.Ports;
using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

public sealed class SerialPlcTransport(GatewayOptions options, ILogger<SerialPlcTransport> logger) : IPlcTransport, IDisposable
{
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private SerialPort? _port;
    private string? _lastError;

    public Task<GatewayStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(new GatewayStatus(
            Connected: _port?.IsOpen == true,
            DryRun: false,
            Transport: "serial",
            PortName: options.Serial.PortName,
            LastError: _lastError,
            CheckedAt: DateTimeOffset.UtcNow));
    }

    public async Task<CommandReceipt> SendAsync(TunnelCommand command, CancellationToken cancellationToken)
    {
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            var frame = LegacyFrameBuilder.Build(command);
            var port = EnsureOpenPort();

            logger.LogInformation("Writing PLC frame to {PortName}: {Frame}", port.PortName, frame.TrimEnd());
            port.Write(frame);

            string? response = null;
            try
            {
                response = port.ReadLine();
            }
            catch (TimeoutException)
            {
                response = null;
            }

            _lastError = null;
            return new CommandReceipt(
                Id: command.CommandId,
                Accepted: true,
                DryRun: false,
                Transport: "serial",
                Frame: frame,
                Response: response,
                Message: response is null ? "Frame written; no response before timeout." : "Frame written and response received.",
                Timestamp: DateTimeOffset.UtcNow);
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            logger.LogError(ex, "PLC serial write failed.");
            throw;
        }
        finally
        {
            _sendLock.Release();
        }
    }

    public void Dispose()
    {
        _port?.Dispose();
        _sendLock.Dispose();
    }

    private SerialPort EnsureOpenPort()
    {
        if (_port?.IsOpen == true)
        {
            return _port;
        }

        var serial = options.Serial;
        _port?.Dispose();
        _port = new SerialPort(
            serial.PortName,
            serial.BaudRate,
            ParseParity(serial.Parity),
            serial.DataBits,
            ParseStopBits(serial.StopBits))
        {
            ReadTimeout = serial.ReadTimeoutMs,
            WriteTimeout = serial.WriteTimeoutMs,
            NewLine = serial.NewLine
        };
        _port.Open();
        return _port;
    }

    private static Parity ParseParity(string value)
    {
        return Enum.TryParse<Parity>(value, ignoreCase: true, out var parity) ? parity : Parity.None;
    }

    private static StopBits ParseStopBits(string value)
    {
        return Enum.TryParse<StopBits>(value, ignoreCase: true, out var stopBits) ? stopBits : StopBits.One;
    }
}
