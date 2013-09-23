/**
 * @fileOverview JavaScript height field water simulations for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 */

//===================================
// OBSTACLES
//===================================

/**
 * Abstract class for obstacles
 * @constructor
 * @param {THREE.Mesh} mesh Mesh to use as an obstacle
 */
function Obstacle(mesh) {
    this.mesh = mesh;
    this.updateAlways = false;  //updates obstacle representation whenever calculations are done, meant for dynamic obstacles that are always moving
    this.update();
}
Obstacle.prototype.update = function () {
    throw new Error('Abstract method not implemented');
};
Obstacle.prototype.updateObstacleField = function (waterSim) {
    throw new Error('Abstract method not implemented');
};
Obstacle.prototype.updateFlowObstaclesField = function (waterSim) {
    throw new Error('Abstract method not implemented');
};

/**
 * Obstacles that are voxelized
 * @constructor
 * @extends {Obstacle}
 * @param {THREE.Mesh} mesh Mesh to use as an obstacle
 * @param {number} voxelSizeX Voxel size in X
 * @param {number} voxelSizeY Voxel size in Y
 * @param {number} voxelSizeZ Voxel size in Z
 */
function VoxelizedObstacle(mesh, voxelSizeX, voxelSizeY, voxelSizeZ, globalTransform) {
    this.voxelizer = new SkVoxelizer(mesh, voxelSizeX, voxelSizeY, voxelSizeZ, globalTransform);
    Obstacle.call(this, mesh);
}
VoxelizedObstacle.prototype = Object.create(Obstacle.prototype);
VoxelizedObstacle.prototype.constructor = VoxelizedObstacle;
/**
 * Updates the obstacle
 */
VoxelizedObstacle.prototype.update = function () {
    this.voxelizer.updateIntersections();
};
/**
 * Updates the obstacle 2D array of the given water simulation
 * @param  {HeightFieldWater} waterSim Water simulation instance
 */
VoxelizedObstacle.prototype.updateObstacleField = function (waterSim) {

    if (this.updateAlways) {
        this.update();
    }

    var vertexPos = waterSim.mesh.geometry.vertices;

    var minIntersectHeight, maxIntersectHeight, intersectionHeights;
    var x, z, idx;
    for (x = this.voxelizer.__xMinMultiple; x <= this.voxelizer.__xMaxMultiple + this.voxelizer.__EPSILON; x += this.voxelizer.voxelSizeX) {
        for (z = this.voxelizer.__zMinMultiple; z <= this.voxelizer.__zMaxMultiple + this.voxelizer.__EPSILON; z += this.voxelizer.voxelSizeZ) {
            intersectionHeights = this.voxelizer.intersectionFirstAndLastHeights;
            if (intersectionHeights && intersectionHeights[x] && intersectionHeights[x][z]) {

                minIntersectHeight = intersectionHeights[x][z][0];
                maxIntersectHeight = intersectionHeights[x][z][1];  //TODO: this assumes only two heights

                //update obstacle field, compare obstacle intersection heights current water height
                idx = waterSim.__calcVertexId(x, z);
                if (vertexPos[idx] &&  minIntersectHeight < vertexPos[idx].y && maxIntersectHeight > vertexPos[idx].y) {
                    waterSim.obstacleField[idx] = 0;
                }
            }
        }
    }
};
/**
 * Updates the flux array of the given water simulation
 * @param  {HeightFieldWaterWithVel} waterSim Water simulation instance
 */
VoxelizedObstacle.prototype.updateFlux = function (waterSim) {

    if (this.updateAlways) {
        this.update();
    }

    var minIntersectHeight, maxIntersectHeight, intersectionHeights;
    var x, z, idx, prevIdx, prevWaterHeight, nextIdx, nextWaterHeight;
    for (x = this.voxelizer.__xMinMultiple; x <= this.voxelizer.__xMaxMultiple + this.voxelizer.__EPSILON; x += this.voxelizer.voxelSizeX) {
        for (z = this.voxelizer.__zMinMultiple; z <= this.voxelizer.__zMaxMultiple + this.voxelizer.__EPSILON; z += this.voxelizer.voxelSizeZ) {
            intersectionHeights = this.voxelizer.intersectionFirstAndLastHeights;
            if (intersectionHeights && intersectionHeights[x] && intersectionHeights[x][z]) {

                minIntersectHeight = intersectionHeights[x][z][0];
                maxIntersectHeight = intersectionHeights[x][z][1];  //TODO: this assumes only two heights

                idx = waterSim.__calcVertexId(x, z);

                //if obstacle in this cell blocks adjacent cell, then stop flow coming from that cell

                //+X
                prevIdx = idx - 1;
                prevWaterHeight = waterSim.baseHeights[prevIdx] + waterSim.heights[prevIdx];
                if (minIntersectHeight < prevWaterHeight && maxIntersectHeight > prevWaterHeight) {
                    waterSim.fluxR[prevIdx] = 0;
                }

                //-X
                nextIdx = idx + 1;
                nextWaterHeight = waterSim.baseHeights[nextIdx] + waterSim.heights[nextIdx];
                if (minIntersectHeight < nextWaterHeight && maxIntersectHeight > nextWaterHeight) {
                    waterSim.fluxL[nextIdx] = 0;
                }

                //+Z
                prevIdx = idx - waterSim.res;
                prevWaterHeight = waterSim.baseHeights[prevIdx] + waterSim.heights[prevIdx];
                if (minIntersectHeight < prevWaterHeight && maxIntersectHeight > prevWaterHeight) {
                    waterSim.fluxB[prevIdx] = 0;
                }

                //-Z
                nextIdx = idx + waterSim.res;
                nextWaterHeight = waterSim.baseHeights[nextIdx] + waterSim.heights[nextIdx];
                if (minIntersectHeight < nextWaterHeight && maxIntersectHeight > nextWaterHeight) {
                    waterSim.fluxT[nextIdx] = 0;
                }
            }
        }
    }
};

/**
 * Obstacle that is a height-field terrain
 * @constructor
 * @extends {Obstacle}
 * @param {THREE.Mesh} mesh Mesh to use as a terrain obstacle
 */
function TerrainObstacle(mesh) {
    this.intersectionHeights = [];
    Obstacle.call(this, mesh);
}
TerrainObstacle.prototype = Object.create(Obstacle.prototype);
TerrainObstacle.prototype.constructor = TerrainObstacle;
/**
 * Updates the obstacle
 */
