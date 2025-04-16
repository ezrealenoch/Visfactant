/**
 * Main application code
 */
document.addEventListener('DOMContentLoaded', function() {
    // Enable debug logging
    const DEBUG = true;
    
    // Logger function for consistent logging
    const logger = {
        debug: function(message) {
            if (DEBUG) console.debug(`[DEBUG] ${message}`);
            appendToDebugPanel(`[DEBUG] ${message}`);
        },
        info: function(message) {
            console.info(`[INFO] ${message}`);
            appendToDebugPanel(`[INFO] ${message}`);
        },
        warn: function(message) {
            console.warn(`[WARN] ${message}`);
            appendToDebugPanel(`[WARN] ${message}`);
        },
        error: function(message, error) {
            console.error(`[ERROR] ${message}`, error);
            appendToDebugPanel(`[ERROR] ${message}${error ? `: ${error.message}` : ''}`);
            
            // Show in error modal for serious errors
            if (error) {
                showErrorModal(message, error);
            }
        }
    };
    
    // Function to append messages to debug panel
    function appendToDebugPanel(message) {
        if (!DEBUG) return;
        
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            const time = new Date().toLocaleTimeString();
            const logLine = document.createElement('div');
            logLine.textContent = `${time} ${message}`;
            debugPanel.appendChild(logLine);
            
            // Auto-scroll to bottom
            debugPanel.scrollTop = debugPanel.scrollHeight;
        }
    }
    
    // Function to show error modal
    function showErrorModal(message, error) {
        const modalMessageEl = document.getElementById('error-modal-message');
        const modalStackEl = document.getElementById('error-modal-stack');
        
        if (modalMessageEl) modalMessageEl.textContent = message;
        if (modalStackEl) modalStackEl.textContent = error ? (error.stack || error.toString()) : 'No stack trace available';
        
        $('#errorModal').modal('show');
    }
    
    // Function to show graph error overlay
    function showGraphError(message) {
        const errorEl = document.getElementById('graph-error');
        const messageEl = document.getElementById('error-message');
        
        if (errorEl && messageEl) {
            messageEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }
    
    // Function to hide graph error
    function hideGraphError() {
        const errorEl = document.getElementById('graph-error');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }
    
    // Function to show/hide loading indicator
    function setLoading(isLoading) {
        const loadingEl = document.getElementById('loading-indicator');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'block' : 'none';
        }
        
        // Disable upload button during loading
        const uploadButton = document.getElementById('upload-button');
        if (uploadButton) {
            uploadButton.disabled = isLoading;
        }
    }
    
    logger.info("Initializing Visfactant application");
    
    // Initialize graph
    let graph;
    try {
        graph = new SbomGraph('#graph-container');
    } catch (error) {
        logger.error("Failed to initialize graph visualization", error);
        showGraphError("Failed to initialize graph visualization. Please check console for details.");
        return;
    }
    
    // Track loaded SBOMs
    const loadedSboms = new Map(); // Map of SBOM ID -> {name, nodes, links}
    
    // Handle file upload
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('sbom-file');
    const sbomNameInput = document.getElementById('sbom-name');
    const uploadStatus = document.getElementById('upload-status');
    
    if (!uploadForm || !fileInput || !sbomNameInput || !uploadStatus) {
        logger.error("Could not find required DOM elements for upload form");
        return;
    }
    
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
        
        logger.info(`Uploading SBOM: ${sbomName}`);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sbom_name', sbomName);
        
        uploadStatus.innerHTML = '<div class="alert alert-info">Uploading and processing...</div>';
        setLoading(true);
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                logger.error(`Upload failed: ${data.error}`);
                uploadStatus.innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
            } else {
                logger.info(`SBOM upload successful: ${data.sbom_name} (ID: ${data.sbom_id}) with ${data.nodes} nodes and ${data.links} links`);
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
            logger.error('Error during upload:', error);
            uploadStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
            showErrorModal("SBOM Upload Failed", error);
        })
        .finally(() => {
            setLoading(false);
        });
    });
    
    // Handle SBOM list interactions
    function updateSbomList() {
        logger.debug("Updating SBOM list UI");
        const sbomList = document.getElementById('sbom-list');
        
        if (!sbomList) {
            logger.error("SBOM list element not found in DOM");
            return;
        }
        
        // Clear current list
        while (sbomList.firstChild) {
            sbomList.removeChild(sbomList.firstChild);
        }
        
        // Add no SBOMs message if empty
        if (loadedSboms.size === 0) {
            logger.debug("No SBOMs loaded, showing empty message");
            const noSbomsMessage = document.createElement('div');
            noSbomsMessage.id = 'no-sboms-message';
            noSbomsMessage.className = 'text-muted';
            noSbomsMessage.innerText = 'No SBOMs loaded yet';
            sbomList.appendChild(noSbomsMessage);
            return;
        } else {
            // If there are SBOMs, ensure the no-sboms-message is removed (if it exists)
            const existingNoSbomsMessage = document.getElementById('no-sboms-message');
            if (existingNoSbomsMessage && existingNoSbomsMessage.parentNode) {
                existingNoSbomsMessage.parentNode.removeChild(existingNoSbomsMessage);
            }
        }
        
        logger.debug(`Adding ${loadedSboms.size} SBOMs to the list`);
        
        // Add each SBOM as an item in the list
        loadedSboms.forEach(sbom => {
            try {
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
                if (checkbox) {
                    checkbox.addEventListener('change', function() {
                        logger.debug(`Toggling visibility of SBOM ${sbom.id} to ${this.checked}`);
                        graph.toggleSbomVisibility(sbom.id, this.checked);
                    });
                } else {
                    logger.warn(`Checkbox for SBOM ${sbom.id} not found`);
                }
                
                // Add event listener for the delete button
                const deleteBtn = item.querySelector('.delete-sbom');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function() {
                        logger.debug(`Deleting SBOM ${sbom.id}`);
                        deleteSbom(sbom.id);
                    });
                } else {
                    logger.warn(`Delete button for SBOM ${sbom.id} not found`);
                }
            } catch (error) {
                logger.error(`Error creating list item for SBOM ${sbom.id}:`, error);
            }
        });
    }
    
    // Delete an SBOM
    function deleteSbom(sbomId) {
        logger.info(`Requesting deletion of SBOM: ${sbomId}`);
        setLoading(true);
        
        fetch(`/sbom/${sbomId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                logger.info(`Successfully deleted SBOM: ${sbomId}`);
                loadedSboms.delete(sbomId);
                updateSbomList();
                fetchGraphData();
                uploadStatus.innerHTML = '<div class="alert alert-success">SBOM removed from visualization</div>';
            } else {
                logger.error(`Failed to delete SBOM: ${data.error}`);
                uploadStatus.innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
            }
        })
        .catch(error => {
            logger.error(`Error during SBOM deletion:`, error);
            uploadStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
            showErrorModal("Failed to delete SBOM", error);
        })
        .finally(() => {
            setLoading(false);
        });
    }
    
    // Reset zoom button
    const resetZoomBtn = document.getElementById('reset-zoom');
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', function() {
            logger.debug("Resetting zoom");
            graph.resetZoom();
        });
    } else {
        logger.warn("Reset zoom button not found");
    }
    
    // Node size selector
    const nodeSizeSelect = document.getElementById('node-size-select');
    if (nodeSizeSelect) {
        nodeSizeSelect.addEventListener('change', function() {
            logger.debug(`Setting node size method to: ${this.value}`);
            graph.setNodeSizeBy(this.value);
        });
    } else {
        logger.warn("Node size selector not found");
    }
    
    // Highlight common components checkbox
    const highlightCommonCheckbox = document.getElementById('highlight-common');
    if (highlightCommonCheckbox) {
        highlightCommonCheckbox.addEventListener('change', function() {
            logger.debug(`Setting highlight common to: ${this.checked}`);
            graph.setHighlightCommon(this.checked);
        });
    } else {
        logger.warn("Highlight common checkbox not found");
    }
    
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim();
            logger.debug(`Searching for: ${searchTerm}`);
            const matchCount = graph.searchNode(searchTerm);
            
            if (searchTerm && matchCount === 0) {
                this.classList.add('is-invalid');
                logger.debug(`No matches found for search: ${searchTerm}`);
            } else {
                this.classList.remove('is-invalid');
                if (searchTerm) {
                    logger.debug(`Found ${matchCount} matches for search: ${searchTerm}`);
                }
            }
        });
    } else {
        logger.warn("Search input not found");
    }
    
    // Filter by type
    const showSoftwareCheckbox = document.getElementById('show-software');
    if (showSoftwareCheckbox) {
        showSoftwareCheckbox.addEventListener('change', function() {
            logger.debug(`Setting show software to: ${this.checked}`);
            graph.filterByType(this.checked);
        });
    } else {
        logger.warn("Show software checkbox not found");
    }
    
    // Dismiss error button
    const dismissErrorBtn = document.getElementById('dismiss-error');
    if (dismissErrorBtn) {
        dismissErrorBtn.addEventListener('click', function() {
            hideGraphError();
        });
    }
    
    // Fetch and update loaded SBOMs
    function fetchSbomList() {
        logger.info("Fetching SBOM list from server");
        setLoading(true);
        
        fetch('/sboms')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(sboms => {
                logger.info(`Loaded ${sboms.length} SBOMs from server`);
                loadedSboms.clear();
                sboms.forEach(sbom => {
                    loadedSboms.set(sbom.id, sbom);
                });
                updateSbomList();
            })
            .catch(error => {
                logger.error('Error fetching SBOM list:', error);
                showGraphError("Failed to load SBOM list from server.");
            })
            .finally(() => {
                setLoading(false);
            });
    }
    
    function fetchGraphData() {
        logger.info("Fetching graph data from server");
        setLoading(true);
        hideGraphError();
        
        fetch('/graph')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                logger.info(`Loaded graph data with ${data.nodes.length} nodes and ${data.links.length} links`);
                
                if (data.nodes.length === 0) {
                    logger.warn("Graph data contains no nodes");
                    showGraphError("The graph contains no nodes to display. Try uploading a different SBOM file.");
                    return;
                }
                
                try {
                    graph.updateData(data);
                } catch (error) {
                    logger.error("Error updating graph with data:", error);
                    showGraphError("Failed to visualize the graph data. See console for details.");
                }
            })
            .catch(error => {
                logger.error('Error fetching graph data:', error);
                showGraphError("Failed to load graph data from server.");
                showErrorModal("Graph Data Loading Failed", error);
            })
            .finally(() => {
                setLoading(false);
            });
    }
    
    // Check if there's already graph data available
    fetchSbomList();
    fetchGraphData();
    
    // Handle window resize
    window.addEventListener('resize', function() {
        try {
            // Update graph dimensions if needed
            graph.width = graph.container.node().getBoundingClientRect().width;
            graph.height = graph.container.node().getBoundingClientRect().height;
            logger.debug(`Window resized, updating graph dimensions: ${graph.width}x${graph.height}`);
            graph.update();
        } catch (error) {
            logger.error("Error handling window resize:", error);
        }
    });
    
    // Add global error handler
    window.addEventListener('error', function(event) {
        logger.error(`Global error: ${event.message} at ${event.filename}:${event.lineno}`, event.error);
        showErrorModal("Unhandled Application Error", event.error || new Error(event.message));
    });
    
    // Keyboard shortcut to toggle debug panel (Ctrl+Shift+D)
    document.addEventListener('keydown', function(event) {
        if (event.ctrlKey && event.shiftKey && event.key === 'D') {
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) {
                debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
            }
        }
    });
    
    logger.info("Visfactant application initialized");
}); 