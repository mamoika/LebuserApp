import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Boxes,
  Check,
  ClipboardCheck,
  History,
  LayoutGrid,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataError from './DataError';
import CartonLayoutModal from './CartonLayoutModal';
import { toastSuccess } from '../lib/toast';
import {
  addWarehouseCarton,
  archiveWarehouseItem,
  getWarehouseInventory,
  recordWarehouseMovement,
  saveWarehouseItem,
  setWarehouseStock,
} from '../lib/warehouseRpc';
import {
  clientItemBreakdown,
  clientStockCount,
  emptyWarehouseCounts,
  itemDisplayName,
  movementLinesFromCounts,
  stockCount,
  totalLocationStock,
  validateMovementCounts,
  zoneTotals,
} from '../lib/warehouseInventory';

const ZONES = ['ZD1', 'ZD2'];

const MOVEMENT_META = {
  receipt: { icon: PackagePlus, labelKey: 'warehouse.actions.receipt' },
  issue: { icon: PackageMinus, labelKey: 'warehouse.actions.issue' },
  transfer: { icon: ArrowRightLeft, labelKey: 'warehouse.actions.transfer' },
  adjustment: { icon: ClipboardCheck, labelKey: 'warehouse.actions.adjustment' },
};

function locationLabel(location) {
  return `${location.zone} - ${location.name}`;
}