TerrainObstacle.prototype.update = function () {
    //since we are using a height-field terrain, we can just get the height without doing intersection tests
    var vertices = this.mesh.geometry.vertices;
    var i, len;
    for (i = 0, len = vertices.length; i < len; i++) {
        this.intersectionHeights[i] = [];
        this.intersectionHeights[i].push(0);
        this.intersectionHeights[i].push(vertices[i].y);
    }
};
/**
 * Updates the obstacle 2D array of the given water simulation
 * @param  {HeightFieldWater} waterSim Water simulation instance
 */
TerrainObstacle.prototype.updateObstacleField = function (waterSim) {

    if (this.updateAlways) {
        this.update();
    }

    //FIXME: water sticks on one side of the terrain

    var vertexPos = waterSim.mesh.geometry.vertices;

    //compare intersection heights in local space.
    //For terrain obstacle, heights are in local space too, so can just compare directly without transformations.
    var minIntersectHeight, maxIntersectHeight;
    var i, len;
    for (i = 0, len = waterSim.res * waterSim.res; i < len; i++) {
        if (this.intersectionHeights[i]) {

            minIntersectHeight = this.intersectionHeights[i][0];
            maxIntersectHeight = this.intersectionHeights[i][1];  //TODO: this assumes only two heights

            //update obstacle field, compare obstacle intersection heights with water mean height
            if (minIntersectHeight < vertexPos[i].y && maxIntersectHeight > vertexPos[i].y) {
                waterSim.obstacleField[i] = 0;
            }
        }
    }
};
/**
 * Updates the flux array of the given water simulation
 * @param  {HeightFieldWaterWithVel} waterSim Water simulation instance
 */
TerrainObstacle.prototype.updateFlux = function (waterSim) {

    //NOTE: looks like there's no need for the terrain to be an obstacle itself for updating flux

    // if (this.updateAlways) {
        // this.update();
    // }

    // var resMinusOne = waterSim.res - 1;

    // //stop flow velocity if adjacent terrain height is more than this water height
    // var i, j, idx;
    // for (i = 1; i < resMinusOne; i++) {
        // for (j = 1; j < resMinusOne; j++) {
            // idx = i * waterSim.res + j;

            // //+X
            // if (waterSim.baseHeights[idx + 1] > waterSim.baseHeights[idx] + waterSim.heights[idx]) {
                // waterSim.fluxR[idx] = 0;
                // // waterSim.fluxRPrev[idx] = 0;
            // }

            // //-X
            // if (waterSim.baseHeights[idx - 1] > waterSim.baseHeights[idx] + waterSim.heights[idx]) {
                // waterSim.fluxL[idx] = 0;
                // // waterSim.fluxRPrev[idx] = 0;
            // }

            // //+Z
            // if (waterSim.baseHeights[idx + waterSim.res] > waterSim.baseHeights[idx] + waterSim.heights[idx]) {
                // waterSim.fluxB[idx] = 0;
                // // waterSim.fluxBPrev[idx] = 0;
            // }

            // //-Z
            // if (waterSim.baseHeights[idx - waterSim.res] > waterSim.baseHeights[idx] + waterSim.heights[idx]) {
                // waterSim.fluxB[idx] = 0;
                // // waterSim.fluxBPrev[idx] = 0;
            // }
        // }
    // }
};

//TODO: obsolete, should be removed
var DepthMapObstacleManager = {

    depthMapSize: 10,
    depthMapRes: 512,
    depthMapNear: -2,
    depthMapFar: 2,

    init: function () {
        this.__loadScene();
        this.__prepareDepthMapImageElements();
    },

    update: function () {
        this.depthMapRenderer.autoClear = false;
        this.depthMapRenderer.clear();
        this.depthMapRenderer.render(this.depthMapScene, this.depthMapCamera);

        //update obstacle depth map image display
        this.$depthMapImageObj[0].src = this.depthMapRenderer.domElement.toDataURL();
    },

    addObstacle: function (mesh) {
        //create another mesh with the same geometry, but with a MeshDepthMaterial
        var depthMesh = new THREE.Mesh(
            mesh.geometry,
            new THREE.MeshDepthMaterial({side: THREE.DoubleSide, overdraw: true})
        );

        //do a reference copy of position, rotation and scale, so that will auto-update
        //TODO: not sure why cannot just get matrix from mesh and apply to depthMesh
        depthMesh.position = mesh.position;
        depthMesh.rotation = mesh.rotation;
        depthMesh.scale = mesh.scale;

        this.depthMapScene.add(depthMesh);
    },

    getObstacleDepthMap: function () {
        return this.obstacleDepthMapCanvasElemContext.getImageData(0, 0, this.depthMapRes, this.depthMapRes).data;
    },

    __loadScene: function () {
        if (!this.depthMapRenderer) {
            this.depthMapRenderer = new THREE.CanvasRenderer({
                antialias : true
            });
            this.depthMapRenderer.setSize(this.depthMapRes, this.depthMapRes);
            this.depthMapRenderer.setClearColor('#000000', 1);
            this.obstacleDepthMapCanvasElemContext = this.depthMapRenderer.domElement.getContext('2d');

            this.depthMapScene = new THREE.Scene();

            var halfSize = this.depthMapSize / 2.0;
            this.depthMapCamera = new THREE.OrthographicCamera(-halfSize, halfSize, -halfSize, halfSize, this.depthMapNear, this.depthMapFar);
            this.depthMapCamera.rotation.x = THREE.Math.degToRad(90);
            this.depthMapCamera.position.y = 0;
        }
    },

    __prepareDepthMapImageElements: function () {
        //load original terrain image, scale it using canvas, then set scaled image to $scaledImageObj
        if (!this.$depthMapImageObj) {
            this.$depthMapImageObj = $(new Image());
            this.$depthMapImageObj[0].src = this.depthMapRenderer.domElement.toDataURL();
            this.$depthMapImageObj.css({'position': 'fixed', 'top': '55px', 'left': 0});
            $('body').append(this.$depthMapImageObj);
        }
    }

};

//===================================
// HEIGHT FIELD WATER SIMS
//===================================

