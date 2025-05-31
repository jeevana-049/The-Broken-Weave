document.addEventListener('DOMContentLoaded', () => {
    const reportMissingForm = document.getElementById('reportMissingForm');
    const reportMessage = document.getElementById('reportMessage');

    reportMissingForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent default form submission

        // Get form data
        const name = document.getElementById('name').value.trim();
        const dob = document.getElementById('dob').value; // Date of Birth is optional, no trim needed
        const category = document.getElementById('category').value; // Get the selected category
        const last_known_location = document.getElementById('last_known_location').value.trim();
        const contact_info = document.getElementById('contact_info').value.trim();
        const description = document.getElementById('description').value.trim();

        // Basic client-side validation (can be expanded)
        if (!name || !category || !last_known_location || !contact_info) {
            reportMessage.textContent = 'Please fill in all required fields (Name, Category, Last Known Location, Contact Info).';
            reportMessage.classList.add('error');
            reportMessage.classList.remove('success');
            return;
        }

        // Prepare data for the backend
       const formData = {
            name,
            dob: dob || null,
            category,
            last_known_location, // Make sure this matches the variable name
            contact_info,        // Make sure this matches the variable name
            description
        };
        reportMessage.textContent = 'Submitting report...';
        reportMessage.classList.remove('success', 'error');

        try {
            const response = await fetch('http://localhost:3000/api/missing-persons', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (response.ok) {
                reportMessage.textContent = data.message;
                reportMessage.classList.add('success');
                reportMissingForm.reset(); // Clear the form on success
            } else {
                reportMessage.textContent = data.message || 'Failed to report missing person.';
                reportMessage.classList.add('error');
            }
        } catch (error) {
            console.error('Error reporting missing person:', error);
            reportMessage.textContent = 'Network error. Could not connect to the server.';
            reportMessage.classList.add('error');
        }
    });
});