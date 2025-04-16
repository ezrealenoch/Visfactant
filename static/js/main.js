/**
 * Main application code
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize graph
    const graph = new SbomGraph('#graph-container');
    
    // Track loaded SBOMs
    const loadedSboms = new Map(); // Map of SBOM ID -> {name, nodes, links}
    
    // Handle file upload
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('sbom-file');
    const sbomNameInput = document.getElementById('sbom-name');
    const uploadStatus = document.getElementById('upload-status');
    
    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const file = fileInput.files[0];
        if (!file) {
            uploadStatus.innerHTML = '<div class="alert alert-warning">Please select a file</div>';
            return;
        }
        
        let sbomName = sbomNameInput.value.trim();
        if (!sbomName) {
            sbomName = file.name;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sbom_name', sbomName);
        
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
                uploadStatus.innerHTML = `<div class="alert alert-success">Success! Added ${data.nodes} nodes and ${data.links} links from ${data.sbom_name}.</div>`;
                
                // Store SBOM info
                loadedSboms.set(data.sbom_id, {
                    id: data.sbom_id,
                    name: data.sbom_name,
                    nodes: data.nodes,
                    links: data.links
                });
                
                // Update SBOM list in UI
                updateSbomList();
                
                // Refresh graph
                fetchGraphData();
                
                // Clear form
                fileInput.value = '';
                sbomNameInput.value = '';
            }
        })
        .catch(error => {
            uploadStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        });
    });
    
    // Handle SBOM list interactions
    function updateSbomList() {
        const sbomList = document.getElementById('sbom-list');
        const noSbomsMessage = document.getElementById('no-sboms-message');
        
        if (loadedSboms.size === 0) {
            noSbomsMessage.style.display = 'block';
            sbomList.innerHTML = '<div class="text-muted" id="no-sboms-message">No SBOMs loaded yet</div>';
            return;
        }
        
        noSbomsMessage.style.display = 'none';
        
        // Clear current list
        while (sbomList.firstChild) {
            sbomList.removeChild(sbomList.firstChild);
        }
        
        // Add each SBOM as an item in the list
        loadedSboms.forEach(sbom => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input sbom-visibility" 
                               id="sbom-check-${sbom.id}" data-sbom-id="${sbom.id}" checked>
                        <label class="custom-control-label" for="sbom-check-${sbom.id}">
                            ${sbom.name}
                        </label>
                    </div>
                    <small class="text-muted d-block">
                        ${sbom.nodes} nodes, ${sbom.links} links
                    </small>
                </div>
                <button class="btn btn-sm btn-outline-danger delete-sbom" data-sbom-id="${sbom.id}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            sbomList.appendChild(item);
            
            // Add event listener for the checkbox
            const checkbox = item.querySelector(`#sbom-check-${sbom.id}`);
            checkbox.addEventListener('change', function() {
                graph.toggleSbomVisibility(sbom.id, this.checked);
            });
            
            // Add event listener for the delete button
            const deleteBtn = item.querySelector('.delete-sbom');
            deleteBtn.addEventListener('click', function() {
                deleteSbom(sbom.id);
            });
        });
    }
    
    // Delete an SBOM
    function deleteSbom(sbomId) {
        fetch(`/sbom/${sbomId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadedSboms.delete(sbomId);
                updateSbomList();
                fetchGraphData();
                uploadStatus.innerHTML = '<div class="alert alert-success">SBOM removed from visualization</div>';
            } else {
                uploadStatus.innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
            }
        })
        .catch(error => {
            uploadStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        });
    }
    
    // Reset zoom button
    document.getElementById('reset-zoom').addEventListener('click', function() {
        graph.resetZoom();
    });
    
    // Node size selector
    document.getElementById('node-size-select').addEventListener('change', function() {
        graph.setNodeSizeBy(this.value);
    });
    
    // Highlight common components checkbox
    document.getElementById('highlight-common').addEventListener('change', function() {
        graph.setHighlightCommon(this.checked);
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
    
    // Fetch and update loaded SBOMs
    function fetchSbomList() {
        fetch('/sboms')
            .then(response => response.json())
            .then(sboms => {
                loadedSboms.clear();
                sboms.forEach(sbom => {
                    loadedSboms.set(sbom.id, sbom);
                });
                updateSbomList();
            })
            .catch(error => {
                console.error('Error fetching SBOM list:', error);
            });
    }
    
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
    fetchSbomList();
    fetchGraphData();
    
    // Handle window resize
    window.addEventListener('resize', function() {
        // Update graph dimensions if needed
        graph.width = graph.container.node().getBoundingClientRect().width;
        graph.height = graph.container.node().getBoundingClientRect().height;
        graph.update();
    });
}); 