/**
 * Abstract base class for height field water simulations
 * @constructor
 * @param {THREE.Mesh} mesh Mesh to use as the water simulation
 * @param {number} size Length of the mesh
 * @param {number} res Resolution of the mesh
 * @param {number} dampingFactor Damping factor
 * @param {number} meanHeight Mean height
 */
function HeightFieldWater(options) {

    if (typeof options.mesh === 'undefined') {
        throw new Error('mesh not specified');
    }
    this.mesh = options.mesh;
    if (typeof options.size === 'undefined') {
        throw new Error('size not specified');
    }
    this.size = options.size;
    this.halfSize = this.size / 2.0;
    if (typeof options.res === 'undefined') {
        throw new Error('res not specified');
    }
    this.res = options.res;
    if (typeof options.dampingFactor === 'undefined') {
        throw new Error('dampingFactor not specified');
    }
    this.dampingFactor = options.dampingFactor;
    if (typeof options.meanHeight === 'undefined') {
        throw new Error('meanHeight not specified');
    }
    this.__meanHeight = options.meanHeight;

    this.geometry = this.mesh.geometry;
    this.numVertices = this.res * this.res;
    if (this.numVertices !== this.geometry.vertices.length) {
        throw new Error('Number of vertices in mesh does not match res*res');
    }
    this.segmentSize = this.size / this.res;
    this.segmentSizeSquared = this.segmentSize * this.segmentSize;

    this.obstacles = {};

    this.sourceField = [];
    this.disturbField = [];
    this.obstacleField = [];
    this.verticalVelField = [];

    // DepthMapObstacleManager.depthMapSize = this.size;
    // DepthMapObstacleManager.depthMapRes = this.res;
    // DepthMapObstacleManager.depthMapNear = -2;
    // DepthMapObstacleManager.depthMapFar = 2;

    this.obstaclesActive = true;
    //FIXME: remove these hardcoded values
    // this.clampMin = 0.48;
    // this.clampMax = 0.68;

    //some temp variables to prevent recreation every frame
    this.__worldMatInv = new THREE.Matrix4();
    this.__localPos = new THREE.Vector3();

    this.init();
}

HeightFieldWater.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.sourceField[i] = 0;
        this.disturbField[i] = 0;
        this.obstacleField[i] = 1;
        this.verticalVelField[i] = 0;
    }

    //init DepthMapObstacleManager
    // DepthMapObstacleManager.init();
};

/**
 * Updates the simulation
 * @param  {number} dt Elapsed time
 */
HeightFieldWater.prototype.update = function (dt) {

    // DepthMapObstacleManager.update();

    // //update obstacle field using the depth map
    // if (this.obstaclesActive) {
    //     var obstacleDepthMapData = DepthMapObstacleManager.getObstacleDepthMap();
    //     var i, len;
    //     var norm;
    //     for (i = 0, len = this.res * this.res; i < len; i++) {
    //         norm = obstacleDepthMapData[i * 4] / 255.0;
    //         this.obstacleField[i] = 1 - (norm >= this.clampMin && norm <= this.clampMax);
    //     }
    // }

    // //update obstacles first
    // var obstacle, obstacleId;
    // for (obstacleId in this.obstacles) {
    //     if (this.obstacles.hasOwnProperty(obstacleId)) {
    //         obstacle = this.obstacles[obstacleId];
    //         obstacle.update();
    //     }
    // }

    //update obstacle field
    if (this.obstaclesActive) {
        var obstacleIds = Object.keys(this.obstacles);
        var obstacle;
        var i, len = obstacleIds.length;
        for (i = 0; i < len; i++) {
            obstacle = this.obstacles[obstacleIds[i]];
            obstacle.updateObstacleField(this);
        }
    }

    this.sim(dt);
    this.__clearFields();
};

HeightFieldWater.prototype.sim = function (dt) {
    throw new Error('Abstract method not implemented');
};

/**
 * Sets the mean height
 * @param {number} meanHeight Mean height to set to
 */
HeightFieldWater.prototype.setMeanHeight = function (meanHeight) {

    this.__meanHeight = meanHeight;

    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //set edge vertices to mean height
    var i, j, idx;
    j = 0;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        vertexPos[idx].y = this.__meanHeight;
    }
    j = resMinusOne;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        vertexPos[idx].y = this.__meanHeight;
    }
    i = 0;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        vertexPos[idx].y = this.__meanHeight;
    }
    i = resMinusOne;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        vertexPos[idx].y = this.__meanHeight;
    }
};

//Calculates the vertex id of the mesh that is nearest position
HeightFieldWater.prototype.__calcVertexId = function (x, z) {
    var row = Math.floor((z + this.halfSize) / this.size * this.res);
    var col = Math.floor((x + this.halfSize) / this.size * this.res);
    return (row * this.res) + col;
};

/**
 * Disturbs the water simulation
 * @param  {THREE.Vector3} position World-space position to disturb at
 * @param  {number} amount Amount to disturb
 */
HeightFieldWater.prototype.disturb = function (position, amount) {

    //convert back to local space first
    this.__worldMatInv.getInverse(this.mesh.matrixWorld);
    this.__localPos.copy(position).applyMatrix4(this.__worldMatInv);

    //calculate idx
    var idx = this.__calcVertexId(this.__localPos.x, this.__localPos.z);
    this.disturbById(idx, amount);
};

/**
 * Disturbs vertex id of the water mesh
 * @param  {number} id Vertex ID of the water mesh
 * @param  {number} amount Amount to disturb
 */
HeightFieldWater.prototype.disturbById = function (id, amount) {
    this.disturbField[id] = amount;
};

/**
 * Disturbs the neighbours at this position
 * @param  {THREE.Vector3} position World-space position to disturb at
 * @param  {number} amount Amount to disturb
 */
HeightFieldWater.prototype.disturbNeighbours = function (position, amount) {

    //convert back to local space first
    this.__worldMatInv.getInverse(this.mesh.matrixWorld);
    this.__localPos.copy(position).applyMatrix4(this.__worldMatInv);

    //calculate idx
    var idx = this.__calcVertexId(this.__localPos.x, this.__localPos.z);

    this.disturbNeighboursById(idx, amount);
};

/**
 * Disturbs neighbours of a vertex
 * @param  {number} id Neighbours of this vertex ID will be disturbed
 * @param  {number} amount Amount to disturb
 */
