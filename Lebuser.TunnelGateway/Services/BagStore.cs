using System.Collections.Concurrent;
using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Services;

/// <summary>
/// In-memory store of bags currently tracked at the station. Survives offline
/// (no cloud dependency); the gateway mirrors each change to Supabase for the
/// web Tunnel view when connectivity is available.
/// </summary>
public sealed class BagStore
{
    private readonly ConcurrentDictionary<string, Bag> _bags = new();

    public Bag Upsert(Bag bag)
    {
        var stored = bag with { UpdatedAt = DateTimeOffset.UtcNow };
        _bags[stored.Id] = stored;
        return stored;
    }

    public bool TryGet(string id, out Bag bag) => _bags.TryGetValue(id, out bag!);

    /// <summary>Applies <paramref name="mutate"/> to the bag if present, stamping UpdatedAt.</summary>
    public Bag? Update(string id, Func<Bag, Bag> mutate)
    {
        if (!_bags.TryGetValue(id, out var existing))
        {
            return null;
        }

        var updated = mutate(existing) with { UpdatedAt = DateTimeOffset.UtcNow };
        _bags[id] = updated;
        return updated;
    }

    public IReadOnlyCollection<Bag> List() =>
        _bags.Values.OrderByDescending(bag => bag.CreatedAt).ToArray();
}
