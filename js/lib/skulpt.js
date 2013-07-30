/**
 * @fileOverview A JavaScript sculpting script for sculpting Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 * 
 * Probably only works for flat planes now. Need to check with spherical objects.
 * This file still needs some clean up and checking.
 */

//===================================
// SKULPT LAYERS
//===================================

/**
 * Sculpting layer for a SkulptMesh
 * @constructor
 * @param {SkulptMesh} mesh
 */
function SkulptLayer(skulptMesh) {
    this.__skulptMesh = skulptMesh;

    this.data = [];

    this.__simplex = undefined;

    this.__init();
}
SkulptLayer.prototype.__init = function () {
    this.clear();
};
SkulptLayer.prototype.loadFromImageData = function (imageData, amount, midGreyIsLowest) {

    //read the image data and use that as height
    var vertices = this.__skulptMesh.__mesh.geometry.vertices;
    var normalizedHeight;
    var min = 99999;
    var i, len;
    for (i = 0, len = vertices.length; i < len; i++) {

        if (midGreyIsLowest) {
            normalizedHeight = Math.abs(imageData[i * 4] / 255.0 - 0.5);
        } else {
            normalizedHeight = imageData[i * 4] / 255.0;
        }
        this.data[i] = normalizedHeight * amount;

        //store min
        //FIXME: this assumes that it's a flat plane again...
        if (this.data[i] < min) {
            min = this.data[i];
        }
    }

    //shift down so that min is at 0
    for (i = 0, len = vertices.length; i < len; i++) {
        this.data[i] -= min;
    }

    //update whole mesh
    this.__skulptMesh.updateAll();
};
SkulptLayer.prototype.addNoise = function (amp, freqX, freqY, freqZ, offsetX, offsetY, offsetZ) {

    amp = amp || 1;
    freqX = freqX || 1;
    freqY = freqY || 1;
    freqZ = freqZ || 1;
    offsetX = offsetX || 0;
    offsetY = offsetY || 0;
    offsetZ = offsetZ || 0;

    if (!this.__simplex) {
        this.__simplex = new SimplexNoise();
    }

    //apply noise
    //TODO: use FBm instead
    var vertices = this.__skulptMesh.__mesh.geometry.vertices;
    var i, len, vertex;
    var min = 99999;
    for (i = 0, len = vertices.length; i < len; i++) {
        vertex = vertices[i];
        this.data[i] = (this.__simplex.noise3d(freqX * vertex.x + offsetX, freqY * vertex.y + offsetY, freqZ * vertex.z + offsetZ) / 2.0 + 0.5) * amp;
        //FIXME: this assumes that it's a flat plane again...
        if (this.data[i] < min) {
            min = this.data[i];
        }
    }

    //shift down so that min is at 0
    for (i = 0, len = vertices.length; i < len; i++) {
        this.data[i] -= min;
    }

    //update whole mesh
    this.__skulptMesh.updateAll();
};
SkulptLayer.prototype.clear = function () {
    var i, len;
    for (i = 0, len = this.__skulptMesh.__mesh.geometry.vertices.length; i < len; i++) {
        this.data[i] = 0;
    }
};

//===================================
// SKULPT MESHES
//===================================

/**
 * An abstract class for sculptable meshes
 * @constructor
 * @param {THREE.Mesh} mesh
 */
