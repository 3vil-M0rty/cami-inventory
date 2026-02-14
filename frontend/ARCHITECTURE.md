# Architecture Decisions & Rationale

## Table of Contents
1. [Project Structure](#project-structure)
2. [State Management](#state-management)
3. [Data Layer](#data-layer)
4. [Component Architecture](#component-architecture)
5. [Styling Approach](#styling-approach)
6. [Internationalization](#internationalization)
7. [Form Handling](#form-handling)
8. [Future Scalability](#future-scalability)

---

## Project Structure

### Decision: Feature-Based Organization

**Chosen Approach:**
```
src/
  features/
    inventory/
      components/
      hooks/
      services/
```

**Rationale:**
- **Scalability**: Easy to add new features without affecting existing code
- **Encapsulation**: Related code stays together
- **Team Collaboration**: Multiple developers can work on different features independently
- **Code Discovery**: New developers can quickly understand feature boundaries
- **Lazy Loading**: Features can be code-split easily for performance

**Alternative Considered:**
- Component-type organization (`components/`, `containers/`, `services/`) 
- Rejected because it becomes unwieldy as the app grows and violates feature cohesion

---

## State Management

### Decision: React Context API (Not Redux)

**Chosen Approach:**
```javascript
<InventoryProvider>
  <LanguageProvider>
    <App />
  </LanguageProvider>
</InventoryProvider>
```

**Rationale:**
- **Simplicity**: No additional dependencies needed
- **Sufficient for Current Scale**: Two main state contexts (Inventory, Language)
- **Easy Migration**: Can later migrate to Redux/Zustand without changing component code
- **Performance**: With proper memoization (useMemo, useCallback), performance is excellent
- **Learning Curve**: Lower barrier to entry for junior developers

**When to Migrate to Redux:**
- More than 5-6 context providers needed
- Complex state updates with multiple reducers
- Need for time-travel debugging
- Advanced middleware requirements (saga, thunk)

**Why Not Redux Now:**
- Adds ~50KB to bundle size
- Boilerplate overhead for simple CRUD operations
- Context API handles current requirements perfectly

---

## Data Layer

### Decision: Service Layer Abstraction

**Chosen Approach:**
```javascript
// services/inventoryService.js
export const getAllItems = async () => {
  // Currently: localStorage
  // Future: fetch('/api/inventory')
};
```

**Rationale:**
- **Separation of Concerns**: UI doesn't know about storage mechanism
- **Easy Testing**: Mock service layer in tests
- **Backend Migration**: Change one file, entire app updates
- **Consistency**: All data operations follow same pattern
- **Error Handling**: Centralized error handling logic

**Key Design Decisions:**

1. **Async/Await Throughout**:
   - Even localStorage calls are async to match future API calls
   - No refactoring needed when switching to real backend

2. **Simulated API Delays**:
   ```javascript
   const simulateApiDelay = (ms = 100) => 
     new Promise(resolve => setTimeout(resolve, ms));
   ```
   - Realistic user experience
   - Tests loading states
   - Identifies race conditions early

3. **Error Throwing**:
   - Services throw errors; components handle them
   - Consistent error interface for future API errors

---

## Component Architecture

### Decision: Composition Over Configuration

**Chosen Approach:**
```javascript
<Modal isOpen={isOpen} onClose={onClose}>
  <InventoryForm onSubmit={handleSubmit} />
</Modal>
```

**Rationale:**
- **Flexibility**: Components are building blocks, not rigid templates
- **Reusability**: Same Modal works for add/edit/delete confirmations
- **Testability**: Test components in isolation
- **Maintenance**: Changes to one component don't affect others

**Component Categories:**

1. **Common Components** (`components/common/`):
   - Button, Modal, Input
   - No business logic
   - Highly reusable
   - Controlled via props

2. **Layout Components** (`components/layout/`):
   - Header, Footer (if added)
   - Application structure
   - Minimal business logic

3. **Feature Components** (`features/*/components/`):
   - Feature-specific
   - May contain business logic
   - Can use common components

**Key Patterns:**

**Controlled Components:**
```javascript
<Input 
  value={formData.quantity}
  onChange={handleInputChange}
/>
```
- Form state managed by parent
- Predictable data flow
- Easy validation

**Container/Presentational Split:**
- `InventoryPage` = Container (logic, state)
- `InventoryTable` = Presentational (display, events)

---

## Styling Approach

### Decision: CSS Modules Pattern (Without Build Config)

**Chosen Approach:**
- Component-level CSS files
- BEM-like naming convention
- CSS variables for theming (future)

**Rationale:**

**Why Not CSS-in-JS (styled-components, emotion):**
- Adds runtime overhead
- Increases bundle size
- More complex debugging
- Harder to optimize

**Why Not Tailwind:**
- Large utility class learning curve
- Less semantic HTML
- Harder to maintain custom designs
- Project has specific design system

**Why Not SCSS:**
- Extra build step
- Modern CSS has most features (variables, nesting coming)
- Simpler stack

**Our Approach:**
```css
/* Component-scoped styles */
.inventory-table {
  /* styles */
}

.inventory-table__row {
  /* BEM element */
}

.inventory-table__row--active {
  /* BEM modifier */
}
```

**Benefits:**
- Clear component ownership
- No global namespace pollution
- Easy to locate styles
- Standard CSS (any developer can understand)

---

## Internationalization

### Decision: Lightweight Custom Solution

**Chosen Approach:**
```javascript
const translations = {
  it: { addNewItem: 'Aggiungi Nuova Barra' },
  fr: { addNewItem: 'Ajouter Nouvelle Barre' },
  en: { addNewItem: 'Add New Bar' }
};

const { t } = useLanguage();
<h2>{t('addNewItem')}</h2>
```

**Why Not react-i18next / react-intl:**
- Overkill for simple 3-language support
- Adds 30-50KB to bundle
- Complex configuration
- More than needed for current requirements

**Our Solution:**
- Simple object-based translations
- Context API for language state
- Straightforward translation function
- Easy to understand and maintain

**When to Migrate:**
- Need for pluralization rules
- Date/number formatting by locale
- Translation file management at scale
- Professional translator workflow

**Current Solution Supports:**
- Multiple languages (IT, FR, EN)
- Dynamic language switching
- Context-aware translations
- Easy addition of new languages

---

## Form Handling

### Decision: Controlled Components with Custom Validation

**Chosen Approach:**
```javascript
const [formData, setFormData] = useState({...});
const [errors, setErrors] = useState({});

const validation = validateInventoryItem(formData);
if (!validation.isValid) {
  setErrors(validation.errors);
}
```

**Why Not Formik / React Hook Form:**
- Simple forms don't need heavy libraries
- Custom validation is straightforward
- More control over behavior
- Lighter bundle size

**Our Approach:**

**Validation Module** (`utils/validation.js`):
- Reusable validation functions
- Centralized validation logic
- Easy to test
- Type-safe validation

**Form State:**
- Local component state
- Controlled inputs
- Real-time validation (optional)
- Clear error messages

**When to Add Form Library:**
- Complex multi-step forms
- Advanced field arrays
- Complex validation dependencies
- Form state persistence needed

---

## Future Scalability

### Planned Enhancements (Future Backend Integration)

**1. Authentication**
```javascript
// context/AuthContext.js
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  
  const login = async (credentials) => {
    const { token, user } = await authService.login(credentials);
    setToken(token);
    setUser(user);
  };
  
  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**2. API Integration**
```javascript
// services/inventoryService.js
const API_BASE_URL = process.env.REACT_APP_API_URL;

export const getAllItems = async () => {
  const response = await fetch(`${API_BASE_URL}/inventory`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

**3. Error Handling**
```javascript
// components/ErrorBoundary.js
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    logErrorToService(error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

**4. Code Splitting**
```javascript
// App.js
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage'));

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <InventoryPage />
    </Suspense>
  );
}
```

**5. Performance Monitoring**
```javascript
// utils/analytics.js
export const trackPageView = (pageName) => {
  // Google Analytics, Mixpanel, etc.
};

export const trackEvent = (eventName, properties) => {
  // Track user interactions
};
```

**6. Progressive Web App (PWA)**
- Add service worker
- Offline support
- Install prompt
- Push notifications

**7. Advanced Features**
- Bulk operations (import/export CSV)
- Advanced filtering (date ranges, categories)
- Barcode scanning
- Image upload to cloud storage
- Audit logs
- User roles and permissions

---

## Design Decisions Summary

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| State | Context API | Sufficient for current scale, easy migration path |
| Styling | CSS Modules Pattern | Standard, performant, maintainable |
| Data Layer | Service Abstraction | Easy backend migration |
| i18n | Custom Lightweight | No overhead for simple needs |
| Forms | Controlled + Custom | Full control, lighter bundle |
| Structure | Feature-Based | Scalable, team-friendly |
| Components | Composition | Flexible, reusable |

---

## Migration Checklist

When moving to production backend:

- [ ] Replace localStorage with fetch/axios
- [ ] Add authentication context
- [ ] Implement error boundaries
- [ ] Add loading skeletons
- [ ] Setup environment variables
- [ ] Add request/response interceptors
- [ ] Implement token refresh logic
- [ ] Add retry logic for failed requests
- [ ] Setup error tracking (Sentry)
- [ ] Add analytics (GA, Mixpanel)
- [ ] Implement optimistic updates
- [ ] Add data caching strategy
- [ ] Setup API documentation
- [ ] Add E2E tests

---

This architecture prioritizes **clarity**, **maintainability**, and **future extensibility** while keeping the current implementation **simple** and **performant**.
