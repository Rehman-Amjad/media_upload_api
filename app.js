require('dotenv').config(); // Load environment variables
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Use promise-based MySQL
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Import the crypto module

// Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());

// Database Configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

// Create Database Connection Pool
const pool = mysql.createPool(dbConfig);

// Test the database connection
pool.getConnection()
  .then(() => {
    console.log('Connected to MySQL database');
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir); // Create the directory if it doesn't exist
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename
    const uniqueSuffix = crypto.randomBytes(16).toString('hex'); // Generate a random unique string
    const fileExtension = path.extname(file.originalname); // Get the file extension
    cb(null, `${uniqueSuffix}${fileExtension}`); // Combine unique string with file extension
  },
});

// File Upload Middleware
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'video/mp4',
      'video/x-msvideo', // AVI
      'video/quicktime',  // MOV
      'audio/mpeg',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: JPEG, PNG, MP4, AVI, MOV, MPEG.'));
    }
  },
});

// Helper function to handle errors
const handleError = (res, error) => {
  console.error(error);
  res.status(500).json({ error: 'Internal Server Error', details: error.message });
};

// API Endpoint for File Upload
app.post('/media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    // Save file metadata to the database
    const query = 'INSERT INTO uploads (file_name, file_path) VALUES (?, ?)';
    const [result] = await pool.query(query, [req.file.filename, filePath]);

    res.status(200).json({
      message: 'File uploaded successfully',
      file: {
        name: req.file.filename,
        path: filePath,
        url: fileUrl,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
});

// API Endpoint for File Deletion
app.delete('/media/:filename', async (req, res) => {
  const { filename } = req.params;

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const filePath = path.join(uploadsDir, filename);

  // Delete the file from the filesystem
  fs.unlink(filePath, async (err) => {
    if (err) {
      return res.status(404).json({ error: 'File not found', details: err.message });
    }

    // Delete the file metadata from the database
    const query = 'DELETE FROM uploads WHERE file_name = ?';
    try {
      await pool.query(query, [filename]);
      res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      handleError(res, error);
    }
  });
});

// Serve Uploaded Files
app.use('/uploads', express.static(uploadsDir));

// API Endpoint for API Check
app.get('/api', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Start the Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

