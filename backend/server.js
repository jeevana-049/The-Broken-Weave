const express = require('express');
const mysql = require('mysql2/promise'); // Using mysql2 with promise support
const cors = require('cors');
const bcrypt = require('bcrypt');
// const path = require('path'); // Not needed for Vercel functions directly serving API
// const multer = require('multer'); // Removed for Vercel serverless deployment (no file storage)
// const fs = require('fs/promises'); // Removed for Vercel serverless deployment

const app = express();

// Middleware
app.use(cors()); // Enables Cross-Origin Resource Sharing for all origins
app.use(express.json()); // Parses JSON bodies of incoming requests

// --- Database Connection Pool Setup using environment variables ---
let pool; // Declare pool outside the function to reuse connection across invocations

async function getDbConnection() {
    if (!pool) {
        try {
            // Ensure environment variables are set before creating the pool
            if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_DATABASE) {
                throw new Error('Database environment variables are not set. Please configure DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE.');
            }

            pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_DATABASE,
                waitForConnections: true,
                connectionLimit: 10, // Max number of connections in the pool
                queueLimit: 0,       // No limit on connection queue
                // Recommended for serverless to keep connections alive
                keepAliveInitialDelay: 10000, // 10 seconds
                enableKeepAlive: true
            });
            console.log('Database pool created successfully.');

            // Optional: Test connection immediately after pool creation
            const connection = await pool.getConnection();
            console.log('Successfully connected to MySQL database via pool!');
            connection.release(); // Release the connection back to the pool
        } catch (err) {
            console.error('Failed to initialize MySQL database pool:', err);
            // Re-throw the error to ensure Vercel deployment fails if DB connection is bad
            throw err;
        }
    }
    return pool;
}

// --- Middleware for Admin Protection (from your code) ---
const isAdmin = (req, res, next) => {
    // This checks for a custom header 'x-user-is-admin' set to 'true'
    // In a real application, you'd verify a JWT token or session.
    if (req.headers['x-user-is-admin'] === 'true') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }
};
// --- END ADMIN MIDDLEWARE ---

// --- API Routes ---

// Health Check Route (Good for Vercel to verify deployment)
app.get('/api/health', async (req, res) => {
    try {
        const pool = await getDbConnection();
        // Try a simple query to check database connectivity
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok', message: 'Backend and Database are healthy!' });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ status: 'error', message: 'Backend or Database unhealthy.', error: error.message });
    }
});

// 1. User Registration Route
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ message: 'Username, password, and email are required.' });
    }

    try {
        const pool = await getDbConnection(); // Get the connection pool
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
        const pool = await getDbConnection(); // Get the connection pool
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

// 3. Report Missing Person Route (Image Uploads Disabled for Vercel)
// Removed `upload.single('image')` middleware as file uploads are not supported directly on Vercel functions
app.post('/api/missing-persons', async (req, res) => {
    const { name, dob, category, last_known_location, contact_info, description } = req.body;
    const imageUrl = null; // Image uploads are disabled for Vercel deployment

    if (!name || !category || !last_known_location || !contact_info) {
        return res.status(400).json({ message: 'Missing required fields: name, category, last_known_location, contact_info.' });
    }

    try {
        const pool = await getDbConnection(); // Get the connection pool
        const query = `
            INSERT INTO MISSING_PERSONS (name, dob, category, last_known_location, contact_info, description, image_url, reported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const [result] = await pool.execute(query, [name, dob || null, category, last_known_location, contact_info, description || null, imageUrl]);

        res.status(201).json({ message: 'Missing person reported successfully!', id: result.insertId, imageUrl: imageUrl });
    } catch (error) {
        console.error('Error reporting missing person:', error);
        res.status(500).json({ message: 'Server error reporting missing person.', error: error.message });
    }
});

// API Endpoint to Get All Missing Persons
app.get('/api/missing-persons', async (req, res) => {
    try {
        const pool = await getDbConnection();
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
        const pool = await getDbConnection();
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
        const pool = await getDbConnection();
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
        const pool = await getDbConnection();
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
        const pool = await getDbConnection();
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

// API Endpoint to Update Missing Person's Photo (Admin Protected) - Image upload disabled for Vercel
// Removed `upload.single('image')` middleware.
app.patch('/api/missing-persons/:id/image', isAdmin, async (req, res) => {
    const personId = req.params.id;
    // Image uploads are disabled, so we'll just acknowledge the attempt but won't process a new image file.
    // In a full solution, you'd use a cloud storage service like Cloudinary or AWS S3 here.
    console.warn('Image upload functionality is disabled for Vercel serverless functions.');
    return res.status(501).json({ message: 'Image upload is temporarily disabled. Please contact support.' }); // 501 Not Implemented
});


// NEW: API Endpoint to Update ALL Missing Person Details (Admin Protected)
app.patch('/api/missing-persons/:id', isAdmin, async (req, res) => {
    const personId = req.params.id;
    const { name, dob, category, last_known_location, contact_info, description } = req.body;

    if (!name || !category || !last_known_location || !contact_info) {
        return res.status(400).json({ message: 'Missing required fields: name, category, last_known_location, contact_info.' });
    }

    try {
        const pool = await getDbConnection();
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


// NEW: API Endpoint to Delete Missing Person (Admin Protected) - Image deletion disabled for Vercel
app.delete('/api/missing-persons/:id', isAdmin, async (req, res) => {
    const personId = req.params.id;
    let connection; // Declare connection for finally block

    try {
        connection = await getDbConnection(); // Use getDbConnection to get pool, then connection
        // Start a transaction (good practice)
        await connection.beginTransaction();

        // 1. Get the image URL (but we won't delete the file on Vercel)
        const [persons] = await connection.execute('SELECT image_url FROM MISSING_PERSONS WHERE id = ?', [personId]);

        if (persons.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Missing person not found.' });
        }

        // 2. Delete the record from the database
        const [deleteResult] = await connection.execute('DELETE FROM MISSING_PERSONS WHERE id = ?', [personId]);

        if (deleteResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Missing person not found or already deleted.' });
        }

        // Image file deletion logic removed for Vercel serverless functions
        console.warn('Image file deletion functionality is disabled for Vercel serverless functions.');

        await connection.commit();
        res.status(200).json({ message: `Missing person ID ${personId} deleted successfully (image file not deleted from server).` });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error deleting missing person:', error);
        res.status(500).json({ message: 'Server error deleting missing person.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
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
        const pool = await getDbConnection();
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

// --- FINAL EXPORT FOR VERCEL ---
// This line replaces app.listen() and is crucial for Vercel to recognize your Express app
module.exports = app;