HeightFieldWater.prototype.disturbNeighboursById = function (id, amount) {

    var vertices = this.geometry.vertices;

    //neighbour (x+1,z)
    var neighbourId = id + this.res;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }

    //neighbour (x-1,z)
    neighbourId = id - this.res;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }

    //neighbour (x,z+1)
    neighbourId = id + 1;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }

    //neighbour (x,z-1)
    neighbourId = id - 1;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }
};

/**
 * Sources water into the water simulation
 * @param  {THREE.Vector3} position World-space position to source at
 * @param  {number} amount Amount of water to source
 * @param  {number} radius Radius of water to source
 */
HeightFieldWater.prototype.source = function (position, amount, radius) {

    //convert back to local space first
    this.__worldMatInv.getInverse(this.mesh.matrixWorld);
    this.__localPos.copy(position).applyMatrix4(this.__worldMatInv);

    //calculate idx
    var idx;
    var dist;
    var x, z;
    for (x = -radius; x <= radius; x += this.segmentSize) {
        for (z = -radius; z <= radius; z += this.segmentSize) {
            dist = Math.sqrt(x * x + z * z);
            if (dist < radius) { //within the circle
                //get vertex id for this (x, z) point
                idx = this.__calcVertexId(this.__localPos.x + x, this.__localPos.z + z);
                this.sourceById(idx, amount);
            }
        }
    }
};

/**
 * Source to a vertex
 * @param  {number} id Vertex ID to source at
 * @param  {number} amount Amount of water to source
 */
HeightFieldWater.prototype.sourceById = function (id, amount) {
    this.sourceField[id] = amount;
};

/**
 * Floods the water simulation by the given volume
 * @param  {number} volume Volume to flood the system with
 */
HeightFieldWater.prototype.flood = function (volume) {
    var i, j, idx;
    for (i = 0; i < this.res; i++) {
        for (j = 0; j < this.res; j++) {
            idx = i * this.res + j;
            //add to disturb field because this is masked by obstacles
            this.disturbField[idx] += volume / (this.res * this.res);
            //TODO: add masked out volume back to unmasked volume, if we really want to be accurate...
        }
    }
};

/**
 * Adds obstacle to the system
 * @param {Obstacle} obstacle Obstacle to add
 * @param {string} name String ID of this obstacle
 */
HeightFieldWater.prototype.addObstacle = function (obstacle, name) {
    // DepthMapObstacleManager.addObstacle(mesh);
    if (!(obstacle instanceof Obstacle)) {
        throw new Error('obstacle must be of type Obstacle');
    }
    if (typeof name !== 'string') {
        throw new Error('name must be of type string');
    }
    if (Object.keys(this.obstacles).indexOf(name) !== -1) {
        throw new Error('obstacle name already exists: ' + name);
    }
    this.obstacles[name] = obstacle;
};

/**
 * Sets obstacles state to active/inactive
 * @param {boolean} isActive Whether the obstacles are active
 */
HeightFieldWater.prototype.setObstaclesActive = function (isActive) {
    this.obstaclesActive = isActive;
};

/**
 * Resets the water simulation
 */
HeightFieldWater.prototype.reset = function () {

    //set mesh back to 0
    var i;
    var vertexPos = this.geometry.vertices;
    for (i = 0; i < this.numVertices; i++) {
        vertexPos[i].y = this.__meanHeight;
    }

    //clear fields
    this.__clearFields();
};

HeightFieldWater.prototype.__clearFields = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.sourceField[i] = 0;
        this.disturbField[i] = 0;
        this.obstacleField[i] = 1;
    }
};

HeightFieldWater.prototype.__updateMesh = function () {
    this.geometry.verticesNeedUpdate = true;
    this.geometry.computeFaceNormals();  //must call this first before computeVertexNormals()
    this.geometry.computeVertexNormals();
    this.geometry.normalsNeedUpdate = true;
};

/**
 * Height field water simulation based on HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {HeightFieldWater}
 */
function MuellerGdc2008HwWater(options) {
    HeightFieldWater.call(this, options);
}
//inherit from HeightFieldWater
MuellerGdc2008HwWater.prototype = Object.create(HeightFieldWater.prototype);
MuellerGdc2008HwWater.prototype.constructor = MuellerGdc2008HwWater;
//override
MuellerGdc2008HwWater.prototype.sim = function (dt) {

    var i, j, idx;
    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //apply source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            vertexPos[idx].y += this.disturbField[idx];
            //mask using obstacle field, relative to the mean height
            vertexPos[idx].y = (vertexPos[idx].y - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;
        }
    }

    //propagate
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.verticalVelField[idx] += (vertexPos[(i - 1) * this.res + j].y + vertexPos[(i + 1) * this.res + j].y + vertexPos[i * this.res + (j - 1)].y + vertexPos[i * this.res + (j + 1)].y) / 4.0 - vertexPos[idx].y;
            this.verticalVelField[idx] *= this.dampingFactor;
        }
    }

    //update vertex heights
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            vertexPos[idx].y += this.verticalVelField[idx];
        }
    }

    //update mesh
    this.__updateMesh();
};

/**
 * Height field water simulation based on "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {HeightFieldWater}
 */
function MuellerGdc2008Water(options) {
    HeightFieldWater.call(this, options);

    if (typeof options.horizontalSpeed === 'undefined') {
        throw new Error('horizontalSpeed not specified');
    }
    this.horizontalSpeed = options.horizontalSpeed;
    this.horizontalSpeedSquared = this.horizontalSpeed * this.horizontalSpeed;
}
//inherit from HeightFieldWater
MuellerGdc2008Water.prototype = Object.create(HeightFieldWater.prototype);
MuellerGdc2008Water.prototype.constructor = MuellerGdc2008Water;
//override
MuellerGdc2008Water.prototype.sim = function (dt) {

    //fixing dt: better to be in slow motion than to explode
    dt = 1.0 / 60.0;

    var i, j, idx;
    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //add source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            vertexPos[idx].y += this.disturbField[idx];
            //mask using obstacle field, relative to the mean height
            vertexPos[idx].y = (vertexPos[idx].y - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;
        }
    }

    //calculate vertical acceleration and velocity
    var acc;
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            acc = this.horizontalSpeedSquared * (
                vertexPos[idx + this.res].y    //height[i+1,j]
                + vertexPos[idx - this.res].y  //height[i-1,j]
                + vertexPos[idx + 1].y         //height[i,j+1]
                + vertexPos[idx - 1].y         //height[i,j-1]
                - 4 * vertexPos[idx].y       //4 * height[i,j]
            ) / this.segmentSizeSquared;
            this.verticalVelField[idx] += acc * dt;  //TODO: use a better integrator
            this.verticalVelField[idx] *= this.dampingFactor;
        }
    }

    //update vertex heights
    var len = vertexPos.length;
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            vertexPos[idx].y += this.verticalVelField[idx] * dt;  //TODO: use a better integrator
        }
    }

    //update mesh
    this.__updateMesh();
};

