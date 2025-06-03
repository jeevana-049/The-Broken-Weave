require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const { Pool } = require('pg'); // Use pg for PostgreSQL
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();

// Middleware
app.use(cors()); // Enables Cross-Origin Resource Sharing for all origins
app.use(express.json()); // Parses JSON bodies of incoming requests

// --- Database Connection Pool Setup using environment variables ---
let pool; // Declare pool outside the function to reuse connection across invocations

async function getDbConnection() {
    if (!pool) {
        try {
            // Ensure DATABASE_URL environment variable is set
            if (!process.env.DATABASE_URL) {
                throw new Error('DATABASE_URL environment variable is not set. Please configure it.');
            }

            pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: {
                    rejectUnauthorized: false // Required for connecting to Supabase (or Neon) from Vercel's serverless functions for free tier
                }
            });

            console.log('PostgreSQL Database pool created successfully.');

            // Optional: Test connection immediately after pool creation
            const client = await pool.connect(); // Get a client from the pool
            console.log('Successfully connected to PostgreSQL database via pool!');
            client.release(); // Release the client back to the pool
        } catch (err) {
            console.error('Failed to initialize PostgreSQL database pool:', err);
            // Re-throw the error to ensure Vercel deployment fails if DB connection is bad
            throw err;
        }
    }
    return pool;
}

