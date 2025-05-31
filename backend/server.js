// server.js - COMPLETE CODE (Updated for Localhost Only)

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path'); // Essential for handling file paths correctly
const multer = require('multer');
const fs = require('fs/promises'); // For file system operations (e.g., deleting images)

const app = express();
const port = 3000; // Your server port - confirmed to be 5500
const BASE_URL = 'http://localhost:3000'; // Make sure this is 5500!
// Middleware
app.use(cors()); // Enables Cross-Origin Resource Sharing for all origins
app.use(express.json()); // Parses JSON bodies of incoming requests

// --- IMPORTANT: Serve static files from the 'frontend' folder ---
// This makes all files in the 'frontend' directory (like index.html, styles.css, login.html etc.)
// accessible directly via the web server.
// path.join(__dirname, '..', 'frontend') ensures that the server correctly finds
// the 'frontend' folder, which is a sibling to the 'backend' folder where server.js resides.
//app.use(express.static(path.join(__dirname, '..', 'frontend')));

// --- Multer Configuration for Image Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure 'uploads/' directory exists in your project root
        // This 'uploads' folder should be a sibling to 'backend' and 'frontend'
        cb(null, path.join(__dirname, '..', 'uploads')); // Corrected path for uploads folder
    },
    filename: (req, file, cb) => {
        // Unique filename for uploaded images to prevent conflicts
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Serve static files from the 'uploads' directory
// This makes uploaded images accessible via /uploads/filename.jpg from the browser
// The path here should also be relative to the project root
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
// --- END MULTER CONFIG ---


// Database Connection Pool Setup
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Your MySQL username
    password: 'root', // Your MySQL password
    database: 'the_broken_weave_db', // Your database name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test Database Connection
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to MySQL database!');
        connection.release(); // Release the connection back to the pool
    })
    .catch(err => {
        console.error('Failed to connect to MySQL database:', err);
    });

// --- Middleware for Admin Protection ---
// Checks for a custom header 'x-user-is-admin' set to 'true'
const isAdmin = (req, res, next) => {
    if (req.headers['x-user-is-admin'] === 'true') {
        next(); // User is admin, proceed to the next middleware/route handler
    } else {
        res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }
};
// --- END ADMIN MIDDLEWARE ---


// API Routes

// Root/Home route: Serves your main index.html file when accessing the base URL (e.g., your IP:Port)
// This route takes precedence over express.static for the exact '/' path.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// 1. User Registration Route
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ message: 'Username, password, and email are required.' });
    }

    try {
        // Check if username or email already exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'Username or Email already exists.' });
        }

        // Hash password before storing
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user into the database
        const [result] = await pool.execute(
            'INSERT INTO users (username, password, email, is_admin) VALUES (?, ?, ?, 0)',
            [username, hashedPassword, email]
        );

        res.status(201).json({ message: 'User registered successfully!', userId: result.insertId });

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    }
});

// 2. User Login Route
app.post('/api/login', async (req, res) => {
    console.log('--- Backend: /api/login POST route reached! ---');
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        // Retrieve user by username
        const [users] = await pool.execute(
            'SELECT id, username, password, is_admin FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const user = users[0];
        const hashedPassword = user.password;

        // Compare provided password with hashed password
        const passwordMatch = await bcrypt.compare(password, hashedPassword);

        if (passwordMatch) {
            res.status(200).json({
                message: 'Login successful!',
                user: {
                    id: user.id,
                    username: user.username,
                    is_admin: user.is_admin
                }
            });
        } else {
            res.status(401).json({ message: 'Invalid username or password.' });
        }

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    }
});

