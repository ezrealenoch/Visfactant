/**
 * Main application code
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize graph
    const graph = new SbomGraph('#graph-container');
    
    // Handle file upload
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('sbom-file');
    const uploadStatus = document.getElementById('upload-status');
    
    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const file = fileInput.files[0];
        if (!file) {
            uploadStatus.innerHTML = '<div class="alert alert-warning">Please select a file</div>';
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        uploadStatus.innerHTML = '<div class="alert alert-info">Uploading and processing...</div>';
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                uploadStatus.innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
            } else {
                uploadStatus.innerHTML = `<div class="alert alert-success">Success! Loaded ${data.nodes} nodes and ${data.links} links.</div>`;
                fetchGraphData();
            }
        })
        .catch(error => {
            uploadStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        });
    });
    
    // Reset zoom button
    document.getElementById('reset-zoom').addEventListener('click', function() {
        graph.resetZoom();
    });
    
    // Node size selector
    document.getElementById('node-size-select').addEventListener('change', function() {
        graph.setNodeSizeBy(this.value);
    });
    
    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        const matchCount = graph.searchNode(searchTerm);
        
        if (searchTerm && matchCount === 0) {
            this.classList.add('is-invalid');
        } else {
            this.classList.remove('is-invalid');
        }
    });
    
    // Filter by type
    document.getElementById('show-software').addEventListener('change', function() {
        graph.filterByType(this.checked);
    });
    
    function fetchGraphData() {
        fetch('/graph')
            .then(response => response.json())
            .then(data => {
                graph.updateData(data);
            })
            .catch(error => {
                console.error('Error fetching graph data:', error);
            });
    }
    
    // Check if there's already graph data available
    fetchGraphData();
    
    // Handle window resize
    window.addEventListener('resize', function() {
        // Update graph dimensions if needed
        graph.width = graph.container.node().getBoundingClientRect().width;
        graph.height = graph.container.node().getBoundingClientRect().height;
        graph.update();
    });
}); 