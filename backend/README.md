# Aluminum Inventory - Backend API

Production-ready Express + MongoDB backend for shared inventory management.

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- MongoDB (local or MongoDB Atlas)

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
```

Edit `.env` with your MongoDB connection string.

3. **Start server:**
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3001`

## 📡 API Endpoints

### Inventory Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inventory` | Get all items |
| GET | `/api/inventory/:id` | Get single item |
| POST | `/api/inventory` | Create new item |
| PUT | `/api/inventory/:id` | Update item |
| DELETE | `/api/inventory/:id` | Delete item |
| GET | `/api/inventory/filter/low-stock` | Get low stock items |
| GET | `/api/inventory/search?q=term` | Search items |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health status |

## 📝 Request/Response Examples

### Create Item
```bash
POST /api/inventory
Content-Type: application/json

{
  "image": "https://example.com/image.jpg",
  "designation": {
    "it": "Barra Alluminio 6063",
    "fr": "Barre Aluminium 6063",
    "en": "Aluminum Bar 6063"
  },
  "quantity": 50,
  "threshold": 20
}
```

### Response
```json
{
  "id": "507f1f77bcf86cd799439011",
  "image": "https://example.com/image.jpg",
  "designation": {
    "it": "Barra Alluminio 6063",
    "fr": "Barre Aluminium 6063",
    "en": "Aluminum Bar 6063"
  },
  "quantity": 50,
  "threshold": 20,
  "createdAt": "2024-02-14T10:00:00.000Z",
  "updatedAt": "2024-02-14T10:00:00.000Z"
}
```

## 🗄️ Database

### MongoDB Schema

```javascript
{
  image: String,
  designation: {
    it: String (required),
    fr: String (required),
    en: String (required)
  },
  quantity: Number (required, min: 0),
  threshold: Number (required, min: 0),
  timestamps: true
}
```

### Sample Data

Server automatically initializes with 4 sample items on first run.

## 🌍 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/aluminum-inventory` |
| `PORT` | Server port | `3001` |
| `FRONTEND_URL` | Frontend URL for CORS | `*` |

## 🔒 Security Features

- ✅ Helmet.js for HTTP headers
- ✅ CORS configuration
- ✅ Input validation
- ✅ MongoDB injection protection
- ✅ Error handling

## 📦 Deployment

### MongoDB Atlas Setup (Free)

1. Create account at https://www.mongodb.com/cloud/atlas
2. Create free cluster (M0)
3. Create database user
4. Whitelist IP: `0.0.0.0/0`
5. Get connection string
6. Update `MONGODB_URI` in production environment

### Render Deployment

1. Push code to GitHub
2. Create new Web Service on Render
3. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables:
     - `MONGODB_URI`: Your Atlas connection string
     - `FRONTEND_URL`: Your frontend URL

## 🧪 Testing API

### Using cURL

```bash
# Get all items
curl http://localhost:3001/api/inventory

# Create item
curl -X POST http://localhost:3001/api/inventory \
  -H "Content-Type: application/json" \
  -d '{"designation":{"it":"Test","fr":"Test","en":"Test"},"quantity":10,"threshold":5}'

# Health check
curl http://localhost:3001/health
```

### Using Postman

Import this collection:
1. GET `http://localhost:3001/api/inventory`
2. POST `http://localhost:3001/api/inventory` with JSON body
3. PUT `http://localhost:3001/api/inventory/:id` with JSON body
4. DELETE `http://localhost:3001/api/inventory/:id`

## 📊 Features

- ✅ Full CRUD operations
- ✅ Validation with meaningful errors
- ✅ Sample data initialization
- ✅ Search across all languages
- ✅ Low stock filtering
- ✅ Health monitoring
- ✅ Request logging
- ✅ Graceful shutdown
- ✅ Production-ready error handling

## 🐛 Troubleshooting

### Can't connect to MongoDB
- Check MongoDB is running: `mongod --version`
- Verify connection string in `.env`
- For Atlas: Check IP whitelist and credentials

### Port already in use
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9
```

### Dependencies not installing
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📚 Tech Stack

- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **Helmet** - Security
- **CORS** - Cross-origin requests
- **dotenv** - Environment variables

## 📄 License

MIT