function ModalFrame({ title, subtitle, onClose, children, wide = false }) {
  const { t } = useTranslation();
  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="warehouse-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`warehouse-modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="warehouse-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="warehouse-close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function MovementModal({ initialType, preferredLocation, activeZone, clients, items, locations, onClose, onSubmit }) {
  const { t } = useTranslation();
  const zoneLocations = locations.filter(location => location.zone === activeZone);
  const zoneRoot = zoneLocations.find(location => location.location_type === 'zone') || zoneLocations[0];
  const cartonLocations = locations.filter(location => location.location_type === 'carton');
  const zoneCartons = cartonLocations.filter(location => location.zone === activeZone);
  const firstSource = preferredLocation?.location_type === 'carton'
    ? preferredLocation
    : zoneCartons.find(location => totalLocationStock(location, items) > 0) || zoneCartons[0];
  const firstDestination = zoneCartons.find(location => location.id !== firstSource?.id)
    || cartonLocations.find(location => location.id !== firstSource?.id);
  const adjustmentOnly = initialType === 'adjustment';
  const availableMovements = adjustmentOnly
    ? [['adjustment', MOVEMENT_META.adjustment]]
    : Object.entries(MOVEMENT_META).filter(([key]) => key !== 'adjustment');
  const [type, setType] = useState(initialType || 'receipt');
  const [sourceId, setSourceId] = useState(firstSource?.id || '');
  const [destinationId, setDestinationId] = useState(
    initialType === 'receipt' ? (preferredLocation?.id || zoneCartons[0]?.id || '') : (firstDestination?.id || '')
  );
  const [targetId, setTargetId] = useState(preferredLocation?.id || zoneRoot?.id || '');
  const [clientId, setClientId] = useState(() => {
    const stockedClient = preferredLocation?.client_stock?.find(entry => (
      Object.values(entry.stock || {}).some(quantity => Number(quantity) > 0)
    ));
    return stockedClient?.client_id || clients[0]?.id || '';
  });
  const initialTarget = locations.find(location => location.id === (preferredLocation?.id || zoneRoot?.id));
  const [counts, setCounts] = useState(() => (
    initialType === 'adjustment'
      ? emptyWarehouseCounts(items, initialTarget)
      : emptyWarehouseCounts(items)
  ));
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredItems = items.filter(item => itemDisplayName(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const source = cartonLocations.find(location => location.id === sourceId);

  const changeType = nextType => {
    const nextTarget = preferredLocation?.location_type === 'zone' ? preferredLocation : zoneRoot;
    setType(nextType);
    setError('');
    setCounts(nextType === 'adjustment'
      ? emptyWarehouseCounts(items, nextTarget)
      : emptyWarehouseCounts(items));
    if (nextType === 'receipt') {
      setDestinationId(
        preferredLocation?.location_type === 'carton' ? preferredLocation.id : (zoneCartons[0]?.id || '')
      );
      if (clients.find(client => client.id === clientId)?.archived_at) {
        setClientId(clients.find(client => !client.archived_at)?.id || '');
      }
    }
    if (nextType === 'issue' || nextType === 'transfer') setSourceId(firstSource?.id || '');
    if (nextType === 'transfer') setDestinationId(firstDestination?.id || '');
    if (nextType === 'adjustment') setTargetId(nextTarget?.id || '');
  };

  const changeTarget = value => {
    setTargetId(value);
    const nextTarget = locations.find(location => location.id === value);
    setCounts(emptyWarehouseCounts(items, nextTarget));
  };

  const updateCount = (itemId, value) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setCounts(previous => ({ ...previous, [itemId]: value }));
    setError('');
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');

    if (type === 'adjustment') {
      if (!targetId || items.some(item => !/^\d+$/.test(counts[item.id] ?? ''))) {
        setError(t('warehouse.errors.allCounts'));
        return;
      }
    } else {
      const clientSource = source && (type === 'issue' || type === 'transfer')
        ? {
            stock: Object.fromEntries(items.map(item => [
              item.id,
              clientStockCount(source, item.id, clientId),
            ])),
          }
        : null;
      const validation = validateMovementCounts(counts, items, clientSource);
      if (!clientId) {
        setError(t('warehouse.errors.chooseClient'));
        return;
      }
      if (validation === 'empty') {
        setError(t('warehouse.errors.emptyMovement'));
        return;
      }
      if (validation === 'exceeds') {
        setError(t('warehouse.errors.exceedsStock'));
        return;
      }
      if ((type === 'issue' || type === 'transfer') && !sourceId) {
        setError(t('warehouse.errors.chooseSource'));
        return;
      }
      if ((type === 'receipt' || type === 'transfer') && !destinationId) {
        setError(t('warehouse.errors.chooseDestination'));
        return;
      }
      if (type === 'transfer' && sourceId === destinationId) {
        setError(t('warehouse.errors.sameLocation'));
        return;
      }
    }

    setSaving(true);
    try {
      if (type === 'adjustment') {
        await onSubmit({ type, locationId: targetId, counts, note });
      } else {
        await onSubmit({
          type,
          clientId,
          sourceLocationId: type === 'receipt' ? null : sourceId,
          destinationLocationId: type === 'issue' ? null : destinationId,
          lines: movementLinesFromCounts(counts, items),
          note,
        });
      }
      onClose();
    } catch (submitError) {
      setError(submitError.message || t('warehouse.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      title={t('warehouse.movement.title')}
      subtitle={t('warehouse.movement.subtitle')}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit}>
        <div className="warehouse-action-tabs" role="tablist" aria-label={t('warehouse.movement.type')}>
          {availableMovements.map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <button
                type="button"
                key={key}
                role="tab"
                aria-selected={type === key}
                className={type === key ? 'is-active' : ''}
                onClick={() => changeType(key)}
              >
                <Icon size={17} />
                {t(meta.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="warehouse-route-fields">
          {type !== 'adjustment' && (
            <label>
              <span>{t('warehouse.movement.client')}</span>
              <select value={clientId} onChange={event => {
                setClientId(event.target.value);
                setError('');
              }}>
                <option value="">{t('warehouse.movement.chooseClient')}</option>
                {clients.map(client => (
                  <option
                    value={client.id}
                    key={client.id}
                    disabled={type === 'receipt' && Boolean(client.archived_at)}
                  >
                    {client.name}{client.route_name ? ` · ${client.route_name}` : ''}
                    {client.archived_at ? ` (${t('warehouse.movement.archivedClient')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(type === 'issue' || type === 'transfer') && (
            <label>
              <span>{t('warehouse.movement.from')}</span>
              <select value={sourceId} onChange={event => setSourceId(event.target.value)}>
                {cartonLocations.map(location => (
                  <option value={location.id} key={location.id}>{locationLabel(location)}</option>
                ))}
              </select>
            </label>
          )}
          {(type === 'receipt' || type === 'transfer') && (
            <label>
              <span>{t('warehouse.movement.to')}</span>
              <select value={destinationId} onChange={event => setDestinationId(event.target.value)}>
                {cartonLocations.filter(location => location.id !== sourceId || type !== 'transfer').map(location => (
                  <option value={location.id} key={location.id}>{locationLabel(location)}</option>
                ))}
              </select>
            </label>
          )}
          {type === 'adjustment' && (
            <label>
              <span>{t('warehouse.movement.countedAt')}</span>
              <select value={targetId} onChange={event => changeTarget(event.target.value)}>
                {locations.filter(location => location.location_type === 'zone').map(location => (
                  <option value={location.id} key={location.id}>{locationLabel(location)}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="warehouse-items-form-head">
          <div>
            <strong>{type === 'adjustment' ? t('warehouse.movement.actualCounts') : t('warehouse.movement.quantities')}</strong>
            <span>{t('warehouse.movement.onlyChanged')}</span>
          </div>
          {items.length > 6 && (
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('warehouse.movement.searchItem')}
            />
          )}
        </div>

        <div className="warehouse-quantity-list">
          {filteredItems.map(item => {
            const available = source ? clientStockCount(source, item.id, clientId) : null;
            return (
              <label className="warehouse-quantity-row" key={item.id}>
                <span className="warehouse-quantity-name">
                  <strong>{item.name}</strong>
                  {item.variant && <small>{item.variant}</small>}
                </span>
                {(type === 'issue' || type === 'transfer') && (
                  <span className="warehouse-available">{t('warehouse.movement.available', { count: available })}</span>
                )}
                <span className="warehouse-number-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={counts[item.id] ?? ''}
                    onChange={event => updateCount(item.id, event.target.value)}
                    aria-label={`${itemDisplayName(item)} ${t('warehouse.movement.quantity')}`}
                  />
                  <small>{item.unit}</small>
                </span>
              </label>
            );
          })}
        </div>

        <label className="warehouse-note-field">
          <span>{t('warehouse.movement.note')}</span>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder={t('warehouse.movement.notePlaceholder')} />
        </label>

        {error && <div className="warehouse-form-error">{error}</div>}

        <footer className="warehouse-modal-actions">
          <button type="button" className="warehouse-secondary-btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="warehouse-primary-btn" disabled={saving}>
            <Check size={17} />
            {saving ? t('common.saving') : t('warehouse.movement.save')}
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}

function AddCartonModal({ zone, onClose, onAdd }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onAdd(name);
      onClose();
    } catch (submitError) {
      setError(submitError.message || t('warehouse.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame title={t('warehouse.carton.addTitle')} subtitle={t('warehouse.carton.addSubtitle', { zone })} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="warehouse-note-field">
          <span>{t('warehouse.carton.name')}</span>
          <input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={t('warehouse.carton.autoName')} />
        </label>
        {error && <div className="warehouse-form-error">{error}</div>}
        <footer className="warehouse-modal-actions">
          <button type="button" className="warehouse-secondary-btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="warehouse-primary-btn" disabled={saving}>
            <Plus size={17} /> {saving ? t('common.saving') : t('warehouse.carton.add')}
          </button>
        </footer>
      </form>
    </ModalFrame>
  );
}

function ItemCatalogModal({ items, onClose, onSave, onArchive }) {
  const { t } = useTranslation();
  const emptyForm = { id: null, name: '', variant: '', category: '' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError(t('warehouse.catalog.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      setForm(emptyForm);
    } catch (submitError) {
      setError(submitError.message || t('warehouse.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const archive = async item => {
    if (!window.confirm(t('warehouse.catalog.archiveConfirm', { name: itemDisplayName(item) }))) return;
    setError('');
    try {
      await onArchive(item.id);
      if (form.id === item.id) setForm(emptyForm);
    } catch (archiveError) {
      setError(archiveError.message || t('warehouse.errors.saveFailed'));
    }
  };

  return (
    <ModalFrame title={t('warehouse.catalog.title')} subtitle={t('warehouse.catalog.subtitle')} onClose={onClose} wide>
      <div className="warehouse-catalog-layout">
        <form className="warehouse-catalog-form" onSubmit={submit}>
          <h3>{form.id ? t('warehouse.catalog.editTitle') : t('warehouse.catalog.addTitle')}</h3>
          <label>
            <span>{t('warehouse.catalog.name')}</span>
            <input value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} placeholder={t('warehouse.catalog.nameExample')} />
          </label>
          <label>
            <span>{t('warehouse.catalog.variant')}</span>
            <input value={form.variant} onChange={event => setForm(previous => ({ ...previous, variant: event.target.value }))} placeholder={t('warehouse.catalog.variantExample')} />
          </label>
          <label>
            <span>{t('warehouse.catalog.category')}</span>
            <input value={form.category} onChange={event => setForm(previous => ({ ...previous, category: event.target.value }))} placeholder={t('warehouse.catalog.categoryExample')} />
          </label>
          {error && <div className="warehouse-form-error">{error}</div>}
          <div className="warehouse-catalog-form-actions">
            {form.id && (
              <button type="button" className="warehouse-secondary-btn" onClick={() => setForm(emptyForm)}>{t('common.cancel')}</button>
            )}
            <button type="submit" className="warehouse-primary-btn" disabled={saving}>
              <Check size={17} /> {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>

        <div className="warehouse-catalog-list">
          {items.map(item => (
            <div className="warehouse-catalog-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{[item.variant, item.category].filter(Boolean).join(' | ') || t('warehouse.catalog.noVariant')}</span>
              </div>
              <div>
                <button type="button" onClick={() => setForm({
                  id: item.id,
                  name: item.name,
                  variant: item.variant || '',
                  category: item.category || '',
                })} aria-label={t('common.edit')}>
                  <Pencil size={16} />
                </button>
                <button type="button" className="is-danger" onClick={() => archive(item)} aria-label={t('common.delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalFrame>
  );
}

function StockCard({ location, items, canManage, onAction, onLayout, t }) {
  const nonEmptyItems = items.filter(item => stockCount(location, item.id) > 0);
  const isEmpty = nonEmptyItems.length === 0;
  const isLoose = location.location_type === 'zone';
  const title = isLoose && location.zone === 'ZD2' ? t('warehouse.loose.pending')
    : isLoose ? t('warehouse.loose.zoneStock') : location.name;

  return (
    <article className={`warehouse-stock-card ${isLoose ? 'is-loose' : ''}`}>
      <header>
        <div className="warehouse-card-icon">{isLoose ? <Warehouse size={19} /> : <Boxes size={19} />}</div>
        <div>
          <h3>{title}</h3>
          <span>{isLoose ? location.name : location.zone}</span>
        </div>
        <strong className="warehouse-card-total">{totalLocationStock(location, items)} <small>{t('warehouse.pieces')}</small></strong>
      </header>

      <div className="warehouse-stock-lines">
        {nonEmptyItems.length === 0 ? (
          <div className="warehouse-card-empty">{t('warehouse.emptyLocation')}</div>
        ) : nonEmptyItems.map(item => (
          <div className="warehouse-stock-line" key={item.id}>
            <span>
              <strong>{item.name}</strong>
              {item.variant && <small>{item.variant}</small>}
              {!isLoose && clientItemBreakdown(location, item.id).map(entry => (
                <small className="warehouse-client-breakdown" key={entry.clientId}>
                  {entry.clientName}: {entry.quantity} {item.unit}
                </small>
              ))}
            </span>
            <b>{stockCount(location, item.id)} <small>{item.unit}</small></b>
          </div>
        ))}
      </div>

      {(canManage || !isLoose) && (
        <footer>
          {isLoose ? (
            <button type="button" onClick={() => onAction('adjustment', location)}><ClipboardCheck size={15} /> {t('warehouse.actions.adjustment')}</button>
          ) : (
            <>
              <button type="button" onClick={() => onLayout(location)}><LayoutGrid size={15} /> {t('warehouse.layout.open')}</button>
              {canManage && (
                <>
                  <button type="button" onClick={() => onAction('receipt', location)}><PackagePlus size={15} /> {t('warehouse.actions.receipt')}</button>
                  <button type="button" disabled={isEmpty} onClick={() => onAction('issue', location)}><PackageMinus size={15} /> {t('warehouse.actions.issue')}</button>
                  <button type="button" disabled={isEmpty} onClick={() => onAction('transfer', location)}><ArrowRightLeft size={15} /> {t('warehouse.actions.transfer')}</button>
                </>
              )}
            </>
          )}
        </footer>
      )}
    </article>
  );
}

function WarehouseHistory({ transactions, activeZone, t, locale }) {
  const visible = transactions.filter(transaction => (
    transaction.source_zone === activeZone
    || transaction.destination_zone === activeZone
    || transaction.adjustment_zone === activeZone
  ));

  return (
    <section className="warehouse-history-list">
      {visible.length === 0 ? (
        <div className="warehouse-empty-state">
          <History size={26} />
          <strong>{t('warehouse.history.empty')}</strong>
          <span>{t('warehouse.history.emptyHint')}</span>
        </div>
      ) : visible.map(transaction => {
        const meta = MOVEMENT_META[transaction.movement_type] || MOVEMENT_META.adjustment;
        const Icon = meta.icon;
        const route = transaction.movement_type === 'receipt'
          ? transaction.destination_name
          : transaction.movement_type === 'issue'
            ? transaction.source_name
            : transaction.movement_type === 'transfer'
              ? `${transaction.source_name} → ${transaction.destination_name}`
              : transaction.adjustment_location_name;
        return (
          <article className="warehouse-history-row" key={transaction.id}>
            <div className={`warehouse-history-icon type-${transaction.movement_type}`}><Icon size={17} /></div>
            <div className="warehouse-history-main">
              <div>
                <strong>{t(meta.labelKey)}</strong>
                <span>{route}</span>
                {transaction.client_name && (
                  <span className="warehouse-history-client">{t('warehouse.history.client')}: {transaction.client_name}</span>
                )}
              </div>
              <div className="warehouse-history-lines">
                {transaction.lines.map(line => (
                  <span key={line.item_id}>
                    {line.item_name}{line.item_variant ? ` ${line.item_variant}` : ''}
                    <b>{transaction.movement_type === 'adjustment' && Number(line.signed_quantity) > 0 ? '+' : ''}{transaction.movement_type === 'adjustment' ? line.signed_quantity : line.quantity}</b>
                  </span>
                ))}
              </div>
              {transaction.note && <p>{transaction.note}</p>}
            </div>
            <div className="warehouse-history-meta">
              <strong>{new Date(transaction.created_at).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong>
              <span>{transaction.created_by_name}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default function WarehouseView() {
  const { t, i18n } = useTranslation();
  const { user, sessionToken } = useAuth();
  const canManage = ['admin', 'admin_viewer_driver', 'tunnel', 'packer'].includes(user?.role);
  const [data, setData] = useState({ clients: [], items: [], locations: [], transactions: [] });
  const [activeZone, setActiveZone] = useState('ZD2');
  const [view, setView] = useState('stock');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [movementModal, setMovementModal] = useState(null);
  const [layoutLocation, setLayoutLocation] = useState(null);
  const [cartonModalOpen, setCartonModalOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const loadInventory = useCallback(async (quiet = false) => {
    if (!sessionToken) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const response = await getWarehouseInventory(sessionToken);
      setData({
        clients: response?.clients || [],
        items: response?.items || [],
        locations: response?.locations || [],
        transactions: response?.transactions || [],
      });
    } catch (loadError) {
      setError(loadError.message || String(loadError));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const activeLocations = useMemo(
    () => data.locations.filter(location => location.zone === activeZone),
    [activeZone, data.locations]
  );
  const totals = useMemo(
    () => zoneTotals(data.locations, data.items, activeZone),
    [activeZone, data.items, data.locations]
  );

  const openMovement = (type = 'receipt', location = null) => setMovementModal({ type, location });

  const submitMovement = async movement => {
    if (movement.type === 'adjustment') {
      const counts = data.items.map(item => ({ item_id: item.id, quantity: Number(movement.counts[item.id]) }));
      await setWarehouseStock(sessionToken, movement.locationId, counts, movement.note);
    } else {
      await recordWarehouseMovement(sessionToken, movement);
    }
    await loadInventory(true);
    toastSuccess(t('warehouse.messages.movementSaved'));
  };

  const addCarton = async name => {
    await addWarehouseCarton(sessionToken, activeZone, name);
    await loadInventory(true);
    toastSuccess(t('warehouse.messages.cartonAdded'));
  };

  const saveItem = async item => {
    await saveWarehouseItem(sessionToken, item);
    await loadInventory(true);
    toastSuccess(t(item.id ? 'warehouse.messages.itemUpdated' : 'warehouse.messages.itemAdded'));
  };

  const archiveItem = async itemId => {
    await archiveWarehouseItem(sessionToken, itemId);
    await loadInventory(true);
    toastSuccess(t('warehouse.messages.itemArchived'));
  };

  if (loading) {
    return (
      <div className="warehouse-shell" aria-busy="true">
        <div className="warehouse-skeleton is-head" />
        <div className="warehouse-skeleton-row">
          <div className="warehouse-skeleton" />
          <div className="warehouse-skeleton" />
          <div className="warehouse-skeleton" />
        </div>
      </div>
    );
  }

  if (error) return <DataError error={error} onRetry={() => loadInventory()} />;

  return (
    <div className="warehouse-shell">
      <header className="warehouse-toolbar">
        <div>
          <span className="warehouse-kicker">{t('warehouse.kicker')}</span>
          <h1>{t('warehouse.title')}</h1>
          <p>{t('warehouse.subtitle')}</p>
        </div>
        <div className="warehouse-toolbar-actions">
          <button type="button" className="warehouse-icon-btn" onClick={() => loadInventory()} title={t('common.refresh')}>
            <RefreshCw size={17} />
          </button>
          {canManage && (
            <button type="button" className="warehouse-secondary-btn" onClick={() => setCatalogOpen(true)}>
              <Settings2 size={17} /> {t('warehouse.catalog.button')}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className="warehouse-primary-btn"
              disabled={!activeLocations.some(location => location.location_type === 'carton')}
              onClick={() => openMovement('receipt')}
            >
              <PackagePlus size={17} /> {t('warehouse.actions.receipt')}
            </button>
          )}
        </div>
      </header>

      {!canManage && (
        <div className="warehouse-readonly-note">{t('warehouse.readOnly')}</div>
      )}

      <div className="warehouse-view-tabs">
        <button type="button" aria-pressed={view === 'stock'} className={view === 'stock' ? 'is-active' : ''} onClick={() => setView('stock')}>
          <Warehouse size={16} /> {t('warehouse.tabs.stock')}
        </button>
        <button type="button" aria-pressed={view === 'history'} className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>
          <History size={16} /> {t('warehouse.tabs.history')}
        </button>
      </div>

      <div className="warehouse-zone-tabs" aria-label={t('warehouse.zones.label')}>
        {ZONES.map(zone => {
          const zoneTotal = Object.values(zoneTotals(data.locations, data.items, zone)).reduce((sum, value) => sum + value, 0);
          return (
            <button type="button" key={zone} aria-pressed={activeZone === zone} className={activeZone === zone ? 'is-active' : ''} onClick={() => setActiveZone(zone)}>
              <span>{zone}</span>
              <strong>{zoneTotal} {t('warehouse.pieces')}</strong>
            </button>
          );
        })}
      </div>

      {view === 'stock' ? (
        <>
          <section className="warehouse-item-totals" aria-label={t('warehouse.totalByItem')}>
            {data.items.map(item => (
              <div key={item.id}>
                <span>{itemDisplayName(item)}</span>
                <strong>{totals[item.id] || 0}</strong>
                <small>{item.unit}</small>
              </div>
            ))}
          </section>

          <section className="warehouse-inventory-section">
            <header>
              <div>
                <h2>{t('warehouse.zoneTitle', { zone: activeZone })}</h2>
                <span>{t('warehouse.locationCount', { count: activeLocations.length })}</span>
              </div>
              {canManage && (
                <button type="button" className="warehouse-add-carton-btn" onClick={() => setCartonModalOpen(true)}>
                  <Plus size={16} /> {t('warehouse.carton.add')}
                </button>
              )}
            </header>

            {activeLocations.length === 0 ? (
              <div className="warehouse-empty-state">
                <Boxes size={28} />
                <strong>{t('warehouse.noLocations')}</strong>
              </div>
            ) : (
              <div className="warehouse-card-grid">
                {activeLocations.map(location => (
                  <StockCard
                    key={location.id}
                    location={location}
                    items={data.items}
                    canManage={canManage}
                    onAction={openMovement}
                    onLayout={setLayoutLocation}
                    t={t}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <WarehouseHistory
          transactions={data.transactions}
          activeZone={activeZone}
          t={t}
          locale={i18n.language?.startsWith('de') ? 'de-DE' : 'pl-PL'}
        />
      )}

      {movementModal && (
        <MovementModal
          initialType={movementModal.type}
          preferredLocation={movementModal.location}
          activeZone={activeZone}
          clients={data.clients}
          items={data.items}
          locations={data.locations}
          onClose={() => setMovementModal(null)}
          onSubmit={submitMovement}
        />
      )}
      {layoutLocation && (
        <CartonLayoutModal
          location={layoutLocation}
          items={data.items}
          sessionToken={sessionToken}
          canManage={canManage}
          onClose={() => setLayoutLocation(null)}
        />
      )}
      {cartonModalOpen && (
        <AddCartonModal
          zone={activeZone}
          onClose={() => setCartonModalOpen(false)}
          onAdd={addCarton}
        />
      )}
      {catalogOpen && (
        <ItemCatalogModal
          items={data.items}
          onClose={() => setCatalogOpen(false)}
          onSave={saveItem}
          onArchive={archiveItem}
        />
      )}
    </div>
  );
}