/**
 * Height field water simulation based on http://freespace.virgin.net/hugo.elias/graphics/x_water.htm
 * @constructor
 * @extends {HeightFieldWater}
 */
function XWater(options) {
    this.field1 = [];
    this.field2 = [];

    HeightFieldWater.call(this, options);
}
//inherit from HeightFieldWater
XWater.prototype = Object.create(HeightFieldWater.prototype);
XWater.prototype.constructor = XWater;
//override
XWater.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.field1[i] = this.__meanHeight;
        this.field2[i] = this.__meanHeight;
    }

    //call super class init to initialize other fields
    HeightFieldWater.prototype.init.call(this);
};
XWater.prototype.reset = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.field1[i] = this.__meanHeight;
        this.field2[i] = this.__meanHeight;
    }

    HeightFieldWater.prototype.reset.call(this);
};
XWater.prototype.setMeanHeight = function (meanHeight) {

    this.__meanHeight = meanHeight;

    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //set edge vertices to mean height
    var i, j, idx;
    j = 0;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }
    j = resMinusOne;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }
    i = 0;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }
    i = resMinusOne;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }

    HeightFieldWater.prototype.setMeanHeight.call(this, meanHeight);
};
XWater.prototype.sim = function (dt) {

    var i, j, idx;
    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    dt = 1.0 / 60.0;  //fix dt

    //add source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.field1[idx] += this.disturbField[idx];
            //mask using obstacle field, relative to the mean height
            this.field1[idx] = (this.field1[idx] - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;
        }
    }

    //propagate
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.field2[idx] = (this.field1[(i - 1) * this.res + j] + this.field1[(i + 1) * this.res + j] + this.field1[i * this.res + (j - 1)] + this.field1[i * this.res + (j + 1)]) / 2.0 - this.field2[idx];
            //scale down using damping factor, relative to the mean height
            this.field2[idx] = (this.field2[idx] - this.__meanHeight) * this.dampingFactor + this.__meanHeight;
        }
    }

    //update vertex heights
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            vertexPos[idx].y = this.field2[idx];
        }
    }

    //update mesh
    this.__updateMesh();

    //swap buffers
    var temp;
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            temp = this.field2[idx];
            this.field2[idx] = this.field1[idx];
            this.field1[idx] = temp;
        }
    }
};

/**
 * Height field water simulation based on "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4)
 * @constructor
 * @extends {HeightFieldWater}
 */
function TessendorfIWaveWater(options) {

    this.prevHeight = [];
    this.vertDeriv = [];

    HeightFieldWater.call(this, options);

    if (typeof options.kernelRadius === 'undefined') {
        throw new Error('kernelRadius not specified');
    }
    this.kernelRadius = options.kernelRadius;
    if (typeof options.substeps === 'undefined') {
        throw new Error('substeps not specified');
    }
    this.substeps = options.substeps;

    this.gravity = -9.81;

    //load this.G from json file (loading the compact version here but the non-compact version would do as well)
    var url = '/python/iWave_kernels_' + this.kernelRadius + '_compact.json';
    var that = this;
    $.ajax({
        url: url,
        async: false
    }).done(function (data) {
        that.G = data;
    }).error(function (xhr, textStatus, error) {
        throw new Error('error loading ' + url + ': ' + error);
    });
}
//inherit from HeightFieldWater
TessendorfIWaveWater.prototype = Object.create(HeightFieldWater.prototype);
TessendorfIWaveWater.prototype.constructor = TessendorfIWaveWater;
//override
TessendorfIWaveWater.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.prevHeight[i] = 0;
        this.vertDeriv[i] = 0;
    }

    //call super class init to initialize other fields
    HeightFieldWater.prototype.init.call(this);
};
TessendorfIWaveWater.prototype.reset = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.prevHeight[i] = 0;
        this.vertDeriv[i] = 0;
    }

    HeightFieldWater.prototype.reset.call(this);
};
TessendorfIWaveWater.prototype.sim = function (dt) {

    //fixing dt: better to be in slow motion than to explode
    dt = 1.0 / 60.0;

    //FIXME: fix weird boundaries when using mean height

    //moving multiple time steps per loop so that the sim can go faster
    var s;
    for (s = 0; s < this.substeps; s++) {

        var i, j, idx;
        var vertexPos = this.geometry.vertices;
        var resMinusOne = this.res - 1;

        //add source and obstacles first
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {
                idx = i * this.res + j;
                vertexPos[idx].y += this.disturbField[idx];
                //mask using obstacle field, relative to the mean height
                // vertexPos[idx].y *= this.obstacleField[idx];
                vertexPos[idx].y = (vertexPos[idx].y - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;

                //also remove mean height so that everything is back to 0-height
                vertexPos[idx].y -= this.__meanHeight;
            }
        }

        //convolve to update this.vertDeriv
        this.__symmetricalConvolve();

        //propagate
        var temp;
        var twoMinusDampTimesDt = 2.0 - this.dampingFactor * dt;
        var onePlusDampTimesDt = 1.0 + this.dampingFactor * dt;
        var gravityTimesDtTimesDt = this.gravity * dt * dt;
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {
                idx = i * this.res + j;

                //do the algo
                temp = vertexPos[idx].y;
                vertexPos[idx].y = (vertexPos[idx].y * twoMinusDampTimesDt
                            - this.prevHeight[idx]
                            - this.vertDeriv[idx] * gravityTimesDtTimesDt) / onePlusDampTimesDt;
                this.prevHeight[idx] = temp;

                //move back to mean height
                vertexPos[idx].y += this.__meanHeight;
            }
        }
    }

    //update mesh
    this.__updateMesh();
};
//methods
TessendorfIWaveWater.prototype.__symmetricalConvolve = function () {

    var i, j, k, l, iMax, jMax, idx;
    var vertexPos = this.geometry.vertices;
    for (i = this.kernelRadius, iMax = this.res - this.kernelRadius; i < iMax; i++) {
        for (j = this.kernelRadius, jMax = this.res - this.kernelRadius; j < jMax; j++) {

            idx = i * this.res + j;

            //convolve for every pair of [i,j]

            //NOTE: symmetrical convolution forumla in article does not seem to work.
            //I'm doing it the following way to cover all positions of the kernel:

            //add [0,0] first
            this.vertDeriv[idx] = vertexPos[idx].y;

            //when k = 0, swap k and l in a specific manner while changing signs
            k = 0;
            for (l = 1; l <= this.kernelRadius; l++) { //article says to start from k+1, but I think it should start from 1 instead
                this.vertDeriv[idx] += this.G[k][l] * (vertexPos[(i + k) * this.res + (j + l)].y + vertexPos[(i + k) * this.res + (j - l)].y + vertexPos[(i + l) * this.res + (j + k)].y + vertexPos[(i - l) * this.res + (j + k)].y);
            }

            //for k larger than 0, k and l do not swap at all, only change signs
            for (k = 1; k <= this.kernelRadius; k++) {
                for (l = 1; l <= this.kernelRadius; l++) {  //article says to start from k+1, but I think it should start from 1 instead
                    this.vertDeriv[idx] += this.G[k][l] * (vertexPos[(i + k) * this.res + (j + l)].y + vertexPos[(i - k) * this.res + (j - l)].y + vertexPos[(i + k) * this.res + (j - l)].y + vertexPos[(i - k) * this.res + (j + l)].y);
                }
            }

        }
    }
};
TessendorfIWaveWater.prototype.__convolve = function () {
    //NOTE: this is not used. I left it here for debugging if necessary.
    var i, j, k, l, iMax, jMax, idx;
    var vertexPos = this.geometry.vertices;
    for (i = this.kernelRadius, iMax = this.res - this.kernelRadius; i < iMax; i++) {
        for (j = this.kernelRadius, jMax = this.res - this.kernelRadius; j < jMax; j++) {

            idx = i * this.res + j;

            //convolve for every pair of [i,j]
            this.vertDeriv[idx] = 0;
            for (k = -this.kernelRadius; k <= this.kernelRadius; k++) {
                for (l = -this.kernelRadius; l <= this.kernelRadius; l++) {
                    this.vertDeriv[idx] += this.G[k][l] * vertexPos[(i + k) * this.res + (j + l)].y;
                }
            }

        }
    }
};

