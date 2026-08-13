import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Copy,
  Layers3,
  LayoutTemplate,
  Move,
  Plus,
  RotateCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  clampCartonRect,
  createAutomaticCartonLayout,
  reconcileCartonLayout,
  warehouseStockAllocations,
} from '../lib/warehouseLayout';
import { getWarehouseCartonLayout, saveWarehouseCartonLayout } from '../lib/warehouseRpc';
import { toastSuccess } from '../lib/toast';

function placementAllocation(placement, allocations) {
  return allocations.find(allocation => (
    allocation.clientId === placement.client_id && allocation.itemId === placement.item_id
  ));
}

function layerLabel(t, index, count) {
  if (index === 0) return t('warehouse.layout.layers.bottom');
  if (index === count - 1) return t('warehouse.layout.layers.top');
  return t('warehouse.layout.layers.numbered', { number: index + 1 });
}

function placementColor(placement) {
  const key = `${placement.client_id}:${placement.item_id}`;
  const total = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return `color-${total % 6}`;
}

function cleanPlacements(placements) {
  return placements.map(placement => ({
    id: placement.id,
    client_id: placement.client_id,
    item_id: placement.item_id,
    quantity: Math.max(1, Math.round(Number(placement.quantity) || 1)),
    layer_index: Math.max(0, Math.round(Number(placement.layer_index) || 0)),
    x: Number(Number(placement.x).toFixed(3)),
    y: Number(Number(placement.y).toFixed(3)),
    width: Number(Number(placement.width).toFixed(3)),
    height: Number(Number(placement.height).toFixed(3)),
    rotation: placement.rotation === 90 ? 90 : 0,
  }));
}

function nextPlacementRect(existing) {
  const index = existing.length;
  return clampCartonRect({
    x: 7 + (index * 9) % 46,
    y: 8 + (index * 11) % 44,
    width: 40,
    height: 36,
  });
}

function layoutErrorMessage(t, error, fallbackKey) {
  const message = error?.message || '';
  if (error?.code === '40001' || /changed by another user/i.test(message)) {
    return t('warehouse.layout.errors.conflict');
  }
  if (/without a client/i.test(message)) return t('warehouse.layout.errors.unassigned');
  if (/quantity mismatch/i.test(message)) return t('warehouse.layout.errors.mismatch');
  return t(fallbackKey);
}

