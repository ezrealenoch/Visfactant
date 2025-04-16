/**
 * Graph visualization with D3.js
 */
class SbomGraph {
    constructor(containerSelector) {
        this.containerSelector = containerSelector;
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
    }

    _initialize() {
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
    }

    resetZoom() {
        this.svg.transition().duration(750).call(
            this.zoom.transform,
            d3.zoomIdentity,
            d3.zoomTransform(this.svg.node()).invert([this.width / 2, this.height / 2])
        );
    }

    setNodeSizeBy(method) {
        this.nodeSizeBy = method;
        this.update();
    }

    setHighlightCommon(highlight) {
        this.highlightCommon = highlight;
        this.update();
    }

    toggleSbomVisibility(sbomId, visible) {
        if (visible) {
            this.visibleSboms.add(sbomId);
        } else {
            this.visibleSboms.delete(sbomId);
        }
        this.filterVisibleSboms();
    }

    filterVisibleSboms() {
        // If no SBOMs are explicitly set as visible, show all
        const showAll = this.visibleSboms.size === 0;
        
        // Filter nodes and links based on SBOM visibility
        this.nodeElements.style("display", d => {
            // For nodes in multiple SBOMs, check if any of those SBOMs are visible
            if (d.shared_in) {
                const visibleInAnySbom = d.shared_in.some(id => showAll || this.visibleSboms.has(id));
                return visibleInAnySbom ? null : 'none';
            }
            return (showAll || this.visibleSboms.has(d.sbom_id)) ? null : 'none';
        });
        
        this.linkElements.style("display", d => {
            return (showAll || this.visibleSboms.has(d.sbom_id)) ? null : 'none';
        });
    }

    getNodeSize(d) {
        const baseSize = 8;
        const maxSize = 30;
        
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
    }

    calculateLinkOpacity(d) {
        // Highlight links connected to selected node
        if (this.selectedNode) {
            if (d.source.id === this.selectedNode.id || d.target.id === this.selectedNode.id) {
                return 0.8;
            }
            return 0.2;
        }
        return 0.6;
    }

    updateData(data) {
        this.nodes = data.nodes;
        this.links = data.links;
        
        // Assign colors to SBOMs if needed
        const sbomIds = new Set();
        this.nodes.forEach(node => {
            if (node.sbom_id && !sbomIds.has(node.sbom_id)) {
                sbomIds.add(node.sbom_id);
                if (!this.sbomColors[node.sbom_id]) {
                    // Assign color from palette or generate one
                    const colorIndex = Object.keys(this.sbomColors).length % this.colorPalette.length;
                    this.sbomColors[node.sbom_id] = this.colorPalette[colorIndex];
                }
                
                // Add to visible SBOMs by default
                this.visibleSboms.add(node.sbom_id);
            }
        });
        
        // Update counts in UI
        d3.select('#stats-nodes').text(`${this.nodes.length} Nodes`);
        d3.select('#stats-links').text(`${this.links.length} Links`);
        d3.select('#stats-sboms').text(`${sbomIds.size} SBOMs`);
        
        this.update();
    }

