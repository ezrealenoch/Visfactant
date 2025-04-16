from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import json
import networkx as nx
import os
import uuid

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Store for multiple SBOM data
sboms = {}

def process_sbom(sbom_data, sbom_id, sbom_name):
    """Process SBOM data and convert to graph format"""
    nodes = []
    links = []
    
    # Extract nodes (software components)
    node_map = {}  # Map UUID to node index
    
    for idx, sw in enumerate(sbom_data.get("software", [])):
        component_uuid = sw.get("UUID")
        if not component_uuid:
            continue
            
        name = sw.get("name") or f"Unknown-{component_uuid[:8]}"
        
        node = {
            "id": component_uuid,
            "name": name,
            "version": sw.get("version", ""),
            "vendor": ", ".join([v[0] if isinstance(v, list) and len(v) > 0 else v for v in sw.get("vendor", [])]),
            "size": sw.get("size", 0),
            "fileName": ", ".join(sw.get("fileName", [])),
            "type": "software",
            "sbom_id": sbom_id,
            "sbom_name": sbom_name
        }
        
        nodes.append(node)
        node_map[component_uuid] = idx
    
    # Extract relationships (edges)
    for rel in sbom_data.get("relationships", []):
        source_uuid = rel.get("xUUID")
        target_uuid = rel.get("yUUID")
        relationship = rel.get("relationship")
        
        if source_uuid in node_map and target_uuid in node_map:
            link = {
                "source": source_uuid,
                "target": target_uuid,
                "type": relationship,
                "sbom_id": sbom_id
            }
            links.append(link)
    
    return {"nodes": nodes, "links": links}

def merge_sboms():
    """Merge all loaded SBOMs into a single graph"""
    merged = {"nodes": [], "links": []}
    
    # Keep track of node IDs to avoid duplicates
    node_ids = set()
    
    for sbom_id, sbom_data in sboms.items():
        # Add nodes that aren't already in the merged graph
        for node in sbom_data["nodes"]:
            if node["id"] not in node_ids:
                merged["nodes"].append(node)
                node_ids.add(node["id"])
            else:
                # If node exists in multiple SBOMs, mark it as shared
                for merged_node in merged["nodes"]:
                    if merged_node["id"] == node["id"]:
                        if "shared_in" not in merged_node:
                            merged_node["shared_in"] = [merged_node["sbom_id"]]
                        if node["sbom_id"] not in merged_node["shared_in"]:
                            merged_node["shared_in"].append(node["sbom_id"])
                        break
        
        # Add all links
        merged["links"].extend(sbom_data["links"])
    
    return merged

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_sbom():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    sbom_name = request.form.get('sbom_name', file.filename)
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file:
        try:
            sbom_data = json.load(file)
            sbom_id = str(uuid.uuid4())
            
            # Process and store this SBOM
            sboms[sbom_id] = process_sbom(sbom_data, sbom_id, sbom_name)
            
            return jsonify({
                "success": True, 
                "sbom_id": sbom_id,
                "sbom_name": sbom_name,
                "nodes": len(sboms[sbom_id]["nodes"]), 
                "links": len(sboms[sbom_id]["links"])
            }), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    return jsonify({"error": "Failed to process file"}), 500

@app.route('/sboms', methods=['GET'])
def get_sboms():
    """Return a list of all loaded SBOMs"""
    sbom_list = []
    for sbom_id, data in sboms.items():
        nodes_count = len(data["nodes"])
        links_count = len(data["links"])
        sbom_name = data["nodes"][0]["sbom_name"] if nodes_count > 0 else "Unknown"
        
        sbom_list.append({
            "id": sbom_id,
            "name": sbom_name,
            "nodes": nodes_count,
            "links": links_count
        })
    
    return jsonify(sbom_list)

@app.route('/graph', methods=['GET'])
def get_graph():
    """Return the merged graph of all SBOMs"""
    return jsonify(merge_sboms())

@app.route('/sbom/<sbom_id>', methods=['DELETE'])
def delete_sbom(sbom_id):
    """Remove a specific SBOM from the visualization"""
    if sbom_id in sboms:
        del sboms[sbom_id]
        return jsonify({"success": True}), 200
    return jsonify({"error": "SBOM not found"}), 404

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True) 