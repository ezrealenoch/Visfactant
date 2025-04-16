/**
 * Graph visualization with D3.js
 */
class SbomGraph {
    constructor(containerSelector) {
        // Enable debug logging
        this.DEBUG = true;
        
        // Initialize logger
        this._initLogger();
        
        this.logger.info("Initializing SbomGraph");
        
        this.containerSelector = containerSelector;
        
        // Check if container exists
        const container = document.querySelector(containerSelector);
        if (!container) {
            this.logger.error(`Container not found: ${containerSelector}`);
            throw new Error(`Container not found: ${containerSelector}`);
        }
        
        this.container = d3.select(containerSelector);
        this.width = this.container.node().getBoundingClientRect().width;
        this.height = this.container.node().getBoundingClientRect().height;

        this.svg = null;
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.nodeElements = null;
        this.linkElements = null;
        this.tooltip = null;
        this.zoom = null;
        this.selectedNode = null;
        
        this.nodeSizeBy = 'fixed'; // Options: 'fixed', 'connections', 'file-size', 'shared'
        this.highlightCommon = true; // Whether to highlight components shared across SBOMs
        this.sbomColors = {}; // Map SBOM IDs to colors
        this.visibleSboms = new Set(); // Track which SBOMs are visible
        
        // Color palette for different SBOMs
        this.colorPalette = [
            '#4285F4', // Google Blue
            '#EA4335', // Google Red
            '#FBBC05', // Google Yellow
            '#34A853', // Google Green
            '#8F00FF', // Violet
            '#00FFFF', // Cyan
            '#FF00FF', // Magenta
            '#FF8C00', // Dark Orange
            '#008080', // Teal
            '#800080'  // Purple
        ];
        
        this._initialize();
        this.logger.info("SbomGraph initialized");
    }
    
    _initLogger() {
        this.logger = {
            debug: (message) => {
                if (this.DEBUG) console.debug(`[GRAPH][DEBUG] ${message}`);
            },
            info: (message) => {
                console.info(`[GRAPH][INFO] ${message}`);
            },
            warn: (message) => {
                console.warn(`[GRAPH][WARN] ${message}`);
            },
            error: (message, error) => {
                console.error(`[GRAPH][ERROR] ${message}`, error);
            }
        };
    }

    _initialize() {
        try {
            // Create SVG container
            this.svg = this.container.append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", [0, 0, this.width, this.height]);
                
            // Create a group for the graph
            this.graphGroup = this.svg.append("g")
                .attr("class", "graph");
                
            // Set up zoom behavior
            this.zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .on("zoom", (event) => {
                    this.graphGroup.attr("transform", event.transform);
                });
                
            this.svg.call(this.zoom);
            
            // Create tooltip
            this.tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("opacity", 0);
                
            // Initialize force simulation
            this.simulation = d3.forceSimulation()
                .force("link", d3.forceLink().id(d => d.id).distance(100))
                .force("charge", d3.forceManyBody().strength(-300))
                .force("center", d3.forceCenter(this.width / 2, this.height / 2))
                .force("collide", d3.forceCollide().radius(50));
                
            this.logger.debug("Graph initialization completed");
        } catch (error) {
            this.logger.error("Error initializing graph:", error);
            throw error;
        }
    }

    resetZoom() {
        try {
            this.logger.debug("Resetting zoom");
            this.svg.transition().duration(750).call(
                this.zoom.transform,
                d3.zoomIdentity,
                d3.zoomTransform(this.svg.node()).invert([this.width / 2, this.height / 2])
            );
        } catch (error) {
            this.logger.error("Error resetting zoom:", error);
        }
    }

    setNodeSizeBy(method) {
        this.logger.debug(`Setting node size by: ${method}`);
        this.nodeSizeBy = method;
        this.update();
    }

    setHighlightCommon(highlight) {
        this.logger.debug(`Setting highlight common: ${highlight}`);
        this.highlightCommon = highlight;
        this.update();
    }

    toggleSbomVisibility(sbomId, visible) {
        this.logger.debug(`Toggling visibility of SBOM ${sbomId} to ${visible}`);
        
        if (visible) {
            this.visibleSboms.add(sbomId);
        } else {
            this.visibleSboms.delete(sbomId);
        }
        
        try {
            this.filterVisibleSboms();
        } catch (error) {
            this.logger.error(`Error toggling SBOM visibility for ${sbomId}:`, error);
        }
    }