// --- Middleware for Admin Protection ---
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
        const existingUsersQuery = 'SELECT id FROM users WHERE username = $1 OR email = $2'; // Using lowercase 'users'
        const existingUsersResult = await pool.query(existingUsersQuery, [username, email]);

        if (existingUsersResult.rows.length > 0) { // Access results.rows
            return res.status(409).json({ message: 'Username or Email already exists.' });
        }

        // Hash password before storing
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user into the database
        // Use RETURNING id to get the newly inserted ID in PostgreSQL
        // Use 'FALSE' for boolean type instead of '0' for better PostgreSQL compatibility
        const insertUserQuery = 'INSERT INTO users (username, password, email, is_admin) VALUES ($1, $2, $3, FALSE) RETURNING id'; // Using lowercase 'users'
        const insertUserResult = await pool.query(insertUserQuery, [username, hashedPassword, email]);

        // Access the inserted ID from results.rows[0].id
        res.status(201).json({ message: 'User registered successfully!', userId: insertUserResult.rows[0].id });

    } catch (error) {
        console.error('Error during registration:', error);
        // Specific error code for unique constraint violation in PostgreSQL (23505)
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Username or Email already exists.' });
        }
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
        const selectUserQuery = 'SELECT id, username, password, is_admin FROM users WHERE username = $1'; // Using lowercase 'users'
        const usersResult = await pool.query(selectUserQuery, [username]);

        if (usersResult.rows.length === 0) { // Access results.rows
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const user = usersResult.rows[0]; // Access results.rows[0]
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
app.post('/api/missing-persons', async (req, res) => {
    const { name, dob, category, last_known_location, contact_info, description } = req.body;
    const imageUrl = null; // Image uploads are disabled for Vercel deployment

    if (!name || !category || !last_known_location || !contact_info) {
        return res.status(400).json({ message: 'Missing required fields: name, category, last_known_location, contact_info.' });
    }

    try {
        const pool = await getDbConnection(); // Get the connection pool
        const query = `
            INSERT INTO missing_persons (name, dob, category, last_known_location, contact_info, description, image_url, reported_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id
        `; // Using lowercase 'missing_persons'
        const result = await pool.query(query, [name, dob || null, category, last_known_location, contact_info, description || null, imageUrl]);

        res.status(201).json({ message: 'Missing person reported successfully!', id: result.rows[0].id, imageUrl: imageUrl }); // Access id from rows[0].id
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
        // Use TO_CHAR for date formatting in PostgreSQL
        const sql = 'SELECT id, name, dob, category, last_known_location, contact_info, description, image_url, status, TO_CHAR(reported_at, \'YYYY-MM-DD HH24:MI:SS\') AS reported_at_formatted FROM missing_persons ORDER BY reported_at DESC'; // Using lowercase 'missing_persons'
        const result = await pool.query(sql); // Use pool.query
        res.status(200).json(result.rows); // Access results.rows
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
            FROM missing_persons
            WHERE (name ILIKE $1 OR description ILIKE $2 OR last_known_location ILIKE $3)
        `; // Using lowercase 'missing_persons'
        const params = [`%${queryTerm}%`, `%${queryTerm}%`, `%${queryTerm}%`]; // Parameters for LIKE queries

        // Add category filter if provided and not 'all'
        if (categoryFilter && categoryFilter !== 'all') {
            sql += ` AND category = $4`; // Use $4 for new parameter
            params.push(categoryFilter);
        }

        sql += ` ORDER BY reported_at DESC`; // Order by most recently reported

        const result = await pool.query(sql, params); // Use pool.query
        res.status(200).json({ results: result.rows }); // Access results.rows
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
            FROM missing_persons
            WHERE status = 'found'
            ORDER BY reported_at DESC
            LIMIT 5;
        `; // Using lowercase 'missing_persons'
        const result = await pool.query(query); // Use pool.query
        res.status(200).json({ stories: result.rows }); // Access results.rows
    } catch (error) {
        console.error('Error fetching success stories:', error);
        res.status(500).json({ message: 'Server error while fetching stories.', error: error.message });
    }
});

// API Endpoint to Get All Volunteers (Admin Protected)
app.get('/api/volunteers', isAdmin, async (req, res) => {
    try {
        const pool = await getDbConnection();
        const query = `SELECT id, name, email, phone, skills, availability, message, registered_at FROM volunteers ORDER BY registered_at DESC`; // Using lowercase 'volunteers'
        const result = await pool.query(query); // Use pool.query
        res.status(200).json(result.rows); // Access results.rows
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
        const updateQuery = 'UPDATE missing_persons SET status = $1 WHERE id = $2'; // Using lowercase 'missing_persons'
        const result = await pool.query(updateQuery, ['found', personId]); // Use pool.query

        if (result.rowCount === 0) { // Check rowCount for affected rows
            return res.status(404).json({ message: 'Missing person not found.' });
        }

        res.status(200).json({ message: `Missing person with ID ${personId} marked as found.` });

    } catch (error) {
        console.error('Error marking missing person as found:', error);
        res.status(500).json({ message: 'Server error marking person as found.', error: error.message });
    }
});

// API Endpoint to Update Missing Person's Photo (Admin Protected) - Image upload disabled for Vercel
app.patch('/api/missing-persons/:id/image', isAdmin, async (req, res) => {
    const personId = req.params.id;
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
        const updateQuery = `
            UPDATE missing_persons
            SET name = $1, dob = $2, category = $3, last_known_location = $4, contact_info = $5, description = $6
            WHERE id = $7
        `; // Using lowercase 'missing_persons'
        const result = await pool.query(updateQuery, [name, dob || null, category, last_known_location, contact_info, description || null, personId]); // Use pool.query

        if (result.rowCount === 0) { // Check rowCount
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
    let client; // Declare client for finally block for transactions

    try {
        const pool = await getDbConnection(); // Get the connection pool
        client = await pool.connect(); // Get a client for transaction
        await client.query('BEGIN'); // Start a transaction

        // 1. Get the image URL (if needed, but we won't delete the file on Vercel)
        const selectQuery = 'SELECT image_url FROM missing_persons WHERE id = $1'; // Using lowercase 'missing_persons'
        const personsResult = await client.query(selectQuery, [personId]); // Use client.query

        if (personsResult.rows.length === 0) { // Access rows.length
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Missing person not found.' });
        }

        // 2. Delete the record from the database
        const deleteQuery = 'DELETE FROM missing_persons WHERE id = $1'; // Using lowercase 'missing_persons'
        const deleteResult = await client.query(deleteQuery, [personId]); // Use client.query

        if (deleteResult.rowCount === 0) { // Check rowCount
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Missing person not found or already deleted.' });
        }

        console.warn('Image file deletion functionality is disabled for Vercel serverless functions.');

        await client.query('COMMIT'); // Commit the transaction
        res.status(200).json({ message: `Missing person ID ${personId} deleted successfully (image file not deleted from server).` });

    } catch (error) {
        if (client) { // Check if client was successfully obtained
            await client.query('ROLLBACK'); // Rollback on error
        }
        console.error('Error deleting missing person:', error);
        res.status(500).json({ message: 'Server error deleting missing person.', error: error.message });
    } finally {
        if (client) {
            client.release(); // Always release the client back to the pool
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
            INSERT INTO volunteers (name, email, phone, skills, availability, message)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `; // Using lowercase 'volunteers'
        const result = await pool.query(query, [name, email, phone || null, skills, availability, message || null]); // Use pool.query

        res.status(201).json({ message: 'Volunteer registered successfully!', volunteerId: result.rows[0].id }); // Access id from rows[0].id

    } catch (error) {
        console.error('Error during volunteer registration:', error);
        res.status(500).json({ message: 'Server error during volunteer registration.', error: error.message });
    }
});

// --- FINAL EXPORT FOR VERCEL ---
module.exports = app;