import { useState } from 'react';
import { Pencil, Trash2, Minus, Plus, Package, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import './InventoryTable.css';

const InventoryTable = ({ items, onEdit, onDelete, onQuantityUpdate }) => {
  const { t, currentLanguage } = useLanguage();
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [takeOutModal,  setTakeOutModal]  = useState(null);
  const [takeOutQty,    setTakeOutQty]    = useState(1);
  const [takeOutNote,   setTakeOutNote]   = useState('');

  const handleTakeOutConfirm = async () => {
    if (!takeOutModal) return;
    const qty = parseInt(takeOutQty, 10);
    if (!qty || qty <= 0) return;
    await onQuantityUpdate(takeOutModal.item.id, -qty, takeOutNote);
    setTakeOutModal(null);
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const getStatusInfo = (item) => {
    if (item.quantity < item.threshold)
      return { cls: 'status-low', text: t('lowStock'), icon: <AlertTriangle size={11} strokeWidth={2.5} /> };
    return   { cls: 'status-ok',  text: t('inStock'),  icon: <CheckCircle2  size={11} strokeWidth={2.5} /> };
  };

  if (items.length === 0) {
    return (
      <div className="inv-table-empty">
        <Package size={40} strokeWidth={1} />
        <h3>{t('noItems')}</h3>
        <p>{t('noItemsDescription')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="inv-table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th inv-th--img">{t('image')}</th>
              <th className="inv-th">{t('designation')}</th>
              <th className="inv-th inv-th--center">{t('quantity')}</th>
              <th className="inv-th inv-th--center">{t('threshold')}</th>
              <th className="inv-th inv-th--center">{t('status')}</th>
              <th className="inv-th inv-th--right">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const s = getStatusInfo(item);
              return (
                <tr
                  key={item.id}
                  className="inv-tr"
                  style={{ animationDelay: `${index * 0.04}s` }}
                >
                  <td className="inv-td inv-td--img">
                    {item.image
                      ? <img src={item.image} alt={item.designation[currentLanguage]} className="inv-img" />
                      : <div className="inv-img-placeholder"><Package size={20} strokeWidth={1.5} /></div>
                    }
                  </td>
                  <td className="inv-td inv-td--name">
                    {item.designation[currentLanguage]}
                  </td>
                  <td className="inv-td inv-td--center">
                    <div className="qty-controls">
                      <button
                        className="qty-control-btn qty-control-btn--minus"
                        onClick={() => { setTakeOutModal({ item }); setTakeOutQty(1); setTakeOutNote(''); }}
                        disabled={item.quantity === 0}
                        title="Take out stock"
                      >
                        <Minus size={12} strokeWidth={2.5} />
                      </button>
                      <span className={`qty-display ${item.quantity < item.threshold ? 'qty-display--low' : ''}`}>
                        {item.quantity}
                      </span>
                      <button
                        className="qty-control-btn qty-control-btn--plus"
                        onClick={() => onQuantityUpdate(item.id, 1, '')}
                        title="Add 1"
                      >
                        <Plus size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                  <td className="inv-td inv-td--center inv-td--mono">{item.threshold}</td>
                  <td className="inv-td inv-td--center">
                    <span className={`status-badge ${s.cls}`}>
                      {s.icon}
                      {s.text}
                    </span>
                  </td>
                  <td className="inv-td inv-td--right">
                    <div className="inv-row-actions">
                      <button className="row-action-btn row-action-btn--edit" onClick={() => onEdit(item)}>
                        <Pencil size={13} strokeWidth={2.5} />
                      </button>
                      <button className="row-action-btn row-action-btn--delete" onClick={() => setDeleteConfirm(item)}>
                        <Trash2 size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete Confirm */}
      <Modal isOpen={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title={t('deleteConfirmTitle')} size="small">
        <div className="confirm-modal">
          <div className="confirm-modal__icon confirm-modal__icon--danger">
            <Trash2 size={22} strokeWidth={1.5} />
          </div>
          <p>{t('deleteConfirmMessage')}</p>
          {deleteConfirm && <div className="confirm-modal__name">{deleteConfirm.designation[currentLanguage]}</div>}
          <div className="confirm-modal__actions">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>{t('cancel')}</Button>
            <Button variant="danger" onClick={() => { onDelete(deleteConfirm.id); setDeleteConfirm(null); }}>{t('delete')}</Button>
          </div>
        </div>
      </Modal>

      {/* Take-out Modal */}
      <Modal isOpen={takeOutModal !== null} onClose={() => setTakeOutModal(null)} title={t('takeOutTitle') || 'Take Out Stock'} size="small">
        {takeOutModal && (
          <div className="take-out-modal">
            <div className="take-out-modal__item">
              <strong>{takeOutModal.item.designation[currentLanguage]}</strong>
              <span className="take-out-modal__avail">Available: {takeOutModal.item.quantity}</span>
            </div>
            <div className="take-out-modal__field">
              <label>Quantity to remove</label>
              <input
                type="number"
                min={1}
                max={takeOutModal.item.quantity}
                value={takeOutQty}
                onChange={e => setTakeOutQty(e.target.value)}
                autoFocus
              />
            </div>
            <div className="take-out-modal__field">
              <label>Reason / Note</label>
              <textarea
                placeholder="e.g. Used for maintenance on machine #3"
                value={takeOutNote}
                onChange={e => setTakeOutNote(e.target.value)}
                rows={3}
              />
            </div>
            <div className="confirm-modal__actions">
              <Button variant="secondary" onClick={() => setTakeOutModal(null)}>{t('cancel')}</Button>
              <Button
                variant="danger"
                onClick={handleTakeOutConfirm}
                disabled={!takeOutQty || parseInt(takeOutQty) <= 0 || parseInt(takeOutQty) > takeOutModal.item.quantity}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default InventoryTable;