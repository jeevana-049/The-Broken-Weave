document.addEventListener('DOMContentLoaded', () => {
    const resolveForm = document.getElementById('resolveForm');
    const personIdInput = document.getElementById('personId');
    const resolveMessage = document.getElementById('resolveMessage');

    if (resolveForm) {
        resolveForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const personId = personIdInput.value; // Get the ID from the input

            if (!personId) {
                resolveMessage.textContent = 'Please enter a Missing Person ID.';
                resolveMessage.style.color = 'red';
                return;
            }

            resolveMessage.textContent = 'Marking as found...';
            resolveMessage.style.color = '#007bff'; // Blue for pending

            try {
                const response = await fetch(`http://localhost:3000/api/missing-persons/${personId}/found`, {
                    method: 'PATCH', // Use PATCH method for updating status
                    headers: {
                        'Content-Type': 'application/json'
                        // No body needed for this specific endpoint as ID is in URL and status is fixed
                    }
                });

                const data = await response.json(); // Parse the JSON response from the backend

                if (response.ok) { // Check if the response status is 200-299
                    resolveMessage.textContent = data.message || `Missing person ID ${personId} marked as found!`;
                    resolveMessage.style.color = 'green';
                    personIdInput.value = ''; // Clear the input field
                    console.log('Successfully marked as found:', data);

                    // IMPORTANT: After marking found, you'd typically redirect or give further instructions.
                    // For now, you can go back to index.html to see the change.

                } else {
                    // Handle errors (e.g., 404 not found, 500 server error)
                    resolveMessage.textContent = data.message || 'Failed to mark as found. Please try again.';
                    resolveMessage.style.color = 'red';
                    console.error('Error marking as found:', data);
                }
            } catch (error) {
                // Handle network errors or issues connecting to the backend
                resolveMessage.textContent = 'Network error or server unavailable.';
                resolveMessage.style.color = 'red';
                console.error('Error during fetch to mark as found:', error);
            }
        });
    }
});