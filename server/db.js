// server/db.js

const dotenv = require('dotenv');
console.log('Current working directory:', process.cwd()); // This should show your project directory

dotenv.config();
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

connection.connect(err => {
  if (err) throw err;
  console.log("MySQL connected");
});

module.exports = connection;