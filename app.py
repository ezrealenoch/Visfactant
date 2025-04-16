import os
import json
import uuid
import logging
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('visfactant.log')
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Create uploads directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# In-memory store for SBOMs
sboms = {}
# Graph data storage
graph_data = {'nodes': [], 'links': []}

@app.route('/')
def index():
    logger.info("Serving index page")
    return render_template('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    logger.debug(f"Serving static file: {path}")
    return send_from_directory('static', path)

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        logger.info("Processing file upload request")
        
        if 'file' not in request.files:
            logger.warning("No file part in request")
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            logger.warning("No file selected")
            return jsonify({'error': 'No selected file'}), 400
        
        # Get SBOM name from form or use filename
        sbom_name = request.form.get('sbom_name')
        if not sbom_name:
            sbom_name = os.path.splitext(secure_filename(file.filename))[0]
        
        logger.info(f"Processing SBOM upload: {sbom_name}")
        
        # Generate a unique ID for this SBOM
        sbom_id = str(uuid.uuid4())
        
        try:
            # Parse the uploaded file
            sbom_content = json.loads(file.read())
            logger.debug(f"Successfully parsed SBOM JSON for {sbom_name}")
            
            # Extract components with expanded format support
            components = []
            
            # Log SBOM structure to help with debugging format issues
            logger.debug(f"SBOM top-level keys: {list(sbom_content.keys())}")
            
            # Original format: direct 'components' array
            if 'components' in sbom_content:
                logger.debug("Found standard 'components' format")
                components = sbom_content['components']
            
            # Format: graph.nodes structure
            elif 'graph' in sbom_content and 'nodes' in sbom_content['graph']:
                logger.debug("Found 'graph.nodes' format")
                components = sbom_content['graph']['nodes']
            
            # CycloneDX format
            elif 'metadata' in sbom_content and 'component' in sbom_content:
                logger.debug("Found CycloneDX format with root component")
                components = [sbom_content['component']]
                # Add any components from dependencies
                if 'dependencies' in sbom_content and isinstance(sbom_content['dependencies'], list):
                    components.extend(sbom_content['dependencies'])
            
            # SPDX format
            elif 'packages' in sbom_content and isinstance(sbom_content['packages'], list):
                logger.debug("Found SPDX format with 'packages'")
                components = sbom_content['packages']
            
            # Search for other common component arrays
            elif 'bomFormat' in sbom_content and 'components' in sbom_content:
                logger.debug("Found CycloneDX-like format with 'components'")
                components = sbom_content['components']
            
            # Try to handle nested structures
            elif 'data' in sbom_content and isinstance(sbom_content['data'], dict):
                if 'components' in sbom_content['data']:
                    logger.debug("Found components in nested 'data' object")
                    components = sbom_content['data']['components']
                elif 'packages' in sbom_content['data']:
                    logger.debug("Found packages in nested 'data' object")
                    components = sbom_content['data']['packages']
            
            # If still empty, try some last resort approaches
            if not components:
                # Look for any array with component-like objects
                for key, value in sbom_content.items():
                    if isinstance(value, list) and len(value) > 0 and isinstance(value[0], dict):
                        if any(comp_key in value[0] for comp_key in ['name', 'id', 'type', 'version', 'fileName', 'UUID']):
                            logger.debug(f"Found potential component array in key: '{key}'")
                            components = value
                            break
            
            if not components:
                # Log more SBOM structure for debugging
                logger.warning(f"No components found in SBOM: {sbom_name}")
                logger.debug(f"SBOM structure: {json.dumps(sbom_content, indent=2)[:1000]}...")
                return jsonify({'error': 'No components found in SBOM. Upload a different format or contact support.'}), 400
            
            logger.info(f"Found {len(components)} components in SBOM: {sbom_name}")
            
            # Process components into nodes and links
            nodes = []
            links = []
            
            # Track seen nodes to avoid duplicates
            seen_nodes = set()
            
            # Helper function to normalize component data from different formats
            def normalize_component(component):
                """Extract standardized component data from various SBOM formats"""
                # Default values
                normalized = {
                    'name': 'Unknown',
                    'version': '',
                    'type': 'library',
                    'dependencies': []
                }
                
                # Name can be in different fields depending on format
                if 'name' in component and component['name']:
                    normalized['name'] = component['name']
                elif 'Name' in component and component['Name']:
                    normalized['name'] = component['Name']
                elif 'packageName' in component and component['packageName']:
                    normalized['name'] = component['packageName']
                elif 'fileName' in component and component['fileName'] and len(component['fileName']) > 0:
                    # Use the first filename as the component name
                    if isinstance(component['fileName'], list):
                        normalized['name'] = component['fileName'][0]
                    else:
                        normalized['name'] = component['fileName']
                elif 'UUID' in component and component['UUID']:
                    # Use UUID as a last resort for name
                    normalized['name'] = f"Component-{component['UUID']}"
                elif 'purl' in component:
                    # Extract name from purl if possible
                    purl_parts = component['purl'].split('/')
                    if len(purl_parts) > 1:
                        name_part = purl_parts[-1].split('@')[0]
                        normalized['name'] = name_part
                
                # Version information
                if 'version' in component and component['version']:
                    normalized['version'] = component['version']
                elif 'Version' in component and component['Version']:
                    normalized['version'] = component['Version']
                elif 'packageVersion' in component and component['packageVersion']:
                    normalized['version'] = component['packageVersion']
                elif 'versionInfo' in component and component['versionInfo']:
                    normalized['version'] = component['versionInfo']
                elif 'purl' in component and '@' in component['purl']:
                    # Extract version from purl if possible
                    version_part = component['purl'].split('@')[-1]
                    normalized['version'] = version_part
                
                # Component type
                if 'type' in component:
                    normalized['type'] = component['type']
                elif 'Type' in component:
                    normalized['type'] = component['Type']
                elif 'componentType' in component:
                    normalized['type'] = component['componentType']
                elif 'elfIsLib' in component.get('metadata', [{}])[0] and component.get('metadata', [{}])[0]['elfIsLib']:
                    normalized['type'] = 'library'
                elif 'elfIsExe' in component.get('metadata', [{}])[0] and component.get('metadata', [{}])[0]['elfIsExe']:
                    normalized['type'] = 'executable'
                
                # Additional metadata for display
                if 'fileName' in component and component['fileName']:
                    if isinstance(component['fileName'], list):
                        normalized['display_name'] = component['fileName'][0]
                    else:
                        normalized['display_name'] = component['fileName']
                
                # Size information
                if 'size' in component:
                    normalized['size'] = component['size']
                
                # Vendor information 
                if 'vendor' in component and component['vendor']:
                    if isinstance(component['vendor'], list) and len(component['vendor']) > 0:
                        normalized['vendor'] = component['vendor'][0]
                    else:
                        normalized['vendor'] = component['vendor']
                
                # Dependencies - handle various formats
                if 'dependencies' in component and isinstance(component['dependencies'], list):
                    normalized['dependencies'] = component['dependencies']
                elif 'dependsOn' in component and isinstance(component['dependsOn'], list):
                    normalized['dependencies'] = component['dependsOn']
                elif 'requires' in component and isinstance(component['requires'], list):
                    normalized['dependencies'] = component['requires']
                elif 'metadata' in component and isinstance(component['metadata'], list):
                    # Check for ELF dependencies in metadata
                    for meta in component['metadata']:
                        if isinstance(meta, dict) and 'elfDependencies' in meta and meta['elfDependencies']:
                            # Create simple dependency entries from ELF dependencies
                            normalized['dependencies'] = [{'name': dep} for dep in meta['elfDependencies']]
                            break
                
                return normalized
            
            for component in components:
                try:
                    # Normalize component data from various formats
                    comp_data = normalize_component(component)
                    
                    # Extract component info
                    component_name = comp_data['name']
                    component_version = comp_data['version']
                    component_type = comp_data['type']
                    
                    # Create unique ID for this component
                    component_id = f"{component_name}@{component_version}" if component_version else component_name
                    
                    if component_id not in seen_nodes:
                        seen_nodes.add(component_id)
                        
                        # Add to nodes list
                        node = {
                            'id': component_id,
                            'name': component_name,
                            'version': component_version,
                            'type': component_type,
                            'sbom': sbom_id
                        }
                        
                        # Add UUID if available for relationship mapping
                        if 'UUID' in component:
                            node['uuid'] = component['UUID']
                        
                        # Add display name if available
                        if 'display_name' in comp_data:
                            node['display_name'] = comp_data['display_name']
                        
                        # Add size information if available
                        if 'size' in comp_data:
                            node['size'] = comp_data['size']
                        
                        # Add vendor information if available
                        if 'vendor' in comp_data:
                            node['vendor'] = comp_data['vendor']
                            
                        nodes.append(node)
                    
                    # Check for dependencies
                    dependencies = comp_data['dependencies']
                    if dependencies:
                        for dep in dependencies:
                            # Handle both string IDs and objects
                            dep_id = dep
                            if isinstance(dep, dict) and 'ref' in dep:
                                dep_id = dep['ref']
                            elif isinstance(dep, dict) and 'name' in dep:
                                dep_name = dep['name']
                                dep_version = dep.get('version', '')
                                dep_id = f"{dep_name}@{dep_version}" if dep_version else dep_name
                            
                            links.append({
                                'source': component_id,
                                'target': dep_id,
                                'sbom': sbom_id
                            })
                except Exception as e:
                    logger.warning(f"Error processing component: {str(e)}")
                    continue
            
            logger.info(f"Processed {len(nodes)} nodes and {len(links)} links for SBOM {sbom_name}")
            
            # Save SBOM data
            sboms[sbom_id] = {
                'id': sbom_id,
                'name': sbom_name,
                'nodes': len(nodes),
                'links': len(links)
            }
            
            # Process additional relationships from the SBOM file if present
            if 'relationships' in sbom_content and isinstance(sbom_content['relationships'], list):
                logger.debug(f"Processing {len(sbom_content['relationships'])} relationships from SBOM")
                
                # Create a mapping from UUID to node ID for lookup
                uuid_to_id = {}
                
                # Map directly from components first for better accuracy
                for component in components:
                    if 'UUID' in component and component['UUID']:
                        # Find the node that corresponds to this component UUID
                        component_name = component.get('name', '')
                        if not component_name and 'fileName' in component and component['fileName']:
                            if isinstance(component['fileName'], list) and len(component['fileName']) > 0:
                                component_name = component['fileName'][0]
                            else:
                                component_name = component['fileName']
                                
                        component_version = component.get('version', '')
                        component_id = f"{component_name}@{component_version}" if component_version else component_name
                        
                        if component_id:  # Only map if we have a valid ID
                            uuid_to_id[component['UUID']] = component_id
                            logger.debug(f"Mapped UUID {component['UUID']} to component ID {component_id}")
                
                # Also check nodes for UUIDs
                for node in nodes:
                    if 'uuid' in node:
                        uuid_to_id[node['uuid']] = node['id']
                
                # Track which relationships we couldn't process
                skipped_relationships = 0
                added_relationships = 0
                
                # Process relationships and create links
                for rel in sbom_content['relationships']:
                    try:
                        if 'xUUID' in rel and 'yUUID' in rel and 'relationship' in rel:
                            source_uuid = rel['xUUID']
                            target_uuid = rel['yUUID']
                            
                            if source_uuid in uuid_to_id and target_uuid in uuid_to_id:
                                # Create a link from source to target
                                link = {
                                    'source': uuid_to_id[source_uuid],
                                    'target': uuid_to_id[target_uuid],
                                    'sbom': sbom_id,
                                    'type': rel['relationship']
                                }
                                links.append(link)
                                added_relationships += 1
                                logger.debug(f"Added relationship: {link['source']} {link['type']} {link['target']}")
                            else:
                                skipped_relationships += 1
                                if source_uuid not in uuid_to_id:
                                    logger.debug(f"Skipped relationship - source UUID {source_uuid} not found in node mapping")
                                if target_uuid not in uuid_to_id:
                                    logger.debug(f"Skipped relationship - target UUID {target_uuid} not found in node mapping")
                    except Exception as e:
                        logger.warning(f"Error processing relationship: {str(e)}")
                        skipped_relationships += 1
                
                logger.info(f"Added {added_relationships} relationships, skipped {skipped_relationships} relationships due to missing components")
            
            # Update graph data
            graph_data['nodes'].extend(nodes)
            graph_data['links'].extend(links)
            
            # Log successful format detection for future reference
            format_detected = "unknown"
            if 'components' in sbom_content:
                format_detected = "standard components array"
            elif 'graph' in sbom_content and 'nodes' in sbom_content['graph']:
                format_detected = "graph.nodes format"
            elif 'metadata' in sbom_content and 'component' in sbom_content:
                format_detected = "CycloneDX format"
            elif 'packages' in sbom_content and isinstance(sbom_content['packages'], list):
                format_detected = "SPDX format"
            elif 'bomFormat' in sbom_content and 'components' in sbom_content:
                format_detected = "CycloneDX-like format"
            elif 'data' in sbom_content and isinstance(sbom_content['data'], dict):
                if 'components' in sbom_content['data']:
                    format_detected = "nested data.components format" 
                elif 'packages' in sbom_content['data']:
                    format_detected = "nested data.packages format"
                    
            logger.info(f"Successfully processed SBOM '{sbom_name}' with format: {format_detected}")
            
            return jsonify({
                'success': True,
                'sbom_id': sbom_id,
                'sbom_name': sbom_name,
                'nodes': len(nodes),
                'links': len(links),
                'format_detected': format_detected
            }), 200
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error: {str(e)}")
            return jsonify({'error': f'Invalid JSON format: {str(e)}'}), 400
            
        except Exception as e:
            logger.error(f"Error processing SBOM: {str(e)}", exc_info=True)
            return jsonify({'error': f'Error processing SBOM: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/sboms', methods=['GET'])
def get_sboms():
    logger.info(f"Returning list of {len(sboms)} SBOMs")
    return jsonify(list(sboms.values()))

@app.route('/sbom/<sbom_id>', methods=['DELETE'])
def delete_sbom(sbom_id):
    try:
        logger.info(f"Request to delete SBOM: {sbom_id}")
        
        if sbom_id not in sboms:
            logger.warning(f"SBOM not found for deletion: {sbom_id}")
            return jsonify({'error': 'SBOM not found'}), 404
        
        # Remove from sboms collection
        deleted_sbom = sboms.pop(sbom_id)
        logger.info(f"Deleted SBOM {deleted_sbom['name']} from storage")
        
        # Remove nodes and links for this SBOM from graph data
        graph_data['nodes'] = [node for node in graph_data['nodes'] if node['sbom'] != sbom_id]
        graph_data['links'] = [link for link in graph_data['links'] if link['sbom'] != sbom_id]
        logger.info(f"Removed SBOM {sbom_id} nodes and links from graph data")
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error deleting SBOM {sbom_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/graph', methods=['GET'])
def get_graph():
    try:
        logger.info(f"Returning graph data with {len(graph_data['nodes'])} nodes and {len(graph_data['links'])} links")
        return jsonify(graph_data)
        
    except Exception as e:
        logger.error(f"Error returning graph data: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

if __name__ == '__main__':
    logger.info("Starting Visfactant application server")
    app.run(debug=True) 