/**
 * Height field water that is able to generate a full 3D velocity field
 * @constructor
 * @extends {HeightFieldWater}
 */
function HeightFieldWaterWithVel(options) {

    this.vel = [];
    this.velColors = [];
    if (typeof options.scene === 'undefined') {
        throw new Error('scene not specified');
    }
    this.scene = options.scene;

    HeightFieldWater.call(this, options);

    this.minVisVel = options.minVisVel || 0;  //for remapping of visualizing colors
    this.maxVisVel = options.maxVisVel || 0.25;  //for remapping of visualizing colors
    this.minVisVelLength = options.minVisVelLength || 0.02;  //for clamping of line length
    this.maxVisVelLength = options.maxVisVelLength || 1.0;  //for clamping of line length

    this.lineStartColor = options.lineStartColor || new THREE.Color(0x0066cc);
    this.lineEndColor = options.lineEndColor || new THREE.Color(0x99ffff);
    this.waterColor = options.waterColor || new THREE.Color(0x0066cc);
    this.foamColor = options.foamColor || new THREE.Color(0x99ffff);

    this.__faceIndices = ['a', 'b', 'c', 'd'];
    this.__origMeshMaterialSettings = {
        emissive: this.mesh.material.emissive.clone(),
        vertexColors: this.mesh.material.vertexColors
    };

    this.__visVelColors = false;
    this.__visVelLines = false;
}
//inherit
HeightFieldWaterWithVel.prototype = Object.create(HeightFieldWater.prototype);
HeightFieldWaterWithVel.prototype.constructor = HeightFieldWaterWithVel;
//override
HeightFieldWaterWithVel.prototype.init = function () {

    //init arrays
    var i, len;
    for (i = 0, len = this.mesh.geometry.vertices.length; i < len; i++) {
        this.vel[i] = new THREE.Vector3();
        this.velColors[i] = new THREE.Color();
    }

    //create vel lines mesh
    var velLinesGeom = new THREE.Geometry();
    for (i = 0, len = 2 * this.mesh.geometry.vertices.length; i < len; i++) {
        velLinesGeom.vertices.push(new THREE.Vector3());
        if (i % 2 === 0) {
            velLinesGeom.colors.push(new THREE.Color(0xffffff));
        } else {
            velLinesGeom.colors.push(new THREE.Color(0xff0000));
        }
    }
    var velLinesMaterial = new THREE.LineBasicMaterial({vertexColors: THREE.VertexColors});
    this.velLinesMesh = new THREE.Line(velLinesGeom, velLinesMaterial, THREE.LinePieces);
    this.scene.add(this.velLinesMesh);

    HeightFieldWater.prototype.init.call(this);
};
HeightFieldWaterWithVel.prototype.update = function () {

    HeightFieldWater.prototype.update.call(this);
    if (this.__visVelColors) {
        this.updateVelColors();
    }
    if (this.__visVelLines) {
        this.updateVelLines();
    }
};

//methods
/**
 * Visualize velocity colors
 * @param  {boolean} shouldVisualize Whether to visualize the colors
 */
HeightFieldWaterWithVel.prototype.visualizeVelColors = function (shouldVisualize) {
    this.__visVelColors = shouldVisualize;
    if (shouldVisualize) {
        this.mesh.material.emissive.set('#ffffff');
        this.mesh.material.vertexColors = THREE.VertexColors;
    } else {
        this.mesh.material.emissive.set(this.__origMeshMaterialSettings.emissive);
        this.mesh.material.vertexColors = this.__origMeshMaterialSettings.vertexColors;
    }
    this.mesh.geometry.buffersNeedUpdate = true;
    this.mesh.material.needsUpdate = true;
};
/**
 * Visualize velocity vector lines
 * @param  {boolean} shouldVisualize Whether to visualize the lines
 */
