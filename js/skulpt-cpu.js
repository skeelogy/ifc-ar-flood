/**
 * @fileOverview A JavaScript sculpting script for sculpting Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 *
 * Probably only works for flat planes now. Need to check with spherical objects.
 * This file still needs some clean up and checking.
 */

/**
 * @namespace
 */
var SKULPTCPU = SKULPTCPU || { version: '1.0.0' };
console.log('Using SKULPTCPU ' + SKULPTCPU.version);

//===================================
// SKULPT LAYERS
//===================================

/**
 * Sculpting layer for a SKULPTCPU.SkulptMesh
 * @constructor
 * @param {SKULPTCPU.SkulptMesh} mesh
 */
SKULPTCPU.SkulptLayer = function (skulptMesh) {
    this.__skulptMesh = skulptMesh;

    this.data = [];

    this.__simplex = undefined;

    this.__init();
};
SKULPTCPU.SkulptLayer.prototype.__init = function () {
    this.clear();
};
/**
 * Loads terrain heights from an image data
 * @param  {array} imageData Image data
 * @param  {number} amount Height multiplier of read data
 * @param  {boolean} midGreyIsLowest Whether grey areas are considered the lowest parts instead of black
 */
SKULPTCPU.SkulptLayer.prototype.loadFromImageData = function (imageData, amount, midGreyIsLowest) {

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
/**
 * Adds noise to the layer
 * @param {number} amp Amplitude
 * @param {number} freqX Frequency X
 * @param {number} freqY Frequency Y
 * @param {number} freqZ Frequency Z
 * @param {number} offsetX Offset X
 * @param {number} offsetY Offset Y
 * @param {number} offsetZ Offset Z
 */
SKULPTCPU.SkulptLayer.prototype.addNoise = function (amp, freqX, freqY, freqZ, offsetX, offsetY, offsetZ) {

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
/**
 * Clears the layer
 */
SKULPTCPU.SkulptLayer.prototype.clear = function () {
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
SKULPTCPU.SkulptMesh = function (mesh) {
    this.__mesh = mesh;
    this.__layers = {};
    this.__currLayer = undefined;
    this.__displacements = [];  //need to always keep this in sync

    //temp variables to prevent recreation every frame
    this.__worldMatInv = new THREE.Matrix4();
    this.__localPos = new THREE.Vector3();

    this.__init();
};
SKULPTCPU.SkulptMesh.prototype.__init = function () {
    var i, len;
    for (i = 0, len = this.__mesh.geometry.vertices.length; i < len; i++) {
        this.__displacements[i] = 0;
    }
};
/**
 * Adds a sculpting layer
 * @param {string} name Name of the layer to add
 */
SKULPTCPU.SkulptMesh.prototype.addLayer = function (name) {
    if (Object.keys(this.__layers).indexOf(name) !== -1) {
        throw new Error('Layer name already exists: ' + name);
    }
    this.__layers[name] = new SKULPTCPU.SkulptLayer(this);
    this.__currLayer = this.__layers[name];
    return this.__layers[name];
};
/**
 * Removes layer
 * @param  {string} name Name of the layer to remove
 */
SKULPTCPU.SkulptMesh.prototype.removeLayer = function (name) {
    //TODO
};
/**
 * Gets current sculpting layer
 * @return {SKULPTCPU.SkulptLayer} Current sculpting layer
 */
SKULPTCPU.SkulptMesh.prototype.getCurrLayer = function () {
    return this.__currLayer;
};
/**
 * Sets current sculpting layer
 */
SKULPTCPU.SkulptMesh.prototype.setCurrLayer = function () {
    //TODO
};
/**
 * Clears current sculpting layer
 */
SKULPTCPU.SkulptMesh.prototype.clearCurrLayer = function () {
    this.__currLayer.clear();
    this.updateAll();
};
SKULPTCPU.SkulptMesh.prototype.getDisplacements = function () {
    return this.__displacements;
};
SKULPTCPU.SkulptMesh.prototype.getAffectedVertexInfo = function (position) {
    throw new Error('Abstract method not implemented');
};
SKULPTCPU.SkulptMesh.prototype.update = function (position) {
    throw new Error('Abstract method not implemented');
};
SKULPTCPU.SkulptMesh.prototype.updateAll = function () {
    throw new Error('Abstract method not implemented');
};

/**
 * A sculptable flat plane mesh
 * @constructor
 * @extends {SKULPTCPU.SkulptMesh}
 * @param {THREE.Mesh} mesh Mesh to use as the terrain mesh
 * @param {number} size Length of the mesh
 * @param {number} res Resolution of the mesh
 */
SKULPTCPU.SkulptTerrainMesh = function (mesh, size, res) {
    SKULPTCPU.SkulptMesh.call(this, mesh);
    this.__size = size;
    this.__halfSize = size / 2.0;
    this.__res = res;
    this.__stepSize = size / res;
};
SKULPTCPU.SkulptTerrainMesh.prototype = Object.create(SKULPTCPU.SkulptMesh.prototype);
SKULPTCPU.SkulptTerrainMesh.prototype.constructor = SKULPTCPU.SkulptTerrainMesh;
//Calculates vertex id on this terrain using x and z values in local space
SKULPTCPU.SkulptTerrainMesh.prototype.__calcTerrainVertexId = function (x, z) {
    var row = Math.floor((z + this.__halfSize) / this.__size * this.__res);
    var col = Math.floor((x + this.__halfSize) / this.__size * this.__res);
    return (row * this.__res) + col;
};
SKULPTCPU.SkulptTerrainMesh.prototype.getAffectedVertexInfo = function (position, radius) {

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
/**
 * Updates the terrain with the affected vertex info
 * @param  {array} affectedVertexInfos Array which contains a list of affected vertex info
 */
SKULPTCPU.SkulptTerrainMesh.prototype.update = function (affectedVertexInfos) {

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
/**
 * Updates all
 */
SKULPTCPU.SkulptTerrainMesh.prototype.updateAll = function () {

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
SKULPTCPU.SkulptCursor = function (size, amount) {
    this.__size = size || 1.0;
    this.__amount = amount || 1.0;
};
SKULPTCPU.SkulptCursor.prototype.getSize = function () {
    return this.__size;
};
SKULPTCPU.SkulptCursor.prototype.setSize = function (size) {
    this.__size = size;
};
SKULPTCPU.SkulptCursor.prototype.getAmount = function () {
    return this.__amount;
};
SKULPTCPU.SkulptCursor.prototype.setAmount = function (amount) {
    this.__amount = amount;
};
SKULPTCPU.SkulptCursor.prototype.show = function () {
    throw new Error('Abstract method not implemented');
};
SKULPTCPU.SkulptCursor.prototype.hide = function () {
    throw new Error('Abstract method not implemented');
};
SKULPTCPU.SkulptCursor.prototype.update = function (position, skulptMesh) {
    throw new Error('Abstract method not implemented');
};

/**
 * Brush cursor that is created from a THREE.Mesh
 * @constructor
 * @extends {SKULPTCPU.SkulptCursor}
 * @param {number} size
 * @param {number} amount
 * @param {THREE.Scene} scene
 * @param {number} radiusSegments
 */
SKULPTCPU.SkulptMeshCursor = function (size, amount, scene, radiusSegments) {

    SKULPTCPU.SkulptCursor.call(this, size, amount);

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
};
SKULPTCPU.SkulptMeshCursor.prototype = Object.create(SKULPTCPU.SkulptCursor.prototype);
SKULPTCPU.SkulptMeshCursor.prototype.constructor = SKULPTCPU.SkulptMeshCursor;
SKULPTCPU.SkulptMeshCursor.prototype.__createMesh = function () {

    this.__cursorGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, this.__radiusSegments, 1, true);
    this.__brushGeomVertexCountHalf = this.__cursorGeom.vertices.length / 2.0;
    var brushMaterial = new THREE.MeshBasicMaterial({color: '#000000'});
    brushMaterial.wireframe = true;
    this.__cursorMesh = new THREE.Mesh(this.__cursorGeom, brushMaterial);
    this.__cursorMesh.castShadow = false;
    this.__cursorMesh.receiveShadow = false;

    this.__scene.add(this.__cursorMesh);
};
SKULPTCPU.SkulptCursor.prototype.setSize = function (size) {
    this.__size = size;
    this.__cursorMesh.scale.x = size;
    this.__cursorMesh.scale.z = size;
};
SKULPTCPU.SkulptCursor.prototype.setAmount = function (amount) {
    this.__amount = amount;
    this.__cursorMesh.scale.y = amount;
};
SKULPTCPU.SkulptMeshCursor.prototype.show = function () {
    this.__cursorMesh.visible = true;
};
SKULPTCPU.SkulptMeshCursor.prototype.hide = function () {
    this.__cursorMesh.visible = false;
};
/**
 * Updates the cursor to <tt>position</tt>
 * @param  {THREE.Vector3} position - world space position
 * @param  {SKULPTCPU.SkulptMesh} skulptMesh
 */
SKULPTCPU.SkulptMeshCursor.prototype.update = function (position, skulptMesh) {

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
SKULPTCPU.SkulptProfile = function () { };
/**
 * Returns a value based on given <tt>weight</tt>
 * @abstract
 * @param  {number} weight - a 0 - 1 float number that determines the returned value
 * @return {number}
 */
SKULPTCPU.SkulptProfile.prototype.getValue = function (weight) {
    throw new Error('Abstract method not implemented');
};

/**
 * Sculpt profile that is based on a cosine curve
 * @constructor
 * @extends {SKULPTCPU.SkulptProfile}
 */
SKULPTCPU.CosineSkulptProfile = function () {
    SKULPTCPU.SkulptProfile.call(this);
    this.__halfPi = Math.PI / 2.0;
};
SKULPTCPU.CosineSkulptProfile.prototype = Object.create(SKULPTCPU.SkulptProfile.prototype);
SKULPTCPU.CosineSkulptProfile.prototype.constructor = SKULPTCPU.CosineSkulptProfile;
SKULPTCPU.CosineSkulptProfile.prototype.getValue = function (weight) {
    return Math.cos(weight * this.__halfPi);
};

/**
 * Sculpt profile that is based on constant value of 1
 * @constructor
 * @extends {SKULPTCPU.SkulptProfile}
 */
SKULPTCPU.ConstantSkulptProfile = function () {
    SKULPTCPU.SkulptProfile.call(this);
};
SKULPTCPU.ConstantSkulptProfile.prototype = Object.create(SKULPTCPU.SkulptProfile.prototype);
SKULPTCPU.ConstantSkulptProfile.prototype.constructor = SKULPTCPU.ConstantSkulptProfile;
SKULPTCPU.ConstantSkulptProfile.prototype.getValue = function (weight) {
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
SKULPTCPU.SkulptBrush = function (size, amount, scene) {
    this.__cursor = new SKULPTCPU.SkulptMeshCursor(size, amount, scene);
};
/**
 * Performs sculpting
 * @abstract
 */
SKULPTCPU.SkulptBrush.prototype.sculpt = function (mesh, position, profile) {
    throw new Error('Abstract method not implemented');
};
SKULPTCPU.SkulptBrush.prototype.getSize = function (size) {
    return this.__cursor.getSize();
};
SKULPTCPU.SkulptBrush.prototype.setSize = function (size) {
    this.__cursor.setSize(size);
};
SKULPTCPU.SkulptBrush.prototype.getAmount = function (amount) {
    return this.__cursor.getAmount();
};
SKULPTCPU.SkulptBrush.prototype.setAmount = function (amount) {
    this.__cursor.setAmount(amount);
};
SKULPTCPU.SkulptBrush.prototype.showCursor = function () {
    this.__cursor.show();
};
SKULPTCPU.SkulptBrush.prototype.hideCursor = function () {
    this.__cursor.hide();
};
SKULPTCPU.SkulptBrush.prototype.updateCursor = function (position, skulptMesh) {
    this.__cursor.update(position, skulptMesh);
};

/**
 * Sculpt brush that adds to a mesh
 * @constructor
 * @extends {SKULPTCPU.SkulptBrush}
 * @param {number} size
 */
SKULPTCPU.SkulptAddBrush = function (size, amount, scene) {
    SKULPTCPU.SkulptBrush.call(this, size, amount, scene);
};
SKULPTCPU.SkulptAddBrush.prototype = Object.create(SKULPTCPU.SkulptBrush.prototype);
SKULPTCPU.SkulptAddBrush.prototype.constructor = SKULPTCPU.SkulptAddBrush;
/**
 * Performs sculpting
 * @override
 */
SKULPTCPU.SkulptAddBrush.prototype.sculpt = function (mesh, position, profile) {

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
 * @extends {SKULPTCPU.SkulptBrush}
 * @param {number} size
 */
SKULPTCPU.SkulptRemoveBrush = function(size, amount, scene) {
    SKULPTCPU.SkulptBrush.call(this, size, amount, scene);
};
SKULPTCPU.SkulptRemoveBrush.prototype = Object.create(SKULPTCPU.SkulptBrush.prototype);
SKULPTCPU.SkulptRemoveBrush.prototype.constructor = SKULPTCPU.SkulptRemoveBrush;
/**
 * Performs sculpting
 * @override
 */
SKULPTCPU.SkulptRemoveBrush.prototype.sculpt = function (mesh, position, profile) {

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
 * @extends {SKULPTCPU.SkulptBrush}
 * @param {number} size
 */
SKULPTCPU.SkulptFlattenBrush = function (size, amount, scene) {
    SKULPTCPU.SkulptBrush.call(this, size, amount, scene);
};
SKULPTCPU.SkulptFlattenBrush.prototype = Object.create(SKULPTCPU.SkulptBrush.prototype);
SKULPTCPU.SkulptFlattenBrush.prototype.constructor = SKULPTCPU.SkulptFlattenBrush;
/**
 * Performs sculpting
 * @override
 */
SKULPTCPU.SkulptFlattenBrush.prototype.sculpt = function (mesh, position, profile) {

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
 * Creates a SKULPTCPU.Skulpt instance that manages sculpting
 * @constructor
 * @param {THREE.Scene} scene - main scene to add meshes
 */
SKULPTCPU.Skulpt = function (scene) {
    if (!scene) {
        throw new Error('scene not specified');
    }
    this.__scene = scene;

    this.__meshes = {};
    this.__currMesh = undefined;  //defined when intersection test is done
    this.__brushes = {
        'add': new SKULPTCPU.SkulptAddBrush(1.0, 1.0, scene),
        'remove': new SKULPTCPU.SkulptRemoveBrush(1.0, 1.0, scene),
        'flatten': new SKULPTCPU.SkulptFlattenBrush(1.0, 1.0, scene)
    };  //TODO: probably should be managed by a singleton
    this.__currBrush = this.__brushes[Object.keys(this.__brushes)[0]];
    this.__currProfile = new SKULPTCPU.CosineSkulptProfile(); //TODO: methods for profile, probably should be managed by a singleton
};
/**
 * Adds a mesh with name <tt>name</tt>
 * @param  {SKULPTCPU.SkulptMesh} skulptMesh
 * @param  {string} name
 */
SKULPTCPU.Skulpt.prototype.addMesh = function (skulptMesh, name) {
    if (!(skulptMesh instanceof SKULPTCPU.SkulptMesh)) {
        throw new Error('skulptMesh must be of type SKULPTCPU.SkulptMesh');
    }
    if (Object.keys(this.__meshes).indexOf(name) !== -1) {
        throw new Error('SKULPTCPU.Skulpt mesh name already exists: ' + name);
    }
    this.__meshes[name] = skulptMesh;
    this.__currMesh = skulptMesh;
};
SKULPTCPU.Skulpt.prototype.getMesh = function (name) {
    if (Object.keys(this.__meshes).indexOf(name) === -1) {
        throw new Error('SKULPTCPU.Skulpt mesh name does not exist: ' + name);
    }
    return this.__meshes[name];
};
/**
 * Removes mesh with name <tt>name</tt>
 * @param  {string} name
 */
SKULPTCPU.Skulpt.prototype.removeMesh = function (name) {
    if (Object.keys(this.__meshes).indexOf(name) === -1) {
        throw new Error('SKULPTCPU.Skulpt mesh name does not exist: ' + name);
    }
    delete this.__meshes[name];  //TODO: check this
};
/**
 * Set current brush to brush with name <tt>name</tt>
 * @param {string} name
 */
SKULPTCPU.Skulpt.prototype.setBrush = function (name) {
    if (Object.keys(this.__brushes).indexOf(name) === -1) {
        throw new Error('Brush name not recognised: ' + name);
    }
    this.__currBrush = this.__brushes[name];
};
SKULPTCPU.Skulpt.prototype.getBrushSize = function () {
    return this.__currBrush.getSize();
};
SKULPTCPU.Skulpt.prototype.setBrushSize = function (size) {
    //TODO: let the singleton manager do this
    var brushId;
    for (brushId in this.__brushes) {
        if (this.__brushes.hasOwnProperty(brushId)) {
            var brush = this.__brushes[brushId];
            brush.setSize(size);
        }
    }
};
SKULPTCPU.Skulpt.prototype.getBrushAmount = function () {
    return this.__currBrush.getAmount();
};
SKULPTCPU.Skulpt.prototype.setBrushAmount = function (amount) {
    //TODO: let the singleton manager do this
    var brushId;
    for (brushId in this.__brushes) {
        if (this.__brushes.hasOwnProperty(brushId)) {
            var brush = this.__brushes[brushId];
            brush.setAmount(amount);
        }
    }
};
SKULPTCPU.Skulpt.prototype.updateCursor = function (position, mesh) {
    this.__currBrush.updateCursor(position, mesh);
};
SKULPTCPU.Skulpt.prototype.showCursor = function () {
    this.__currBrush.showCursor();
};
SKULPTCPU.Skulpt.prototype.hideCursor = function () {
    this.__currBrush.hideCursor();
};
/**
 * Sculpts at <tt>position</tt> on the current mesh
 * @param {THREE.Vector3} position - position to sculpt at
 */
SKULPTCPU.Skulpt.prototype.sculpt = function (position) {
    return this.__currBrush.sculpt(this.__currMesh, position, this.__currProfile);
};
// SKULPTCPU.Skulpt.prototype.export = function()
// {

// }
// SKULPTCPU.Skulpt.prototype.import = function()
// {

// }
