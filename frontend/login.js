// frontend/js/login.js (UPDATED CONTENT for Vercel deployment)

document.addEventListener('DOMContentLoaded', () => {
    // Define your backend base URL for API calls.
    //
    // IMPORTANT:
    // When deploying to Vercel, this MUST be your Vercel backend URL.
    // Example: 'https://your-vercel-project-name.vercel.app'
    //
    // For local development, you would use: 'http://localhost:3000'
    // (Assuming your Node.js backend runs on port 3000 locally)
    //
    // You could dynamically set this based on window.location.hostname for more advanced setups,
    // or use environment variables during your build process if you have one (e.g., using Webpack, Vite).
    //
    // For now, MANUALLY CHANGE THIS when deploying vs. developing locally.
    const BASE_URL = 'https://the-broken-weave.vercel.app/'; // <--- **** CHANGE THIS ****
                                                      // e.g., 'https://my-missing-person-app.vercel.app'
                                                      // DO NOT USE 'http://localhost:3000' for deployed frontend!

    const loginForm = document.getElementById('loginForm');
    const loginMessage = document.getElementById('loginMessage'); // Assuming you have an element for messages

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const username = loginForm.username.value;
            const password = loginForm.password.value;

            // Clear previous messages
            if (loginMessage) {
                loginMessage.textContent = '';
                loginMessage.style.color = 'black';
            }

            console.log('Frontend: Login button clicked.');
            console.log('Frontend: Attempting login with username:', username);
            const loginApiUrl = `${BASE_URL}/api/login`; // Ensure this matches your Vercel route for API
            console.log('Frontend: Sending request to URL:', loginApiUrl);
            console.log('Frontend: Request body being sent:', JSON.stringify({ username, password }));


            try {
                const response = await fetch(loginApiUrl, { // <-- Using BASE_URL
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                console.log('Frontend: Received response. Status:', response.status);
                console.log('Frontend: Is response OK (2xx status)?', response.ok);

                // --- CRITICAL CHANGE STARTS HERE (Robust Error Handling) ---
                // If response is NOT ok (e.g., 400, 401, 404, 500)
                if (!response.ok) {
                    let errorData;
                    try {
                        // Try to parse the error response as JSON first
                        errorData = await response.json();
                        console.error('Frontend: Login failed. Server JSON error data:', errorData);
                    } catch (e) {
                        // If it's not valid JSON, get the raw text
                        const errorText = await response.text();
                        errorData = { message: errorText || `Login failed. HTTP status: ${response.status}` };
                        console.error('Frontend: Login failed. Server raw text error:', errorData);
                    }

                    if (loginMessage) {
                        loginMessage.textContent = errorData.message || `Login failed. Status: ${response.status}.`;
                        loginMessage.style.color = 'red';
                    }
                    return; // Stop execution if response is not OK
                }
                // --- CRITICAL CHANGE ENDS HERE ---


                // If response IS ok (status 200), then proceed to parse as JSON
                const data = await response.json();

                console.log('Frontend: Login successful! Data:', data);

                if (loginMessage) {
                    loginMessage.textContent = data.message || 'Login successful!';
                    loginMessage.style.color = 'green';
                }

                // Store user info if needed (e.g., for admin check)
                localStorage.setItem('user', JSON.stringify(data.user)); // Ensure your backend sends `data.user`

                // Redirect to homepage or dashboard after a short delay
                setTimeout(() => {
                    window.location.href = 'index.html'; // Redirect to your homepage
                }, 1500); // Redirect after 1.5 seconds

            } catch (error) {
                console.error('Error during login fetch:', error);
                // This 'catch' is now primarily for network issues or issues with the fetch call itself
                if (loginMessage) {
                    loginMessage.textContent = 'Could not connect to the server or an unexpected network error occurred. Please check your network and try again later.';
                    loginMessage.style.color = 'red';
                }
            }
        });
    } else {
        console.error('Login form element not found!');
    }
});