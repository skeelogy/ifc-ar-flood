/**
 * @fileOverview A JavaScript sculpting script for sculpting Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 */

//===================================
// SKULPT LAYERS
//===================================

function SkulptLayer(mesh) {
    this.data = [];
    this.__init(mesh.geometry.vertices.length);
}
SkulptLayer.prototype.__init = function (len) {
    var i;
    for (i = 0; i < len; i++) {
        this.data[i] = 0;
    }
};
SkulptLayer.prototype.loadFromImage = function () {
    //TODO
};
SkulptLayer.prototype.addNoise = function () {
    //TODO
};
SkulptLayer.prototype.clear = function () {
    //TODO
};

//===================================
// SKULPT MESHES
//===================================

function SkulptMesh(mesh) {
    this.__mesh = mesh;
    this.__layers = {};
    this.__currLayer = undefined;
}
SkulptMesh.prototype.addLayer = function (name) {
    if (Object.keys(this.__layers).indexOf(name) !== -1) {
        throw new Error('Layer name already exists: ' + name);
    }
    this.__layers[name] = new SkulptLayer(this.__mesh);
    this.__currLayer = this.__layers[name];
};
SkulptMesh.prototype.removeLayer = function (name) {
    //TODO
};
SkulptMesh.prototype.sculptAdd = function (position, brush) {
    throw new Error('Abstract method not implemented');
};
SkulptMesh.prototype.update = function (position) {
    throw new Error('Abstract method not implemented');
};

function SkulptTerrainMesh(mesh, size, res) {
    SkulptMesh.call(this, mesh);
    this.__size = size;
    this.__res = res;
    this.__stepSize = size / res;
}
SkulptTerrainMesh.prototype = Object.create(SkulptMesh.prototype);
SkulptTerrainMesh.prototype.constructor = SkulptTerrainMesh;
SkulptTerrainMesh.prototype.sculptAdd = function (position, brush) {

    console.log('sculpt add');

    var centerX = position.x;
    var centerZ = position.z;

    var geom = this.__mesh.geometry;
    var amount = brush.getAmount();

    //find all vertices that are in radius
    //iterate in the square with width of 2*radius first
    var radius = brush.getSize() / 2.0;
    var dist;
    var x, z;
    for (x = -radius; x <= radius; x += this.__stepSize)
    {
        for (z = -radius; z <= radius; z += this.__stepSize)
        {
            dist = Math.sqrt(x * x + z * z);
            if (dist < radius)  //within the circle
            {
                //get vertex id for this (x, z) point
                var vertexId = calcTerrainVertexId(centerX+x, centerZ+z);
                var vertex = geom.vertices[vertexId];
                if (vertex)  //check that a vertex with this vertexId exists
                {
                    //add amount based on distance, using cosine curve
                    var fractionOf90Deg = dist / radius * Math.PI / 2.0;

                    //add to current layer
                    this.__currLayer.data[vertexId] += amount * Math.cos(fractionOf90Deg);

                    //TODO: different profile curves

                    //sum all layers
                    var layer;
                    var sum = 0;
                    for (layerId in this.__layers)
                    {
                        layer = this.__layers[layerId];
                        sum += layer.data[vertexId];
                    }
                    vertex.y = sum;
                }
            }
        }
    }

    //update terrain geometry
    updateGeometry(geom, true);
};

//===================================
// SKULPT CURSORS
//===================================

/**
 * Abstract class for cursors
 * @constructor
 */
function SkulptCursor(size, amount) {
    this.__size = size || 1.0;
    this.__amount = amount || 1.0;
}
SkulptCursor.prototype.getSize = function () {
    return this.__size;
};
SkulptCursor.prototype.setSize = function (size) {
    this.__size = size;
};
SkulptCursor.prototype.getAmount = function () {
    return this.__amount;
};
SkulptCursor.prototype.setAmount = function (amount) {
    this.__amount = amount;
};
SkulptCursor.prototype.show = function () {
    throw new Error('Abstract method not implemented');
};
SkulptCursor.prototype.hide = function () {
    throw new Error('Abstract method not implemented');
};
SkulptCursor.prototype.update = function (x, y, z, geom) {
    throw new Error('Abstract method not implemented');
};