function SkulptMesh(mesh) {
    this.__mesh = mesh;
    this.__layers = {};
    this.__currLayer = undefined;
    this.__displacements = [];  //need to always keep this in sync

    //temp variables to prevent recreation every frame
    this.__worldMatInv = new THREE.Matrix4();
    this.__localPos = new THREE.Vector3();

    this.__init();
}
SkulptMesh.prototype.__init = function () {
    var i, len;
    for (i = 0, len = this.__mesh.geometry.vertices.length; i < len; i++) {
        this.__displacements[i] = 0;
    }
};
SkulptMesh.prototype.addLayer = function (name) {
    if (Object.keys(this.__layers).indexOf(name) !== -1) {
        throw new Error('Layer name already exists: ' + name);
    }
    this.__layers[name] = new SkulptLayer(this);
    this.__currLayer = this.__layers[name];
    return this.__layers[name];
};
SkulptMesh.prototype.removeLayer = function (name) {
    //TODO
};
SkulptMesh.prototype.getCurrLayer = function () {
    return this.__currLayer;
};
SkulptMesh.prototype.setCurrLayer = function () {
    //TODO
};
SkulptMesh.prototype.clearCurrLayer = function () {
    this.__currLayer.clear();
    this.updateAll();
};
SkulptMesh.prototype.getDisplacements = function () {
    return this.__displacements;
};
SkulptMesh.prototype.getAffectedVertexInfo = function (position) {
    throw new Error('Abstract method not implemented');
};
SkulptMesh.prototype.update = function (position) {
    throw new Error('Abstract method not implemented');
};
SkulptMesh.prototype.updateAll = function () {
    throw new Error('Abstract method not implemented');
};

/**
 * A sculptable flat plane mesh
 * @constructor
 * @extends {SkulptMesh}
 * @param {THREE.Mesh} mesh
 * @param {number} size
 * @param {number} res
 */
function SkulptTerrainMesh(mesh, size, res) {
    SkulptMesh.call(this, mesh);
    this.__size = size;
    this.__halfSize = size / 2.0;
    this.__res = res;
    this.__stepSize = size / res;
}
SkulptTerrainMesh.prototype = Object.create(SkulptMesh.prototype);
SkulptTerrainMesh.prototype.constructor = SkulptTerrainMesh;
/**
 * Calculates vertex id on this terrain using x and z values in local space
 * @param  {number} x
 * @param  {number} z
 * @return {number}
 */
SkulptTerrainMesh.prototype.__calcTerrainVertexId = function (x, z) {
    var row = Math.floor((z + this.__halfSize) / this.__size * this.__res);
    var col = Math.floor((x + this.__halfSize) / this.__size * this.__res);
    return (row * this.__res) + col;
};
SkulptTerrainMesh.prototype.getAffectedVertexInfo = function (position, radius) {

    //convert back to local space first
    this.__worldMatInv.getInverse(this.__mesh.matrixWorld);
    this.__localPos.copy(position).applyMatrix4(this.__worldMatInv);

    var centerX = this.__localPos.x;
    var centerZ = this.__localPos.z;

    //find all vertices that are in radius
    //iterate in the square with width of 2*radius first
    var affectedVertexInfos = [];
    var dist;
    var x, z;
    for (x = -radius; x <= radius; x += this.__stepSize) {
        for (z = -radius; z <= radius; z += this.__stepSize) {
            dist = Math.sqrt(x * x + z * z);
            if (dist < radius) { //within the circle
                //get vertex id for this (x, z) point
                var vertexId = this.__calcTerrainVertexId(centerX + x, centerZ + z);
                var vertex = this.__mesh.geometry.vertices[vertexId];
                if (vertex) {
                    //add to current layer
                    var vertexInfo = {
                        id: vertexId,
                        weight: dist / radius
                    };
                    affectedVertexInfos.push(vertexInfo);
                }
            }
        }
    }

    return affectedVertexInfos;
};
SkulptTerrainMesh.prototype.update = function (affectedVertexInfos) {

    var geom = this.__mesh.geometry;

    var affectedVertexInfo;
    var i, len;
    for (i = 0, len = affectedVertexInfos.length; i < len; i++) {

        affectedVertexInfo = affectedVertexInfos[i];

        //sum all layers
        var layer, layerName;
        var sum = 0;
        for (layerName in this.__layers) {
            if (this.__layers.hasOwnProperty(layerName)) {
                layer = this.__layers[layerName];
                sum += layer.data[affectedVertexInfo.id];
            }
        }

        //keep this.__displacements in sync
        this.__displacements[affectedVertexInfo.id] = sum;

        //TODO: push towards normal instead of just y
        var vertex = geom.vertices[affectedVertexInfo.id];
        vertex.y = sum;
    }

    //update terrain geometry
    geom.verticesNeedUpdate = true;
    geom.computeFaceNormals();
    geom.computeVertexNormals();
    geom.normalsNeedUpdate = true;
};
SkulptTerrainMesh.prototype.updateAll = function () {

    var geom = this.__mesh.geometry;

    var i, len;
    for (i = 0, len = geom.vertices.length; i < len; i++) {

        //sum all layers
        var layer, layerName;
        var sum = 0;
        for (layerName in this.__layers) {
            if (this.__layers.hasOwnProperty(layerName)) {
                layer = this.__layers[layerName];
                sum += layer.data[i];
            }
        }

        //keep this.__displacements in sync
        this.__displacements[i] = sum;

        //TODO: push towards normal instead of just y
        var vertex = geom.vertices[i];
        vertex.y = sum;
    }

    //update terrain geometry
    geom.verticesNeedUpdate = true;
    geom.computeFaceNormals();
    geom.computeVertexNormals();
    geom.normalsNeedUpdate = true;
};

