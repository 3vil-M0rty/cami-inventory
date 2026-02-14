import { useInventory } from '../../../context/InventoryContext';
import { useLanguage } from '../../../context/LanguageContext';
import './StockNotifications.css';

/**
 * StockNotifications Component
 * 
 * Displays reactive notifications for low stock items
 * Automatically updates when inventory changes
 */

const StockNotifications = () => {
  const { getLowStockItems, getLowStockCount } = useInventory();
  const { t, currentLanguage } = useLanguage();

  const lowStockItems = getLowStockItems();
  const lowStockCount = getLowStockCount();

  if (lowStockCount === 0) {
    return null;
  }

  return (
    <div className="stock-notification">
      <div className="stock-notification__icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path 
            d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
          />
        </svg>
      </div>
      
      <div className="stock-notification__content">
        <div className="stock-notification__title">
          {t('lowStockAlert')}
        </div>
        <div className="stock-notification__message">
          <strong>{lowStockCount}</strong> {t('itemsBelowThreshold')}
        </div>
      </div>

      <div className="stock-notification__items">
        {lowStockItems.map(item => (
          <div key={item.id} className="stock-notification__item">
            <span className="stock-notification__item-name">
              {item.designation[currentLanguage]}
            </span>
            <span className="stock-notification__item-stock">
              {item.quantity}/{item.threshold}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockNotifications;