/**
 * Brush cursor that is created from a THREE.Mesh
 * @constructor
 * @implements {SkulptCursor}
 * @param {THREE.Scene} scene
 * @param {number} size
 * @param {number} amount
 * @param {number} radiusSegments
 */
function SkulptMeshCursor(size, amount, scene, radiusSegments) {

    SkulptCursor.call(this, size, amount);

    if (!scene) {
        throw new Error('scene not specified');
    }
    this.__scene = scene;
    this.__radiusSegments = radiusSegments || 32;

    //create the cursor mesh
    this.__createMesh();

    //hide the mesh by default
    this.hide();
}
SkulptMeshCursor.prototype = Object.create(SkulptCursor.prototype);
SkulptMeshCursor.prototype.constructor = SkulptMeshCursor;
SkulptMeshCursor.prototype.__createMesh = function () {
    this.__cursorGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, this.__radiusSegments, 1, true);
    this.__brushGeomVertexCountHalf = this.__cursorGeom.vertices.length / 2.0;
    var brushMaterial = new THREE.MeshBasicMaterial({color: '#000000'});
    brushMaterial.wireframe = true;
    this.__cursorMesh = new THREE.Mesh(this.__cursorGeom, brushMaterial);
    this.__cursorMesh.castShadow = false;
    this.__cursorMesh.receiveShadow = false;

    this.__cursorMesh.add(new THREE.AxisHelper(1));

    this.__scene.add(this.__cursorMesh);
};
SkulptCursor.prototype.setSize = function (size) {
    this.__size = size;
    this.__cursorMesh.scale.x = size;
    this.__cursorMesh.scale.z = size;
};
SkulptCursor.prototype.setAmount = function (amount) {
    this.__amount = amount;
    this.__cursorMesh.scale.y = amount;
};
SkulptMeshCursor.prototype.show = function () {
    this.__cursorMesh.visible = true;
};
SkulptMeshCursor.prototype.hide = function () {
    this.__cursorMesh.visible = false;
};
SkulptMeshCursor.prototype.update = function (x, y, z, geom) {
    
    //TODO: check if arguments are really needed or not

    //move cursor to position
    this.__cursorMesh.position.set(x, y, z);

    //NOTE: Below algo works when using this.__cursorMesh.position but not this.__cursorMesh.matrixWorld. The former is better anyway because there's no need to find matrix inverse.
    //var brushMeshMatrixWorldInverse = new THREE.Matrix4().getInverse(this.__cursorMesh.matrixWorld);
    var i;
    var len = this.__cursorGeom.vertices.length;
    for (i = 0; i < len; i++) {

        //get position of this brush geom vertex
        var brushGeomVertex = this.__cursorGeom.vertices[i];

        //get world space position (by adding position as offset)
        var brushGeomVertexWorld = new THREE.Vector3().copy(brushGeomVertex);
        //brushGeomVertexWorld.applyMatrix4(this.__cursorMesh.matrixWorld);
        brushGeomVertexWorld.setX(brushGeomVertexWorld.x * this.__cursorMesh.scale.x);
        brushGeomVertexWorld.setZ(brushGeomVertexWorld.z * this.__cursorMesh.scale.z);
        brushGeomVertexWorld.add(this.__cursorMesh.position);

        //get nearest terrain geom vertex id
        //TODO: calcTerrainVertexId function
        var terrainVertexId = calcTerrainVertexId(brushGeomVertexWorld.x, brushGeomVertexWorld.z);

        //get y in brush geom's local space
        var brushGeomVertexLocal;
        if (geom.vertices[terrainVertexId]) {
            brushGeomVertexLocal = new THREE.Vector3().copy(geom.vertices[terrainVertexId]);
        } else {
            //have to use brush vertex if unable to index into terrain vertex
            brushGeomVertexLocal = brushGeomVertexWorld;
        }
        //brushGeomVertexLocal.applyMatrix4(brushMeshMatrixWorldInverse);
        brushGeomVertexLocal.sub(this.__cursorMesh.position);
        brushGeomVertexWorld.setX(brushGeomVertexWorld.x / this.__cursorMesh.scale.x);
        brushGeomVertexWorld.setZ(brushGeomVertexWorld.z / this.__cursorMesh.scale.z);

        //finally write brush geom vertex y in local space
        brushGeomVertex.y = brushGeomVertexLocal.y;
    }

    //offset top row using sculpt amount to give thickness
    for (i = 0; i < this.__brushGeomVertexCountHalf; i++) {
        this.__cursorGeom.vertices[i].y = this.__cursorGeom.vertices[i + this.__brushGeomVertexCountHalf].y + this.__amount;
    }

    //update brush geom
    //TODO: updateGeometry function
    updateGeometry(this.__cursorGeom, false);
};

