const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// Firebase initialize
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Connected devices store
const connectedDevices = {};

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('register', (data) => {
    connectedDevices[data.deviceId] = socket.id;
    console.log('Device registered:', data.deviceId);
  });

  socket.on('command', (data) => {
    const childSocket = connectedDevices[data.childDeviceId];
    if (childSocket) {
      io.to(childSocket).emit('execute_command', {
        command: data.command,
        params: data.params
      });
    }
  });

  socket.on('data_update', (data) => {
    const parentSocket = connectedDevices[data.parentId];
    if (parentSocket) {
      io.to(parentSocket).emit('child_data', data);
    }
  });

  socket.on('disconnect', () => {
    Object.keys(connectedDevices).forEach(key => {
      if (connectedDevices[key] === socket.id) {
        delete connectedDevices[key];
      }
    });
  });
});

// Send notification endpoint
app.post('/notify', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    
    await admin.messaging().send({
      token: token,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'vigil_alerts'
        }
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Notify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status check
app.get('/', (req, res) => {
  res.json({
    status: 'Vigil Backend Online',
    connected_devices: Object.keys(connectedDevices).length,
    time: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Vigil Backend running on port:', PORT);
});
