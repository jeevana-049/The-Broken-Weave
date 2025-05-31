document.addEventListener('DOMContentLoaded', async () => {
    const childrenList = document.getElementById('childrenList');
    const noChildrenMessage = document.getElementById('noChildrenMessage');

    // Define your backend base URL for API calls.
    // Ensure '5500' matches the port your server.js is listening on.
    const BASE_URL = 'http://localhost:5500'; // <-- CORRECTED BASE_URL TO MATCH YOUR SERVER'S PORT

    // Function to fetch and display missing children
    async function fetchMissingChildren() {
        try {
            // Fetch data from your backend, using the correct BASE_URL and port
            const response = await fetch(`${BASE_URL}/api/missing-persons/search?category=child`); // <-- MODIFIED THIS LINE
            const data = await response.json();

            if (response.ok && data.results.length > 0) {
                childrenList.innerHTML = ''; // Clear previous content
                noChildrenMessage.style.display = 'none'; // Hide no results message

                data.results.forEach(person => {
                    const listItem = document.createElement('li');
                    listItem.classList.add('category-item'); // Apply styling from CSS

                    listItem.innerHTML = `
                        <h3>${person.name}</h3>
                        <p><strong>Date of Birth:</strong> ${person.dob ? new Date(person.dob).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Last Known Location:</strong> ${person.last_known_location}</p>
                        <p><strong>Contact Info:</strong> ${person.contact_info}</p>
                        <p><strong>Description:</strong> ${person.description || 'N/A'}</p>
                        <p><strong>Reported At:</strong> ${new Date(person.reported_at).toLocaleString()}</p>
                        <p><strong>Status:</strong> <span style="font-weight: bold; color: ${person.status === 'found' ? 'green' : 'orange'};">${person.status.toUpperCase()}</span></p>
                    `;
                    childrenList.appendChild(listItem);
                });
            } else {
                childrenList.innerHTML = ''; // Ensure list is empty
                noChildrenMessage.style.display = 'block'; // Show no results message
            }
        } catch (error) {
            console.error('Error fetching missing children:', error);
            childrenList.innerHTML = '<li class="error-message">Failed to load missing children reports. Please try again later.</li>';
            noChildrenMessage.style.display = 'none';
        }
    }

    // Call the function to fetch and display data when the page loads
    fetchMissingChildren();
});