    filterVisibleSboms() {
        try {
            // Check if node and link elements exist
            if (!this.nodeElements || !this.linkElements) {
                this.logger.warn("Node or link elements not initialized yet");
                return;
            }
            
            // If no SBOMs are explicitly set as visible, show all
            const showAll = this.visibleSboms.size === 0;
            this.logger.debug(`Filtering for visible SBOMs. Show all: ${showAll}, Visible SBOMs: ${Array.from(this.visibleSboms).join(', ')}`);
            
            // Filter nodes based on SBOM visibility
            this.nodeElements.style("display", d => {
                // For nodes in multiple SBOMs, check if any of those SBOMs are visible
                if (d.shared_in) {
                    const visibleInAnySbom = d.shared_in.some(id => showAll || this.visibleSboms.has(id));
                    return visibleInAnySbom ? null : 'none';
                }
                return (showAll || this.visibleSboms.has(d.sbom)) ? null : 'none';
            });
            
            // Filter links based on SBOM visibility
            this.linkElements.style("display", d => {
                return (showAll || this.visibleSboms.has(d.sbom)) ? null : 'none';
            });
        } catch (error) {
            this.logger.error("Error filtering visible SBOMs:", error);
        }
    }

    getNodeSize(d) {
        const baseSize = 15;
        const maxSize = 45;
        
        try {
            switch (this.nodeSizeBy) {
                case 'connections':
                    // Count connections (links) associated with this node
                    const connectionCount = this.links.filter(link => 
                        link.source.id === d.id || link.target.id === d.id
                    ).length;
                    return Math.max(baseSize, Math.min(baseSize + connectionCount * 2, maxSize));
                    
                case 'file-size':
                    // Scale based on file size
                    if (!d.size) return baseSize;
                    const scaleFactor = 0.0001; // Adjust based on expected size range
                    return Math.max(baseSize, Math.min(baseSize + d.size * scaleFactor, maxSize));
                    
                case 'shared':
                    // Scale based on how many SBOMs share this component
                    if (!d.shared_in) return baseSize;
                    return Math.max(baseSize, Math.min(baseSize + (d.shared_in.length * 5), maxSize));
                    
                default: // 'fixed'
                    return baseSize;
            }
        } catch (error) {
            this.logger.error(`Error calculating node size for node ${d.id}:`, error);
            return baseSize; // Return default size on error
        }
    }

    calculateLinkOpacity(d) {
        try {
            // Highlight links connected to selected node
            if (this.selectedNode) {
                if (d.source.id === this.selectedNode.id || d.target.id === this.selectedNode.id) {
                    return 0.8;
                }
                return 0.2;
            }
            return 0.6;
        } catch (error) {
            this.logger.error("Error calculating link opacity:", error);
            return 0.6; // Default opacity on error
        }
    }

    updateData(data) {
        try {
            this.logger.info(`Updating graph data with ${data.nodes.length} nodes and ${data.links.length} links`);
            
            // Validate node data - ensure no duplicate IDs
            const uniqueNodes = {};
            this.nodes = [];
            data.nodes.forEach(node => {
                if (node.id && !uniqueNodes[node.id]) {
                    uniqueNodes[node.id] = true;
                    this.nodes.push(node);
                }
            });
            
            if (this.nodes.length < data.nodes.length) {
                this.logger.warn(`Filtered out ${data.nodes.length - this.nodes.length} duplicate nodes`);
            }
            
            // Validate links - ensure source and target are strings, not objects
            const nodeIds = new Set(this.nodes.map(node => node.id));
            this.links = [];
            
            data.links.forEach(link => {
                // Ensure source and target are valid node IDs
                const sourceId = typeof link.source === 'object' ? link.source?.id : link.source;
                const targetId = typeof link.target === 'object' ? link.target?.id : link.target;
                
                if (sourceId && targetId && nodeIds.has(sourceId) && nodeIds.has(targetId)) {
                    this.links.push({
                        source: sourceId,
                        target: targetId,
                        sbom: link.sbom,
                        type: link.type || 'unknown'
                    });
                }
            });
            
            if (this.links.length < data.links.length) {
                this.logger.warn(`Filtered out ${data.links.length - this.links.length} invalid links`);
            }
            
            this.logger.info(`Processed ${this.nodes.length} nodes and ${this.links.length} links for visualization`);
            
            // Assign colors to SBOMs if needed
            const sbomIds = new Set();
            this.nodes.forEach(node => {
                if (node.sbom && !sbomIds.has(node.sbom)) {
                    sbomIds.add(node.sbom);
                    if (!this.sbomColors[node.sbom]) {
                        // Assign color from palette or generate one
                        const colorIndex = Object.keys(this.sbomColors).length % this.colorPalette.length;
                        this.sbomColors[node.sbom] = this.colorPalette[colorIndex];
                        this.logger.debug(`Assigned color ${this.colorPalette[colorIndex]} to SBOM ${node.sbom}`);
                    }
                    
                    // Add to visible SBOMs by default
                    this.visibleSboms.add(node.sbom);
                }
            });
            
            // Update counts in UI
            const statsNodes = document.getElementById('stats-nodes');
            const statsLinks = document.getElementById('stats-links');
            const statsSboms = document.getElementById('stats-sboms');
            
            if (statsNodes) statsNodes.textContent = `${this.nodes.length} Nodes`;
            if (statsLinks) statsLinks.textContent = `${this.links.length} Links`;
            if (statsSboms) statsSboms.textContent = `${sbomIds.size} SBOMs`;
            
            this.update();
        } catch (error) {
            this.logger.error("Error updating graph data:", error);
        }
    }

