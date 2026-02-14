# AlumIN - Aluminum Bars Inventory Management System

A production-ready, scalable inventory management platform for aluminum bars, built with React and modern frontend architecture principles.

## 🎯 Project Overview

This is a **real-world, production-grade application** designed with future backend integration in mind. The architecture emphasizes:
- Clean separation of concerns
- Scalable folder structure
- Reusable components
- Service layer abstraction for easy API migration

## 🏗️ Architecture

### Design Philosophy

The application follows a **feature-based architecture** with clear separation between:
- **UI Components**: Presentational, reusable components
- **Business Logic**: Feature-specific logic and state management
- **Data Services**: Abstraction layer for data operations
- **Context/State**: Centralized state management

### Folder Structure

```
aluminum-inventory/
├── public/
│   └── index.html              # HTML template
├── src/
│   ├── components/             # Shared UI components
│   │   ├── common/            # Reusable components (Button, Modal, Input)
│   │   └── layout/            # Layout components (Header)
│   ├── features/              # Feature modules
│   │   └── inventory/
│   │       ├── components/    # Feature-specific components
│   │       │   ├── InventoryTable.js
│   │       │   ├── InventoryForm.js
│   │       │   ├── InventoryFilters.js
│   │       │   └── StockNotifications.js
│   │       ├── hooks/         # Feature-specific hooks
│   │       ├── services/      # Feature-specific services
│   │       └── InventoryPage.js  # Main feature container
│   ├── context/               # React Context providers
│   │   ├── LanguageContext.js # i18n state management
│   │   └── InventoryContext.js # Inventory state management
│   ├── hooks/                 # Shared custom hooks
│   │   └── useModal.js
│   ├── services/              # Data layer services
│   │   └── inventoryService.js # API abstraction layer
│   ├── utils/                 # Utility functions
│   │   └── validation.js      # Form validation utilities
│   ├── assets/                # Static assets
│   ├── App.js                 # Root component
│   ├── App.css                # Global styles
│   ├── index.js               # Application entry point
│   └── index.css              # Base styles
└── package.json
```

## 📦 Data Model

Each aluminum bar item follows this structure:

```javascript
{
  id: string,                    // Unique identifier
  image: string,                 // Image URL
  designation: {                 // Multi-language designations
    it: string,                 // Italian
    fr: string,                 // French
    en: string                  // English
  },
  quantity: number,              // Current stock quantity
  threshold: number              // Minimum stock threshold
}
```

## ✨ Features

### 1. Complete CRUD Operations
- ✅ **Create**: Add new aluminum bars with image preview
- ✅ **Read**: View all inventory items in a responsive table
- ✅ **Update**: Edit existing items with pre-filled forms
- ✅ **Delete**: Remove items with confirmation modal

### 2. Inventory Table
- Responsive design with mobile optimization
- Image previews with fallback placeholder
- Status indicators (color-coded based on stock level)
- Dynamic designation display based on selected language
- **RED quantity indicator** when `quantity < threshold`

### 3. Language System
- Lightweight i18n implementation without heavy dependencies
- Three languages: **Italian** (default), **French**, **English**
- Dynamic UI translation
- Persistent designation in all languages
- Language selector in header

### 4. Stock Notifications
- **Automatic detection** of low stock items
- Real-time notification banner
- Shows count and details of items below threshold
- Auto-hides when all items are adequately stocked

### 5. Advanced Filtering
- **Show All**: Display entire inventory
- **Low Stock Only**: Filter items below threshold
- **Search**: Find items by designation (searches across all languages)
- Filters work together (search + filter combination)

### 6. State Management
- React Context API for global state
- Clean separation between UI state and data state
- Optimized re-renders with useMemo and useCallback
- Easy migration path to Redux/Zustand if needed

### 7. Data Persistence
- localStorage for client-side persistence
- Service layer abstraction (`inventoryService.js`)
- **Simulated API delays** for realistic behavior
- Ready for backend integration (see migration guide below)

## 🎨 Design System

The application features a distinctive, production-grade design:

### Typography
- **Primary Font**: Archivo (headings, body text)
- **Monospace Font**: DM Mono (technical data, codes)

### Color Palette
- **Primary**: Black/Dark Gray (`#0a0a0a`, `#1a1a1a`)
- **Surface**: White with subtle gradients
- **Status Colors**:
  - Success (In Stock): Green (`#059669`)
  - Warning (Low Stock): Amber/Red (`#dc2626`)