//===================================
// SKULPT CURSORS
//===================================

/**
 * Abstract class for cursors
 * @constructor
 * @param {number} size
 * @param {number} amount
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
SkulptCursor.prototype.update = function (position, skulptMesh) {
    throw new Error('Abstract method not implemented');
};

/**
 * Brush cursor that is created from a THREE.Mesh
 * @constructor
 * @extends {SkulptCursor}
 * @param {number} size
 * @param {number} amount
 * @param {THREE.Scene} scene
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

    //temp variables to avoid recreation every frame
    this.__pos = new THREE.Vector3();
    this.__matInv = new THREE.Matrix4();
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
/**
 * Updates the cursor to <tt>position</tt>
 * @param  {THREE.Vector3} position - world space position
 * @param  {SkulptMesh} skulptMesh
 */
SkulptMeshCursor.prototype.update = function (position, skulptMesh) {

    //move cursor to position
    this.__pos.copy(position);
    if (this.__scene instanceof THREE.Object3D) {
        this.__pos.applyMatrix4(this.__matInv.getInverse(this.__scene.matrixWorld));
    }
    this.__cursorMesh.position.copy(this.__pos);

    //rotate cursor to same orientation as skulptMesh
    //TODO: orient to geom normal instead
    this.__cursorMesh.rotation.copy(skulptMesh.__mesh.rotation);

    //store some transformation matrices for getting from one space to another
    var cursorWorldMat = this.__cursorMesh.matrixWorld;
    var cursorWorldMatInv = new THREE.Matrix4().getInverse(cursorWorldMat);
    var meshWorldMat = skulptMesh.__mesh.matrixWorld;
    var meshWorldMatInv = new THREE.Matrix4().getInverse(meshWorldMat);
    var cursorLocalToMeshLocalMat = new THREE.Matrix4().multiplyMatrices(meshWorldMatInv, cursorWorldMat);
    var meshLocalToCursorLocalMatInv = new THREE.Matrix4().multiplyMatrices(cursorWorldMatInv, meshWorldMat);

    var displacements = skulptMesh.getDisplacements();
    var i, len;
    for (i = 0, len = this.__cursorGeom.vertices.length; i < len; i++) {

        var brushGeomVertex = this.__cursorGeom.vertices[i];

        //transform from local space of cursor to local space of skulptMesh
        brushGeomVertex.applyMatrix4(cursorLocalToMeshLocalMat);

        //get nearest terrain geom vertex id
        var terrainVertexId = skulptMesh.__calcTerrainVertexId(brushGeomVertex.x, brushGeomVertex.z);

        //get height of current terrain at that point
        brushGeomVertex.y = displacements[terrainVertexId];

        //transform from local space of skulptMesh back to local space of cursor
        brushGeomVertex.applyMatrix4(meshLocalToCursorLocalMatInv);
    }

    //offset top row using sculpt amount to give thickness
    for (i = 0; i < this.__brushGeomVertexCountHalf; i++) {
        this.__cursorGeom.vertices[i].y = this.__cursorGeom.vertices[i + this.__brushGeomVertexCountHalf].y + 1;
    }

    //update cursor geom
    this.__cursorGeom.verticesNeedUpdate = true;
};

