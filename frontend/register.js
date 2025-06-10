document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');

    // Your Vercel backend base URL
    const backendBaseUrl = 'https://the-broken-weave.vercel.app'; 

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Client-side validation: Check if email is provided
            if (!email) {
                registerMessage.style.color = 'red';
                registerMessage.textContent = 'Email address is required.';
                return;
            }

            // Client-side validation: Check if passwords match
            if (password !== confirmPassword) {
                registerMessage.style.color = 'red';
                registerMessage.textContent = 'Passwords do not match.';
                return; // Stop the function here
            }

            registerMessage.textContent = 'Registering...'; // Provide immediate feedback
            registerMessage.className = 'message'; // Reset class for styling

            try {
                // The fetch call now correctly targets your Vercel backend's /api/register endpoint
                const response = await fetch(`${backendBaseUrl}/api/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, email, password })
                });

                // Check if response is OK (status 2xx) before trying to parse JSON
                if (!response.ok) {
                    // If response is not OK, try to parse JSON for error message, but handle non-JSON too
                    const errorData = await response.json().catch(() => ({ message: `Server error: ${response.status} ${response.statusText}` }));
                    throw new Error(errorData.message || 'Registration failed with an unknown error.');
                }

                const data = await response.json(); // Parse the JSON response from the backend

                registerMessage.style.color = 'green';
                registerMessage.textContent = data.message || 'Registration successful! You can now log in.';
                registerMessage.classList.add('success');
                console.log('Registration successful:', data);

                // Optionally, clear the form or redirect to login page
                registerForm.reset();
                // setTimeout(() => {
                //     window.location.href = 'login.html';
                // }, 2000); // Redirect after 2 seconds

            } catch (error) {
                // Handle network errors or issues connecting to the backend, or specific backend errors
                registerMessage.style.color = 'red';
                // Display the specific error message if available, otherwise a generic one
                registerMessage.textContent = error.message || 'Network error or server unavailable.';
                registerMessage.classList.add('error');
                console.error('Error during registration fetch:', error);
            }
        });
    }
});