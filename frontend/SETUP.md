# Quick Setup Guide

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v14.0.0 or higher)
- **npm** (v6.0.0 or higher) or **yarn** (v1.22.0 or higher)

Check your versions:
```bash
node --version
npm --version
```

---

## Installation Steps

### 1. Navigate to Project Directory

```bash
cd aluminum-inventory
```

### 2. Install Dependencies

Using npm:
```bash
npm install
```

Or using yarn:
```bash
yarn install
```

This will install:
- react (^18.2.0)
- react-dom (^18.2.0)
- react-scripts (5.0.1)

### 3. Start Development Server

Using npm:
```bash
npm start
```

Or using yarn:
```bash
yarn start
```

The application will automatically open in your default browser at:
```
http://localhost:3000
```

---

## Available Scripts

### `npm start`
Runs the app in development mode.
- Hot reloading enabled
- Error overlay in browser
- Source maps for debugging

### `npm run build`
Creates an optimized production build in the `build/` folder.
- Minified and optimized code
- Production-ready assets
- Source maps for debugging

### `npm test`
Launches the test runner in interactive watch mode.
- Run all tests
- Watch mode for TDD workflow

### `npm run eject`
**Note: This is a one-way operation!**
Ejects from Create React App to customize build configuration.

---

## Initial Application State

On first load, the application initializes with **sample data**:

1. **4 pre-loaded aluminum bars** with varying stock levels
2. **2 items below threshold** (triggers low stock notification)
3. **Multi-language designations** (IT, FR, EN) for each item
4. **Sample images** from Unsplash

This data is stored in **localStorage** and persists across sessions.

---

## Project Structure Overview

```
aluminum-inventory/
├── public/
│   └── index.html              # HTML entry point
├── src/
│   ├── components/             # Shared components
│   │   ├── common/            # Button, Modal, Input
│   │   └── layout/            # Header
│   ├── features/              # Feature modules
│   │   └── inventory/
│   ├── context/               # State management
│   ├── hooks/                 # Custom hooks
│   ├── services/              # Data layer
│   ├── utils/                 # Utilities
│   ├── App.js                 # Root component
│   └── index.js               # Entry point
├── package.json
├── README.md                   # Full documentation
└── ARCHITECTURE.md            # Architecture decisions
```

---

## Testing the Application

### 1. Add a New Item
- Click "+ AGGIUNGI" button in top right
- Fill in all designation fields (IT, FR, EN)
- Enter quantity and threshold values
- Add an image URL (optional)
- Click "SALVA"

### 2. Edit an Item
- Click "MODIFICA" on any item row
- Update any fields
- Click "SALVA"

### 3. Delete an Item
- Click "ELIMINA" on any item row
- Confirm deletion in modal
- Item is removed from inventory

### 4. Filter Items
- Click "SOLO SCORTE BASSE" to see only low stock items
- Use search bar to find items by designation
- Filters work together (search + filter combination)

### 5. Change Language
- Click language buttons in header (ITALIANO, FRANÇAIS, ENGLISH)
- UI and designations update immediately
- Language preference persists in state

### 6. Check Notifications
- Low stock notification appears automatically
- Shows count and details of items below threshold
- Updates in real-time as inventory changes

---

## Development Tips

### Hot Reloading
- Save any file to see changes instantly
- No need to refresh the browser
- State is preserved (React Fast Refresh)

### Browser DevTools
- React DevTools extension recommended
- Check component hierarchy
- Inspect state and props
- Performance profiling

### Console Errors
- Check browser console for errors
- Service layer logs operations
- Validation errors are logged

### Local Storage
- Open DevTools → Application → Local Storage
- Key: `aluminum_inventory`
- View/edit persisted data directly

**Clear Data:**
```javascript
// In browser console
localStorage.removeItem('aluminum_inventory');
location.reload();
```

---

## Common Issues & Solutions

### Issue: Port 3000 is already in use

**Solution:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm start
```

### Issue: Dependencies not installing

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Issue: Build fails

**Solution:**
```bash
# Check Node version
node --version  # Should be v14+

# Update React Scripts
npm install react-scripts@latest
```

### Issue: Images not loading

**Solution:**
- Check image URLs are valid
- Ensure URLs are publicly accessible
- CORS issues? Use different image host
- Sample Unsplash URLs work out of the box

---

## Browser Compatibility

Tested and working on:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)

---

## Next Steps

1. **Explore the Code**
   - Start with `src/App.js`
   - Check `src/features/inventory/InventoryPage.js`
   - Review service layer in `src/services/inventoryService.js`

2. **Read Documentation**
   - `README.md` for full features
   - `ARCHITECTURE.md` for design decisions

3. **Customize**
   - Modify sample data in `inventoryService.js`
   - Adjust styling in component CSS files
   - Add new features following existing patterns

4. **Prepare for Backend**
   - Review API migration guide in README
   - Plan backend endpoints
   - Setup environment variables

---

## Support

For questions or issues:
1. Check console for errors
2. Review README.md
3. Check ARCHITECTURE.md for design rationale

---

**You're ready to go! Start the server and explore the application.** 🚀