    update() {
        try {
            this.logger.debug("Updating graph visualization");
            
            // Clear previous elements
            this.graphGroup.selectAll("*").remove();
            
            if (this.nodes.length === 0) {
                this.logger.warn("No nodes to render");
                return;
            }
            
            // Sanitize links - make sure source and target exist in nodes
            const nodeIds = new Set(this.nodes.map(node => node.id));
            this.links = this.links.filter(link => {
                if (typeof link.source === 'object' && link.source) {
                    return nodeIds.has(link.source.id);
                } else if (typeof link.source === 'string') {
                    return nodeIds.has(link.source);
                }
                return false;
            }).filter(link => {
                if (typeof link.target === 'object' && link.target) {
                    return nodeIds.has(link.target.id);
                } else if (typeof link.target === 'string') {
                    return nodeIds.has(link.target);
                }
                return false;
            });
            
            this.logger.debug(`After sanitizing, rendering ${this.nodes.length} nodes and ${this.links.length} links`);
            
            // Add links
            this.linkElements = this.graphGroup.append("g")
                .attr("class", "links")
                .selectAll("line")
                .data(this.links)
                .enter().append("line")
                .attr("class", "link")
                .attr("stroke-width", 1)
                .style("stroke", d => this.sbomColors[d.sbom] || "#999");
                
            // Add nodes
            this.nodeElements = this.graphGroup.append("g")
                .attr("class", "nodes")
                .selectAll(".node")
                .data(this.nodes)
                .enter().append("g")
                .attr("class", d => {
                    const classes = ["node"];
                    if (d.shared_in && d.shared_in.length > 1 && this.highlightCommon) {
                        classes.push("shared-node");
                    }
                    return classes.join(" ");
                })
                .on("mouseover", (event, d) => this._showTooltip(event, d))
                .on("mouseout", () => this._hideTooltip())
                .on("click", (event, d) => this._selectNode(event, d))
                .call(d3.drag()
                    .on("start", (event, d) => this._dragstarted(event, d))
                    .on("drag", (event, d) => this._dragged(event, d))
                    .on("end", (event, d) => this._dragended(event, d)));
                
            // Add circles for nodes
            this.nodeElements.append("circle")
                .attr("r", d => this.getNodeSize(d))
                .attr("fill", d => this._getNodeColor(d))
                .attr("stroke", d => {
                    if (d.shared_in && d.shared_in.length > 1 && this.highlightCommon) {
                        return "#FF0000"; // Red border for shared components
                    }
                    return "#FFF";
                })
                .attr("stroke-width", d => {
                    if (d.shared_in && d.shared_in.length > 1 && this.highlightCommon) {
                        return 2;
                    }
                    return 1.5;
                });
                
            // Add node labels
            this.nodeElements.append("text")
                .attr("dx", d => this.getNodeSize(d) + 5)
                .attr("dy", ".35em")
                .text(d => {
                    const displayName = d.display_name || d.name || d.id || "Unknown";
                    return displayName.length > 20 ? displayName.substring(0, 17) + "..." : displayName;
                });
                
            // Apply initial filters
            this.filterVisibleSboms();
            
            // Update simulation
            try {
                this.simulation
                    .nodes(this.nodes)
                    .on("tick", () => this._ticked());
                    
                this.simulation.force("link")
                    .links(this.links);
                    
                // Restart simulation
                this.simulation.alpha(1).restart();
                
                this.logger.debug("Graph update completed");
            } catch (error) {
                this.logger.error("Error updating simulation:", error);
                // Attempt recovery by recreating the simulation
                try {
                    this.logger.debug("Recreating simulation to recover from error");
                    this.simulation = d3.forceSimulation()
                        .force("link", d3.forceLink().id(d => d.id).distance(100))
                        .force("charge", d3.forceManyBody().strength(-300))
                        .force("center", d3.forceCenter(this.width / 2, this.height / 2))
                        .force("collide", d3.forceCollide().radius(50));
                        
                    this.simulation
                        .nodes(this.nodes)
                        .on("tick", () => this._ticked());
                        
                    this.simulation.force("link")
                        .links(this.links);
                        
                    this.simulation.alpha(1).restart();
                    
                    this.logger.debug("Simulation recovery succeeded");
                } catch (recoveryError) {
                    this.logger.error("Failed to recover simulation:", recoveryError);
                }
            }
        } catch (error) {
            this.logger.error("Error updating graph:", error);
        }
    }