// 3. Report Missing Person Route
app.post('/api/missing-persons', upload.single('image'), async (req, res) => {
    const { name, dob, category, last_known_location, contact_info, description } = req.body;
    // The image URL stored in DB should be relative to the /uploads static route
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name || !category || !last_known_location || !contact_info) {
        // If image is uploaded but required fields are missing, delete the uploaded image
        if (req.file) {
            // fs.unlink needs the full path to delete the file
            await fs.unlink(req.file.path).catch(err => console.error("Failed to delete temp image:", err));
        }
        return res.status(400).json({ message: 'Missing required fields: name, category, last_known_location, contact_info.' });
    }

    try {
        const query = `
            INSERT INTO MISSING_PERSONS (name, dob, category, last_known_location, contact_info, description, image_url, reported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const [result] = await pool.execute(query, [name, dob || null, category, last_known_location, contact_info, description || null, imageUrl]);

        res.status(201).json({ message: 'Missing person reported successfully!', id: result.insertId, imageUrl: imageUrl });
    } catch (error) {
        // If there's a database error, delete the uploaded image to prevent orphaned files
        if (req.file) {
            await fs.unlink(req.file.path).catch(err => console.error("Failed to delete image on DB error:", err));
        }
        console.error('Error reporting missing person:', error);
        res.status(500).json({ message: 'Server error reporting missing person.', error: error.message });
    }
});

// API Endpoint to Get All Missing Persons
app.get('/api/missing-persons', async (req, res) => {
    try {
        // Fetches all missing persons, formatted date for readability
        const sql = 'SELECT id, name, dob, category, last_known_location, contact_info, description, image_url, status, DATE_FORMAT(reported_at, "%Y-%m-%d %H:%i:%s") AS reported_at_formatted FROM MISSING_PERSONS ORDER BY reported_at DESC';
        const [rows] = await pool.execute(sql);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching missing persons:', error);
        res.status(500).json({ message: 'Error fetching missing persons', error: error.message });
    }
});

// 4. Search Missing Persons Route
app.get('/api/missing-persons/search', async (req, res) => {
    const queryTerm = req.query.q || ''; // Search term from query parameter 'q'
    const categoryFilter = req.query.category || ''; // Category filter from query parameter 'category'

    try {
        let sql = `
            SELECT id, name, dob, last_known_location, contact_info, description, reported_at, category, status, image_url
            FROM MISSING_PERSONS
            WHERE (name LIKE ? OR description LIKE ? OR last_known_location LIKE ?)
        `;
        const params = [`%${queryTerm}%`, `%${queryTerm}%`, `%${queryTerm}%`]; // Parameters for LIKE queries

        // Add category filter if provided and not 'all'
        if (categoryFilter && categoryFilter !== 'all') {
            sql += ` AND category = ?`;
            params.push(categoryFilter);
        }

        sql += ` ORDER BY reported_at DESC`; // Order by most recently reported

        const [rows] = await pool.execute(sql, params);
        res.status(200).json({ results: rows });
    } catch (error) {
        console.error('Error during search:', error);
        res.status(500).json({ message: 'Server error during search.', error: error.message });
    }
});

// 5. Get Success Stories Route (Found Persons)
app.get('/api/success-stories', async (req, res) => {
    try {
        const query = `
            SELECT id, name, dob, last_known_location, contact_info, description, reported_at, category, image_url
            FROM MISSING_PERSONS
            WHERE status = 'found'
            ORDER BY reported_at DESC
            LIMIT 5; -- Limits to the 5 most recent success stories
        `;
        const [stories] = await pool.execute(query);
        res.status(200).json({ stories: stories });
    } catch (error) {
        console.error('Error fetching success stories:', error);
        res.status(500).json({ message: 'Server error while fetching stories.', error: error.message });
    }
});

// API Endpoint to Get All Volunteers (Admin Protected)
app.get('/api/volunteers', isAdmin, async (req, res) => {
    try {
        const query = `SELECT id, name, email, phone, skills, availability, message, registered_at FROM VOLUNTEERS ORDER BY registered_at DESC`;
        const [volunteers] = await pool.execute(query);

        res.status(200).json(volunteers);
    } catch (error) {
        console.error('Error fetching volunteers:', error);
        res.status(500).json({ message: 'Server error fetching volunteers.', error: error.message });
    }
});

// 6. Update Missing Person Status (Mark as Found) Route (Admin Protected)
app.patch('/api/missing-persons/:id/found', isAdmin, async (req, res) => {
    const personId = req.params.id;

    try {
        const [result] = await pool.execute(
            'UPDATE MISSING_PERSONS SET status = ? WHERE id = ?',
            ['found', personId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Missing person not found.' });
        }

        res.status(200).json({ message: `Missing person with ID ${personId} marked as found.` });

    } catch (error) {
        console.error('Error marking missing person as found:', error);
        res.status(500).json({ message: 'Server error marking person as found.', error: error.message });
    }
});

// API Endpoint to Update Missing Person's Photo (Admin Protected)
app.patch('/api/missing-persons/:id/image', isAdmin, upload.single('image'), async (req, res) => {
    const personId = req.params.id;
    // New image URL will be relative to the /uploads static route
    const newImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!newImageUrl) {
        return res.status(400).json({ message: 'No image file provided.' });
    }

    let connection;
    try {
        connection = await pool.getConnection(); // Get a connection from the pool
        await connection.beginTransaction(); // Start a transaction

        // 1. Get the old image URL (if any) from the database
        const [persons] = await connection.execute('SELECT image_url FROM MISSING-PERSONS WHERE id = ?', [personId]);

        if (persons.length === 0) {
            await connection.rollback(); // Rollback transaction
            return res.status(404).json({ message: 'Missing person not found.' });
        }
        const oldImageUrl = persons[0].image_url;

        // 2. Update the database with the new image URL
        const [updateResult] = await connection.execute(
            'UPDATE MISSING_PERSONS SET image_url = ? WHERE id = ?',
            [newImageUrl, personId]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback(); // Rollback transaction
            return res.status(404).json({ message: 'Missing person not found or no changes made.' });
        }

        // 3. Delete the old image file from the server (if it exists and is different from the new one)
        // Construct full path for deletion: Go up from 'backend', then to 'uploads'
        if (oldImageUrl && oldImageUrl !== newImageUrl) {
            const oldImagePath = path.join(__dirname, '..', oldImageUrl);
            try {
                // Check if file exists before attempting to delete
                await fs.access(oldImagePath);
                await fs.unlink(oldImagePath); // Delete the file
                console.log(`Old image deleted: ${oldImagePath}`);
            } catch (fileError) {
                // It's okay if the old file doesn't exist (e.g., first upload, or file already deleted)
                console.warn(`Could not delete old image ${oldImagePath}: ${fileError.message}`);
            }
        }

        await connection.commit(); // Commit transaction
        res.status(200).json({ message: 'Photo updated successfully!', newImageUrl: newImageUrl });

    } catch (error) {
        if (connection) {
            await connection.rollback(); // Rollback transaction on error
        }
        console.error('Error updating missing person photo:', error);
        res.status(500).json({ message: 'Server error updating photo.', error: error.message });
    } finally {
        if (connection) {
            connection.release(); // Release the connection back to the pool
        }
    }
});

// NEW: API Endpoint to Update ALL Missing Person Details (Admin Protected)
app.patch('/api/missing-persons/:id', isAdmin, async (req, res) => {
    const personId = req.params.id;
    const { name, dob, category, last_known_location, contact_info, description } = req.body;

    if (!name || !category || !last_known_location || !contact_info) {
        return res.status(400).json({ message: 'Missing required fields: name, category, last_known_location, contact_info.' });
    }

    try {
        const [result] = await pool.execute(
            `UPDATE MISSING_PERSONS
             SET name = ?, dob = ?, category = ?, last_known_location = ?, contact_info = ?, description = ?
             WHERE id = ?`,
            [name, dob || null, category, last_known_location, contact_info, description || null, personId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Missing person not found or no changes made.' });
        }

        res.status(200).json({ message: `Missing person ID ${personId} details updated successfully.` });

    } catch (error) {
        console.error('Error updating missing person details:', error);
        res.status(500).json({ message: 'Server error updating details.', error: error.message });
    }
});


// NEW: API Endpoint to Delete Missing Person (Admin Protected)
app.delete('/api/missing-persons/:id', isAdmin, async (req, res) => {
    const personId = req.params.id;
    let connection;

    try {
        connection = await pool.getConnection(); // Get a connection from the pool
        await connection.beginTransaction(); // Start a transaction

        // 1. Get the image URL before deleting the record
        const [persons] = await connection.execute('SELECT image_url FROM MISSING_PERSONS WHERE id = ?', [personId]);

        if (persons.length === 0) {
            await connection.rollback(); // Rollback transaction
            return res.status(404).json({ message: 'Missing person not found.' });
        }
        const imageUrlToDelete = persons[0].image_url;

        // 2. Delete the record from the database
        const [deleteResult] = await connection.execute('DELETE FROM MISSING_PERSONS WHERE id = ?', [personId]);

        if (deleteResult.affectedRows === 0) {
            await connection.rollback(); // Rollback transaction if no rows were affected
            return res.status(404).json({ message: 'Missing person not found or already deleted.' });
        }

        // 3. Delete the associated image file from the server
        // Construct full path for deletion: Go up from 'backend', then to 'uploads'
        if (imageUrlToDelete) {
            const imagePath = path.join(__dirname, '..', imageUrlToDelete); // Corrected path for deletion
            try {
                // Check if file exists before attempting to delete
                await fs.access(imagePath);
                await fs.unlink(imagePath); // Delete the file
                console.log(`Associated image deleted: ${imagePath}`);
            } catch (fileError) {
                // Log warning if file deletion fails (e.g., file doesn't exist, permissions)
                console.warn(`Could not delete associated image ${imagePath}: ${fileError.message}`);
            }
        }

        await connection.commit(); // Commit transaction
        res.status(200).json({ message: `Missing person ID ${personId} and associated image deleted successfully.` });

    } catch (error) {
        if (connection) {
            await connection.rollback(); // Rollback transaction on error
        }
        console.error('Error deleting missing person:', error);
        res.status(500).json({ message: 'Server error deleting missing person.', error: error.message });
    } finally {
        if (connection) {
            connection.release(); // Release the connection back to the pool
        }
    }
});


// API Endpoint for Volunteer Registration
app.post('/api/volunteer/register', async (req, res) => {
    const { name, email, phone, skills, availability, message } = req.body;

    if (!name || !email || !skills || !availability) {
        return res.status(400).json({ message: 'Name, email, skills, and availability are required fields for volunteer registration.' });
    }

    try {
        const query = `
            INSERT INTO VOLUNTEERS (name, email, phone, skills, availability, message)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.execute(query, [name, email, phone || null, skills, availability, message || null]);

        res.status(201).json({ message: 'Volunteer registered successfully!', volunteerId: result.insertId });

    } catch (error) {
        console.error('Error during volunteer registration:', error);
        res.status(500).json({ message: 'Server error during volunteer registration.', error: error.message });
    }
});


// Start the server
app.listen(port, '0.0.0.0', () => { // ADDED '0.0.0.0' for network access
    console.log(`Backend server listening on port ${port}`);
    console.log(`Access from your computer: http://localhost:${port}`);
    console.log(`Access from other devices on your network: http://192.168.74.29:${port}`);
});