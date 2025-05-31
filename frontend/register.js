document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value; // Email is optional
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Client-side validation: Check if passwords match
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
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, email, password }) // Send email as well
                });

                const data = await response.json(); // Parse the JSON response from the backend

                if (response.ok) { // Check if the response status is 200-299
                    registerMessage.style.color = 'green';
                    registerMessage.textContent = data.message || 'Registration successful! You can now log in.';
                    registerMessage.classList.add('success');
                    console.log('Registration successful:', data);

                    // Optionally, clear the form or redirect to login page
                    registerForm.reset();
                    // setTimeout(() => {
                    //     window.location.href = 'login.html';
                    // }, 2000); // Redirect after 2 seconds
                } else {
                    // Handle errors (e.g., 400 Bad Request, 409 Username exists, 500 Server error)
                    registerMessage.style.color = 'red';
                    registerMessage.textContent = data.message || 'Registration failed. Please try again.';
                    registerMessage.classList.add('error');
                    console.error('Registration failed:', data);
                }
            } catch (error) {
                // Handle network errors or issues connecting to the backend
                registerMessage.style.color = 'red';
                registerMessage.textContent = 'Network error or server unavailable.';
                registerMessage.classList.add('error');
                console.error('Error during registration fetch:', error);
            }
        });
    }
});