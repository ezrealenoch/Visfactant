from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import json
import networkx as nx
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Global variable to store the graph data
graph_data = {
    "nodes": [],
    "links": []
}

def process_sbom(sbom_data):
    """Process SBOM data and convert to graph format"""
    nodes = []
    links = []
    
    # Extract nodes (software components)
    node_map = {}  # Map UUID to node index
    
    for idx, sw in enumerate(sbom_data.get("software", [])):
        uuid = sw.get("UUID")
        if not uuid:
            continue
            
        name = sw.get("name") or f"Unknown-{uuid[:8]}"
        
        node = {
            "id": uuid,
            "name": name,
            "version": sw.get("version", ""),
            "vendor": ", ".join([v[0] if isinstance(v, list) and len(v) > 0 else v for v in sw.get("vendor", [])]),
            "size": sw.get("size", 0),
            "fileName": ", ".join(sw.get("fileName", [])),
            "type": "software"
        }
        
        nodes.append(node)
        node_map[uuid] = idx
    
    # Extract relationships (edges)
    for rel in sbom_data.get("relationships", []):
        source_uuid = rel.get("xUUID")
        target_uuid = rel.get("yUUID")
        relationship = rel.get("relationship")
        
        if source_uuid in node_map and target_uuid in node_map:
            link = {
                "source": source_uuid,
                "target": target_uuid,
                "type": relationship
            }
            links.append(link)
    
    return {"nodes": nodes, "links": links}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_sbom():
    global graph_data
    
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file:
        try:
            sbom_data = json.load(file)
            graph_data = process_sbom(sbom_data)
            return jsonify({"success": True, "nodes": len(graph_data["nodes"]), "links": len(graph_data["links"])}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    return jsonify({"error": "Failed to process file"}), 500

@app.route('/graph', methods=['GET'])
def get_graph():
    return jsonify(graph_data)

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True) 