const express = require('express');
const app = express();
const routes = require('./routes');
const cors = require('cors');

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