- **Borders**: Light gray (`#e0e0e0`, `#d0d0d0`)

### UI Principles
- Clean, professional aesthetic
- Minimal but impactful animations
- Responsive design (mobile-first approach)
- Accessible (keyboard navigation, focus states)

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Navigate to project directory**:
```bash
cd aluminum-inventory
```

2. **Install dependencies**:
```bash
npm install
```

3. **Start development server**:
```bash
npm start
```

The application will open at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

## 🔄 Backend Integration Guide

The application is designed for easy backend migration. Here's how:

### Current Implementation (localStorage)

```javascript
// src/services/inventoryService.js
export const getAllItems = async () => {
  const data = localStorage.getItem(STORAGE_KEY);
  return JSON.parse(data) || [];
};
```

### Backend Migration

Replace localStorage calls with real API requests:

```javascript
// src/services/inventoryService.js
export const getAllItems = async () => {
  const response = await fetch('/api/inventory', {
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch inventory');
  }
  
  return await response.json();
};

export const createItem = async (itemData) => {
  const response = await fetch('/api/inventory', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(itemData)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create item');
  }
  
  return await response.json();
};

// Repeat for updateItem, deleteItem, etc.
```

### API Endpoints (Backend Requirements)

```
GET    /api/inventory           - Get all items
GET    /api/inventory/:id       - Get single item
POST   /api/inventory           - Create new item
PUT    /api/inventory/:id       - Update item
DELETE /api/inventory/:id       - Delete item
GET    /api/inventory/low-stock - Get low stock items
GET    /api/inventory?search=term - Search items
```

### Authentication Integration

Add authentication context:

```javascript
// src/context/AuthContext.js
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  
  // Implement login, logout, token refresh
  
  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

Update service calls to include auth headers.

## 🧪 Testing Strategy

### Recommended Testing Approach

1. **Unit Tests** (Jest + React Testing Library):
   - Component rendering
   - User interactions
   - Validation logic
   - Utility functions

2. **Integration Tests**:
   - Feature workflows (add → edit → delete)
   - Context provider integration
   - Service layer integration

3. **E2E Tests** (Cypress/Playwright):
   - Complete user journeys
   - Cross-browser compatibility
   - Responsive design validation

### Example Test Structure

```javascript
// src/components/common/__tests__/Button.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../Button';

describe('Button Component', () => {
  test('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  test('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

## 🔧 Configuration & Environment

### Environment Variables

Create a `.env` file for environment-specific configuration:

```env
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_ENABLE_MOCK_DATA=true
REACT_APP_DEFAULT_LANGUAGE=it
```

Access in code:

```javascript
const apiUrl = process.env.REACT_APP_API_URL;
```

## 📝 Code Quality

### Best Practices Implemented

✅ Component composition over inheritance  
✅ Custom hooks for reusable logic  
✅ PropTypes for runtime type checking (can add)  
✅ CSS Modules for scoped styling  
✅ Semantic HTML  
✅ Accessibility (ARIA labels, keyboard nav)  
✅ Error boundaries (can add)  
✅ Code splitting (can add)  

### Recommended Additions

- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks
- **PropTypes**: Runtime type validation

## 🚀 Performance Optimizations

- `useMemo` for expensive computations
- `useCallback` for stable function references
- Lazy loading for routes (can implement)
- Image optimization (can implement)
- Bundle size optimization with code splitting

## 📱 Responsive Design

Breakpoints:
- **Desktop**: > 968px
- **Tablet**: 768px - 968px
- **Mobile**: < 768px

All components are fully responsive and tested on various screen sizes.

## 🌐 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 🤝 Contributing

This is a template project. To extend:

1. Follow the existing folder structure
2. Maintain separation of concerns
3. Write reusable components
4. Document complex logic
5. Add tests for new features

## 📄 License

This project is a demonstration of production-grade React architecture.

## 👥 Authors

Built as a scalable foundation for aluminum inventory management.

---

## 🎓 Learning Resources

This project demonstrates:
- **React Hooks**: useState, useEffect, useContext, useMemo, useCallback
- **Context API**: Global state management
- **Custom Hooks**: Reusable stateful logic
- **Service Layer Pattern**: Data abstraction
- **Component Composition**: Building complex UIs from simple parts
- **Form Handling**: Controlled components, validation
- **Modal Patterns**: Overlays, escape key handling
- **Responsive Design**: Mobile-first CSS
- **Accessibility**: Semantic HTML, ARIA attributes

Perfect for learning modern React patterns and production architecture!