    searchNode(searchTerm) {
        try {
            if (!searchTerm) {
                // Reset all highlighting
                if (this.nodeElements) {
                    this.nodeElements.classed("search-result", false);
                }
                return 0;
            }
            
            if (!this.nodeElements) {
                this.logger.warn("Node elements not initialized yet");
                return 0;
            }
            
            const regex = new RegExp(searchTerm, 'i');
            let matchCount = 0;
            
            this.nodeElements.each(function(d) {
                const match = d.name && regex.test(d.name);
                d3.select(this).classed("search-result", match);
                if (match) matchCount++;
            });
            
            return matchCount;
        } catch (error) {
            this.logger.error(`Error searching for "${searchTerm}":`, error);
            return 0;
        }
    }

    filterByType(showSoftware) {
        try {
            this.logger.debug(`Filtering by type, show software: ${showSoftware}`);
            
            if (!this.nodeElements || !this.linkElements) {
                this.logger.warn("Node or link elements not initialized yet");
                return;
            }
            
            // Filter nodes by type
            this.nodeElements.style("display", d => {
                // First check if node should be visible based on SBOM visibility
                const sbomVisible = this.visibleSboms.size === 0 || 
                    (d.shared_in ? d.shared_in.some(id => this.visibleSboms.has(id)) : this.visibleSboms.has(d.sbom));
                    
                if (!sbomVisible) return 'none';
                
                if (!showSoftware && d.type === 'software') return 'none';
                return null;
            });
            
            // Update links accordingly
            this.linkElements.style("display", d => {
                // First check if link should be visible based on SBOM visibility
                const sbomVisible = this.visibleSboms.size === 0 || this.visibleSboms.has(d.sbom);
                if (!sbomVisible) return 'none';
                
                const sourceVisible = showSoftware || d.source.type !== 'software';
                const targetVisible = showSoftware || d.target.type !== 'software';
                
                return (sourceVisible && targetVisible) ? null : 'none';
            });
        } catch (error) {
            this.logger.error("Error filtering by type:", error);
        }
    }

    _selectNode(event, d) {
        try {
            // Handle node selection
            this.selectedNode = d === this.selectedNode ? null : d;
            this.logger.debug(`Selected node: ${this.selectedNode ? this.selectedNode.name : 'none'}`);
            
            // Update node highlighting
            if (this.nodeElements) {
                this.nodeElements.classed("node-selected", n => n === this.selectedNode);
            }
            
            // Update link opacity
            if (this.linkElements) {
                this.linkElements.style("stroke-opacity", d => this.calculateLinkOpacity(d));
            }
            
            // Update node details panel
            this._updateNodeDetails();
        } catch (error) {
            this.logger.error("Error selecting node:", error);
        }
    }