//===================================
// SKULPT BRUSHES
//===================================

/**
 * Abstract class for sculpt brushes
 * @constructor
 * @param {number} size
 */
function SkulptBrush(size, amount, scene) {
    this.__cursor = new SkulptMeshCursor(size, amount, scene);
}
/**
 * Performs sculpting
 * @abstract
 */
SkulptBrush.prototype.sculpt = function () {
    throw new Error('Abstract method not implemented');
};
SkulptBrush.prototype.getSize = function (size) {
    return this.__cursor.getSize();
};
SkulptBrush.prototype.setSize = function (size) {
    this.__cursor.setSize(size);
};
SkulptBrush.prototype.getAmount = function (amount) {
    return this.__cursor.getAmount();
};
SkulptBrush.prototype.setAmount = function (amount) {
    this.__cursor.setAmount(amount);
};
SkulptBrush.prototype.showCursor = function () {
    this.__cursor.show();
};
SkulptBrush.prototype.hideCursor = function () {
    this.__cursor.hide();
};
SkulptBrush.prototype.updateCursor = function (x, y, z, geom) {
    this.__cursor.update(x, y, z, geom);
};

/**
 * Sculpt brush that adds to a mesh
 * @constructor
 * @extends {SkulptBrush}
 * @param {number} size
 */
function SkulptAddBrush(size, amount, scene) {
    SkulptBrush.call(this, size, amount, scene);
}
SkulptAddBrush.prototype = Object.create(SkulptBrush.prototype);
SkulptAddBrush.prototype.constructor = SkulptAddBrush;
/**
 * Performs sculpting
 * @override
 */
SkulptAddBrush.prototype.sculpt = function (mesh, position) {
    //ask the mesh to sculpt itself so that we can handle different types of meshes using the same brush
    mesh.sculptAdd(position, this);
};

/**
 * Sculpt brush that removes from a mesh
 * @constructor
 * @extends {SkulptBrush}
 * @param {number} size
 */
function SkulptRemoveBrush(size, amount, scene) {
    SkulptBrush.call(this, size, amount, scene);
}
SkulptRemoveBrush.prototype = Object.create(SkulptBrush.prototype);
SkulptRemoveBrush.prototype.constructor = SkulptRemoveBrush;
/**
 * Performs sculpting
 * @override
 */
SkulptRemoveBrush.prototype.sculpt = function (mesh, position) {
    //ask the mesh to sculpt itself so that we can handle different types of meshes using the same brush
    mesh.sculptRemove(position, this);
};

/**
 * Sculpt brush that flattens a mesh
 * @constructor
 * @extends {SkulptBrush}
 * @param {number} size
 */
