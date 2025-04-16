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
        
        this.nodeSizeBy = 'fixed'; // Options: 'fixed', 'connections', 'file-size'
        
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
        
        // Update counts in UI
        d3.select('#stats-nodes').text(`${this.nodes.length} Nodes`);
        d3.select('#stats-links').text(`${this.links.length} Links`);
        
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
            .attr("stroke-width", 1);
            
        // Add nodes
        this.nodeElements = this.graphGroup.append("g")
            .attr("class", "nodes")
            .selectAll(".node")
            .data(this.nodes)
            .enter().append("g")
            .attr("class", "node")
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
            .attr("fill", d => this._getNodeColor(d));
            
        // Add node labels
        this.nodeElements.append("text")
            .attr("dx", d => this.getNodeSize(d) + 5)
            .attr("dy", ".35em")
            .text(d => d.name ? (d.name.length > 20 ? d.name.substring(0, 17) + "..." : d.name) : "Unknown");
            
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
            if (!showSoftware && d.type === 'software') return 'none';
            return null;
        });
        
        // Update links accordingly
        this.linkElements.style("display", d => {
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
            
        this.tooltip.html(`
            <strong>${d.name || 'Unknown'}</strong><br/>
            ${d.version ? `Version: ${d.version}<br/>` : ''}
            ${d.vendor ? `Vendor: ${d.vendor}<br/>` : ''}
        `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
    }

    _hideTooltip() {
        this.tooltip.transition()
            .duration(500)
            .style("opacity", 0);
    }

    _getNodeColor(d) {
        // Assign colors based on node type
        switch(d.type) {
            case 'software':
                return '#4285F4'; // Google Blue
            default:
                return '#EA4335'; // Google Red
        }
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