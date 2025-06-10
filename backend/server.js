require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken for JWTs

const app = express();

// --- Middleware ---
// Enable CORS for all routes, allowing your frontend to make requests
app.use(cors());
// Parse JSON bodies for incoming requests
app.use(express.json());

// --- Supabase Client Setup ---
// Load Supabase URL and Key from environment variables for security
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// --- JWT Secret ---
// CRITICAL: Ensure JWT_SECRET is set in your .env file in development
// and configured securely in your Vercel environment variables for production!
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
    // In a production environment, you might want to exit the process
    // process.exit(1);
    // For development, you might just log an error or use a placeholder, but this is highly insecure.
}

// --- Middleware for JWT Authentication ---
// Verifies the token sent by the client for protected routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Expected format: "Bearer YOUR_TOKEN"
    const token = authHeader && authHeader.split(' ')[1]; 

    if (token == null) {
        return res.status(401).json({ message: 'Authentication token required.' }); // No token provided
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err.message); // Log the specific JWT error
            // Token is invalid (e.g., malformed, expired, wrong signature)
            return res.status(403).json({ message: 'Invalid or expired token.' }); 
        }
        // Attach the decoded user payload (from the token) to the request object
        req.user = user; 
        next(); // Proceed to the next middleware/route handler
    });
};

// --- Middleware for Admin Protection ---
// Uses the user information attached by authenticateToken to check for admin status
const isAdmin = (req, res, next) => {
    // Check if req.user exists (meaning authenticateToken ran successfully) and if isAdmin is true
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }
    next(); // User is an admin, proceed
};

// --- API Routes ---

// **Health Check**
// A simple GET endpoint to check if the backend server is running
app.get('/api/health', async (req, res) => {
    try {
        res.status(200).json({ status: 'ok', message: 'Backend is running!' });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ status: 'error', message: 'Backend unhealthy.', error: error.message });
    }
});

// **User Registration**
// Handles new user account creation
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    // Validate required fields
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Required fields (username, email, password) are missing.' });
    }

    try {
        // Check if username or email already exists in the USERS table
        const { data: existingUsers, error: fetchError } = await supabase
            .from('USERS')
            .select('id')
            .or(`username.eq.${username},email.eq.${email}`); // Check if either username or email matches

        if (fetchError) {
            console.error('Supabase fetch error during registration check:', fetchError);
            return res.status(500).json({ message: 'Server error checking existing users.', error: fetchError.message });
        }

        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'Username or Email already exists.' }); // 409 Conflict
        }

        // Hash the password before storing it for security
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into the USERS table
        const { data, error: insertError } = await supabase
            .from('USERS')
            .insert([{ username, email, password: hashedPassword, is_admin: false }]) // Default new users to not admin
            .select('id'); // Return the ID of the newly created user

        if (insertError) {
            console.error('Supabase insert error during registration:', insertError);
            return res.status(500).json({ message: 'Server error during user registration.', error: insertError.message });
        }
        if (!data || data.length === 0) {
            return res.status(500).json({ message: 'User registration failed, no data returned from Supabase.' });
        }

        res.status(201).json({ message: 'User registered successfully!', userId: data[0].id });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    }
});

// **User Login**
// Handles user authentication and issues a JWT upon successful login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    // Validate required fields
    if (!username || !password) {
        return res.status(400).json({ message: 'Required fields (username, password) are missing.' });
    }

    try {
        // Fetch the user by username from the USERS table
        const { data: users, error: fetchError } = await supabase
            .from('USERS')
            .select('id, username, password, is_admin')
            .eq('username', username)
            .limit(1); // Limit to 1 as username should be unique

        if (fetchError) {
            console.error('Supabase fetch error during login:', fetchError);
            return res.status(500).json({ message: 'Server error during login.', error: fetchError.message });
        }

        // Check if user exists
        if (!users || users.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password.' }); // 401 Unauthorized
        }

        const user = users[0];
        // Compare the provided password with the hashed password in the database
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid username or password.' }); // 401 Unauthorized
        }

        // Generate a JWT upon successful login
        const token = jwt.sign(
            { id: user.id, username: user.username, isAdmin: user.is_admin }, // Payload for the token
            jwtSecret, // Your secret key from .env
            { expiresIn: '1h' } // Token expires in 1 hour (adjust as needed)
        );

        // Remove the hashed password from the user object before sending it to the client for security
        const { password: userPassword, ...userWithoutPassword } = user;

        res.status(200).json({ message: 'Login successful!', user: userWithoutPassword, token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    }
});