function SkulptFlattenBrush(size, amount, scene) {
    SkulptBrush.call(this, size, amount, scene);
}
SkulptFlattenBrush.prototype = Object.create(SkulptBrush.prototype);
SkulptFlattenBrush.prototype.constructor = SkulptFlattenBrush;
/**
 * Performs sculpting
 * @override
 */
SkulptFlattenBrush.prototype.sculpt = function (mesh, position) {
    //ask the mesh to sculpt itself so that we can handle different types of meshes using the same brush
    mesh.sculptFlatten(position, this);
};

/**
 * Creates a Skulpt instance that manages sculpting
 * @constructor
 * @param {THREE.Scene} scene - main scene to add meshes
 */
function Skulpt(scene) {
    if (!scene) {
        throw new Error('scene not specified');
    }
    this.__scene = scene;

    this.__meshes = {};
    this.__currMesh = undefined;  //defined when intersection test is done
    this.__brushes = {
        'add': new SkulptAddBrush(1.0, 1.0, scene),
        'remove': new SkulptRemoveBrush(1.0, 1.0, scene),
        'flatten': new SkulptFlattenBrush(1.0, 1.0, scene)
    };
    this.__currBrush = this.__brushes[Object.keys(this.__brushes)[0]];
    this.__cursor = new SkulptCursor(scene);
}
/**
 * Adds a mesh with name <tt>name</tt>
 * @param  {SkulptMesh} skulptMesh
 * @param  {string} name
 */
Skulpt.prototype.addMesh = function (skulptMesh, name) {
    if (!(skulptMesh instanceof SkulptMesh)) {
        throw new Error('skulptMesh must be of type SkulptMesh');
    }
    if (Object.keys(this.__meshes).indexOf(name) !== -1) {
        throw new Error('Skulpt mesh name already exists: ' + name);
    }
    this.__meshes[name] = skulptMesh;
    this.__currMesh = skulptMesh;
};
Skulpt.prototype.getMesh = function (name) {
    if (Object.keys(this.__meshes).indexOf(name) === -1) {
        throw new Error('Skulpt mesh name does not exist: ' + name);
    }
    return this.__meshes[name];
};
/**
 * Removes mesh with name <tt>name</tt>
 * @param  {string} name
 */
Skulpt.prototype.removeMesh = function (name) {
    if (Object.keys(this.__meshes).indexOf(name) === -1) {
        throw new Error('Skulpt mesh name does not exist: ' + name);
    }
    delete this.__meshes[name];  //TODO: check this
};
/**
 * Set current brush to brush with name <tt>name</tt>
 * @param {string} name
 */
Skulpt.prototype.setBrush = function (name) {
    if (Object.keys(this.__brushes).indexOf(name) === -1) {
        throw new Error('Brush name not recognised: ' + name);
    }
    this.__currBrush = this.__brushes[name];
};
Skulpt.prototype.getBrushSize = function () {
    return this.__currBrush.getSize();
};
Skulpt.prototype.setBrushSize = function (size) {
    this.__currBrush.setSize(size);
};
Skulpt.prototype.getBrushAmount = function () {
    return this.__currBrush.getAmount();
};
Skulpt.prototype.setBrushAmount = function (amount) {
    this.__currBrush.setAmount(amount);
};
Skulpt.prototype.updateCursor = function (x, y, z, geom) {
    this.__currBrush.updateCursor(x, y, z, geom);
};
Skulpt.prototype.showCursor = function () {
    this.__currBrush.showCursor();
};
Skulpt.prototype.hideCursor = function () {
    this.__currBrush.hideCursor();
};
/**
 * Sculpts at <tt>position</tt> on the current mesh
 * @param {THREE.Vector3} position - position to sculpt at
 */
Skulpt.prototype.sculptAt = function (position) {
    this.__currBrush.sculpt(this.__currMesh, position);
};
// Skulpt.prototype.export = function()
// {

// }
// Skulpt.prototype.import = function()
// {

// }
