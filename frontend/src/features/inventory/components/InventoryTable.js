import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import './InventoryTable.css';

/**
 * InventoryTable Component
 * 
 * Displays inventory items in a responsive table
 * Shows status indicators and handles item actions
 * WITH QUANTITY INCREMENT/DECREMENT BUTTONS
 */

const InventoryTable = ({ items, onEdit, onDelete, onQuantityUpdate }) => {
  const { t, currentLanguage } = useLanguage();
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [takeOutModal, setTakeOutModal] = useState(null); // { item }
  const [takeOutQty, setTakeOutQty] = useState(1);
  const [takeOutNote, setTakeOutNote] = useState('');

  const handleDeleteClick = (item) => {
    setDeleteConfirm(item);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      onDelete(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  const handleMinusClick = (item) => {
    setTakeOutModal({ item });
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const handleTakeOutConfirm = async () => {
    if (!takeOutModal) return;
    const qty = parseInt(takeOutQty, 10);
    if (!qty || qty <= 0) return;
    await onQuantityUpdate(takeOutModal.item.id, -qty, takeOutNote);
    setTakeOutModal(null);
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const handleTakeOutCancel = () => {
    setTakeOutModal(null);
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const getStatusClass = (item) => {
    return item.quantity < item.threshold ? 'status-low' : 'status-ok';
  };

  const getStatusText = (item) => {
    return item.quantity < item.threshold ? t('lowStock') : t('inStock');
  };

  if (items.length === 0) {
    return (
      <div className="inventory-table__empty">
        <div className="inventory-table__empty-icon">📦</div>
        <h3 className="inventory-table__empty-title">{t('noItems')}</h3>
        <p className="inventory-table__empty-description">{t('noItemsDescription')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="inventory-table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th className="inventory-table__th inventory-table__th--image">
                {t('image')}
              </th>
              <th className="inventory-table__th inventory-table__th--designation">
                {t('designation')}
              </th>
              <th className="inventory-table__th inventory-table__th--number">
                {t('quantity')}
              </th>
              <th className="inventory-table__th inventory-table__th--number">
                {t('threshold')}
              </th>
              <th className="inventory-table__th inventory-table__th--status">
                {t('status')}
              </th>
              <th className="inventory-table__th inventory-table__th--actions">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr 
                key={item.id} 
                className="inventory-table__row"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <td className="inventory-table__td inventory-table__td--image">
                  {item.image ? (
                    <img 
                      src={item.image} 
                      alt={item.designation[currentLanguage]}
                      className="inventory-table__image"
                    />
                  ) : (
                    <div className="inventory-table__image-placeholder">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                        <path d="M21 15L16 10L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )}
                </td>
                <td className="inventory-table__td inventory-table__td--designation">
                  {item.designation[currentLanguage]}
                </td>
                <td className="inventory-table__td inventory-table__td--quantity">
                  <div className="quantity-controls">
                    <button 
                      className="quantity-btn quantity-btn--minus"
                      onClick={() => handleMinusClick(item)}
                      title="Decrease quantity"
                      disabled={item.quantity === 0}
                    >
                      −
                    </button>
                    <span className={`quantity-value ${
                      item.quantity < item.threshold ? 'quantity-value--low' : ''
                    }`}>
                      {item.quantity}
                    </span>
                    <button 
                      className="quantity-btn quantity-btn--plus"
                      onClick={() => onQuantityUpdate(item.id, 1, '')}
                      title="Increase by 1"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="inventory-table__td inventory-table__td--number">
                  {item.threshold}
                </td>
                <td className="inventory-table__td inventory-table__td--status">
                  <span className={`status-badge ${getStatusClass(item)}`}>
                    {getStatusText(item)}
                  </span>
                </td>
                <td className="inventory-table__td inventory-table__td--actions">
                  <div className="inventory-table__actions">
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => onEdit(item)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleDeleteClick(item)}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirm !== null}
        onClose={handleDeleteCancel}
        title={t('deleteConfirmTitle')}
        size="small"
      >
        <div className="delete-confirm">
          <p className="delete-confirm__message">
            {t('deleteConfirmMessage')}
          </p>
          {deleteConfirm && (
            <div className="delete-confirm__item">
              <strong>{deleteConfirm.designation[currentLanguage]}</strong>
            </div>
          )}
          <div className="delete-confirm__actions">
            <Button
              variant="secondary"
              onClick={handleDeleteCancel}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
            >
              {t('delete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Take-Out Modal */}
      <Modal
        isOpen={takeOutModal !== null}
        onClose={handleTakeOutCancel}
        title="Take Out Stock"
        size="small"
      >
        {takeOutModal && (
          <div className="take-out-confirm">
            <p className="take-out-confirm__article">
              <strong>{takeOutModal.item.designation[currentLanguage]}</strong>
              <span style={{ marginLeft: 8, color: '#888' }}>
                (available: {takeOutModal.item.quantity})
              </span>
            </p>
            <div className="take-out-confirm__field">
              <label className="take-out-confirm__label">Quantity to remove</label>
              <input
                type="number"
                className="take-out-confirm__input"
                min={1}
                max={takeOutModal.item.quantity}
                value={takeOutQty}
                onChange={e => setTakeOutQty(e.target.value)}
                autoFocus
              />
            </div>
            <div className="take-out-confirm__field">
              <label className="take-out-confirm__label">Reason / Note</label>
              <textarea
                className="take-out-confirm__textarea"
                placeholder="e.g. Used for maintenance on machine #3"
                value={takeOutNote}
                onChange={e => setTakeOutNote(e.target.value)}
                rows={3}
              />
            </div>
            <div className="delete-confirm__actions">
              <Button variant="secondary" onClick={handleTakeOutCancel}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={handleTakeOutConfirm}
                disabled={!takeOutQty || parseInt(takeOutQty) <= 0 || parseInt(takeOutQty) > takeOutModal.item.quantity}
              >
                Confirm Take-Out
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default InventoryTable;