HeightFieldWaterWithVel.prototype.visualizeVelLines = function (shouldVisualize) {
    this.__visVelLines = shouldVisualize;
    this.velLinesMesh.visible = shouldVisualize;
};
HeightFieldWaterWithVel.prototype.updateVelColors = function () {

    var i, len, f, j, n, vertexIndex, velMag;
    for (i = 0, len = this.geometry.faces.length; i < len; i ++) {
        f  = this.geometry.faces[i];
        n = (f instanceof THREE.Face3) ? 3 : 4;
        for (j = 0; j < n; j++) {

            vertexIndex = f[this.__faceIndices[j]];

            //normalize vel magnitude and clamp
            velMag = this.vel[vertexIndex].length() / (this.maxVisVel - this.minVisVel) + this.minVisVel;
            velMag = THREE.Math.clamp(velMag, 0, 1);

            //linear interpolate between the base and water color using velMag
            f.vertexColors[j] = this.velColors[vertexIndex].set(this.waterColor).lerp(this.foamColor, velMag);
        }
    }
    this.geometry.colorsNeedUpdate = true;
};
HeightFieldWaterWithVel.prototype.updateVelLines = function () {

    //TODO: transform into another space

    var vertexPos = this.velLinesMesh.geometry.vertices;

    var start = new THREE.Vector3();
    var offset = new THREE.Vector3();

    var i, len, offsetLen;
    // var mat = this.mesh.matrixWorld;
    for (i = 0, len = this.mesh.geometry.vertices.length; i < len; i++) {

        start.copy(this.mesh.geometry.vertices[i]); //.clone().applyMatrix4(mat);

        offset.copy(this.vel[i]);
        // offset.transformDirection(mat);
        // offset.multiplyScalar(25);

        //clamp velocity visualize vector
        offsetLen = offset.length();
        if (offsetLen > this.maxVisVelLength) {
            offset.setLength(this.maxVisVelLength);
        } else if (offsetLen < this.minVisVelLength) {
            offset.setLength(0);
        }

        //update line vertex positions
        vertexPos[2 * i].copy(start);
        vertexPos[2 * i + 1].copy(start).add(offset);
    }

    this.velLinesMesh.geometry.verticesNeedUpdate = true;
};

/**
 * Height field water based on the hydrostatic pipe model
 * @constructor
 * @extends {HeightFieldWaterWithVel}
 */
function PipeModelWater(options) {

    //per-grid variables
    this.baseHeights = [];  //height of the base terrain layer
    this.heights = [];  //just the water height, not including the terrain
    this.extPressures = [];
    this.fluxR = [];
    this.fluxB = [];
    this.fluxL = [];
    this.fluxT = [];

    this.minWaterHeight = -0.05;  //have to be slightly below zero to prevent z-fighting flickering
    this.dHeights = [];

    //TODO: this should really be in the superclass
    this.terrainMesh = typeof options.terrainMesh === 'undefined' ? null: options.terrainMesh;

    HeightFieldWaterWithVel.call(this, options);

    //some constants
    this.gravity = 9.81;
    this.density = 1;
    this.atmosPressure = 0;  //assume one constant atmos pressure throughout
    this.pipeLength = this.segmentSize;
    this.pipeCrossSectionArea = this.pipeLength * this.pipeLength;  //square cross-section area

    //sources and sinks
    this.flowChangers = [];
}
//inherit
PipeModelWater.prototype = Object.create(HeightFieldWaterWithVel.prototype);
PipeModelWater.prototype.constructor = PipeModelWater;
//override
PipeModelWater.prototype.init = function () {

    var i, len;
    for (i = 0, len = this.numVertices; i < len; i++) {
        this.baseHeights[i] = 0;
        this.heights[i] = 0.1;
        this.extPressures[i] = 0;
        this.fluxR[i] = 0;
        this.fluxB[i] = 0;
        this.fluxL[i] = 0;
        this.fluxT[i] = 0;

        this.dHeights[i] = 0;
    }

    HeightFieldWaterWithVel.prototype.init.call(this);
};
PipeModelWater.prototype.reset = function () {

    var i, len;
    for (i = 0, len = this.numVertices; i < len; i++) {
        this.extPressures[i] = 0;
    }

    HeightFieldWaterWithVel.prototype.reset.call(this);
};
/**
 * Updates the simulation
 * @param  {number} dt Elapsed time
 */
