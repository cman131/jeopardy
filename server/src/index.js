const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { connect } = require('./db');
const boardsRouter = require('./routes/boards');
const gamesRouter = require('./routes/games');
const { registerGameHandlers } = require('./sockets/gameHandlers');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api/boards', boardsRouter);
app.use('/api/games', gamesRouter);

io.on('connection', socket => registerGameHandlers(io, socket));

const PORT = process.env.PORT || 3001;

connect().then(() => {
  httpServer.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}).catch(err => {
  console.error('DB connection failed', err);
  process.exit(1);
});