//===================================
// SKULPT PROFILES
//===================================

/**
 * Abstract class for sculpt profiles
 * @constructor
 */
function SkulptProfile() { }
/**
 * Returns a value based on given <tt>weight</tt>
 * @abstract
 * @param  {number} weight - a 0 - 1 float number that determines the returned value
 * @return {number}
 */
SkulptProfile.prototype.getValue = function (weight) {
    throw new Error('Abstract method not implemented');
};

/**
 * Sculpt profile that is based on a cosine curve
 * @constructor
 * @extends {SkulptProfile}
 */
function CosineSkulptProfile() {
    SkulptProfile.call(this);
    this.__halfPi = Math.PI / 2.0;
}
CosineSkulptProfile.prototype = Object.create(SkulptProfile.prototype);
CosineSkulptProfile.prototype.constructor = CosineSkulptProfile;
CosineSkulptProfile.prototype.getValue = function (weight) {
    return Math.cos(weight * this.__halfPi);
};

/**
 * Sculpt profile that is based on constant value of 1
 * @constructor
 * @extends {SkulptProfile}
 */
function ConstantSkulptProfile() {
    SkulptProfile.call(this);
}
ConstantSkulptProfile.prototype = Object.create(SkulptProfile.prototype);
ConstantSkulptProfile.prototype.constructor = ConstantSkulptProfile;
ConstantSkulptProfile.prototype.getValue = function (weight) {
    return 1;
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
SkulptBrush.prototype.sculpt = function (mesh, position, profile) {
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
SkulptBrush.prototype.updateCursor = function (position, skulptMesh) {
    this.__cursor.update(position, skulptMesh);
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
SkulptAddBrush.prototype.sculpt = function (mesh, position, profile) {

    var layer = mesh.getCurrLayer();
    var radius = this.getSize() / 2.0;
    var amount = this.getAmount();
    var displacements = mesh.getDisplacements();
    var affectedVertexInfos = mesh.getAffectedVertexInfo(position, radius);
    var vertexInfo;
    var i, len, delta;
    for (i = 0, len = affectedVertexInfos.length; i < len; i++) {

        vertexInfo = affectedVertexInfos[i];

        //store current total displacement
        affectedVertexInfos[i].oldDisplacement = displacements[vertexInfo.id];

        //modify layer displacement
        delta = amount * profile.getValue(vertexInfo.weight);
        layer.data[vertexInfo.id] += delta;

        //store new displacement
        affectedVertexInfos[i].newDisplacement = affectedVertexInfos[i].oldDisplacement + delta;
    }

    //update the mesh at the affected vertices
    mesh.update(affectedVertexInfos);

    //return affectedVertexInfos in case the data is needed outside this function
    return affectedVertexInfos;
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
SkulptRemoveBrush.prototype.sculpt = function (mesh, position, profile) {

    var layer = mesh.getCurrLayer();
    var radius = this.getSize() / 2.0;
    var amount = this.getAmount();
    var displacements = mesh.getDisplacements();
    var affectedVertexInfos = mesh.getAffectedVertexInfo(position, radius);

    var sumOtherLayersForThisVertex;
    var vertexInfo;
    var i, len, delta;
    for (i = 0, len = affectedVertexInfos.length; i < len; i++) {

        vertexInfo = affectedVertexInfos[i];

        //store current total displacement
        affectedVertexInfos[i].oldDisplacement = displacements[vertexInfo.id];

        //find the sum of all other layers
        sumOtherLayersForThisVertex = displacements[vertexInfo.id] - layer.data[vertexInfo.id];

        //modify displacement amount in-place
        delta = -(amount * profile.getValue(vertexInfo.weight));
        layer.data[vertexInfo.id] += delta;

        //prevent going below 0
        if (layer.data[vertexInfo.id] + sumOtherLayersForThisVertex < 0) {
            //just set to negative of the other layers will set the sum to 0
            layer.data[vertexInfo.id] = -sumOtherLayersForThisVertex;
        }

        //store new displacement
        affectedVertexInfos[i].newDisplacement = affectedVertexInfos[i].oldDisplacement + delta;
    }

    //update the mesh at the affected vertices
    mesh.update(affectedVertexInfos);

    //return affectedVertexInfos in case the data is needed outside this function
    return affectedVertexInfos;
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
SkulptFlattenBrush.prototype.sculpt = function (mesh, position, profile) {

    var layer = mesh.getCurrLayer();
    var radius = this.getSize() / 2.0;
    var affectedVertexInfos = mesh.getAffectedVertexInfo(position, radius);
    var displacements = mesh.getDisplacements();

    //calculate average displacements
    var totalAffectedDisplacements = 0;
    var vertexInfo;
    var i, len;
    for (i = 0, len = affectedVertexInfos.length; i < len; i++) {
        vertexInfo = affectedVertexInfos[i];
        totalAffectedDisplacements += displacements[vertexInfo.id];
    }
    var averageDisp = totalAffectedDisplacements / affectedVertexInfos.length;

    //blend average displacement with existing displacement to flatten
    var modulator, currDisp, newDisp, dispFromOtherLayers, prev;
    for (i = 0, len = affectedVertexInfos.length; i < len; i++) {

        vertexInfo = affectedVertexInfos[i];
        modulator = profile.getValue(vertexInfo.weight);
        currDisp = displacements[vertexInfo.id];

        //store current total displacement
        affectedVertexInfos[i].oldDisplacement = displacements[vertexInfo.id];

        //store displacements from other layers
        dispFromOtherLayers = currDisp - layer.data[vertexInfo.id];

        //calculate new displacements
        prev = layer.data[vertexInfo.id];
        layer.data[vertexInfo.id] = modulator * averageDisp + (1 - modulator) * currDisp;

        //need to subtract away all the other layers to force flattening
        layer.data[vertexInfo.id] -= dispFromOtherLayers;

        //store new displacement
        affectedVertexInfos[i].newDisplacement = affectedVertexInfos[i].oldDisplacement + (layer.data[vertexInfo.id] - prev);
    }

    //update the mesh at the affected vertices
    mesh.update(affectedVertexInfos);

    //return affectedVertexInfos in case the data is needed outside this function
    return affectedVertexInfos;
};

//===================================
// SKULPT
//===================================

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
    };  //TODO: probably should be managed by a singleton
    this.__currBrush = this.__brushes[Object.keys(this.__brushes)[0]];
    this.__currProfile = new CosineSkulptProfile(); //TODO: methods for profile, probably should be managed by a singleton
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
    //TODO: let the singleton manager do this
    var brushId;
    for (brushId in this.__brushes) {
        if (this.__brushes.hasOwnProperty(brushId)) {
            var brush = this.__brushes[brushId];
            brush.setSize(size);
        }
    }
};
Skulpt.prototype.getBrushAmount = function () {
    return this.__currBrush.getAmount();
};
Skulpt.prototype.setBrushAmount = function (amount) {
    //TODO: let the singleton manager do this
    var brushId;
    for (brushId in this.__brushes) {
        if (this.__brushes.hasOwnProperty(brushId)) {
            var brush = this.__brushes[brushId];
            brush.setAmount(amount);
        }
    }
};
Skulpt.prototype.updateCursor = function (position, mesh) {
    this.__currBrush.updateCursor(position, mesh);
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
Skulpt.prototype.sculpt = function (position) {
    return this.__currBrush.sculpt(this.__currMesh, position, this.__currProfile);
};
// Skulpt.prototype.export = function()
// {

// }
// Skulpt.prototype.import = function()
// {

// }