// **Fetch All Users (Admin Only)**
// Retrieves all users from the USERS table (requires admin privileges via JWT)
// The order of middleware matters: authenticateToken first, then isAdmin
app.get('/api/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('USERS')
            .select('id, username, email, is_admin'); // Select specific fields

        if (error) {
            console.error('Supabase fetch error fetching users:', error);
            return res.status(500).json({ message: 'Error fetching users.', error: error.message });
        }
        // Correctly check for no users found (Supabase returns an empty array)
        if (data.length === 0) {
            return res.status(404).json({ message: 'No users found.' });
        }

        res.status(200).json({ count: data.length, users: data });
    } catch (error) {
        console.error('Fetching users error:', error);
        res.status(500).json({ message: 'Error fetching users.', error: error.message });
    }
});

// **Fetch All Volunteers**
// Retrieves all volunteers from the VOLUNTEERS table
// This endpoint currently does NOT require authentication.
app.get('/api/volunteers', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('VOLUNTEERS')
            .select('*') // Select all columns
            .order('joined_at', { ascending: false }); // Order by join date, newest first

        if (error) {
            console.error('Supabase fetch error fetching volunteers:', error);
            return res.status(500).json({ message: 'Error fetching volunteers.', error: error.message });
        }
        // Correctly check for no volunteers found
        if (data.length === 0) {
            return res.status(404).json({ message: 'No volunteers found.' });
        }

        res.status(200).json({ count: data.length, volunteers: data });
    } catch (error) {
        console.error('Fetching error:', error);
        res.status(500).json({ message: 'Error fetching volunteers.', error: error.message });
    }
});

// **Report a Missing Person**
// Handles the submission of a new missing person report
// You might want to add `authenticateToken` here if only logged-in users can report.
app.post('/api/report-missing', async (req, res) => {
    const { name, age, last_seen_location, contact_info, description } = req.body;

    // Basic validation for required fields
    if (!name || !last_seen_location || !contact_info || !description) {
        return res.status(400).json({ message: 'Required fields (name, last_seen_location, contact_info, description) are missing.' });
    }

    try {
        // Insert the new missing person record into the MISSING_PERSONS table
        const { data, error } = await supabase
            .from('MISSING_PERSONS')
            .insert([
                {
                    name,
                    age: age || null, // Age is optional; if not provided, store as null
                    last_seen_location,
                    contact_info,
                    description,
                    reported_at: new Date().toISOString() // Automatically set the current time
                }
            ])
            .select('*'); // Return the inserted row data

        if (error) {
            console.error('Supabase insert error reporting missing person:', error);
            return res.status(500).json({ message: 'Error reporting missing person.', error: error.message });
        }
        if (!data || data.length === 0) {
            return res.status(500).json({ message: 'Missing person report failed, no data returned from Supabase.' });
        }

        res.status(201).json({ message: 'Missing person reported successfully!', missingPerson: data[0] });
    } catch (error) {
        console.error('Reporting missing person error:', error);
        res.status(500).json({ message: 'Server error when reporting missing person.', error: error.message });
    }
});

// **Fetch All Missing Persons**
// Retrieves all reported missing persons from the MISSING_PERSONS table
// This endpoint currently does NOT require authentication.
app.get('/api/missing-persons', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('MISSING_PERSONS')
            .select('*') // Select all columns
            .order('reported_at', { ascending: false }); // Order by reported date, newest first

        if (error) {
            console.error('Supabase fetch error fetching missing persons:', error);
            return res.status(500).json({ message: 'Error fetching missing persons.', error: error.message });
        }
        // Correctly check for no missing persons found
        if (data.length === 0) {
            return res.status(404).json({ message: 'No missing persons found.' });
        }

        res.status(200).json({ count: data.length, missingPersons: data });
    } catch (error) {
        console.error('Fetching error:', error);
        res.status(500).json({ message: 'Error fetching missing persons.', error: error.message });
    }
});

// **Server Startup**
// Define the port to listen on, defaulting to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});