import express from 'express';
import path from 'path';
import { modelRoutes } from './routes/model.routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()) // Middleware

app.get('/', (req, res) => { // Serve index.html
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/query', modelRoutes); // Send to model router

app.listen(PORT, () => { // Listen for port
  console.log('Server running');
})