export default function CartonLayoutModal({
  location,
  items,
  sessionToken,
  canManage,
  onClose,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const [version, setVersion] = useState(0);
  const [placements, setPlacements] = useState([]);
  const [layerCount, setLayerCount] = useState(1);
  const [activeLayer, setActiveLayer] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stockChanged, setStockChanged] = useState(false);
  const [error, setError] = useState('');

  const allocations = useMemo(
    () => warehouseStockAllocations(location, items),
    [items, location]
  );
  const allocationByKey = useMemo(
    () => new Map(allocations.map(allocation => [allocation.key, allocation])),
    [allocations]
  );
  const reconciliation = useMemo(
    () => reconcileCartonLayout(placements, location, items),
    [items, location, placements]
  );
  const selected = placements.find(placement => placement.id === selectedId) || null;
  const selectedAllocation = selected ? placementAllocation(selected, allocations) : null;
  const assignedByKey = useMemo(() => {
    const result = new Map();
    placements.forEach(placement => {
      const key = `${placement.client_id}:${placement.item_id}`;
      result.set(key, (result.get(key) || 0) + Number(placement.quantity || 0));
    });
    return result;
  }, [placements]);
  const missingAllocations = allocations.map(allocation => ({
    ...allocation,
    missing: Math.max(0, allocation.quantity - (assignedByKey.get(allocation.key) || 0)),
  })).filter(allocation => allocation.missing > 0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getWarehouseCartonLayout(sessionToken, location.id);
        if (!active) return;
        const nextPlacements = response?.placements || [];
        const nextLayerCount = Math.max(
          1,
          Number(response?.layer_count || 1),
          ...nextPlacements.map(placement => Number(placement.layer_index) + 1)
        );
        setVersion(Number(response?.version || 0));
        setStockChanged(Boolean(response?.needs_reconciliation));
        setPlacements(nextPlacements);
        setLayerCount(nextLayerCount);
        setActiveLayer(Math.max(0, nextLayerCount - 1));
      } catch (loadError) {
        if (active) setError(layoutErrorMessage(t, loadError, 'warehouse.layout.errors.load'));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [location.id, sessionToken, t]);

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      if (dirty && !window.confirm(t('warehouse.layout.closeConfirm'))) return;
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [dirty, onClose, t]);

  const requestClose = () => {
    if (dirty && !window.confirm(t('warehouse.layout.closeConfirm'))) return;
    onClose();
  };

  const updatePlacement = (id, patch) => {
    setPlacements(previous => previous.map(placement => (
      placement.id === id ? { ...placement, ...patch } : placement
    )));
    setDirty(true);
    setError('');
  };

  const addPlacement = (allocation, quantity = allocation.missing || allocation.quantity) => {
    const layerPlacements = placements.filter(placement => placement.layer_index === activeLayer);
    const rect = nextPlacementRect(layerPlacements);
    const id = crypto.randomUUID();
    setPlacements(previous => [...previous, {
      id,
      client_id: allocation.clientId,
      item_id: allocation.itemId,
      quantity: Math.max(1, Math.round(quantity)),
      layer_index: activeLayer,
      rotation: 0,
      ...rect,
    }]);
    setSelectedId(id);
    setDirty(true);
    setError('');
  };

  const autoArrange = () => {
    if (placements.length > 0 && !window.confirm(t('warehouse.layout.autoConfirm'))) return;
    const next = createAutomaticCartonLayout(location, items);
    const nextLayerCount = Math.max(1, ...next.map(placement => placement.layer_index + 1));
    setPlacements(next);
    setLayerCount(nextLayerCount);
    setActiveLayer(nextLayerCount - 1);
    setSelectedId(next.at(-1)?.id || null);
    setDirty(true);
    setError('');
  };

  const addLayer = () => {
    if (layerCount >= 100) return;
    setLayerCount(previous => previous + 1);
    setActiveLayer(layerCount);
    setSelectedId(null);
    setDirty(true);
    setError('');
  };

  const removeSelected = () => {
    if (!selected) return;
    setPlacements(previous => previous.filter(placement => placement.id !== selected.id));
    setSelectedId(null);
    setDirty(true);
  };

  const splitSelected = () => {
    if (!selected || Number(selected.quantity) < 2 || selected.layer_index >= 99) return;
    const lowerQuantity = Math.floor(Number(selected.quantity) / 2);
    const upperQuantity = Number(selected.quantity) - lowerQuantity;
    const targetLayer = selected.layer_index + 1;
    const id = crypto.randomUUID();
    setLayerCount(previous => Math.max(previous, targetLayer + 1));
    setPlacements(previous => [
      ...previous.map(placement => placement.id === selected.id
        ? { ...placement, quantity: lowerQuantity }
        : placement),
      {
        ...selected,
        id,
        quantity: upperQuantity,
        layer_index: targetLayer,
        x: Math.min(100 - selected.width, selected.x + 4),
        y: Math.min(100 - selected.height, selected.y + 4),
      },
    ]);
    setActiveLayer(targetLayer);
    setSelectedId(id);
    setDirty(true);
  };

  const rotateSelected = () => {
    if (!selected) return;
    const swapped = clampCartonRect({
      x: selected.x,
      y: selected.y,
      width: selected.height,
      height: selected.width,
    });
    updatePlacement(selected.id, {
      ...swapped,
      rotation: selected.rotation === 90 ? 0 : 90,
    });
  };

  const nudgeSelected = (x, y) => {
    if (!selected) return;
    updatePlacement(selected.id, clampCartonRect({
      ...selected,
      x: selected.x + x,
      y: selected.y + y,
    }));
  };

  const startInteraction = (event, placement, mode) => {
    if (!canManage || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current.getBoundingClientRect();
    canvasRef.current.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      placementId: placement.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      bounds,
      origin: { ...placement },
    };
    setSelectedId(placement.id);
  };

  const moveInteraction = event => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const deltaX = ((event.clientX - interaction.startX) / interaction.bounds.width) * 100;
    const deltaY = ((event.clientY - interaction.startY) / interaction.bounds.height) * 100;
    let rect;
    if (interaction.mode === 'resize') {
      rect = {
        x: interaction.origin.x,
        y: interaction.origin.y,
        width: Math.min(100 - interaction.origin.x, Math.max(16, interaction.origin.width + deltaX)),
        height: Math.min(100 - interaction.origin.y, Math.max(16, interaction.origin.height + deltaY)),
      };
    } else {
      rect = clampCartonRect({
        ...interaction.origin,
        x: interaction.origin.x + deltaX,
        y: interaction.origin.y + deltaY,
      });
    }
    setPlacements(previous => previous.map(placement => (
      placement.id === interaction.placementId ? { ...placement, ...rect } : placement
    )));
    setDirty(true);
  };

  const endInteraction = event => {
    if (interactionRef.current?.pointerId !== event.pointerId) return;
    interactionRef.current = null;
  };

  const save = async () => {
    if (reconciliation.status !== 'exact') {
      setError(t('warehouse.layout.errors.mismatch'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await saveWarehouseCartonLayout(
        sessionToken,
        location.id,
        version,
        layerCount,
        cleanPlacements(placements)
      );
      setVersion(Number(response?.version || version + 1));
      setDirty(false);
      setStockChanged(false);
      toastSuccess(t('warehouse.layout.saved'));
    } catch (saveError) {
      setError(layoutErrorMessage(t, saveError, 'warehouse.layout.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  const effectiveStatus = stockChanged && reconciliation.status === 'exact'
    ? 'stale'
    : reconciliation.status;
  const statusMeta = effectiveStatus === 'exact'
    ? { icon: CheckCircle2, key: 'exact' }
    : { icon: AlertTriangle, key: effectiveStatus };
  const StatusIcon = statusMeta.icon;

  return (
    <div className="warehouse-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <section
        className="warehouse-modal warehouse-layout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-layout-title"
      >
        <header className="warehouse-modal-head">
          <div>
            <h2 id="warehouse-layout-title">{t('warehouse.layout.title', { carton: location.name })}</h2>
            <p>{t('warehouse.layout.subtitle')}</p>
          </div>
          <button type="button" className="warehouse-close-btn" onClick={requestClose} aria-label={t('common.close')}>
            <X size={19} />
          </button>
        </header>

        {loading ? (
          <div className="warehouse-layout-loading" aria-busy="true">
            <div />
            <div />
          </div>
        ) : (
          <div className="warehouse-layout-body">
            <div className="warehouse-layout-summary">
              <div className={`warehouse-layout-status is-${effectiveStatus}`}>
                <StatusIcon size={18} />
                <span>
                  <strong>{t(`warehouse.layout.status.${statusMeta.key}`)}</strong>
                  <small>{t('warehouse.layout.status.counts', {
                    assigned: reconciliation.assignedTotal,
                    available: reconciliation.availableTotal,
                  })}</small>
                </span>
              </div>
              {canManage && allocations.length > 0 && (
                <button type="button" className="warehouse-secondary-btn" onClick={autoArrange}>
                  <LayoutTemplate size={17} /> {t('warehouse.layout.auto')}
                </button>
              )}
            </div>

            <div className="warehouse-layout-layerbar">
              <div className="warehouse-layout-layer-tabs" role="tablist" aria-label={t('warehouse.layout.layers.label')}>
                {Array.from({ length: layerCount }, (_, index) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeLayer === index}
                    className={activeLayer === index ? 'is-active' : ''}
                    key={index}
                    onClick={() => {
                      setActiveLayer(index);
                      setSelectedId(null);
                    }}
                  >
                    <Layers3 size={15} />
                    {layerLabel(t, index, layerCount)}
                    <small>{placements.filter(placement => placement.layer_index === index).length}</small>
                  </button>
                ))}
              </div>
              {canManage && (
                <button
                  type="button"
                  className="warehouse-layout-add-layer"
                  onClick={addLayer}
                  disabled={layerCount >= 100}
                >
                  <Plus size={15} /> {t('warehouse.layout.layers.add')}
                </button>
              )}
            </div>

            <div className="warehouse-layout-workspace">
              <div className="warehouse-layout-stage">
                <div className="warehouse-layout-stage-head">
                  <div>
                    <strong>{layerLabel(t, activeLayer, layerCount)}</strong>
                    <span>{t('warehouse.layout.canvasHint')}</span>
                  </div>
                  <span>{location.zone}</span>
                </div>
                <div
                  ref={canvasRef}
                  className="warehouse-carton-canvas"
                  onPointerMove={moveInteraction}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                  onPointerDown={event => {
                    if (event.target === event.currentTarget) setSelectedId(null);
                  }}
                >
                  <div className="warehouse-carton-depth" aria-hidden="true" />
                  {placements.filter(placement => placement.layer_index < activeLayer).map(placement => (
                    <div
                      className={`warehouse-carton-placement is-ghost ${placementColor(placement)}`}
                      key={`ghost-${placement.id}`}
                      style={{
                        left: `${placement.x}%`,
                        top: `${placement.y}%`,
                        width: `${placement.width}%`,
                        height: `${placement.height}%`,
                      }}
                      aria-hidden="true"
                    />
                  ))}
                  {placements.filter(placement => placement.layer_index === activeLayer).map(placement => {
                    const allocation = placementAllocation(placement, allocations);
                    const label = allocation
                      ? `${allocation.itemName}, ${allocation.clientName}, ${placement.quantity} ${allocation.unit}`
                      : t('warehouse.layout.unknownStack');
                    return (
                      <button
                        type="button"
                        className={`warehouse-carton-placement ${placementColor(placement)} ${selectedId === placement.id ? 'is-selected' : ''}`}
                        key={placement.id}
                        style={{
                          left: `${placement.x}%`,
                          top: `${placement.y}%`,
                          width: `${placement.width}%`,
                          height: `${placement.height}%`,
                        }}
                        onPointerDown={event => startInteraction(event, placement, 'move')}
                        onClick={() => setSelectedId(placement.id)}
                        aria-label={label}
                      >
                        <Move className="warehouse-carton-move-icon" size={14} aria-hidden="true" />
                        <span>
                          <strong>{allocation?.itemName || t('warehouse.layout.unknownStack')}</strong>
                          {allocation?.itemVariant && <small>{allocation.itemVariant}</small>}
                        </span>
                        <b>{placement.quantity} <small>{allocation?.unit || t('warehouse.pieces')}</small></b>
                        <em>{allocation?.clientName || ''}</em>
                        {canManage && (
                          <span
                            className="warehouse-carton-resize-handle"
                            onPointerDown={event => startInteraction(event, placement, 'resize')}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                  {placements.every(placement => placement.layer_index !== activeLayer) && (
                    <div className="warehouse-carton-empty-layer">
                      <Layers3 size={24} />
                      <strong>{t('warehouse.layout.emptyLayer')}</strong>
                      <span>{canManage ? t('warehouse.layout.emptyLayerHint') : t('warehouse.layout.emptyLayerReadOnly')}</span>
                    </div>
                  )}
                </div>
              </div>

              <aside className="warehouse-layout-inspector">
                {selected ? (
                  <>
                    <div className="warehouse-layout-inspector-head">
                      <div className={`warehouse-layout-swatch ${placementColor(selected)}`} />
                      <div>
                        <strong>{selectedAllocation?.itemName || t('warehouse.layout.stack')}</strong>
                        <span>{selectedAllocation?.clientName || t('warehouse.layout.unknownStack')}</span>
                      </div>
                    </div>

                    <label>
                      <span>{t('warehouse.layout.fields.allocation')}</span>
                      <select
                        value={`${selected.client_id}:${selected.item_id}`}
                        disabled={!canManage}
                        onChange={event => {
                          const allocation = allocationByKey.get(event.target.value);
                          if (allocation) updatePlacement(selected.id, {
                            client_id: allocation.clientId,
                            item_id: allocation.itemId,
                          });
                        }}
                      >
                        {allocations.map(allocation => (
                          <option value={allocation.key} key={allocation.key}>
                            {allocation.itemName}{allocation.itemVariant ? ` ${allocation.itemVariant}` : ''} - {allocation.clientName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="warehouse-layout-inspector-grid">
                      <label>
                        <span>{t('warehouse.layout.fields.quantity')}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={selected.quantity}
                          disabled={!canManage}
                          onChange={event => updatePlacement(selected.id, {
                            quantity: Math.max(1, Math.round(Number(event.target.value) || 1)),
                          })}
                        />
                      </label>
                      <label>
                        <span>{t('warehouse.layout.fields.layer')}</span>
                        <select
                          value={selected.layer_index}
                          disabled={!canManage}
                          onChange={event => {
                            const nextLayer = Number(event.target.value);
                            updatePlacement(selected.id, { layer_index: nextLayer });
                            setActiveLayer(nextLayer);
                          }}
                        >
                          {Array.from({ length: layerCount }, (_, index) => (
                            <option value={index} key={index}>{layerLabel(t, index, layerCount)}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {canManage && (
                      <>
                        <div className="warehouse-layout-nudge" aria-label={t('warehouse.layout.nudge')}>
                          <button type="button" onClick={() => nudgeSelected(-2, 0)} aria-label={t('warehouse.layout.moveLeft')}><ArrowLeft size={16} /></button>
                          <button type="button" onClick={() => nudgeSelected(0, -2)} aria-label={t('warehouse.layout.moveUp')}><ArrowUp size={16} /></button>
                          <button type="button" onClick={() => nudgeSelected(0, 2)} aria-label={t('warehouse.layout.moveDown')}><ArrowDown size={16} /></button>
                          <button type="button" onClick={() => nudgeSelected(2, 0)} aria-label={t('warehouse.layout.moveRight')}><ArrowRight size={16} /></button>
                        </div>
                        <div className="warehouse-layout-stack-actions">
                          <button type="button" onClick={rotateSelected}><RotateCw size={15} /> {t('warehouse.layout.rotate')}</button>
                          <button
                            type="button"
                            onClick={splitSelected}
                            disabled={Number(selected.quantity) < 2 || selected.layer_index >= 99}
                          ><Copy size={15} /> {t('warehouse.layout.split')}</button>
                          <button type="button" className="is-danger" onClick={removeSelected}><Trash2 size={15} /> {t('warehouse.layout.remove')}</button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="warehouse-layout-inspector-empty">
                    <Move size={23} />
                    <strong>{t('warehouse.layout.chooseStack')}</strong>
                    <span>{t('warehouse.layout.chooseStackHint')}</span>
                  </div>
                )}

                {canManage && (
                  <div className="warehouse-layout-unplaced">
                    <header>
                      <strong>{t('warehouse.layout.unplaced')}</strong>
                      <span>{missingAllocations.length}</span>
                    </header>
                    {missingAllocations.length === 0 ? (
                      <p>{t('warehouse.layout.unplacedEmpty')}</p>
                    ) : missingAllocations.map(allocation => (
                      <button type="button" key={allocation.key} onClick={() => addPlacement(allocation, allocation.missing)}>
                        <span>
                          <strong>{allocation.itemName}</strong>
                          <small>{allocation.clientName}</small>
                        </span>
                        <b>+{allocation.missing}</b>
                      </button>
                    ))}
                  </div>
                )}
              </aside>
            </div>

            {error && <div className="warehouse-form-error warehouse-layout-error">{error}</div>}

            <footer className="warehouse-layout-footer">
              <div>
                {dirty && <span>{t('warehouse.layout.unsaved')}</span>}
              </div>
              <button type="button" className="warehouse-secondary-btn" onClick={requestClose}>{t('common.close')}</button>
              {canManage && (
                <button
                  type="button"
                  className="warehouse-primary-btn"
                  onClick={save}
                  disabled={saving || reconciliation.status !== 'exact' || (!dirty && !stockChanged)}
                >
                  <Save size={17} /> {saving ? t('common.saving') : t('warehouse.layout.save')}
                </button>
              )}
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
