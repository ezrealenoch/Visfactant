# Visfactant - SBOM Visualization Tool

Visfactant is a web-based application for visualizing Software Bill of Materials (SBOM) and their dependencies. It provides an interactive, scalable visualization that helps identify common dependencies and relationships between software components.

## Features

- Interactive visualization of SBOM components and their dependencies
- Support for large datasets with thousands of components
- Visual cues for identifying common dependencies (size-based node rendering)
- Interactive zooming, panning, and filtering
- Detailed component information display
- Search functionality to locate specific components

## Requirements

- Python 3.6 or higher
- Flask and other Python dependencies (listed in requirements.txt)

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/visfactant.git
cd visfactant
```

2. Create and activate a virtual environment (optional but recommended):
```
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install the required dependencies:
```
pip install -r requirements.txt
```

## Usage

1. Start the Flask application:
```
python app.py
```

2. Open your web browser and navigate to:
```
http://localhost:5000
```

3. Upload an SBOM JSON file through the interface.

4. Explore the visualization:
   - Zoom: Use the mouse wheel or pinch gesture
   - Pan: Click and drag on empty space
   - Select: Click on nodes to view detailed information
   - Search: Use the search box to find specific components
   - Filter: Toggle visibility of different component types
   - Size nodes by: Choose between fixed size, connections count, or file size

## Sample Data

The application comes with sample SBOM files in the `samples` directory that you can use to test the visualization capabilities.

## Technical Details

### Architecture

Visfactant follows a three-tier architecture:

1. **Data Ingestion & Processing Layer**
   - Parses SBOM JSON files and converts them to a graph model

2. **Business Logic / Backend Layer**
   - Python Flask application providing API endpoints for file upload and graph data

3. **Presentation / Frontend Layer**
   - D3.js-based interactive visualization

### Implementation Notes

- The backend uses Python with Flask for serving the application and processing SBOM data
- The frontend uses D3.js for graph visualization and Bootstrap for UI components
- NetworkX is used for graph processing on the backend

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- D3.js for the powerful visualization library
- Flask for the lightweight web framework 