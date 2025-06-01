// frontend/js/script.js (COMPLETE AND UPDATED CODE - storiesContainer ID fixed)

document.addEventListener('DOMContentLoaded', async () => {
    // Define your backend base URL for API calls.
    // Ensure '5500' matches the port your server.js is listening on.
    const BASE_URL = window.location.origin; // <--- VERIFIED: This is correct now!

    // --- Search Functionality ---
    const searchForm = document.getElementById('searchForm');
    const searchQueryInput = document.getElementById('searchQuery');
    const searchResultsDiv = document.getElementById('searchResults');
    const categoryFilter = document.getElementById('categoryFilter'); // Get the category filter element

    if (searchForm) { // Check if the search form exists on the page
        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default browser form submission

            const query = searchQueryInput.value.trim(); // Get search term and remove leading/trailing spaces
            const selectedCategory = categoryFilter ? categoryFilter.value : ''; // Get category filter value if element exists

            if (!query && !selectedCategory) {
                searchResultsDiv.innerHTML = '<p class="no-results">Please enter a search term or select a category.</p>';
                return; // Stop if both query and category are empty
            }

            // Provide immediate feedback to the user
            searchResultsDiv.innerHTML = '<h3>Search Results</h3><p class="no-results">Searching...</p>';

            try {
                // Construct the URL with both query and category parameters
                let url = `${BASE_URL}/api/missing-persons/search?q=${encodeURIComponent(query)}`; // <-- CORRECTED URL
                if (selectedCategory && selectedCategory !== 'all') { // Only add category if it's not empty and not 'all'
                    url += `&category=${encodeURIComponent(selectedCategory)}`;
                }

                const response = await fetch(url); // Send the search query to your backend API

                const data = await response.json(); // Parse the JSON response from the backend

                if (response.ok) { // Check if the HTTP status code is 2xx (success)
                    displaySearchResults(data.results); // Call function to render the results
                } else {
                    // Handle errors from the backend (e.g., 400, 500 status codes)
                    searchResultsDiv.innerHTML = `<p class="no-results error">Error: ${data.message || 'Failed to fetch search results.'}</p>`;
                    console.error('Search failed:', data);
                }
            } catch (error) {
                // Handle network errors (e.g., server not running, connection issue)
                searchResultsDiv.innerHTML = '<p class="no-results error">Network error. Could not connect to the server.</p>';
                console.error('Error during search fetch:', error);
            }
        });
    }

    // Function to dynamically display the search results in the searchResultsDiv
    function displaySearchResults(results) {
        searchResultsDiv.innerHTML = '<h3>Search Results</h3>'; // Clear previous content and add heading

        if (results && results.length > 0) {
            results.forEach(person => {
                const resultItem = document.createElement('div');
                resultItem.classList.add('result-item'); // Add CSS class for styling
                resultItem.innerHTML = `
                    <h4>${person.name}</h4>
                    <p><strong>Last Known Location:</strong> ${person.last_known_location}</p>
                    <p><strong>Date of Birth:</strong> ${person.dob ? new Date(person.dob).toLocaleDateString() : 'N/A'}</p>
                    <p><strong>Contact Info:</strong> ${person.contact_info}</p>
                    ${person.image_url ? `<img src="${BASE_URL}${person.image_url}" alt="${person.name}" class="result-image">` : ''}
                    <p><strong>Description:</strong> ${person.description || 'No additional description.'}</p>
                    <p style="font-size:0.8em; color:#999;"><em>Reported on: ${new Date(person.reported_at).toLocaleDateString()}</em></p>
                `;
                searchResultsDiv.appendChild(resultItem); // Add the result item to the results container
            });
        } else {
            // Display a message if no results are found
            searchResultsDiv.innerHTML = '<p class="no-results">No missing persons found matching your query.</p>';
        }
    }

    // --- Success Stories Functionality ---
    // CORRECTED: Using 'storiesContainer' to match your index.html
    const storiesContainer = document.getElementById('storiesContainer'); 

    // Function to fetch and display success stories
    async function fetchAndDisplaySuccessStories() {
        if (!storiesContainer) { // Check for the correct ID
            console.warn('storiesContainer element not found. Skipping success stories display.');
            return;
        }

        try {
            const response = await fetch(`${BASE_URL}/api/success-stories`); // <-- CORRECTED URL using BASE_URL
            const data = await response.json();

            if (response.ok) {
                renderStories(data.stories);
            } else {
                storiesContainer.innerHTML = '<p class="no-stories error">Failed to load stories: ' + (data.message || 'Server error') + '</p>';
                console.error('Error fetching success stories:', data);
            }
        } catch (error) {
            storiesContainer.innerHTML = '<p class="no-stories error">Network error: Could not load stories. Server might be down.</p>';
            console.error('Network error fetching success stories:', error);
        }
    }

    // Function to render stories into the DOM
    function renderStories(stories) {
        storiesContainer.innerHTML = ''; // Clear loading message or previous content

        if (stories && stories.length > 0) {
            stories.forEach(story => {
                const storyCard = document.createElement('div');
                storyCard.classList.add('story-card');

                // Format date nicely
                const reportedDate = story.reported_at ? new Date(story.reported_at).toLocaleDateString() : 'N/A';
                const dobDate = story.dob ? new Date(story.dob).toLocaleDateString() : 'N/A';

                storyCard.innerHTML = `
                    <h3>${story.name}</h3>
                    <p><strong>Last Seen:</strong> ${story.last_known_location}</p>
                    <p><strong>DOB:</strong> ${dobDate}</p>
                    <p><strong>Contact:</strong> ${story.contact_info}</p>
                    ${story.image_url ? `<img src="${BASE_URL}${story.image_url}" alt="${story.name}" class="story-image">` : ''}
                    <p>${story.description || 'No additional description provided.'}</p>
                    <p class="story-date">Reported on: ${reportedDate}</p>
                `;
                storiesContainer.appendChild(storyCard);
            });
        } else {
            storiesContainer.innerHTML = '<p class="no-stories">No recent reports or success stories to display yet.</p>';
        }
    }

    // Call the function when the page loads (still inside DOMContentLoaded)
    fetchAndDisplaySuccessStories();
});