    update() {
        // Clear previous elements
        this.graphGroup.selectAll("*").remove();
        
        // Add links
        this.linkElements = this.graphGroup.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(this.links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", 1)
            .style("stroke", d => this.sbomColors[d.sbom_id] || "#999");
            
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
            .text(d => d.name ? (d.name.length > 20 ? d.name.substring(0, 17) + "..." : d.name) : "Unknown");
            
        // Apply initial filters
        this.filterVisibleSboms();
        
        // Update simulation
        this.simulation
            .nodes(this.nodes)
            .on("tick", () => this._ticked());
            
        this.simulation.force("link")
            .links(this.links);
            
        // Restart simulation
        this.simulation.alpha(1).restart();
    }

    searchNode(searchTerm) {
        if (!searchTerm) {
            // Reset all highlighting
            this.nodeElements.classed("search-result", false);
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
    }

    filterByType(showSoftware) {
        // Filter nodes by type
        this.nodeElements.style("display", d => {
            // First check if node should be visible based on SBOM visibility
            const sbomVisible = this.visibleSboms.size === 0 || 
                (d.shared_in ? d.shared_in.some(id => this.visibleSboms.has(id)) : this.visibleSboms.has(d.sbom_id));
                
            if (!sbomVisible) return 'none';
            
            if (!showSoftware && d.type === 'software') return 'none';
            return null;
        });
        
        // Update links accordingly
        this.linkElements.style("display", d => {
            // First check if link should be visible based on SBOM visibility
            const sbomVisible = this.visibleSboms.size === 0 || this.visibleSboms.has(d.sbom_id);
            if (!sbomVisible) return 'none';
            
            const sourceVisible = showSoftware || d.source.type !== 'software';
            const targetVisible = showSoftware || d.target.type !== 'software';
            
            return (sourceVisible && targetVisible) ? null : 'none';
        });
    }

    _selectNode(event, d) {
        // Handle node selection
        this.selectedNode = d === this.selectedNode ? null : d;
        
        // Update node highlighting
        this.nodeElements.classed("node-selected", n => n === this.selectedNode);
        
        // Update link opacity
        this.linkElements.style("stroke-opacity", d => this.calculateLinkOpacity(d));
        
        // Update node details panel
        this._updateNodeDetails();
    }

    _updateNodeDetails() {
        const detailsPanel = d3.select('#node-details');
        
        if (!this.selectedNode) {
            detailsPanel.html('<p class="text-muted">Select a component to view details</p>');
            return;
        }
        
        const d = this.selectedNode;
        let html = `<h6>${d.name || 'Unknown'}</h6>`;
        html += `<p><strong>ID:</strong> ${d.id}</p>`;
        
        if (d.version) html += `<p><strong>Version:</strong> ${d.version}</p>`;
        if (d.vendor) html += `<p><strong>Vendor:</strong> ${d.vendor}</p>`;
        if (d.fileName) html += `<p><strong>Filename:</strong> ${d.fileName}</p>`;
        if (d.size) html += `<p><strong>Size:</strong> ${this._formatFileSize(d.size)}</p>`;
        
        // Show which SBOM this node is from
        html += `<p><strong>SBOM:</strong> ${d.sbom_name}</p>`;
        
        // If shared across multiple SBOMs, show which ones
        if (d.shared_in && d.shared_in.length > 1) {
            html += `<p><strong>Shared across:</strong> ${d.shared_in.length} SBOMs</p>`;
        }
        
        // Count dependencies
        const sourceCount = this.links.filter(link => link.source.id === d.id).length;
        const targetCount = this.links.filter(link => link.target.id === d.id).length;
        
        html += `<p><strong>Dependencies:</strong> ${sourceCount}</p>`;
        html += `<p><strong>Used by:</strong> ${targetCount}</p>`;
        
        detailsPanel.html(html);
    }

    _formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    _showTooltip(event, d) {
        this.tooltip.transition()
            .duration(200)
            .style("opacity", .9);
            
        let tooltipContent = `
            <strong>${d.name || 'Unknown'}</strong><br/>
            ${d.version ? `Version: ${d.version}<br/>` : ''}
            ${d.vendor ? `Vendor: ${d.vendor}<br/>` : ''}
            SBOM: ${d.sbom_name}<br/>
        `;
        
        // Add info about sharing if relevant
        if (d.shared_in && d.shared_in.length > 1) {
            tooltipContent += `<strong>Shared across ${d.shared_in.length} SBOMs</strong><br/>`;
        }
        
        this.tooltip.html(tooltipContent)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
    }

    _hideTooltip() {
        this.tooltip.transition()
            .duration(500)
            .style("opacity", 0);
    }

    _getNodeColor(d) {
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
        return this.sbomColors[d.sbom_id] || '#4285F4';
    }

    _ticked() {
        this.linkElements
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        this.nodeElements
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }

    _dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    _dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    _dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
} 