PipeModelWater.prototype.update = function (dt) {

    //TODO: update only the changed base heights during sculpting
    //update baseHeights using terrainMesh data
    if (this.terrainMesh) {
        var vertexPos = this.terrainMesh.geometry.vertices;
        var i, len;
        for (i = 0, len = this.numVertices; i < len; i++) {
            this.baseHeights[i] = vertexPos[i].y;
        }
    }

    HeightFieldWaterWithVel.prototype.update.call(this, dt);
};
PipeModelWater.prototype.sim = function (dt) {

    var i, j, idx;
    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //fix dt
    var substeps = 5;  //TODO: maybe this should be dynamically set based on CFL
    dt = 1.0 / 60.0 / substeps;

    //add sources and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;

            //first of all, do not disturb things within obstacles,
            //so mask the source field with obstacle field
            this.disturbField[idx] *= this.obstacleField[idx];
            //then add source field to heights to disturb it
            this.heights[idx] += this.disturbField[idx];

            //next we can just add sources and sinks without masking
            this.heights[idx] += this.sourceField[idx];
        }
    }

    var x;
    for (x = 0; x < substeps; x++) {

        //find flux first
        var thisHeight, dHeight;
        var heightToFluxFactor = dt * this.pipeCrossSectionArea * this.gravity / this.pipeLength;
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {

                idx = i * this.res + j;

                //if water height is below min, it cannot have outwards flux at all
                if (this.heights[idx] <= this.minWaterHeight) {
                    this.fluxL[idx] = 0;
                    this.fluxR[idx] = 0;
                    this.fluxT[idx] = 0;
                    this.fluxB[idx] = 0;
                    continue;
                }

                thisHeight = this.baseHeights[idx] + this.heights[idx];

                //find out flux in +X direction
                dHeight = thisHeight - (this.baseHeights[idx + 1] + this.heights[idx + 1]);
                this.fluxR[idx] *= this.dampingFactor;
                this.fluxR[idx] += dHeight * heightToFluxFactor;
                if (this.fluxR[idx] < 0) {
                    this.fluxR[idx] = 0;
                }

                //find out flux in -X direction
                dHeight = thisHeight - (this.baseHeights[idx - 1] + this.heights[idx - 1]);
                this.fluxL[idx] *= this.dampingFactor;
                this.fluxL[idx] += dHeight * heightToFluxFactor;
                if (this.fluxL[idx] < 0) {
                    this.fluxL[idx] = 0;
                }

                //find out flux in +Z direction
                dHeight = thisHeight - (this.baseHeights[idx + this.res] + this.heights[idx + this.res]);
                this.fluxB[idx] *= this.dampingFactor;
                this.fluxB[idx] += dHeight * heightToFluxFactor;
                if (this.fluxB[idx] < 0) {
                    this.fluxB[idx] = 0;
                }

                //find out flux in -Z direction
                dHeight = thisHeight - (this.baseHeights[idx - this.res] + this.heights[idx - this.res]);
                this.fluxT[idx] *= this.dampingFactor;
                this.fluxT[idx] += dHeight * heightToFluxFactor;
                if (this.fluxT[idx] < 0) {
                    this.fluxT[idx] = 0;
                }
            }
        }
        //set flux to boundaries to zero
        //LEFT
        j = 0;
        for (i = 1; i < this.res; i++) {
            idx = i * this.res + j;
            this.fluxL[idx + 1] = 0;
        }
        //RIGHT
        j = this.res - 1;
        for (i = 1; i < this.res; i++) {
            idx = i * this.res + j;
            this.fluxR[idx - 1] = 0;
        }
        //TOP
        i = 0;
        for (j = 1; j < this.res; j++) {
            idx = i * this.res + j;
            this.fluxT[idx + this.res] = 0;
        }
        //BOTTOM
        i = this.res - 1;
        for (j = 1; j < this.res; j++) {
            idx = i * this.res + j;
            this.fluxB[idx - this.res] = 0;
        }

        //stop flow velocity if pipe flows to an obstacle
        if (this.obstaclesActive) {
            var obstacleIds = Object.keys(this.obstacles);
            var obstacle;
            var len = obstacleIds.length;
            for (i = 0; i < len; i++) {
                obstacle = this.obstacles[obstacleIds[i]];
                obstacle.updateFlux(this);
            }
        }

        //scale down outflow if it is more than available volume in the column
        var currVol, outVol, scaleAmt;
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {

                idx = i * this.res + j;

                currVol = (this.heights[idx] - this.minWaterHeight) * this.segmentSizeSquared;
                outVol = dt * (this.fluxR[idx] + this.fluxL[idx] + this.fluxB[idx] + this.fluxT[idx]);
                if (outVol > currVol) {
                    scaleAmt = currVol / outVol;
                    if (isFinite(scaleAmt)) {
                        this.fluxL[idx] *= scaleAmt;
                        this.fluxR[idx] *= scaleAmt;
                        this.fluxB[idx] *= scaleAmt;
                        this.fluxT[idx] *= scaleAmt;
                    }
                }
            }
        }

        //find new heights and velocity
        var fluxIn, fluxOut, dV, avgWaterHeight;
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {

                idx = i * this.res + j;

                fluxOut = this.fluxR[idx] + this.fluxL[idx] + this.fluxB[idx] + this.fluxT[idx];
                fluxIn = this.fluxR[idx - 1] + this.fluxL[idx + 1] + this.fluxB[idx - this.res] + this.fluxT[idx + this.res];
                dV = (fluxIn - fluxOut) * dt;

                this.dHeights[idx] = dV / (this.segmentSize * this.segmentSize);
                avgWaterHeight = this.heights[idx];
                this.heights[idx] += this.dHeights[idx];
                if (this.heights[idx] < this.minWaterHeight) {  //this will still happen, in very small amounts
                    this.heights[idx] = this.minWaterHeight;
                }
                avgWaterHeight = 0.5 * (avgWaterHeight + this.heights[idx]);

                //update velocities
                //horizontal velocity comes from amount of water passing through per unit time
                if (avgWaterHeight === 0) {  //prevent division by 0
                    this.vel[idx].x = 0;
                    this.vel[idx].z = 0;
                } else {
                    this.vel[idx].x = 0.5 * (this.fluxR[idx - 1] - this.fluxL[idx] + this.fluxR[idx] - this.fluxL[idx + 1]) / (this.segmentSize * avgWaterHeight);
                    this.vel[idx].z = 0.5 * (this.fluxB[idx - this.res] - this.fluxT[idx] + this.fluxB[idx] - this.fluxT[idx + this.res]) / (this.segmentSize * avgWaterHeight);
                }
                //vertical velocity to come from change in height
                this.vel[idx].y = this.dHeights[idx];
            }
        }
    }

    //update vertex heights
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            vertexPos[idx].y = this.baseHeights[idx] + this.heights[idx];
        }
    }
    this.__matchEdges();

    //update mesh
    this.__updateMesh();
};
PipeModelWater.prototype.__matchEdges = function () {

    var i, j, idx;
    var vertexPos = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //match the sides
    //LEFT
    j = 0;
    for (i = 1; i < resMinusOne; i++) {
        idx = i * this.res + j;
        vertexPos[idx].y = vertexPos[idx + 1].y;
    }
    //RIGHT
    j = this.res - 1;
    for (i = 1; i < resMinusOne; i++) {
        idx = i * this.res + j;
        vertexPos[idx].y = vertexPos[idx - 1].y;
    }
    //TOP
    i = 0;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        vertexPos[idx].y = vertexPos[idx + this.res].y;
    }
    //BOTTOM
    i = this.res - 1;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        vertexPos[idx].y = vertexPos[idx - this.res].y;
    }

    //match corners
    idx = 0;
    vertexPos[idx].y = 0.5 * (vertexPos[idx + 1].y + vertexPos[idx + this.res].y);
    idx = this.res - 1;
    vertexPos[idx].y = 0.5 * (vertexPos[idx - 1].y + vertexPos[idx + this.res].y);
    idx = this.res * (this.res - 1);
    vertexPos[idx].y = 0.5 * (vertexPos[idx + 1].y + vertexPos[idx - this.res].y);
    idx = this.res * this.res - 1;
    vertexPos[idx].y = 0.5 * (vertexPos[idx - 1].y + vertexPos[idx - this.res].y);
};