    _updateNodeDetails() {
        try {
            const detailsPanel = document.getElementById('node-details');
            if (!detailsPanel) {
                this.logger.warn("Node details panel not found in DOM");
                return;
            }
            
            if (!this.selectedNode) {
                detailsPanel.innerHTML = '<p class="text-muted">Select a component to view details</p>';
                return;
            }
            
            const d = this.selectedNode;
            
            // Use display_name if available, otherwise fallback to name
            const displayName = d.display_name || d.name || 'Unknown';
            let html = `<h6>${displayName}</h6>`;
            
            html += `<p><strong>ID:</strong> ${d.id}</p>`;
            
            if (d.version) html += `<p><strong>Version:</strong> ${d.version}</p>`;
            if (d.vendor) html += `<p><strong>Vendor:</strong> ${d.vendor}</p>`;
            if (d.uuid) html += `<p><strong>UUID:</strong> ${d.uuid}</p>`;
            if (d.fileName) html += `<p><strong>Filename:</strong> ${d.fileName}</p>`;
            
            if (d.size) {
                const formattedSize = this._formatFileSize(d.size);
                html += `<p><strong>Size:</strong> ${formattedSize}</p>`;
            }
            
            // Show type information
            if (d.type) html += `<p><strong>Type:</strong> ${d.type}</p>`;
            
            // Show which SBOM this node is from
            html += `<p><strong>SBOM:</strong> ${d.sbom_name || "Unknown"}</p>`;
            
            // If shared across multiple SBOMs, show which ones
            if (d.shared_in && d.shared_in.length > 1) {
                html += `<p><strong>Shared across:</strong> ${d.shared_in.length} SBOMs</p>`;
            }
            
            // Count dependencies
            const sourceCount = this.links.filter(link => link.source.id === d.id).length;
            const targetCount = this.links.filter(link => link.target.id === d.id).length;
            
            html += `<p><strong>Dependencies:</strong> ${sourceCount}</p>`;
            html += `<p><strong>Used by:</strong> ${targetCount}</p>`;
            
            detailsPanel.innerHTML = html;
        } catch (error) {
            this.logger.error("Error updating node details:", error);
        }
    }

    _formatFileSize(bytes) {
        try {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        } catch (error) {
            this.logger.error("Error formatting file size:", error);
            return `${bytes} Bytes`;
        }
    }

    _showTooltip(event, d) {
        try {
            if (!this.tooltip) {
                this.logger.warn("Tooltip not initialized");
                return;
            }
            
            this.tooltip.transition()
                .duration(200)
                .style("opacity", .9);
                
            // Use display_name if available, otherwise fallback to name
            const displayName = d.display_name || d.name || 'Unknown';
                
            let tooltipContent = `
                <strong>${displayName}</strong><br/>
                ${d.version ? `Version: ${d.version}<br/>` : ''}
                ${d.vendor ? `Vendor: ${d.vendor}<br/>` : ''}
                ${d.type ? `Type: ${d.type}<br/>` : ''}
                ${d.size ? `Size: ${this._formatFileSize(d.size)}<br/>` : ''}
                SBOM: ${d.sbom_name || "Unknown"}<br/>
            `;
            
            // Add info about sharing if relevant
            if (d.shared_in && d.shared_in.length > 1) {
                tooltipContent += `<strong>Shared across ${d.shared_in.length} SBOMs</strong><br/>`;
            }
            
            this.tooltip.html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        } catch (error) {
            this.logger.error("Error showing tooltip:", error);
        }
    }

    _hideTooltip() {
        try {
            if (this.tooltip) {
                this.tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            }
        } catch (error) {
            this.logger.error("Error hiding tooltip:", error);
        }
    }

    _getNodeColor(d) {
        try {
            // For nodes that appear in multiple SBOMs
            if (d.shared_in && d.shared_in.length > 1) {
                if (this.highlightCommon) {
                    // Use a gradient or special color for shared components
                    return '#FF9900'; // Orange for shared components
                }
                // Otherwise use the color of the first SBOM it appears in
                return this.sbomColors[d.shared_in[0]] || '#4285F4';
            }
            
            // Regular nodes get their SBOM's color
            return this.sbomColors[d.sbom] || '#4285F4';
        } catch (error) {
            this.logger.error(`Error getting node color for node ${d.id}:`, error);
            return '#4285F4'; // Default color on error
        }
    }

    _ticked() {
        try {
            if (this.linkElements) {
                this.linkElements
                    .attr("x1", d => d.source?.x ?? 0)
                    .attr("y1", d => d.source?.y ?? 0)
                    .attr("x2", d => d.target?.x ?? 0)
                    .attr("y2", d => d.target?.y ?? 0);
            }

            if (this.nodeElements) {
                this.nodeElements
                    .attr("transform", d => {
                        // Ensure x and y exist - use center of graph if not
                        const x = d.x ?? this.width/2; 
                        const y = d.y ?? this.height/2;
                        return `translate(${x},${y})`;
                    });
            }
        } catch (error) {
            this.logger.error("Error during simulation tick:", error);
        }
    }

    _dragstarted(event, d) {
        try {
            if (!event.active) this.simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        } catch (error) {
            this.logger.error("Error starting drag:", error);
        }
    }

    _dragged(event, d) {
        try {
            d.fx = event.x;
            d.fy = event.y;
        } catch (error) {
            this.logger.error("Error during drag:", error);
        }
    }

    _dragended(event, d) {
        try {
            if (!event.active) this.simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        } catch (error) {
            this.logger.error("Error ending drag:", error);
        }
    }
} 